import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp,deleteApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { initializeTestEnvironment,assertFails } from '@firebase/rules-unit-testing';
import { doc,getDoc,setDoc,deleteDoc } from 'firebase/firestore';

process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const projectId='demo-martini-viewer-tests';
if(!projectId.startsWith('demo-'))throw Error('Emulator only');
const app=initializeApp({projectId},'viewer-tests'),db=getFirestore(app);
const baseline=Math.floor(Date.now()/1000)*1000;let now=baseline,verified=0;
const service=createService(db,()=>now),stamp=()=>new Date(now).toISOString();
const expiry=()=>new Date(now+30*86400000).toISOString();
const ref=(kind,id)=>db.doc('martini_v2_'+kind+'/'+id);
const viewer=()=>({uid:'viewer',authTime:baseline/1000,ip:'same-ip',verifyAuthSession:async()=>{verified++;}});
const owner={uid:'owner'};
beforeEach(async()=>{
 now=baseline;verified=0;
 assert.equal((await fetch('http://127.0.0.1:8080/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'})).ok,true);
 const batch=db.batch();
 for(const [id,role] of [['viewer','requestsViewer'],['owner','owner'],['execution','execution'],['education','education']])batch.set(ref('admins',id),{role,active:true,displayName:id,expiresAt:expiry(),updatedAt:stamp()});
 for(const kind of ['visit','inquiry','join'])batch.set(ref('clubRequests',kind),{kind,name:'가상 신청자',studentId:'TEST001',subject:'가상 문의',purpose:'가상 교류',message:'문의 내용',startsAt:new Date(now+86400000).toISOString(),status:'pending',revision:1,createdAt:stamp(),updatedAt:stamp(),retentionUntil:expiry(),receiptHash:'private',memberIdentityHash:'private',phone:'private',sessionHash:'private',payloadHash:'private'});
 await batch.commit();
});
after(()=>deleteApp(app));

test('viewer can read requests and profile, with existing safe fields and pagination',async()=>{
 const profile=await service.handle({op:'profile'},viewer());assert.deepEqual(profile.permissions,['requestsRead']);assert.ok(profile.sessionExpiresAt);
 const first=await service.handle({op:'clubRequests'},viewer());assert.equal(first.rows.length,3);assert.equal(verified,2);
 for(const row of first.rows)for(const key of ['receiptHash','memberIdentityHash','phone','sessionHash','payloadHash'])assert.equal(key in row,false,key);
 const batch=db.batch();for(let i=0;i<103;i++)batch.set(ref('clubRequests','page-'+i),{kind:'inquiry',name:'가상',status:'answered',updatedAt:stamp(),...(i===0?{deletedAt:stamp()}:i===1?{anonymizedAt:stamp()}:{})});await batch.commit();
 const page=await service.handle({op:'clubRequests'},viewer());assert.ok(page.nextCursor);
 const next=await service.handle({op:'clubRequests',cursor:page.nextCursor},viewer());assert.equal(next.nextCursor,null);
 const ids=[...page.rows,...next.rows].map(r=>r.id);assert.equal(ids.length,104);assert.equal(new Set(ids).size,104);assert.ok(!ids.includes('page-0')&&!ids.includes('page-1'));
});

test('viewer fails closed across every administrative write, unrelated read and public write route',async()=>{
 const operations=['dashboard','clubRequestCommand','deleteRecord','saveSettings','saveMember','removeMember','restoreMember','saveEvent','eventLink','applicationCommand','recordFinance','saveItem','stock','saveMeeting','saveDecision','saveContent','saveAdmin','deleteAdmin','saveRole','deleteRole','setRoleBudget','recordExport','privacyCandidates','privacyPreview','privacyExecute','onTheRockBoard','saveOnTheRockGroup','recordOnTheRockMission','updateOnTheRockRecord','voidOnTheRockRecord','budgetPlanner','saveBudgetPlanner','listRoles','couponSettings','couponHistory','saveCouponSettings','resetCouponData','decisionCategories','createDecisionCategory','deleteDecisionCategory','decisionEvents','listInventoryCategories','saveInventoryCategory','deleteInventoryCategory','moveInventoryItem','submitClubRequest','cancelClubRequest','apply','receipt','memberAccess','memberLogout','memberApplication','issueCouponQr','stampCoupon','merchantLogin','merchantLogout','adjustMerchantCoupon','unknownFutureOperation'];
 const before=JSON.stringify((await db.collection('martini_v2_clubRequests').get()).docs.map(d=>d.data()));
 for(const op of operations)await assert.rejects(service.handle({op,role:'owner',permissions:['admins'],uid:'owner',authTime:now/1000},viewer()),e=>e.code==='permission-denied',op);
 for(const kind of ['settings','members','applications','events','finance','inventory','admins','audit'])await assert.rejects(service.handle({op:'read',kind},viewer()),e=>e.code==='permission-denied',kind);
 for(const action of ['approve','reject','reply'])await assert.rejects(service.handle({op:'clubRequestCommand',id:action==='reply'?'inquiry':'visit',revision:1,action,response:'forbidden'},viewer()),e=>e.code==='permission-denied');
 assert.equal(JSON.stringify((await db.collection('martini_v2_clubRequests').get()).docs.map(d=>d.data())),before);
 assert.equal((await db.collection('martini_v2_audit').get()).size,0);
});

test('missing authentication, expired grants, stale auth time and revoked Auth sessions are rejected',async()=>{
 for(const op of ['profile','clubRequests'])await assert.rejects(service.handle({op,uid:'viewer',authTime:now/1000},{ip:'same-ip'}),e=>e.code==='unauthenticated');
 await assert.rejects(service.handle({op:'clubRequests'},{uid:'outsider'}),e=>e.code==='permission-denied');
 await assert.rejects(service.handle({op:'clubRequests'}, {...viewer(),authTime:undefined}),e=>e.code==='unauthenticated');
 await assert.rejects(service.handle({op:'clubRequests'}, {...viewer(),verifyAuthSession:undefined}),e=>e.code==='unauthenticated');
 await assert.rejects(service.handle({op:'clubRequests'}, {...viewer(),verifyAuthSession:async()=>{throw Object.assign(new Error('revoked'),{code:'unauthenticated'});}}),e=>e.code==='unauthenticated');
 now+=7*86400000;
 await assert.rejects(service.handle({op:'profile',authTime:now/1000},viewer()),e=>e.code==='unauthenticated');
 now=baseline;await ref('admins','viewer').update({expiresAt:stamp()});
 await assert.rejects(service.handle({op:'clubRequests'},viewer()),e=>e.code==='permission-denied');
 await ref('admins','viewer').update({expiresAt:'invalid'});
 await assert.rejects(service.handle({op:'clubRequests'},viewer()),e=>e.code==='permission-denied');
});

test('logout invalidates old tokens; disabling and re-enabling preserves revocation',async()=>{
 await service.handle({op:'adminLogout'},viewer());
 await assert.rejects(service.handle({op:'clubRequests'},viewer()),e=>e.code==='unauthenticated');
 now+=2000;const newSession={...viewer(),authTime:now/1000};
 assert.equal((await service.handle({op:'clubRequests'},newSession)).rows.length,3);
 const assignment={op:'saveAdmin',uid:'viewer',displayName:'dot test',role:'requestsViewer',expiresAt:expiry()};
 await service.handle({...assignment,active:false},owner);
 await assert.rejects(service.handle({op:'clubRequests'},newSession),e=>e.code==='permission-denied');
 await service.handle({...assignment,active:true},owner);
 await assert.rejects(service.handle({op:'clubRequests'},newSession),e=>e.code==='unauthenticated');
 now+=2000;assert.equal((await service.handle({op:'profile'},{...viewer(),authTime:now/1000})).role,'requestsViewer');
 await ref('admins','viewer').delete();
 await assert.rejects(service.handle({op:'clubRequests'},newSession),e=>e.code==='permission-denied');
});

test('fixed viewer role cannot acquire extra permissions and existing managers retain processing rights',async()=>{
 await ref('roles','requestsViewer').set({name:'forged',permissions:['admins','members','settings'],deletedAt:stamp()});
 assert.deepEqual((await service.handle({op:'profile'},viewer())).permissions,['requestsRead']);
 const roles=(await service.handle({op:'listRoles'},owner)).rows;assert.deepEqual(roles.find(r=>r.id==='requestsViewer').permissions,['requestsRead']);
 await assert.rejects(service.handle({op:'saveRole',id:'requestsViewer',name:'forged',permissions:['members'],revision:0},owner),e=>e.code==='failed-precondition');
 await assert.rejects(service.handle({op:'deleteRole',id:'requestsViewer',revision:0},owner),e=>e.code==='failed-precondition');
 assert.equal((await service.handle({op:'clubRequests'},{uid:'execution'})).rows.length,3);
 await assert.rejects(service.handle({op:'clubRequests'},{uid:'education'}),e=>e.code==='permission-denied');
 await service.handle({op:'clubRequestCommand',id:'inquiry',action:'reply',revision:1,response:'기존 임원 답변'},{uid:'execution'});
 await service.handle({op:'clubRequestCommand',id:'visit',action:'reject',revision:1,response:'기존 임원 반려'},owner);
 assert.equal((await ref('clubRequests','inquiry').get()).data().status,'answered');
});

test('Firestore direct reads and writes remain denied, even with forged role claims',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-martini-viewer-rules',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});
 try{for(const client of [env.unauthenticatedContext(),env.authenticatedContext('viewer',{role:'requestsViewer',requestsRead:true}),env.authenticatedContext('owner',{admin:true})]){
  for(const path of ['martini_v2_clubRequests/example','martini_v2_admins/viewer','martini_v2_settings/club']){const record=doc(client.firestore(),path);await assertFails(getDoc(record));await assertFails(setDoc(record,{active:true}));await assertFails(deleteDoc(record));}
 }}finally{await env.cleanup();}
});
