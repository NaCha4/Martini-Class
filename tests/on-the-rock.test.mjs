import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from '../functions/node_modules/firebase-admin/lib/app/index.js';
import {getFirestore} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {createService} from '../functions/src/service.js';
import {BINGO_MISSIONS} from '../functions/src/on-the-rock-rules.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Local emulator required');
process.env.FIRESTORE_EMULATOR_HOST=host;
const projectId='demo-martini-on-the-rock-tests',app=initializeApp({projectId},'on-the-rock-tests'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),semester='2026-2',staff={uid:'staff'},service=createService(db,()=>now);
const call=(op,data={},who=staff)=>service.handle({op,...data},who);
const createGroup=(requestId='one',extra={})=>call('saveOnTheRockGroup',{requestId,semester,name:requestId,memberCount:5,...extra});
const record=(requestId,extra={})=>call('recordOnTheRockMission',{requestId,groupId:'one',semester,kind:'bingo',missionId:'meal',allParticipated:false,completedAt:stamp,...extra});
const board=(extra={})=>call('onTheRockBoard',{semester,groupId:'one',...extra});
const edit=(id,extra={})=>call('updateOnTheRockRecord',{id,groupId:'one',semester,revision:1,allParticipated:false,completedAt:stamp,...extra});
const undo=(id,extra={})=>call('voidOnTheRockRecord',{id,groupId:'one',semester,revision:1,...extra});
const groupRef=(id='one',term=semester)=>db.doc('martini_v2_semesters/'+term+'/onTheRockGroups/'+id);
const audits=()=>db.collection('martini_v2_audit').get();
beforeEach(async()=>{
 const response=await fetch('http://'+host+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
 const batch=db.batch();
 batch.set(db.doc('martini_v2_roles/record-only'),{name:'기록 담당',permissions:[]});
 batch.set(db.doc('martini_v2_admins/staff'),{role:'record-only',active:true,displayName:'가상 운영진',expiresAt:new Date(now+86400000).toISOString()});
 batch.set(db.doc('martini_v2_settings/club'),{semester});await batch.commit();
});
after(async()=>deleteApp(app));

test('group creation retries once, supports metadata edits, and uses existing audit',async()=>{
 const created=await createGroup('one',{name:'  1조  ',memberCount:0});
 assert.equal(created.name,'1조');assert.equal(created.revision,1);assert.equal(created.score.total,0);
 assert.deepEqual(await createGroup('one',{name:'1조',memberCount:0}),created);
 assert.equal((await audits()).size,1);
 await assert.rejects(createGroup('one',{name:'다른 조'}),e=>e.code==='failed-precondition');
 const changed=await call('saveOnTheRockGroup',{id:'one',semester,name:'친구들',memberCount:7,revision:1});
 assert.equal(changed.revision,2);assert.equal(changed.name,'친구들');
 await assert.rejects(call('saveOnTheRockGroup',{id:'one',semester,name:'구버전',memberCount:4,revision:1}),e=>e.code==='aborted');
 const log=(await audits()).docs.map(d=>d.data());assert.equal(log.length,2);
 assert.ok(log.every(row=>row.entityType==='onTheRockGroups'&&row.actor==='staff'&&row.actorName==='가상 운영진'&&row.semester===semester));
 const noCount=await call('saveOnTheRockGroup',{requestId:'no-count',semester,name:'인원 미정'});assert.equal(noCount.memberCount,0);
});

test('recording uses staff judgement for attendance full participation and repeat timing',async()=>{
 await createGroup();
 await record('follow',{missionId:'martini-follow',participants:1});
 await record('repeat-one',{kind:'repeat',missionId:'bar',participants:8,allParticipated:true});
 await record('repeat-two',{kind:'repeat',missionId:'bar',completedAt:stamp});
 await record('meal',{allParticipated:true,participants:1});
 let result=await board();assert.equal(result.score.total,65);assert.equal(result.score.participationBonus,5);
 assert.equal(result.records.find(r=>r.id==='meal').allParticipated,true);
 await call('saveOnTheRockGroup',{id:'one',semester,name:'one',memberCount:9,revision:1});
 result=await board();assert.equal(result.score.participationBonus,5);
 await edit('meal',{allParticipated:true,note:'나중에 메모 추가'});assert.equal((await board()).score.participationBonus,5);
});

test('mission registration is idempotent and concurrent duplicate bingo special records score once',async()=>{
 await createGroup();
 const attempts=await Promise.all([record('meal'),record('meal')]);assert.deepEqual(attempts[0],attempts[1]);
 assert.equal((await audits()).size,2);
 await assert.rejects(record('meal',{allParticipated:true}),e=>e.code==='failed-precondition');
 for(const [kind,missionId] of [['bingo','movie'],['special','event-class']]){
  const results=await Promise.allSettled([record(kind+'-a',{kind,missionId}),record(kind+'-b',{kind,missionId})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'already-exists');
 }
 const result=await board();assert.equal(result.records.length,3);assert.equal(result.score.total,100);assert.equal((await audits()).size,4);
});

test('simultaneous different repeats are retained with no automatic cooldown judgement',async()=>{
 await createGroup();
 await Promise.all(Array.from({length:5},(_,i)=>record('repeat-'+i,{kind:'repeat',missionId:'meal'})));
 const result=await board();assert.equal(result.records.length,5);assert.equal(result.score.total,50);assert.equal(result.group.revision,1);
 assert.equal((await groupRef().get()).data().recordsVersion,5);
});

test('editing and cancelling recompute board points and preserve correction audit records',async()=>{
 await createGroup();
 for(const mission of BINGO_MISSIONS.slice(0,4))await record(mission.id,{missionId:mission.id});
 assert.equal((await board()).score.total,130);
 const changed=await edit('bowling',{allParticipated:true,note:'전원 참여 확인'});assert.equal(changed.revision,2);
 assert.equal((await board()).score.total,135);
 await assert.rejects(edit('bowling'),e=>e.code==='aborted');
 await undo('martini-follow');assert.equal((await board()).score.total,95);
 const before=(await audits()).size;await undo('martini-follow');assert.equal((await audits()).size,before);
 await assert.rejects(edit('martini-follow'),e=>e.code==='failed-precondition');
 await record('replacement',{missionId:'martini-follow',allParticipated:true});assert.equal((await board()).score.total,140);
 const result=await board();assert.equal(result.records.length,5);assert.ok(result.records.find(r=>r.id==='martini-follow').voidedAt);
 const log=(await audits()).docs.map(d=>d.data());assert.ok(log.some(row=>row.action.includes('수정')&&row.entityType==='onTheRockRecords'));assert.ok(log.some(row=>row.action.includes('취소')&&row.entityType==='onTheRockRecords'));
});

test('bingo undo is independent of repeat entries and audit transactions roll back on invalid input',async()=>{
 await createGroup();await record('meal');await record('repeat',{kind:'repeat'});
 await undo('meal');assert.equal((await board()).score.total,10);
 const before=(await audits()).size;
 for(const extra of [{missionId:'missing'},{kind:'special',missionId:'meal'},{points:900},{participants:-1},{completedAt:'invalid'}])await assert.rejects(record('invalid',extra),e=>e.code==='invalid-argument');
 assert.equal((await audits()).size,before);assert.equal((await board()).records.length,2);
});

test('all endpoints require an active existing admin but no additional role permissions',async()=>{
 await createGroup();await record('meal');
 const requests=[['onTheRockBoard',{}],['saveOnTheRockGroup',{requestId:'other',semester,name:'다른 조'}],['recordOnTheRockMission',{requestId:'other',groupId:'one',semester,kind:'bingo',missionId:'movie',allParticipated:false,completedAt:stamp}],['updateOnTheRockRecord',{id:'meal',groupId:'one',semester,revision:1,allParticipated:true,completedAt:stamp}],['voidOnTheRockRecord',{id:'meal',groupId:'one',semester,revision:1}]];
 for(const [op,data] of requests){await assert.rejects(call(op,data,{}),e=>e.code==='unauthenticated');await assert.rejects(call(op,data,{uid:'unknown'}),e=>e.code==='permission-denied');}
 await assert.rejects(call('read',{kind:'members',semester}),e=>e.code==='permission-denied');
 await db.doc('martini_v2_admins/staff').update({active:false});
 for(const [op,data] of requests)await assert.rejects(call(op,data),e=>e.code==='permission-denied');
 await db.doc('martini_v2_admins/staff').update({active:true,expiresAt:new Date(now-1).toISOString()});
 for(const [op,data] of requests)await assert.rejects(call(op,data),e=>e.code==='permission-denied');
});

test('semester and group boundaries isolate records even when IDs match',async()=>{
 await createGroup();await createGroup('two');await createGroup('one',{semester:'2026-1'});
 await record('same',{allParticipated:true});await record('same',{groupId:'two',missionId:'movie'});await record('same',{semester:'2026-1',missionId:'trip'});
 assert.equal((await board()).score.total,15);assert.equal((await board({groupId:'two'})).score.total,40);assert.equal((await board({semester:'2026-1'})).score.total,60);
 await undo('same',{groupId:'two'});assert.equal((await board()).score.total,15);
 await assert.rejects(board({semester:'2025-1'}),e=>e.code==='not-found');
 await assert.rejects(record('x',{groupId:'missing'}),e=>e.code==='not-found');
 const initial=await call('onTheRockBoard');assert.equal(initial.semester,semester);assert.equal(initial.groups.length,2);assert.equal(initial.group,null);assert.deepEqual(initial.records,[]);
});

test('board derives complete history beyond five hundred records with accurate group totals',async()=>{
 await createGroup();
 for(let offset=0;offset<503;offset+=400){
  const batch=db.batch();
  for(let i=offset;i<Math.min(offset+400,503);i++)batch.set(groupRef().collection('records').doc('repeat-'+i),{kind:'repeat',missionId:'meal',participants:null,allParticipated:false,completedAt:stamp,note:'',revision:1,actorName:'가상 운영진',memberCountSnapshot:5});
  await batch.commit();
 }
 const result=await board();assert.equal(result.records.length,503);assert.equal(result.score.total,5030);assert.equal(result.groups[0].score.total,5030);
});
