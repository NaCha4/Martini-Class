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

test('finance and default leadership roles cannot read or save independent budgets before an explicit grant',async()=>{
 for(const actor of [owner,chair,finance])for(const op of ['budgetPlanner','saveBudgetPlanner']){
  const f=fixture();
  const input=op==='budgetPlanner'?{op}:{op,revision:0,funds:100000,plans:[]};
  await assert.rejects(f.handle(input,actor),code('permission-denied'));
  assert.ok(f.reads.every(path=>/^martini_v2_(?:admins|roles)\//.test(path)),JSON.stringify(f.reads));
  assert.deepEqual(f.writes,[]);
 }
 const f=fixture();
 await assert.rejects(f.handle({op:'budgetPlanner'},{}),code('unauthenticated'));
 assert.deepEqual(f.reads,[]);
});

test('leadership can opt in to budget work without changing any of its protected core permissions',async()=>{
 for(const actor of [owner,chair]){
  const f=fixture(),before=await f.handle({op:'profile'},actor);
  const changed=await f.handle({op:'setRoleBudget',id:actor.uid,revision:0,enabled:true},owner);
  const after=await f.handle({op:'profile'},actor);
  assert.deepEqual(after.permissions,[...before.permissions,'budget']);
  assert.equal(after.roleName,before.roleName);
  assert.equal(changed.revision,1);
  const listed=(await f.handle({op:'listRoles'})).rows.find(role=>role.id===actor.uid);
  assert.equal(listed.revision,1);
  assert.deepEqual(listed.permissions,after.permissions);
  assert.equal(listed.assigned,1);
  assert.deepEqual(await f.handle({op:'budgetPlanner'},actor),{revision:0,funds:0,plans:[]});
  assert.ok(f.writes.some(write=>write.path.startsWith('martini_v2_audit/')),'Grant changes must be audited');
 }
});

test('revoking leadership budget access takes effect on the next request while preserving management authority',async()=>{
 const f=fixture();
 await f.handle({op:'setRoleBudget',id:'owner',revision:0,enabled:true});
 const written=await f.handle({op:'saveBudgetPlanner',revision:0,funds:100000,plans:[]});
 assert.equal(written.revision,1);
 await f.handle({op:'setRoleBudget',id:'owner',revision:1,enabled:false});
 const profile=await f.handle({op:'profile'});
 assert.deepEqual(profile.permissions,defaultRoles.find(role=>role.id==='owner').permissions);
 await assert.rejects(f.handle({op:'budgetPlanner'}),code('permission-denied'));
 assert.ok((await f.handle({op:'listRoles'})).rows.length>0,'Role management remains available after budget revocation');
 assert.deepEqual(await f.handle({op:'budgetPlanner'},planner),{revision:1,funds:100000,plans:[]});
});

test('protected role budget updates reject stale revisions and never use ordinary role writes',async()=>{
 const f=fixture();
 await f.handle({op:'setRoleBudget',id:'chair',revision:0,enabled:true});
 const count=f.writes.length;
 await assert.rejects(f.handle({op:'setRoleBudget',id:'chair',revision:0,enabled:false}),code('aborted'));
 for(const id of ['owner','chair']){
  await assert.rejects(f.handle({op:'saveRole',id,revision:id==='chair'?1:0,name:'변경 시도',permissions:['budget']}),code('failed-precondition'));
  await assert.rejects(f.handle({op:'deleteRole',id,revision:id==='chair'?1:0}),code('failed-precondition'));
 }
 assert.equal(f.writes.length,count);
 assert.equal((await f.handle({op:'profile'},chair)).permissions.includes('budget'),true);
});

test('stored leadership metadata can opt into budget but cannot replace protected names or core permissions',async()=>{
 for(const id of ['owner','chair']){
  const f=fixture(),builtin=defaultRoles.find(role=>role.id===id);
  f.records.set('martini_v2_roles/'+id,{id,name:'다른 이름',revision:3,permissions:['budget','unrecognized'],system:false});
  const profile=await f.handle({op:'profile'},{uid:id});
  assert.equal(profile.roleName,builtin.name);
  assert.deepEqual(profile.permissions,[...builtin.permissions,'budget']);
  const listed=(await f.handle({op:'listRoles'})).rows.find(role=>role.id===id);
  assert.equal(listed.name,builtin.name);
  assert.equal(listed.system,true);
  assert.deepEqual(listed.permissions,profile.permissions);
  f.records.set('martini_v2_roles/'+id,{...f.role(id),deletedAt:new Date(START).toISOString()});
  assert.deepEqual((await f.handle({op:'profile'},{uid:id})).permissions,builtin.permissions);
 }
});

test('the restricted leadership endpoint validates only its budget selector and requires role-management authority',async()=>{
 const base={op:'setRoleBudget',id:'owner',revision:0,enabled:true};
 for(const patch of [{id:'planner'},{id:'finance'},{id:'missing'},{revision:-1},{enabled:'true'},{enabled:1},{permissions:['budget']},{name:'변경 이름'},{corePermissions:[]}]){
  const f=fixture();
  await assert.rejects(f.handle({...base,...patch}),code('invalid-argument'));
  assert.deepEqual(f.writes,[]);
 }
 for(const actor of [finance,planner]){
  const f=fixture();
  await assert.rejects(f.handle(base,actor),code('permission-denied'));
  assert.deepEqual(f.writes,[]);
 }
});

test('ordinary role budget grants remain isolated from participant finance and can be removed normally',async()=>{
 const f=fixture();
 const saved=await f.handle({op:'saveRole',id:'finance',revision:0,name:'재무부',permissions:['finance','budget']});
 assert.equal(saved.revision,1);
 assert.deepEqual((await f.handle({op:'profile'},finance)).permissions,['finance','budget']);
 assert.deepEqual(await f.handle({op:'budgetPlanner'},finance),{revision:0,funds:0,plans:[]});
 await f.handle({op:'saveRole',id:'finance',revision:1,name:'재무부',permissions:['finance']});
 await assert.rejects(f.handle({op:'budgetPlanner'},finance),code('permission-denied'));
 assert.deepEqual((await f.handle({op:'profile'},finance)).permissions,['finance']);
});
