import { z } from 'zod';
import { ensureScope, fail, idSchema, parse } from './domain.js';

const won=z.number().int().min(0).max(1000000000);
const title=z.string().trim().min(1).max(120);
const itemSchema=z.object({id:idSchema,title,amount:won}).strict();
const planSchema=z.object({id:idSchema,name:title,allocated:won,items:z.array(itemSchema).max(40)}).strict();
const boardSchema=z.object({revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),funds:won,plans:z.array(planSchema).max(40)}).strict().superRefine((board,ctx)=>{
 const ids=new Set();
 board.plans.forEach((plan,planIndex)=>{
  if(ids.has(plan.id))ctx.addIssue({code:'custom',path:['plans',planIndex,'id'],message:'행사 예산 번호가 중복되었습니다.'});
  ids.add(plan.id);
  const itemIds=new Set();
  plan.items.forEach((item,itemIndex)=>{
   if(itemIds.has(item.id))ctx.addIssue({code:'custom',path:['plans',planIndex,'items',itemIndex,'id'],message:'예상 소비내역 번호가 중복되었습니다.'});
   itemIds.add(item.id);
  });
 });
});
const readSchema=z.object({}).strict();
const boardValue=board=>({revision:board.revision,funds:board.funds,plans:board.plans.map(plan=>({id:plan.id,name:plan.name,allocated:plan.allocated,items:plan.items.map(item=>({id:item.id,title:item.title,amount:item.amount}))}))});

export function createBudgetPlanner({db,col,clock,now,audit}){
 const reference=()=>col('budgetPlanner').doc('current');
 async function read(data,who){
  ensureScope(who,'budget',clock());
  parse(readSchema,data);
  const doc=await reference().get();
  return doc.exists?boardValue(doc.data()):{revision:0,funds:0,plans:[]};
 }
 async function save(data,who){
  ensureScope(who,'budget',clock());
  const input=parse(boardSchema,data),ref=reference();
  return db.runTransaction(async tx=>{
   const doc=await tx.get(ref),previous=doc.exists?doc.data():null;
   if(input.revision!==(previous?.revision??0))fail('aborted','다른 운영진이 예산을 수정했습니다. 새로고침한 뒤 다시 확인해 주세요.');
   const at=now(),next={...input,revision:input.revision+1,createdAt:previous?.createdAt??at,createdBy:previous?.createdBy??who.uid,updatedAt:at,updatedBy:who.uid};
   tx.set(ref,next);
   audit(tx,who,'budgetPlanner',ref.id,'예산 계획 저장');
   return boardValue(next);
  });
 }
 return {read,save};
}
