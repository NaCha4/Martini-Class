import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { hash,identity } from '../functions/src/domain.js';

process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const projectId='demo-martini-portal-tests';
if(!projectId.startsWith('demo-'))throw Error('Tests are emulator-only');
const app=initializeApp({projectId},'member-portal-tests'),db=getFirestore(app);
const baseline=Date.now();let now=baseline;
const stamp=()=>new Date(now).toISOString(),time=ms=>new Date(now+ms).toISOString();
const service=createService(db,()=>now),owner={uid:'owner',ip:'owner'},guest={ip:'guest'};
const session='a'.repeat(64),otherSession='b'.repeat(64),receiptKey='c'.repeat(64);
const ref=(kind,id)=>db.doc('martini_v2_'+kind+'/'+id);
const memberRef=id=>ref('semesters','2026-2').collection('members').doc(id);
const person=(id=1)=>({name:'가상부원 '+id,studentId:'20260000'+id,phone:'0100000000'+id});
const access=(id=1,sessionKey=session,extra={})=>service.handle({op:'memberAccess',...person(id),sessionKey,...extra},{ip:'access-'+id});
const visit=(extra={})=>({op:'submitClubRequest',kind:'visit',requestId:'visit-one',receiptKey,consent:true,sessionKey:session,startsAt:time(3600000),endsAt:time(7200000),guestCount:2,guestNames:'가상 방문자 1, 가상 방문자 2',purpose:'동아리 교류 미팅',...extra});
const join=(extra={})=>({op:'submitClubRequest',kind:'join',requestId:'join-one',receiptKey,consent:true,...person(3),department:'가상학과',grade:'1',message:'가입을 희망합니다.',...extra});
const inquiry=(extra={})=>({op:'submitClubRequest',kind:'inquiry',requestId:'inquiry-one',receiptKey,consent:true,...person(3),subject:'운영 시간 문의',message:'방문 가능한 시간을 알려 주세요.',...extra});
const command=(id,action,extra={})=>service.handle({op:'clubRequestCommand',id,revision:1,action,response:action==='approve'?'':'운영진 답변',...extra},owner);
const lookup=id=>service.handle({op:'clubRequestReceipt',id,receiptKey},guest);
const cancel=id=>service.handle({op:'cancelClubRequest',id,receiptKey},guest);

beforeEach(async()=>{
 now=baseline;
 const response=await fetch('http://127.0.0.1:8080/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
 const batch=db.batch();
 batch.set(ref('settings','club'),{semester:'2026-2'});
 for(const role of ['owner','chair','execution','finance','education','publicity'])batch.set(ref('admins',role),{role,active:true,displayName:role,expiresAt:time(864000000)});
 for(const id of [1,2])batch.set(memberRef('member-'+id),{...person(id),identityHash:identity(person(id).studentId,person(id).phone),revision:1});
 batch.set(ref('events','event-one'),{id:'event-one',semester:'2026-2',title:'가상 현재 행사',description:'진행 행사',status:'open',startsAt:time(3600000),endsAt:time(7200000),opensAt:time(-3600000),closesAt:time(1800000),cancelUntil:time(1800000),capacity:10,registered:0,waiting:0,waitlist:false,sequence:0,revision:1,fee:0,questions:[],policy:'행사 정책',linkHash:hash('d'.repeat(64)),owner:'private-owner',note:'private-note'});
 await batch.commit();
});
after(()=>deleteApp(app));

test('member access validates all identity fields and stores only a hashed 2-hour capability',async()=>{
 const result=await access(1,session,{phone:'010-0000-0001'});
 assert.deepEqual(result.member,{name:person().name,semester:'2026-2'});
 assert.equal(Date.parse(result.expiresAt)-now,7200000);
 const stored=(await ref('memberSessions',hash(session)).get()).data();
 assert.equal(stored.memberId,'member-1');assert.equal(stored.expiresAt.toMillis(),now+7200000);
 const serialized=JSON.stringify(stored);for(const value of [session,person().name,person().studentId,person().phone])assert.equal(serialized.includes(value),false);
 await assert.rejects(access(1,'1'.repeat(64),{name:'다른 사람'}),e=>e.code==='permission-denied');
 await assert.rejects(access(1,'2'.repeat(64),{phone:person(2).phone}),e=>e.code==='permission-denied');
 await assert.rejects(access(2,session),e=>e.code==='already-exists');
});

test('expired, changed, removed and anonymized membership invalidates access and sessions',async()=>{
 await access();now+=7200001;
 await assert.rejects(service.handle({op:'memberPortal',sessionKey:session},guest),e=>e.code==='unauthenticated');
 now=baseline;await memberRef('member-1').update({phone:'01099999999'});
 await assert.rejects(service.handle({op:'memberPortal',sessionKey:session},guest),e=>e.code==='permission-denied');
 await memberRef('member-1').update({phone:person().phone,removedAt:stamp()});
 await assert.rejects(access(1,'3'.repeat(64)),e=>e.code==='permission-denied');
 await assert.rejects(service.handle(visit(),guest),e=>e.code==='permission-denied');
 await memberRef('member-2').update({anonymizedAt:stamp()});
 await assert.rejects(access(2,otherSession),e=>e.code==='permission-denied');
});

test('current semester changes and explicitly inactive legacy members cannot pass verification',async()=>{
 await memberRef('member-2').update({status:'inactive'});
 await assert.rejects(access(2,otherSession),e=>e.code==='permission-denied');
 await access();await ref('settings','club').update({semester:'2027-1'});
 await assert.rejects(service.handle({op:'memberPortal',sessionKey:session},guest),e=>e.code==='unauthenticated');
});

test('reassigning a roster row does not expose the old applicant history or authorize an old visit',async()=>{
 await access();await service.handle(visit(),guest);
 await memberRef('member-1').update({...person(3),identityHash:identity(person(3).studentId,person(3).phone)});
 await assert.rejects(service.handle({op:'memberPortal',sessionKey:session},guest),e=>e.code==='permission-denied');
 await access(3,otherSession);
 assert.deepEqual((await service.handle({op:'memberPortal',sessionKey:otherSession},guest)).requests,[]);
 await assert.rejects(command('visit-one','approve'),e=>e.code==='failed-precondition');
 assert.equal((await lookup('visit-one')).request.name,person().name);
 assert.equal((await command('visit-one','reject')).request.status,'rejected');
});

test('portal returns only current live public event fields and requests owned by this verified member',async()=>{
 await access();await access(2,otherSession);
 await service.handle(visit(),guest);
 await service.handle(visit({requestId:'other-visit',sessionKey:otherSession,receiptKey:'e'.repeat(64)}),{ip:'other'});
 for(const [id,patch] of Object.entries({draft:{status:'draft'},cancelled:{status:'cancelled'},completed:{status:'completed'},old:{semester:'2026-1'},ended:{endsAt:time(-1000)},deleted:{deletedAt:stamp()}}))await ref('events',id).set({...((await ref('events','event-one').get()).data()),...patch,id});
 const portal=await service.handle({op:'memberPortal',sessionKey:session},guest);
 assert.deepEqual(portal.events.map(row=>row.eventId),['event-one']);assert.deepEqual(portal.requests.map(row=>row.id),['visit-one']);
 assert.equal(portal.events[0].linkHash,undefined);assert.equal(portal.events[0].owner,undefined);assert.equal(portal.events[0].note,undefined);
 for(const field of ['receiptHash','payloadHash','memberScope','memberId','decidedBy'])assert.equal(portal.requests[0][field],undefined);
 await assert.rejects(service.handle({op:'clubRequestReceipt',id:'other-visit',receiptKey},guest),e=>e.code==='not-found');
});

test('member event access and applications work without revealing or rotating the event link',async()=>{
 await access();const event=await service.handle({op:'memberEventAccess',eventId:'event-one',sessionKey:session},guest);
 assert.equal(event.id,'event-one');assert.equal(event.linkHash,undefined);
 const payload={op:'apply',eventId:'event-one',sessionKey:session,...person(),answers:[],consent:true,requestId:'event-request',receiptKey};
 await assert.rejects(service.handle({...payload,...person(2)},guest),e=>e.code==='permission-denied');
 const applied=await service.handle(payload,guest);assert.equal(applied.status,'registered');
 assert.equal((await ref('events','event-one').get()).data().linkHash,hash('d'.repeat(64)));
 await assert.rejects(service.handle({...payload,key:'d'.repeat(64)},guest),e=>e.code==='invalid-argument');
 await ref('events','event-one').update({status:'draft'});
 await assert.rejects(service.handle({op:'memberEventAccess',eventId:'event-one',sessionKey:session},guest),e=>e.code==='not-found');
});

test('strict request schemas reject unverified visits, spoofed identities and unsafe visit times',async()=>{
 const {sessionKey:unused,...anonymous}=visit();await assert.rejects(service.handle(anonymous,guest),e=>e.code==='invalid-argument');
 await access();
 for(const extra of [{startsAt:time(-1)},{startsAt:time(91*86400000),endsAt:time(91*86400000+3600000)},{endsAt:time(3600000)},{endsAt:time(14*3600000)},{guestCount:0},{guestCount:21},{guestCount:1.5},{purpose:''},{name:'위조된 이름'}])await assert.rejects(service.handle(visit(extra),{ip:'invalid-'+JSON.stringify(extra)}),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(join({consent:false}),guest),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(inquiry({sessionKey:session}),guest),e=>e.code==='invalid-argument');
});

test('concurrent duplicate submissions are idempotent and changed payload or receipt is rejected',async()=>{
 await access();const payload=visit();
 const result=await Promise.all([service.handle(payload,guest),service.handle(payload,guest)]);
 assert.ok(result.every(row=>row.id==='visit-one'));assert.equal((await db.collection('martini_v2_clubRequests').get()).size,1);
 await assert.rejects(service.handle(visit({purpose:'변경한 목적'}),guest),e=>e.code==='already-exists');
 await assert.rejects(service.handle(visit({receiptKey:'f'.repeat(64)}),guest),e=>e.code==='already-exists');
 const stored=(await ref('clubRequests','visit-one').get()).data();assert.equal(stored.receiptHash,hash(receiptKey));assert.equal(stored.sessionKey,undefined);assert.equal(stored.receiptKey,undefined);
 await command('visit-one','approve');assert.equal((await service.handle(payload,guest)).status,'approved');
});

test('admin request read and decisions require current members management scope',async()=>{
 await service.handle(join(),guest);
 for(const op of [{op:'clubRequests'},{op:'clubRequestCommand',id:'join-one',revision:1,action:'approve'}]){
  await assert.rejects(service.handle(op,guest),e=>e.code==='unauthenticated');
  for(const uid of ['education','publicity'])await assert.rejects(service.handle(op,{uid}),e=>e.code==='permission-denied');
 }
 for(const uid of ['owner','chair','execution','finance'])assert.equal((await service.handle({op:'clubRequests'},{uid})).rows.length,1);
 await ref('admins','finance').update({expiresAt:time(-1)});
 await assert.rejects(service.handle({op:'clubRequests'},{uid:'finance'}),e=>e.code==='permission-denied');
 assert.equal((await service.handle({op:'clubRequests'},owner)).rows[0].receiptHash,undefined);
});

test('visit approvals and rejections persist revision, safe response and free-text-free audit decisions',async()=>{
 await access();await service.handle(visit(),guest);
 const approved=await command('visit-one','approve',{response:'등록된 방문자와 함께 입장해 주세요.'});assert.equal(approved.request.status,'approved');assert.equal(approved.request.revision,2);
 await service.handle(visit({requestId:'visit-two'}),guest);
 await assert.rejects(command('visit-two','reject',{response:''}),e=>e.code==='invalid-argument');
 assert.equal((await command('visit-two','reject',{response:'사용 일정이 겹칩니다.'})).request.status,'rejected');
 assert.equal((await lookup('visit-two')).request.response,'사용 일정이 겹칩니다.');
 const audit=(await db.collection('martini_v2_audit').where('entityType','==','clubRequests').get()).docs.map(doc=>doc.data());
 assert.deepEqual(audit.map(row=>row.action).sort(),['approve','reject']);assert.equal(JSON.stringify(audit).includes('사용 일정'),false);
});

test('stale concurrent decisions cannot overwrite the first terminal decision',async()=>{
 await service.handle(join(),guest);
 const results=await Promise.allSettled([command('join-one','approve'),command('join-one','reject')]);
 assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
 assert.equal(results.find(row=>row.status==='rejected').reason.code,'aborted');
 assert.equal((await ref('clubRequests','join-one').get()).data().revision,2);
 await assert.rejects(command('join-one','approve',{revision:2}),e=>e.code==='failed-precondition');
 assert.equal((await db.collection('martini_v2_audit').get()).size,1);
 assert.equal((await memberRef('member-3').get()).exists,false);
});

test('inquiries support public or authenticated applicants and only permit a nonempty reply',async()=>{
 await service.handle(inquiry(),guest);await access();
 await service.handle({op:'submitClubRequest',kind:'inquiry',requestId:'member-inquiry',receiptKey,consent:true,sessionKey:session,subject:'부원 문의',message:'행사에 대해 문의합니다.'},guest);
 await assert.rejects(command('inquiry-one','approve'),e=>e.code==='invalid-argument');
 await assert.rejects(command('inquiry-one','reply',{response:''}),e=>e.code==='invalid-argument');
 assert.equal((await command('inquiry-one','reply')).request.status,'answered');
 assert.equal((await lookup('inquiry-one')).request.response,'운영진 답변');
 assert.deepEqual((await service.handle({op:'memberPortal',sessionKey:session},guest)).requests.map(row=>row.id),['member-inquiry']);
});

test('receipt capabilities isolate requests and cancellation is atomic and idempotent',async()=>{
 await access();await service.handle(visit(),guest);
 await assert.rejects(service.handle({op:'clubRequestReceipt',id:'visit-one',receiptKey:'e'.repeat(64)},guest),e=>e.code==='not-found');
 await assert.rejects(service.handle({op:'cancelClubRequest',id:'visit-one',receiptKey:'e'.repeat(64)},guest),e=>e.code==='not-found');
 await command('visit-one','approve');
 const results=await Promise.all([cancel('visit-one'),cancel('visit-one')]);assert.ok(results.every(row=>row.request.status==='cancelled'));
 assert.equal((await ref('clubRequests','visit-one').get()).data().revision,3);
 await service.handle(join(),guest);assert.equal((await cancel('join-one')).request.status,'cancelled');
 await service.handle(inquiry(),guest);await command('inquiry-one','reply');await assert.rejects(cancel('inquiry-one'),e=>e.code==='failed-precondition');
});

test('past visits and members removed after submission cannot receive an approval',async()=>{
 await access();await service.handle(visit(),guest);now+=3600001;
 await assert.rejects(command('visit-one','approve'),e=>e.code==='failed-precondition');
 await assert.rejects(cancel('visit-one'),e=>e.code==='failed-precondition');
 now=baseline;await memberRef('member-1').update({removedAt:stamp()});
 await assert.rejects(command('visit-one','approve'),e=>e.code==='failed-precondition');
 assert.equal((await command('visit-one','reject')).request.status,'rejected');
});

test('retention metadata follows the consent periods without deleting any records',async()=>{
 await access();const visitInput=visit();const savedVisit=await service.handle(visitInput,guest);
 assert.equal(Date.parse(savedVisit.request.retentionUntil),Date.parse(visitInput.endsAt)+180*86400000);
 assert.equal((await service.handle(join(),guest)).request.retentionUntil,null);
 assert.equal((await service.handle(inquiry(),guest)).request.retentionUntil,null);
 assert.equal(Date.parse((await command('join-one','approve')).request.retentionUntil),now+365*86400000);
 assert.equal(Date.parse((await command('inquiry-one','reply')).request.retentionUntil),now+180*86400000);
 now+=60000;assert.equal(Date.parse((await cancel('visit-one')).request.retentionUntil),now+180*86400000);
 assert.equal((await db.collection('martini_v2_clubRequests').get()).size,3);
});

test('identity guessing is throttled across IP addresses and receipt guesses are bounded',async()=>{
 for(let i=0;i<8;i++)await assert.rejects(service.handle({op:'memberAccess',...person(),phone:'01099999999',sessionKey:hash('guess-'+i)},{ip:'ip-'+i}),e=>e.code==='permission-denied');
 await assert.rejects(access(),e=>e.code==='resource-exhausted');
 await service.handle(join(),guest);
 for(let i=0;i<20;i++)await assert.rejects(service.handle({op:'clubRequestReceipt',id:'join-one',receiptKey:hash('wrong-'+i)},{ip:'receipt-ip-'+i}),e=>e.code==='not-found');
 await assert.rejects(lookup('join-one'),e=>e.code==='resource-exhausted');
});
