import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_STORAGE_KEY,MEMBER_SESSION_COOKIE,memberState,memberStorage,persistMemberStorage,setMemberSession,getMemberSessionKey,getVerifiedMember,clearMemberIdentity,isMemberAccessError,safeMemberReturnTarget,forgetMemberDevice,isMemberRoute,refreshMemberSession } from '../web/src/member-session.js';

// Browser-cookie persistence rules are exercised without starting a browser.
function withCookies(run,url='https://martini.test/members'){
 const previous=new Map(['document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),cookies=new Map(),writes=[];
 const document={get cookie(){return [...cookies].filter(([,cookie])=>!cookie.expires||cookie.expires>Date.now()).map(([name,cookie])=>name+'='+cookie.value).join('; ');},set cookie(raw){
  writes.push(raw);const [entry,...directives]=raw.split(';').map(part=>part.trim()),index=entry.indexOf('='),name=entry.slice(0,index),value=entry.slice(index+1),attributes=Object.fromEntries(directives.map(item=>{const split=item.indexOf('=');return split<0?[item.toLowerCase(),true]:[item.slice(0,split).toLowerCase(),item.slice(split+1)];}));
  const expires=attributes['max-age']!==undefined?Date.now()+Number(attributes['max-age'])*1000:attributes.expires?Date.parse(attributes.expires):null;
  if(expires!==null&&expires<=Date.now())cookies.delete(name);else cookies.set(name,{value,expires,attributes});
 }};
 for(const [key,value] of Object.entries({document,location:new URL(url)}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 try{return run({cookies,writes,set:(name,value)=>cookies.set(name,{value:encodeURIComponent(JSON.stringify(value))})});}
 finally{for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

describe('member session and private capabilities',()=>{
let values;
beforeEach(()=>{values=new Map();globalThis.sessionStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};});
const ctx=()=>({state:{}}),token='a'.repeat(64),receipt='b'.repeat(64),expiresAt=()=>new Date(Date.now()+60000).toISOString();

test('original receipt and pending request storage survives session extraction',()=>{
 values.set(MEMBER_STORAGE_KEY,JSON.stringify({session:{sessionKey:token,expiresAt:expiresAt()},receipts:[{id:'legacy-join',receiptKey:receipt},{id:'bad/id',receiptKey:receipt}],pending:{join:{requestId:'pending-join',receiptKey:receipt},visit:{requestId:'bad',receiptKey:'bad'}}}));
 const current=ctx(),saved=memberStorage(current);
 assert.equal(getMemberSessionKey(current),token);assert.deepEqual(saved.receipts,[{id:'legacy-join',receiptKey:receipt}]);assert.deepEqual(saved.pending,{join:{requestId:'pending-join',receiptKey:receipt}});
 clearMemberIdentity(current);assert.equal(getMemberSessionKey(current),'');assert.equal(saved.receipts.length,1);assert.ok(saved.pending.join);
});
test('verified identity stays in memory and expires with its capability',()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'테스트 부원',semester:'2026-2',studentId:'not-stored'}});
 assert.deepEqual(getVerifiedMember(current),{name:'테스트 부원',semester:'2026-2'});assert.equal(values.get(MEMBER_STORAGE_KEY).includes('테스트 부원'),false);assert.equal(values.get(MEMBER_STORAGE_KEY).includes('not-stored'),false);
 memberStorage(current).session.expiresAt=new Date(Date.now()-1).toISOString();assert.equal(getMemberSessionKey(current),'');assert.equal(getVerifiedMember(current),null);
});
test('malformed saved values and unavailable storage fail closed without losing memory access',()=>{
 const current=ctx();values.set(MEMBER_STORAGE_KEY,'null');assert.deepEqual(memberStorage(current).receipts,[]);
 globalThis.sessionStorage.setItem=()=>{throw Error('storage unavailable');};setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'테스트'}});assert.equal(getMemberSessionKey(current),token);assert.equal(current.state.memberLounge.storageUnavailable,true);
 persistMemberStorage(current);
});
test('verification return paths retain valid deep links and never capability fragments or redirects',()=>{
 for(const path of ['/members','/members/events','/members/events/event_one-2','/members/applications/request_1','/members/coupons','/members/more','/events'])assert.equal(safeMemberReturnTarget(path),path);
 assert.equal(safeMemberReturnTarget('/members/events/event-one?source=menu#secret'),'/members/events/event-one');assert.equal(safeMemberReturnTarget('/events?source=menu#secret'),'/events');
 for(const path of ['https://example.com','//example.com/members','/members/../admin','/members/events/%2e%2e','/members/events/one/two','/members\\events\\one','/admin','/members/events/<script>'])assert.equal(safeMemberReturnTarget(path),'/members');
});

test('every member descendant and the events alias require login while independent share links stay separate',()=>{
 for(const path of ['/members','/members/','/members/events','/members/events/event-one','/members/applications/request-one','/members/unknown/child','/members/coupons','/members/more','/events','/events/'])assert.equal(isMemberRoute(path),true,path);
 for(const path of ['/','/about','/members-archive','/events-archive','/e','/e/event-one','/r','/r/request-one','/admin'])assert.equal(isMemberRoute(path),false,path);
});
test('network and missing content errors remain distinct from session access rejection',()=>{
 assert.equal(isMemberAccessError({code:'functions/unauthenticated'}),true);assert.equal(isMemberAccessError({code:'permission-denied'}),true);
 for(const code of ['functions/not-found','functions/unavailable','functions/deadline-exceeded','functions/internal'])assert.equal(isMemberAccessError({code}),false);
});
test('device exit removes member and interrupted event capabilities before another member verifies',()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});
 values.set('martini-pending-event-one',JSON.stringify({requestId:'request-one',receiptKey:receipt}));values.set('martini-pending-event-two',JSON.stringify({requestId:'request-two',receiptKey:receipt}));values.set('unrelated-setting','keep');
 Object.assign(current.state,{pendingApplications:{'martini-pending-event-one':{receiptKey:receipt}},currentEvent:{id:'event-one'},currentReceipt:{key:receipt},memberInlineDetail:{kind:'application',id:'private-application'},memberActiveSection:'applications',memberVerificationReturnTo:'/members/applications/request-one'});
 forgetMemberDevice(current);
 assert.deepEqual([...values.entries()],[['unrelated-setting','keep']]);assert.deepEqual(current.state,{});
 setMemberSession(current,{sessionKey:'c'.repeat(64),expiresAt:expiresAt(),member:{name:'다음 부원'}});assert.deepEqual(memberStorage(current).receipts,[]);assert.deepEqual(memberStorage(current).pending,{});assert.equal(current.state.pendingApplications,undefined);
});
test('new verification clears all rendered prior session records while preserving independent receipt capabilities',()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});
 const view=memberState(current);Object.assign(view,{events:[{id:'first-event'}],requests:[{id:'first-private-request'}],applications:[{application:{id:'first-application'}}],coupons:{status:'preparing'},receiptRows:[{id:'receipt-owned-request'}]});memberStorage(current).receipts=[{id:'receipt-owned-request',receiptKey:receipt}];
 setMemberSession(current,{sessionKey:'c'.repeat(64),expiresAt:expiresAt(),member:{name:'다음 부원'}});
 assert.deepEqual(view.events,[]);assert.deepEqual(view.requests,[]);assert.deepEqual(view.applications,[]);assert.equal(view.coupons,null);assert.deepEqual(view.receiptRows,[]);assert.equal(memberStorage(current).receipts.length,1);
});

test('clearing or replacing identity invalidates cached event and application details',()=>{
 for(const replace of [false,true]){
  const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});
  Object.assign(current.state,{currentEvent:{id:'private-event'},currentReceipt:{id:'private-application'},memberInlineDetail:{kind:'application',id:'private-application'}});memberState(current).receiptRows=[{id:'private-request'}];
  if(replace)setMemberSession(current,{sessionKey:'c'.repeat(64),expiresAt:expiresAt(),member:{name:'다음 부원'}});else clearMemberIdentity(current);
  assert.equal(current.state.currentEvent,undefined);assert.equal(current.state.currentReceipt,undefined);assert.equal(current.state.memberInlineDetail,undefined);assert.deepEqual(memberState(current).receiptRows,[]);
 }
});

test('remembered login stores only its capability and expiry in a seven-day secure host cookie',()=>withCookies(({cookies})=>{
 const current=ctx(),expiry=new Date(Date.now()+7*86400000).toISOString();
 setMemberSession(current,{sessionKey:token,expiresAt:expiry,member:{name:'쿠키 부원',studentId:'private-student',semester:'2026-2'}});
 assert.equal(MEMBER_SESSION_COOKIE,'__Host-martini-member-session');const cookie=cookies.get(MEMBER_SESSION_COOKIE);assert.ok(cookie);
 assert.deepEqual(JSON.parse(decodeURIComponent(cookie.value)),{sessionKey:token,expiresAt:expiry});assert.equal(cookie.attributes.path,'/');assert.equal(cookie.attributes.secure,true);assert.equal(cookie.attributes.samesite.toLowerCase(),'lax');assert.equal(cookie.attributes.domain,undefined);
 assert.ok(cookie.expires>Date.now()+7*86400000-3000);assert.ok(cookie.expires<=Date.now()+7*86400000);
 const saved=JSON.parse(values.get(MEMBER_STORAGE_KEY));assert.equal(saved.sessionMigrated,true);assert.equal(saved.session,undefined);assert.doesNotMatch(JSON.stringify(saved),new RegExp(token+'|쿠키 부원|private-student'));
 assert.equal(getMemberSessionKey(current),token);assert.equal(getVerifiedMember(current).name,'쿠키 부원');
}));

test('a new tab or browser session restores the cookie capability without a cached verified identity',()=>withCookies(()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'기존 부원'}});memberStorage(current).receipts=[{id:'tab-private',receiptKey:receipt}];persistMemberStorage(current);
 values.clear();const reopened=ctx();assert.equal(getMemberSessionKey(reopened),token);assert.equal(getVerifiedMember(reopened),null);assert.deepEqual(memberStorage(reopened).receipts,[]);assert.deepEqual(memberState(reopened).events,[]);
}));

test('expired and malformed cookies cannot restore a login or disclose cached member data',()=>withCookies(({cookies,set})=>{
 for(const cookie of [{sessionKey:token,expiresAt:new Date(Date.now()-1000).toISOString()},{sessionKey:'invalid',expiresAt:expiresAt()},{sessionKey:token,expiresAt:'invalid'},null]){
  values.clear();set(MEMBER_SESSION_COOKIE,cookie);const current=ctx();assert.equal(getMemberSessionKey(current),'');assert.equal(getVerifiedMember(current),null);
 }
 for(const raw of ['%invalid','undefined','%7Bnot-json']){cookies.set(MEMBER_SESSION_COOKIE,{value:raw});assert.equal(getMemberSessionKey(ctx()),'');}
}));

test('expiry of an active cookie removes its verified identity and private details',()=>withCookies(({set,cookies})=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'만료될 부원'}});memberState(current).requests=[{id:'expired-private'}];current.state.currentReceipt={id:'expired-application'};
 set(MEMBER_SESSION_COOKIE,{sessionKey:token,expiresAt:new Date(Date.now()-1000).toISOString()});
 assert.equal(getMemberSessionKey(current),'');assert.equal(getVerifiedMember(current),null);assert.deepEqual(memberState(current).requests,[]);assert.equal(current.state.currentReceipt,undefined);assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);
}));

test('blocked browser cookies retain only the current in-memory login and never persist a fallback token',()=>withCookies(()=>{
 Object.defineProperty(document,'cookie',{configurable:true,get:()=>'',set:()=>{}});
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'현재 탭 부원'}});
 assert.equal(getMemberSessionKey(current),token);assert.equal(getVerifiedMember(current).name,'현재 탭 부원');assert.equal(memberState(current).cookieUnavailable,true);assert.doesNotMatch(values.get(MEMBER_STORAGE_KEY),new RegExp(token));assert.equal(getMemberSessionKey(ctx()),'');
}));

test('available cookies restore login even when tab storage is unavailable',()=>withCookies(()=>{
 sessionStorage.setItem=()=>{throw new Error('Tab storage blocked');};
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'쿠키 부원'}});
 assert.equal(memberState(current).storageUnavailable,true);assert.equal(getMemberSessionKey(current),token);assert.equal(getMemberSessionKey(ctx()),token);
}));

test('cookie deletion in another tab invalidates cached identity, event details and in-memory requests',()=>withCookies(({cookies})=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'이전 부원'}});
 Object.assign(memberState(current),{events:[{id:'private-event'}],requests:[{id:'private-request'}],applications:[{id:'private-application'}],receiptRows:[{id:'private-receipt'}]});Object.assign(current.state,{currentEvent:{id:'private-event'},currentReceipt:{id:'private-application'},memberInlineDetail:{kind:'application',id:'private-application'}});
 cookies.delete(MEMBER_SESSION_COOKIE);
 assert.equal(getMemberSessionKey(current),'');assert.equal(getVerifiedMember(current),null);assert.deepEqual(memberState(current).requests,[]);assert.deepEqual(memberState(current).receiptRows,[]);assert.equal(current.state.currentEvent,undefined);assert.equal(current.state.currentReceipt,undefined);assert.equal(current.state.memberInlineDetail,undefined);
 assert.equal(getMemberSessionKey(ctx()),'');
}));

test('another tab replacing the cookie restores only the new token and clears the previous verified data',()=>withCookies(({set})=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});memberState(current).requests=[{id:'first-private'}];current.state.currentEvent={id:'first-event'};
 values.set('martini-pending-first-event',JSON.stringify({requestId:'first-event',receiptKey:receipt}));current.state.pendingApplications={'martini-pending-first-event':{receiptKey:receipt}};
 const next='c'.repeat(64);set(MEMBER_SESSION_COOKIE,{sessionKey:next,expiresAt:expiresAt()});
 assert.equal(getMemberSessionKey(current),next);assert.equal(getVerifiedMember(current),null);assert.deepEqual(memberState(current).requests,[]);assert.equal(current.state.currentEvent,undefined);assert.equal(getMemberSessionKey(ctx()),next);
 assert.equal(values.has('martini-pending-first-event'),false);assert.equal(current.state.pendingApplications,undefined);
}));

test('a cold tab reload after another account logs in discards old receipts and pending event capabilities',()=>withCookies(()=>{
 const tabA=ctx();setMemberSession(tabA,{sessionKey:token,expiresAt:expiresAt(),member:{name:'탭 A 부원'}});
 const receipts=[{id:'tab-a-request',receiptKey:receipt}],pending={visit:{requestId:'tab-a-pending',receiptKey:receipt}};
 Object.assign(memberStorage(tabA),{receipts,pending});persistMemberStorage(tabA);values.set('martini-pending-tab-a-event',JSON.stringify({requestId:'tab-a-event',receiptKey:receipt}));values.set('unrelated-setting','keep');
 const tabAValues=values,ownerA=JSON.parse(values.get(MEMBER_STORAGE_KEY)).sessionOwner;
 assert.match(ownerA,/^[a-f0-9]{1,16}$/);assert.notEqual(ownerA,token);
 const sameAccountReload=ctx();assert.equal(getMemberSessionKey(sameAccountReload),token);assert.deepEqual(memberStorage(sameAccountReload).receipts,receipts);assert.deepEqual(memberStorage(sameAccountReload).pending,pending);assert.equal(values.has('martini-pending-tab-a-event'),true);
 values=new Map();const tabB=ctx(),next='c'.repeat(64);setMemberSession(tabB,{sessionKey:next,expiresAt:expiresAt(),member:{name:'탭 B 부원'}});
 values=tabAValues;const reloaded=ctx();assert.equal(getMemberSessionKey(reloaded),next);assert.equal(getVerifiedMember(reloaded),null);assert.deepEqual(memberStorage(reloaded).receipts,[]);assert.deepEqual(memberStorage(reloaded).pending,{});assert.equal(values.has('martini-pending-tab-a-event'),false);assert.equal(values.get('unrelated-setting'),'keep');
 const saved=JSON.parse(values.get(MEMBER_STORAGE_KEY));assert.notEqual(saved.sessionOwner,ownerA);assert.doesNotMatch(JSON.stringify(saved),new RegExp(token+'|'+next+'|'+receipt+'|tab-a'));
 assert.deepEqual(memberStorage(ctx()).receipts,[]);
}));

test('a cold reload after logout in another tab removes old capabilities and repeated logout stays cleared',()=>withCookies(({cookies})=>{
 const tabA=ctx();setMemberSession(tabA,{sessionKey:token,expiresAt:expiresAt(),member:{name:'탭 A 부원'}});Object.assign(memberStorage(tabA),{receipts:[{id:'old-request',receiptKey:receipt}],pending:{visit:{requestId:'old-pending',receiptKey:receipt}}});persistMemberStorage(tabA);values.set('martini-pending-old-event',JSON.stringify({requestId:'old-event',receiptKey:receipt}));values.set('unrelated-setting','keep');
 const tabAValues=values;values=new Map();const tabB=ctx();assert.equal(getMemberSessionKey(tabB),token);forgetMemberDevice(tabB);assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);
 values=tabAValues;for(let repeat=0;repeat<2;repeat++){
  const reloaded=ctx();assert.equal(getMemberSessionKey(reloaded),'');assert.deepEqual(memberStorage(reloaded).receipts,[]);assert.deepEqual(memberStorage(reloaded).pending,{});assert.equal(values.has('martini-pending-old-event'),false);forgetMemberDevice(reloaded);
  assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);assert.equal(values.get('unrelated-setting'),'keep');
 }
}));

test('logout deletes the shared cookie and prevents a subsequent context from restoring it',()=>withCookies(({cookies})=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'로그아웃 부원'}});memberStorage(current).receipts=[{id:'private-request',receiptKey:receipt}];values.set('martini-pending-event',JSON.stringify({requestId:'private-event',receiptKey:receipt}));
 forgetMemberDevice(current);assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);assert.equal(getMemberSessionKey(ctx()),'');assert.equal(values.has('martini-pending-event'),false);assert.deepEqual(memberStorage(ctx()).receipts,[]);
}));

test('legacy session storage migrates to a cookie once and a migration marker prevents restoring a removed cookie',()=>withCookies(({cookies})=>{
 const legacy={session:{sessionKey:token,expiresAt:expiresAt()},receipts:[{id:'legacy-request',receiptKey:receipt}],pending:{visit:{requestId:'legacy-pending',receiptKey:receipt}}};values.set(MEMBER_STORAGE_KEY,JSON.stringify(legacy));
 const current=ctx();assert.equal(getMemberSessionKey(current),token);assert.ok(cookies.has(MEMBER_SESSION_COOKIE));const migrated=JSON.parse(values.get(MEMBER_STORAGE_KEY));assert.equal(migrated.sessionMigrated,true);assert.equal(migrated.session,undefined);assert.deepEqual(migrated.receipts,legacy.receipts);assert.deepEqual(migrated.pending,legacy.pending);
 cookies.delete(MEMBER_SESSION_COOKIE);values.set(MEMBER_STORAGE_KEY,JSON.stringify({...migrated,session:legacy.session}));assert.equal(getMemberSessionKey(ctx()),'');assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);
}));

test('an existing cookie takes precedence over a stale legacy session and refresh preserves fixed server expiry',()=>withCookies(({cookies,set,writes})=>{
 const next='c'.repeat(64);set(MEMBER_SESSION_COOKIE,{sessionKey:next,expiresAt:expiresAt()});values.set(MEMBER_STORAGE_KEY,JSON.stringify({session:{sessionKey:token,expiresAt:expiresAt()}}));
 const current=ctx();assert.equal(getMemberSessionKey(current),next);const expiry=new Date(Date.now()+3*86400000).toISOString();refreshMemberSession(current,expiry);
 assert.deepEqual(JSON.parse(decodeURIComponent(cookies.get(MEMBER_SESSION_COOKIE).value)),{sessionKey:next,expiresAt:expiry});
 const count=writes.length;refreshMemberSession(current,expiry);assert.equal(writes.length,count);assert.equal(memberStorage(current).session.expiresAt,expiry);
}));

test('HTTP localhost uses its dedicated development cookie without the Secure host prefix',()=>withCookies(({cookies})=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'개발 부원'}});
 assert.equal(cookies.has(MEMBER_SESSION_COOKIE),false);const cookie=cookies.get('martini-member-session-local');assert.ok(cookie);assert.equal(cookie.attributes.path,'/');assert.equal(cookie.attributes.secure,undefined);assert.equal(getMemberSessionKey(ctx()),token);
},'http://localhost:5173/members'));
});
