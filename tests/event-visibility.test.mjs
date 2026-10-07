import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { hash } from '../functions/src/domain.js';

const START=Date.parse('2026-10-04T00:00:00Z'),stamp=new Date(START).toISOString();
const time=offset=>new Date(START+offset).toISOString();
const sessionKey='1'.repeat(64),owner={uid:'owner',ip:'visibility-owner'},memberContext={ip:'visibility-member'};
const member={id:'member-a',name:'가상 부원',studentId:'TEST-100',phone:'01000000000',semester:'2026-2',status:'active'};
const fingerprint=hash(JSON.stringify([member.name,member.studentId,member.phone]));
const eventKeys={'public-event':'a'.repeat(64),'private-event':'b'.repeat(64),'legacy-event':'c'.repeat(64)};
const receiptKeys={'public-event':'d'.repeat(64),'private-event':'e'.repeat(64),'legacy-event':'f'.repeat(64)};
const appId=eventId=>hash(eventId+':'+member.id);
const code=expected=>error=>error.code===expected;
const eventInput=(extra={})=>({revision:0,title:'가상 행사',type:'class',description:'테스트 교육',location:'동아리방',startsAt:time(86400000),endsAt:time(90000000),opensAt:time(-3600000),closesAt:time(80000000),cancelUntil:time(80000000),capacity:20,fee:1000,waitlist:true,status:'open',semester:'2026-2',questions:[],policy:'취소 안내',owner:'교육부',...extra});

// Local Firestore double for the real service and portal routes. It supports
// nested roster collections, equality queries, ordering, limits, and atomic
// transactions, while preserving Timestamp behavior used by member sessions.
function clone(value){
 if(value?.toMillis&&value?.toDate)return Timestamp.fromMillis(value.toMillis());
 if(Array.isArray(value))return value.map(clone);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)]));
 return value;
}
function fixture({applications=true}={}){
 const records=new Map(),reads=[],writes=[];let generatedId=0;
 const snapshot=path=>({id:path.split('/').at(-1),ref:reference(path),exists:records.has(path),data:()=>clone(records.get(path))});
 const reference=path=>({path,id:path.split('/').at(-1),get:async()=>{reads.push(path);return snapshot(path);},collection:name=>collection(path+'/'+name)});
 const querySnapshot=query=>{
  let docs=[...records.keys()].filter(path=>path.startsWith(query.path+'/')&&!path.slice(query.path.length+1).includes('/')).map(snapshot)
   .filter(doc=>query.filters.every(([key,value])=>doc.data()[key]===value));
  for(const [key,direction] of [...query.orders].reverse())docs.sort((a,b)=>{
   const first=key==='__name__'?a.id:a.data()[key],second=key==='__name__'?b.id:b.data()[key];
   return (first<second?-1:first>second?1:0)*(direction==='desc'?-1:1);
  });
  if(query.after){const offset=docs.findIndex(doc=>doc.id===(query.after.id||query.after));docs=docs.slice(offset+1);}
  if(query.maximum!==undefined)docs=docs.slice(0,query.maximum);
  return {docs,size:docs.length,empty:docs.length===0};
 };
 const collection=(path,options={})=>{
  const query={path,isQuery:true,filters:[],orders:[],...options};
  return {...query,doc:id=>reference(path+'/'+(id||'generated-'+ ++generatedId)),get:async()=>{reads.push(path);return querySnapshot(query);},
   where:(key,operator,value)=>{assert.equal(operator,'==');return collection(path,{...query,filters:[...query.filters,[key,value]]});},
   orderBy:(key,direction='asc')=>collection(path,{...query,orders:[...query.orders,[key,direction]]}),
   limit:maximum=>collection(path,{...query,maximum}),startAfter:after=>collection(path,{...query,after})};
 };
 const db={collection,async runTransaction(run){
  const pending=[];
  const tx={
   get:async target=>{assert.equal(pending.length,0,'all transaction reads precede writes');reads.push(target.path);return target.isQuery?querySnapshot(target):snapshot(target.path);},
   set:(ref,value,options={})=>pending.push({type:'set',path:ref.path,value:clone(value),merge:!!options.merge}),
   create:(ref,value)=>pending.push({type:'create',path:ref.path,value:clone(value)}),
   update:(ref,value)=>pending.push({type:'update',path:ref.path,value:clone(value)}),
   delete:ref=>pending.push({type:'delete',path:ref.path})
  };
  const result=await run(tx);
  for(const write of pending){
   if(write.type==='create')assert.equal(records.has(write.path),false);
   if(write.type==='update')assert.equal(records.has(write.path),true);
   if(write.type==='delete')records.delete(write.path);
   else records.set(write.path,write.merge||write.type==='update'?{...records.get(write.path),...write.value}:write.value);
   writes.push(write);
  }
  return result;
 }};
 records.set('martini_v2_admins/owner',{role:'owner',displayName:'가상 운영진',active:true,expiresAt:time(10*86400000)});
 records.set('martini_v2_settings/club',{semester:'2026-2',contact:'테스트 운영진'});
 records.set('martini_v2_semesters/2026-2/members/'+member.id,{...member});
 records.set('martini_v2_memberSessions/'+hash(sessionKey),{memberId:member.id,semester:member.semester,identityHash:fingerprint,expiresAt:Timestamp.fromMillis(START+86400000)});
 for(const [id,key] of Object.entries(eventKeys)){
  records.set('martini_v2_events/'+id,{...eventInput(),id,title:id,revision:1,registered:applications?1:0,waiting:0,sequence:applications?1:0,linkHash:hash(key),createdAt:stamp,updatedAt:stamp,...(id==='legacy-event'?{}:{memberVisible:id==='public-event'})});
  if(applications)records.set('martini_v2_applications/'+appId(id),{id:appId(id),eventId:id,eventTitle:id,memberId:member.id,memberIdentityHash:fingerprint,name:member.name,semester:member.semester,status:'registered',payment:'unpaid',fee:1000,paidAmount:0,refundAmount:0,attendance:'absent',answers:[],receiptHash:hash(receiptKeys[id]),requestId:'request-'+id,sequence:1,policy:'취소 안내',createdAt:stamp,updatedAt:stamp});
 }
 const service=createService(db,()=>START);
 return {records,reads,writes,handle:(payload,context=memberContext)=>service.handle(payload,context),event:id=>clone(records.get('martini_v2_events/'+id)),application:id=>clone(records.get('martini_v2_applications/'+appId(id)))};
}

test('new events are public by default and explicit private creation remains private',async()=>{
 for(const visibility of [undefined,true,false]){
  const f=fixture();
  const saved=await f.handle({op:'saveEvent',...eventInput(visibility===undefined?{}:{memberVisible:visibility})},owner);
  assert.equal(saved.memberVisible,visibility!==false);
  assert.equal(f.event(saved.id).memberVisible,visibility!==false);
  assert.ok(f.writes.some(write=>write.path.startsWith('martini_v2_audit/')));
 }
});

test('visibility changes persist across old-client edits and can be explicitly reenabled',async()=>{
 const f=fixture();
 let saved=await f.handle({op:'saveEvent',...eventInput({id:'public-event',revision:1,memberVisible:false})},owner);
 assert.equal(saved.memberVisible,false);
 saved=await f.handle({op:'saveEvent',...eventInput({id:'public-event',revision:saved.revision,title:'제목만 수정'})},owner);
 assert.equal(saved.memberVisible,false,'Omitting the new field must not reveal a hidden event');
 saved=await f.handle({op:'saveEvent',...eventInput({id:'public-event',revision:saved.revision,memberVisible:true})},owner);
 assert.equal(saved.memberVisible,true);
 const legacy=await f.handle({op:'saveEvent',...eventInput({id:'legacy-event',revision:1})},owner);
 assert.equal(legacy.memberVisible,true,'Existing records without a flag retain public behavior');
});

test('invalid visibility values and stale edits cannot accidentally republish a hidden event',async()=>{
 const f=fixture(),before=f.event('private-event');
 for(const memberVisible of ['false','true',0,1,null,{}]){
  await assert.rejects(f.handle({op:'saveEvent',...eventInput({id:'private-event',revision:1,memberVisible})},owner),code('invalid-argument'));
  assert.deepEqual(f.event('private-event'),before);
 }
 await assert.rejects(f.handle({op:'saveEvent',...eventInput({id:'private-event',revision:0,memberVisible:true})},owner),code('aborted'));
 assert.deepEqual(f.event('private-event'),before);
 assert.deepEqual(f.writes,[]);
});

test('member lounge event lists omit hidden events while existing unflagged events remain public',async()=>{
 const f=fixture(),result=await f.handle({op:'memberPortal',sessionKey});
 assert.deepEqual(result.events.map(event=>event.id).sort(),['legacy-event','public-event']);
 assert.ok(result.events.every(event=>event.memberVisible===true));
 assert.equal(result.events.some(event=>event.title==='private-event'),false);
 assert.equal(f.event('private-event').memberVisible,false);
});

test('member application history retains unlisted events and existing registrations',async()=>{
 const f=fixture(),result=await f.handle({op:'memberApplications',sessionKey});
 assert.deepEqual(result.applications.map(row=>row.event.id).sort(),['legacy-event','private-event','public-event']);
 assert.equal(result.applications.some(row=>row.application.eventTitle==='private-event'),true);
 assert.equal(f.application('private-event').status,'registered');
 assert.equal(f.writes.filter(write=>!write.path.startsWith('martini_v2_rateLimits/')).length,0);
});

test('unlisted events require a share key while listed events also allow session access',async()=>{
 for(const id of Object.keys(eventKeys)){
  const f=fixture();
  for(const input of [{op:'memberEventAccess',eventId:id,sessionKey},{op:'eventAccess',eventId:id,key:eventKeys[id]},{op:'resolveLink',kind:'e',key:eventKeys[id]}]){
   if(id==='private-event'&&input.op==='memberEventAccess')await assert.rejects(f.handle(input),code('not-found'));
   else assert.equal((await f.handle(input)).id,id);
  }
 }
});

test('owners can view and manage their applications for unlisted events',async()=>{
 for(const action of ['get','payment','cancel','accept','decline']){
  const f=fixture(),id=appId('private-event');
  if(['accept','decline'].includes(action))f.records.set('martini_v2_applications/'+id,{...f.application('private-event'),status:'offered',offerExpiresAt:time(3600000)});
  const result=await f.handle({op:'memberApplication',sessionKey,id,action});
  assert.equal(result.event.id,'private-event');
  assert.equal(result.application.status,['cancel','decline'].includes(action)?'cancelled':'registered');
  assert.equal(result.application.payment,action==='payment'?'requested':'unpaid');
 }
 for(const id of ['public-event','private-event','legacy-event']){
  const f=fixture(),result=await f.handle({op:'memberApplication',sessionKey,id:appId(id),action:'get'});
  assert.equal(result.event.id,id);
  assert.equal(result.application.id,appId(id));
 }
});

test('unlisted registrations require a valid link while listed events accept either access mode',async()=>{
 for(const mode of ['session','legacy'])for(const id of Object.keys(eventKeys)){
  const f=fixture({applications:false}),before=f.event(id);
  const input={op:'apply',eventId:id,answers:[],consent:true,requestId:'new-'+mode,receiptKey:'9'.repeat(64),...(mode==='session'?{sessionKey}:{key:eventKeys[id],name:member.name,studentId:member.studentId})};
  if(id==='private-event'&&mode==='session'){
   await assert.rejects(f.handle(input),code('not-found'));
   assert.deepEqual(f.event(id),before);
   assert.equal(f.application(id),undefined);
   assert.equal(f.writes.filter(write=>!write.path.startsWith('martini_v2_rateLimits/')).length,0);
  }else{
   const result=await f.handle(input);
   assert.equal(result.status,'registered');
   assert.equal(f.event(id).registered,1);
   assert.equal(f.application(id).memberId,member.id);
  }
 }
});

test('visibility changes affect lounge lists immediately while preserving personal history and share links',async()=>{
 const f=fixture(),before=f.application('private-event');
 await f.handle({op:'saveEvent',...eventInput({id:'private-event',revision:1,memberVisible:true})},owner);
 assert.ok((await f.handle({op:'memberPortal',sessionKey})).events.some(event=>event.id==='private-event'));
 assert.ok((await f.handle({op:'memberApplications',sessionKey})).applications.some(row=>row.event.id==='private-event'));
 assert.equal((await f.handle({op:'memberEventAccess',sessionKey,eventId:'private-event'})).id,'private-event');
 await f.handle({op:'saveEvent',...eventInput({id:'private-event',revision:2,memberVisible:false})},owner);
 assert.ok(!(await f.handle({op:'memberPortal',sessionKey})).events.some(event=>event.id==='private-event'));
 assert.ok((await f.handle({op:'memberApplications',sessionKey})).applications.some(row=>row.event.id==='private-event'));
 assert.equal((await f.handle({op:'eventAccess',eventId:'private-event',key:eventKeys['private-event']})).id,'private-event');
 assert.deepEqual(f.application('private-event'),before);
});

test('administrative event and participant reads retain private events',async()=>{
 const f=fixture();
 const all=await f.handle({op:'read',kind:'events'},owner);
 assert.equal(all.rows.length,3);
 assert.equal(all.rows.find(event=>event.id==='private-event').memberVisible,false);
 const detail=await f.handle({op:'read',kind:'events',recordId:'private-event'},owner);
 assert.equal(detail.rows[0].id,'private-event');
 const participants=await f.handle({op:'read',kind:'applications',eventId:'private-event'},owner);
 assert.equal(participants.rows[0].id,appId('private-event'));
});

test('existing private receipt holders retain their receipt link and cancellation workflow',async()=>{
 const f=fixture(),key=receiptKeys['private-event'],id=appId('private-event');
 assert.deepEqual(await f.handle({op:'resolveLink',kind:'r',key}),{id});
 const result=await f.handle({op:'receipt',id,key,action:'get'});
 assert.equal(result.event.id,'private-event');
 assert.equal(result.application.id,id);
 assert.equal(result.event.memberVisible,false);
 assert.deepEqual(await f.handle({op:'receipt',id,key,action:'cancel'}),{saved:true});
 assert.equal(f.application('private-event').status,'cancelled');
 assert.equal(f.event('private-event').registered,0);
 await assert.rejects(f.handle({op:'receipt',id,key:'0'.repeat(64),action:'get'}),code('not-found'));
});

test('unlisted link reissue invalidates old keys without publishing or changing receipts',async()=>{
 const f=fixture(),id='private-event',oldKey=eventKeys[id],before=f.application(id);
 const rotated=await f.handle({op:'rotateEventLink',id,revision:1},owner);
 assert.equal(f.event(id).memberVisible,false);
 for(const input of [{op:'resolveLink',kind:'e',key:oldKey},{op:'eventAccess',eventId:id,key:oldKey}])await assert.rejects(f.handle(input),code('not-found'));
 assert.equal((await f.handle({op:'resolveLink',kind:'e',key:rotated.linkKey})).id,id);
 assert.equal((await f.handle({op:'eventAccess',eventId:id,key:rotated.linkKey})).id,id);
 await assert.rejects(f.handle({op:'rotateEventLink',id,revision:1},owner),code('aborted'));
 assert.equal((await f.handle({op:'receipt',id:appId(id),key:receiptKeys[id]})).application.id,appId(id));
 assert.deepEqual(f.application(id),before);
 assert.ok(!(await f.handle({op:'memberPortal',sessionKey})).events.some(event=>event.id===id));
 assert.ok(f.writes.some(write=>write.path.startsWith('martini_v2_audit/')));
});

test('unlisted links retain token, roster, status, and deletion checks',async()=>{
 for(const scenario of ['wrong-key','wrong-member','removed-member','draft','closed','deleted']){
  const f=fixture({applications:false}),id='private-event',input={op:'apply',eventId:id,key:eventKeys[id],name:member.name,studentId:member.studentId,answers:[],consent:true,requestId:'invalid-'+scenario,receiptKey:'9'.repeat(64)};
  if(scenario==='wrong-key')input.key='0'.repeat(64);
  if(scenario==='wrong-member')input.name='다른 부원';
  if(scenario==='removed-member')f.records.get('martini_v2_semesters/2026-2/members/'+member.id).removedAt=stamp;
  if(['draft','closed'].includes(scenario))f.records.get('martini_v2_events/'+id).status=scenario;
  if(scenario==='deleted')f.records.get('martini_v2_events/'+id).deletedAt=stamp;
  const before=f.event(id);
  await assert.rejects(f.handle(input),code(['wrong-key','draft','deleted'].includes(scenario)?'not-found':scenario==='closed'?'failed-precondition':'permission-denied'));
  assert.deepEqual(f.event(id),before);assert.equal(f.application(id),undefined);
 }
});

test('unlisted application history still requires ownership and a live member session',async()=>{
 for(const scenario of ['other-owner','changed-identity','deleted','anonymized','wrong-semester']){
  const f=fixture(),id=appId('private-event'),record=f.records.get('martini_v2_applications/'+id);
  if(scenario==='other-owner')record.memberId='someone-else';
  if(scenario==='changed-identity')record.memberIdentityHash='0'.repeat(64);
  if(scenario==='deleted')record.deletedAt=stamp;
  if(scenario==='anonymized')record.anonymizedAt=stamp;
  if(scenario==='wrong-semester')f.records.get('martini_v2_events/private-event').semester='2026-1';
  assert.ok(!(await f.handle({op:'memberApplications',sessionKey})).applications.some(row=>row.application.id===id));
  await assert.rejects(f.handle({op:'memberApplication',sessionKey,id}),code('not-found'));
 }
 const f=fixture();
 f.records.get('martini_v2_memberSessions/'+hash(sessionKey)).expiresAt=Timestamp.fromMillis(START-1);
 await assert.rejects(f.handle({op:'memberApplication',sessionKey,id:appId('private-event')}),code('unauthenticated'));
});
