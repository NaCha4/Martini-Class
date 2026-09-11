import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from '../functions/node_modules/firebase-admin/lib/app/index.js';
import {getFirestore} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {createService} from '../functions/src/service.js';
import {decisionCategoryOptions,decisionCategoryId,decisionBoardUrl,readDecisionCategories} from '../web/src/decision-categories.js';

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

const category=(requestId,name=requestId,who=owner)=>service.handle({op:'createDecisionCategory',requestId,name},who);
const categories=()=>readDecisionCategories({state:{},api:(op,data)=>service.handle({op,...data},owner)});

test('standalone categories validate names, retry safely, and never modify activity events',async()=>{
 const before=(await db.collection('martini_v2_events').get()).docs.map(d=>d.data());
 const created=await category('cat','  개강   총회  ',publicity);assert.deepEqual(created,{id:'cat',name:'개강 총회',revision:1});
 assert.deepEqual(await category('cat','개강 총회'),created);
 for(const name of ['','   ','a'.repeat(81)])await assert.rejects(category('invalid',name),e=>e.code==='invalid-argument');
 await assert.rejects(category('cat','다른 이름'),e=>e.code==='failed-precondition');
 await assert.rejects(category('other','개강 총회'),e=>e.code==='already-exists');
 assert.deepEqual((await db.collection('martini_v2_events').get()).docs.map(d=>d.data()),before);
 const log=await db.collection('martini_v2_audit').where('entityType','==','decisionCategories').get();assert.equal(log.size,1);
});

test('concurrent category creation reserves a name once',async()=>{
 const results=await Promise.allSettled([category('one','교육'),category('two','교육')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'already-exists');
 assert.equal((await categories()).length,1);
});

test('category assignment is independent of events and survives legacy saves with revision history',async()=>{
 await category('cat-a');await category('cat-b');
 let saved=await service.handle(input({categoryId:'cat-a'}),publicity);assert.equal(saved.categoryId,'cat-a');assert.equal(saved.eventId,'');
 saved=await service.handle(input({id:saved.id,revision:saved.revision,eventId:'a',status:'done'}),owner);assert.equal(saved.categoryId,'cat-a');
 await db.doc('martini_v2_events/a').delete();
 saved=await service.handle(input({id:saved.id,revision:saved.revision,categoryId:'cat-b'}),owner);assert.equal(saved.categoryId,'cat-b');
 saved=await service.handle(input({id:saved.id,revision:saved.revision,categoryId:''}),owner);assert.equal(saved.categoryId,'');
 const history=await db.doc('martini_v2_decisions/'+saved.id).collection('revisions').orderBy('revision').get();
 assert.deepEqual(history.docs.map(d=>d.data().categoryId),['cat-a','cat-a','cat-b','']);
 for(const categoryId of ['missing','a'])await assert.rejects(service.handle(input({categoryId}),owner),e=>e.code==='not-found');
 await assert.rejects(service.handle(input({categoryId:'invalid/path'}),owner),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle(input({id:saved.id,revision:1,categoryId:'cat-b'}),owner),e=>e.code==='aborted');
});

test('deleting a category preserves records in common and reusing its name starts an empty category',async()=>{
 await category('cat','총회');
 const saved=await service.handle(input({categoryId:'cat'}),owner),ref=db.doc('martini_v2_decisions/'+saved.id),before=(await ref.get()).data();
 await assert.rejects(service.handle({op:'deleteDecisionCategory',id:'cat',revision:2},owner),e=>e.code==='aborted');
 await service.handle({op:'deleteDecisionCategory',id:'cat',revision:1},publicity);
 assert.deepEqual((await ref.get()).data(),before);assert.equal((await ref.collection('revisions').get()).size,1);
 assert.equal(decisionCategoryOptions(await categories(),[saved]).rows.length,1);
 await assert.rejects(service.handle(input({categoryId:'cat'}),owner),e=>e.code==='not-found');
 await assert.rejects(category('cat','총회'),e=>e.code==='failed-precondition');
 await category('replacement','총회');
 assert.equal(decisionCategoryOptions(await categories(),[saved],'replacement').rows.length,0);
 const updated=await service.handle(input({id:saved.id,revision:saved.revision,categoryId:'cat',status:'done'}),owner);
 assert.equal(updated.categoryId,'');assert.equal(updated.status,'done');
 assert.equal((await ref.collection('revisions').get()).size,2);
});

test('a racing category deletion and new task cannot leave work hidden',async()=>{
 await category('race');
 const results=await Promise.allSettled([service.handle(input({categoryId:'race'}),owner),service.handle({op:'deleteDecisionCategory',id:'race',revision:1},owner)]);
 assert.equal(results[1].status,'fulfilled');
 if(results[0].status==='rejected')assert.equal(results[0].reason.code,'not-found');
 const records=(await service.handle({op:'read',kind:'decisions'},owner)).rows;
 assert.equal(decisionCategoryOptions(await categories(),records).rows.length,records.length);
});

test('all category operations require decision permission without granting event access',async()=>{
 await category('cat','업무',publicity);
 const requests=[{op:'decisionCategories'},{op:'createDecisionCategory',requestId:'other',name:'다른 업무'},{op:'deleteDecisionCategory',id:'cat',revision:1}];
 for(const request of requests)await assert.rejects(service.handle(request,{uid:null}),e=>e.code==='unauthenticated');
 await assert.rejects(service.handle({op:'read',kind:'events'},publicity),e=>e.code==='permission-denied');
 await db.doc('martini_v2_roles/content-only').set({name:'게시 담당',permissions:['content']});await db.doc('martini_v2_admins/publicity').update({role:'content-only'});
 for(const request of requests)await assert.rejects(service.handle(request,publicity),e=>e.code==='permission-denied');
});

test('category pagination crosses deleted pages and common work includes legacy and orphan records',async()=>{
 const batch=db.batch();for(let i=0;i<202;i++)batch.set(db.doc('martini_v2_decisionCategories/x'+String(i).padStart(3,'0')),{name:'분류 '+i,revision:1,...(i<100?{deletedAt:stamp}:{})});await batch.commit();
 const all=await categories();assert.equal(all.length,102);assert.deepEqual(Object.keys(all[0]).sort(),['id','name','revision']);
 const records=[{id:'old',eventId:'a'},{id:'common',categoryId:''},{id:'deleted',categoryId:'x000'},{id:'missing',categoryId:'missing'},{id:'active',categoryId:'x100'}];
 assert.deepEqual(decisionCategoryOptions(all,records).rows.map(d=>d.id),['old','common','deleted','missing']);
 assert.equal(decisionCategoryOptions(all,records,'x100').rows.length,1);
 assert.equal(decisionCategoryId('/admin/decisions/','?category=x100'),'x100');assert.equal(decisionCategoryId('/admin/meetings','?category=x100'),'');
 assert.equal(decisionCategoryId('/admin/decisions','?event=a'),'');assert.equal(decisionBoardUrl('x100'),'/admin/decisions?category=x100');
});

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
