import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { Timestamp } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../functions/src/service.js';
import { hash } from '../functions/src/domain.js';

const DAY=86400000,START=Date.parse('2026-10-05T00:00:00Z');
const STORE_CODE='synthetic-store-code-2026',ROTATED_CODE='synthetic-rotated-code-2026';
const memberSession='a'.repeat(64),otherMemberSession='b'.repeat(64),unknownToken='0'.repeat(64);
const owner={uid:'owner',ip:'unit-owner'},finance={uid:'finance',ip:'unit-finance'},guest={ip:'unit-store'};
const member={id:'member-one',name:'가상 부원',studentId:'TEST-100',phone:'01000000000',semester:'2026-2',status:'active'};
const fingerprint=hash(JSON.stringify([member.name,member.studentId,member.phone]));
const errorCode=(...expected)=>error=>expected.includes(error.code);

function clone(value){
 if(value?.toMillis&&value?.toDate)return Timestamp.fromMillis(value.toMillis());
 if(Array.isArray(value))return value.map(clone);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)]));
 return value;
}

// Uses the real service dispatcher, schemas, member authentication, merchant
// authentication, and transaction callbacks. Nothing initializes Firebase or
// connects to an emulator or production database. Serial transactions model
// optimistic retries: each concurrent caller observes the committed predecessor.
function fixture(){
 const records=new Map(),reads=[],writes=[],queries=[];let instant=START,nextId=0,tail=Promise.resolve(),rejectWrite=null;
 const snapshot=path=>({id:path.split('/').at(-1),ref:reference(path),exists:records.has(path),data:()=>clone(records.get(path))});
 const reference=path=>({path,id:path.split('/').at(-1),get:async()=>{reads.push(path);return snapshot(path);},collection:name=>collection(path+'/'+name)});
 const querySnapshot=query=>{
  queries.push(clone(query));
  let docs=[...records.keys()].filter(path=>path.startsWith(query.path+'/')&&!path.slice(query.path.length+1).includes('/')).map(snapshot)
   .filter(doc=>query.filters.every(([key,value])=>doc.data()[key]===value)&&query.orders.every(([key])=>key==='__name__'||doc.data()[key]!==undefined));
  for(const [key,direction] of [...query.orders].reverse())docs.sort((a,b)=>{
   const first=key==='__name__'?a.id:a.data()[key],second=key==='__name__'?b.id:b.data()[key];
   return (first<second?-1:first>second?1:0)*(direction==='desc'?-1:1);
  });
  if(query.after)docs=docs.filter(doc=>{
   for(let index=0;index<query.orders.length;index++){
    const [key,direction]=query.orders[index],value=key==='__name__'?doc.id:doc.data()[key],cursor=query.after[index];
    if(value!==cursor)return direction==='desc'?value<cursor:value>cursor;
   }
   return false;
  });
  if(query.maximum!==undefined)docs=docs.slice(0,query.maximum);
  return {docs,size:docs.length,empty:docs.length===0};
 };
 const collection=(path,options={})=>{
  const query={path,isQuery:true,filters:[],orders:[],...options};
  return {...query,doc:id=>reference(path+'/'+(id||'generated-'+ ++nextId)),get:async()=>{reads.push(path);return querySnapshot(query);},
   where:(key,operator,value)=>{assert.equal(operator,'==');return collection(path,{...query,filters:[...query.filters,[key,value]]});},
   orderBy:(key,direction='asc')=>collection(path,{...query,orders:[...query.orders,[key,direction]]}),limit:maximum=>collection(path,{...query,maximum}),
   startAfter:(...after)=>collection(path,{...query,after})};
 };
 const db={collection,runTransaction(run){
  const task=tail.then(async()=>{
   const pending=[],read=target=>{assert.equal(pending.length,0,'all transaction reads precede writes');reads.push(target.path);return target.isQuery?querySnapshot(target):snapshot(target.path);};
   const tx={get:async target=>read(target),getAll:async(...refs)=>refs.map(read),
    set:(ref,value,options={})=>pending.push({type:'set',path:ref.path,value:clone(value),merge:!!options.merge}),
    create:(ref,value)=>pending.push({type:'create',path:ref.path,value:clone(value)}),
    update:(ref,value)=>pending.push({type:'update',path:ref.path,value:clone(value)}),
    delete:ref=>pending.push({type:'delete',path:ref.path})};
   const result=await run(tx);
   for(const write of pending){
    if(write.type==='create')assert.equal(records.has(write.path),false);
    if(write.type==='update')assert.equal(records.has(write.path),true);
    if(rejectWrite?.(write))throw new Error('Synthetic transaction write failure');
   }
   for(const write of pending){
    if(write.type==='delete')records.delete(write.path);
    else records.set(write.path,write.merge||write.type==='update'?{...records.get(write.path),...write.value}:write.value);
    writes.push(write);
   }
   return result;
  });
  tail=task.catch(()=>{});return task;
 }};
 for(const role of ['owner','finance'])records.set('martini_v2_admins/'+role,{role,displayName:role,active:true,expiresAt:new Date(START+400*DAY).toISOString()});
 records.set('martini_v2_settings/club',{semester:member.semester,contact:'가상 운영진'});
 records.set('martini_v2_semesters/'+member.semester+'/members/'+member.id,{...member});
 for(const key of [memberSession,otherMemberSession])records.set('martini_v2_memberSessions/'+hash(key),{memberId:member.id,semester:member.semester,identityHash:fingerprint,expiresAt:Timestamp.fromMillis(START+7*DAY)});
 const service=createService(db,()=>instant);
 return {records,reads,writes,queries,handle:(payload,context=guest)=>service.handle(payload,context),now:()=>instant,advance:milliseconds=>{instant+=milliseconds;},
  businessWrites:()=>writes.filter(write=>!write.path.startsWith('martini_v2_rateLimits/')),
  failWrites:predicate=>{rejectWrite=predicate;},
  memberChange:patch=>{const path='martini_v2_semesters/'+member.semester+'/members/'+member.id;if(patch===null)records.delete(path);else records.set(path,{...records.get(path),...patch});},
  config:()=>service.handle({op:'saveCouponSettings',revision:0,enabled:true,code:STORE_CODE},owner),
  login:code=>service.handle({op:'merchantLogin',code:code||STORE_CODE},guest),
  qr:sessionKey=>service.handle({op:'issueCouponQr',sessionKey:sessionKey||memberSession},guest),
  coupons:()=>service.handle({op:'memberCoupons',sessionKey:memberSession},guest)
 };
}

async function ready(){const f=fixture();await f.config();return {...f,merchant:await f.login()};}
function storedContains(f,value){return JSON.stringify([...f.records]).includes(value);}
function safeResponse(value){
 const serialized=JSON.stringify(value);
 assert.ok(!serialized.includes(STORE_CODE)&&!serialized.includes(ROTATED_CODE),'Responses must not echo merchant codes');
 for(const key of ['code','codeHash','codeSalt','salt','hash','identityHash','memberIdentityHash'])assert.equal(Object.hasOwn(value,key),false,'Private field '+key);
}

const settingsPath='martini_v2_partnerStampSettings/feelingfine';
const couponPath='martini_v2_partnerCoupons/'+hash('feelingfine:student:'+member.studentId.toLowerCase());
const qrPath=token=>'martini_v2_partnerCouponQrs/'+hash(token);
const merchantPath=sessionKey=>'martini_v2_partnerMerchantSessions/'+hash(sessionKey);
const milliseconds=value=>typeof value==='number'?value:value?.toMillis?value.toMillis():Date.parse(value);
const preview=(f,token,sessionKey=f.merchant.sessionKey)=>f.handle({op:'merchantCouponPreview',sessionKey,token});
const stamp=(f,token,sessionKey=f.merchant.sessionKey)=>f.handle({op:'stampCoupon',sessionKey,token});

test('coupon settings require operating-settings authority and never disclose merchant credentials',async()=>{
 const f=fixture();
 for(const op of ['couponSettings','saveCouponSettings']){
  const payload=op==='couponSettings'?{op}:{op,revision:0,enabled:true,code:STORE_CODE};
  await assert.rejects(f.handle(payload,finance),errorCode('permission-denied'));
  await assert.rejects(f.handle(payload,guest),errorCode('unauthenticated'));
 }
 const initial=await f.handle({op:'couponSettings'},owner);
 assert.equal(initial.configured,false);assert.equal(initial.enabled,false);assert.equal(initial.revision,0);safeResponse(initial);
 assert.equal((await f.coupons()).available,false);
 await assert.rejects(f.qr(),errorCode('failed-precondition'));
 const configured=await f.config();
 assert.equal(configured.configured,true);assert.equal(configured.enabled,true);assert.equal(configured.revision,1);safeResponse(configured);
 safeResponse(await f.handle({op:'couponSettings'},owner));
 assert.equal(storedContains(f,STORE_CODE),false);
 assert.ok(f.records.has(settingsPath));
 assert.ok(f.businessWrites().some(write=>write.path.startsWith('martini_v2_audit/')),'Settings changes are audited');
});

test('settings reject malformed codes and stale changes without replacing the current configuration',async()=>{
 const f=fixture();
 for(const code of ['short','x'.repeat(129),123,null])await assert.rejects(f.handle({op:'saveCouponSettings',revision:0,enabled:true,code},owner),errorCode('invalid-argument'));
 await f.config();
 const before=clone(f.records.get(settingsPath)),writes=f.businessWrites().length;
 await assert.rejects(f.handle({op:'saveCouponSettings',revision:0,enabled:true,code:ROTATED_CODE},owner),errorCode('aborted'));
 assert.deepEqual(f.records.get(settingsPath),before);assert.equal(f.businessWrites().length,writes);
});

test('merchant codes use independent random salts and a scrypt verifier instead of plaintext or a fast digest',async()=>{
 const first=fixture(),second=fixture();await first.config();await second.config();
 const one=first.records.get(settingsPath),two=second.records.get(settingsPath);
 for(const config of [one,two]){
  assert.match(config.codeSalt,/^[a-f0-9]{64}$/);assert.match(config.codeHash,/^[a-f0-9]{128}$/);
  assert.equal(config.codeHash,scryptSync(STORE_CODE,config.codeSalt,64).toString('hex'));
  assert.notEqual(config.codeHash,hash(STORE_CODE));
 }
 assert.notEqual(one.codeSalt,two.codeSalt);assert.notEqual(one.codeHash,two.codeHash);
});

test('settings and merchant login normalize surrounding code whitespace and reject blank codes',async()=>{
 const f=fixture();
 await assert.rejects(f.handle({op:'saveCouponSettings',revision:0,enabled:true,code:' '.repeat(12)},owner),errorCode('invalid-argument'));
 await f.handle({op:'saveCouponSettings',revision:0,enabled:true,code:'  '+STORE_CODE+'  '},owner);
 const exact=await f.login(),padded=await f.login('  '+STORE_CODE+'  ');
 assert.match(exact.sessionKey,/^[a-f0-9]{64}$/);assert.match(padded.sessionKey,/^[a-f0-9]{64}$/);
 assert.notEqual(exact.sessionKey,padded.sessionKey);
 await assert.rejects(f.login(' '.repeat(12)),errorCode('invalid-argument'));
 assert.equal(storedContains(f,STORE_CODE),false);
});

test('merchant codes reject invalid logins and apply a bounded rate limit',async()=>{
 const f=fixture();await f.config();
 let denied=0,limited=false;
 for(let attempt=0;attempt<30;attempt++){
  try{await f.login('synthetic-incorrect-store-code');assert.fail('Wrong code must not create a session');}
  catch(error){if(error.code==='resource-exhausted'){limited=true;break;}assert.equal(error.code,'unauthenticated');denied++;}
 }
 assert.ok(denied>0&&limited,'Repeated incorrect codes must be rate limited');
 assert.ok(![...f.records.keys()].some(path=>path.startsWith('martini_v2_partnerMerchantSessions/')));
 assert.equal(storedContains(f,'synthetic-incorrect-store-code'),false);
});

test('merchant login creates an opaque hash-only session with a fixed 365-day expiry',async()=>{
 const f=await ready(),login=f.merchant;
 assert.match(login.sessionKey,/^[a-f0-9]{64}$/);
 assert.equal(milliseconds(login.expiresAt),START+365*DAY);safeResponse(login);
 assert.ok(f.records.has(merchantPath(login.sessionKey)));
 assert.equal(storedContains(f,login.sessionKey),false);assert.equal(storedContains(f,STORE_CODE),false);
 f.advance(365*DAY-1);
 const session=await f.handle({op:'merchantSession',sessionKey:login.sessionKey});
 assert.equal(milliseconds(session.expiresAt),START+365*DAY);safeResponse(session);
 f.advance(1);
 await assert.rejects(f.handle({op:'merchantSession',sessionKey:login.sessionKey}),errorCode('unauthenticated'));
});

test('merchant logout revokes only its session and replaying logout cannot restore it',async()=>{
 const f=await ready(),other=await f.login();
 assert.notEqual(other.sessionKey,f.merchant.sessionKey);
 await f.handle({op:'merchantLogout',sessionKey:f.merchant.sessionKey});
 await f.handle({op:'merchantLogout',sessionKey:f.merchant.sessionKey});
 await assert.rejects(f.handle({op:'merchantSession',sessionKey:f.merchant.sessionKey}),errorCode('unauthenticated'));
 assert.equal(milliseconds((await f.handle({op:'merchantSession',sessionKey:other.sessionKey})).expiresAt),START+365*DAY);
});

test('rotating the merchant code revokes existing sessions and previously issued QR tokens',async()=>{
 const f=await ready(),qr=await f.qr();
 const old=clone(f.records.get(settingsPath));
 await f.handle({op:'saveCouponSettings',revision:1,enabled:true,code:ROTATED_CODE},owner);
 assert.notDeepEqual(f.records.get(settingsPath),old);
 await assert.rejects(f.handle({op:'merchantSession',sessionKey:f.merchant.sessionKey}),errorCode('unauthenticated'));
 await assert.rejects(f.login(),errorCode('unauthenticated'));
 const fresh=await f.login(ROTATED_CODE);
 await assert.rejects(preview(f,qr.token,fresh.sessionKey),errorCode('failed-precondition','not-found'));
 assert.equal(storedContains(f,STORE_CODE),false);assert.equal(storedContains(f,ROTATED_CODE),false);
 const next=await f.qr();
 assert.equal((await stamp(f,next.token,fresh.sessionKey)).stampCount,1);
});

test('issued QR tokens are hash-only capabilities with an exact ten-second lifetime',async()=>{
 const f=await ready(),qr=await f.qr();
 assert.match(qr.token,/^[a-f0-9]{64}$/);
 assert.equal(milliseconds(qr.serverNow),START);assert.equal(milliseconds(qr.expiresAt),START+10000);
 assert.ok(f.records.has(qrPath(qr.token)));
 assert.equal(storedContains(f,qr.token),false);assert.equal(storedContains(f,memberSession),false);
 f.advance(9999);
 const result=await preview(f,qr.token);
 assert.equal(result.memberName,member.name);assert.equal(result.stampCount,0);assert.equal(result.capacity,10);
 assert.equal(milliseconds(result.expiresAt),START+10000);
 f.advance(1);
 await assert.rejects(preview(f,qr.token),errorCode('failed-precondition'));
 await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));
 assert.equal((await f.coupons()).stampCount,0);
});

test('issuing a new QR replaces the previous token and forged QR tokens have no authority',async()=>{
 const f=await ready(),previous=await f.qr();f.advance(1);const current=await f.qr();
 assert.notEqual(previous.token,current.token);
 await assert.rejects(preview(f,previous.token),errorCode('failed-precondition'));
 await assert.rejects(stamp(f,previous.token),errorCode('failed-precondition'));
 await assert.rejects(preview(f,unknownToken),errorCode('not-found'));
 assert.equal((await stamp(f,current.token)).stampCount,1);
 assert.equal((await f.coupons()).stampCount,1);
});

test('preview is read-only for coupon, QR, and merchant records and does not extend either expiry',async()=>{
 const f=await ready(),qr=await f.qr(),before=clone([...f.records].filter(([path])=>!path.startsWith('martini_v2_rateLimits/'))),count=f.businessWrites().length;
 for(let attempt=0;attempt<3;attempt++){
  const result=await preview(f,qr.token);safeResponse(result);
  assert.equal(result.stampCount,0);assert.equal(milliseconds(result.expiresAt),START+10000);f.advance(1000);
 }
 assert.deepEqual([...f.records].filter(([path])=>!path.startsWith('martini_v2_rateLimits/')),before);
 assert.equal(f.businessWrites().length,count);
});

test('only an authenticated merchant session can stamp; member or administrator authority is insufficient',async()=>{
 const f=await ready(),qr=await f.qr(),before=clone(f.records.get(couponPath));
 for(const sessionKey of [memberSession,otherMemberSession,unknownToken]){
  await assert.rejects(f.handle({op:'stampCoupon',sessionKey,token:qr.token},owner),errorCode('unauthenticated'));
  await assert.rejects(f.handle({op:'merchantCouponPreview',sessionKey,token:qr.token},owner),errorCode('unauthenticated'));
 }
 await assert.rejects(f.handle({op:'stampCoupon',token:qr.token},owner),errorCode('invalid-argument'));
 assert.deepEqual(f.records.get(couponPath),before);
 assert.equal((await stamp(f,qr.token)).stampCount,1);
});

test('redeeming a QR revalidates the live member identity, eligibility, semester, and originating session',async()=>{
 const mutations=[
  f=>f.memberChange(null),f=>f.memberChange({status:'inactive'}),f=>f.memberChange({active:false}),
  f=>f.memberChange({removedAt:new Date(START).toISOString()}),f=>f.memberChange({anonymizedAt:new Date(START).toISOString()}),
  f=>f.memberChange({deletedAt:new Date(START).toISOString()}),
  f=>f.memberChange({name:'바뀐 부원'}),f=>f.memberChange({studentId:'TEST-200'}),f=>f.memberChange({phone:'01000000001'}),
  f=>f.records.set('martini_v2_settings/club',{semester:'2027-1'}),
  f=>f.handle({op:'memberLogout',sessionKey:memberSession})
 ];
 for(const mutate of mutations){
  const f=await ready(),qr=await f.qr(),before=clone(f.records.get(couponPath));
  await mutate(f);
  await assert.rejects(preview(f,qr.token),errorCode('failed-precondition'));
  await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));
  assert.deepEqual(f.records.get(couponPath),before);
  assert.equal(milliseconds((await f.handle({op:'merchantSession',sessionKey:f.merchant.sessionKey})).expiresAt),START+365*DAY,'Invalid member QR must not log out the merchant');
 }
});

test('member logout invalidates its outstanding QR even when another session for the same member remains valid',async()=>{
 const f=await ready(),old=await f.qr();
 await f.handle({op:'memberLogout',sessionKey:memberSession});
 await assert.rejects(stamp(f,old.token),errorCode('failed-precondition'));
 const next=await f.qr(otherMemberSession);
 assert.equal((await stamp(f,next.token)).stampCount,1);
});

test('stamping consumes one QR atomically and concurrent same-session retries add exactly one stamp',async()=>{
 const f=await ready(),qr=await f.qr();
 const results=await Promise.all(Array.from({length:5},()=>stamp(f,qr.token)));
 assert.ok(results.every(result=>result.stampCount===1));
 assert.equal(results.filter(result=>!result.duplicate).length,1);
 assert.equal((await f.coupons()).stampCount,1);
 assert.ok(f.records.get(qrPath(qr.token)).consumedAt);
});

test('a QR cannot select a different member, merchant, reward, or stamp amount',async()=>{
 const f=await ready(),qr=await f.qr(),before=clone(f.records.get(couponPath));
 for(const extra of [{amount:2},{stampCount:10},{memberId:'other-member'},{couponId:'other-coupon'},{partner:'other-store'},{action:'redeem'}]){
  await assert.rejects(f.handle({op:'stampCoupon',sessionKey:f.merchant.sessionKey,token:qr.token,...extra}),errorCode('invalid-argument'));
 }
 assert.deepEqual(f.records.get(couponPath),before);
 assert.equal((await stamp(f,qr.token)).stampCount,1);
});

test('two merchant sessions racing the final available stamp cannot exceed ten',async()=>{
 const f=await ready(),other=await f.login(),qr=await f.qr();
 f.records.set(couponPath,{...f.records.get(couponPath),stampCount:9,revision:9});
 const results=await Promise.allSettled([stamp(f,qr.token),stamp(f,qr.token,other.sessionKey)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='fulfilled').value.stampCount,10);
 assert.equal(results.find(result=>result.status==='rejected').reason.code,'already-exists');
 assert.equal((await f.coupons()).stampCount,10);
 assert.equal(f.records.get(couponPath).revision,10);
});

test('a card that fills after QR issuance cannot accept another stamp or consume that QR',async()=>{
 const f=await ready(),qr=await f.qr();
 f.records.set(couponPath,{...f.records.get(couponPath),stampCount:10,revision:10});
 const before=clone(f.records.get(couponPath)),beforeQr=clone(f.records.get(qrPath(qr.token)));
 await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));
 assert.deepEqual(f.records.get(couponPath),before);assert.deepEqual(f.records.get(qrPath(qr.token)),beforeQr);
});

test('a consumed QR cannot be credited by another merchant session or retried past its original expiry',async()=>{
 const f=await ready(),second=await f.login(),qr=await f.qr();
 await stamp(f,qr.token);
 await assert.rejects(stamp(f,qr.token,second.sessionKey),errorCode('already-exists'));
 assert.equal((await stamp(f,qr.token)).duplicate,true);
 f.advance(10000);
 await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));
 assert.equal((await f.coupons()).stampCount,1);
});

test('the ten-stamp cap is enforced without resetting the card or awarding an unspecified reward',async()=>{
 const f=await ready();
 for(let count=1;count<=10;count++){
  const qr=await f.qr(),result=await stamp(f,qr.token);
  assert.equal(result.stampCount,count);assert.equal(result.capacity,10);
  assert.equal(result.reward,undefined);assert.equal(result.redeemed,undefined);
  f.advance(60001); // Distinct minute buckets keep this test about capacity.
 }
 assert.equal((await f.coupons()).stampCount,10);
 const before=clone(f.records.get(couponPath));
 try{const qr=await f.qr();await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));}
 catch(error){assert.equal(error.code,'failed-precondition');}
 assert.deepEqual(f.records.get(couponPath),before);
});

test('failed transaction commits never consume a QR without recording its stamp',async()=>{
 const f=await ready(),qr=await f.qr(),beforeCoupon=clone(f.records.get(couponPath)),beforeQr=clone(f.records.get(qrPath(qr.token)));
 f.failWrites(write=>write.path===couponPath);
 await assert.rejects(stamp(f,qr.token),/Synthetic transaction write failure/);
 assert.deepEqual(f.records.get(couponPath),beforeCoupon);assert.deepEqual(f.records.get(qrPath(qr.token)),beforeQr);
 f.failWrites(null);
 assert.equal((await stamp(f,qr.token)).stampCount,1);
});

test('disabled merchant configuration prevents QR issuance and redemption without changing coupon balances',async()=>{
 const f=await ready(),qr=await f.qr(),before=clone(f.records.get(couponPath));
 const result=await f.handle({op:'saveCouponSettings',revision:1,enabled:false},owner);safeResponse(result);
 assert.equal(result.enabled,false);
 await assert.rejects(f.qr(),errorCode('failed-precondition'));
 await assert.rejects(preview(f,qr.token),errorCode('unauthenticated','failed-precondition'));
 await assert.rejects(stamp(f,qr.token),errorCode('unauthenticated','failed-precondition'));
 assert.deepEqual(f.records.get(couponPath),before);
});

test('reenabling the same merchant code never resurrects old merchant sessions or QR tokens',async()=>{
 const f=await ready(),qr=await f.qr();
 await f.handle({op:'saveCouponSettings',revision:1,enabled:false},owner);
 await f.handle({op:'saveCouponSettings',revision:2,enabled:true},owner);
 await assert.rejects(f.handle({op:'merchantSession',sessionKey:f.merchant.sessionKey}),errorCode('unauthenticated'));
 const fresh=await f.login();
 await assert.rejects(stamp(f,qr.token,fresh.sessionKey),errorCode('failed-precondition'));
 const next=await f.qr();
 assert.equal((await stamp(f,next.token,fresh.sessionKey)).stampCount,1);
});

test('successful stamp retries still require the originating member session to be live',async()=>{
 const f=await ready(),qr=await f.qr();await stamp(f,qr.token);
 await f.handle({op:'memberLogout',sessionKey:memberSession});
 await assert.rejects(stamp(f,qr.token),errorCode('failed-precondition'));
 assert.equal(f.records.get(couponPath).stampCount,1);
});

const history=(f,cursor)=>f.handle({op:'couponHistory',...(cursor?{cursor}:{})},owner);
const historyCursor=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function receipt(f,index,overrides={}){
 const id=index.toString(16).padStart(64,'0');
 const value={partner:'feelingfine',memberId:member.id,semester:member.semester,consumedAt:new Date(START).toISOString(),stampCount:index%10+1,
  memberSessionHash:hash(memberSession),consumedBy:hash('synthetic-merchant-session'),identityHash:fingerprint,couponId:couponPath.split('/').at(-1),...overrides};
 f.records.set('martini_v2_partnerCouponQrs/'+id,value);return {id,...value};
}

test('accrual history requires settings authority and cannot be read with member or merchant sessions',async()=>{
 const f=await ready();receipt(f,1);
 const wrongRole={uid:'history-reader',ip:'unit-reader'};
 f.records.set('martini_v2_admins/history-reader',{role:'history-reader',active:true,expiresAt:new Date(START+DAY).toISOString()});
 f.records.set('martini_v2_roles/history-reader',{permissions:['membersRead','audit']});
 for(const context of [finance,wrongRole])await assert.rejects(f.handle({op:'couponHistory'},context),errorCode('permission-denied'));
 for(const sessionKey of [memberSession,f.merchant.sessionKey])await assert.rejects(f.handle({op:'couponHistory',sessionKey},guest),errorCode('unauthenticated'));
 const expired={uid:'expired-admin',ip:'unit-expired'};
 f.records.set('martini_v2_admins/expired-admin',{role:'owner',active:true,expiresAt:new Date(START).toISOString()});
 await assert.rejects(f.handle({op:'couponHistory'},expired),errorCode('permission-denied'));
 assert.equal((await history(f)).items.length,1);
 f.records.set('martini_v2_roles/history-reader',{permissions:['settings']});
 assert.equal((await f.handle({op:'couponHistory'},wrongRole)).items.length,1,'An explicit settings grant permits the same admin operation');
});

test('history rejects malformed cursors, unknown fields, and client-selected limits before receipt reads',async()=>{
 const f=fixture();
 const invalid=[{cursor:''},{cursor:null},{cursor:[]},{cursor:'x'.repeat(201)},{cursor:'not+base64'},
  {cursor:historyCursor({at:'invalid',id:'f'.repeat(64)})},{cursor:historyCursor({at:new Date(START).toISOString(),id:'../settings'})},
  {cursor:historyCursor({at:new Date(START).toISOString(),id:'f'.repeat(64),sessionKey:memberSession})},
  {limit:10000},{memberId:member.id},{semester:member.semester},{partner:'another-store'},{sessionKey:memberSession}];
 for(const data of invalid)await assert.rejects(f.handle({op:'couponHistory',...data},owner),errorCode('invalid-argument'));
 assert.equal(f.reads.some(path=>path.startsWith('martini_v2_partnerCouponQrs')),false);
 assert.equal(f.writes.length,0);
 assert.deepEqual(await history(f),{items:[],nextCursor:null});
});

test('history pages newest first with a stable ID tie-break and excludes unconsumed QR documents',async()=>{
 const f=fixture(),expected=[];
 for(let index=1;index<=65;index++){
  const memberId='history-member-'+index,name='가상 부원 '+index;
  f.records.set('martini_v2_semesters/'+member.semester+'/members/'+memberId,{name});
  expected.push(receipt(f,index,{memberId,consumedAt:new Date(START+(index>40?1000:0)).toISOString(),name}));
 }
 receipt(f,66,{consumedAt:undefined});
 expected.sort((a,b)=>b.consumedAt.localeCompare(a.consumedAt)||b.id.localeCompare(a.id));
 const first=await history(f),second=await history(f,first.nextCursor),third=await history(f,second.nextCursor);
 assert.equal(first.items.length,30);assert.equal(second.items.length,30);assert.equal(third.items.length,5);assert.equal(third.nextCursor,null);
 assert.deepEqual([...first.items,...second.items,...third.items],expected.map(row=>({memberName:row.name,at:row.consumedAt,stampCount:row.stampCount})));
 assert.ok(first.nextCursor.length<=200);assert.ok(second.nextCursor.length<=200);
 assert.deepEqual(f.queries.filter(query=>query.path==='martini_v2_partnerCouponQrs').map(query=>({orders:query.orders,maximum:query.maximum})),
  Array.from({length:3},()=>({orders:[['consumedAt','desc'],['__name__','desc']],maximum:31})));
 assert.equal(f.writes.length,0,'Reading any history page must not write records or audit entries');
});

test('history cursors remain valid if their previous receipt disappears and new receipts do not repeat earlier rows',async()=>{
 const f=fixture();for(let index=1;index<=32;index++)receipt(f,index);
 const first=await history(f),position=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString('utf8'));
 f.records.delete('martini_v2_partnerCouponQrs/'+position.id);
 receipt(f,40,{consumedAt:new Date(START+1000).toISOString()});
 const next=await history(f,first.nextCursor);
 assert.deepEqual(next.items.map(row=>row.stampCount),[3,2]);assert.equal(next.nextCursor,null);
});

test('history resolves legacy names but preserves deletion and anonymization without copying private fields',async()=>{
 const f=fixture(),path='martini_v2_semesters/'+member.semester+'/members/'+member.id;
 receipt(f,1);receipt(f,2);
 const before=clone([...f.records]);
 const visible=await history(f);
 for(const item of visible.items){assert.deepEqual(Object.keys(item).sort(),['at','memberName','stampCount']);assert.equal(item.memberName,member.name);}
 assert.equal(f.reads.filter(value=>value===path).length,1,'Repeated member names require only one roster read per page');
 for(const privateValue of [member.id,member.studentId,member.phone,memberSession,fingerprint,hash(memberSession),couponPath.split('/').at(-1)])assert.ok(!JSON.stringify(visible).includes(privateValue));
 assert.deepEqual([...f.records],before);assert.equal(f.writes.length,0);
 f.records.delete(path);
 f.records.set('martini_v2_members/'+member.id,{...member,name:'이전 명부 부원'});
 assert.ok((await history(f)).items.every(item=>item.memberName==='이전 명부 부원'));
 for(const patch of [{deletedAt:new Date(START).toISOString()},{anonymizedAt:new Date(START).toISOString()},{removedAt:new Date(START).toISOString()}]){
  f.records.set(path,{...member,...patch});
  assert.ok((await history(f)).items.every(item=>item.memberName==='삭제된 부원'),'A private current record must not fall back to a legacy name');
 }
 f.records.delete(path);f.records.delete('martini_v2_members/'+member.id);
 assert.ok((await history(f)).items.every(item=>item.memberName==='삭제된 부원'));
});

test('history excludes malformed or other-partner receipts and never follows malformed roster paths',async()=>{
 const f=fixture();receipt(f,1);receipt(f,2,{partner:'other-store'});receipt(f,3,{stampCount:11});receipt(f,4,{consumedAt:'invalid'});
 receipt(f,5,{deletedAt:new Date(START).toISOString()});receipt(f,6,{anonymizedAt:new Date(START).toISOString()});
 receipt(f,7,{memberId:'../settings',semester:'not-a-semester'});
 const result=await history(f);
 assert.deepEqual(result.items.map(item=>item.memberName),['삭제된 부원',member.name]);
 assert.ok(f.reads.every(path=>!path.includes('../')&&!path.includes('not-a-semester')));
 assert.equal(f.writes.length,0);
});

test('history contains only committed single accruals, including existing receipts after QR expiry or disabled settings',async()=>{
 const f=await ready(),first=await f.qr();
 assert.deepEqual(await history(f),{items:[],nextCursor:null});
 f.failWrites(write=>write.path===couponPath);
 await assert.rejects(stamp(f,first.token),/Synthetic transaction write failure/);
 assert.deepEqual(await history(f),{items:[],nextCursor:null});
 f.failWrites(null);
 await Promise.all([stamp(f,first.token),stamp(f,first.token),stamp(f,first.token)]);
 assert.deepEqual((await history(f)).items,[{memberName:member.name,at:new Date(START).toISOString(),stampCount:1}]);
 f.advance(10001);
 await assert.rejects(stamp(f,first.token),errorCode('failed-precondition'));
 const unused=await f.qr();f.advance(10000);
 await assert.rejects(stamp(f,unused.token),errorCode('failed-precondition'));
 await f.handle({op:'saveCouponSettings',revision:1,enabled:false},owner);
 const before=clone([...f.records]),writes=f.writes.length;
 assert.deepEqual((await history(f)).items,[{memberName:member.name,at:new Date(START).toISOString(),stampCount:1}]);
 assert.deepEqual([...f.records],before);assert.equal(f.writes.length,writes);
});
