import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setMemberSession,getMemberSessionKey,memberStorage,memberState,forgetMemberDevice,MEMBER_STORAGE_KEY } from '../web/src/member-session.js';

const cssHook=registerHooks({load(url,context,nextLoad){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};if(url.endsWith('.html?raw'))return {format:'module',source:'export default "";',shortCircuit:true};return nextLoad(url,context);}});
let renderMemberPortal,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit,renderPublic,renderEventPage,renderApplicationPage,eventSubmit,eventAction;
try{
 ({renderMemberPortal,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit}=await import('../web/src/member-portal.js'));
 ({renderPublic}=await import('../web/src/public.js'));
 ({renderEventPage,renderApplicationPage,eventSubmit,eventAction}=await import('../web/src/event-pages.js'));
}finally{cssHook.deregister();}

const sessionKey='a'.repeat(64),receiptKey='b'.repeat(64),member={name:'테스트 부원',semester:'2026-2'};
const time=offset=>new Date(Date.now()+offset).toISOString();
const event=(id,extra={})=>({eventId:id,id,title:'행사 '+id,type:'class',location:'동아리방',startsAt:time(3600000),endsAt:time(7200000),opensAt:time(-10000),closesAt:time(1800000),cancelUntil:time(1800000),status:'open',fee:5000,capacity:20,registered:1,waiting:0,waitlist:true,questions:[],policy:'신청 안내',...extra});
const application=(id,status='registered',payment='unpaid')=>({application:{id,eventId:'event-'+id,name:'테스트 부원',status,payment,createdAt:time(-5000),offerExpiresAt:time(600000),paidAmount:0,refundAmount:0,fee:5000},event:event('event-'+id)});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function route(path){const url=new URL(path,'https://martini.test');Object.assign(location,{pathname:url.pathname,search:url.search,hash:url.hash,href:url.href,origin:url.origin});}
function assertLoginGate(html){
 assert.match(html,/data-form="member-login"/);assert.match(html,/<input\b[^>]*name="name"/);assert.match(html,/<input\b[^>]*name="studentId"/);
 assert.doesNotMatch(html,/<nav\b|member-event-directory|member-coupon-slot|class="member-event"|data-action="member-(?:visit|inquiry|request)"|name="phone"/);
}
describe('member route views',{timeout:10000},()=>{
let values;
beforeEach(()=>{
 values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),get length(){return values.size;},key:index=>[...values.keys()][index]??null};
 globalThis.location={pathname:'/members',search:'',hash:'',href:'https://martini.test/members',origin:'https://martini.test'};
});
function context({events=[event('one')],requests=[],applications=[],verified=true,fail={}}={}){
 const calls=[],navigations=[],ctx={state:{},toast:()=>{},render:async()=>{},navigate:async(path)=>{navigations.push(path);route(path);return true;},api:async(op,data)=>{
  calls.push({op,data});if(fail[op])throw fail[op];
  if(op==='publicRead')return {content:[]};
  if(op==='memberPortal')return {member,events,requests,expiresAt:time(60000)};
  if(op==='memberApplications')return {applications,legacyAccessRequiresReceipt:true,expiresAt:time(60000)};
  if(op==='memberCoupons')return {status:'preparing',available:false,capacity:10,rewardStatus:'undecided',expiresAt:time(60000)};
  if(op==='memberEventAccess'||op==='eventAccess')return event(data.eventId);
  if(op==='memberApplication'||op==='receipt')return application(data.id);
  if(op==='resolveLink')return {id:data.kind==='e'?'event-one':'request-one'};
  if(op==='memberAccess')return {member,expiresAt:time(60000)};
  throw Error('Unexpected API '+op);
 }};
 if(verified)setMemberSession(ctx,{sessionKey,member,expiresAt:time(60000)});
 return {ctx,calls,navigations};
}
async function view(section,options){
 const path=section==='home'?'/members':'/members/'+section;Object.assign(location,{pathname:path,href:location.origin+path});
 const data=context(options);return {...data,html:await renderMemberPortal(data.ctx,{section})};
}

test('home greets the member and prioritizes three next events and actionable applications',async()=>{
 const events=[event('four',{startsAt:time(4000000)}),event('three',{startsAt:time(3000000)}),event('two',{startsAt:time(2000000)}),event('one',{startsAt:time(1000000)})];
 const requests=[{id:'visit-one',kind:'visit',purpose:'private visit purpose',guestNames:'private guest',status:'pending'}];
 const {html}=await view('home',{events,requests,applications:[application('needs-payment'),application('offer','offered','none'),application('paid','registered','paid'),application('wait','waiting','none')]});
 assert.match(html,/<h1\b[^>]*>[^<]*테스트 부원/);assert.match(html,/다음 행사/);assert.match(html,/지금 확인할 신청/);assert.doesNotMatch(html,/member-home-coupon|data-coupon-state/);
 assert.equal((html.match(/class="member-event"/g)||[]).length,3);assert.ok(html.indexOf('/members/events/one')<html.indexOf('/members/events/two'));assert.doesNotMatch(html,/\/members\/events\/four/);
 assert.match(html,/\/members\/applications\/needs-payment/);assert.match(html,/\/members\/applications\/offer/);assert.doesNotMatch(html,/\/members\/applications\/(?:paid|wait)"/);
 assert.doesNotMatch(html,/data-action="member-(?:visit|inquiry|forget)"|private visit purpose|private guest/);
});
test('applications combines event status links and legacy request buttons without secret links in markup',async()=>{
 const requests=[{id:'visit-one',kind:'visit',purpose:'테스트 방문',startsAt:time(1000000),createdAt:time(-10000),guestCount:2,status:'pending'},{id:'inquiry-one',kind:'inquiry',subject:'테스트 문의',createdAt:time(-9000),status:'answered'}];
 const {html}=await view('applications',{requests,applications:[application('event-request')]});
 assert.match(html,/<h1\b[^>]*>내 신청/);assert.match(html,/href="\/members\/applications\/event-request"/);assert.match(html,/출입 신청·문의/);
 for(const id of ['visit-one','inquiry-one'])assert.match(html,new RegExp('data-action="member-request" data-id="'+id+'"'));
 assert.match(html,/이전 행사 신청은 저장한 개인 확인 링크가 필요/);assert.doesNotMatch(html,new RegExp(sessionKey+'|'+receiptKey));
});
test('verified applications exposes a refresh control that reloads current server status',async()=>{
 const {html,ctx}=await view('applications');
 assert.match(html,/<button[^>]*data-action="member-refresh"[^>]*>[\s\S]*?새로고침<\/button>/);
 let renders=0;ctx.render=async()=>{renders++;};ctx.state.publicInfo={content:[{title:'cached'}]};
 await memberPortalAction(ctx,'member-refresh');assert.equal(renders,1);assert.equal(ctx.state.publicInfo,undefined);
});
test('visit and inquiry entry points and device exit live on more',async()=>{
 const {html}=await view('more');assert.match(html,/<h1\b[^>]*>더보기/);assert.match(html,/aria-label="신청 바로가기"/);
 for(const name of ['visit','inquiry','forget'])assert.match(html,new RegExp('data-action="member-'+name+'"'));
 for(const path of ['/','/notices','/privacy','/members/applications'])assert.ok(html.includes('href="'+path+'"'));
});
test('coupon preparation requires login and uses a concise unavailable state',async()=>{
 const anonymous=await view('coupons',{verified:false});assertLoginGate(anonymous.html);assert.deepEqual(anonymous.calls,[]);
 const verified=await view('coupons');assert.match(verified.html,/data-coupon-state="PREPARING"/);assert.match(verified.html,/필링파인/);assert.match(verified.html,/준비 중/);assert.doesNotMatch(verified.html,/member-coupon-slot|쿠폰 구성 미리보기|최대 10칸/);
 assert.doesNotMatch(verified.html,/data-action="(?:coupon|member-coupon)|\b0\s*\/\s*10\b|\bQR\b/);
});
test('transient member API failure offers retry while retaining the verified session',async()=>{
 const unavailable={code:'functions/unavailable',message:'transient'};
 const {html,ctx}=await view('applications',{fail:{memberPortal:unavailable,memberApplications:unavailable,memberCoupons:unavailable}});
 assert.match(html,/다시 (?:불러오기|시도)/);assert.match(html,/잠시 후 다시 시도/);assert.equal(getMemberSessionKey(ctx),sessionKey);assert.doesNotMatch(html,/<nav\b|data-action="member-verify"|확인이 만료|class="member-event"/);
});
test('server session rejection clears member identity and offers verification on the same route',async()=>{
 const {html,ctx}=await view('events',{fail:{memberPortal:{code:'functions/unauthenticated'}}});
 assert.equal(getMemberSessionKey(ctx),'');assert.equal(memberState(ctx).member,null);assert.match(html,/만료|변경/);assertLoginGate(html);assert.equal(ctx.state.memberVerificationReturnTo,'/members/events');
});
test('verification gate retains a safe event deep link and does not expose capability fragments',()=>{
 const {ctx}=context({verified:false});const html=renderMemberVerificationGate(ctx,{returnTo:'/members/events/event-one#private',title:'부원 확인이 필요합니다'});
 assert.equal(ctx.state.memberVerificationReturnTo,'/members/events/event-one');assertLoginGate(html);assert.doesNotMatch(html,/#private/);
 renderMemberVerificationGate(ctx,{returnTo:'https://example.com'});assert.equal(ctx.state.memberVerificationReturnTo,'/members');
});
test('legacy lounge receipt fragments cannot bypass login or trigger a private API request',async()=>{
 const {ctx}=context({verified:false});Object.assign(location,{hash:'#request=legacy-join&key='+receiptKey,href:location.href+'#request=legacy-join&key='+receiptKey});
 const original=ctx.api;
 let receiptReads=0;ctx.api=async(op,data)=>{if(op==='clubRequestReceipt')receiptReads++;return original(op,data);};
 const html=await renderMemberPortal(ctx);assertLoginGate(html);assert.equal(receiptReads,0);assert.deepEqual(memberStorage(ctx).receipts,[]);assert.doesNotMatch(html,new RegExp(receiptKey));assert.doesNotMatch(html,/legacy private message/);
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

test('every lounge route and the events alias are a direct login gate with zero API calls before login',async()=>{
 for(const path of ['/members','/members/','/members/events','/members/applications','/members/coupons','/members/more','/members/events/event-one','/members/applications/request-one','/members/unknown/child','/events','/events/']){
  values.clear();route(path+'#request=legacy-request&key='+receiptKey);
  const {ctx,calls}=context({verified:false});
  memberStorage(ctx).receipts=[{id:'legacy-request',receiptKey}];memberStorage(ctx).pending={visit:{requestId:'pending-visit',receiptKey}};
  Object.assign(memberState(ctx),{member:{name:'OLD PRIVATE NAME'},events:[event('old')],requests:[{id:'old',subject:'OLD PRIVATE REQUEST'}],receiptRows:[{id:'legacy-request',subject:'OLD PRIVATE RECEIPT'}]});
  const html=await renderPublic(ctx);assertLoginGate(html);assert.deepEqual(calls,[],path);
  assert.doesNotMatch(html,/OLD PRIVATE|행사 old/);assert.doesNotMatch(html,new RegExp(receiptKey));
 }
});

test('a locally stored unexpired token must pass server validation before any secondary or receipt query',async()=>{
 const barrier=deferred(),{ctx,calls}=context(),base=ctx.api;route('/members/applications');
 const view=memberState(ctx);Object.assign(view,{requests:[{id:'old',subject:'OLD PRIVATE REQUEST'}],receiptRows:[{id:'old-receipt',subject:'OLD PRIVATE RECEIPT'}]});
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 ctx.api=async(op,data)=>{if(op==='memberPortal'){calls.push({op,data});return barrier.promise;}return base(op,data);};
 const pending=renderMemberPortal(ctx,{section:'applications'});
 assert.deepEqual(calls.map(call=>call.op),['memberPortal']);
 barrier.reject({code:'functions/permission-denied'});
 const html=await pending;assertLoginGate(html);assert.deepEqual(calls.map(call=>call.op),['memberPortal']);
 assert.equal(getMemberSessionKey(ctx),'');assert.deepEqual(view.receiptRows,[]);assert.doesNotMatch(html,/OLD PRIVATE/);
});

test('transient primary validation failures reveal no cached member content and never fetch receipts',async()=>{
 const {ctx,calls}=context({fail:{memberPortal:{code:'functions/unavailable'}}});route('/members/applications');
 Object.assign(memberState(ctx),{events:[event('PRIVATE')],requests:[{id:'old',subject:'PRIVATE REQUEST'}],applications:[application('PRIVATE')],receiptRows:[{id:'old-receipt',subject:'PRIVATE RECEIPT'}]});
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 const html=await renderMemberPortal(ctx,{section:'applications'});
 assert.match(html,/다시 (?:불러오기|시도)/);assert.doesNotMatch(html,/<nav\b|PRIVATE|테스트 부원|class="member-event"/);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal']);assert.equal(getMemberSessionKey(ctx),sessionKey);
});

test('login submits only name and student ID to memberAccess and waits for the verified server response',async()=>{
 route('/members/events/event-one');const {ctx,calls,navigations}=context({verified:false}),barrier=deferred();
 renderMemberVerificationGate(ctx,{returnTo:location.pathname});
 ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};
 const form=new FormData();form.set('name','  테스트 부원  ');form.set('studentId','  2026001  ');
 const pending=memberPortalSubmit(ctx,'member-login',form);
 assert.equal(calls.length,1);assert.equal(calls[0].op,'memberAccess');
 assert.deepEqual(Object.keys(calls[0].data).sort(),['name','sessionKey','studentId']);assert.equal(calls[0].data.name,'테스트 부원');assert.equal(calls[0].data.studentId,'2026001');
 assert.equal(getMemberSessionKey(ctx),'');assert.match(calls[0].data.sessionKey,/^[a-f0-9]{64}$/);
 barrier.resolve({member,expiresAt:time(60000)});await pending;
 assert.equal(getMemberSessionKey(ctx),calls[0].data.sessionKey);assert.equal(memberState(ctx).member.name,member.name);
 assert.ok(navigations.length===0||navigations.every(path=>path==='/members/events/event-one'));
 const stored=values.get(MEMBER_STORAGE_KEY);assert.doesNotMatch(stored,/테스트 부원|2026001/);
});

test('a rejected login cannot establish a client session or expose previous cached content',async()=>{
 const {ctx,calls}=context({verified:false,fail:{memberAccess:{code:'functions/permission-denied'}}});
 const form=new FormData();form.set('name','존재하지 않는 부원');form.set('studentId','wrong');
 await assert.rejects(memberPortalSubmit(ctx,'member-login',form),/부원|이름|학번/);
 assert.equal(getMemberSessionKey(ctx),'');assert.deepEqual(calls.map(call=>call.op),['memberAccess']);
 assertLoginGate(await renderMemberPortal(ctx));
});

test('successful login resumes a legacy lounge receipt in applications without exposing its key',async()=>{
 route('/members#request=legacy-request&key='+receiptKey);const {ctx,calls,navigations}=context({verified:false}),base=ctx.api;
 ctx.api=async(op,data)=>{if(op==='clubRequestReceipt'){calls.push({op,data});return {request:{id:'legacy-request',kind:'inquiry',subject:'기존 문의',status:'answered',createdAt:time(-10000)}};}return base(op,data);};
 assertLoginGate(await renderMemberPortal(ctx));assert.deepEqual(calls,[]);
 const form=new FormData();form.set('name','테스트 부원');form.set('studentId','2026001');await memberPortalSubmit(ctx,'member-login',form);
 assert.deepEqual(navigations,['/members/applications#request=legacy-request&key='+receiptKey]);
 const html=await renderMemberPortal(ctx,{section:'applications'});assert.match(html,/기존 문의/);assert.doesNotMatch(html,new RegExp(receiptKey));assert.deepEqual(memberStorage(ctx).receipts,[{id:'legacy-request',receiptKey}]);
 assert.ok(calls.findIndex(call=>call.op==='memberPortal')<calls.findIndex(call=>call.op==='clubRequestReceipt'));
});

test('anonymous lounge actions and inquiry submission cannot bypass the page login gate',async()=>{
 const {ctx,calls}=context({verified:false});memberStorage(ctx).receipts=[{id:'legacy-request',receiptKey}];
 for(const action of ['member-inquiry','member-visit','member-request'])await memberPortalAction(ctx,action,'legacy-request');
 const form=new FormData();form.set('name','anonymous');form.set('studentId','2026001');form.set('subject','subject');form.set('message','message');form.set('consent','on');
 await assert.rejects(memberPortalSubmit(ctx,'member-inquiry',form),/로그인/);assert.deepEqual(calls,[]);
});

test('late login results cannot establish a session after leaving the login page or logging out',async()=>{
 for(const change of ['route','logout']){
  values.clear();route('/members');const {ctx,calls}=context({verified:false}),barrier=deferred();
  ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};const form=new FormData();form.set('name','테스트 부원');form.set('studentId','2026001');
  const pending=memberPortalSubmit(ctx,'member-login',form);
  assert.equal(calls[0]?.op,'memberAccess');
  if(change==='route')route('/notices');else forgetMemberDevice(ctx);
  barrier.resolve({member,expiresAt:time(60000)});await pending;assert.equal(getMemberSessionKey(ctx),'',change);
 }
});

test('late lounge validation results are discarded when a different member logs in or exits',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members');const {ctx}=context(),barrier=deferred(),base=ctx.api;
  ctx.api=(op,data)=>op==='memberPortal'?barrier.promise:base(op,data);
  const pending=renderMemberPortal(ctx);
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({member:{name:'OLD PRIVATE NAME'},events:[event('OLD-PRIVATE')],requests:[],expiresAt:time(60000)});
  const html=await pending;assert.doesNotMatch(html,/OLD PRIVATE|OLD-PRIVATE/);assert.deepEqual(memberState(ctx).events,[]);
  assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
 }
});

test('late legacy receipt responses cannot enter a replacement member session',async()=>{
 route('/members/applications');const {ctx}=context(),barrier=deferred(),started=deferred(),base=ctx.api;
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 ctx.api=(op,data)=>{if(op==='clubRequestReceipt'){started.resolve();return barrier.promise;}return base(op,data);};
 const pending=renderMemberPortal(ctx,{section:'applications'});await started.promise;
 setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});
 barrier.resolve({request:{id:'old-receipt',kind:'inquiry',subject:'OLD PRIVATE RECEIPT',createdAt:time(-10000),status:'answered'}});
 const html=await pending;assert.doesNotMatch(html,/OLD PRIVATE/);assert.deepEqual(memberState(ctx).receiptRows,[]);assert.equal(getMemberSessionKey(ctx),'c'.repeat(64));
});

test('member detail pages gate without API access and clear rejected sessions without fetching public capabilities',async()=>{
 for(const [renderer,path,id] of [[renderEventPage,'/members/events/event-one','event-one'],[renderApplicationPage,'/members/applications/request-one','request-one']]){
  values.clear();route(path);let current=context({verified:false});assertLoginGate(await renderer(current.ctx,id,{member:true}));assert.deepEqual(current.calls,[]);
  current=context({fail:{memberEventAccess:{code:'functions/permission-denied'},memberApplication:{code:'functions/unauthenticated'}}});
  assertLoginGate(await renderer(current.ctx,id,{member:true}));assert.equal(getMemberSessionKey(current.ctx),'');assert.equal(current.calls.length,1);assert.ok(current.calls[0].op.startsWith('member'));
 }
});

test('member detail validation outages show retry without revealing the lounge navigation or cached details',async()=>{
 for(const [renderer,path,id] of [[renderEventPage,'/members/events/event-one','event-one'],[renderApplicationPage,'/members/applications/request-one','request-one']]){
  values.clear();route(path);const {ctx,calls}=context({fail:{memberEventAccess:{code:'functions/unavailable'},memberApplication:{code:'functions/unavailable'}}});
  Object.assign(ctx.state,{currentEvent:{title:'OLD PRIVATE EVENT'},currentReceipt:{application:{name:'OLD PRIVATE MEMBER'}}});
  const html=await renderer(ctx,id,{member:true});assert.match(html,/다시 불러오기/);assert.doesNotMatch(html,/<nav\b|OLD PRIVATE|data-form="apply"|class="receipt-card"/);
  assert.equal(calls.length,1);assert.equal(getMemberSessionKey(ctx),sessionKey);
 }
});

test('late member detail successes and rejections cannot restore or clear a different session',async()=>{
 for(const [renderer,path,id,stateKey,response] of [[renderEventPage,'/members/events/event-one','event-one','currentEvent',event('event-one')],[renderApplicationPage,'/members/applications/request-one','request-one','currentReceipt',application('request-one')]]){
  for(const change of ['replacement','logout'])for(const rejected of [false,true]){
   values.clear();route(path);const {ctx}=context(),barrier=deferred();ctx.api=async()=>barrier.promise;
   const pending=renderer(ctx,id,{member:true});
   if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
   if(rejected)barrier.reject({code:'functions/unauthenticated'});else barrier.resolve(response);
   assert.equal(await pending,'');assert.equal(ctx.state[stateKey],undefined);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
  }
 }
});

test('independent e and r share links retain capability access without a member session',async()=>{
 for(const path of ['/e/event-one#'+receiptKey,'/r/request-one#'+receiptKey,'/e#'+receiptKey,'/r#'+receiptKey]){
  values.clear();route(path);const {ctx,calls}=context({verified:false});const html=await renderPublic(ctx);
  assert.doesNotMatch(html,/data-form="member-login"/);assert.equal(calls.some(call=>call.op.startsWith('member')),false);assert.ok(calls.some(call=>['eventAccess','receipt'].includes(call.op)));
 }
});

test('late inquiry submissions do not insert old private records or rerender after identity changes',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members/more');const {ctx,calls}=context(),barrier=deferred();let renders=0;
  ctx.render=async()=>{renders++;};ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};
  const form=new FormData();form.set('subject','PRIVATE OLD SUBJECT');form.set('message','PRIVATE OLD MESSAGE');form.set('consent','on');
  const pending=memberPortalSubmit(ctx,'member-inquiry',form);assert.equal(calls[0]?.op,'submitClubRequest');
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({id:'old-request',request:{id:'old-request',kind:'inquiry',subject:'PRIVATE OLD SUBJECT',message:'PRIVATE OLD MESSAGE'}});
  await pending;assert.deepEqual(memberState(ctx).receiptRows,[]);assert.equal(renders,0);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
  if(change==='logout')assert.deepEqual(memberStorage(ctx).receipts,[]);
 }
});

test('late event submissions do not navigate or recreate private state after identity changes',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members/events/event-one');const {ctx,navigations}=context(),barrier=deferred(),started=deferred();
  ctx.state.currentEvent={...event('event-one'),memberAccess:true,accessUrl:location.href};
  ctx.api=async(op)=>{assert.equal(op,'apply');started.resolve();return barrier.promise;};
  const form=new FormData();form.set('consent','on');const pending=eventSubmit(ctx,'apply',form);await started.promise;
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({id:'old-private-application'});await pending;
  assert.deepEqual(navigations,[]);assert.equal(ctx.state.currentEvent,undefined);assert.equal(ctx.state.currentReceipt,undefined);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
 }
});

test('late receipt commands do not refresh or announce an earlier session result',async()=>{
 route('/members/applications/request-one');const {ctx}=context(),barrier=deferred();let renders=0,toasts=0;
 ctx.state.currentReceipt={...application('request-one','offered','none'),id:'request-one',memberAccess:true,accessUrl:location.href};
 ctx.api=async()=>barrier.promise;ctx.render=async()=>{renders++;};ctx.toast=()=>{toasts++;};
 const pending=eventAction(ctx,'receipt-accept');forgetMemberDevice(ctx);barrier.resolve({});await pending;
 assert.equal(renders,0);assert.equal(toasts,0);assert.equal(getMemberSessionKey(ctx),'');
});

test('member application recovery links are collapsed after the main status actions',async()=>{
 route('/members/applications/request-one');const {ctx}=context();const html=await renderApplicationPage(ctx,'request-one',{member:true});
 assert.match(html,/<details\b[^>]*class="[^"]*member-receipt-recovery[^"]*"[^>]*>/);
 assert.doesNotMatch(html,/<details\b[^>]*class="[^"]*member-receipt-recovery[^"]*"[^>]*\bopen\b/);
 assert.ok(html.indexOf('class="receipt-actions"')<html.indexOf('member-receipt-recovery'));assert.doesNotMatch(html,/class="receipt-link-save"/);
});
});
