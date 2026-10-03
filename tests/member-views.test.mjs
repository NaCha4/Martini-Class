import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setMemberSession,getMemberSessionKey,memberStorage,memberState } from '../web/src/member-session.js';

const cssHook=registerHooks({load(url,context,nextLoad){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return nextLoad(url,context);}});
let renderMemberPortal,renderMemberVerificationGate,memberPortalAction;
try{({renderMemberPortal,renderMemberVerificationGate,memberPortalAction}=await import('../web/src/member-portal.js'));}finally{cssHook.deregister();}

const sessionKey='a'.repeat(64),receiptKey='b'.repeat(64),member={name:'테스트 부원',semester:'2026-2'};
const time=offset=>new Date(Date.now()+offset).toISOString();
const event=(id,extra={})=>({eventId:id,id,title:'행사 '+id,type:'class',location:'동아리방',startsAt:time(3600000),endsAt:time(7200000),opensAt:time(-10000),closesAt:time(1800000),status:'open',fee:5000,...extra});
const application=(id,status='registered',payment='unpaid')=>({application:{id,status,payment,createdAt:time(-5000),offerExpiresAt:time(600000)},event:event('event-'+id)});
describe('member route views',()=>{
let values;
beforeEach(()=>{
 values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),get length(){return values.size;},key:index=>[...values.keys()][index]??null};
 globalThis.location={pathname:'/members',search:'',hash:'',href:'https://martini.test/members',origin:'https://martini.test'};
});
function context({events=[event('one')],requests=[],applications=[],verified=true,fail={}}={}){
 const calls=[],ctx={state:{},toast:()=>{},api:async(op,data)=>{
  calls.push({op,data});if(fail[op])throw fail[op];
  if(op==='publicRead')return {content:[]};
  if(op==='memberPortal')return {member,events,requests,expiresAt:time(60000)};
  if(op==='memberApplications')return {applications,legacyAccessRequiresReceipt:true,expiresAt:time(60000)};
  if(op==='memberCoupons')return {status:'preparing',available:false,capacity:10,rewardStatus:'undecided',expiresAt:time(60000)};
  throw Error('Unexpected API '+op);
 }};
 if(verified)setMemberSession(ctx,{sessionKey,member,expiresAt:time(60000)});
 return {ctx,calls};
}
async function view(section,options){
 const path=section==='home'?'/members':'/members/'+section;Object.assign(location,{pathname:path,href:location.origin+path});
 const data=context(options);return {...data,html:await renderMemberPortal(data.ctx,{section})};
}

test('home prioritizes three next events, actionable event applications and the prepared coupon summary',async()=>{
 const events=[event('four',{startsAt:time(4000000)}),event('three',{startsAt:time(3000000)}),event('two',{startsAt:time(2000000)}),event('one',{startsAt:time(1000000)})];
 const requests=[{id:'visit-one',kind:'visit',purpose:'private visit purpose',guestNames:'private guest',status:'pending'}];
 const {html}=await view('home',{events,requests,applications:[application('needs-payment'),application('offer','offered','none'),application('paid','registered','paid'),application('wait','waiting','none')]});
 assert.match(html,/<h1>부원 홈/);assert.match(html,/다음 행사/);assert.match(html,/지금 확인할 신청/);assert.match(html,/필링파인 쿠폰/);
 assert.equal((html.match(/class="member-event"/g)||[]).length,3);assert.ok(html.indexOf('/members/events/one')<html.indexOf('/members/events/two'));assert.doesNotMatch(html,/\/members\/events\/four/);
 assert.match(html,/\/members\/applications\/needs-payment/);assert.match(html,/\/members\/applications\/offer/);assert.doesNotMatch(html,/\/members\/applications\/(?:paid|wait)"/);
 assert.doesNotMatch(html,/data-action="member-(?:visit|inquiry|forget)"|private visit purpose|private guest/);
});
test('applications combines event status links and legacy request buttons without secret links in markup',async()=>{
 const requests=[{id:'visit-one',kind:'visit',purpose:'테스트 방문',startsAt:time(1000000),createdAt:time(-10000),guestCount:2,status:'pending'},{id:'inquiry-one',kind:'inquiry',subject:'테스트 문의',createdAt:time(-9000),status:'answered'}];
 const {html}=await view('applications',{requests,applications:[application('event-request')]});
 assert.match(html,/<h1>내 신청/);assert.match(html,/href="\/members\/applications\/event-request"/);assert.match(html,/출입 신청·문의/);
 for(const id of ['visit-one','inquiry-one'])assert.match(html,new RegExp('data-action="member-request" data-id="'+id+'"'));
 assert.match(html,/이전 행사 신청은 저장한 개인 확인 링크가 필요/);assert.doesNotMatch(html,new RegExp(sessionKey+'|'+receiptKey));
});
test('verified applications exposes a refresh control that reloads current server status',async()=>{
 const {html,ctx}=await view('applications');
 const identity=html.slice(html.indexOf('<div class="member-identity">'),html.indexOf('<section class="member-section member-event-applications">'));
 assert.match(identity,/<button[^>]*data-action="member-refresh"[^>]*>[\s\S]*?상태 새로고침<\/button>/);
 let renders=0;ctx.render=async()=>{renders++;};ctx.state.publicInfo={content:[{title:'cached'}]};
 await memberPortalAction(ctx,'member-refresh');assert.equal(renders,1);assert.equal(ctx.state.publicInfo,undefined);
});
test('visit and inquiry entry points and device exit live on more',async()=>{
 const {html}=await view('more');assert.match(html,/<h1>더보기/);assert.match(html,/aria-label="신청 바로가기"/);
 for(const name of ['visit','inquiry','forget'])assert.match(html,new RegExp('data-action="member-'+name+'"'));
 for(const path of ['/','/notices','/privacy','/members/applications'])assert.ok(html.includes('href="'+path+'"'));
});
test('coupon preparation requires verification and shows only the confirmed ten-slot preview',async()=>{
 const anonymous=await view('coupons',{verified:false});assert.match(anonymous.html,/data-action="member-verify"/);assert.doesNotMatch(anonymous.html,/member-coupon-slot/);assert.deepEqual(anonymous.calls.map(call=>call.op),['publicRead']);
 const verified=await view('coupons');assert.match(verified.html,/data-coupon-state="PREPARING"/);assert.match(verified.html,/필링파인/);assert.match(verified.html,/내 적립 내역이 아닙니다/);assert.equal((verified.html.match(/class="member-coupon-slot"/g)||[]).length,10);
 assert.doesNotMatch(verified.html,/data-action="(?:coupon|member-coupon)|\b0\s*\/\s*10\b|\bQR\b/);
});
test('transient member API failure offers retry while retaining the verified session',async()=>{
 const unavailable={code:'functions/unavailable',message:'transient'};
 const {html,ctx}=await view('applications',{fail:{memberPortal:unavailable,memberApplications:unavailable,memberCoupons:unavailable}});
 assert.match(html,/다시 불러오기/);assert.match(html,/잠시 후 다시 시도/);assert.equal(getMemberSessionKey(ctx),sessionKey);assert.doesNotMatch(html,/data-action="member-verify"|확인이 만료/);
});
test('server session rejection clears member identity and offers verification on the same route',async()=>{
 const {html,ctx}=await view('events',{fail:{memberPortal:{code:'functions/unauthenticated'}}});
 assert.equal(getMemberSessionKey(ctx),'');assert.equal(memberState(ctx).member,null);assert.match(html,/확인이 만료/);assert.match(html,/data-action="member-verify"/);assert.equal(ctx.state.memberVerificationReturnTo,'/members/events');assert.doesNotMatch(html,/class="member-event"/);
});
test('verification gate retains a safe event deep link and does not expose capability fragments',()=>{
 const {ctx}=context({verified:false});const html=renderMemberVerificationGate(ctx,{returnTo:'/members/events/event-one#private',title:'부원 확인이 필요합니다'});
 assert.equal(ctx.state.memberVerificationReturnTo,'/members/events/event-one');assert.match(html,/href="\/members\/events"[^>]*aria-current="page"/);assert.doesNotMatch(html,/#private/);
 renderMemberVerificationGate(ctx,{returnTo:'https://example.com'});assert.equal(ctx.state.memberVerificationReturnTo,'/members');
});
test('legacy fragment receipts recover independently of member verification and remain private',async()=>{
 const {ctx}=context({verified:false});Object.assign(location,{hash:'#request=legacy-join&key='+receiptKey,href:location.href+'#request=legacy-join&key='+receiptKey});
 const original=ctx.api;ctx.api=async(op,data)=>op==='clubRequestReceipt'?{request:{id:'legacy-join',kind:'join',createdAt:time(-10000),status:'approved',message:'legacy private message'}}:original(op,data);
 const html=await renderMemberPortal(ctx);assert.match(html,/개인 확인 링크/);assert.match(html,/data-action="member-request" data-id="legacy-join"/);assert.deepEqual(memberStorage(ctx).receipts,[{id:'legacy-join',receiptKey}]);assert.doesNotMatch(html,new RegExp(receiptKey));assert.doesNotMatch(html,/legacy private message/);
});
test('session-only request opening revalidates membership and never opens stale cached records',async()=>{
 const {ctx,calls}=context({requests:[]});memberState(ctx).requests=[{id:'stale-request',kind:'inquiry',subject:'private cached subject',status:'pending'}];
 await assert.rejects(memberPortalAction(ctx,'member-request','stale-request'),/신청 내역을 찾을 수 없습니다/);assert.ok(calls.some(call=>call.op==='memberPortal'));assert.deepEqual(memberState(ctx).requests,[]);
});
test('late request validation cannot open a detail or verification dialog on another route',async()=>{
 const {ctx}=context();ctx.api=async()=>{Object.assign(location,{pathname:'/notices',href:location.origin+'/notices'});return {member,requests:[{id:'late-request',kind:'inquiry',subject:'late private data'}],expiresAt:time(60000)};};
 assert.equal(await memberPortalAction(ctx,'member-request','late-request'),undefined);assert.deepEqual(memberState(ctx).requests,[]);
 Object.assign(location,{pathname:'/members/applications',href:location.origin+'/members/applications'});
 ctx.api=async()=>{Object.assign(location,{pathname:'/notices',href:location.origin+'/notices'});throw {code:'functions/unauthenticated'};};
 assert.equal(await memberPortalAction(ctx,'member-request','late-request'),undefined);assert.equal(getMemberSessionKey(ctx),sessionKey);
});
});
