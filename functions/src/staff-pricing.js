import { z } from 'zod';
import { ensureScope, fail, idSchema, parse } from './domain.js';

const feeSchema=z.number().int().min(0).max(1000000),revisionSchema=z.number().int().min(0);
const active=a=>!a.deletedAt&&!a.anonymizedAt&&['registered','waiting','offered'].includes(a.status);
const configured=e=>Number.isInteger(e.staffFee)&&e.staffFee>=0;
const paymentFor=(a,fee)=>a.status!=='registered'||fee===0?'none':a.refundAmount>0?a.payment:a.paidAmount===fee?'paid':a.payment==='requested'?'requested':'unpaid';
function checkPaid(a,fee){if(fee<(a.paidAmount||0))fail('failed-precondition','이미 확인한 입금액보다 낮게 설정할 수 없습니다. 해당 신청의 입금 기록을 먼저 확인해 주세요.');}

export function createStaffPricing({db,col,clock,now,audit}){
 return async function handle(op,data,who){
  ensureScope(who,'finance',clock());
  if(op==='setEventStaffFee'){
   const input=parse(z.object({id:idSchema,staffFee:feeSchema,staffFeeRevision:revisionSchema}).strict(),data);
   return db.runTransaction(async tx=>{
    const ref=col('events').doc(input.id),doc=await tx.get(ref),event=doc.data();
    if(!doc.exists||event.deletedAt||event.status==='cancelled')fail('failed-precondition','진행 중인 행사의 관리인원 금액만 설정할 수 있습니다.');
    if((event.staffFeeRevision||0)!==input.staffFeeRevision)fail('aborted','관리인원 공통 금액이 변경되었습니다. 다시 열어 확인해 주세요.');
    const applications=await tx.get(col('applications').where('eventId','==',input.id));
    const staff=applications.docs.filter(d=>active(d.data())&&d.data().isStaff);
    // Leave room for the event and audit writes in the atomic transaction.
    if(staff.length>498)fail('resource-exhausted','한 번에 변경할 수 있는 관리인원은 498명입니다. 운영 담당자에게 확인해 주세요.');
    staff.forEach(d=>checkPaid(d.data(),input.staffFee));
    const at=now(),revision=(event.staffFeeRevision||0)+1;
    tx.update(ref,{staffFee:input.staffFee,staffFeeRevision:revision,updatedAt:at});
    for(const d of staff){const a=d.data();tx.update(d.ref,{staffFee:input.staffFee,pricingRevision:(a.pricingRevision||0)+1,payment:paymentFor(a,input.staffFee),updatedAt:at});}
    audit(tx,who,'events',input.id,'관리인원 공통 금액 '+input.staffFee+'원 · 기존 '+staff.length+'명 적용',event.semester);
    return {saved:true,staffFee:input.staffFee,staffFeeRevision:revision,updatedCount:staff.length};
   });
  }
  const legacy=op==='setApplicationPricing';
  const input=parse(z.object({id:idSchema,isStaff:z.boolean(),pricingRevision:revisionSchema,...(legacy?{staffFee:feeSchema}:{staffFeeRevision:revisionSchema.optional()})}).strict(),data);
  return db.runTransaction(async tx=>{
   const ref=col('applications').doc(input.id),doc=await tx.get(ref),a=doc.data();
   if(!doc.exists||a.deletedAt||a.anonymizedAt)fail('not-found','신청을 찾을 수 없습니다.');
   const eventDoc=await tx.get(col('events').doc(a.eventId)),event=eventDoc.data();
   if(!eventDoc.exists||event.deletedAt||event.status==='cancelled'||!active(a))fail('failed-precondition','진행 중인 신청의 관리인원만 변경할 수 있습니다.');
   if((a.pricingRevision||0)!==input.pricingRevision)fail('aborted','금액 설정이 변경되었습니다. 다시 열어 확인해 주세요.');
   let fee=a.fee;
   if(input.isStaff){
    if(legacy){
     if(configured(event)&&input.staffFee!==event.staffFee)fail('failed-precondition','행사 공통 금액이 설정되어 있습니다. 새로고침한 뒤 관리인원 체크박스를 사용해 주세요.');
     fee=configured(event)?event.staffFee:input.staffFee;
    }else{
     if(!configured(event))fail('failed-precondition','먼저 이 행사의 관리인원 공통 금액을 설정해 주세요.');
     if((event.staffFeeRevision||0)!==input.staffFeeRevision)fail('aborted','관리인원 공통 금액이 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.');
     fee=event.staffFee;
    }
   }
   checkPaid(a,fee);
   const next={isStaff:input.isStaff,staffFee:fee,pricingRevision:(a.pricingRevision||0)+1,payment:paymentFor(a,fee),updatedAt:now()};
   tx.update(ref,next);audit(tx,who,'applications',ref.id,(input.isStaff?'관리인원':'일반 참가자')+' 정산 금액 '+fee+'원',a.semester);
   return {saved:true,...next};
  });
 };
}
