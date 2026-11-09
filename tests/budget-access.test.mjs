import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../functions/src/service.js';
import { defaultRoles } from '../functions/src/permissions.js';

const START=Date.parse('2026-10-04T00:00:00Z');
const owner={uid:'owner',ip:'budget-unit'},chair={uid:'chair',ip:'budget-unit'},finance={uid:'finance',ip:'budget-unit'},planner={uid:'planner',ip:'budget-unit'};
const code=expected=>error=>error.code===expected;

// This test double executes the real service dispatch and authorization code.
// It never initializes Firebase or connects to any local or production database.
function fixture(){
 const records=new Map(),reads=[],writes=[];let nextId=1;
 const snapshot=path=>({id:path.split('/').at(-1),ref:reference(path),exists:records.has(path),data:()=>structuredClone(records.get(path))});
 const reference=path=>({path,id:path.split('/').at(-1),get:async()=>{reads.push(path);return snapshot(path);},collection:name=>collection(path+'/'+name)});
 const querySnapshot=query=>{
  const docs=[...records.keys()].filter(path=>path.startsWith(query.path+'/')&&path.slice(query.path.length+1).indexOf('/')===-1)
   .map(snapshot).filter(doc=>query.filters.every(([key,value])=>doc.data()[key]===value));
  return {docs,size:docs.length,empty:docs.length===0};
 };
 const collection=(path,filters=[])=>({path,filters,isQuery:true,doc:id=>reference(path+'/'+(id||'generated-'+nextId++)),get:async()=>{reads.push(path);return querySnapshot({path,filters});},where:(key,op,value)=>{assert.equal(op,'==');return collection(path,[...filters,[key,value]]);}});
 const db={collection,async runTransaction(run){
  const pending=[];
  const tx={
   get:async target=>{assert.equal(pending.length,0,'transaction reads must precede writes');reads.push(target.path);return target.isQuery?querySnapshot(target):snapshot(target.path);},
   set:(ref,value,options={})=>pending.push({type:'set',path:ref.path,value,merge:!!options.merge}),
   create:(ref,value)=>pending.push({type:'create',path:ref.path,value}),
   update:(ref,value)=>pending.push({type:'update',path:ref.path,value}),
   delete:ref=>pending.push({type:'delete',path:ref.path})
  };
  const result=await run(tx);
  for(const write of pending){
   if(write.type==='create')assert.equal(records.has(write.path),false);
   if(write.type==='update')assert.equal(records.has(write.path),true);
   if(write.type==='delete')records.delete(write.path);
   else records.set(write.path,structuredClone(write.merge||write.type==='update'?{...records.get(write.path),...write.value}:write.value));
   writes.push(write);
  }
  return result;
 }};
 for(const role of ['owner','chair','finance','planner'])records.set('martini_v2_admins/'+role,{role,displayName:role,active:true,expiresAt:new Date(START+86400000).toISOString()});
 records.set('martini_v2_roles/planner',{id:'planner',name:'예산 담당',revision:1,permissions:['budget']});
 const service=createService(db,()=>START);
 return {records,reads,writes,handle:(data,ctx=owner)=>service.handle(data,ctx),role:id=>records.get('martini_v2_roles/'+id)};
}

test('retired budget APIs cannot read, change or execute stored plans',async()=>{
 const f=fixture(),board={revision:2,funds:100000,plans:[]},plan={title:'보관한 계획',status:'planned',revision:1};
 f.records.set('martini_v2_budgetPlanner/current',board);
 f.records.set('martini_v2_budgets/legacy',plan);
 for(const actor of [owner,chair,finance,planner]){
  for(const op of ['budgetPlanner','saveBudgetPlanner','setRoleBudget','saveBudget','executeBudget','deleteBudget'])await assert.rejects(f.handle({op},actor),code('not-found'));
  for(const op of ['read','deleteRecord'])await assert.rejects(f.handle({op,kind:'budgets',id:'legacy',recordId:'legacy',confirmed:true,updatedAt:new Date(START).toISOString()},actor),code('invalid-argument'));
 }
 assert.ok(f.reads.every(path=>/^martini_v2_(?:admins|roles)\//.test(path)));
 assert.deepEqual(f.writes,[]);
 assert.deepEqual(f.records.get('martini_v2_budgetPlanner/current'),board);
 assert.deepEqual(f.records.get('martini_v2_budgets/legacy'),plan);
});

test('old budget grants disappear from role lists and profiles without rewriting stored roles',async()=>{
 const f=fixture();
 for(const id of ['owner','chair'])f.records.set('martini_v2_roles/'+id,{id,name:'다른 이름',revision:3,permissions:['budget'],system:false});
 f.records.set('martini_v2_roles/finance',{id:'finance',name:'재무팀',revision:2,permissions:['finance','budget']});
 const {rows}=await f.handle({op:'listRoles'});
 for(const id of ['owner','chair']){
  const builtin=defaultRoles.find(role=>role.id===id),profile=await f.handle({op:'profile'},{uid:id}),listed=rows.find(role=>role.id===id);
  assert.deepEqual(profile.permissions,builtin.permissions);
  assert.deepEqual(listed,{...builtin,revision:3,assigned:1});
  await assert.rejects(f.handle({op:'saveRole',id,revision:3,name:'변경 시도',permissions:['finance']}),code('failed-precondition'));
 }
 for(const [actor,expected] of [[finance,['finance']],[planner,[]]]){
  assert.deepEqual((await f.handle({op:'profile'},actor)).permissions,expected);
  assert.deepEqual(rows.find(role=>role.id===actor.uid).permissions,expected);
  assert.ok(f.role(actor.uid).permissions.includes('budget'));
 }
 await assert.rejects(f.handle({op:'saveRole',revision:0,name:'예전 권한',permissions:['budget']}),code('invalid-argument'));
 assert.deepEqual(f.writes,[]);
});

test('correcting an old budget-linked expense preserves the archived plan',async()=>{
 const f=fixture(),stamp=new Date(START).toISOString(),plan={status:'executed',revision:2,transactionId:'expense',actualAmount:9000};
 f.records.set('martini_v2_budgets/legacy',plan);
 f.records.set('martini_v2_finance/expense',{kind:'expense',amount:9000,semester:'2026-2',budgetId:'legacy',updatedAt:stamp});
 await f.handle({op:'deleteRecord',kind:'finance',id:'expense',updatedAt:stamp,confirmed:true},finance);
 const expense=f.records.get('martini_v2_finance/expense');
 assert.equal(expense.deletedAt,stamp);
 assert.equal(expense.budgetId,'legacy');
 assert.deepEqual(f.records.get('martini_v2_budgets/legacy'),plan);
 assert.ok(!f.writes.some(write=>write.path.startsWith('martini_v2_budgets/')));
});
