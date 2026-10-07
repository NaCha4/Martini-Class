import { z } from 'zod';
import { parse, fail, hash, ensureScope, requireRevision, idSchema } from './domain.js';

const key=z.string().regex(/^[a-f0-9]{64}$/),text=max=>z.string().trim().max(max);
const detail=z.object({label:text(60).min(1),value:text(2000).min(1)}).strict();
const itemSchema=z.object({id:idSchema.optional(),revision:z.number().int().min(0),name:text(100).min(1),description:text(3000).default(''),location:text(300).default(''),precautions:text(3000).default(''),details:z.array(detail).max(12).default([]),quantity:z.number().int().min(1).max(1000),enabled:z.boolean()}).strict();
const safeItem=(id,r)=>({id,name:r.name,description:r.description,location:r.location,precautions:r.precautions,details:r.details||[],quantity:r.quantity,borrowed:r.borrowed||0,available:Math.max(0,r.quantity-(r.borrowed||0)),enabled:r.enabled,revision:r.revision});
const safeLoan=(id,r)=>({id,itemId:r.itemId,item:r.item,quantity:r.quantity,note:r.note,dueDate:r.dueDate,status:r.status,borrowedAt:r.borrowedAt,returnedAt:r.returnedAt||null});
export function createEquipment({db,col,clock,now,audit,authenticate,identityFingerprint,throttle}){
 const items=()=>col('equipmentItems'),loans=()=>col('equipmentLoans');
 async function guard(ctx,keyValue,bucket){await throttle(ctx,'equipment-'+bucket,100);await throttle({ip:hash(keyValue)},'equipment-'+bucket+'-member',40);}
 async function memberLoansFor(member,tx){
  const result=await tx.get(loans().where('memberIdentityHash','==',identityFingerprint(member)));
  const rows=result.docs.filter(d=>!d.data().deletedAt&&!d.data().anonymizedAt).map(d=>safeLoan(d.id,d.data()));
  rows.sort((a,b)=>b.borrowedAt.localeCompare(a.borrowedAt)||a.id.localeCompare(b.id));
  return [...rows.filter(r=>r.status==='borrowed'),...rows.filter(r=>r.status==='returned').slice(0,30)];
 }
 async function memberEquipment(data,ctx){
  const input=parse(z.object({sessionKey:key}).strict(),data);await guard(ctx,input.sessionKey,'read');
  return db.runTransaction(async tx=>{
   const {member,expiresAt}=await authenticate(input.sessionKey,tx);
   const result=await tx.get(items().where('deleted','==',false));
   const personal=await memberLoansFor(member,tx);
   // Paused items remain readable so borrowers can find their current return location.
   const owned=new Set(personal.filter(r=>r.status==='borrowed').map(r=>r.itemId));
   return {items:result.docs.filter(d=>d.data().enabled||owned.has(d.id)).map(d=>safeItem(d.id,d.data())).sort((a,b)=>a.name.localeCompare(b.name,'ko')),loans:personal,expiresAt};
  },{readOnly:true});
 }
 async function borrowEquipment(data,ctx){
  const input=parse(z.object({sessionKey:key,requestId:idSchema,itemId:idSchema,quantity:z.number().int().min(1).max(1000),note:text(1000).default(''),dueDate:z.string().regex(/^(?:|\d{4}-\d{2}-\d{2})$/).default(''),confirmed:z.literal(true)}).strict(),data);
  await guard(ctx,input.sessionKey,'borrow');
  return db.runTransaction(async tx=>{
   const {member}=await authenticate(input.sessionKey,tx),fingerprint=identityFingerprint(member);
   const ref=loans().doc(input.requestId),old=(await tx.get(ref)).data();
   const payloadHash=hash(JSON.stringify([input.itemId,input.quantity,input.note,input.dueDate]));
   if(old){if(!old.deletedAt&&!old.anonymizedAt&&old.memberIdentityHash===fingerprint&&old.payloadHash===payloadHash)return {loan:safeLoan(ref.id,old),duplicate:true};fail('already-exists','이미 사용한 대여 기록 번호입니다. 대여 내역을 확인해 주세요.');}
   if(input.dueDate){const due=Date.parse(input.dueDate+'T23:59:59+09:00'),date=new Date(input.dueDate+'T00:00:00Z');if(!Number.isFinite(due)||date.toISOString().slice(0,10)!==input.dueDate||due<clock()||due>clock()+366*86400000)fail('invalid-argument','반납 예정일은 오늘부터 1년 이내의 유효한 날짜로 입력해 주세요.');}
   const itemRef=items().doc(input.itemId),item=(await tx.get(itemRef)).data();
   if(!item||item.deleted||!item.enabled)fail('failed-precondition','현재 대여할 수 없는 비품입니다. 목록을 새로고침해 주세요.');
   if(item.quantity-(item.borrowed||0)<input.quantity)fail('failed-precondition','대여 가능한 수량이 부족합니다. 목록을 새로고침해 주세요.');
   const record={itemId:input.itemId,item:{name:item.name,description:item.description,location:item.location,precautions:item.precautions,details:item.details||[]},quantity:input.quantity,note:input.note,dueDate:input.dueDate,status:'borrowed',borrowedAt:now(),memberIdentityHash:fingerprint,memberId:member.id,semester:member.semester,payloadHash};
   tx.create(ref,record);tx.update(itemRef,{borrowed:(item.borrowed||0)+input.quantity,revision:item.revision+1,updatedAt:now()});
   audit(tx,{uid:'member:'+member.id,displayName:member.name},'equipmentLoans',ref.id,'부원 대여 기록',member.semester);
   return {loan:safeLoan(ref.id,record)};
  });
 }
 async function returnEquipment(data,ctx){
  const input=parse(z.object({sessionKey:key,id:idSchema,confirmed:z.literal(true)}).strict(),data);await guard(ctx,input.sessionKey,'return');
  return db.runTransaction(async tx=>{
   const {member}=await authenticate(input.sessionKey,tx),ref=loans().doc(input.id),record=(await tx.get(ref)).data();
   if(!record||record.deletedAt||record.anonymizedAt||record.memberIdentityHash!==identityFingerprint(member))fail('not-found','본인의 대여 기록을 확인해 주세요.');
   if(record.status==='returned')return {loan:safeLoan(ref.id,record),duplicate:true};
   if(record.status!=='borrowed')fail('failed-precondition','반납할 수 없는 대여 기록입니다.');
   const itemRef=items().doc(record.itemId),item=(await tx.get(itemRef)).data();
   if(!item||!Number.isInteger(item.borrowed)||item.borrowed<record.quantity)fail('failed-precondition','비품 수량을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
   const patch={status:'returned',returnedAt:now()};
   tx.update(ref,patch);tx.update(itemRef,{borrowed:item.borrowed-record.quantity,revision:item.revision+1,updatedAt:now()});
   audit(tx,{uid:'member:'+member.id,displayName:member.name},'equipmentLoans',ref.id,'부원 반납 기록',member.semester);
   return {loan:safeLoan(ref.id,{...record,...patch})};
  });
 }
 async function equipmentCatalog(data,who){
  ensureScope(who,'inventory',clock());parse(z.object({}).strict(),data);
  const result=await items().where('deleted','==',false).get();
  return {items:result.docs.map(d=>safeItem(d.id,d.data())).sort((a,b)=>a.name.localeCompare(b.name,'ko'))};
 }
 async function saveEquipmentItem(data,who){
  ensureScope(who,'inventory',clock());const input=parse(itemSchema,data),ref=input.id?items().doc(input.id):items().doc();
  return db.runTransaction(async tx=>{
   const old=(await tx.get(ref)).data();
   if(input.id&&(!old||old.deleted))fail('not-found','비품을 찾을 수 없습니다.');
   requireRevision(old,input.revision);
   if(!old&&input.revision!==0)fail('aborted','새 비품 정보를 다시 입력해 주세요.');
   if(!old){const result=await tx.get(items().where('deleted','==',false).limit(200));if(result.size>=200)fail('failed-precondition','비품은 최대 200개까지 등록할 수 있습니다.');}
   if(input.quantity<(old?.borrowed||0))fail('failed-precondition','보유 수량은 현재 대여 중인 수량보다 적을 수 없습니다.');
   const record={...input,id:ref.id,deleted:false,borrowed:old?.borrowed||0,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now()};
   tx.set(ref,record);audit(tx,who,'equipmentItems',ref.id,old?'비품 정보 수정':'비품 등록');return {item:safeItem(ref.id,record)};
  });
 }
 async function deleteEquipmentItem(data,who){
  ensureScope(who,'inventory',clock());const input=parse(z.object({id:idSchema,revision:z.number().int().min(1),confirmed:z.literal(true)}).strict(),data);
  return db.runTransaction(async tx=>{const ref=items().doc(input.id),old=(await tx.get(ref)).data();if(!old||old.deleted)fail('not-found','비품을 찾을 수 없습니다.');requireRevision(old,input.revision);if(old.borrowed)fail('failed-precondition','대여 중인 비품은 삭제할 수 없습니다. 새 대여를 중지하려면 대여 가능 설정을 해제해 주세요.');tx.update(ref,{deleted:true,enabled:false,revision:old.revision+1,updatedAt:now()});audit(tx,who,'equipmentItems',ref.id,'비품 목록에서 삭제');return {saved:true};});
 }
 return {memberLoansFor,memberEquipment,borrowEquipment,returnEquipment,equipmentCatalog,saveEquipmentItem,deleteEquipmentItem};
}
