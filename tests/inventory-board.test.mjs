import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { stockTotal } from '../functions/src/domain.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Local emulator required');
process.env.FIRESTORE_EMULATOR_HOST=host;
const projectId='demo-martini-inventory-tests',app=initializeApp({projectId},'inventory-board-tests'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),service=createService(db,()=>now),owner={uid:'owner'},education={uid:'education'},finance={uid:'finance'},inventoryOnly={uid:'inventory-only'};
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
 batch.set(db.doc('martini_v2_roles/inventory-only'),{name:'재고 담당',permissions:['inventory'],revision:1});
 batch.set(db.doc('martini_v2_admins/inventory-only'),{role:'inventory-only',active:true,displayName:'재고 담당',expiresAt:new Date(now+86400000).toISOString()});
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

test('item quantities save with metadata, read back as stock and stay separate from alert thresholds',async()=>{
 let item=await save({name:'시럽',unit:'ml',quantity:750,minimum:1000,photo},inventoryOnly);
 assert.equal(item.quantity,750);assert.equal(item.minimum,1000);assert.equal(stockTotal(item),750);
 const read=await service.handle({op:'read',kind:'inventory',recordId:item.id},inventoryOnly);
 assert.equal(read.rows[0].quantity,750);assert.equal(stockTotal(read.rows[0]),750);
 let history=(await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows;
 assert.equal(history.length,1);
 const first=history[0];
 for(const [key,value] of Object.entries({itemId:item.id,itemName:'시럽',action:'count',amount:750,reason:'품목 등록',before:0,after:750,beforeQuantity:0,afterQuantity:750,actor:'재고 담당'}))assert.equal(first[key],value);
 for(const key of ['eventId','location','photo'])assert.equal(Object.hasOwn(first,key),false);
 item=await save({id:item.id,revision:item.revision,name:'기준만 변경',minimum:2000},inventoryOnly);
 assert.equal(item.quantity,750);assert.equal(item.minimum,2000);assert.equal(item.photo,photo);
 item=await save({id:item.id,revision:item.revision,name:'동일 수량',quantity:750},inventoryOnly);
 assert.equal((await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows.length,1);
 item=await save({id:item.id,revision:item.revision,name:'소수 수량',quantity:250.5},inventoryOnly);
 assert.equal(item.quantity,250.5);assert.equal(item.minimum,2000);
 history=(await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows;
 assert.equal(history.length,2);
 const edited=history.find(entry=>entry.reason==='품목 수정');
 assert.equal(edited.before,750);assert.equal(edited.after,250.5);assert.equal(edited.beforeQuantity,750);assert.equal(edited.afterQuantity,250.5);
 item=await save({id:item.id,revision:item.revision,name:'실사 0',quantity:0},inventoryOnly);
 assert.equal(item.quantity,0);assert.equal(item.minimum,2000);
 assert.equal((await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows.length,3);
 const empty=await save({name:'빈 재고',unit:'g',quantity:0,minimum:50},inventoryOnly);
 assert.equal(empty.quantity,0);assert.equal((await service.handle({op:'read',kind:'stockMoves',itemId:empty.id},inventoryOnly)).rows.length,0);
 const grams=await save({name:'가루',unit:'g',quantity:125.25},inventoryOnly);assert.equal(grams.quantity,125.25);
});

test('invalid quantities and units roll back item metadata, revisions and stock history',async()=>{
 for(const unit of ['each','pack','bottle']){
  const initial=await save({name:'기존 '+unit,unit,...(unit==='bottle'?{size:700}:{}),quantity:2});
  const before=(await inventory(initial.id).get()).data(),historyBefore=(await db.collection('martini_v2_stockMoves').get()).size;
  for(const quantity of [-1,100001,NaN,Infinity,.5])await assert.rejects(save({id:initial.id,revision:initial.revision,name:'변경되면 안 됨',quantity}),e=>e.code==='invalid-argument');
  assert.deepEqual((await inventory(initial.id).get()).data(),before);
  assert.equal((await db.collection('martini_v2_stockMoves').get()).size,historyBefore);
 }
 const countBefore=(await db.collection('martini_v2_inventory').get()).size,historyBefore=(await db.collection('martini_v2_stockMoves').get()).size;
 for(const input of [{unit:'bottle',size:0,quantity:1},{unit:'bottle',size:700,quantity:1.5},{unit:'each',quantity:.1},{unit:'ml',quantity:750,categoryId:'missing'}])await assert.rejects(save({name:'등록 실패',...input}));
 assert.equal((await db.collection('martini_v2_inventory').get()).size,countBefore);
 assert.equal((await db.collection('martini_v2_stockMoves').get()).size,historyBefore);
});

test('bottle counts preserve opened bottles, measure total volume and retain stocked-unit restrictions',async()=>{
 const created=await save({name:'새 병',unit:'bottle',size:750,quantity:2});assert.equal(stockTotal(created),1500);
 let item=await save({id:legacy.id,revision:legacy.revision,name:'진 수정',quantity:3},inventoryOnly);
 assert.deepEqual(item.bottles,legacy.bottles);assert.equal(item.quantity,3);assert.equal(stockTotal(item),2520);
 let history=(await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows;
 assert.equal(history.length,1);assert.equal(history[0].before,1820);assert.equal(history[0].after,2520);
 assert.equal(history[0].beforeQuantity,2);assert.equal(history[0].afterQuantity,3);
 for(const changed of [{unit:'ml',quantity:750},{size:750,quantity:0}])await assert.rejects(save({id:item.id,revision:item.revision,name:'규격 변경 실패',...changed}),e=>e.code==='failed-precondition');
 item=await save({id:item.id,revision:item.revision,name:'미개봉 없음',quantity:0},inventoryOnly);
 assert.deepEqual(item.bottles,legacy.bottles);assert.equal(stockTotal(item),420);
 await assert.rejects(save({id:item.id,revision:item.revision,name:'개봉 병 있음',unit:'each',quantity:0}),e=>e.code==='failed-precondition');
 history=(await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows;
 assert.equal(history.length,2);assert.equal(history.find(entry=>entry.afterQuantity===0).after,420);
});

test('competing item counts commit one value and one history entry without overwriting a newer revision',async()=>{
 const item=await save({name:'동시 실사',unit:'ml'});
 const results=await Promise.allSettled([750,500].map(quantity=>save({id:item.id,revision:item.revision,name:'수정 '+quantity,quantity},inventoryOnly)));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.code,'aborted');
 const saved=results.find(result=>result.status==='fulfilled').value,current=(await inventory(item.id).get()).data();
 assert.equal(current.quantity,saved.quantity);assert.equal(current.name,saved.name);assert.equal(current.revision,item.revision+1);
 const history=(await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows;
 assert.equal(history.length,1);assert.equal(history[0].before,0);assert.equal(history[0].after,current.quantity);
 await assert.rejects(save({id:item.id,revision:item.revision,name:'낡은 수정',quantity:999}),e=>e.code==='aborted');
 assert.equal((await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows.length,1);
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
 const requests=[{op:'listInventoryCategories'},{op:'saveInventoryCategory',name:'실패'},{op:'deleteInventoryCategory',id:c.id,revision:1},{op:'moveInventoryItem',id:'gin',revision:4,categoryId:c.id},{op:'saveItem',name:'실패'},{op:'saveItem',name:'수량 권한 없음',unit:'ml',quantity:750},{op:'read',kind:'inventory'}];
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

test('inventory-only staff manage stock without event reads or saved event links from older clients',async()=>{
 await db.doc('martini_v2_events/old-event').set({title:'이전 행사',updatedAt:stamp});
 await db.doc('martini_v2_events/deleted-event').set({title:'삭제 행사',updatedAt:stamp,deletedAt:stamp});
 let checkingInventory=false,eventReads=0;
 const isolatedDb=new Proxy(db,{get(target,key){
  if(key==='collection')return name=>{if(checkingInventory&&name==='martini_v2_events'){eventReads++;throw Error('Inventory must not read events');}return target.collection(name);};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const isolated=createService(isolatedDb,()=>now);checkingInventory=true;
 const c=await isolated.handle({op:'saveInventoryCategory',name:'독립 재고'},inventoryOnly);
 let item=await isolated.handle({op:'saveItem',name:'독립 품목',categoryId:c.id},inventoryOnly);
 for(const [index,eventId] of [undefined,'','missing-event','deleted-event','old-event'].entries()){
  item=await isolated.handle({op:'stock',id:item.id,revision:item.revision,requestId:'independent-'+index,action:'receive',amount:1,reason:'입고',...(eventId!==undefined?{eventId}:{})},inventoryOnly);
  const history=(await db.doc('martini_v2_stockMoves/independent-'+index).get()).data();
  assert.equal(Object.hasOwn(history,'eventId'),false);assert.equal(history.itemId,item.id);
 }
 assert.equal(item.quantity,5);assert.equal(eventReads,0);
 assert.equal((await isolated.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows.length,5);
 assert.equal((await isolated.handle({op:'read',kind:'inventory',recordId:item.id},inventoryOnly)).rows[0].quantity,5);
 await assert.rejects(isolated.handle({op:'read',kind:'events'},inventoryOnly),e=>e.code==='permission-denied');
 await assert.rejects(isolated.handle({op:'read',kind:'finance'},inventoryOnly),e=>e.code==='permission-denied');
 assert.equal(eventReads,0);
});

test('deleting stocked items retains quantity, open bottles and history, and blocks further changes',async()=>{
 const c=await category('삭제 품목');let item=await move(legacy,c.id);
 item=await service.handle({op:'stock',id:item.id,revision:item.revision,requestId:'before-delete',action:'receive',amount:1,reason:'입고'},inventoryOnly);
 const before=(await inventory(item.id).get()).data(),historyBefore=(await db.doc('martini_v2_stockMoves/before-delete').get()).data();
 const input={op:'deleteRecord',kind:'inventory',id:item.id,revision:item.revision,updatedAt:item.updatedAt,confirmed:true};
 await assert.rejects(service.handle(input,finance),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({...input,confirmed:false},inventoryOnly),e=>e.code==='invalid-argument');
 await assert.rejects(service.handle({...input,revision:item.revision-1},inventoryOnly),e=>e.code==='aborted');
 await assert.rejects(service.handle({...input,updatedAt:new Date(now-1000).toISOString()},inventoryOnly),e=>e.code==='aborted');
 assert.deepEqual(await service.handle(input,inventoryOnly),{saved:true});
 assert.deepEqual(await service.handle(input,inventoryOnly),{saved:true,duplicate:true});
 const deleted=(await inventory(item.id).get()).data();
 for(const key of Object.keys(before))if(!['revision','updatedAt'].includes(key))assert.deepEqual(deleted[key],before[key]);
 assert.equal(deleted.revision,before.revision+1);assert.equal(deleted.deletedBy,inventoryOnly.uid);assert.equal(deleted.deletedAt,stamp);
 assert.deepEqual((await db.doc('martini_v2_stockMoves/before-delete').get()).data(),historyBefore);
 assert.equal((await service.handle({op:'read',kind:'stockMoves',itemId:item.id},inventoryOnly)).rows.length,1);
 assert.equal((await service.handle({op:'read',kind:'inventory'},inventoryOnly)).rows.length,0);
 await assert.rejects(service.handle({op:'read',kind:'inventory',recordId:item.id},inventoryOnly),e=>e.code==='not-found');
 await assert.rejects(save({id:item.id,revision:deleted.revision,name:'복구 시도',quantity:10},inventoryOnly),e=>e.code==='not-found');
 await assert.rejects(move({...item,revision:deleted.revision},''),e=>e.code==='not-found');
 await assert.rejects(service.handle({op:'stock',id:item.id,revision:deleted.revision,requestId:'after-delete',action:'receive',amount:1,reason:'삭제 뒤 입고'},inventoryOnly),e=>e.code==='not-found');
 const deletions=(await db.collection('martini_v2_audit').where('entityId','==',item.id).get()).docs.filter(doc=>doc.data().action==='삭제');
 assert.equal(deletions.length,1);
 await service.handle({op:'deleteInventoryCategory',id:c.id,revision:c.revision},inventoryOnly);
 assert.equal((await service.handle({op:'listInventoryCategories'},inventoryOnly)).rows.length,0);
});
