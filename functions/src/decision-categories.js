import { z } from 'zod';
import { ensureScope, fail, hash, idSchema, parse, requireRevision } from './domain.js';

const nameSchema=z.string().trim().min(1).max(80).transform(name=>name.normalize('NFC').replace(/\s+/g,' '));
const label=doc=>({id:doc.id,name:doc.name,revision:doc.revision});

export function createDecisionCategories({db,col,clock,now,audit}){
 const categories=col('decisionCategories'),names=col('decisionCategoryNames');
 return async function handle(op,data,who){
  ensureScope(who,'decisions',clock());
  if(op==='decisionCategories'){
   const input=parse(z.object({cursor:idSchema.optional()}).strict(),data);
   let query=categories.orderBy('__name__').limit(101);
   if(input.cursor)query=query.startAfter(input.cursor);
   const result=await query.get(),docs=result.docs.slice(0,100);
   return {rows:docs.filter(d=>!d.data().deletedAt).map(d=>label({...d.data(),id:d.id})),nextCursor:result.size>100?docs.at(-1).id:null};
  }
  if(op==='createDecisionCategory'){
   const input=parse(z.object({requestId:idSchema,name:nameSchema}).strict(),data);
   const ref=categories.doc(input.requestId),nameRef=names.doc(hash(input.name.toLowerCase()));
   return db.runTransaction(async tx=>{
    const [previous,duplicate]=await tx.getAll(ref,nameRef);
    if(previous.exists){
     if(previous.data().name!==input.name||previous.data().deletedAt)fail('failed-precondition','카테고리 목록을 새로고침한 뒤 다시 추가해 주세요.');
     return label({...previous.data(),id:previous.id});
    }
    if(duplicate.exists)fail('already-exists','같은 이름의 카테고리가 있습니다.');
    const next={id:ref.id,name:input.name,revision:1,createdAt:now(),updatedAt:now(),createdBy:who.uid};
    tx.create(ref,next);tx.create(nameRef,{categoryId:ref.id});
    audit(tx,who,'decisionCategories',ref.id,'카테고리 생성');return label(next);
   });
  }
  const input=parse(z.object({id:idSchema,revision:z.number().int().min(1)}).strict(),data);
  const ref=categories.doc(input.id);
  return db.runTransaction(async tx=>{
   const doc=await tx.get(ref),category=doc.data();
   if(!doc.exists||category.deletedAt)fail('not-found','이미 삭제되었거나 찾을 수 없는 카테고리입니다.');
   requireRevision(category,input.revision);
   // Keep the ID retired: its records appear in common work, even if the name is reused.
   tx.update(ref,{deletedAt:now(),updatedAt:now(),deletedBy:who.uid,revision:category.revision+1});
   tx.delete(names.doc(hash(category.name.toLowerCase())));
   audit(tx,who,'decisionCategories',input.id,'카테고리 삭제');return {saved:true};
  });
 };
}
