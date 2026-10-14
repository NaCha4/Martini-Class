import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentFixture,owner } from './helpers/equipment-fixture.mjs';
import { hash } from '../functions/src/domain.js';
import { createAbsenceReport } from '../functions/src/absence-report.js';

function fixture(){
 const f=equipmentFixture(),time=offset=>new Date(f.now()+offset).toISOString();
 const member={id:'member-a',name:'동명이인',studentId:'TEST100',phone:'01000000000',department:'시험학과'};
 const other={...member,id:'member-b',studentId:'TEST200'};
 for(const person of [member,other])f.records.set('martini_v2_semesters/2026-2/members/'+person.id,person);
 const event=(id,extra={})=>f.records.set('martini_v2_events/'+id,{semester:'2026-2',title:id,type:'class',status:'closed',startsAt:time(-7200000),endsAt:time(-3600000),...extra});
 const application=(id,eventId,person=member,extra={})=>f.records.set('martini_v2_applications/'+id,{eventId,memberId:person.id,memberIdentityHash:hash(JSON.stringify([person.name,person.studentId,person.phone])),name:person.name,semester:'2026-2',attendance:'absent',status:'registered',updatedAt:time(-1000),receiptHash:'PRIVATE_RECEIPT',answers:['PRIVATE_ANSWER'],...extra});
 event('one');event('two');application('a-one','one');application('a-two','two');application('b-one','one',other);
 return {...f,time,event,application,member,other,report:(semester)=>f.handle({op:'absenceReport',...(semester?{semester}:{})},owner)};
}

test('report counts each person separately, includes event history, and returns only the necessary private fields',async()=>{
 const f=fixture(),report=await f.report();
 assert.equal(report.semester,'2026-2');assert.deepEqual(report.semesters,['2026-2']);
 assert.equal(report.rows.length,2);
 assert.equal(report.rows.find(row=>row.studentId==='TEST100').records.length,2);
 assert.equal(report.rows.find(row=>row.studentId==='TEST200').records.length,1);
 assert.deepEqual(report.events.map(event=>event.absences).sort(),[1,2]);
 assert.doesNotMatch(JSON.stringify(report),/01000000000|PRIVATE_RECEIPT|PRIVATE_ANSWER|memberIdentityHash|identityHash|receiptHash|phone/);
 assert.deepEqual(f.writes,[]);
});

test('only registered absences in finished events count; pending, cancelled, deleted and anonymized records are excluded',async()=>{
 const f=fixture();
 for(const [id,extra] of [['future',{startsAt:f.time(3600000),endsAt:f.time(7200000)}],['running',{startsAt:f.time(-1000),endsAt:f.time(3600000)}],['cancelled',{status:'cancelled'}],['draft',{status:'draft'}],['deleted',{deletedAt:f.time(-1)}]]){f.event(id,extra);f.application('a-'+id,id);}
 for(const status of ['waiting','offered','cancelled','expired'])f.application(status,'one',{...f.member,id:status,studentId:status},{status});
 f.application('anonymized','two',f.other,{anonymizedAt:f.time(-1)});
 f.application('deleted','two',f.other,{deletedAt:f.time(-1)});
 const report=await f.report();assert.equal(report.rows.length,2);assert.equal(report.rows.reduce((sum,row)=>sum+row.records.length,0),3);
 assert.deepEqual(report.events.map(event=>event.id).sort(),['one','two']);
});

test('completed events count, unchecked attendance is separate, and a corrected duplicate or refreshed attendance is not double counted',async()=>{
 const f=fixture();f.event('two',{status:'completed',endsAt:f.time(3600000)});
 f.application('a-one-latest','one',f.member,{attendance:'present',updatedAt:f.time(0)});
 f.application('b-two','two',f.other,{attendance:'unchecked'});
 let report=await f.report();
 assert.equal(report.rows.find(row=>row.studentId==='TEST100').records.filter(row=>row.attendance==='absent').length,1);
 assert.equal(report.events.find(event=>event.id==='two').unchecked,1);
 assert.equal(report.events.find(event=>event.id==='one').registrations,2);
 f.records.get('martini_v2_applications/a-two').attendance='present';
 report=await f.report();assert.equal(report.rows.some(row=>row.studentId==='TEST100'),false);assert.deepEqual(f.writes,[]);
});

test('historical unmatched identities never borrow a same-named member identity and removed members keep their history',async()=>{
 const f=fixture();
 f.records.get('martini_v2_semesters/2026-2/members/member-a').removedAt=f.time(-1);
 f.application('old-identity','two',f.member,{memberIdentityHash:hash('older identity')});
 const report=await f.report();assert.equal(report.rows.length,3);
 assert.equal(report.rows.find(row=>row.studentId==='TEST100').removed,true);
 const unmatched=report.rows.find(row=>!row.rosterMatched);assert.equal(unmatched.name,'동명이인');assert.equal(unmatched.studentId,'');
});

test('the chosen semester isolates applications and roster records while semester options remain available',async()=>{
 const f=fixture();f.event('older',{semester:'2026-1'});f.application('older-app','older',f.member,{semester:'2026-1'});
 f.records.set('martini_v2_semesters/2026-1/members/member-a',f.member);
 const report=await f.report('2026-1');assert.equal(report.rows.length,1);assert.deepEqual(report.rows[0].records.map(row=>row.eventId),['older']);assert.deepEqual(report.semesters,['2026-2','2026-1']);
 for(const semester of ['all','2026-3','../members'])await assert.rejects(f.report(semester),error=>error.code==='invalid-argument');
});

test('anonymous, finance-only, unrelated and request-viewer accounts cannot read the report',async()=>{
 const f=fixture(),collections=[];const original=f.db.collection;
 f.db.collection=name=>{collections.push(name);return original(name);};
 f.records.set('martini_v2_admins/finance',{role:'finance',active:true,expiresAt:f.time(3600000)});
 for(const actor of [{},{uid:'finance'},{uid:'publicity'},{uid:'requestsViewer',authTime:Math.floor(f.now()/1000),verifyAuthSession:async()=>{}}]){
  collections.length=0;
  await assert.rejects(f.handle({op:'absenceReport'},actor),error=>['unauthenticated','permission-denied'].includes(error.code));
  assert.ok(collections.every(name=>['martini_v2_admins','martini_v2_roles'].includes(name)));
 }
 const report=await f.handle({op:'absenceReport'},{uid:'education'});assert.equal(report.rows.length,2);assert.deepEqual(f.writes,[]);
});

test('oversized reports fail explicitly instead of returning incomplete totals',async()=>{
 const now=Date.now(),who={role:'owner',active:true,expiresAt:new Date(now+10000).toISOString()};
 const report=createAbsenceReport({clock:()=>now,col:name=>name==='settings'?{doc:()=>({kind:'settings'})}:{limit:()=>({kind:'events'})},db:{runTransaction:async(run,options)=>{assert.equal(options.readOnly,true);return run({get:async query=>query.kind==='settings'?{data:()=>({semester:'2026-2'})}:{size:2001,docs:[]}});}}});
 await assert.rejects(report({},who),error=>error.code==='resource-exhausted');
});
