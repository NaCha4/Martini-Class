import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_STORAGE_KEY,memberState,memberStorage,persistMemberStorage,setMemberSession,getMemberSessionKey,getVerifiedMember,clearMemberIdentity,isMemberAccessError,safeMemberReturnTarget,forgetMemberDevice } from '../web/src/member-session.js';

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
test('network and missing content errors remain distinct from session access rejection',()=>{
 assert.equal(isMemberAccessError({code:'functions/unauthenticated'}),true);assert.equal(isMemberAccessError({code:'permission-denied'}),true);
 for(const code of ['functions/not-found','functions/unavailable','functions/deadline-exceeded','functions/internal'])assert.equal(isMemberAccessError({code}),false);
});
test('device exit removes member and interrupted event capabilities before another member verifies',()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});
 values.set('martini-pending-event-one',JSON.stringify({requestId:'request-one',receiptKey:receipt}));values.set('martini-pending-event-two',JSON.stringify({requestId:'request-two',receiptKey:receipt}));values.set('unrelated-setting','keep');
 Object.assign(current.state,{pendingApplications:{'martini-pending-event-one':{receiptKey:receipt}},currentEvent:{id:'event-one'},currentReceipt:{key:receipt},memberVerificationReturnTo:'/members/applications/request-one'});
 forgetMemberDevice(current);
 assert.deepEqual([...values.entries()],[['unrelated-setting','keep']]);assert.deepEqual(current.state,{});
 setMemberSession(current,{sessionKey:'c'.repeat(64),expiresAt:expiresAt(),member:{name:'다음 부원'}});assert.deepEqual(memberStorage(current).receipts,[]);assert.deepEqual(memberStorage(current).pending,{});assert.equal(current.state.pendingApplications,undefined);
});
test('new verification clears prior session records while preserving independently held receipts',()=>{
 const current=ctx();setMemberSession(current,{sessionKey:token,expiresAt:expiresAt(),member:{name:'첫 부원'}});
 const view=memberState(current);Object.assign(view,{events:[{id:'first-event'}],requests:[{id:'first-private-request'}],applications:[{application:{id:'first-application'}}],coupons:{status:'preparing'},receiptRows:[{id:'receipt-owned-request'}]});memberStorage(current).receipts=[{id:'receipt-owned-request',receiptKey:receipt}];
 setMemberSession(current,{sessionKey:'c'.repeat(64),expiresAt:expiresAt(),member:{name:'다음 부원'}});
 assert.deepEqual(view.events,[]);assert.deepEqual(view.requests,[]);assert.deepEqual(view.applications,[]);assert.equal(view.coupons,null);assert.deepEqual(view.receiptRows,[{id:'receipt-owned-request'}]);assert.equal(memberStorage(current).receipts.length,1);
});
});
