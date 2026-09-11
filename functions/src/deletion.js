import { billingFee } from './billing.js';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { parse, fail, ensureScope, idSchema, stockTotal } from './domain.js';
import { hasPermission } from './permissions.js';

const scopes={events:'events',applications:'events',finance:'finance',inventory:'inventory',meetings:'meetings',decisions:'decisions',content:'content',budgets:'finance'};
const schema=z.object({kind:z.enum(Object.keys(scopes)),id:idSchema,updatedAt:z.string().datetime(),revision:z.number().int().min(0).optional(),confirmed:z.literal(true)}).strict();

// Keep the original record for accounting, idempotency and retention policies.
// Ordinary reads and public capability links exclude deleted records.
export function createDeletion({db,col,clock,audit}){
 return async(data,who)=>{
  const input=parse(schema,data);ensureScope(who,scopes[input.kind],clock());
  const ref=col(input.kind).doc(input.id),now=()=>new Date(clock()).toISOString();
  return db.runTransaction(async tx=>{
   const snap=await tx.get(ref),r=snap.data();
   if(!r)fail('not-found','삭제할 기록을 찾을 수 없습니다.');
   if(r.deletedAt)return {saved:true,duplicate:true};
   if(r.updatedAt!==input.updatedAt||(r.revision!==undefined&&r.revision!==input.revision))fail('aborted','다른 변경이 있었습니다. 화면을 새로고침하고 다시 확인해 주세요.');
   const changes=[];
   if(input.kind==='events'){
    if(!['draft','cancelled','completed'].includes(r.status))fail('failed-precondition','모집 중인 행사는 먼저 취소하거나 진행 완료로 변경해 주세요.');
    const apps=await tx.get(col('applications').where('eventId','==',input.id));
    if(apps.docs.some(d=>{const a=d.data();return !a.deletedAt&&(['waiting','offered'].includes(a.status)||(r.status!=='completed'&&a.status==='registered')||(['cancelled','expired'].includes(a.status)&&a.paidAmount>a.refundAmount)||(a.status==='registered'&&billingFee(a)>a.paidAmount));}))fail('failed-precondition','참가·대기 상태와 미납·환불을 먼저 정리해 주세요.');
   }
   if(input.kind==='applications'){
    if(!['cancelled','expired'].includes(r.status))fail('failed-precondition','참가 신청을 먼저 취소한 뒤 삭제해 주세요.');
    if((r.paidAmount||0)>(r.refundAmount||0))fail('failed-precondition','환불할 금액이 남아 있습니다. 환불 기록을 먼저 완료해 주세요.');
   }
   if(input.kind==='inventory'&&stockTotal(r)>0)fail('failed-precondition','보유 재고가 남아 있습니다. 사용·폐기 또는 실사를 기록해 수량을 정리한 뒤 삭제해 주세요.');
   if(input.kind==='meetings'){
    if(r.status==='final'&&!hasPermission(who,'settings'))fail('permission-denied','확정된 회의록 삭제는 회장단 권한이 필요합니다.');
    const linked=await tx.get(col('decisions').where('meetingId','==',input.id));
    if(linked.docs.some(d=>!d.data().deletedAt))fail('failed-precondition','연결된 결정·할 일의 회의 연결을 해제하거나 해당 기록을 먼저 삭제해 주세요.');
   }
   if(input.kind==='budgets'&&r.status==='executed')fail('failed-precondition','연결된 실제 지출 기록을 먼저 삭제해 주세요.');
   if(input.kind==='finance'){
    if(r.applicationId){
     const aRef=col('applications').doc(r.applicationId),a=(await tx.get(aRef)).data();
     // Archived records still own their ledger totals; correcting them must not restore visibility.
     if(!a)fail('failed-precondition','정산에 연결된 신청 원본을 찾을 수 없습니다.');
     if((r.applicationRequestId&&r.applicationRequestId!==a.requestId)||r.createdAt<a.createdAt)fail('failed-precondition','이후 재신청한 기록이 연결되어 있습니다. 이전 신청의 거래는 삭제할 수 없습니다.');
     const event=(await tx.get(col('events').doc(a.eventId))).data();
     if(!event)fail('failed-precondition','정산에 연결된 행사 원본을 찾을 수 없습니다.');
     const paidAmount=(a.paidAmount||0)-(r.kind==='income'?r.amount:0),refundAmount=(a.refundAmount||0)-(r.kind==='refund'?r.amount:0);
     if(paidAmount<0||refundAmount<0||refundAmount>paidAmount)fail('failed-precondition','연결된 환불 기록을 먼저 삭제해 주세요. 납부·환불 합계가 맞아야 합니다.');
     let payment=!billingFee(a)?'none':paidAmount>=billingFee(a)?'paid':'unpaid';
     if(refundAmount>0)payment=refundAmount===paidAmount?'refunded':'partial';
     if((event.status==='cancelled'||['cancelled','expired'].includes(a.status))&&paidAmount>refundAmount)payment='refund_pending';
     changes.push([aRef,{paidAmount,refundAmount,payment,updatedAt:now()}]);
    }
    if(r.kind==='dues'&&r.memberId){
     const refs=[col('semesters').doc(r.semester).collection('dues').doc(r.memberId),col('members').doc(r.memberId).collection('semesters').doc(r.semester)];
     for(const term of await tx.getAll(...refs))if(term.data()?.duesTransactionId===input.id)changes.push([term.ref,{duesTransactionId:FieldValue.delete(),updatedAt:now()}]);
    }
    if(r.budgetId){
     const pRef=col('budgets').doc(r.budgetId),plan=(await tx.get(pRef)).data();
     if(plan?.transactionId===input.id&&!plan.deletedAt)changes.push([pRef,{status:'planned',transactionId:FieldValue.delete(),actualAmount:FieldValue.delete(),revision:plan.revision+1,updatedAt:now()}]);
    }
   }
   for(const [target,values] of changes)tx.update(target,values);
   tx.update(ref,{deletedAt:now(),deletedBy:who.uid,updatedAt:now(),...(r.revision!==undefined?{revision:r.revision+1}:{}),...(input.kind==='content'?{published:false}:{})});
   audit(tx,who,input.kind,input.id,'삭제',r.semester);
   return {saved:true};
  });
 };
}
