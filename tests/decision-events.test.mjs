import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from '../functions/node_modules/firebase-admin/lib/app/index.js';
import {getFirestore} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {createService} from '../functions/src/service.js';
import {decisionEventOptions,decisionEventId,decisionBoardUrl,readDecisionEvents} from '../web/src/decision-events.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Local emulator required');
process.env.FIRESTORE_EMULATOR_HOST=host;
const projectId='demo-martini-decision-tests',app=initializeApp({projectId},'decision-events-tests'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),service=createService(db,()=>now),owner={uid:'owner'},publicity={uid:'publicity'};
const base={title:'행사 준비',body:'준비 내용',type:'action',meetingId:'',agendaId:'',owner:'교육부',dueAt:'',status:'proposed',semester:'2026-2'};
const input=(extra={})=>({op:'saveDecision',revision:0,...base,...extra});
beforeEach(async()=>{
 const r=await fetch('http://'+host+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(r.ok,true);
 const batch=db.batch();
 for(const role of ['owner','publicity'])batch.set(db.doc('martini_v2_admins/'+role),{role,active:true,displayName:role,expiresAt:new Date(now+86400000).toISOString()});
 for(const id of ['a','b','archived'])batch.set(db.doc('martini_v2_events/'+id),{title:'가상 행사 '+id,semester:'2026-2',status:'draft',startsAt:stamp,updatedAt:stamp,linkHash:'private-test-value',accountNumber:'test-account',...(id==='archived'?{deletedAt:stamp}:{})});
 await batch.commit();
});
after(async()=>deleteApp(app));

test('event assignment validates targets and retains revision and meeting history',async()=>{
 await db.doc('martini_v2_meetings/meeting').set({id:'meeting',title:'회의',agendas:[{id:'agenda'}],updatedAt:stamp});
 let saved=await service.handle(input({eventId:'a',meetingId:'meeting',agendaId:'agenda'}),owner);
 assert.equal(saved.eventId,'a');
 saved=await service.handle(input({id:saved.id,revision:saved.revision,eventId:'b',meetingId:'meeting',agendaId:'agenda',status:'in_progress'}),owner);
 assert.equal(saved.eventId,'b');assert.equal(saved.agendaId,'agenda');assert.equal(saved.body,base.body);
 const history=await db.doc('martini_v2_decisions/'+saved.id).collection('revisions').orderBy('revision').get();
 assert.deepEqual(history.docs.map(d=>d.data().eventId),['a','b']);
 await assert.rejects(service.handle(input({eventId:'missing'}),owner),e=>e.code==='not-found');
 await assert.rejects(service.handle(input({eventId:'archived'}),owner),e=>e.code==='not-found');
 await assert.rejects(service.handle(input({eventId:'invalid/path'}),owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(input({id:saved.id,revision:1,eventId:'a'}),owner),e=>e.code==='aborted');
});
test('legacy clients preserve event linkage, while explicit empty moves to common work',async()=>{
 let saved=await service.handle(input({eventId:'a'}),owner);
 saved=await service.handle(input({id:saved.id,revision:saved.revision,status:'done'}),owner);
 assert.equal(saved.eventId,'a');
 await db.doc('martini_v2_events/a').update({deletedAt:stamp});
 saved=await service.handle(input({id:saved.id,revision:saved.revision,status:'in_progress'}),owner);
 assert.equal(saved.eventId,'a');
 saved=await service.handle(input({id:saved.id,revision:saved.revision,eventId:''}),owner);assert.equal(saved.eventId,'');
 const legacy=await service.handle(input(),owner);assert.equal(legacy.eventId,'');
});
test('decision-only staff receive minimal paginated event labels without broader access',async()=>{
 const catalog=await service.handle({op:'decisionEvents'},publicity);
 assert.equal(catalog.rows.length,3);
 assert.deepEqual(Object.keys(catalog.rows[0]).sort(),['archived','id','semester','startsAt','status','title']);
 assert.equal(catalog.rows.find(e=>e.id==='archived').archived,true);
 await service.handle(input({eventId:'a'}),publicity);
 await assert.rejects(service.handle({op:'read',kind:'events'},publicity),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'read',kind:'applications'},publicity),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'decisionEvents'},{uid:null}),e=>e.code==='unauthenticated');
 await db.doc('martini_v2_roles/content-only').set({name:'게시 담당',permissions:['content']});
 await db.doc('martini_v2_admins/publicity').update({role:'content-only'});
 await assert.rejects(service.handle({op:'decisionEvents'},publicity),e=>e.code==='permission-denied');
 await assert.rejects(service.handle(input({eventId:'a'}),publicity),e=>e.code==='permission-denied');
});
test('event decisions paginate past 500 and do not include other events or deleted records',async()=>{
 for(let offset=0;offset<503;offset+=400){const batch=db.batch();for(let i=offset;i<Math.min(503,offset+400);i++)batch.set(db.doc('martini_v2_decisions/d'+String(i).padStart(4,'0')),{...base,eventId:'a',updatedAt:stamp,revision:1});await batch.commit();}
 await db.doc('martini_v2_decisions/other').set({...base,eventId:'b',updatedAt:stamp});
 await db.doc('martini_v2_decisions/legacy').set({...base,updatedAt:stamp});
 await db.doc('martini_v2_decisions/deleted').set({...base,eventId:'a',updatedAt:stamp,deletedAt:stamp});
 const rows=[];let cursor,pages=0;do{const page=await service.handle({op:'read',kind:'decisions',eventId:'a',...(cursor?{cursor}:{})},owner);rows.push(...page.rows);cursor=page.nextCursor;pages++;}while(cursor);
 assert.equal(rows.length,503);assert.equal(new Set(rows.map(r=>r.id)).size,503);assert.equal(rows.every(d=>d.eventId==='a'),true);assert.ok(pages>5);
});
test('catalog pagination and UI grouping preserve legacy common work and archived boards',async()=>{
 const batch=db.batch();for(let i=0;i<102;i++)batch.set(db.doc('martini_v2_events/x'+String(i).padStart(3,'0')),{title:'행사 '+i,semester:'2026-2',startsAt:stamp});await batch.commit();
 const events=await readDecisionEvents({state:{},api:(op,data)=>service.handle({op,...data},owner)});assert.equal(events.length,105);
 const records=[{id:'old'},{id:'common',eventId:''},{id:'active',eventId:'a'},{id:'archived',eventId:'archived'}];
 const common=decisionEventOptions(events,records);assert.deepEqual(common.rows.map(r=>r.id),['old','common']);
 const archived=decisionEventOptions(events,records,'archived');assert.equal(archived.rows.length,1);assert.equal(archived.event.archived,true);
 assert.equal(decisionEventId('/admin/decisions/','?event=a'),'a');assert.equal(decisionEventId('/admin/meetings','?event=a'),'');assert.equal(decisionBoardUrl('a'),'/admin/decisions?event=a');
});
