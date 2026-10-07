import { billingFee } from './billing.js';
import { hasPermission } from './permissions.js';
import { z } from 'zod';
import { parse, fail, hash, normalizePhone, allocate, matches, publicEvent, occupied, idSchema } from './domain.js';
const token=z.string().regex(/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/);
const requestKey=idSchema;
export function createEventApplications({db,col,clock,now,snapshot,clean,audit,roster,throttle,memberPortal}){
 // Serialize hot-event transactions within an instance; Firestore still guards cross-instance capacity.
 const eventQueues=new Map(),queueSizes=new Map();
 function serializeEvent(id,run){
  const size=queueSizes.get(id)||0;if(size>=200)fail('resource-exhausted','신청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  queueSizes.set(id,size+1);const task=(eventQueues.get(id)||Promise.resolve()).then(run);
  const tail=task.catch(()=>{});eventQueues.set(id,tail);
  return task.finally(()=>{queueSizes.set(id,queueSizes.get(id)-1);if(eventQueues.get(id)===tail){eventQueues.delete(id);queueSizes.delete(id);}});
 }
 async function verifyEvent(eventId,key,tx){
  const ref=col('events').doc(eventId),s=tx?await tx.get(ref):await ref.get(),e=snapshot(s);
  if(!e||!matches(key,e.linkHash)||e.status==='draft')fail('not-found','유효한 행사 링크를 확인해 주세요.');
  return e;
 }
 async function apply(data,ctx){
  const input=parse(z.object({eventId:idSchema,key:token.optional(),sessionKey:z.string().regex(/^[a-f0-9]{64}$/).optional(),name:z.string().trim().min(1).max(40).optional(),studentId:z.string().trim().min(1).max(30).optional(),phone:z.string().min(8).max(30).optional(),answers:z.array(z.string().trim().max(500)).max(3),consent:z.literal(true),requestId:requestKey,receiptKey:token}).strict().refine(value=>!!value.key!==!!value.sessionKey,{message:'행사 링크 또는 부원 인증 중 하나를 사용해 주세요.'}).superRefine((value,ctx)=>{if(value.key&&(!value.name||!value.studentId))ctx.addIssue({code:'custom',message:'이름과 학번을 모두 입력해 주세요.'});}),data);
  // Identity buckets preserve shared-campus-network access; shard the aggregate IP guard.
  if(input.sessionKey)await throttle(ctx,'apply-session-ip',200);
  const verifiedIdentity=input.sessionKey?await memberPortal.authenticate(input.sessionKey):null;
  const identityKey=hash((verifiedIdentity?.member.studentId||input.studentId).trim().toLowerCase());
  await throttle(ctx,'apply-ip:'+input.eventId+':'+(parseInt(identityKey.slice(0,4),16)%32),30);
  await throttle({...ctx,ip:identityKey},'apply-member:'+input.eventId,10);
  return serializeEvent(input.eventId,()=>db.runTransaction(async tx=>{
   const verified=input.sessionKey?await memberPortal.verifyEvent(input.eventId,input.sessionKey,tx):null;
   const event=verified?.event||await verifyEvent(input.eventId,input.key,tx);
   const members=verified?[verified.member]:(await roster.findStudent(input.studentId,event.semester,tx)).filter(m=>m.name===input.name);
   const member=members.length===1?members[0]:null;
   if(!member||(input.studentId!==undefined&&input.studentId!==member?.studentId)||(input.phone!==undefined&&normalizePhone(input.phone)!==normalizePhone(member.phone))||(input.name!==undefined&&member.name!==input.name)||member.anonymizedAt||member.removedAt||member.semester!==event.semester)fail('permission-denied','명부 정보 또는 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
   let priorId=null;
   if(event.hasSemesterChanges){
    const previous=await tx.get(col('applications').where('eventId','==',event.id));
    for(const d of previous.docs){const a=d.data();if(a.name!==member.name||a.semester===event.semester||a.deletedAt||a.anonymizedAt)continue;const original=await roster.get(a.memberId,a.semester,tx);if(original?.studentId===member.studentId){if(priorId&&priorId!==d.id)fail('failed-precondition','이전 신청 기록을 운영진에게 확인해 주세요.');priorId=d.id;}}
   }
   const id=priorId||hash(event.id+':'+member.id),ref=col('applications').doc(id),prior=await tx.get(ref),existing=prior.exists?{...prior.data(),id}:null;
   if(existing&&matches(input.receiptKey,existing.receiptHash)&&existing.requestId===input.requestId)return {id,status:existing.status};
   if(existing&&!['cancelled','expired'].includes(existing.status))fail('already-exists','이미 신청한 행사입니다. 신청할 때 받은 확인 링크를 이용해 주세요.');
   if(existing&&(existing.paidAmount||0)>(existing.refundAmount||0))fail('failed-precondition','이전 신청의 환불 처리를 먼저 확인해 주세요.');
   if(input.answers.length!==event.questions.length||input.answers.some(a=>!a))fail('invalid-argument','행사별 질문에 답변해 주세요.');
   const status=allocate(event,clock()),sequence=event.sequence+1;
   const record={id,eventId:event.id,eventTitle:event.title,memberId:member.id,memberIdentityHash:memberPortal.identityFingerprint(member),name:member.name,semester:event.semester,status,payment:status==='waiting'||event.fee===0?'none':'unpaid',fee:event.fee,paidAmount:0,refundAmount:0,attendance:'absent',answers:input.answers,receiptHash:hash(input.receiptKey),requestId:input.requestId,sequence,policy:event.policy,consentedAt:now(),createdAt:now(),updatedAt:now()};
   if(existing)tx.create(ref.collection('history').doc(),existing);
   tx.set(ref,record);
   tx.update(col('events').doc(event.id),{registered:event.registered+(status==='registered'?1:0),waiting:event.waiting+(status==='waiting'?1:0),sequence,updatedAt:now(),revision:event.revision+1});
   return {id,status};
  },{maxAttempts:8}));
 }
 const memberApplicationFields=['id','eventId','eventTitle','name','semester','status','payment','fee','paidAmount','refundAmount','attendance','answers','sequence','policy','offerExpiresAt','createdAt','updatedAt'];
 const memberApplicationView=(record,event)=>({application:Object.fromEntries(memberApplicationFields.filter(field=>record[field]!==undefined).map(field=>[field,record[field]])),event:publicEvent(event)});
 const memberSessionKey=z.string().regex(/^[a-f0-9]{64}$/);
 const memberApplicationActions=z.enum(['get','cancel','payment','accept','decline']).default('get');
 async function memberApplications(data,ctx){
  const input=parse(z.object({sessionKey:memberSessionKey}).strict(),data);
  await throttle(ctx,'member-applications',200);
  await throttle({ip:hash(input.sessionKey)},'member-applications-session',60);
  return db.runTransaction(async tx=>{
   const {member,expiresAt}=await memberPortal.authenticate(input.sessionKey,tx);
   const rows=await tx.get(col('applications').where('memberIdentityHash','==',memberPortal.identityFingerprint(member)).where('memberId','==',member.id).where('semester','==',member.semester).limit(501));
   const applications=[],events=new Map();
   for(const doc of rows.docs){
    const record={...doc.data(),id:doc.id};
    if(!memberPortal.ownsApplication(record,member))continue;
    if(!events.has(record.eventId))events.set(record.eventId,snapshot(await tx.get(col('events').doc(record.eventId))));
    const event=events.get(record.eventId);
    if(event&&event.semester===member.semester)applications.push(memberApplicationView(record,event));
   }
   applications.sort((a,b)=>(b.application.createdAt||'').localeCompare(a.application.createdAt||'')||a.application.id.localeCompare(b.application.id));
   return {applications:applications.slice(0,500),expiresAt,legacyAccessRequiresReceipt:true,...(rows.size>500?{truncated:true}:{})};
  },{readOnly:true});
 }
 async function memberApplication(data,ctx){
  const input=parse(z.object({sessionKey:memberSessionKey,id:idSchema,action:memberApplicationActions}).strict(),data);
  await throttle(ctx,'member-application:'+input.id,20);
  return db.runTransaction(async tx=>{
   const {member}=await memberPortal.authenticate(input.sessionKey,tx);
   const ref=col('applications').doc(input.id),record=snapshot(await tx.get(ref));
   if(!memberPortal.ownsApplication(record,member))fail('not-found','신청 내역을 확인해 주세요.');
   const event=snapshot(await tx.get(col('events').doc(record.eventId)));
   if(!event||event.semester!==member.semester)fail('not-found','행사를 찾을 수 없습니다.');
   const result=await applicationAction(tx,ref,record,event,input.action);
   return memberApplicationView(result.record,result.event);
  });
 }
 async function applicationAction(tx,ref,record,event,action){
   if(action==='get')return {record,event};
   if(action==='payment'){
    if(record.status!=='registered'||!['unpaid','requested'].includes(record.payment)||event.status==='cancelled')fail('failed-precondition','입금 확인을 요청할 수 없는 상태입니다.');
    const patch={payment:'requested',updatedAt:now()};
    tx.update(ref,patch);return {record:{...record,...patch},event};
   }
   if(action==='accept'){
    if(event.status==='cancelled'||record.status!=='offered'||Date.parse(record.offerExpiresAt)<=clock())fail('failed-precondition','유효한 승급 제안이 없습니다.');
    const member=await roster.get(record.memberId,record.semester,tx);
    if(!member||member.anonymizedAt||member.removedAt||member.semester!==record.semester)fail('permission-denied','현재 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
    const patch={status:'registered',payment:billingFee(record)?'unpaid':'none',updatedAt:now()};
    tx.update(ref,patch);return {record:{...record,...patch},event};
   }
   if(action==='cancel'||action==='decline'){
    if(record.status==='cancelled')return {record,event};
    if(!['registered','waiting','offered'].includes(record.status))fail('failed-precondition','취소할 수 없는 신청입니다.');
    if(action==='decline'&&record.status!=='offered')fail('failed-precondition','거절할 승급 제안이 없습니다.');
    if(action!=='decline'&&Date.parse(event.cancelUntil)<=clock()&&event.status!=='cancelled')fail('failed-precondition','취소 기한이 지났습니다. 운영진에게 문의해 주세요.');
    const patch={status:'cancelled',payment:record.paidAmount>record.refundAmount?'refund_pending':record.payment,updatedAt:now()};
    tx.update(ref,patch);
    const eventPatch={registered:Math.max(0,event.registered-(occupied(record.status)?1:0)),waiting:Math.max(0,event.waiting-(record.status==='waiting'?1:0)),revision:event.revision+1,updatedAt:now()};
    tx.update(col('events').doc(event.id),eventPatch);return {record:{...record,...patch},event:{...event,...eventPatch}};
   }
 }
 async function receipt(data,ctx){
  const input=parse(z.object({id:idSchema,key:token,action:z.enum(['get','cancel','payment','accept','decline']).default('get')}).strict(),data);
  await throttle(ctx,'receipt:'+input.id,20);
  return db.runTransaction(async tx=>{
   const ref=col('applications').doc(input.id),record=snapshot(await tx.get(ref));
   if(!record||!matches(input.key,record.receiptHash))fail('not-found','신청 확인 링크를 확인해 주세요.');
   const event=snapshot(await tx.get(col('events').doc(record.eventId)));
   if(!event)fail('not-found','행사를 찾을 수 없습니다.');
   const result=await applicationAction(tx,ref,record,event,input.action);
   return input.action==='get'?{application:clean(result.record),event:publicEvent(result.event)}:{saved:true};
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
    const member=await roster.get(a.memberId,a.semester,tx);
    if(!member||member.anonymizedAt||member.removedAt||member.semester!==a.semester)fail('failed-precondition','해당 부원의 활동 자격이 변경되었습니다. 신청을 취소한 뒤 다음 대기자를 확인해 주세요.');
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

 return {verifyEvent,apply,receipt,memberApplications,memberApplication,applicationCommand};
}
