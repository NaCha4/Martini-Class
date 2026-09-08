import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { identity,hash } from '../functions/src/domain.js';
import { initializeTestEnvironment,assertFails } from '@firebase/rules-unit-testing';
import { doc,getDoc,setDoc } from 'firebase/firestore';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const projectId='demo-martini-tests';
if(!projectId.startsWith('demo-'))throw Error('Tests are emulator-only');
const app=initializeApp({projectId},'integration'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),time=ms=>new Date(now+ms).toISOString(),service=createService(db,()=>now);
const owner={uid:'owner',ip:'local-owner'},finance={uid:'finance',ip:'local-finance'},education={uid:'education',ip:'local-education'};
const meta={revision:1,createdAt:stamp,updatedAt:stamp,createdBy:'owner',updatedBy:'owner'};
const event={...meta,id:'event-one',title:'가상 교육',type:'class',description:'테스트',location:'동아리방',startsAt:time(86400000),endsAt:time(90000000),opensAt:time(-1000),closesAt:time(80000000),cancelUntil:time(80000000),capacity:1,fee:0,waitlist:true,status:'open',semester:'2026-2',questions:[],policy:'테스트 정책',paymentInstructions:'',owner:'교육부',registered:0,waiting:0,sequence:0,linkHash:hash('a'.repeat(64))};
const member=i=>({...meta,id:'member-'+i,name:'가상부원 '+i,studentId:'20260000'+i,phone:'0100000000'+i,college:'가상',department:'가상학과',grade:'1',gender:'',semester:'2026-2',status:'active',duesPaid:i!==8,identityHash:identity('20260000'+i,'0100000000'+i)});
const application=(i,extra={})=>({op:'apply',eventId:event.id,key:'a'.repeat(64),name:member(i).name,studentId:member(i).studentId,phone:member(i).phone,answers:[],consent:true,requestId:'request-'+i,receiptKey:String(i).repeat(64),...extra});
beforeEach(async()=>{
 const response=await fetch('http://127.0.0.1:8080/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
 const batch=db.batch();
 for(const role of ['owner','finance','education'])batch.set(db.doc('martini_v2_admins/'+role),{role,active:true,displayName:role,expiresAt:time(864000000),updatedAt:stamp});
 batch.set(db.doc('martini_v2_settings/club'),{...meta,id:'club',semester:'2026-2',contact:'가상 문의',privacy:'가상 안내',duesAmount:30000});
 batch.set(db.doc('martini_v2_events/'+event.id),event);
 for(let i=1;i<=8;i++)batch.set(db.doc('martini_v2_members/member-'+i),member(i));
 batch.set(db.doc('martini_v2_inventory/gin'),{...meta,id:'gin',name:'가상 진',category:'spirit',unit:'bottle',size:700,location:'A',minimum:0,note:'',quantity:2,bottles:{}});
 await batch.commit();
});
after(async()=>{await deleteApp(app);});
test('simultaneous last-seat submissions never overbook; duplicate retry does not count twice',async()=>{
 const results=await Promise.all(Array.from({length:6},(_,i)=>service.handle(application(i+1),{ip:'member-'+i})));
 assert.equal(results.filter(r=>r.status==='registered').length,1);
 assert.equal(results.filter(r=>r.status==='waiting').length,5);
 const e=(await db.doc('martini_v2_events/'+event.id).get()).data();assert.equal(e.registered,1);assert.equal(e.waiting,5);
 const retry=await service.handle(application(1),{ip:'member-0'});assert.equal(retry.id,results[0].id);
 assert.equal((await db.collection('martini_v2_applications').get()).size,6);
});
test('unpaid and forged identity fail with generic eligibility message, links do not expose roster',async()=>{
 await assert.rejects(service.handle(application(8),{ip:'unpaid'}),e=>e.code==='permission-denied');
 await assert.rejects(service.handle(application(1,{name:'다른 사람'}),{ip:'forged'}),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'eventAccess',eventId:event.id,key:'b'.repeat(64)},{ip:'wrong-key'}),e=>e.code==='not-found');
 const e=await service.handle({op:'eventAccess',eventId:event.id,key:'a'.repeat(64)},{ip:'valid-key'});assert.equal('linkHash' in e,false);assert.equal('members' in e,false);
});
test('receipt capability guards private record and cancellation releases exactly one seat',async()=>{
 const a=await service.handle(application(1),{ip:'member'});
 await assert.rejects(service.handle({op:'receipt',id:a.id,key:'2'.repeat(64),action:'get'},{ip:'wrong'}),e=>e.code==='not-found');
 await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'cancel'},{ip:'member'});
 await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'cancel'},{ip:'member'});
 assert.equal((await db.doc('martini_v2_events/'+event.id).get()).data().registered,0);
});
test('waitlist order, reservation acceptance and late expiry are enforced',async()=>{
 const first=await service.handle(application(1),{ip:'1'}),second=await service.handle(application(2),{ip:'2'}),third=await service.handle(application(3),{ip:'3'});
 await service.handle({op:'receipt',id:first.id,key:'1'.repeat(64),action:'cancel'},{ip:'1'});
 await assert.rejects(service.handle({op:'applicationCommand',id:third.id,action:'offer',offerExpiresAt:time(3600000),reason:'시험'},owner),e=>e.code==='failed-precondition');
 await service.handle({op:'applicationCommand',id:second.id,action:'offer',offerExpiresAt:time(3600000),reason:'시험'},owner);
 await assert.rejects(service.handle({op:'applicationCommand',id:second.id,action:'expire',reason:'아직 기한 전'},owner),e=>e.code==='failed-precondition');
 await service.handle({op:'receipt',id:second.id,key:'2'.repeat(64),action:'accept'},{ip:'2'});
 assert.equal((await db.doc('martini_v2_events/'+event.id).get()).data().registered,1);
 assert.equal((await db.doc('martini_v2_applications/'+second.id).get()).data().status,'registered');
});
test('unlisted accounts and wrong departments cannot read or mutate administrative data',async()=>{
 await assert.rejects(service.handle({op:'read',kind:'members'},{uid:'outsider'}),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'read',kind:'members'},education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'read',kind:'finance'},education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'read',kind:'members'},{}),e=>e.code==='unauthenticated');
});
test('meeting and decision revisions persist; stale edit is rejected',async()=>{
 const input={op:'saveMeeting',revision:0,title:'운영회의',date:stamp,location:'동아리방',attendees:['교육부'],status:'draft',semester:'2026-2',body:'첫 기록',agendas:[{id:'agenda-1',title:'교육 운영',notes:'논의 중',status:'planned'}]};
 const one=await service.handle(input,owner);
 const two=await service.handle({...input,id:one.id,revision:1,body:'두 번째 기록'},education);
 assert.equal(two.revision,2);assert.equal((await db.doc('martini_v2_meetings/'+one.id).collection('revisions').get()).size,2);
 await assert.rejects(service.handle({...input,id:one.id,revision:1,body:'덮어쓰기 시도'},owner),e=>e.code==='aborted');
 const decision=await service.handle({op:'saveDecision',revision:0,title:'교육부 재료 확인',body:'필요량 정리',type:'action',meetingId:one.id,agendaId:'agenda-1',owner:'교육부',dueAt:time(86400000),status:'in_progress',semester:'2026-2'},owner);
 assert.equal((await db.doc('martini_v2_decisions/'+decision.id).get()).data().meetingId,one.id);
 assert.equal((await db.doc('martini_v2_decisions/'+decision.id).collection('revisions').get()).size,1);
});
test('stock request retries are idempotent and stale revisions do not overwrite quantity',async()=>{
 const input={op:'stock',id:'gin',revision:1,requestId:'open-one',action:'open',amount:0,reason:'교육 준비',eventId:event.id};
 const opened=await service.handle(input,education);assert.equal(opened.quantity,1);
 await service.handle(input,education);assert.equal((await db.doc('martini_v2_inventory/gin').get()).data().quantity,1);
 await assert.rejects(service.handle({...input,requestId:'other'},education),e=>e.code==='aborted');
 await service.handle({op:'stock',id:'gin',revision:2,requestId:'remaining-one',action:'remaining',amount:0,bottleId:'open-one',percent:60,reason:'교육 종료',eventId:event.id},education);
 assert.equal((await db.doc('martini_v2_inventory/gin').get()).data().bottles['open-one'],60);
});
test('payment and refunds reject excess amounts and duplicate ledger writes',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'1'});
 const pay={op:'finance',requestId:'pay-one',kind:'income',amount:10000,title:'참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:''};
 await service.handle(pay,finance);await service.handle(pay,finance);
 assert.equal((await db.doc('martini_v2_applications/'+a.id).get()).data().paidAmount,10000);
 assert.equal((await db.collection('martini_v2_finance').get()).size,1);
 await assert.rejects(service.handle({...pay,requestId:'pay-two'},finance),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({...pay,requestId:'refund-over',kind:'refund',amount:10001},finance),e=>e.code==='failed-precondition');
 await service.handle({...pay,requestId:'refund-one',kind:'refund',amount:4000},finance);
 assert.equal((await db.doc('martini_v2_applications/'+a.id).get()).data().payment,'partial');
});
test('direct client Firestore access fails for guests and password-authenticated accounts',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-martini-rules',firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
 try{
  const guest=env.unauthenticatedContext().firestore(),fakeAdmin=env.authenticatedContext('intruder',{firebase:{sign_in_provider:'password'}}).firestore();
  await assertFails(getDoc(doc(guest,'martini_v2_members/member-one')));
  await assertFails(setDoc(doc(guest,'martini_v2_applications/forged'),{status:'registered'}));
  await assertFails(setDoc(doc(fakeAdmin,'martini_v2_admins/intruder'),{role:'owner'}));
 }finally{await env.cleanup();}
});

test('new unpaid roster entries are allowed for execution; term rollover requires fresh dues verification',async()=>{
 await db.doc('martini_v2_admins/execution').set({role:'execution',active:true,displayName:'집행부',expiresAt:time(864000000)});
 const input={op:'saveMember',revision:0,name:'신규 가상',studentId:'202699999',phone:'01099999999',college:'',department:'',grade:'',gender:'',semester:'2026-2',status:'active',duesPaid:false};
 const result=await service.handle(input,{uid:'execution'});assert.equal(result.duesPaid,false);
 const current=member(1);delete current.id;delete current.identityHash;delete current.createdAt;delete current.updatedAt;delete current.createdBy;delete current.updatedBy;
 await assert.rejects(service.handle({op:'saveMember',...current,id:'member-1',semester:'2027-1'},owner),e=>e.code==='failed-precondition');
});
test('stocked units cannot change and meeting agenda links cannot be orphaned',async()=>{
 await assert.rejects(service.handle({op:'saveItem',id:'gin',revision:1,name:'가상 진',category:'spirit',unit:'bottle',size:1000,location:'A',minimum:0,note:''},owner),e=>e.code==='failed-precondition');
 const m={op:'saveMeeting',revision:0,title:'연결 시험',date:stamp,location:'',attendees:[],status:'draft',semester:'2026-2',body:'',agendas:[{id:'linked-agenda',title:'안건',notes:'',status:'planned'}]};
 const saved=await service.handle(m,owner);
 await service.handle({op:'saveDecision',revision:0,title:'결정',body:'',type:'decision',meetingId:saved.id,agendaId:'linked-agenda',owner:'',dueAt:'',status:'approved',semester:'2026-2'},owner);
 await assert.rejects(service.handle({...m,id:saved.id,revision:1,agendas:[]},owner),e=>e.code==='failed-precondition');
});
test('receipt reissue revokes the old link and contact access remains limited',async()=>{
 const a=await service.handle(application(1),{ip:'1'});
 const contact=await service.handle({op:'participantContact',id:a.id},education);assert.equal(contact.phone,member(1).phone);
 await db.doc('martini_v2_admins/publicity').set({role:'publicity',active:true,displayName:'홍보부',expiresAt:time(864000000)});
 await assert.rejects(service.handle({op:'participantContact',id:a.id},{uid:'publicity'}),e=>e.code==='permission-denied');
 const replacement=await service.handle({op:'rotateReceipt',id:a.id,reason:'가상 본인 확인'},owner);
 await assert.rejects(service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'get'},{ip:'old'}),e=>e.code==='not-found');
 assert.equal((await service.handle({op:'receipt',id:a.id,key:replacement.key,action:'get'},{ip:'new'})).application.id,a.id);
});

async function eventEditInput(changes={}) {
 const {registered,waiting,sequence,linkHash,createdAt,updatedAt,createdBy,updatedBy,...editable}=(await db.doc('martini_v2_events/'+event.id).get()).data();
 return {op:'saveEvent',...editable,...changes};
}
test('event cancellation closes every seat, preserves attendance and permits refunds only',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({capacity:2,fee:10000,paymentInstructions:'가상 납부'});
 const first=await service.handle(application(1),{ip:'1'}),second=await service.handle(application(2),{ip:'2'}),third=await service.handle(application(3),{ip:'3'}),fourth=await service.handle(application(4),{ip:'4'});
 const payment={op:'finance',requestId:'cancel-pay',kind:'income',amount:5000,title:'부분 입금',eventId:event.id,applicationId:first.id,memberId:'',semester:event.semester,note:''};
 await service.handle(payment,finance);
 await service.handle({op:'applicationCommand',id:first.id,action:'attendance',attendance:'present',reason:'출석'},owner);
 await service.handle({op:'receipt',id:second.id,key:'2'.repeat(64),action:'cancel'},{ip:'2'});
 await service.handle({op:'applicationCommand',id:third.id,action:'offer',offerExpiresAt:time(3600000),reason:'제안'},owner);
 await service.handle(await eventEditInput({status:'cancelled'}),owner);
 const stored=(await db.doc('martini_v2_events/'+event.id).get()).data();assert.equal(stored.registered,0);assert.equal(stored.waiting,0);
 for(const a of [first,second,third,fourth])assert.equal((await db.doc('martini_v2_applications/'+a.id).get()).data().status,'cancelled');
 const firstStored=(await db.doc('martini_v2_applications/'+first.id).get()).data();assert.equal(firstStored.payment,'refund_pending');assert.equal(firstStored.attendance,'present');
 await assert.rejects(service.handle({...payment,requestId:'late-pay',amount:1000},finance),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'applicationCommand',id:first.id,action:'attendance',attendance:'absent',reason:'취소 후 시도'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle(await eventEditInput({status:'open'}),owner),e=>e.code==='failed-precondition');
 await service.handle({...payment,requestId:'cancel-refund',kind:'refund'},finance);
 assert.equal((await db.doc('martini_v2_applications/'+first.id).get()).data().payment,'refunded');
});
test('manually confirmed dues can be entered once and retain their ledger link after editing',async()=>{
 const dues={op:'finance',requestId:'dues-once',kind:'dues',amount:30000,title:'학기 회비',eventId:'',applicationId:'',memberId:'member-1',semester:event.semester,note:''};
 await service.handle(dues,finance);await service.handle(dues,finance);
 await assert.rejects(service.handle({...dues,requestId:'dues-twice'},finance),e=>e.code==='already-exists');
 const ref=db.doc('martini_v2_members/member-1'),{identityHash,createdAt,updatedAt,createdBy,updatedBy,...editable}=(await ref.get()).data();
 await service.handle({op:'saveMember',...editable,grade:'2'},finance);
 assert.equal((await ref.collection('semesters').doc(event.semester).get()).data().duesTransactionId,'dues-once');
 await assert.rejects(service.handle({op:'saveMember',...editable,revision:editable.revision+1,duesPaid:false},finance),e=>e.code==='failed-precondition');
});
test('waitlist offers recheck eligibility and can be declined after the normal cancellation deadline',async()=>{
 const first=await service.handle(application(1),{ip:'1'}),second=await service.handle(application(2),{ip:'2'});
 await service.handle(application(3),{ip:'3'});await service.handle({op:'receipt',id:first.id,key:'1'.repeat(64),action:'cancel'},{ip:'1'});
 const ref=db.doc('martini_v2_members/member-2'),offer={op:'applicationCommand',id:second.id,action:'offer',offerExpiresAt:time(3600000),reason:'빈자리 안내'};
 await ref.update({status:'inactive'});await assert.rejects(service.handle(offer,owner),e=>e.code==='failed-precondition');
 await ref.update({status:'active'});await service.handle(offer,owner);
 await ref.update({duesPaid:false});await assert.rejects(service.handle({op:'receipt',id:second.id,key:'2'.repeat(64),action:'accept'},{ip:'2'}),e=>e.code==='permission-denied');
 await db.doc('martini_v2_events/'+event.id).update({cancelUntil:time(-1000)});
 const decline={op:'receipt',id:second.id,key:'2'.repeat(64),action:'decline'};
 await service.handle(decline,{ip:'2'});await service.handle(decline,{ip:'2'});
 const stored=(await db.doc('martini_v2_events/'+event.id).get()).data();assert.equal(stored.registered,0);assert.equal(stored.waiting,1);
});
test('100 eligible members on one campus IP register concurrently without overselling',{timeout:120000},async t=>{
 const batch=db.batch();for(let i=1;i<=100;i++)batch.set(db.doc('martini_v2_members/member-'+i),{...member(i),duesPaid:true});
 batch.update(db.doc('martini_v2_events/'+event.id),{capacity:25});await batch.commit();const start=Date.now();
 const results=await Promise.allSettled(Array.from({length:100},(_,index)=>service.handle(application(index+1,{receiptKey:hash('campus-'+index)}),{ip:'campus-wifi'})));
 t.diagnostic('Concurrent 100 requests: '+(Date.now()-start)+'ms');
 assert.deepEqual(results.filter(r=>r.status==='rejected').map(r=>({code:r.reason.code,message:r.reason.message})),[]);
 assert.equal(results.filter(r=>r.value?.status==='registered').length,25);assert.equal(results.filter(r=>r.value?.status==='waiting').length,75);
 const stored=(await db.doc('martini_v2_events/'+event.id).get()).data();assert.equal(stored.registered,25);assert.equal(stored.waiting,75);
});
test('a waiting application prevents later fee or semester changes',async()=>{
 const a=await service.handle(application(1),{ip:'1'});await service.handle(application(2),{ip:'2'});
 await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'cancel'},{ip:'1'});
 await assert.rejects(service.handle(await eventEditInput({fee:10000,paymentInstructions:'새 납부'}),owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle(await eventEditInput({semester:'2027-1'}),owner),e=>e.code==='failed-precondition');
});
test('linked record queries include older meetings and stock movements outside the latest page',async()=>{
 const batch=db.batch();for(let i=0;i<110;i++)batch.set(db.doc('martini_v2_stockMoves/other-'+i),{itemId:'other',updatedAt:stamp});
 batch.set(db.doc('martini_v2_stockMoves/old-gin'),{itemId:'gin',updatedAt:time(-86400000)});await batch.commit();
 const result=await service.handle({op:'read',kind:'stockMoves',itemId:'gin'},education);assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,'old-gin');
 await assert.rejects(service.handle({op:'read',kind:'members',itemId:'gin'},owner),e=>e.code==='invalid-argument');
});
test('semester privacy cleanup is owner-only, reviewed, and blocks unsettled records',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'1'});
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});
 const query={semester:'2026-2',memberId:'member-1'};
 await assert.rejects(service.handle({op:'privacyReview',...query},education),e=>e.code==='permission-denied');
 let review=await service.handle({op:'privacyReview',...query},owner);assert.ok(review.blockers.length);
 const pay={op:'finance',requestId:'privacy-pay',kind:'income',amount:10000,title:'가상부원 1 참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:'개인정보가 포함된 가상 메모'};
 await service.handle(pay,finance);
 await service.handle(await eventEditInput({status:'completed'}),owner);
 review=await service.handle({op:'privacyReview',...query},owner);assert.equal(review.blockers.length,0);
 const cleanup={op:'privacyAnonymize',...query,fingerprint:review.fingerprint,confirmation:'2026-2 정리',reason:'기한 종료'};
 await assert.rejects(service.handle({...cleanup,confirmation:'확인'},owner),e=>e.code==='invalid-argument');
 await db.doc('martini_v2_members/member-1').update({updatedAt:time(100)});
 await assert.rejects(service.handle(cleanup,owner),e=>e.code==='aborted');
 review=await service.handle({op:'privacyReview',...query},owner);await service.handle({...cleanup,fingerprint:review.fingerprint},owner);
 const m=(await db.doc('martini_v2_members/member-1').get()).data(),stored=(await db.doc('martini_v2_applications/'+a.id).get()).data(),ledger=(await db.doc('martini_v2_finance/privacy-pay').get()).data();
 assert.equal(m.phone,'');assert.equal(m.studentId,'');assert.equal(m.identityHash,undefined);assert.equal(stored.receiptHash,undefined);assert.equal(stored.paidAmount,10000);assert.equal(ledger.amount,10000);assert.equal(ledger.note,'');
 await assert.rejects(service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'get'},{ip:'old-link'}),e=>e.code==='not-found');
});

test('privacy candidates include old dues-only records after a semester rollover',async()=>{
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});
 await db.doc('martini_v2_members/member-1').update({semester:'2027-1'});
 await db.doc('martini_v2_finance/old-dues').set({memberId:'member-1',semester:'2026-2',kind:'dues',amount:30000,title:'가상부원 1',note:'가상 연락 기록',updatedAt:stamp});
 const result=await service.handle({op:'privacyCandidates',semester:'2026-2'},owner);
 assert.ok(result.rows.some(r=>r.id==='member-1'));
 const review=await service.handle({op:'privacyReview',semester:'2026-2',memberId:'member-1'},owner);
 assert.equal(review.counts.member,0);assert.equal(review.counts.finance,1);
});
test('removing a roster identity checks unsettled applications from other semesters too',async()=>{
 const a=await service.handle(application(1),{ip:'1'});
 await db.doc('martini_v2_applications/'+a.id).update({semester:'2026-1',paidAmount:10000,payment:'refund_pending',status:'cancelled'});
 await db.doc('martini_v2_events/'+event.id).update({semester:'2026-1',status:'cancelled'});
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});
 const review=await service.handle({op:'privacyReview',semester:'2026-2',memberId:'member-1'},owner);
 assert.ok(review.blockers.some(b=>b.includes('환불')));
});
test('anonymized application records cannot reveal current-member contact or receive new links',async()=>{
 const a=await service.handle(application(1),{ip:'1'});
 await db.doc('martini_v2_applications/'+a.id).update({name:'정보 정리 완료',anonymizedAt:stamp,answers:[]});
 const contact=await service.handle({op:'participantContact',id:a.id},education);assert.equal(contact.phone,'');assert.equal(contact.studentId,'');
 await assert.rejects(service.handle({op:'rotateReceipt',id:a.id,reason:'재발급 시도'},owner),e=>e.code==='failed-precondition');
});
