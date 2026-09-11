import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { migrateRoster } from '../scripts/semester-roster-migration.mjs';
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
test('registered members do not need dues flags; forged identity fails and links do not expose roster',async()=>{
 assert.equal((await service.handle(application(8),{ip:'registered'})).status,'registered');
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

test('roster registration and semester edits do not require dues or activity state',async()=>{
 await db.doc('martini_v2_admins/execution').set({role:'execution',active:true,displayName:'집행부',expiresAt:time(864000000)});
 const input={op:'saveMember',revision:0,name:'신규 가상',studentId:'202699999',phone:'01099999999',college:'',department:'',grade:'',gender:'',semester:'2026-2',status:'active',duesPaid:false};
 const result=await service.handle(input,{uid:'execution'});assert.equal('duesPaid' in result,false);assert.equal('status' in result,false);
 const current=member(1);delete current.id;delete current.identityHash;delete current.createdAt;delete current.updatedAt;delete current.createdBy;delete current.updatedBy;
 await assert.rejects(service.handle({op:'saveMember',...current,id:'member-1',semester:'2027-1'},owner),e=>e.code==='not-found');
 assert.equal((await service.handle({op:'saveMember',...current,revision:0,semester:'2027-1'},owner)).semester,'2027-1');
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
 const {registered,waiting,sequence,linkHash,hasSemesterChanges,createdAt,updatedAt,createdBy,updatedBy,...editable}=(await db.doc('martini_v2_events/'+event.id).get()).data();
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
 assert.equal((await db.doc('martini_v2_semesters/2026-2/dues/member-1').get()).data().duesTransactionId,'dues-once');
 await service.handle({op:'saveMember',...editable,revision:editable.revision+1,duesPaid:false},finance);assert.equal((await db.doc('martini_v2_semesters/2026-2/members/member-1').get()).data().duesPaid,undefined);
});
test('waitlist offers recheck eligibility and can be declined after the normal cancellation deadline',async()=>{
 const first=await service.handle(application(1),{ip:'1'}),second=await service.handle(application(2),{ip:'2'});
 await service.handle(application(3),{ip:'3'});await service.handle({op:'receipt',id:first.id,key:'1'.repeat(64),action:'cancel'},{ip:'1'});
 const ref=db.doc('martini_v2_members/member-2'),offer={op:'applicationCommand',id:second.id,action:'offer',offerExpiresAt:time(3600000),reason:'빈자리 안내'};
 await ref.update({semester:'2025-2'});await assert.rejects(service.handle(offer,owner),e=>e.code==='failed-precondition');
 await ref.update({semester:'2026-2'});await service.handle(offer,owner);
 await ref.update({semester:'2025-2'});await assert.rejects(service.handle({op:'receipt',id:second.id,key:'2'.repeat(64),action:'accept'},{ip:'2'}),e=>e.code==='permission-denied');
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
test('fee and semester edits preserve existing waitlist terms and block cross-semester duplicates',async()=>{
 const first=await service.handle(application(1),{ip:'1'}),waiting=await service.handle(application(2),{ip:'2'});
 await service.handle({op:'receipt',id:first.id,key:'1'.repeat(64),action:'cancel'},{ip:'1'});
 await service.handle(await eventEditInput({fee:10000,paymentInstructions:'새 납부',semester:'2027-1'}),owner);
 const before=(await db.doc('martini_v2_applications/'+waiting.id).get()).data();assert.equal(before.fee,0);assert.equal(before.semester,'2026-2');
 await service.handle({op:'applicationCommand',id:waiting.id,action:'offer',offerExpiresAt:time(3600000),reason:'기존 대기자'},owner);
 await service.handle({op:'receipt',id:waiting.id,key:'2'.repeat(64),action:'accept'},{ip:'2'});
 assert.equal((await db.doc('martini_v2_applications/'+waiting.id).get()).data().payment,'none');
 const newer={...member(2),id:'new-member-2',semester:'2027-1'};await db.doc('martini_v2_members/new-member-2').set(newer);
 await assert.rejects(service.handle({...application(2),requestId:'new-term-attempt',receiptKey:'f'.repeat(64)},{ip:'2'}),e=>e.code==='already-exists');
 await db.doc('martini_v2_members/new-member-3').set({...member(3),id:'new-member-3',semester:'2027-1'});
 const fresh=await service.handle(application(3),{ip:'3'}),freshData=(await db.doc('martini_v2_applications/'+fresh.id).get()).data();assert.equal(freshData.fee,10000);assert.equal(freshData.semester,'2027-1');
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


test('operating settings can be created without dues, dates or editable privacy text',async()=>{
 await db.doc('martini_v2_settings/club').delete();
 const input={op:'saveSettings',revision:0,semester:'2026-2',location:'동아리방',contact:'',joinUrl:'https://open.kakao.com/o/testClub',intro:'가상 동아리 소개'};
 await assert.rejects(service.handle(input,education),e=>e.code==='permission-denied');
 const result=await service.handle(input,owner);
 for(const key of ['duesAmount','semesterEndsAt','privacy','bankInstructions'])assert.equal(key in result,false);
 assert.equal(result.joinUrl,input.joinUrl);
 const publicInfo=await service.handle({op:'publicRead'},{ip:'join-settings'});
 assert.equal(publicInfo.settings.joinUrl,input.joinUrl);
 await service.handle(await eventEditInput({status:'open'}),owner);
 await assert.rejects(service.handle({...input,id:'club',revision:result.revision,joinUrl:'https://example.com/form'},owner),e=>e.code==='invalid-argument');
 await service.handle({...input,id:'club',revision:result.revision,joinUrl:''},owner);
 await assert.rejects(service.handle(await eventEditInput({status:'open'}),owner),e=>e.code==='failed-precondition');
});

test('editing public settings preserves historical values without requiring them',async()=>{
 await db.doc('martini_v2_settings/club').update({semesterEndsAt:time(-1000),bankInstructions:'이전 안내'});
 const input={op:'saveSettings',id:'club',revision:1,semester:'2026-2',location:'동아리방',contact:'가상 문의',joinUrl:'',intro:'가상 소개'};
 const result=await service.handle(input,owner);
 assert.equal(result.duesAmount,30000);
 assert.equal(result.semesterEndsAt,time(-1000));
 await assert.rejects(service.handle(input,owner),e=>e.code==='aborted');
});

test('dues record actual positive payments without a preset amount and keep authorization and duplicate guards',async()=>{
 const input={op:'finance',requestId:'actual-dues',kind:'dues',amount:17000,title:'실제 입금 확인',memberId:'member-8',semester:'2026-2',note:''};
 await assert.rejects(service.handle(input,education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,amount:0},finance),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...input,amount:-1},finance),e=>e.code==='invalid-argument');
 const result=await service.handle(input,finance);
 assert.equal(result.amount,17000);
 assert.equal((await db.doc('martini_v2_members/member-8').get()).data().duesPaid,false);
 assert.equal((await service.handle(input,finance)).duplicate,true);
 await assert.rejects(service.handle({...input,requestId:'duplicate-dues'},finance),e=>e.code==='already-exists');
 await db.doc('martini_v2_settings/club').delete();
 const withoutConfig=await service.handle({...input,requestId:'no-preset-dues',memberId:'member-7',amount:12000},finance);
 assert.equal(withoutConfig.amount,12000);
});

test('current-semester cleanup remains blocked even with a historical end date',async()=>{
 await db.doc('martini_v2_settings/club').update({semesterEndsAt:time(-1000)});
 await assert.rejects(service.handle({op:'privacyCandidates',semester:'2026-2'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'privacyReview',semester:'2026-2',memberId:'member-1'},owner),e=>e.code==='failed-precondition');
});

test('custom roles can be created, assigned, updated and safely removed only by the owner',async()=>{
 const roleInput={op:'saveRole',revision:0,name:'바 운영팀',permissions:['inventory']};
 await assert.rejects(service.handle(roleInput,finance),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...roleInput,permissions:['admins']},owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...roleInput,id:'owner'},owner),e=>e.code==='failed-precondition');
 const role=await service.handle(roleInput,owner),who={uid:'custom-staff',ip:'custom'};
 await assert.rejects(service.handle(roleInput,owner),e=>e.code==='already-exists');
 await assert.rejects(service.handle({...roleInput,name:'회장'},owner),e=>e.code==='already-exists');
 const assignment={op:'saveAdmin',uid:who.uid,displayName:'가상 담당자',role:role.id,active:true,expiresAt:time(86400000)};
 await service.handle(assignment,owner);
 const profile=await service.handle({op:'profile'},who);assert.equal(profile.roleName,'바 운영팀');assert.deepEqual(profile.permissions,['inventory']);
 await service.handle({op:'read',kind:'inventory'},who);
 await assert.rejects(service.handle({op:'read',kind:'finance'},who),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...roleInput,id:role.id,revision:1,permissions:['finance']},who),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'deleteRole',id:role.id,revision:1},owner),e=>e.code==='failed-precondition');
 const updated=await service.handle({...roleInput,id:role.id,revision:1,permissions:['finance']},owner);
 await assert.rejects(service.handle({...roleInput,id:role.id,revision:1},owner),e=>e.code==='aborted');
 await service.handle({op:'read',kind:'finance'},who);
 await service.handle({op:'read',kind:'members'},who);
 await service.handle({op:'read',kind:'events'},who);
 await assert.rejects(service.handle({op:'read',kind:'inventory'},who),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...assignment,role:'missing-role'},owner),e=>e.code==='invalid-argument');
 await service.handle({...assignment,role:'education'},owner);
 await service.handle({op:'deleteRole',id:role.id,revision:updated.revision},owner);
 await assert.rejects(service.handle(assignment,owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...assignment,uid:'owner',role:'education'},owner),e=>e.code==='failed-precondition');
});

test('financial details are omitted from event staff reads including direct record and unfiltered lists',async()=>{
 const a=await service.handle(application(1),{ip:'1'});
 await db.doc('martini_v2_applications/'+a.id).update({payment:'paid',paidAmount:12000,refundAmount:2000});
 for(const query of [{kind:'applications'},{kind:'applications',recordId:a.id},{kind:'applications',eventId:event.id}]){
  const staff=(await service.handle({op:'read',...query},education)).rows.find(r=>r.id===a.id);
  for(const key of ['payment','paidAmount','refundAmount'])assert.equal(key in staff,false);
  const accountant=(await service.handle({op:'read',...query},finance)).rows.find(r=>r.id===a.id);
  assert.equal(accountant.paidAmount,12000);assert.equal(accountant.refundAmount,2000);
 }
 for(const role of ['owner','chair','finance','education','execution','publicity']){
  if(!['owner','finance','education'].includes(role))await db.doc('martini_v2_admins/'+role).set({role,active:true,displayName:role,expiresAt:time(86400000)});
  if(['owner','chair','finance'].includes(role))await service.handle({op:'read',kind:'finance'},{uid:role});
  else await assert.rejects(service.handle({op:'read',kind:'finance'},{uid:role}),e=>e.code==='permission-denied');
 }
});

test('membership without payment and activity flags qualifies, unsupported gender is rejected',async()=>{
 const base={op:'saveMember',revision:0,name:'등록 부원',studentId:'20269999',phone:'01098765432',college:'',department:'',grade:'',gender:'여성',semester:'2026-2'};
 await assert.rejects(service.handle({...base,gender:'기타'},owner),e=>e.code==='invalid-argument');
 const m=await service.handle(base,owner);
 assert.equal('status' in m,false);assert.equal('duesPaid' in m,false);
 const a=await service.handle({...application(1),name:m.name,studentId:m.studentId,phone:m.phone,requestId:'new-registered-member'},{ip:'new'});
 assert.equal(a.status,'registered');
 const stored=(await db.doc('martini_v2_semesters/2026-2/members/'+m.id).get()).data();
 assert.equal('status' in stored,false);assert.equal('duesPaid' in stored,false);
});


test('semester trees preserve separate identities and reject duplicate registration within one semester',async()=>{
 const input={op:'saveMember',revision:0,name:'학기별 부원',studentId:'20300001',phone:'01011112222',gender:'남성',semester:'2026-2'};
 const outcomes=await Promise.allSettled([service.handle(input,owner),service.handle(input,owner)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'already-exists');
 const first=outcomes.find(r=>r.status==='fulfilled').value;
 const second=await service.handle({...input,semester:'2027-1',name:'다음 학기 이름'},owner);
 const data=(await db.doc('martini_v2_semesters/2026-2/members/'+first.id).get()).data();assert.equal(data.semester,undefined);
 assert.equal((await service.handle({op:'read',kind:'members',semester:'2026-2',recordId:first.id},owner)).rows[0].name,input.name);
 await assert.rejects(service.handle({op:'read',kind:'members',semester:'2027-1',recordId:first.id},owner),e=>e.code==='not-found');
 assert.equal((await service.handle({op:'read',kind:'members',semester:'2027-1'},owner)).rows[0].id,second.id);
 await assert.rejects(service.handle({...input,semester:'../bad'},owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({op:'rosterTerms'},education),e=>e.code==='permission-denied');
});

test('roster migration is repeatable, preserves ledger links and existing applications, and removes redundant fields',async()=>{
 const a=await service.handle(application(1),{ip:'migration'});
 await db.doc('martini_v2_members/member-1/semesters/2026-2').set({semester:'2026-2',duesTransactionId:'old-ledger',updatedAt:stamp});
 const preview=await migrateRoster(db);assert.equal(preview.members,8);assert.equal(preview.remaining,8);
 const applied=await migrateRoster(db,{apply:true});assert.equal(applied.moved,8);assert.equal(applied.remaining,0);
 assert.equal((await migrateRoster(db,{apply:true})).moved,0);
 const stored=(await db.doc('martini_v2_semesters/2026-2/members/member-1').get()).data();assert.equal(stored.semester,undefined);assert.equal(stored.status,undefined);assert.equal(stored.duesPaid,undefined);assert.equal(stored.phone,member(1).phone);
 assert.equal((await db.doc('martini_v2_semesters/2026-2/dues/member-1').get()).data().duesTransactionId,'old-ledger');
 assert.equal((await service.handle({op:'participantContact',id:a.id},education)).phone,member(1).phone);
 assert.equal((await service.handle(application(1),{ip:'migration'})).id,a.id);
 await assert.rejects(service.handle({op:'finance',kind:'dues',requestId:'duplicate-migrated',memberId:'member-1',semester:'2026-2',amount:10000,title:'중복'},finance),e=>e.code==='already-exists');
});

test('nested roster pagination and privacy cleanup stay within the selected semester',async()=>{
 await migrateRoster(db,{apply:true});
 const batch=db.batch();for(let i=10;i<120;i++){const {semester,status,duesPaid,...m}=member(i);batch.set(db.doc('martini_v2_semesters/2026-2/members/member-'+i),m);}await batch.commit();
 const first=await service.handle({op:'read',kind:'members',semester:'2026-2'},owner),second=await service.handle({op:'read',kind:'members',semester:'2026-2',cursor:first.nextCursor},owner);
 assert.equal(first.rows.length,100);assert.equal(second.rows.length,18);assert.equal(new Set([...first.rows,...second.rows].map(m=>m.id)).size,118);
 const {semester,status,duesPaid,...future}=member(1);await db.doc('martini_v2_semesters/2027-1/members/member-1').set({...future,name:'다음 학기 정보'});
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});
 const query={semester:'2026-2',memberId:'member-1'},review=await service.handle({op:'privacyReview',...query},owner);
 assert.deepEqual(review.blockers,[]);assert.equal(review.counts.member,1);
 await service.handle({op:'privacyAnonymize',...query,fingerprint:review.fingerprint,confirmation:'2026-2 정리',reason:'보존 종료'},owner);
 assert.equal((await db.doc('martini_v2_semesters/2026-2/members/member-1').get()).data().phone,'');
 assert.equal((await db.doc('martini_v2_semesters/2027-1/members/member-1').get()).data().phone,member(1).phone);
});


test('nested waitlist uses the event semester even when a newer roster has the same member id',async()=>{
 await migrateRoster(db,{apply:true});
 const a=await service.handle(application(1),{ip:'nested-first'}),b=await service.handle(application(2),{ip:'nested-second'});
 await db.doc('martini_v2_semesters/2027-1/members/member-2').set({...member(2),phone:'01077778888'});
 assert.equal((await service.handle({op:'participantContact',id:b.id},education)).phone,member(2).phone);
 await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'cancel'},{ip:'nested-first'});
 await service.handle({op:'applicationCommand',id:b.id,action:'offer',offerExpiresAt:time(3600000),reason:'좌석 제안'},owner);
 await service.handle({op:'receipt',id:b.id,key:'2'.repeat(64),action:'accept'},{ip:'nested-second'});
 assert.equal((await db.doc('martini_v2_applications/'+b.id).get()).data().status,'registered');
});

test('migration refuses conflicting ledger links and preserves an edited nested roster',async()=>{
 await db.doc('martini_v2_members/member-1/semesters/2026-2').set({duesTransactionId:'old-link'});
 await db.doc('martini_v2_semesters/2026-2/dues/member-1').set({duesTransactionId:'conflict'});
 await assert.rejects(migrateRoster(db,{apply:true}),/LEDGER_LINK_CONFLICT/);
 assert.equal((await db.doc('martini_v2_members/member-1').get()).exists,true);
 await db.doc('martini_v2_semesters/2026-2/dues/member-1').set({duesTransactionId:'old-link'});
 const {semester,status,duesPaid,...data}=member(1);await db.doc('martini_v2_semesters/2026-2/members/member-1').set({...data,revision:2,name:'수정된 이름'});
 await migrateRoster(db,{apply:true});
 assert.equal((await db.doc('martini_v2_semesters/2026-2/members/member-1').get()).data().name,'수정된 이름');
});


test('removing a semester member hides roster and prevents new applications but preserves history and other semesters',async()=>{
 const a=await service.handle(application(1),{ip:'remove-legacy'});
 await db.doc('martini_v2_semesters/2027-1/members/member-1').set({...member(1),name:'다음 학기'});
 await db.doc('martini_v2_finance/keep-ledger').set({memberId:'member-1',semester:'2026-2',amount:30000,title:'회비',updatedAt:stamp});
 const appBefore=(await db.doc('martini_v2_applications/'+a.id).get()).data();
 const input={op:'removeMember',id:'member-1',semester:'2026-2',revision:1};
 await assert.rejects(service.handle(input,education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,semester:'2025-2'},owner),e=>e.code==='not-found');
 await assert.rejects(service.handle({...input,revision:9},owner),e=>e.code==='aborted');
 await service.handle(input,owner);assert.equal((await service.handle(input,owner)).duplicate,true);
 assert.equal((await service.handle({op:'read',kind:'members',semester:'2026-2'},owner)).rows.some(m=>m.id==='member-1'),false);
 assert.equal((await service.handle({op:'read',kind:'members',semester:'2026-2',removed:true},owner)).rows[0].id,'member-1');
 assert.equal((await service.handle({op:'read',kind:'members',semester:'2027-1'},owner)).rows[0].name,'다음 학기');
 await assert.rejects(service.handle(application(1),{ip:'removed'}),e=>e.code==='permission-denied');
 assert.deepEqual((await db.doc('martini_v2_applications/'+a.id).get()).data(),appBefore);
 assert.equal((await db.doc('martini_v2_finance/keep-ledger').get()).data().amount,30000);
 assert.equal((await service.handle({op:'participantContact',id:a.id},education)).phone,member(1).phone);
 await service.handle({...input,op:'restoreMember',revision:2},owner);
 assert.equal((await service.handle(application(1),{ip:'restored'})).id,a.id);
 await assert.rejects(service.handle(input,owner),e=>e.code==='aborted');
});

test('removed nested member cannot be edited, duplicated or offered a seat and can be restored',async()=>{
 await migrateRoster(db,{apply:true});
 const first=await service.handle(application(1),{ip:'first'}),waiting=await service.handle(application(2),{ip:'waiting'});
 const input={op:'removeMember',semester:'2026-2',id:'member-2',revision:1};
 await service.handle(input,owner);
 await service.handle({op:'receipt',id:first.id,key:'1'.repeat(64),action:'cancel'},{ip:'first'});
 await assert.rejects(service.handle({op:'applicationCommand',id:waiting.id,action:'offer',offerExpiresAt:time(3600000),reason:'자리 제안'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'saveMember',id:'member-2',revision:2,semester:'2026-2',name:member(2).name,studentId:member(2).studentId,phone:member(2).phone},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'saveMember',semester:'2026-2',name:member(2).name,studentId:member(2).studentId,phone:member(2).phone},owner),e=>e.code==='already-exists');
 await service.handle({...input,op:'restoreMember',revision:2},owner);
 await service.handle({op:'applicationCommand',id:waiting.id,action:'offer',offerExpiresAt:time(3600000),reason:'자리 제안'},owner);
 await service.handle({...input,revision:3},owner);
 await assert.rejects(service.handle({op:'receipt',id:waiting.id,key:'2'.repeat(64),action:'accept'},{ip:'waiting'}),e=>e.code==='permission-denied');
 const stored=(await db.doc('martini_v2_semesters/2026-2/members/member-2').get()).data();assert.ok(stored.removedAt);assert.equal(stored.semester,undefined);
});

test('removed roster remains eligible for privacy cleanup and anonymized identities cannot be restored',async()=>{
 await migrateRoster(db,{apply:true});
 await service.handle({op:'removeMember',id:'member-1',semester:'2026-2',revision:1},owner);
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});
 assert.ok((await service.handle({op:'privacyCandidates',semester:'2026-2'},owner)).rows.some(r=>r.id==='member-1'));
 const query={semester:'2026-2',memberId:'member-1'},review=await service.handle({op:'privacyReview',...query},owner);
 await service.handle({op:'privacyAnonymize',...query,fingerprint:review.fingerprint,confirmation:'2026-2 정리',reason:'보존 종료'},owner);
 await assert.rejects(service.handle({op:'restoreMember',id:'member-1',semester:'2026-2',revision:3},owner),e=>e.code==='failed-precondition');
});


test('member notes are detail-only, preserved by older clients and cleared by privacy cleanup',async()=>{
 const input={op:'saveMember',revision:0,name:'메모 검증',studentId:'NOTE2026',phone:'01012349876',semester:'2026-2',note:'임원 전용 메모 <script>example</script>'};
 await assert.rejects(service.handle({...input,note:'x'.repeat(3001)},owner),e=>e.code==='invalid-argument');
 const created=await service.handle(input,owner);
 const list=await service.handle({op:'read',kind:'members',semester:'2026-2'},owner);assert.equal('note' in list.rows.find(r=>r.id===created.id),false);
 const detail={op:'read',kind:'members',semester:'2026-2',recordId:created.id};
 assert.equal((await service.handle(detail,owner)).rows[0].note,input.note);
 await assert.rejects(service.handle(detail,education),e=>e.code==='permission-denied');
 const {note,...oldClient}=input;await service.handle({...oldClient,id:created.id,revision:1,grade:'3'},owner);
 assert.equal((await service.handle(detail,owner)).rows[0].note,input.note);
 const a=await service.handle({...application(1),name:input.name,studentId:input.studentId,phone:input.phone},{ip:'note-test'});
 assert.equal('note' in await service.handle({op:'participantContact',id:a.id},education),false);
 assert.equal(JSON.stringify(await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64)},{ip:'note-receipt'})).includes(input.note),false);
 await service.handle({op:'removeMember',id:created.id,semester:'2026-2',revision:2},owner);
 assert.equal('note' in (await service.handle({op:'read',kind:'members',semester:'2026-2',removed:true},owner)).rows[0],false);
 await db.doc('martini_v2_settings/club').update({semester:'2027-1'});await service.handle(await eventEditInput({status:'completed'}),owner);
 const query={semester:'2026-2',memberId:created.id},preview=await service.handle({op:'privacyReview',...query},owner);
 await service.handle({op:'privacyAnonymize',...query,fingerprint:preview.fingerprint,confirmation:'2026-2 정리',reason:'보존 종료'},owner);
 assert.equal((await db.doc('martini_v2_semesters/2026-2/members/'+created.id).get()).data().note,'');
});

test('unused default roles can be deleted without returning through builtin fallbacks',async()=>{
 const remove={op:'deleteRole',id:'publicity',revision:0};
 await assert.rejects(service.handle(remove,education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...remove,id:'owner'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({...remove,id:'education'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({...remove,revision:9},owner),e=>e.code==='aborted');
 await service.handle(remove,owner);
 assert.equal((await service.handle({op:'listRoles'},owner)).rows.some(r=>r.id==='publicity'),false);
 await assert.rejects(service.handle({op:'saveAdmin',uid:'new-staff',displayName:'검증',role:'publicity',active:true,expiresAt:time(86400000)},owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({op:'saveRole',id:'publicity',revision:1,name:'홍보부',permissions:['content']},owner),e=>e.code==='not-found');
 await assert.rejects(service.handle(remove,owner),e=>e.code==='not-found');
 const replacement=await service.handle({op:'saveRole',revision:0,name:'홍보부',permissions:['content']},owner);
 assert.notEqual(replacement.id,'publicity');
});

test('admin deletion revokes access, preserves history and guards self, stale and unauthorized requests',async()=>{
 const input={op:'deleteAdmin',uid:'education',updatedAt:stamp};
 await assert.rejects(service.handle(input,finance),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,uid:'owner'},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({...input,updatedAt:time(-1000)},owner),e=>e.code==='aborted');
 await service.handle(input,owner);
 assert.equal((await db.doc('martini_v2_admins/education').get()).exists,false);
 assert.equal((await db.doc('martini_v2_events/event-one').get()).exists,true);
 await assert.rejects(service.handle({op:'profile'},education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle(input,owner),e=>e.code==='not-found');
 const history=await db.collection('martini_v2_audit').where('entityId','==','education').get();assert.equal(history.size,1);
 await service.handle({op:'saveAdmin',uid:'education',displayName:'다시 등록',role:'education',active:true,expiresAt:time(86400000)},owner);
 assert.equal((await service.handle({op:'profile'},education)).role,'education');
});

test('spending plans are finance-only, do not spend on save, and execute atomically once',async()=>{
 const input={op:'saveBudget',revision:0,title:'교육 재료',amount:50000,dueDate:'2026-10-01',note:'20명 기준',semester:'2026-2'};
 await assert.rejects(service.handle(input,education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'read',kind:'budgets'},education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,dueDate:'2026-02-30'},finance),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...input,amount:0},finance),e=>e.code==='invalid-argument');
 const p=await service.handle(input,finance);assert.equal(p.status,'planned');assert.equal((await db.collection('martini_v2_finance').get()).size,0);
 const next=await service.handle({...input,id:p.id,revision:1,amount:60000},finance);
 await assert.rejects(service.handle({op:'deleteBudget',id:p.id,revision:1},finance),e=>e.code==='aborted');
 await assert.rejects(service.handle({op:'executeBudget',id:p.id,revision:2,amount:55000,confirmed:false},finance),e=>e.code==='invalid-argument');
 const execution={op:'executeBudget',id:p.id,revision:next.revision,amount:55000,confirmed:true};
 await assert.rejects(service.handle(execution,education),e=>e.code==='permission-denied');
 await Promise.all([service.handle(execution,finance),service.handle(execution,finance)]);
 const ledger=await db.collection('martini_v2_finance').get();assert.equal(ledger.size,1);assert.equal(ledger.docs[0].data().amount,55000);assert.equal(ledger.docs[0].data().kind,'expense');
 const stored=(await service.handle({op:'read',kind:'budgets',recordId:p.id},finance)).rows[0];assert.equal(stored.status,'executed');assert.equal(stored.amount,60000);assert.equal(stored.actualAmount,55000);
 await assert.rejects(service.handle({...input,id:p.id,revision:stored.revision},finance),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'deleteBudget',id:p.id,revision:stored.revision},finance),e=>e.code==='failed-precondition');
 const unused=await service.handle({...input,title:'취소할 구매',dueDate:''},finance);
 await service.handle({op:'deleteBudget',id:unused.id,revision:1},finance);assert.equal((await db.doc('martini_v2_budgets/'+unused.id).get()).exists,false);assert.equal((await db.collection('martini_v2_finance').get()).size,1);
});

const deleteInput=async(kind,id)=>{const r=(await db.doc('martini_v2_'+kind+'/'+id).get()).data();return {op:'deleteRecord',kind,id,updatedAt:r.updatedAt,...(r.revision!==undefined?{revision:r.revision}:{}),confirmed:true};};
test('deletion enforces scope, confirmation, concurrency and immutable history boundaries',async()=>{
 await db.doc('martini_v2_content/post').set({...meta,title:'삭제할 공지',type:'notice',body:'내용',semester:'2026-2',published:true});
 const input=await deleteInput('content','post');
 await assert.rejects(service.handle(input,education),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,confirmed:false},owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...input,revision:0},owner),e=>e.code==='aborted');
 await assert.rejects(service.handle({...input,kind:'audit'},owner),e=>e.code==='invalid-argument');
 await service.handle(input,owner);await service.handle(input,owner);
 assert.equal((await service.handle({op:'read',kind:'content'},owner)).rows.length,0);
 await assert.rejects(service.handle({op:'read',kind:'content',recordId:'post'},owner),e=>e.code==='not-found');
 assert.equal((await service.handle({op:'publicRead'},{ip:'deleted-post'})).content.length,0);
 assert.equal((await db.doc('martini_v2_content/post').get()).data().body,'내용');
 assert.equal((await db.collection('martini_v2_audit').where('entityId','==','post').get()).size,1);
});
test('event and application deletion require closed participation and revoke capability links',async()=>{
 await assert.rejects(service.handle(await deleteInput('events',event.id),owner),e=>e.code==='failed-precondition');
 const a=await service.handle(application(1),{ip:'delete-app'});
 await assert.rejects(service.handle(await deleteInput('applications',a.id),owner),e=>e.code==='failed-precondition');
 await service.handle({op:'applicationCommand',id:a.id,action:'cancel',reason:'삭제 테스트'},owner);
 await service.handle(await deleteInput('applications',a.id),owner);
 await assert.rejects(service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'get'},{ip:'deleted-receipt'}),e=>e.code==='not-found');
 assert.equal((await service.handle({op:'read',kind:'applications',eventId:event.id},owner)).rows.length,0);
 await db.doc('martini_v2_events/'+event.id).update({status:'cancelled'});
 await service.handle(await deleteInput('events',event.id),owner);
 await assert.rejects(service.handle({op:'eventAccess',eventId:event.id,key:'a'.repeat(64)},{ip:'deleted-event'}),e=>e.code==='not-found');
});
test('deleting a financial record reverses payment and refund amounts once in safe order',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'deletion-payment'});
 const pay={op:'finance',requestId:'delete-pay',kind:'income',amount:10000,title:'참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:''};
 await service.handle(pay,finance);
 await service.handle({...pay,requestId:'delete-refund',kind:'refund',amount:3000},finance);
 await assert.rejects(service.handle(await deleteInput('finance','delete-pay'),finance),e=>e.code==='failed-precondition');
 const refund=await deleteInput('finance','delete-refund');await service.handle(refund,finance);await service.handle(refund,finance);
 let stored=(await db.doc('martini_v2_applications/'+a.id).get()).data();assert.equal(stored.refundAmount,0);assert.equal(stored.paidAmount,10000);assert.equal(stored.payment,'paid');
 await service.handle(await deleteInput('finance','delete-pay'),finance);
 await service.handle(pay,finance);
 stored=(await db.doc('martini_v2_applications/'+a.id).get()).data();assert.equal(stored.paidAmount,0);assert.equal(stored.payment,'unpaid');
 assert.equal((await service.handle({op:'read',kind:'finance'},finance)).rows.length,0);
});
test('dues deletion permits a new corrected record and plan expense deletion restores the plan',async()=>{
 const dues={op:'finance',requestId:'dues-delete',kind:'dues',amount:30000,title:'회비',memberId:'member-1',semester:'2026-2',note:'',eventId:'',applicationId:''};
 await service.handle(dues,finance);await service.handle(await deleteInput('finance',dues.requestId),finance);
 await service.handle({...dues,requestId:'corrected-dues',amount:25000},finance);
 assert.equal((await db.doc('martini_v2_semesters/2026-2/dues/member-1').get()).data().duesTransactionId,'corrected-dues');
 const plan=await service.handle({op:'saveBudget',revision:0,title:'재료 구매',amount:10000,dueDate:'',note:'',semester:'2026-2'},finance);
 await service.handle({op:'executeBudget',id:plan.id,revision:1,amount:9000,confirmed:true},finance);
 const executed=(await db.doc('martini_v2_budgets/'+plan.id).get()).data();
 await service.handle(await deleteInput('finance',executed.transactionId),finance);
 const restored=(await db.doc('martini_v2_budgets/'+plan.id).get()).data();assert.equal(restored.status,'planned');assert.equal(restored.transactionId,undefined);assert.equal(restored.actualAmount,undefined);
});
test('stocked items and linked meetings are protected while empty items and unlinked records can be deleted',async()=>{
 await assert.rejects(service.handle(await deleteInput('inventory','gin'),education),e=>e.code==='failed-precondition');
 await db.doc('martini_v2_inventory/gin').update({quantity:0});
 await service.handle(await deleteInput('inventory','gin'),education);
 await assert.rejects(service.handle({op:'stock',id:'gin',revision:2,requestId:'deleted-stock',action:'receive',amount:1,reason:'삭제 뒤 입고'},education),e=>e.code==='not-found');
 await db.doc('martini_v2_meetings/meeting-delete').set({...meta,title:'회의',status:'draft',agendas:[]});
 await db.doc('martini_v2_decisions/decision-delete').set({...meta,title:'결정',meetingId:'meeting-delete'});
 await assert.rejects(service.handle(await deleteInput('meetings','meeting-delete'),owner),e=>e.code==='failed-precondition');
 await service.handle(await deleteInput('decisions','decision-delete'),owner);
 await service.handle(await deleteInput('meetings','meeting-delete'),owner);
 assert.equal((await service.handle({op:'read',kind:'meetings'},owner)).rows.length,0);
});

test('archived completed event permits ledger correction without restoring event or public links',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'archived-completed'});
 const pay={op:'finance',requestId:'archive-completed-pay',kind:'income',amount:10000,title:'참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:''};
 await service.handle(pay,finance);
 await db.doc('martini_v2_events/'+event.id).update({status:'completed'});
 await service.handle(await deleteInput('events',event.id),owner);
 const archived=(await db.doc('martini_v2_events/'+event.id).get()).data();
 const deletion=await deleteInput('finance',pay.requestId);
 await assert.rejects(service.handle(deletion,education),e=>e.code==='permission-denied');
 await service.handle(deletion,finance);await service.handle(deletion,finance);
 const corrected=(await db.doc('martini_v2_applications/'+a.id).get()).data();assert.equal(corrected.paidAmount,0);assert.equal(corrected.payment,'unpaid');
 assert.deepEqual((await db.doc('martini_v2_events/'+event.id).get()).data(),archived);
 assert.equal((await service.handle({op:'read',kind:'events'},owner)).rows.length,0);
 assert.equal((await service.handle({op:'read',kind:'finance'},finance)).rows.length,0);
 await assert.rejects(service.handle({op:'eventAccess',eventId:event.id,key:'a'.repeat(64)},{ip:'archive-link'}),e=>e.code==='not-found');
 await service.handle(pay,finance);assert.equal((await db.doc('martini_v2_applications/'+a.id).get()).data().paidAmount,0);
});
test('archived event and archived application allow refund then payment correction with totals and deletion state preserved',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'archived-refund'});
 const pay={op:'finance',requestId:'archive-pay',kind:'income',amount:10000,title:'참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:''};
 await service.handle(pay,finance);
 await service.handle({op:'applicationCommand',id:a.id,action:'cancel',reason:'가상 취소'},owner);
 await service.handle({...pay,requestId:'archive-refund',kind:'refund'},finance);
 await service.handle(await deleteInput('applications',a.id),owner);
 await db.doc('martini_v2_events/'+event.id).update({status:'cancelled'});
 await service.handle(await deleteInput('events',event.id),owner);
 const original=(await db.doc('martini_v2_applications/'+a.id).get()).data();
 await assert.rejects(service.handle(await deleteInput('finance',pay.requestId),finance),e=>e.code==='failed-precondition');
 await service.handle(await deleteInput('finance','archive-refund'),finance);
 let current=(await db.doc('martini_v2_applications/'+a.id).get()).data();assert.equal(current.refundAmount,0);assert.equal(current.payment,'refund_pending');assert.equal(current.deletedAt,original.deletedAt);
 await service.handle(await deleteInput('finance',pay.requestId),finance);
 current=(await db.doc('martini_v2_applications/'+a.id).get()).data();assert.equal(current.paidAmount,0);assert.equal(current.refundAmount,0);assert.equal(current.deletedAt,original.deletedAt);assert.equal(current.deletedBy,original.deletedBy);assert.equal(current.status,'cancelled');
 assert.equal((await service.handle({op:'read',kind:'applications',eventId:event.id},owner)).rows.length,0);
 await assert.rejects(service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'get'},{ip:'archived-private-link'}),e=>e.code==='not-found');
});
test('settlement correction still rejects missing originals and a different application request',async()=>{
 await db.doc('martini_v2_events/'+event.id).update({fee:10000,paymentInstructions:'가상 납부'});
 const a=await service.handle(application(1),{ip:'missing-original'});
 const pay={op:'finance',requestId:'original-pay',kind:'income',amount:10000,title:'참가비',eventId:event.id,applicationId:a.id,memberId:'',semester:'2026-2',note:''};await service.handle(pay,finance);
 const deletion=await deleteInput('finance',pay.requestId),aRef=db.doc('martini_v2_applications/'+a.id),original=(await aRef.get()).data();
 await aRef.update({requestId:'another-application'});await assert.rejects(service.handle(deletion,finance),e=>e.code==='failed-precondition');
 await aRef.set(original);await db.doc('martini_v2_events/'+event.id).delete();await assert.rejects(service.handle(deletion,finance),e=>e.code==='failed-precondition');
 await aRef.delete();await assert.rejects(service.handle(deletion,finance),e=>e.code==='failed-precondition');
 assert.equal((await db.doc('martini_v2_finance/'+pay.requestId).get()).data().deletedAt,undefined);
});

test('applications accept name and student ID without a phone and reject ambiguous or wrong identities',async()=>{
 const input=application(1);delete input.phone;
 await assert.rejects(service.handle({...input,name:'다른 이름'},{ip:'no-phone'}),e=>e.code==='permission-denied');
 const first=await service.handle(input,{ip:'no-phone'});assert.equal(first.status,'registered');
 const again=await service.handle(input,{ip:'no-phone'});assert.equal(again.id,first.id);
 await assert.rejects(service.handle({...input,requestId:'other-attempt',receiptKey:'e'.repeat(64)},{ip:'no-phone'}),e=>e.code==='already-exists');
 const second=application(2);delete second.phone;await db.doc('martini_v2_members/ambiguous').set({...member(2),id:'ambiguous',phone:'01099999999'});
 await assert.rejects(service.handle(second,{ip:'no-phone-two'}),e=>e.code==='permission-denied');
});

test('chair shares owner management authority despite stored role overrides, while other roles remain limited',async()=>{
 await db.doc('martini_v2_roles/chair').set({id:'chair',name:'이전 부회장',permissions:['meetings'],revision:5});
 await db.doc('martini_v2_admins/chair').set({role:'chair',displayName:'부회장',active:true,expiresAt:time(86400000),updatedAt:stamp});const chair={uid:'chair',ip:'chair-local'};
 const leader=await service.handle({op:'profile'},chair),president=await service.handle({op:'profile'},owner);assert.deepEqual(leader.permissions,president.permissions);assert.equal(leader.roleName,'부회장');
 await service.handle({op:'listRoles'},chair);await service.handle({op:'read',kind:'admins'},chair);await service.handle({op:'read',kind:'audit'},chair);
 const role=await service.handle({op:'saveRole',revision:0,name:'테스트 부서',permissions:['meetings']},chair);
 await service.handle({op:'saveAdmin',uid:'new-staff',displayName:'테스트 임원',role:role.id,active:true,expiresAt:time(86400000)},chair);
 const staff=(await db.doc('martini_v2_admins/new-staff').get()).data();await service.handle({op:'deleteAdmin',uid:'new-staff',updatedAt:staff.updatedAt},chair);await service.handle({op:'deleteRole',id:role.id,revision:role.revision},chair);
 await assert.rejects(service.handle({op:'deleteRole',id:'chair',revision:0},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'saveRole',id:'chair',revision:0,name:'부회장',permissions:['meetings']},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'deleteAdmin',uid:'chair',updatedAt:stamp},chair),e=>e.code==='failed-precondition');
 await service.handle({op:'saveAdmin',uid:'chair',displayName:'부회장',role:'chair',active:true,expiresAt:time(86400000)},chair);
 await assert.rejects(service.handle({op:'saveAdmin',uid:'chair',displayName:'부회장',role:'education',active:true,expiresAt:time(86400000)},chair),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'listRoles'},education),e=>e.code==='permission-denied');
});
test('short links resolve existing keys, remain scoped and revoke after rotation or deletion',async()=>{
 const resolve=(kind,key)=>service.handle({op:'resolveLink',kind,key},{ip:'short-link'});
 assert.deepEqual(await resolve('e','a'.repeat(64)),{id:event.id});
 const a=await service.handle(application(1),{ip:'member'});
 assert.deepEqual(await resolve('r','1'.repeat(64)),{id:a.id});
 await assert.rejects(resolve('r','a'.repeat(64)),e=>e.code==='not-found');
 await assert.rejects(resolve('e','1'.repeat(64)),e=>e.code==='not-found');
 await assert.rejects(resolve('r','b'.repeat(64)),e=>e.code==='not-found');
 await assert.rejects(resolve('r','short'),e=>e.code==='invalid-argument');
 const renewed=await service.handle({op:'rotateReceipt',id:a.id,reason:'본인 요청'},owner);
 await assert.rejects(resolve('r','1'.repeat(64)),e=>e.code==='not-found');
 assert.deepEqual(await resolve('r',renewed.key),{id:a.id});
 const legacy=await service.handle({op:'receipt',id:a.id,key:renewed.key,action:'get'},{ip:'legacy'});assert.equal(legacy.application.id,a.id);
 const current=(await db.doc('martini_v2_events/'+event.id).get()).data();
 const rotated=await service.handle({op:'rotateEventLink',id:event.id,revision:current.revision},owner);
 await assert.rejects(resolve('e','a'.repeat(64)),e=>e.code==='not-found');
 assert.deepEqual(await resolve('e',rotated.linkKey),{id:event.id});
 await db.doc('martini_v2_applications/'+a.id).update({anonymizedAt:stamp});
 await assert.rejects(resolve('r',renewed.key),e=>e.code==='not-found');
 await db.doc('martini_v2_events/'+event.id).update({deletedAt:stamp});
 await assert.rejects(resolve('e',rotated.linkKey),e=>e.code==='not-found');
});

test('event bank account persists, supports legacy edits, and appears on private receipt',async()=>{
 await service.handle(await eventEditInput({accountNumber:'123-456-789',bankName:'가상은행',accountHolder:'가상동아리',fee:10000,paymentInstructions:''}),owner);
 const a=await service.handle(application(1),{ip:'member'});
 const receipt=await service.handle({op:'receipt',id:a.id,key:'1'.repeat(64),action:'get'},{ip:'member'});
 assert.equal(receipt.event.accountNumber,'123-456-789');assert.equal(receipt.event.bankName,'가상은행');assert.equal(receipt.event.accountHolder,'가상동아리');
 const legacy=await eventEditInput({title:'수정 행사'});delete legacy.accountNumber;delete legacy.bankName;delete legacy.accountHolder;await service.handle(legacy,owner);
 assert.equal((await db.doc('martini_v2_events/'+event.id).get()).data().accountNumber,'123-456-789');
 const preserved=(await db.doc('martini_v2_events/'+event.id).get()).data();assert.equal(preserved.bankName,'가상은행');assert.equal(preserved.accountHolder,'가상동아리');
 await assert.rejects(service.handle(await eventEditInput({bankName:'가'.repeat(81)}),owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(await eventEditInput({accountHolder:'가'.repeat(81)}),owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(await eventEditInput({accountNumber:'<script>'}),owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(await eventEditInput({accountNumber:'1'.repeat(61)}),owner),e=>e.code==='invalid-argument');
 await service.handle(await eventEditInput({accountNumber:'',bankName:'',accountHolder:''}),owner);
 assert.equal((await db.doc('martini_v2_events/'+event.id).get()).data().accountNumber,'');
});
