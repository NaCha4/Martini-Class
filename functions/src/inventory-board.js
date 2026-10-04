import { z } from 'zod';
import { ensureScope, fail, hash, idSchema, parse, requireRevision } from './domain.js';

export const legacyInventoryCategoryIds=['legacy-spirit','legacy-ingredient','legacy-supply','legacy-tool'];
export const inventoryCategoryId=item=>typeof item.categoryId==='string'?item.categoryId:legacyInventoryCategoryIds.includes('legacy-'+item.category)?'legacy-'+item.category:'';
const nameSchema=z.string().trim().min(1).max(80).transform(name=>name.normalize('NFC').replace(/\s+/g,' '));
const label=record=>({id:record.id,name:record.name,revision:record.revision});
const live=doc=>doc.exists&&!doc.data().deletedAt?{...doc.data(),id:doc.id}:null;

export function createInventoryBoard({db,col,clock,now,audit}){
 const categories=col('inventoryCategories'),names=col('inventoryCategoryNames');
 async function target(tx,categoryId){
  if(!categoryId||legacyInventoryCategoryIds.includes(categoryId))return null;
  const ref=categories.doc(categoryId),category=live(await tx.get(ref));
  if(!category)fail('not-found','카테고리가 삭제되었습니다. 목록을 새로고침해 주세요.');
  return {ref,category};
 }
 // Assignments and empty-category deletion share this write to serialize races.
 function touch(tx,category){if(category)tx.update(category.ref,{membershipRevision:(category.category.membershipRevision||0)+1});}
 async function handle(op,data,who){
  ensureScope(who,'inventory',clock());
  if(op==='listInventoryCategories'){
   parse(z.object({}).strict(),data);
   const result=await categories.get();
   return {rows:result.docs.map(live).filter(Boolean).map(label).sort((a,b)=>a.name.localeCompare(b.name,'ko'))};
  }
  if(op==='saveInventoryCategory'){
   const input=parse(z.object({id:idSchema.optional(),revision:z.number().int().min(0).default(0),name:nameSchema}).strict(),data);
   if(input.id?.startsWith('legacy-'))fail('failed-precondition','기존 분류 대신 새 카테고리를 만들어 주세요.');
   if(!input.id&&input.revision!==0)fail('aborted','카테고리 목록을 새로고침해 주세요.');
   const ref=categories.doc(input.id||categories.doc().id),nameRef=names.doc(hash(input.name.toLowerCase()));
   return db.runTransaction(async tx=>{
    const old=live(await tx.get(ref));
    if(input.id&&!old)fail('not-found','카테고리를 찾을 수 없습니다.');
    requireRevision(old,input.revision);
    const duplicate=await tx.get(nameRef);
    if(duplicate.exists&&duplicate.data().categoryId!==ref.id)fail('already-exists','같은 이름의 카테고리가 있습니다.');
    const next={...old,id:ref.id,name:input.name,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),createdBy:old?.createdBy||who.uid,updatedAt:now(),updatedBy:who.uid};
    if(old&&old.name.toLowerCase()!==input.name.toLowerCase())tx.delete(names.doc(hash(old.name.toLowerCase())));
    tx.set(ref,next);tx.set(nameRef,{categoryId:ref.id});
    audit(tx,who,'inventoryCategories',ref.id,old?'카테고리 이름 수정':'카테고리 생성');
    return label(next);
   });
  }
  if(op==='deleteInventoryCategory'){
   const input=parse(z.object({id:idSchema,revision:z.number().int().min(1)}).strict(),data),ref=categories.doc(input.id);
   if(input.id.startsWith('legacy-'))fail('failed-precondition','기존 분류의 품목을 새 카테고리로 옮겨 주세요.');
   return db.runTransaction(async tx=>{
    const category=live(await tx.get(ref));
    if(!category)fail('not-found','카테고리를 찾을 수 없습니다.');
    requireRevision(category,input.revision);
    const items=await tx.get(col('inventory').where('categoryId','==',input.id));
    if(items.docs.some(doc=>!doc.data().deletedAt))fail('failed-precondition','품목을 모두 다른 카테고리로 옮긴 뒤 삭제해 주세요.');
    tx.update(ref,{deletedAt:now(),deletedBy:who.uid,updatedAt:now(),updatedBy:who.uid,revision:category.revision+1});
    tx.delete(names.doc(hash(category.name.toLowerCase())));
    audit(tx,who,'inventoryCategories',input.id,'빈 카테고리 삭제');
    return {saved:true};
   });
  }
  if(op==='moveInventoryItem'){
   const input=parse(z.object({id:idSchema,revision:z.number().int().min(1),categoryId:idSchema.or(z.literal(''))}).strict(),data),ref=col('inventory').doc(input.id);
   return db.runTransaction(async tx=>{
    const item=live(await tx.get(ref));
    if(!item)fail('not-found','재고 품목을 찾을 수 없습니다.');
    requireRevision(item,input.revision);
    const category=await target(tx,input.categoryId);
    const patch={categoryId:input.categoryId,revision:item.revision+1,updatedAt:now(),updatedBy:who.uid};
    touch(tx,category);tx.update(ref,patch);
    audit(tx,who,'inventory',input.id,'카테고리 이동');
    return {...item,...patch};
   });
  }
  fail('not-found','지원하지 않는 재고 요청입니다.');
 }
 return {handle,target,touch};
}
