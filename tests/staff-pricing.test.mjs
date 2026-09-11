import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from '../functions/node_modules/firebase-admin/lib/app/index.js';
import {getFirestore} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {createService} from '../functions/src/service.js';
import {hash,parse,schemas} from '../functions/src/domain.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error('Local emulator required');
process.env.FIRESTORE_EMULATOR_HOST=host;
const projectId='demo-martini-staff-pricing-tests',app=initializeApp({projectId},'staff-pricing-tests'),db=getFirestore(app);
const now=Date.now(),stamp=new Date(now).toISOString(),time=ms=>new Date(now+ms).toISOString(),service=createService(db,()=>now),finance={uid:'finance',ip:'test'},education={uid:'education',ip:'test'};
const event={id:'event',revision:1,title:'가상 교육',type:'class',description:'',location:'동아리방',startsAt:time(86400000),endsAt:time(90000000),opensAt:time(-1000),closesAt:time(80000000),cancelUntil:time(80000000),capacity:20,fee:25000,waitlist:true,status:'open',semester:'2026-2',questions:[],policy:'테스트',registered:2,waiting:1,sequence:3,linkHash:hash('a'.repeat(64)),updatedAt:stamp};
const application=(id,extra={})=>({id,requestId:'request-'+id,eventId:'event',eventTitle:event.title,memberId:'member',name:'가상 부원 '+id,fee:25000,paidAmount:0,refundAmount:0,status:'registered',payment:'unpaid',attendance:'absent',answers:[],semester:'2026-2',receiptHash:hash('b'.repeat(64)),sequence:1,createdAt:stamp,updatedAt:stamp,...extra});
const configure=(fee,revision=0,id='event')=>service.handle({op:'setEventStaffFee',id,staffFee:fee,staffFeeRevision:revision},finance);
const toggle=(id,isStaff,pricingRevision=0,staffFeeRevision=1)=>service.handle({op:'setApplicationStaff',id,isStaff,pricingRevision,staffFeeRevision},finance);
const get=(kind,id)=>db.doc('martini_v2_'+kind+'/'+id).get().then(d=>d.data());
beforeEach(async()=>{
 const response=await fetch('http://'+host+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
 const batch=db.batch();for(const role of ['finance','education'])batch.set(db.doc('martini_v2_admins/'+role),{role,active:true,displayName:role,expiresAt:time(86400000)});
 batch.set(db.doc('martini_v2_settings/club'),{semester:'2026-2',contact:'테스트'});
 batch.set(db.doc('martini_v2_events/event'),event);batch.set(db.doc('martini_v2_events/other'),{...event,id:'other'});
 for(const id of ['one','two'])batch.set(db.doc('martini_v2_applications/'+id),application(id));await batch.commit();
});
after(async()=>deleteApp(app));

test('one event fee updates all active staff and ordinary event edits preserve the shared setting',async()=>{
 const batch=db.batch();
 for(const [id,extra] of [['one',{}],['waiting',{status:'waiting'}],['offered',{status:'offered'}],['cancelled',{status:'cancelled'}],['deleted',{deletedAt:stamp}],['private',{anonymizedAt:stamp}],['other-event',{eventId:'other'}]])batch.set(db.doc('martini_v2_applications/'+id),application(id,{isStaff:true,staffFee:5000,pricingRevision:1,...extra}));await batch.commit();
 const result=await configure(10000);assert.equal(result.updatedCount,3);
 for(const id of ['one','waiting','offered']){const a=await get('applications',id);assert.equal(a.staffFee,10000);assert.equal(a.pricingRevision,2);assert.equal(a.payment,id==='one'?'unpaid':'none');}
 for(const id of ['cancelled','deleted','private','other-event'])assert.equal((await get('applications',id)).staffFee,5000);
 assert.equal((await get('applications','two')).isStaff,undefined);
 const editable=Object.fromEntries(Object.keys(schemas.event.shape).filter(key=>key in event).map(key=>[key,event[key]]));
 await service.handle({op:'saveEvent',...parse(schemas.event,editable),title:'행사 이름 수정'},education);
 assert.equal((await get('events','event')).staffFee,10000);assert.equal((await get('events','event')).staffFeeRevision,1);
});

test('checkbox uses only the shared fee and unchecking restores the original application fee',async()=>{
 await assert.rejects(toggle('one',true),e=>e.code==='failed-precondition');await configure(0);
 await toggle('one',true);let a=await get('applications','one');assert.equal(a.isStaff,true);assert.equal(a.staffFee,0);assert.equal(a.payment,'none');
 await db.doc('martini_v2_events/event').update({fee:30000});
 await toggle('one',false,1);a=await get('applications','one');assert.equal(a.staffFee,25000);assert.equal(a.payment,'unpaid');
 await assert.rejects(toggle('one',true,1),e=>e.code==='aborted');
 await configure(10000,1);await assert.rejects(toggle('one',true,2,1),e=>e.code==='aborted');await toggle('one',true,2,2);
 assert.equal((await get('applications','one')).staffFee,10000);
 await assert.rejects(service.handle({op:'setApplicationStaff',id:'two',isStaff:true,pricingRevision:0,staffFeeRevision:2,staffFee:1},finance),e=>e.code==='invalid-argument');
});

test('bulk price reduction below any confirmed payment rejects the whole change',async()=>{
 await configure(15000);await toggle('one',true);await toggle('two',true);
 await db.doc('martini_v2_applications/two').update({paidAmount:10000});
 const before=await Promise.all([get('events','event'),get('applications','one'),get('applications','two')]);
 await assert.rejects(configure(5000,1),e=>e.code==='failed-precondition');
 assert.deepEqual(await Promise.all([get('events','event'),get('applications','one'),get('applications','two')]),before);
 await configure(10000,1);assert.equal((await get('applications','two')).payment,'paid');
 await assert.rejects(configure(12000,1),e=>e.code==='aborted');
});

test('shared price and designation remain finance-only and hidden from public event and receipt',async()=>{
 const ops=[{op:'setEventStaffFee',id:'event',staffFee:10000,staffFeeRevision:0},{op:'setApplicationStaff',id:'one',isStaff:true,pricingRevision:0,staffFeeRevision:1}];
 for(const op of ops){await assert.rejects(service.handle(op,education),e=>e.code==='permission-denied');await assert.rejects(service.handle(op,{uid:null}),e=>e.code==='unauthenticated');}
 await configure(10000);await toggle('one',true);
 const eventAdmin=(await service.handle({op:'read',kind:'events',recordId:'event'},finance)).rows[0];assert.equal(eventAdmin.staffFee,10000);assert.equal(eventAdmin.staffFeeRevision,1);
 const otherAdmin=(await service.handle({op:'read',kind:'events',recordId:'event'},education)).rows[0];
 const publicEvent=await service.handle({op:'eventAccess',eventId:'event',key:'a'.repeat(64)},{ip:'public'});
 const receipt=await service.handle({op:'receipt',id:'one',key:'b'.repeat(64),action:'get'},{ip:'receipt'});
 for(const data of [otherAdmin,publicEvent,receipt.event,receipt.application])for(const key of ['isStaff','staffFee','staffFeeRevision','pricingRevision'])assert.equal(key in data,false);
 assert.equal(receipt.application.fee,25000);assert.equal(publicEvent.fee,25000);
});

test('closed or removed applications and cancelled events cannot be repriced',async()=>{
 await configure(10000);
 for(const extra of [{status:'cancelled'},{status:'expired'},{deletedAt:stamp},{anonymizedAt:stamp}]){
  await db.doc('martini_v2_applications/blocked').set(application('blocked',extra));
  await assert.rejects(toggle('blocked',true),e=>['not-found','failed-precondition'].includes(e.code));
 }
 await db.doc('martini_v2_events/event').update({status:'cancelled'});
 await assert.rejects(configure(0,1),e=>e.code==='failed-precondition');await assert.rejects(toggle('one',true),e=>e.code==='failed-precondition');
 for(const fee of [-1,1.5,1000001])await assert.rejects(configure(fee),e=>e.code==='invalid-argument');
});

test('legacy pricing clients cannot override a configured common fee',async()=>{
 await service.handle({op:'setApplicationPricing',id:'one',isStaff:true,staffFee:7000,pricingRevision:0},finance);
 await configure(10000);
 await assert.rejects(service.handle({op:'setApplicationPricing',id:'one',isStaff:true,staffFee:7000,pricingRevision:2},finance),e=>e.code==='failed-precondition');
 await service.handle({op:'setApplicationPricing',id:'one',isStaff:true,staffFee:10000,pricingRevision:2},finance);assert.equal((await get('applications','one')).staffFee,10000);
});

test('concurrent common fee update and staff selection cannot leave a stale active price',async()=>{
 await configure(10000);
 const results=await Promise.allSettled([configure(12000,1),toggle('one',true)]);assert.equal(results[0].status,'fulfilled');
 const a=await get('applications','one');if(results[1].status==='fulfilled')assert.equal(a.staffFee,12000);else assert.equal(results[1].reason.code,'aborted');
});

test('payment caps and refunds use the common fee without changing the original fee',async()=>{
 await configure(10000);await toggle('one',true);
 const pay={op:'finance',requestId:'payment',kind:'income',amount:10001,title:'참가비',eventId:'event',applicationId:'one',memberId:'',semester:'2026-2',note:''};
 await assert.rejects(service.handle(pay,finance),e=>e.code==='failed-precondition');await service.handle({...pay,amount:10000},finance);
 await configure(12000,1);assert.equal((await get('applications','one')).payment,'unpaid');
 await service.handle({...pay,requestId:'balance',amount:2000},finance);assert.equal((await get('applications','one')).payment,'paid');
 await service.handle({op:'receipt',id:'one',key:'b'.repeat(64),action:'cancel'},{ip:'cancel'});
 await service.handle({...pay,kind:'refund',requestId:'refund',amount:12000},finance);const a=await get('applications','one');assert.equal(a.payment,'refunded');assert.equal(a.fee,25000);
});

test('oversized batches fail before changing any data',async()=>{
 for(let offset=0;offset<499;offset+=400){const batch=db.batch();for(let i=offset;i<Math.min(499,offset+400);i++)batch.set(db.doc('martini_v2_applications/staff-'+i),application('staff-'+i,{isStaff:true,staffFee:5000}));await batch.commit();}
 await assert.rejects(configure(10000),e=>e.code==='resource-exhausted');assert.equal((await get('events','event')).staffFee,undefined);assert.equal((await get('applications','staff-0')).staffFee,5000);
});
