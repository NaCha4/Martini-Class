import { billingFee } from './billing.js';
import { openChatUrl } from './public-links.js';
import { semesterSchema } from './roster.js';
import { hasPermission } from './permissions.js';
import { z } from 'zod';
import { inventoryCategoryId } from './inventory-board.js';
import { schemas, parse, fail, ensureScope, hash, secret, identity, normalizePhone, validateEvent, changeStock, stockTotal, requireRevision, idSchema } from './domain.js';
export function createRecords({db,col,clock,now,snapshot,visible,audit,roster,settings,inventoryBoard}){
 async function save(kind,schema,data,who,scope){
  ensureScope(who,scope,clock());const input=parse(schema,data),id=input.id||(kind==='settings'?'club':col(kind).doc().id),ref=kind==='members'?roster.collection(input.semester).doc(id):col(kind).doc(id);
  const link=kind==='events'&&!input.id?secret():null;
  const countRef=kind==='inventory'&&input.quantity!==undefined?col('stockMoves').doc():null;
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
    // Cached editors that omit visibility must not make a private event public.
    next.memberVisible=input.memberVisible??(old?.memberVisible!==false);
    for(const key of ['staffFee','staffFeeRevision'])if(old?.[key]!==undefined)next[key]=old[key];
    for(const key of ['accountNumber','bankName','accountHolder'])next[key]=input[key]??old?.[key]??'';
    validateEvent(input,old?.registered||0);
    if(old?.status==='cancelled'&&input.status!=='cancelled')fail('failed-precondition','취소된 행사는 다시 열 수 없습니다. 새 행사를 만들어 주세요.');
    const conf=snapshot(await tx.get(col('settings').doc('club')));
    if(input.status==='open'&&(!conf||(!conf.contact&&!openChatUrl(conf.joinUrl))))fail('failed-precondition','운영 설정에서 동아리 문의 채널 또는 가입 오픈채팅 링크를 먼저 입력해 주세요.');
    next.hasSemesterChanges=!!old?.hasSemesterChanges||!!(old?.sequence>0&&old.semester!==input.semester);
    next={...next,registered:old?.registered||0,waiting:old?.waiting||0,sequence:old?.sequence||0,linkHash:link?hash(link):old.linkHash};
    if(old&&old.status!=='cancelled'&&input.status==='cancelled'){
     const applications=await tx.get(col('applications').where('eventId','==',id));
     applications.docs.forEach(doc=>{const a=doc.data();if(['registered','waiting','offered'].includes(a.status))tx.update(doc.ref,{status:'cancelled',payment:a.paidAmount>a.refundAmount?'refund_pending':a.payment,cancelReason:'행사 취소',updatedAt:now()});});
     next.registered=0;next.waiting=0;
    }
   }
   if(kind==='inventory'){
    if(!old&&input.revision!==0)fail('aborted','품목 목록을 새로고침해 주세요.');
    const defaults={category:'supply',unit:'each',size:0,location:'',minimum:0,note:'',photo:''};
    for(const [key,value] of Object.entries(defaults))next[key]=input[key]??old?.[key]??value;
    next.categoryId=input.categoryId??(old?inventoryCategoryId(old):'');
    if(next.unit==='bottle'&&next.size<=0)fail('invalid-argument','병 규격은 0보다 커야 합니다.');
    if(old&&stockTotal(old)>0&&(old.unit!==next.unit||old.size!==next.size))fail('failed-precondition','재고가 있는 품목의 단위·규격은 변경할 수 없습니다. 다른 규격은 새 품목으로 등록해 주세요.');
    const category=await inventoryBoard.target(tx,next.categoryId);
    next={...next,quantity:old?.quantity??0,bottles:old?.bottles||{}};
    if(countRef){
     next=changeStock(next,{action:'count',amount:input.quantity});
     if(next.quantity!==(old?.quantity??0))tx.create(countRef,{id,requestId:countRef.id,revision:input.revision,action:'count',amount:next.quantity,reason:old?'품목 수정':'품목 등록',itemId:id,itemName:next.name,before:old?stockTotal(old):0,after:stockTotal(next),beforeQuantity:old?.quantity??0,afterQuantity:next.quantity,actor:who.displayName,createdAt:now(),updatedAt:now()});
    }
    inventoryBoard.touch(tx,category);
   }
   if(kind==='decisions'){
    // Keep category selection when older clients omit the new field.
    next.categoryId=input.categoryId??old?.categoryId??'';
    if(next.categoryId){
     const category=await tx.get(col('decisionCategories').doc(next.categoryId));
     if(!category.exists||category.data().deletedAt){
      if(next.categoryId!==old?.categoryId)fail('not-found','카테고리가 삭제되었습니다. 다른 카테고리를 선택해 주세요.');
      next.categoryId='';
     }
    }
    // Transitional support for an already-open older client; the new UI ignores eventId.
    next.eventId=input.eventId??old?.eventId??'';
    if(input.categoryId===undefined&&input.eventId&&next.eventId){
     const event=await tx.get(col('events').doc(next.eventId));
     if(!event.exists||event.data().deletedAt&&next.eventId!==old?.eventId)fail('not-found','연결할 행사를 찾을 수 없습니다.');
    }
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
  if(input.eventId&&input.kind!=='decisions'){
   const result=await query.limit(501).get();
   return {rows:result.docs.slice(0,500).filter(s=>!s.data().deletedAt).map(s=>visible(input.kind,{...s.data(),id:s.id},who)).sort((a,b)=>(a.sequence||0)-(b.sequence||0)),nextCursor:null,truncated:result.size>500};
  }
  // Equality-filtered histories paginate by document ID to avoid composite indexes.
  const byId=input.meetingId||input.itemId||input.kind==='decisions'&&input.eventId;
  query=query.orderBy(byId?'__name__':'updatedAt',byId?'asc':'desc').limit(101);
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
   const next={...changeStock(item,input),revision:item.revision+1,updatedAt:now(),updatedBy:who.uid};
   const move={...input,itemId:item.id,itemName:item.name,before:stockTotal(item),after:stockTotal(next),beforeQuantity:item.quantity,afterQuantity:next.quantity,actor:who.displayName,createdAt:now(),updatedAt:now()};
   tx.set(ref,next);tx.create(moveRef,move);audit(tx,who,'inventory',item.id,input.action);return visible('inventory',next,who);
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
    if(paidAmount>billingFee(application))fail('failed-precondition','청구액을 초과합니다. 과오납은 별도 메모로 확인 후 처리해 주세요.');
    tx.update(applicationRef,{paidAmount,payment:paidAmount===billingFee(application)?'paid':'unpaid',updatedAt:now()});
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

 return {save,read,stock,finance};
}
