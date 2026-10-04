import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Local emulator required');
process.env.FIRESTORE_EMULATOR_HOST=host;
const projectId='demo-martini-inventory-tests',app=initializeApp({projectId},'inventory-board-tests'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),service=createService(db,()=>now),owner={uid:'owner'},education={uid:'education'},finance={uid:'finance'};
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MwAAAABJRU5ErkJggg==';
const legacy={id:'gin',name:'진',category:'spirit',unit:'bottle',size:700,location:'선반 A',minimum:1400,note:'기존 상세 메모',quantity:2,bottles:{opened:60},revision:4,createdAt:stamp,updatedAt:stamp,createdBy:'owner',updatedBy:'owner'};
const inventory=id=>db.doc('martini_v2_inventory/'+id);
const save=(data,who=owner)=>service.handle({op:'saveItem',...data},who);
const category=(name,extra={})=>service.handle({op:'saveInventoryCategory',name,...extra},education);
const move=(item,categoryId,extra={})=>service.handle({op:'moveInventoryItem',id:item.id,revision:item.revision,categoryId,...extra},education);
beforeEach(async()=>{
 const response=await fetch('http://'+host+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
 const batch=db.batch();
 for(const role of ['owner','education','finance'])batch.set(db.doc('martini_v2_admins/'+role),{role,active:true,displayName:role,expiresAt:new Date(now+86400000).toISOString()});
 batch.set(inventory('gin'),legacy);await batch.commit();
});
after(async()=>deleteApp(app));

test('name-only creation uses safe defaults and name/photo edits preserve every stock detail',async()=>{
 const created=await save({name:'셰이커'});
 for(const [key,value] of Object.entries({category:'supply',categoryId:'',unit:'each',size:0,location:'',minimum:0,note:'',photo:'',quantity:0,bottles:{}}))assert.deepEqual(created[key],value);
 let edited=await save({id:'gin',revision:4,name:'이름 변경',photo},education);
 assert.equal(edited.categoryId,'legacy-spirit');assert.equal(edited.photo,photo);
 for(const key of ['category','unit','size','location','minimum','note','quantity','bottles','createdAt','createdBy'])assert.deepEqual(edited[key],legacy[key]);
 edited=await save({id:edited.id,revision:edited.revision,name:'사진 유지'});assert.equal(edited.photo,photo);
 edited=await save({id:edited.id,revision:edited.revision,name:'사진 제거',photo:''});assert.equal(edited.photo,'');
 assert.equal((await inventory('gin').get()).data().quantity,2);
 assert.equal((await db.collection('martini_v2_stockMoves').get()).size,0);
 const audit=(await db.collection('martini_v2_audit').get()).docs.map(doc=>doc.data());
 assert.equal(JSON.stringify(audit).includes('data:image'),false);
 await assert.rejects(save({id:'gin',revision:edited.revision,name:'단위 변경',unit:'each'}),e=>e.code==='failed-precondition');
 await assert.rejects(save({id:'gin',revision:4,name:'낡은 수정'}),e=>e.code==='aborted');
 await assert.rejects(save({name:'없는 기록',revision:2}),e=>e.code==='aborted');
});

test('legacy reads do not migrate data, explicit board categories survive older-client edits',async()=>{
 let rows=(await service.handle({op:'read',kind:'inventory'},education)).rows;
 assert.equal(rows[0].categoryId,'legacy-spirit');assert.deepEqual((await inventory('gin').get()).data(),legacy);
 const c=await category('  도구   보관  ');assert.equal(c.name,'도구 보관');
 let item=await move(legacy,c.id);
 const before=(await inventory('gin').get()).data();
 for(const key of ['name','category','unit','size','location','minimum','note','quantity','bottles','createdAt','createdBy'])assert.deepEqual(before[key],legacy[key]);
 item=await save({id:item.id,revision:item.revision,name:'구형 화면 수정',category:'spirit',unit:'bottle',size:700,location:'선반 B',minimum:500,note:'구형 메모'});
 assert.equal(item.categoryId,c.id);assert.equal(item.quantity,2);assert.deepEqual(item.bottles,{opened:60});
 item=await move(item,'');assert.equal(item.categoryId,'');
 rows=(await service.handle({op:'read',kind:'inventory',recordId:item.id},education)).rows;assert.equal(rows[0].categoryId,'');
});

test('category moves only update assignment/revision metadata, persist photos and reject stale/invalid targets',async()=>{
 const a=await category('A'),b=await category('B');
 let item=await save({name:'사진 품목',photo,categoryId:a.id});
 const before=(await inventory(item.id).get()).data();item=await move(item,b.id);
 const after=(await inventory(item.id).get()).data();
 for(const key of Object.keys(before))if(!['categoryId','revision','updatedAt','updatedBy'].includes(key))assert.deepEqual(after[key],before[key]);
 assert.equal(after.photo,photo);assert.equal(after.revision,before.revision+1);
 await assert.rejects(move({...item,revision:before.revision},a.id),e=>e.code==='aborted');
 for(const categoryId of ['missing','legacy-missing'])await assert.rejects(move(item,categoryId),e=>e.code==='not-found');
 await assert.rejects(move(item,'bad/path'),e=>e.code==='invalid-argument');
 await assert.rejects(move(item,a.id,{quantity:50}),e=>e.code==='invalid-argument');
 await assert.rejects(move({id:'missing',revision:1},a.id),e=>e.code==='not-found');
 await assert.rejects(save({name:'잘못된 분류',categoryId:'missing'}),e=>e.code==='not-found');
 await assert.rejects(save({name:'SVG',photo:'data:image/svg+xml;base64,PHN2Zy8+'}),e=>e.code==='invalid-argument');
 await assert.rejects(save({name:'큰 이미지',photo:photo+'A'.repeat(160000)}),e=>e.code==='invalid-argument');
});

test('categories rename with revisions, keep unique names and delete only when empty',async()=>{
 const c=await category('  직접   분류  ');
 assert.deepEqual(Object.keys(c).sort(),['id','name','revision']);assert.equal(c.name,'직접 분류');
 await assert.rejects(category('직접 분류'),e=>e.code==='already-exists');
 const renamed=await category('새 분류',{id:c.id,revision:1});assert.equal(renamed.revision,2);
 await assert.rejects(category('오래된 수정',{id:c.id,revision:1}),e=>e.code==='aborted');
 await assert.rejects(category('수정',{id:'legacy-spirit',revision:1}),e=>e.code==='failed-precondition');
 await assert.rejects(category('수정',{id:'missing',revision:1}),e=>e.code==='not-found');
 const item=await move(legacy,c.id);
 const remove=revision=>service.handle({op:'deleteInventoryCategory',id:c.id,revision},education);
 await assert.rejects(remove(1),e=>e.code==='aborted');await assert.rejects(remove(2),e=>e.code==='failed-precondition');
 assert.equal((await service.handle({op:'listInventoryCategories'},owner)).rows[0].revision,2);
 await move(item,'');await remove(2);
 assert.deepEqual(await service.handle({op:'listInventoryCategories'},owner),{rows:[]});
 await assert.rejects(move({...item,revision:item.revision+1},c.id),e=>e.code==='not-found');
 assert.notEqual((await category('새 분류')).id,c.id);
});

test('concurrent category naming and deletion/assignment preserve category membership',async()=>{
 const creation=await Promise.allSettled([category('동일 이름'),category('동일 이름')]);
 assert.equal(creation.filter(r=>r.status==='fulfilled').length,1);assert.equal(creation.find(r=>r.status==='rejected').reason.code,'already-exists');
 const c=await category('경합');
 const results=await Promise.allSettled([move(legacy,c.id),service.handle({op:'deleteInventoryCategory',id:c.id,revision:c.revision},education)]);
 const current=(await inventory('gin').get()).data(),categoryDoc=(await db.doc('martini_v2_inventoryCategories/'+c.id).get()).data();
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 if(categoryDoc.deletedAt){assert.notEqual(current.categoryId,c.id);assert.equal(results[0].reason.code,'not-found');}
 else{assert.equal(current.categoryId,c.id);assert.equal(results[1].reason.code,'failed-precondition');}
});

test('all inventory endpoints require active inventory permission and never grant finance access',async()=>{
 const c=await category('권한 확인');
 const requests=[{op:'listInventoryCategories'},{op:'saveInventoryCategory',name:'실패'},{op:'deleteInventoryCategory',id:c.id,revision:1},{op:'moveInventoryItem',id:'gin',revision:4,categoryId:c.id},{op:'saveItem',name:'실패'},{op:'read',kind:'inventory'}];
 for(const request of requests){
  await assert.rejects(service.handle(request,finance),e=>e.code==='permission-denied');
  await assert.rejects(service.handle(request,{}),e=>e.code==='unauthenticated');
 }
 await db.doc('martini_v2_admins/education').update({expiresAt:new Date(now-1).toISOString()});
 for(const request of requests)await assert.rejects(service.handle(request,education),e=>e.code==='permission-denied');
});

test('stock adjustments preserve photo and board assignment while move conflicts prevent lost quantity',async()=>{
 const c=await category('바 도구');let item=await save({name:'셰이커',photo,categoryId:c.id});
 item=await service.handle({op:'stock',id:item.id,revision:item.revision,requestId:'receive-one',action:'receive',amount:3,reason:'입고'},education);
 assert.equal(item.quantity,3);assert.equal(item.photo,photo);assert.equal(item.categoryId,c.id);
 const before={...item};item=await move(item,'');assert.equal(item.quantity,3);
 await assert.rejects(service.handle({op:'stock',id:item.id,revision:before.revision,requestId:'use-stale',action:'use',amount:1,reason:'낡은 기록'},education),e=>e.code==='aborted');
 item=await service.handle({op:'stock',id:item.id,revision:item.revision,requestId:'use-current',action:'use',amount:1,reason:'사용'},education);
 assert.equal(item.quantity,2);assert.equal(item.categoryId,'');assert.equal(item.photo,photo);
 const history=(await db.collection('martini_v2_stockMoves').get()).docs.map(d=>d.data());
 assert.equal(history.length,2);assert.equal(JSON.stringify(history).includes('data:image'),false);
});
