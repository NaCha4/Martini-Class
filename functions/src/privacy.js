import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureScope,parse,fail,hash,idSchema } from './domain.js';
const semesterSchema=z.string().regex(/^20\d{2}-[12]$/);
export function createPrivacy({db,col,now,clock,audit,roster}){
 const inputSchema=z.object({semester:semesterSchema,memberId:idSchema}).strict();
 async function eligibleTerm(semester,reader=db){
  const settings=(await reader.get(col('settings').doc('club'))).data();
  if(!settings||!/^20\d{2}-[12]$/.test(settings.semester)||semester>settings.semester)fail('failed-precondition','현재 학기와 정리할 학기를 확인해 주세요.');
  if(semester===settings.semester)fail('failed-precondition','현재 학기의 정보는 정리할 수 없습니다. 이전 학기 기록을 선택해 주세요.');
 }
 // Firestore and transactions expose different get interfaces.
 const readerFor=tx=>tx||{get:target=>target.get()};
 async function collect(input,tx){
  const reader=readerFor(tx);await eligibleTerm(input.semester,reader);
  const nested=await reader.get(roster.collection(input.semester).doc(input.memberId)),legacy=nested.exists?null:await reader.get(col('members').doc(input.memberId));
  const member=nested.exists?nested:legacy;
  const applications=await reader.get(col('applications').where('memberId','==',input.memberId));
  const selected=applications.docs.filter(d=>d.data().semester===input.semester);
  const memberData=member?.data()||{name:'이전 학기 기록'},changes=new Map(),blockers=[];
  const add=(doc,kind)=>changes.set(doc.ref.path,{doc,kind});
  const removeIdentity=nested.exists||memberData.semester===input.semester;
  const related=nested.exists?selected:applications.docs;
  if(removeIdentity&&!memberData.anonymizedAt)add(member,'member');
  if(removeIdentity&&!nested.exists&&applications.docs.some(d=>d.data().semester>input.semester&&!['cancelled','expired'].includes(d.data().status)))blockers.push('다음 학기의 신청이 연결된 명부입니다.');
  for(const application of (removeIdentity?related:selected)){
   const a=application.data(),event=await reader.get(col('events').doc(a.eventId)),e=event.data();
   if(!e||!['completed','cancelled'].includes(e.status))blockers.push('종료 처리되지 않은 행사가 있습니다.');
   if(a.paidAmount>a.refundAmount&&(e?.status==='cancelled'||['cancelled','expired'].includes(a.status)||a.payment==='refund_pending'))blockers.push('확인해야 할 환불 내역이 있습니다.');
   if(a.status==='registered'&&e?.status!=='cancelled'&&a.paidAmount<a.fee)blockers.push('납부가 완료되지 않은 참가비가 있습니다.');
   if(a.semester!==input.semester)continue;
   if(!a.anonymizedAt)add(application,'application');
   const history=await reader.get(application.ref.collection('history'));
   history.docs.filter(d=>!d.data().anonymizedAt).forEach(d=>add(d,'application'));
   const finance=await reader.get(col('finance').where('applicationId','==',application.id));
   finance.docs.filter(d=>!d.data().anonymizedAt).forEach(d=>add(d,'finance'));
   const auditRows=await reader.get(col('audit').where('entityId','==',application.id));
   auditRows.docs.filter(d=>!d.data().anonymizedAt).forEach(d=>add(d,'audit'));
  }
  const finances=await reader.get(col('finance').where('memberId','==',input.memberId));
  finances.docs.filter(d=>d.data().semester===input.semester&&!d.data().anonymizedAt).forEach(d=>add(d,'finance'));
  if(removeIdentity){
   const auditRows=await reader.get(col('audit').where('entityId','==',input.memberId));
   auditRows.docs.filter(d=>!d.data().anonymizedAt&&(!nested.exists||!d.data().semester||d.data().semester===input.semester)).forEach(d=>add(d,'audit'));
  }
  const records=[...changes.values()].sort((a,b)=>a.doc.ref.path.localeCompare(b.doc.ref.path));
  if(records.length>350)blockers.push('연결 기록이 350개를 초과합니다. 운영 담당자에게 개별 정리를 요청해 주세요.');
  const fingerprint=hash(records.map(r=>r.doc.ref.path+':'+r.doc.updateTime.seconds+':'+r.doc.updateTime.nanoseconds).join('|')+':'+input.semester+':'+input.memberId);
  const counts={member:0,application:0,finance:0,audit:0};records.forEach(r=>counts[r.kind]++);
  return {records,counts,blockers:[...new Set(blockers)],fingerprint,name:memberData.name,removeIdentity};
 }
 async function candidates(data,who){
  ensureScope(who,'admins',clock());const {semester}=parse(z.object({semester:semesterSchema}).strict(),data);
  await eligibleTerm(semester,readerFor());
  const [members,applications,finances]=await Promise.all([roster.documents(semester),col('applications').where('semester','==',semester).get(),col('finance').where('semester','==',semester).get()]);
  const rows=new Map();
  members.filter(d=>!d.data().anonymizedAt).forEach(d=>rows.set(d.id,{id:d.id,name:d.data().name,applications:0,roster:true}));
  applications.docs.filter(d=>!d.data().anonymizedAt).forEach(d=>{const a=d.data();if(!rows.has(a.memberId))rows.set(a.memberId,{id:a.memberId,name:a.name,applications:0,roster:false});rows.get(a.memberId).applications++;});
  for(const doc of finances.docs){const item=doc.data();if(item.memberId&&!item.anonymizedAt&&!rows.has(item.memberId)){const member=await roster.get(item.memberId,semester);rows.set(item.memberId,{id:item.memberId,name:member?.name||'이전 학기 회비 기록',applications:0,roster:false});}}
  return {rows:[...rows.values()],semester};
 }
 async function review(data,who){
  ensureScope(who,'admins',clock());const input=parse(inputSchema,data),plan=await collect(input);
  return {semester:input.semester,memberId:input.memberId,name:plan.name,counts:plan.counts,blockers:plan.blockers,fingerprint:plan.fingerprint,removeIdentity:plan.removeIdentity};
 }
 async function anonymize(data,who){
  ensureScope(who,'admins',clock());
  const input=parse(inputSchema.extend({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.string(),reason:z.string().trim().min(1).max(200)}).strict(),data);
  if(input.confirmation!==input.semester+' 정리')fail('invalid-argument','확인 문구를 정확히 입력해 주세요.');
  return db.runTransaction(async tx=>{
   const plan=await collect(input,tx);
   if(plan.blockers.length)fail('failed-precondition',plan.blockers.join(' '));
   if(plan.fingerprint!==input.fingerprint)fail('aborted','미리보기 이후 기록이 바뀌었습니다. 대상을 다시 확인해 주세요.');
   if(!plan.records.length)return {saved:true,counts:plan.counts};
   for(const {doc,kind} of plan.records){
    const patch={anonymizedAt:now(),updatedAt:now()};
    if(kind==='member')Object.assign(patch,{name:'정보 정리 완료',studentId:'',phone:'',college:'',department:'',grade:'',gender:'',identityHash:FieldValue.delete(),status:FieldValue.delete(),duesPaid:FieldValue.delete(),revision:(doc.data().revision||0)+1});
    if(kind==='application')Object.assign(patch,{name:'정보 정리 완료',answers:[],receiptHash:FieldValue.delete(),requestId:FieldValue.delete()});
    if(kind==='finance')Object.assign(patch,{title:'개인정보 정리 · '+doc.data().kind,note:''});
    if(kind==='audit')Object.assign(patch,{action:'개인정보 정리 전 운영 변경'});
    tx.update(doc.ref,patch);
   }
   audit(tx,who,'privacy',input.memberId,input.semester+' 개인정보 정리: '+input.reason);
   return {saved:true,counts:plan.counts};
  });
 }
 return {candidates,review,anonymize};
}
