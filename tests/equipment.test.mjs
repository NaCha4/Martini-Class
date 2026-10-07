import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentFixture,sessionKey,otherSession,owner } from './helpers/equipment-fixture.mjs';
import { hash } from '../functions/src/domain.js';
const code=value=>error=>error.code===value;
const itemInput={revision:0,name:'셰이커',description:'칵테일 연습용',location:'수납장 2층',precautions:'세척 후 완전히 말려 주세요.',details:[{label:'구성품',value:'본체와 뚜껑'},{label:'사용 방법',value:'얼음을 넣고 사용'}],quantity:2,enabled:true};
async function setup(){const f=equipmentFixture();const {item}=await f.handle({op:'saveEquipmentItem',...itemInput},owner);return {...f,itemId:item.id};}
const borrow=(f,extra={})=>f.handle({op:'borrowEquipment',sessionKey,requestId:'borrow-one',itemId:f.itemId,quantity:1,confirmed:true,...extra});
const returnLoan=(f,extra={})=>f.handle({op:'returnEquipment',sessionKey,id:'borrow-one',confirmed:true,...extra});

test('catalog holds configurable information and is visible only to authenticated members or inventory staff',async()=>{
 const f=await setup(),result=await f.handle({op:'memberEquipment',sessionKey});
 assert.equal(result.items[0].location,itemInput.location);assert.deepEqual(result.items[0].details,itemInput.details);assert.equal(result.items[0].available,2);assert.deepEqual(result.loans,[]);
 assert.equal((await f.handle({op:'equipmentCatalog'},{uid:'education'})).items.length,1);
 await assert.rejects(f.handle({op:'equipmentCatalog'},{uid:'publicity'}),code('permission-denied'));
 await assert.rejects(f.handle({op:'saveEquipmentItem',...itemInput},{uid:'publicity'}),code('permission-denied'));
 await assert.rejects(f.handle({op:'memberEquipment',sessionKey:'0'.repeat(64)}),code('unauthenticated'));
 assert.ok(f.writes.some(w=>w.path.startsWith('martini_v2_audit/')));
});
test('members borrow and return without admin review, immediately adjusting availability',async()=>{
 const f=await setup();const first=await borrow(f,{quantity:2,note:'연습'});
 assert.equal(first.loan.status,'borrowed');assert.equal(f.item(f.itemId).borrowed,2);
 const during=await f.handle({op:'memberEquipment',sessionKey});assert.equal(during.items[0].available,0);assert.equal(during.loans.length,1);
 assert.equal((await f.handle({op:'memberPortal',sessionKey})).equipmentLoans[0].id,'borrow-one');
 await returnLoan(f);assert.equal(f.item(f.itemId).borrowed,0);assert.equal(f.loan('borrow-one').status,'returned');assert.ok(f.loan('borrow-one').returnedAt);
 assert.equal((await f.handle({op:'memberEquipment',sessionKey})).items[0].available,2);
});
test('retries are idempotent for both borrowing and returning, including after the item was paused',async()=>{
 const f=await setup();await borrow(f);
 f.records.get('martini_v2_equipmentItems/'+f.itemId).enabled=false;
 assert.equal((await borrow(f)).duplicate,true);assert.equal(f.item(f.itemId).borrowed,1);
 await assert.rejects(borrow(f,{quantity:2}),code('already-exists'));
 await returnLoan(f);assert.equal((await returnLoan(f)).duplicate,true);assert.equal(f.item(f.itemId).borrowed,0);
 assert.equal((await borrow(f)).loan.status,'returned');assert.equal(f.item(f.itemId).borrowed,0);
});
test('concurrent requests cannot exceed available stock or double count a single request',async()=>{
 const f=await setup();const result=await Promise.allSettled([borrow(f,{quantity:2}),borrow(f,{sessionKey:otherSession,requestId:'second',quantity:2})]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.item(f.itemId).borrowed,2);
 const same=await Promise.all([borrow(f,{quantity:2}),borrow(f,{quantity:2})]);assert.ok(same.every(r=>r.duplicate));assert.equal(f.item(f.itemId).borrowed,2);
 await Promise.all([returnLoan(f),returnLoan(f)]);assert.equal(f.item(f.itemId).borrowed,0);
});
test('other members cannot read or return another member loan or reuse its request ID',async()=>{
 const f=await setup();await borrow(f);
 const result=await f.handle({op:'memberEquipment',sessionKey:otherSession});assert.deepEqual(result.loans,[]);assert.equal(result.items[0].borrowed,1);
 assert.deepEqual((await f.handle({op:'memberPortal',sessionKey:otherSession})).equipmentLoans,[]);
 await assert.rejects(returnLoan(f,{sessionKey:otherSession}),code('not-found'));
 await assert.rejects(borrow(f,{sessionKey:otherSession}),code('already-exists'));
 const json=JSON.stringify(await f.handle({op:'memberEquipment',sessionKey}));assert.doesNotMatch(json,/memberIdentityHash|payloadHash|memberId|studentId|phone|sessionKey/);
 assert.equal(f.item(f.itemId).borrowed,1);
});
test('removed members, changed identities, and expired sessions cannot mutate rentals',async()=>{
 for(const scenario of ['removed','identity','expired']){const f=await setup();await borrow(f);if(scenario==='removed')f.records.get('martini_v2_semesters/2026-2/members/member-a').removedAt=new Date().toISOString();if(scenario==='identity')f.records.get('martini_v2_semesters/2026-2/members/member-a').phone='01099999999';if(scenario==='expired')f.advance(8*86400000);await assert.rejects(returnLoan(f),code(scenario==='expired'?'unauthenticated':'permission-denied'));assert.equal(f.item(f.itemId).borrowed,1);}
});
test('inventory edits cannot overwrite concurrent loans, undercount borrowed stock, or delete outstanding items',async()=>{
 const f=await setup();await borrow(f,{quantity:2});
 await assert.rejects(f.handle({op:'saveEquipmentItem',...itemInput,id:f.itemId,revision:1},owner),code('aborted'));
 await assert.rejects(f.handle({op:'saveEquipmentItem',...itemInput,id:f.itemId,revision:2,quantity:1},owner),code('failed-precondition'));
 await assert.rejects(f.handle({op:'deleteEquipmentItem',id:f.itemId,revision:2,confirmed:true},owner),code('failed-precondition'));
 await f.handle({op:'saveEquipmentItem',...itemInput,id:f.itemId,revision:2,enabled:false,name:'이름 수정',location:'새 위치'},owner);
 const mine=await f.handle({op:'memberEquipment',sessionKey});assert.equal(mine.items[0].enabled,false);assert.equal(mine.items[0].location,'새 위치');assert.equal(mine.loans[0].item.name,'셰이커');
 assert.deepEqual((await f.handle({op:'memberEquipment',sessionKey:otherSession})).items,[]);
 await assert.rejects(borrow(f,{requestId:'new'}),code('failed-precondition'));
 await returnLoan(f);await f.handle({op:'deleteEquipmentItem',id:f.itemId,revision:4,confirmed:true},owner);
 const after=await f.handle({op:'memberEquipment',sessionKey});assert.deepEqual(after.items,[]);assert.equal(after.loans[0].item.name,'셰이커');
});
test('invalid quantities, unconfirmed operations, malformed dates, and oversized details are rejected',async()=>{
 const f=await setup();await assert.rejects(f.handle({op:'saveEquipmentItem',...itemInput,revision:1},owner),code('aborted'));for(const quantity of [0,-1,1.2,1001,'1'])await assert.rejects(borrow(f,{quantity}),code('invalid-argument'));
 for(const dueDate of ['2026-02-30','1900-01-01','9999-12-31','not-a-date'])await assert.rejects(borrow(f,{dueDate}),code('invalid-argument'));
 await assert.rejects(borrow(f,{confirmed:false}),code('invalid-argument'));
 await assert.rejects(f.handle({op:'saveEquipmentItem',...itemInput,details:Array.from({length:13},()=>({label:'x',value:'x'}))},owner),code('invalid-argument'));
 assert.equal(f.item(f.itemId).borrowed,0);assert.equal(f.loan('borrow-one'),undefined);
});
test('failed transactions roll back loan, stock, and audit together',async()=>{
 const f=await setup();f.failWrites(w=>w.path.startsWith('martini_v2_audit/'));
 await assert.rejects(borrow(f),/Synthetic write failure/);assert.equal(f.item(f.itemId).borrowed,0);assert.equal(f.loan('borrow-one'),undefined);
 f.failWrites(null);await borrow(f);f.failWrites(w=>w.path.startsWith('martini_v2_audit/'));
 await assert.rejects(returnLoan(f),/Synthetic write failure/);assert.equal(f.item(f.itemId).borrowed,1);assert.equal(f.loan('borrow-one').status,'borrowed');
});
test('the read-only request viewer cannot use any new equipment operation',async()=>{
 const f=await setup(),ctx={uid:'requestsViewer',authTime:Math.floor(f.now()/1000),verifyAuthSession:async()=>{}};
 for(const op of ['memberEquipment','borrowEquipment','returnEquipment','equipmentCatalog','saveEquipmentItem','deleteEquipmentItem'])await assert.rejects(f.handle({op,sessionKey},ctx),code('permission-denied'));
});
test('active loans follow the same verified identity across semesters',async()=>{
 const f=await setup();await borrow(f);
 const member=f.records.get('martini_v2_semesters/2026-2/members/member-a');
 f.records.set('martini_v2_semesters/2027-1/members/member-a',{...member,semester:'2027-1'});f.records.get('martini_v2_settings/club').semester='2027-1';f.records.get('martini_v2_memberSessions/'+hash(sessionKey)).semester='2027-1';
 assert.equal((await f.handle({op:'memberEquipment',sessionKey})).loans.length,1);await returnLoan(f);assert.equal(f.item(f.itemId).borrowed,0);
});
