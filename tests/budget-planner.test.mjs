import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetPlanner } from '../functions/src/budget-planner.js';
import { calculateBudget, calculatePlan } from '../functions/src/budget-planner-rules.js';

const START=Date.parse('2026-10-04T00:00:00Z');
const who={uid:'budget-staff',displayName:'예산 담당',role:'custom-budget',active:true,expiresAt:'2027-01-01T00:00:00Z',permissions:['budget']};
const makeBoard=()=>({revision:0,funds:1000000,plans:[
 {id:'welcome',name:'환영회',allocated:400000,items:[{id:'food',title:'식비',amount:240000},{id:'supplies',title:'준비물',amount:60000}]},
 {id:'class',name:'클래스',allocated:300000,items:[{id:'supplies',title:'재료',amount:200000}]}
]});
const code=expected=>error=>error.code===expected;

// Transactions stage every write until success, including the shared audit row.
// Serializing transactions models optimistic revision conflicts without Firebase.
function fixture({auditFailure=false}={}){
 const records=new Map(),reads=[],writes=[],collections=[];
 let tail=Promise.resolve(),auditId=0,time=START;
 const snapshot=path=>({exists:records.has(path),data:()=>structuredClone(records.get(path))});
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>{reads.push(path);return snapshot(path);}});
 const col=name=>{collections.push(name);return {doc:id=>ref('martini_v2_'+name+'/'+id)};};
 const db={runTransaction(callback){
  const run=tail.then(async()=>{
   const pending=[];
   const tx={
    get:async target=>{assert.equal(pending.length,0,'reads must precede writes');reads.push(target.path);return snapshot(target.path);},
    set:(target,value)=>pending.push({path:target.path,value:structuredClone(value)}),
    create:(target,value)=>{assert.equal(records.has(target.path),false);pending.push({path:target.path,value:structuredClone(value)});}
   };
   const result=await callback(tx);
   for(const write of pending){records.set(write.path,write.value);writes.push(write);}
   return result;
  });
  tail=run.catch(()=>{});
  return run;
 }};
 const audit=(tx,actor,kind,id,action,semester)=>{
  if(auditFailure)throw new Error('Audit unavailable');
  tx.create(col('audit').doc('audit-'+ ++auditId),{entityType:kind,entityId:id,action,actor:actor.uid,actorName:actor.displayName,...(semester?{semester}:{})});
 };
 const planner=createBudgetPlanner({db,col,clock:()=>time,now:()=>new Date(time).toISOString(),audit});
 return {planner,records,reads,writes,collections,advance:milliseconds=>{time+=milliseconds;},stored:()=>records.get('martini_v2_budgetPlanner/current')};
}

test('budget calculations distinguish allocated funds from expected spending',()=>{
 const board=makeBoard(),before=structuredClone(board);
 assert.deepEqual(calculatePlan(board.plans[0]),{expected:300000,remaining:100000});
 assert.deepEqual(calculateBudget(board),{allocated:700000,expected:500000,unallocated:300000,remaining:500000});
 assert.deepEqual(board,before);
});

test('overspending remains negative and allocations are never deducted twice',()=>{
 const board={funds:100,plans:[{allocated:200,items:[{amount:300}]}]};
 assert.deepEqual(calculatePlan(board.plans[0]),{expected:300,remaining:-100});
 assert.deepEqual(calculateBudget(board),{allocated:200,expected:300,unallocated:-100,remaining:-200});
 assert.deepEqual(calculateBudget({funds:80,plans:[{allocated:60,items:[]}]}),{allocated:60,expected:0,unallocated:20,remaining:80});
 assert.deepEqual(calculateBudget({funds:0,plans:[]}),{allocated:0,expected:0,unallocated:0,remaining:0});
});

test('reading an unconfigured budget returns an empty board without writing',async()=>{
 const f=fixture();
 assert.deepEqual(await f.planner.read({},who),{revision:0,funds:0,plans:[]});
 assert.equal(f.writes.length,0);
 assert.deepEqual(f.reads,['martini_v2_budgetPlanner/current']);
 assert.deepEqual(f.collections,['budgetPlanner']);
});

test('save trims names, increments revision and records only a budget audit',async()=>{
 const f=fixture(),board=makeBoard();board.plans[0].name='  환영회  ';board.plans[0].items[0].title='  식비  ';
 const saved=await f.planner.save(board,who);
 assert.deepEqual(saved,{...makeBoard(),revision:1});
 assert.deepEqual(await f.planner.read({},who),saved);
 assert.equal(f.stored().createdBy,who.uid);
 assert.equal(f.stored().updatedAt,new Date(START).toISOString());
 assert.deepEqual(f.writes.map(write=>write.path),['martini_v2_budgetPlanner/current','martini_v2_audit/audit-1']);
 assert.deepEqual(f.records.get('martini_v2_audit/audit-1'),{entityType:'budgetPlanner',entityId:'current',action:'예산 계획 저장',actor:who.uid,actorName:who.displayName});
 assert.ok(f.collections.every(name=>['budgetPlanner','audit'].includes(name)));
});

test('board responses exclude persistence metadata and unrelated fields',async()=>{
 const f=fixture(),board={...makeBoard(),revision:4};
 f.records.set('martini_v2_budgetPlanner/current',{...board,createdBy:'other',updatedAt:'date',semester:'unused',privateField:true});
 assert.deepEqual(await f.planner.read({},who),board);
});

test('updates preserve creation metadata and allow removing plans and expense rows',async()=>{
 const f=fixture(),saved=await f.planner.save(makeBoard(),who),createdAt=f.stored().createdAt;
 f.advance(60000);
 const reduced={...saved,plans:[{...saved.plans[0],items:[]}]};
 assert.deepEqual(await f.planner.save(reduced,{...who,uid:'second-staff'}),{...reduced,revision:2});
 assert.equal(f.stored().createdAt,createdAt);
 assert.equal(f.stored().createdBy,who.uid);
 assert.equal(f.stored().updatedBy,'second-staff');
 assert.notEqual(f.stored().updatedAt,createdAt);
 assert.deepEqual(await f.planner.save({revision:2,funds:0,plans:[]},who),{revision:3,funds:0,plans:[]});
 assert.ok(f.collections.every(name=>['budgetPlanner','audit'].includes(name)));
});

test('stale or future revisions do not overwrite the board or create audits',async()=>{
 const f=fixture();await f.planner.save(makeBoard(),who);
 const before=structuredClone(f.stored());
 for(const revision of [0,2,99])await assert.rejects(f.planner.save({...makeBoard(),revision,funds:1},who),code('aborted'));
 assert.deepEqual(f.stored(),before);
 assert.equal(f.writes.length,2);
});

test('the first save requires revision zero',async()=>{
 const f=fixture();
 await assert.rejects(f.planner.save({...makeBoard(),revision:1},who),code('aborted'));
 assert.equal(f.writes.length,0);
 assert.equal(f.stored(),undefined);
});

test('two editors saving the same revision cannot silently overwrite each other',async()=>{
 const f=fixture(),first=makeBoard(),second={...makeBoard(),funds:900000};
 const outcomes=await Promise.allSettled([f.planner.save(first,who),f.planner.save(second,who)]);
 assert.equal(outcomes[0].status,'fulfilled');
 assert.equal(outcomes[1].status,'rejected');
 assert.equal(outcomes[1].reason.code,'aborted');
 assert.equal(f.stored().funds,first.funds);
 assert.equal(f.writes.length,2);
});

test('budget permission works independently and finance alone grants no access',async()=>{
 const f=fixture();
 await f.planner.save(makeBoard(),who);
 const noBudget=[{...who,permissions:[]},{...who,permissions:['finance']},{...who,role:'finance',permissions:undefined},{...who,role:'owner',permissions:[]},{...who,role:'chair',permissions:['admins','settings','events','finance']}];
 const readCount=f.reads.length,writeCount=f.writes.length,collectionCount=f.collections.length;
 for(const actor of noBudget){
  await assert.rejects(f.planner.read({},actor),code('permission-denied'));
  await assert.rejects(f.planner.save({...makeBoard(),revision:1},actor),code('permission-denied'));
 }
 assert.equal(f.reads.length,readCount);
 assert.equal(f.writes.length,writeCount);
 assert.equal(f.collections.length,collectionCount);
});

test('anonymous, inactive, invalid and expired staff cannot read or save',async()=>{
 const f=fixture();
 for(const actor of [null,{}, {...who,active:false},{...who,expiresAt:undefined},{...who,expiresAt:'invalid'},{...who,expiresAt:new Date(START).toISOString()}]){
  await assert.rejects(f.planner.read({},actor),code('permission-denied'));
  await assert.rejects(f.planner.save(makeBoard(),actor),code('permission-denied'));
 }
 assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.collections.length,0);
});

test('read accepts no selectors or unrelated collection parameters',async()=>{
 const f=fixture();
 for(const data of [null,[],{semester:'2026-2'},{eventId:'welcome'},{id:'other'},{kind:'finance'}])await assert.rejects(f.planner.read(data,who),code('invalid-argument'));
 assert.equal(f.reads.length,0);
});

test('save rejects malformed amounts, missing fields, unsafe revisions and extra linkage fields',async()=>{
 const f=fixture(),board=makeBoard();
 const invalid=[null,{}, {...board,revision:-1},{...board,revision:1.5},{...board,revision:Number.MAX_SAFE_INTEGER},
  {...board,funds:-1},{...board,funds:0.5},{...board,funds:1000000001},{...board,funds:'100'},
  {...board,funds:NaN},{...board,funds:Infinity},{...board,semester:'2026-2'},{...board,eventId:'welcome'},
  {...board,expected:123},{...board,remaining:123},{...board,plans:null},{...board,plans:undefined}];
 for(const patch of [{id:'invalid/id'},{id:''},{id:'a'.repeat(101)},{name:''},{name:'   '},{name:'가'.repeat(121)},{allocated:-1},{allocated:1.5},{allocated:1000000001},{eventId:'real-event'},{items:undefined}])invalid.push({...board,plans:[{...board.plans[0],...patch}]});
 for(const patch of [{id:'invalid/id'},{title:''},{title:'  '},{title:'가'.repeat(121)},{amount:-1},{amount:0.5},{amount:1000000001},{amount:'100'},{paid:true}])invalid.push({...board,plans:[{...board.plans[0],items:[{...board.plans[0].items[0],...patch}]}]});
 for(const data of invalid)await assert.rejects(f.planner.save(data,who),code('invalid-argument'));
 assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
});

test('plan and item IDs must be unique in their own scope',async()=>{
 const f=fixture(),board=makeBoard();
 await assert.rejects(f.planner.save({...board,plans:[board.plans[0],board.plans[0]]},who),code('invalid-argument'));
 await assert.rejects(f.planner.save({...board,plans:[{...board.plans[0],items:[board.plans[0].items[0],board.plans[0].items[0]]}]},who),code('invalid-argument'));
 assert.equal(f.writes.length,0);
 // The same item ID in different plans is safe: each list belongs to its plan.
 assert.equal((await f.planner.save(board,who)).plans.length,2);
});

test('maximum-sized boards remain accurate and exceeding either row limit is rejected',async()=>{
 const f=fixture(),items=Array.from({length:40},(_,i)=>({id:'item-'+i,title:'항목 '+i,amount:1000000000}));
 const plans=Array.from({length:40},(_,i)=>({id:'plan-'+i,name:'행사 '+i,allocated:1000000000,items}));
 const board={revision:0,funds:1000000000,plans};
 assert.deepEqual(calculateBudget(board),{allocated:40000000000,expected:1600000000000,unallocated:-39000000000,remaining:-1599000000000});
 assert.equal((await f.planner.save(board,who)).revision,1);
 await assert.rejects(f.planner.save({...board,revision:1,plans:[...plans,{...plans[0],id:'extra'}]},who),code('invalid-argument'));
 await assert.rejects(f.planner.save({...board,revision:1,plans:[{...plans[0],items:[...items,{...items[0],id:'extra'}]}]},who),code('invalid-argument'));
 assert.equal(f.writes.length,2);
});

test('an audit failure rolls back the board write',async()=>{
 const f=fixture({auditFailure:true});
 await assert.rejects(f.planner.save(makeBoard(),who),/Audit unavailable/);
 assert.equal(f.stored(),undefined);assert.equal(f.writes.length,0);
});
