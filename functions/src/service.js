import { createRoster, semesterSchema } from './roster.js';
import { defaultRoles, hasPermission } from './permissions.js';
import { openChatUrl } from './public-links.js';
import { z } from 'zod';
import { createPrivacy } from './privacy.js';
import { createDeletion } from './deletion.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { schemas, parse, fail, ensureScope, hash, secret, identity, normalizePhone, validateEvent, allocate, changeStock, stockTotal, matches, publicEvent, requireRevision, occupied, idSchema, roles } from './domain.js';
const PREFIX='martini_v2_';
const token=z.string().regex(/^[a-f0-9]{64}$/);
const requestKey=idSchema;
const iso=()=>new Date().toISOString();
export function createService(db,clock=Date.now){
 const col=name=>db.collection(PREFIX+name);
 const now=()=>new Date(clock()).toISOString();
 const roster=createRoster(col);
 const snapshot=snap=>snap.exists&&!snap.data().deletedAt?{...snap.data(),id:snap.id}:null;
 const clean=record=>{const {linkHash,receiptHash,identityHash,...safe}=record;return safe;};
 async function roleDefinition(id,tx){
  const builtin=defaultRoles.find(r=>r.id===id);
  if(id==='owner')return {...builtin,revision:0};
  const ref=col('roles').doc(id),doc=tx?await tx.get(ref):await ref.get();
  return doc.exists?(doc.data().deletedAt?null:{...doc.data(),id,system:!!builtin}):builtin?{...builtin,revision:0}:null;
 }
 async function admin(ctx){
  if(!ctx.uid)fail('unauthenticated','임원 계정으로 로그인해 주세요.');
  const profile=snapshot(await col('admins').doc(ctx.uid).get());
  if(!profile?.active||!profile.expiresAt||!Number.isFinite(Date.parse(profile.expiresAt))||Date.parse(profile.expiresAt)<=clock())fail('permission-denied','등록된 임원 계정이 아니거나 임기가 종료되었습니다.');
  const role=await roleDefinition(profile.role);if(!role)fail('permission-denied','배정된 역할을 확인해 주세요.');
  return {...profile,uid:ctx.uid,permissions:role.permissions,roleName:role.name};
 }
 function visible(kind,record,who){
  const result=clean(record);
  if(kind==='members'){delete result.duesPaid;delete result.status;}
  if(kind==='applications'&&!hasPermission(who,'finance'))for(const key of ['paidAmount','refundAmount','payment'])delete result[key];
  return result;
 }
 function audit(tx,who,kind,id,action,semester){tx.create(col('audit').doc(),{entityType:kind,entityId:id,action,actor:who.uid,actorName:who.displayName,at:now(),updatedAt:now(),...(semester?{semester}:{})});}
 const deleteRecord=createDeletion({db,col,clock,audit});
 // Serialize hot-event transactions within an instance; Firestore still guards cross-instance capacity.
 const eventQueues=new Map(),queueSizes=new Map();
 function serializeEvent(id,run){
  const size=queueSizes.get(id)||0;if(size>=200)fail('resource-exhausted','신청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  queueSizes.set(id,size+1);const task=(eventQueues.get(id)||Promise.resolve()).then(run);
  const tail=task.catch(()=>{});eventQueues.set(id,tail);
  return task.finally(()=>{queueSizes.set(id,queueSizes.get(id)-1);if(eventQueues.get(id)===tail){eventQueues.delete(id);queueSizes.delete(id);}});
 }
 const privacy=createPrivacy({db,col,now,clock,audit,roster});
 async function throttle(ctx,bucket,limit=30){
  const minute=Math.floor(clock()/60000),ref=col('rateLimits').doc(hash(ctx.ip+':'+bucket+':'+minute));
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const count=snap.data()?.count||0;if(count>=limit)fail('resource-exhausted','요청이 많습니다. 잠시 후 다시 시도해 주세요.');tx.set(ref,{count:count+1,expiresAt:Timestamp.fromMillis(clock()+3600000)});});
 }
 async function settings(){return (await col('settings').doc('club').get()).data()||null;}
 async function verifyEvent(eventId,key,tx){
  const ref=col('events').doc(eventId),s=tx?await tx.get(ref):await ref.get(),e=snapshot(s);
  if(!e||!matches(key,e.linkHash)||e.status==='draft')fail('not-found','유효한 행사 링크를 확인해 주세요.');
  return e;
 }
 async function save(kind,schema,data,who,scope){
  ensureScope(who,scope,clock());const input=parse(schema,data),id=input.id||(kind==='settings'?'club':col(kind).doc().id),ref=kind==='members'?roster.collection(input.semester).doc(id):col(kind).doc(id);
  const link=kind==='events'&&!input.id?secret():null;
  return db.runTransaction(async tx=>{
   const old=kind==='members'?await roster.get(id,input.semester,tx):snapshot(await tx.get(ref));if(input.id&&!old)fail('not-found','기록을 찾을 수 없습니다.');requireRevision(old,input.revision);
   if(kind==='settings'&&old===null&&input.revision!==0)fail('aborted','설정을 다시 불러와 주세요.');
   let next={...input,id,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),createdBy:old?.createdBy||who.uid,updatedAt:now(),updatedBy:who.uid};
   // Retain legacy settings during ordinary edits; these no longer set dues or retention policy.
   if(kind==='settings'&&old)for(const key of ['duesAmount','semesterEndsAt','privacy','bankInstructions'])if(!(key in next)&&key in old)next[key]=old[key];
   if(kind==='members'){
    if(!/^[0-9]{8,15}$/.test(normalizePhone(input.phone)))fail('invalid-argument','전화번호를 확인해 주세요.');
    const key=identity(input.studentId,input.phone);
    await tx.get(col('semesters').doc(input.semester));
    const duplicate=await roster.find(key,input.semester,tx);
    if(duplicate.some(d=>d.id!==id))fail('already-exists','이 학기에 같은 학번·연락처로 등록된 부원이 있습니다.');
    if(old?.removedAt)fail('failed-precondition','제거한 부원 목록에서 복구한 뒤 수정해 주세요.');
    if(old?.anonymizedAt)fail('failed-precondition','개인정보가 정리된 기록은 수정할 수 없습니다. 새 부원으로 등록해 주세요.');
    delete next.duesPaid;delete next.status;delete next.semester;
    next.identityHash=key;next.phone=normalizePhone(input.phone);next.note=input.note??old?.note??'';
    tx.set(col('semesters').doc(input.semester),{updatedAt:now()},{merge:true});
   }
   if(kind==='budgets'){if(old?.status==='executed')fail('failed-precondition','집행 완료한 계획은 수정할 수 없습니다.');next.status='planned';}
   if(kind==='events'){
    validateEvent(input,old?.registered||0);
    if(old?.status==='cancelled'&&input.status!=='cancelled')fail('failed-precondition','취소된 행사는 다시 열 수 없습니다. 새 행사를 만들어 주세요.');
    const conf=snapshot(await tx.get(col('settings').doc('club')));
    if(input.status==='open'&&(!conf||(!conf.contact&&!openChatUrl(conf.joinUrl))))fail('failed-precondition','운영 설정에서 동아리 문의 채널 또는 가입 오픈채팅 링크를 먼저 입력해 주세요.');
    if(old?.sequence>0&&(old.fee!==input.fee||old.semester!==input.semester))fail('failed-precondition','신청 이력이 있는 행사의 참가비·학기는 변경할 수 없습니다.');
    next={...next,registered:old?.registered||0,waiting:old?.waiting||0,sequence:old?.sequence||0,linkHash:link?hash(link):old.linkHash};
    if(old&&old.status!=='cancelled'&&input.status==='cancelled'){
     const applications=await tx.get(col('applications').where('eventId','==',id));
     applications.docs.forEach(doc=>{const a=doc.data();if(['registered','waiting','offered'].includes(a.status))tx.update(doc.ref,{status:'cancelled',payment:a.paidAmount>a.refundAmount?'refund_pending':a.payment,cancelReason:'행사 취소',updatedAt:now()});});
     next.registered=0;next.waiting=0;
    }
   }
   if(kind==='inventory'){
    if(input.unit==='bottle'&&input.size<=0)fail('invalid-argument','병 규격은 0보다 커야 합니다.');
    if(old&&stockTotal(old)>0&&(old.unit!==input.unit||old.size!==input.size))fail('failed-precondition','재고가 있는 품목의 단위·규격은 변경할 수 없습니다. 다른 규격은 새 품목으로 등록해 주세요.');
    next={...next,quantity:old?.quantity||0,bottles:old?.bottles||{}};
   }
   if(kind==='decisions'&&input.meetingId){
    const meeting=snapshot(await tx.get(col('meetings').doc(input.meetingId)));
    if(!meeting)fail('not-found','연결할 회의를 찾을 수 없습니다.');
    if(input.agendaId&&!meeting.agendas.some(a=>a.id===input.agendaId))fail('invalid-argument','연결할 안건을 확인해 주세요.');
   }
   if(kind==='meetings'&&old){
    const linked=await tx.get(col('decisions').where('meetingId','==',id));
    if(linked.docs.some(s=>!s.data().deletedAt&&s.data().agendaId&&!input.agendas.some(a=>a.id===s.data().agendaId)))fail('failed-precondition','결정에 연결된 안건은 먼저 연결을 변경한 뒤 제거해 주세요.');
   }
   if(kind==='meetings'&&old?.status==='final'&&!hasPermission(who,'settings'))fail('permission-denied','확정된 회의록은 회장단이 정정할 수 있습니다.');
   tx.set(ref,next);
   if(['meetings','decisions'].includes(kind))tx.create(ref.collection('revisions').doc(String(next.revision).padStart(6,'0')),{...next,revisionActor:who.displayName});
   audit(tx,who,kind,id,old?'수정':'작성',kind==='members'?input.semester:undefined);
   return {...visible(kind,kind==='members'?{...next,semester:input.semester}:next,who),...(link?{linkKey:link}:{})};
  });
 }
 async function read(data,who){
  const allowed=['budgets','members','events','applications','finance','inventory','stockMoves','meetings','decisions','content','settings','admins','audit'];
  const input=parse(z.object({kind:z.enum(allowed),semester:semesterSchema.optional(),removed:z.boolean().optional(),eventId:idSchema.optional(),meetingId:idSchema.optional(),itemId:idSchema.optional(),cursor:idSchema.optional(),parentId:idSchema.optional(),recordId:idSchema.optional(),revisions:z.boolean().optional()}).strict(),data);
  let scope=input.kind;
  if(scope==='applications'){if(!hasPermission(who,'participants'))fail('permission-denied','참가자 명단 조회 권한이 없습니다.');}
  else if(scope==='settings'){} // Basic operating context is available to signed-in staff.
  else if(scope==='events')ensureScope(who,'eventRead',clock());
  else if(scope==='members')ensureScope(who,'membersRead',clock());
  else if(scope==='budgets')ensureScope(who,'finance',clock());
  else if(scope==='stockMoves')ensureScope(who,'inventory',clock());
  else ensureScope(who,scope,clock());
  if(input.kind==='members'){
   if(input.eventId||input.meetingId||input.itemId||input.revisions||input.parentId)fail('invalid-argument','명부는 학기를 선택해 조회해 주세요.');
   const semester=parse(semesterSchema,input.semester||(await settings())?.semester);
   if(input.recordId){const record=await roster.get(input.recordId,semester);if(!record||!!record.removedAt!==!!input.removed)fail('not-found','이 학기의 부원 기록을 찾을 수 없습니다.');return {rows:[visible('members',record,who)],nextCursor:null,semester};}
   const docs=(await roster.documents(semester)).filter(d=>!!d.data().removedAt===!!input.removed).sort((a,b)=>a.id.localeCompare(b.id)),offset=input.cursor?docs.findIndex(d=>d.id===input.cursor)+1:0;
   const page=docs.slice(offset,offset+100);
   return {rows:page.map(d=>{const {note,...row}=visible('members',roster.value(d,semester),who);return row;}),nextCursor:offset+100<docs.length?page.at(-1).id:null,semester};
  }
  if(input.revisions&&!['meetings','decisions'].includes(input.kind))fail('invalid-argument','수정 이력을 조회할 수 없는 항목입니다.');
  if(input.recordId){const record=snapshot(await col(input.kind).doc(input.recordId).get());if(!record)fail('not-found','기록을 찾을 수 없습니다.');return {rows:[visible(input.kind,record,who)],nextCursor:null};}
  let query=col(input.kind);
  if(input.revisions){if(!input.parentId)fail('invalid-argument','대상 기록을 선택해 주세요.');query=query.doc(input.parentId).collection('revisions');}
  if(input.meetingId&&input.kind!=='decisions'||input.itemId&&input.kind!=='stockMoves')fail('invalid-argument','연결 조회 대상을 확인해 주세요.');
  if(input.meetingId)query=query.where('meetingId','==',input.meetingId);
  if(input.itemId)query=query.where('itemId','==',input.itemId);
  if(input.eventId)query=query.where('eventId','==',input.eventId);
  // Query by one equality without a compound index; sort bounded event result locally.
  if(input.eventId){
   const result=await query.limit(501).get();
   return {rows:result.docs.slice(0,500).filter(s=>!s.data().deletedAt).map(s=>visible(input.kind,{...s.data(),id:s.id},who)).sort((a,b)=>(a.sequence||0)-(b.sequence||0)),nextCursor:null,truncated:result.size>500};
  }
  // Equality-filtered histories paginate by document ID to avoid composite indexes.
  query=query.orderBy(input.meetingId||input.itemId?'__name__':'updatedAt',input.meetingId||input.itemId?'asc':'desc').limit(101);
  if(input.cursor){const cursor=await (input.revisions?col(input.kind).doc(input.parentId).collection('revisions'):col(input.kind)).doc(input.cursor).get();if(cursor.exists)query=query.startAfter(cursor);}
  const result=await query.get(),docs=result.docs.slice(0,100);
  return {rows:docs.filter(s=>!s.data().deletedAt).map(s=>visible(input.kind,{...s.data(),id:s.id},who)),nextCursor:result.size>100?docs.at(-1).id:null};
 }
 async function stock(data,who){
  ensureScope(who,'inventory',clock());const input=parse(schemas.stock,data),ref=col('inventory').doc(input.id),moveRef=col('stockMoves').doc(input.requestId);
  return db.runTransaction(async tx=>{
   const [s,previous]=await tx.getAll(ref,moveRef);
   if(previous.exists)return previous.data();
   const item=snapshot(s);if(!item)fail('not-found','재고 품목을 찾을 수 없습니다.');requireRevision(item,input.revision);
   if(input.eventId){const event=await tx.get(col('events').doc(input.eventId));if(!snapshot(event))fail('not-found','연결할 행사를 찾을 수 없습니다.');}
   const next={...changeStock(item,input),revision:item.revision+1,updatedAt:now(),updatedBy:who.uid};
   const move={...input,itemId:item.id,itemName:item.name,before:stockTotal(item),after:stockTotal(next),beforeQuantity:item.quantity,afterQuantity:next.quantity,actor:who.displayName,createdAt:now(),updatedAt:now()};
   tx.set(ref,next);tx.create(moveRef,move);audit(tx,who,'inventory',item.id,input.action);return next;
  });
 }
 async function finance(data,who){
  ensureScope(who,'finance',clock());const input=parse(schemas.transaction,data),ref=col('finance').doc(input.requestId);
  return db.runTransaction(async tx=>{
   if((await tx.get(ref)).exists)return {saved:true,duplicate:true};
   let application=null,member=null,applicationRef=null,memberRef=null,eventRecord=null,termRecord=null;
   if(input.applicationId){applicationRef=col('applications').doc(input.applicationId);application=snapshot(await tx.get(applicationRef));if(!application)fail('not-found','신청을 찾을 수 없습니다.');if(input.eventId!==application.eventId)fail('invalid-argument','행사 연결이 일치하지 않습니다.');}
   if(input.memberId){member=await roster.get(input.memberId,input.semester,tx);memberRef=roster.collection(input.semester).doc(input.memberId);if(!member)fail('not-found','부원을 찾을 수 없습니다.');}
   if(input.eventId){eventRecord=snapshot(await tx.get(col('events').doc(input.eventId)));if(!eventRecord)fail('not-found','행사를 찾을 수 없습니다.');}
   if(input.kind==='dues'&&member){
    termRecord=(await tx.get(col('semesters').doc(input.semester).collection('dues').doc(input.memberId))).data();
    if(!termRecord)termRecord=(await tx.get(col('members').doc(input.memberId).collection('semesters').doc(input.semester))).data();
   }
   if(input.kind==='refund'){
    if(!application)fail('invalid-argument','환불은 기존 신청의 납부 기록에 연결해 주세요.');
    if((application.refundAmount||0)+input.amount>(application.paidAmount||0))fail('failed-precondition','납부한 금액보다 많이 환불할 수 없습니다.');
    const refundAmount=(application.refundAmount||0)+input.amount;
    tx.update(applicationRef,{refundAmount,payment:refundAmount===application.paidAmount?'refunded':'partial',updatedAt:now()});
   }
   if(input.kind==='income'&&application){
    if(eventRecord.status==='cancelled'||!['registered'].includes(application.status))fail('failed-precondition','참가 등록 상태의 신청만 납부 확인할 수 있습니다.');
    const paidAmount=(application.paidAmount||0)+input.amount;
    if(paidAmount>application.fee)fail('failed-precondition','청구액을 초과합니다. 과오납은 별도 메모로 확인 후 처리해 주세요.');
    tx.update(applicationRef,{paidAmount,payment:paidAmount===application.fee?'paid':'unpaid',updatedAt:now()});
   }
   if(input.kind==='dues'){
    if(!member||member.semester!==input.semester)fail('invalid-argument','해당 학기에 등록된 부원을 선택해 주세요.');
    if(termRecord?.duesTransactionId)fail('already-exists','이 부원의 학기 회비 거래가 이미 기록되었습니다.');

    tx.set(col('semesters').doc(input.semester).collection('dues').doc(input.memberId),{duesTransactionId:input.requestId,updatedAt:now()},{merge:true});
   }
   const record={...input,id:input.requestId,...(application?{applicationRequestId:application.requestId}:{}),actor:who.displayName,createdAt:now(),updatedAt:now()};
   tx.create(ref,record);audit(tx,who,'finance',input.requestId,input.kind);return record;
  });
 }
 async function apply(data,ctx){
  const input=parse(z.object({eventId:idSchema,key:token,name:z.string().trim().min(1).max(40),studentId:z.string().trim().min(1).max(30),phone:z.string().min(8).max(30).optional(),answers:z.array(z.string().trim().max(500)).max(3),consent:z.literal(true),requestId:requestKey,receiptKey:token}).strict(),data);
  // Identity buckets preserve shared-campus-network access; shard the aggregate IP guard.
  const identityKey=hash(input.studentId.trim().toLowerCase());
  await throttle(ctx,'apply-ip:'+input.eventId+':'+(parseInt(identityKey.slice(0,4),16)%32),30);
  await throttle({...ctx,ip:identityKey},'apply-member:'+input.eventId,10);
  return serializeEvent(input.eventId,()=>db.runTransaction(async tx=>{
   const event=await verifyEvent(input.eventId,input.key,tx);
   const members=(await roster.findStudent(input.studentId,event.semester,tx)).filter(m=>m.name===input.name);
   const member=members.length===1?members[0]:null;
   if(!member||(input.phone!==undefined&&normalizePhone(input.phone)!==normalizePhone(member.phone))||member.name!==input.name||member.anonymizedAt||member.removedAt||member.semester!==event.semester)fail('permission-denied','명부 정보 또는 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
   const id=hash(event.id+':'+member.id),ref=col('applications').doc(id),prior=await tx.get(ref),existing=prior.exists?{...prior.data(),id}:null;
   if(existing&&matches(input.receiptKey,existing.receiptHash)&&existing.requestId===input.requestId)return {id,status:existing.status};
   if(existing&&!['cancelled','expired'].includes(existing.status))fail('already-exists','이미 신청한 행사입니다. 신청할 때 받은 확인 링크를 이용해 주세요.');
   if(existing&&(existing.paidAmount||0)>(existing.refundAmount||0))fail('failed-precondition','이전 신청의 환불 처리를 먼저 확인해 주세요.');
   if(input.answers.length!==event.questions.length||input.answers.some(a=>!a))fail('invalid-argument','행사별 질문에 답변해 주세요.');
   const status=allocate(event,clock()),sequence=event.sequence+1;
   const record={id,eventId:event.id,eventTitle:event.title,memberId:member.id,name:member.name,semester:event.semester,status,payment:status==='waiting'||event.fee===0?'none':'unpaid',fee:event.fee,paidAmount:0,refundAmount:0,attendance:'unchecked',answers:input.answers,receiptHash:hash(input.receiptKey),requestId:input.requestId,sequence,policy:event.policy,consentedAt:now(),createdAt:now(),updatedAt:now()};
   if(existing)tx.create(ref.collection('history').doc(),existing);
   tx.set(ref,record);
   tx.update(col('events').doc(event.id),{registered:event.registered+(status==='registered'?1:0),waiting:event.waiting+(status==='waiting'?1:0),sequence,updatedAt:now(),revision:event.revision+1});
   return {id,status};
  },{maxAttempts:8}));
 }
 async function receipt(data,ctx){
  const input=parse(z.object({id:idSchema,key:token,action:z.enum(['get','cancel','payment','accept','decline']).default('get')}).strict(),data);
  await throttle(ctx,'receipt:'+input.id,20);
  return db.runTransaction(async tx=>{
   const ref=col('applications').doc(input.id),record=snapshot(await tx.get(ref));
   if(!record||!matches(input.key,record.receiptHash))fail('not-found','신청 확인 링크를 확인해 주세요.');
   const event=snapshot(await tx.get(col('events').doc(record.eventId)));
   if(!event)fail('not-found','행사를 찾을 수 없습니다.');
   if(input.action==='get')return {application:clean(record),event:publicEvent(event)};
   if(input.action==='payment'){
    if(record.status!=='registered'||!['unpaid','requested'].includes(record.payment)||event.status==='cancelled')fail('failed-precondition','입금 확인을 요청할 수 없는 상태입니다.');
    tx.update(ref,{payment:'requested',updatedAt:now()});return {saved:true};
   }
   if(input.action==='accept'){
    if(event.status==='cancelled'||record.status!=='offered'||Date.parse(record.offerExpiresAt)<=clock())fail('failed-precondition','유효한 승급 제안이 없습니다.');
    const member=await roster.get(record.memberId,event.semester,tx);
    if(!member||member.anonymizedAt||member.removedAt||member.semester!==event.semester)fail('permission-denied','현재 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
    tx.update(ref,{status:'registered',payment:event.fee?'unpaid':'none',updatedAt:now()});return {saved:true};
   }
   if(input.action==='cancel'||input.action==='decline'){
    if(record.status==='cancelled')return {saved:true};
    if(!['registered','waiting','offered'].includes(record.status))fail('failed-precondition','취소할 수 없는 신청입니다.');
    if(input.action==='decline'&&record.status!=='offered')fail('failed-precondition','거절할 승급 제안이 없습니다.');
    if(input.action!=='decline'&&Date.parse(event.cancelUntil)<=clock()&&event.status!=='cancelled')fail('failed-precondition','취소 기한이 지났습니다. 운영진에게 문의해 주세요.');
    tx.update(ref,{status:'cancelled',payment:record.paidAmount>record.refundAmount?'refund_pending':record.payment,updatedAt:now()});
    tx.update(col('events').doc(event.id),{registered:Math.max(0,event.registered-(occupied(record.status)?1:0)),waiting:Math.max(0,event.waiting-(record.status==='waiting'?1:0)),revision:event.revision+1,updatedAt:now()});return {saved:true};
   }
  });
 }
 async function applicationCommand(data,who){
  if(!hasPermission(who,'events'))fail('permission-denied','행사 운영 권한이 없습니다.');
  const input=parse(z.object({id:idSchema,action:z.enum(['attendance','offer','expire','cancel']),attendance:z.enum(['present','absent','unchecked']).optional(),offerExpiresAt:z.string().datetime().optional(),reason:z.string().trim().min(1).max(500)}).strict(),data);
  return db.runTransaction(async tx=>{
   const ref=col('applications').doc(input.id),a=snapshot(await tx.get(ref));if(!a)fail('not-found','신청을 찾을 수 없습니다.');
   const eRef=col('events').doc(a.eventId),e=snapshot(await tx.get(eRef));if(!e)fail('not-found','행사를 찾을 수 없습니다.');
   if(input.action==='attendance'){
    if(e.status==='cancelled'||a.status!=='registered'||!input.attendance)fail('failed-precondition','참가 등록된 신청만 출석을 처리할 수 있습니다.');
    tx.update(ref,{attendance:input.attendance,updatedAt:now()});
   }else if(input.action==='offer'){
    const member=await roster.get(a.memberId,e.semester,tx);
    if(!member||member.anonymizedAt||member.removedAt||member.semester!==e.semester)fail('failed-precondition','해당 부원의 활동 자격이 변경되었습니다. 신청을 취소한 뒤 다음 대기자를 확인해 주세요.');
    const queue=await tx.get(col('applications').where('eventId','==',e.id));
    const first=queue.docs.map(snapshot).filter(x=>x?.status==='waiting').sort((a,b)=>a.sequence-b.sequence)[0];
    if(e.status==='cancelled'||a.status!=='waiting'||first?.id!==a.id||e.registered>=e.capacity)fail('failed-precondition','빈자리와 대기 순서를 확인해 주세요.');
    if(!input.offerExpiresAt||Date.parse(input.offerExpiresAt)<=clock()||Date.parse(input.offerExpiresAt)>Date.parse(e.startsAt))fail('invalid-argument','응답 기한은 현재 이후, 행사 시작 이전으로 정해 주세요.');
    tx.update(ref,{status:'offered',offerExpiresAt:input.offerExpiresAt,updatedAt:now()});
    tx.update(eRef,{registered:e.registered+1,waiting:e.waiting-1,revision:e.revision+1,updatedAt:now()});
   }else{
    if(input.action==='expire'&&(a.status!=='offered'||Date.parse(a.offerExpiresAt)>clock()))fail('failed-precondition','응답 기한이 지난 좌석 예약만 해제할 수 있습니다.');
    if(!['registered','offered','waiting'].includes(a.status))fail('failed-precondition','처리 가능한 신청 상태가 아닙니다.');
    tx.update(ref,{status:input.action==='expire'?'expired':'cancelled',payment:a.paidAmount>a.refundAmount?'refund_pending':a.payment,updatedAt:now()});
    tx.update(eRef,{registered:Math.max(0,e.registered-(occupied(a.status)?1:0)),waiting:Math.max(0,e.waiting-(a.status==='waiting'?1:0)),revision:e.revision+1,updatedAt:now()});
   }
   audit(tx,who,'applications',a.id,input.action+': '+input.reason);return {saved:true};
  });
 }
 async function handle(payload,ctx={}){
  if(!payload||typeof payload.op!=='string')fail('invalid-argument','요청을 확인해 주세요.');
  const {op,...data}=payload;
  if(op==='publicRead'){
   await throttle(ctx,'public:'+parseInt(secret().slice(0,2),16)%16,100);
   const [config,content]=await Promise.all([settings(),col('content').where('published','==',true).limit(50).get()]);
   return {settings:config?{intro:config.intro,contact:config.contact,joinUrl:config.joinUrl,privacy:config.privacy,location:config.location,semester:config.semester}:null,content:content.docs.map(s=>clean({...s.data(),id:s.id})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
  }
  if(op==='eventAccess'){const input=parse(z.object({eventId:idSchema,key:token}).strict(),data);await throttle(ctx,'event:'+input.eventId+':'+(parseInt(secret().slice(0,4),16)%16),100);return publicEvent(await verifyEvent(input.eventId,input.key));}
  if(op==='apply')return apply(data,ctx);
  if(op==='receipt')return receipt(data,ctx);
  const who=await admin(ctx);
  if(op==='profile')return {uid:who.uid,displayName:who.displayName,role:who.role,roleName:who.roleName,permissions:who.permissions,expiresAt:who.expiresAt};

  if(op==='listRoles'){
   ensureScope(who,'admins',clock());
   const stored=await col('roles').get(),assigned=await col('admins').get();
   const map=new Map(defaultRoles.map(r=>[r.id,{...r,revision:0}]));
   stored.docs.forEach(doc=>{if(doc.id==='owner')return;if(doc.data().deletedAt)map.delete(doc.id);else map.set(doc.id,{...doc.data(),id:doc.id,system:defaultRoles.some(r=>r.id===doc.id)});});
   return {rows:[...map.values()].map(r=>({...r,assigned:assigned.docs.filter(a=>a.data().role===r.id).length}))};
  }
  if(op==='saveRole'){
   ensureScope(who,'admins',clock());const input=parse(schemas.role,data),id=input.id||col('roles').doc().id;
   if(id==='owner')fail('failed-precondition','회장의 필수 관리 권한은 변경할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const old=await roleDefinition(id,tx);if(input.id&&!old)fail('not-found','역할을 찾을 수 없습니다.');
    requireRevision(old,input.revision);
    const all=await tx.get(col('roles')),names=new Map(defaultRoles.map(r=>[r.id,r.name]));all.docs.forEach(doc=>{if(doc.data().deletedAt)names.delete(doc.id);else names.set(doc.id,doc.data().name);});
    if([...names].some(([key,name])=>key!==id&&name===input.name))fail('already-exists','같은 이름의 역할이 있습니다. 다른 이름을 입력해 주세요.');
    const next={id,name:input.name,permissions:[...new Set(input.permissions)],revision:(old?.revision||0)+1,updatedAt:now()};
    tx.set(col('roles').doc(id),next);audit(tx,who,'roles',id,'역할 권한 설정');return next;
   });
  }
  if(op==='deleteRole'){
   ensureScope(who,'admins',clock());const input=parse(z.object({id:idSchema,revision:z.number().int().min(0)}).strict(),data);
   if(input.id==='owner')fail('failed-precondition','회장 역할은 삭제할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const role=await roleDefinition(input.id,tx),assigned=await tx.get(col('admins').where('role','==',input.id));
    if(!role)fail('not-found','역할을 찾을 수 없습니다.');requireRevision(role,input.revision);
    if(!assigned.empty)fail('failed-precondition','이 역할을 배정받은 임원의 역할을 먼저 변경해 주세요.');
    if(defaultRoles.some(r=>r.id===input.id))tx.set(col('roles').doc(input.id),{id:input.id,deletedAt:now(),updatedAt:now(),revision:(role.revision||0)+1});else tx.delete(col('roles').doc(input.id));audit(tx,who,'roles',input.id,'역할 삭제');return {saved:true};
   });
  }

  if(op==='removeMember'||op==='restoreMember'){
   ensureScope(who,'members',clock());
   const input=parse(z.object({id:idSchema,semester:semesterSchema,revision:z.number().int().min(1)}).strict(),data),remove=op==='removeMember';
   return db.runTransaction(async tx=>{
    const nested=await tx.get(roster.collection(input.semester).doc(input.id));
    const doc=nested.exists?nested:await tx.get(col('members').doc(input.id));
    if(!doc.exists||(!nested.exists&&doc.data().semester!==input.semester))fail('not-found','이 학기의 부원을 찾을 수 없습니다.');
    const old=doc.data();
    if(!!old.removedAt===remove)return {saved:true,duplicate:true};
    requireRevision(old,input.revision);
    if(!remove&&old.anonymizedAt)fail('failed-precondition','개인정보가 정리된 부원은 복구할 수 없습니다.');
    await tx.get(col('semesters').doc(input.semester));
    tx.update(doc.ref,{removedAt:remove?now():FieldValue.delete(),removedBy:remove?who.uid:FieldValue.delete(),revision:old.revision+1,updatedAt:now(),updatedBy:who.uid});
    tx.set(col('semesters').doc(input.semester),{updatedAt:now()},{merge:true});
    audit(tx,who,'members',input.id,remove?'학기 명부에서 제거':'학기 명부에 복구',input.semester);
    return {saved:true};
   });
  }
  if(op==='rosterTerms'){ensureScope(who,'membersRead',clock());const current=(await settings())?.semester;return {rows:[...new Set([...(await roster.terms()),...(semesterSchema.safeParse(current).success?[current]:[])])].sort().reverse()};}
  if(op==='read')return read(data,who);
  if(op==='deleteRecord')return deleteRecord(data,who);
  if(op==='privacyCandidates')return privacy.candidates(data,who);
  if(op==='privacyReview')return privacy.review(data,who);
  if(op==='privacyAnonymize')return privacy.anonymize(data,who);
  const saves={
   saveMember:['members',schemas.member,'members'],saveEvent:['events',schemas.event,'events'],saveItem:['inventory',schemas.item,'inventory'],
   saveMeeting:['meetings',schemas.meeting,'meetings'],saveDecision:['decisions',schemas.decision,'decisions'],saveContent:['content',schemas.content,'content'],
   saveBudget:['budgets',schemas.budget,'finance'],saveSettings:['settings',schemas.settings,'settings']
  };
  if(saves[op]){const [kind,schema,scope]=saves[op];return save(kind,schema,data,who,scope);}
  if(op==='deleteBudget'||op==='executeBudget'){
   ensureScope(who,'finance',clock());
   const schema=op==='executeBudget'?z.object({id:idSchema,revision:z.number().int().min(1),amount:z.number().int().min(1).max(100000000),confirmed:z.literal(true)}).strict():z.object({id:idSchema,revision:z.number().int().min(1)}).strict();
   const input=parse(schema,data),ref=col('budgets').doc(input.id);
   return db.runTransaction(async tx=>{
    const doc=await tx.get(ref),plan=snapshot(doc);if(!plan)fail('not-found','지출 계획을 찾을 수 없습니다.');
    if(plan.status==='executed'){if(op==='executeBudget')return {saved:true,duplicate:true};fail('failed-precondition','집행 완료한 계획은 삭제할 수 없습니다.');}
    requireRevision(plan,input.revision);
    if(op==='deleteBudget'){tx.delete(ref);audit(tx,who,'budgets',input.id,'지출 계획 삭제',plan.semester);return {saved:true};}
    const entry=col('finance').doc(),at=now();
    tx.create(entry,{id:entry.id,requestId:entry.id,kind:'expense',amount:input.amount,title:plan.title,note:plan.note||'',semester:plan.semester,eventId:'',applicationId:'',memberId:'',budgetId:input.id,actor:who.displayName,createdAt:at,updatedAt:at});
    tx.update(ref,{status:'executed',actualAmount:input.amount,transactionId:entry.id,revision:plan.revision+1,updatedAt:at,updatedBy:who.uid});
    audit(tx,who,'budgets',input.id,'지출 계획 집행 완료',plan.semester);audit(tx,who,'finance',entry.id,'계획 지출 기록',plan.semester);return {saved:true};
   });
  }
  if(op==='stock')return stock(data,who);
  if(op==='finance')return finance(data,who);
  if(op==='applicationCommand')return applicationCommand(data,who);
  if(op==='rotateEventLink'){
   ensureScope(who,'events',clock());const input=parse(z.object({id:idSchema,revision:z.number().int()}).strict(),data),key=secret(),ref=col('events').doc(input.id);
   await db.runTransaction(async tx=>{const old=snapshot(await tx.get(ref));if(!old)fail('not-found','행사를 찾을 수 없습니다.');requireRevision(old,input.revision);tx.update(ref,{linkHash:hash(key),revision:old.revision+1,updatedAt:now()});audit(tx,who,'events',input.id,'신청 링크 재발급');});return {linkKey:key};
  }
  if(op==='participantContact'){
   if(!hasPermission(who,'participants'))fail('permission-denied','행사 참가자 연락처 조회 권한이 없습니다.');
   const input=parse(z.object({id:idSchema}).strict(),data),a=snapshot(await col('applications').doc(input.id).get());
   if(!a)fail('not-found','신청을 찾을 수 없습니다.');
   if(a.anonymizedAt)return {name:'정보 정리 완료',phone:'',studentId:'',department:''};
   const m=await roster.get(a.memberId,a.semester);
   return {name:a.name,phone:m?.phone||'',studentId:m?.studentId||'',department:m?.department||''};
  }
  if(op==='rotateReceipt'){
   ensureScope(who,'events',clock());const input=parse(z.object({id:idSchema,reason:z.string().trim().min(1).max(200)}).strict(),data),key=secret(),ref=col('applications').doc(input.id);
   await db.runTransaction(async tx=>{const record=await tx.get(ref);if(!snapshot(record))fail('not-found','신청을 찾을 수 없습니다.');if(record.data().anonymizedAt)fail('failed-precondition','정보가 정리된 신청에는 확인 링크를 발급할 수 없습니다.');tx.update(ref,{receiptHash:hash(key),updatedAt:now()});audit(tx,who,'applications',input.id,'확인 링크 재발급: '+input.reason);});return {key};
  }
  if(op==='deleteAdmin'){
   ensureScope(who,'admins',clock());const input=parse(z.object({uid:idSchema,updatedAt:z.string().datetime()}).strict(),data);
   if(input.uid===who.uid)fail('failed-precondition','본인 계정은 임원 목록에서 삭제할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const assigned=await tx.get(col('admins')),target=assigned.docs.find(d=>d.id===input.uid),actor=assigned.docs.find(d=>d.id===who.uid)?.data();
    if(!actor?.active||actor.role!=='owner'||Date.parse(actor.expiresAt)<=clock()||!Number.isFinite(Date.parse(actor.expiresAt)))fail('permission-denied','현재 회장 권한을 확인해 주세요.');
    if(!target)fail('not-found','임원을 찾을 수 없습니다.');
    if(target.data().updatedAt!==input.updatedAt)fail('aborted','임원 정보가 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.');
    const otherOwners=assigned.docs.filter(d=>d.id!==input.uid&&d.data().role==='owner'&&d.data().active&&Date.parse(d.data().expiresAt)>clock());
    if(target.data().role==='owner'&&!otherOwners.length)fail('failed-precondition','마지막 회장 계정은 삭제할 수 없습니다.');
    tx.delete(target.ref);audit(tx,who,'admins',input.uid,'임원 삭제 · 관리자 접근 해제');return {saved:true};
   });
  }
  if(op==='saveAdmin'){

   ensureScope(who,'admins',clock());const input=parse(schemas.admin,data);
   if(input.uid===who.uid&&(!input.active||input.role!=='owner'||Date.parse(input.expiresAt)<=clock()))fail('failed-precondition','본인의 최종 운영 권한을 제거할 수 없습니다.');
   const ref=col('admins').doc(input.uid);
   await db.runTransaction(async tx=>{await tx.get(ref);const role=await roleDefinition(input.role,tx);if(!role)fail('invalid-argument','존재하는 역할을 선택해 주세요.');tx.set(ref,{...input,updatedAt:now(),updatedBy:who.uid});audit(tx,who,'admins',input.uid,'임원 권한 설정');});return {saved:true};
  }
  if(op==='recordExport'){
   const input=parse(z.object({kind:z.enum(['members','applications','finance','inventory','meetings','decisions']),reason:z.string().min(1).max(200)}).strict(),data);
   if(input.kind==='applications'){if(!hasPermission(who,'participants'))fail('permission-denied','내보내기 권한이 없습니다.');}else ensureScope(who,input.kind,clock());
   await col('audit').add({entityType:input.kind,entityId:'export',action:'자료 내보내기: '+input.reason,actor:who.uid,actorName:who.displayName,updatedAt:now(),at:now()});return {saved:true};
  }
  fail('not-found','지원하지 않는 요청입니다.');
 }
 return {handle};
}
