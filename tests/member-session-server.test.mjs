import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberPortal } from '../functions/src/member-portal.js';
import { createService } from '../functions/src/service.js';
import { hash } from '../functions/src/domain.js';

const HOUR=3600000,DAY=24*HOUR,START=Date.parse('2026-10-03T00:00:00Z');
const firstKey='a'.repeat(64),secondKey='b'.repeat(64),unknownKey='c'.repeat(64);
const member={id:'sample-member',name:'가상 부원',studentId:'TEST-100',phone:'01000000000',semester:'2026-2',status:'active'};

// An isolated in-memory transaction double: importing the server modules never
// initializes Firebase, reads credentials, or connects to a database.
function memoryDatabase(){
 const records=new Map(),reads=[],writes=[];
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path),collection:name=>collection(path+'/'+name)});
 const snapshot=path=>({exists:records.has(path),id:path.split('/').at(-1),ref:ref(path),data:()=>records.get(path)});
 const collection=path=>({path,doc:id=>ref(path+'/'+id)});
 const db={collection,async runTransaction(run){
  const pending=[];
  const tx={
   async get(target){assert.equal(pending.length,0,'all transaction reads precede writes');reads.push(target.path);return snapshot(target.path);},
   create(target,value){pending.push({method:'create',path:target.path,value});},
   update(target,value){pending.push({method:'update',path:target.path,value});},
   set(target,value){pending.push({method:'set',path:target.path,value});}
  };
  const result=await run(tx);
  for(const write of pending){
   if(write.method==='create')assert.equal(records.has(write.path),false);
   if(write.method==='update')assert.equal(records.has(write.path),true);
   records.set(write.path,write.method==='update'?{...records.get(write.path),...write.value}:write.value);
   writes.push(write);
  }
  return result;
 }};
 return {db,records,reads,writes};
}
function fixture(){
 const memory=memoryDatabase(),col=name=>memory.db.collection('martini_v2_'+name);
 let time=START,rosterMember={...member},rosterReads=0;
 memory.records.set(col('settings').doc('club').path,{semester:member.semester});
 const roster={
  get:async()=>{rosterReads++;return rosterMember;},
  findStudent:async studentId=>{rosterReads++;return rosterMember?.studentId===studentId?[rosterMember]:[];}
 };
 const clock=()=>time;
 const portal=createMemberPortal({db:memory.db,col,clock,now:()=>new Date(time).toISOString(),roster,throttle:async()=>{},audit:()=>assert.fail('member login never creates an admin audit')});
 return {...memory,portal,col,clock,advance:amount=>{time+=amount;},changeMember:patch=>{rosterMember=patch===null?null:{...rosterMember,...patch};},rosterReads:()=>rosterReads,
  access:(sessionKey=firstKey,options={})=>portal.access({name:member.name,studentId:member.studentId,sessionKey,...options},{ip:'unit-test'}),
  session:sessionKey=>memory.records.get(col('memberSessions').doc(hash(sessionKey)).path)
 };
}
const code=expected=>error=>error.code===expected;

test('new sessions last two hours by default and seven days only with remember true',async()=>{
 for(const [options,duration] of [[{},2*HOUR],[{remember:false},2*HOUR],[{remember:true},7*DAY]]){
  const f=fixture(),result=await f.access(firstKey,options),session=f.session(firstKey);
  assert.equal(Date.parse(result.expiresAt),START+duration);
  assert.equal(session.expiresAt.toMillis(),START+duration);
  assert.deepEqual(result.member,{name:member.name,semester:member.semester});
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].path,'martini_v2_memberSessions/'+hash(firstKey));
  assert.equal(JSON.stringify(session).includes(firstKey),false);
  for(const field of ['sessionKey','name','studentId','phone'])assert.equal(field in session,false);
 }
});

test('retrying either session mode preserves its original expiry and creates no new session',async()=>{
 for(const remember of [false,true]){
  const f=fixture(),initial=await f.access(firstKey,{remember}),createdAt=f.session(firstKey).createdAt;
  f.advance(HOUR);
  for(const options of [{},{remember},{remember:!remember}])assert.deepEqual(await f.access(firstKey,options),initial);
  assert.equal(f.writes.length,1);
  assert.equal(f.session(firstKey).createdAt,createdAt);
 }
});

test('remembered sessions authenticate after two hours and expire exactly at seven days',async()=>{
 const f=fixture();await f.access(firstKey,{remember:true});
 f.advance(2*HOUR+1);
 assert.equal((await f.portal.authenticate(firstKey)).member.id,member.id);
 f.advance(7*DAY-2*HOUR-2);
 await f.portal.authenticate(firstKey);
 f.advance(1);
 await assert.rejects(f.portal.authenticate(firstKey),code('unauthenticated'));
 await assert.rejects(f.access(firstKey,{remember:true}),code('unauthenticated'));
 assert.equal(f.writes.length,1);
});

test('default sessions still expire at two hours and cannot be extended by a retry',async()=>{
 const f=fixture();await f.access();f.advance(2*HOUR);
 await assert.rejects(f.portal.authenticate(firstKey),code('unauthenticated'));
 await assert.rejects(f.access(firstKey,{remember:true}),code('unauthenticated'));
 assert.equal(f.session(firstKey).expiresAt.toMillis(),START+2*HOUR);
});

test('seven-day sessions continue to require current roster identity and eligibility',async()=>{
 for(const patch of [null,{status:'inactive'},{removedAt:'2026-10-03T01:00:00Z'},{deletedAt:'2026-10-03T01:00:00Z'},{anonymizedAt:'2026-10-03T01:00:00Z'},{active:false},{name:'다른 부원'},{studentId:'TEST-101'},{phone:'01000000001'}]){
  const f=fixture();await f.access(firstKey,{remember:true});f.changeMember(patch);
  await assert.rejects(f.portal.authenticate(firstKey),code('permission-denied'));
 }
 const f=fixture();await f.access(firstKey,{remember:true});
 f.records.set(f.col('settings').doc('club').path,{semester:'2027-1'});
 await assert.rejects(f.portal.authenticate(firstKey),code('unauthenticated'));
});

test('logout revokes only the supplied session and is idempotent without changing expiry',async()=>{
 const f=fixture();await f.access(firstKey,{remember:true});await f.access(secondKey);
 const expiry=f.session(firstKey).expiresAt,other=f.session(secondKey);
 f.advance(HOUR);
 assert.deepEqual(await f.portal.logout({sessionKey:firstKey},{ip:'unit-test'}),{signedOut:true});
 const revokedAt=f.session(firstKey).revokedAt;
 assert.equal(revokedAt,new Date(START+HOUR).toISOString());
 assert.equal(f.session(firstKey).expiresAt,expiry);
 assert.equal(f.session(secondKey),other);
 assert.equal((await f.portal.authenticate(secondKey)).member.id,member.id);
 const writes=f.writes.length;
 f.advance(1);
 assert.deepEqual(await f.portal.logout({sessionKey:firstKey},{}),{signedOut:true});
 assert.equal(f.session(firstKey).revokedAt,revokedAt);
 assert.equal(f.writes.length,writes);
});

test('revoked sessions cannot authenticate or be resurrected by any access retry mode',async()=>{
 const f=fixture();await f.access(firstKey,{remember:true});await f.portal.logout({sessionKey:firstKey},{});
 await assert.rejects(f.portal.authenticate(firstKey),code('unauthenticated'));
 for(const options of [{},{remember:false},{remember:true}])await assert.rejects(f.access(firstKey,options),code('unauthenticated'));
 assert.equal(f.writes.length,2);
});

test('logout still works after expiry, roster removal, or missing semester settings',async()=>{
 const f=fixture();await f.access();f.advance(8*DAY);f.changeMember(null);
 f.records.delete(f.col('settings').doc('club').path);
 const reads=f.rosterReads();f.reads.length=0;
 assert.deepEqual(await f.portal.logout({sessionKey:firstKey},{}),{signedOut:true});
 assert.equal(f.rosterReads(),reads);
 assert.deepEqual(f.reads,['martini_v2_memberSessions/'+hash(firstKey)]);
 assert.ok(f.session(firstKey).revokedAt);
});

test('logout of an unknown token succeeds without creating a session or tombstone',async()=>{
 const f=fixture();
 assert.deepEqual(await f.portal.logout({sessionKey:unknownKey},{}),{signedOut:true});
 assert.equal(f.session(unknownKey),undefined);
 assert.equal(f.writes.length,0);
});

test('session endpoints reject malformed remember values and extra logout selectors',async()=>{
 const f=fixture();
 for(const remember of ['true',1,null,{}])await assert.rejects(f.access(firstKey,{remember}),code('invalid-argument'));
 for(const input of [{},{sessionKey:'bad'},{sessionKey:firstKey,memberId:member.id},{sessionKey:firstKey,all:true}])await assert.rejects(f.portal.logout(input,{}),code('invalid-argument'));
 assert.equal(f.writes.length,0);
});

test('service dispatch permits token-only logout without staff or roster access',async()=>{
 const f=fixture();await f.access(firstKey,{remember:true});f.changeMember(null);
 f.records.delete(f.col('settings').doc('club').path);f.reads.length=0;
 const service=createService(f.db,f.clock);
 assert.deepEqual(await service.handle({op:'memberLogout',sessionKey:firstKey},{ip:'unit-test'}),{signedOut:true});
 assert.ok(f.session(firstKey).revokedAt);
 assert.ok(f.reads.every(path=>/^martini_v2_(rateLimits|memberSessions)\//.test(path)));
});
