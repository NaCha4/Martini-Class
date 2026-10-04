import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { getMerchantSessionKey,setMerchantSession,clearMerchantSession,merchantCookieUnavailable,MERCHANT_SESSION_COOKIE } from '../web/src/merchant-session.js';
import { setMemberSession } from '../web/src/member-session.js';
import { renderPartnerAdmin,partnerAdminAction } from '../web/src/partner-admin.js';
const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
let openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime;
try{({openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime}=await import('../web/src/partner-stamps.js'));}finally{hook.deregister();}
const merchantKey='a'.repeat(64),memberKey='b'.repeat(64),qrToken='c'.repeat(64),otherKey='d'.repeat(64);
const future=offset=>new Date(Date.now()+offset).toISOString();
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
function context(){const calls=[],toasts=[],ctx={state:{},renders:0,render:async()=>{ctx.renders++;},toast:message=>toasts.push(message),api:async(op,data)=>{calls.push({op,data});if(op==='merchantSession')return {expiresAt:future(86400000),partnerName:'필링파인'};if(op==='merchantCouponPreview')return {memberName:'테스트 부원',stampCount:3,capacity:10,expiresAt:future(30000),serverNow:future(0)};if(op==='stampCoupon')return {stampCount:4,capacity:10};if(op==='merchantLogout')return {ok:true};if(op==='merchantLogin')return {sessionKey:merchantKey,expiresAt:future(365*86400000)};if(op==='memberCoupons')return {available:true,stampCount:3,capacity:10,revision:1,expiresAt:future(600000)};if(op==='issueCouponQr')return {token:qrToken,expiresAt:future(30000),serverNow:future(0)};throw Error('Unexpected op '+op);}};return {ctx,calls,toasts};}
async function host(run,{path='/partners/feelingfine',blocked=false}={}){
 const keys=['document','window','location','history','sessionStorage','performance','setInterval','clearInterval','CSS'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const cookies=new Map(),writes=[],dialogs=[],timers=new Map(),tab=new Map(),docListeners=new Map(),winListeners=new Map();let now=1000,timerId=0,rejectCookies=blocked;
 const listen=(map,type,fn)=>{if(!map.has(type))map.set(type,new Set());map.get(type).add(fn);},unlisten=(map,type,fn)=>map.get(type)?.delete(fn);
 class Element{
  constructor(tag='div'){this.tag=tag;this.innerHTML='';this.textContent='';this.style={};this.attrs=new Map();this.listeners=new Map();this.parts=new Map();this.dataset={};this.isConnected=true;const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  setAttribute(n,v){this.attrs.set(n,String(v));}getAttribute(n){return this.attrs.get(n)||null;}removeAttribute(n){this.attrs.delete(n);}addEventListener(n,fn){listen(this.listeners,n,fn);}focus(){document.activeElement=this;}matches(){return false;}getClientRects(){return [1];}closest(){return null;}remove(){this.isConnected=false;}showModal(){this.open=true;}close(){if(!this.open)return;this.open=false;for(const fn of this.listeners.get('close')||[])fn();}
  querySelector(selector){if(selector==='form'||selector==='form[aria-busy=true]'||selector==='#discard-changes')return null;if(!this.parts.has(selector)){const part=new Element();part.parent=this;this.parts.set(selector,part);}return this.parts.get(selector);}
  querySelectorAll(){return [];}
 }
 const panel=new Element();
 const document={hidden:false,activeElement:null,body:new Element('body'),documentElement:new Element('html'),createElement:tag=>new Element(tag),querySelector(selector){if(selector==='.merchant-panel')return panel;if(['#modal','#modal[open]','dialog[open]'].includes(selector))return dialogs.findLast(dialog=>dialog.isConnected&&(selector==='#modal'||dialog.open))||null;return null;},querySelectorAll:()=>[],addEventListener:(n,fn)=>listen(docListeners,n,fn),removeEventListener:(n,fn)=>unlisten(docListeners,n,fn)};
 document.body.append=dialog=>dialogs.push(dialog);document.activeElement=document.body;
 Object.defineProperty(document,'cookie',{get:()=>[...cookies].map(([key,value])=>key+'='+value).join('; '),set:raw=>{writes.push(raw);if(rejectCookies)return;const [pair]=raw.split(';'),split=pair.indexOf('='),name=pair.slice(0,split),value=pair.slice(split+1);if(raw.includes('Max-Age=0'))cookies.delete(name);else cookies.set(name,value);}});
 const location={pathname:path,search:'',hash:'',protocol:'https:',hostname:'martini.test',origin:'https://martini.test'};
 const values={document,window:{addEventListener:(n,fn)=>listen(winListeners,n,fn),removeEventListener:(n,fn)=>unlisten(winListeners,n,fn)},location,history:{state:{},replaceState(_s,_t,url){location.hash='';this.last=url;}},sessionStorage:{getItem:key=>tab.get(key)||null,setItem:(key,value)=>tab.set(key,value),removeItem:key=>tab.delete(key),get length(){return tab.size;},key:index=>[...tab.keys()][index]},performance:{now:()=>now},setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),CSS:{supports:()=>true}};
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 try{return await run({cookies,writes,dialogs,timers,tab,panel,blockCookies:value=>{rejectCookies=value;},tick:async ms=>{now+=ms;for(const fn of [...timers.values()])fn();await Promise.resolve();},hidden:async value=>{document.hidden=value;for(const fn of [...docListeners.get('visibilitychange')||[]])fn();await Promise.resolve();},pagehide:async()=>{for(const fn of [...winListeners.get('pagehide')||[]])fn();await Promise.resolve();},focus:()=>{for(const fn of [...winListeners.get('focus')||[]])fn();}});}
 finally{for(const dialog of dialogs)dialog.close();for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
function signIn(ctx){setMerchantSession(ctx,{sessionKey:merchantKey,expiresAt:future(365*86400000)});}
function memberSignIn(ctx){setMemberSession(ctx,{sessionKey:memberKey,expiresAt:future(600000),member:{name:'테스트 부원',semester:'2026-2'}});}

test('merchant cookies persist only opaque credentials with host-only HTTPS attributes and a one-year ceiling',async()=>host(async({writes,cookies})=>{
 const {ctx}=context();setMerchantSession(ctx,{sessionKey:merchantKey,expiresAt:future(500*86400000),code:'never-save-this',memberName:'never-save-name'});
 assert.equal(getMerchantSessionKey(ctx),merchantKey);const cookie=writes.at(-1);assert.match(cookie,/^__Host-martini-feelingfine-session=/);assert.match(cookie,/; Path=\/; SameSite=Lax; Secure/);assert.doesNotMatch(cookie,/Domain=|never-save|code|memberName/);assert.ok(Number(cookie.match(/Max-Age=(\d+)/)[1])<=31536000);
 assert.deepEqual(Object.keys(JSON.parse(decodeURIComponent(cookies.get(MERCHANT_SESSION_COOKIE)))).sort(),['expiresAt','sessionKey']);assert.equal(getMerchantSessionKey({state:{}}),merchantKey);
 clearMerchantSession(ctx);assert.equal(getMerchantSessionKey(ctx),'');assert.equal(cookies.size,0);
}));

test('blocked cookies keep merchant login in memory and report unavailability',async()=>host(async()=>{
 const {ctx}=context();signIn(ctx);assert.equal(getMerchantSessionKey(ctx),merchantKey);assert.equal(merchantCookieUnavailable(ctx),true);assert.equal(getMerchantSessionKey({state:{}}),'');
},{blocked:true}));

test('merchant cookie replacement and expiry invalidate the old in-memory identity',async()=>host(async({cookies})=>{
 const {ctx}=context();signIn(ctx);cookies.set(MERCHANT_SESSION_COOKIE,encodeURIComponent(JSON.stringify({sessionKey:otherKey,expiresAt:future(60000)})));assert.equal(getMerchantSessionKey(ctx),otherKey);
 cookies.set(MERCHANT_SESSION_COOKIE,encodeURIComponent(JSON.stringify({sessionKey:otherKey,expiresAt:future(-1000)})));assert.equal(getMerchantSessionKey(ctx),'');
}));

test('member QR lifetime subtracts request latency, caps at thirty seconds, and fails closed on malformed times',()=>{
 const response={expiresAt:'2026-10-05T01:00:30.000Z',serverNow:'2026-10-05T01:00:00.000Z'};
 assert.equal(qrLifetime(response,1000,3000),28000);assert.equal(qrLifetime(response,1000,32000),0);
 assert.equal(qrLifetime({...response,expiresAt:'2026-10-05T01:01:00.000Z'},1000,3000),28000);
 assert.equal(qrLifetime({...response,expiresAt:'2026-10-05T01:00:10.000Z'},1000,3000),8000);assert.equal(qrLifetime({},1000,1000),0);
});

test('a scanned QR is removed from the URL before the login form and performs no write or anonymous preview',async()=>host(async()=>{
 const {ctx,calls}=context();location.hash='#qr='+qrToken;const html=await renderMerchant(ctx);
 assert.equal(location.hash,'');assert.equal(history.last,'/partners/feelingfine');assert.equal(ctx.state.feelingfineMerchant.token,qrToken);assert.match(html,/data-form="merchant-login"/);assert.doesNotMatch(html,new RegExp(qrToken));assert.deepEqual(calls,[]);
}));

test('authenticated scans only preview until the merchant explicitly confirms one stamp',async()=>host(async()=>{
 const {ctx,calls}=context();signIn(ctx);location.hash='#qr='+qrToken;const html=await renderMerchant(ctx);
 assert.deepEqual(calls.map(call=>call.op),['merchantSession','merchantCouponPreview']);assert.match(html,/테스트 부원/);assert.match(html,/data-action="merchant-stamp"/);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);
}));

test('full stamp cards have no add action or invented reward reset',async()=>host(async()=>{
 const {ctx}=context(),api=ctx.api;signIn(ctx);location.hash='#qr='+qrToken;ctx.api=async(op,data)=>op==='merchantCouponPreview'?{memberName:'부원',stampCount:10,capacity:10,expiresAt:future(10000),serverNow:future(0)}:api(op,data);
 const html=await renderMerchant(ctx);assert.match(html,/10개가 모두 채워져/);assert.doesNotMatch(html,/data-action="merchant-stamp"|초기화|보상|무료/);
}));

test('merchant login trims the code, persists only the session, and discards late login replies after navigation',async()=>host(async({writes})=>{
 const {ctx,calls}=context();await renderMerchant(ctx);let reset=0;await merchantSubmit(ctx,'merchant-login',{get:()=> '  testing-store-code  '},{reset(){reset++;}});
 assert.deepEqual(calls,[{op:'merchantLogin',data:{code:'testing-store-code'}}]);assert.equal(getMerchantSessionKey(ctx),merchantKey);assert.equal(reset,1);assert.ok(writes.every(value=>!value.includes('testing-store-code')));
 clearMerchantSession(ctx);const late=context(),pending=deferred();await renderMerchant(late.ctx);late.ctx.api=()=>pending.promise;
 const logging=merchantSubmit(late.ctx,'merchant-login',{get:()=> 'testing-store-code'});location.pathname='/';pending.resolve({sessionKey:otherKey,expiresAt:future(60000)});await logging;assert.equal(getMerchantSessionKey(late.ctx),'');assert.equal(late.ctx.renders,0);
}));

test('merchant login accepts single-character and long codes without HTML or submit length limits',async()=>host(async()=>{
 for(const code of ['7','synthetic-long-code-'.repeat(20)]){
  const {ctx,calls}=context(),html=await renderMerchant(ctx),input=html.match(/<input\b[^>]*name="code"[^>]*>/)?.[0];
  assert.ok(input);assert.match(input,/\brequired\b/);assert.match(input,/type="password"/);assert.doesNotMatch(input,/\b(?:minlength|maxlength)=/);
  await merchantSubmit(ctx,'merchant-login',{get:()=>code});
  assert.deepEqual(calls,[{op:'merchantLogin',data:{code}}]);assert.equal(getMerchantSessionKey(ctx),merchantKey);
  clearMerchantSession(ctx);
 }
}));

test('merchant login still rejects an empty or whitespace-only code before calling the server',async()=>host(async()=>{
 for(const code of ['', '   ']){
  const {ctx,calls}=context();await renderMerchant(ctx);
  await assert.rejects(merchantSubmit(ctx,'merchant-login',{get:()=>code}),/매장 코드를 입력/);
  assert.deepEqual(calls,[]);assert.equal(getMerchantSessionKey(ctx),'');
 }
}));

test('late merchant preview responses do not populate another account or route',async()=>host(async()=>{
 for(const change of [ctx=>setMerchantSession(ctx,{sessionKey:otherKey,expiresAt:future(60000)}),()=>{location.pathname='/';}]){
  location.pathname='/partners/feelingfine';const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;const pending=deferred();ctx.api=async op=>op==='merchantSession'?{}:pending.promise;
  const loading=renderMerchant(ctx);await Promise.resolve();change(ctx);pending.resolve({memberName:'PRIVATE',stampCount:3,expiresAt:future(10000),serverNow:future(0)});assert.equal(await loading,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);
 }
}));

test('authenticated merchant preview and stamp action remain available after thirty seconds without a countdown',async()=>host(async({tick,timers,panel})=>{
 const {ctx,calls}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);assert.equal(timers.size,1);
 assert.doesNotMatch(panel.innerHTML,/data-merchant-countdown|QR 유효시간/);
 await tick(30001);assert.equal(ctx.state.feelingfineMerchant.token,qrToken);assert.equal(ctx.state.feelingfineMerchant.preview.memberName,'테스트 부원');assert.match(panel.innerHTML,/data-action="merchant-stamp"/);
 assert.equal(calls.filter(call=>call.op==='stampCoupon').length,0);
 await merchantAction(ctx,'merchant-stamp');assert.deepEqual(calls.filter(call=>call.op==='stampCoupon'),[{op:'stampCoupon',data:{sessionKey:merchantKey,token:qrToken}}]);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);clearPartnerViews(ctx);
}));

test('a merchant can finish login after thirty seconds and stamp a preview carrying an elapsed display timestamp',async()=>host(async({tick})=>{
 const {ctx,calls}=context(),api=ctx.api;
 ctx.api=async(op,data)=>{if(op==='merchantCouponPreview'){calls.push({op,data});return {memberName:'로그인 뒤 확인한 부원',stampCount:3,capacity:10,expiresAt:future(-60000),serverNow:future(0)};}return api(op,data);};
 location.hash='#qr='+qrToken;assert.match(await renderMerchant(ctx),/data-form="merchant-login"/);await tick(30001);
 await merchantSubmit(ctx,'merchant-login',{get:()=> 'synthetic-store-code'});const html=await renderMerchant(ctx);
 assert.match(html,/로그인 뒤 확인한 부원/);assert.match(html,/data-action="merchant-stamp"/);assert.doesNotMatch(html,/data-merchant-countdown|QR이 만료/);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);
}));

test('hiding the merchant tab or leaving the page still erases preview tokens and private DOM after thirty seconds',async()=>host(async({tick,hidden,pagehide,timers,panel})=>{
 for(const leave of [()=>hidden(true),pagehide]){
  await hidden(false);const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);
  await tick(30001);assert.match(panel.innerHTML,/테스트 부원/);await leave();
  assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);assert.doesNotMatch(panel.innerHTML,/테스트 부원|data-action="merchant-stamp"/);assert.equal(timers.size,0);clearPartnerViews(ctx);
 }
}));

test('a merchant session replaced in another tab clears an open preview and cannot stamp its old token',async()=>host(async({cookies,tick,panel,timers})=>{
 const {ctx,calls}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);
 cookies.set(MERCHANT_SESSION_COOKIE,encodeURIComponent(JSON.stringify({sessionKey:otherKey,expiresAt:future(60000)})));await tick(100);
 assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);assert.doesNotMatch(panel.innerHTML,/테스트 부원|data-action="merchant-stamp"/);assert.equal(timers.size,0);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,0);clearPartnerViews(ctx);
}));

test('successful merchant member names clear when another tab removes the cookie',async()=>host(async({cookies,tick})=>{
 const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;await renderMerchant(ctx);await merchantAction(ctx,'merchant-stamp');mountPartnerViews(ctx);assert.ok(ctx.state.feelingfineMerchant.result.memberName);
 cookies.delete(MERCHANT_SESSION_COOKIE);await tick(100);assert.equal(ctx.state.feelingfineMerchant.result,null);assert.equal(ctx.state.feelingfineMerchant.token,'');clearPartnerViews(ctx);
}));

test('navigation and pagehide cleanup erase existing merchant DOM before removing listeners for BFCache',async()=>host(async({panel,timers})=>{
 const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;await renderMerchant(ctx);await merchantAction(ctx,'merchant-stamp');mountPartnerViews(ctx);
 panel.innerHTML='<h2>PRIVATE MEMBER NAME</h2>';assert.ok(timers.size);clearPartnerViews(ctx);
 assert.doesNotMatch(panel.innerHTML,/PRIVATE/);assert.match(panel.innerHTML,/QR을 다시 스캔/);assert.equal(ctx.state.feelingfineMerchant,undefined);assert.equal(timers.size,0);
}));

test('server merchant revocation clears the cookie and returns to login while an unavailable QR preserves the merchant session',async()=>host(async()=>{
 const {ctx}=context();signIn(ctx);ctx.api=async()=>{throw Object.assign(Error('Revoked'),{code:'unauthenticated'});};assert.match(await renderMerchant(ctx),/data-form="merchant-login"/);assert.equal(getMerchantSessionKey(ctx),'');
 signIn(ctx);location.hash='#qr='+qrToken;ctx.api=async op=>{if(op==='merchantSession')return {};throw Object.assign(Error('더 이상 사용할 수 없는 QR입니다.'),{code:'failed-precondition'});};assert.match(await renderMerchant(ctx),/사용할 수 없는 QR/);assert.equal(getMerchantSessionKey(ctx),merchantKey);
}));

test('logout warns if this browser refuses cookie removal and sends server revocation',async()=>host(async({blockCookies})=>{
 const {ctx,calls}=context();signIn(ctx);await renderMerchant(ctx);blockCookies(true);await merchantAction(ctx,'merchant-logout');
 assert.equal(getMerchantSessionKey(ctx),'');assert.match(ctx.state.feelingfineMerchant.error,/쿠키를 삭제하지 못했습니다.*사이트의 쿠키/);assert.ok(calls.some(call=>call.op==='merchantLogout'));
}));

test('member partner popup keeps earned stamps when the partnership is disabled',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);ctx.api=async()=>({available:false,stampCount:6,capacity:10,expiresAt:future(600000)});const dialog=await openMemberPartner(ctx),html=dialog.querySelector('[data-partner-body]').innerHTML;
 assert.ok(dialog.classList.contains('member-partners-dialog'));assert.equal((html.match(/class="is-stamped"/g)||[]).length,6);assert.match(html,/모은 스탬프는 유지/);assert.doesNotMatch(html,/data-action="partner-qr"/);
},{path:'/members'}));

test('member QR remains visible after ten seconds, disappears after thirty, and is never regenerated or persisted automatically',async()=>host(async({tick,timers,tab,cookies})=>{
 const {ctx,calls}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-qr');let html=dialog.querySelector('[data-partner-body]').innerHTML;
 assert.match(html,/src="data:image\/png;base64,/);assert.match(html,/partner-qr-frame/);assert.match(html,/data-partner-countdown/);assert.doesNotMatch(html,new RegExp(qrToken));
 assert.ok([...tab.values(),...cookies.values()].every(value=>!value.includes(qrToken)));assert.equal(timers.size,1);assert.match(html,/30초/);await tick(10001);
 html=dialog.querySelector('[data-partner-body]').innerHTML;assert.match(html,/src="data:image\/png;base64,/);assert.ok(ctx.state.memberPartner.qr);assert.equal(timers.size,1);await tick(20000);
 html=dialog.querySelector('[data-partner-body]').innerHTML;assert.doesNotMatch(html,/data:image/);assert.match(html,/새 QR 표시/);assert.equal(timers.size,0);assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);
},{path:'/members'}));

test('hiding a member QR or closing its dialog destroys the QR and its timers',async()=>host(async({hidden,timers})=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-qr');await hidden(true);
 assert.doesNotMatch(dialog.querySelector('[data-partner-body]').innerHTML,/data:image/);assert.equal(timers.size,0);await hidden(false);await partnerAction(ctx,'partner-qr');assert.equal(timers.size,1);dialog.close();assert.equal(timers.size,0);assert.equal(ctx.state.memberPartner,undefined);
},{path:'/members'}));

test('a QR issuance that returns after the member dialog closes cannot restore a QR',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx),pending=deferred();ctx.api=()=>pending.promise;
 const issuing=partnerAction(ctx,'partner-qr');dialog.close();pending.resolve({token:qrToken,expiresAt:future(30000),serverNow:future(0)});await issuing;assert.equal(ctx.state.memberPartner,undefined);
},{path:'/members'}));

function adminContext(history=async()=>({items:[],nextCursor:null})){
 const base=context(),{ctx,calls}=base;ctx.state.profile={permissions:['settings']};ctx.state.user={uid:'admin-test'};
 ctx.api=async(op,data)=>{calls.push({op,data});if(op==='couponSettings')return {enabled:true,configured:true,revision:1};if(op==='couponHistory')return history(data);throw Error('Unexpected op '+op);};
 return base;
}
const historyHtml=dialog=>dialog.querySelector('[data-partner-history-body]').innerHTML;
const historyRow=(memberName,stampCount,at='2026-10-05T10:00:00.000Z')=>({memberName,stampCount,at});

test('partner admin replaces merchant-page navigation and repeated explanations with a history action',async()=>host(async()=>{
 const {ctx,calls}=adminContext();const html=await renderPartnerAdmin(ctx);
 assert.match(html,/data-action="partneradmin-history"/);assert.match(html,/적립 기록/);assert.match(html,/data-action="partneradmin-edit"/);
 assert.doesNotMatch(html,/필링파인 스탬프와 사장님 로그인을 설정합니다|부원라운지의 제휴 카드에서|로그인 코드는 저장 후 다시 표시하지 않습니다|사장님 화면 열기|href="\/partners\/feelingfine/);
 assert.deepEqual(calls.map(call=>call.op),['couponSettings']);
},{path:'/admin/partners'}));

test('partner history opens while loading and shows an escaped member name and stamp transaction columns',async()=>host(async({dialogs})=>{
 const pending=deferred(),{ctx,calls}=adminContext(()=>pending.promise);await renderPartnerAdmin(ctx);
 const opening=partnerAdminAction(ctx,'partneradmin-history'),dialog=dialogs.at(-1);
 assert.ok(dialog?.open);assert.doesNotMatch(dialog.innerHTML,/<form/);assert.match(historyHtml(dialog),/불러오|조회 중/);
 pending.resolve({items:[historyRow('<script>member</script>',4)],nextCursor:null});await opening;
 const html=historyHtml(dialog);assert.match(html,/&lt;script&gt;member&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
 for(const heading of ['부원','적립 일시','적립','누적'])assert.ok(html.includes(heading));
 assert.match(html,/\+1/);assert.match(html,/4/);assert.equal(calls.filter(call=>call.op==='couponHistory').length,1);
},{path:'/admin/partners'}));

test('partner history has an empty state that can refresh into new records',async()=>host(async({dialogs})=>{
 let count=0;const {ctx,calls}=adminContext(async()=>++count===1?{items:[],nextCursor:null}:{items:[historyRow('새 부원',1)],nextCursor:null});await renderPartnerAdmin(ctx);
 await partnerAdminAction(ctx,'partneradmin-history');const dialog=dialogs.at(-1);assert.match(historyHtml(dialog),/적립 기록이 없습니다|아직.*적립|적립 내역이 없습니다/);
 await dialog.querySelector('[data-partner-history-refresh]').onclick();assert.match(historyHtml(dialog),/새 부원/);assert.equal(calls.filter(call=>call.op==='couponHistory').length,2);
},{path:'/admin/partners'}));

test('partner history appends older pages in order and refresh replaces the current rows',async()=>host(async({dialogs})=>{
 const replies=[{items:[historyRow('최신 부원',4)],nextCursor:'older-page'},{items:[historyRow('이전 부원',3,'2026-10-04T10:00:00.000Z')],nextCursor:null},{items:[historyRow('새로 적립',5)],nextCursor:null}];
 const {ctx,calls}=adminContext(async()=>replies.shift());await renderPartnerAdmin(ctx);await partnerAdminAction(ctx,'partneradmin-history');const dialog=dialogs.at(-1);
 assert.match(historyHtml(dialog),/data-partner-history-more/);await dialog.querySelector('[data-partner-history-more]').onclick();let html=historyHtml(dialog);
 assert.ok(html.indexOf('최신 부원')>=0&&html.indexOf('이전 부원')>html.indexOf('최신 부원'));assert.doesNotMatch(html,/data-partner-history-more/);
 assert.deepEqual(calls.filter(call=>call.op==='couponHistory').map(call=>call.data.cursor),[undefined,'older-page']);
 await dialog.querySelector('[data-partner-history-refresh]').onclick();html=historyHtml(dialog);assert.match(html,/새로 적립/);assert.doesNotMatch(html,/최신 부원|이전 부원/);
 assert.equal(calls.filter(call=>call.op==='couponHistory').at(-1).data.cursor,undefined);
},{path:'/admin/partners'}));

test('partner history errors allow retry and a failed next page keeps the rows already read',async()=>host(async({dialogs})=>{
 let request=0;const {ctx,calls}=adminContext(async()=>{request++;if(request===1||request===3)throw Error('일시적인 조회 오류');return request===2?{items:[historyRow('기존 부원',2)],nextCursor:'retry-page'}:{items:[historyRow('이전 적립',1)],nextCursor:null};});
 await renderPartnerAdmin(ctx);await partnerAdminAction(ctx,'partneradmin-history');const dialog=dialogs.at(-1);assert.match(historyHtml(dialog),/일시적인 조회 오류|불러오지 못|조회하지 못/);
 await dialog.querySelector('[data-partner-history-refresh]').onclick();assert.match(historyHtml(dialog),/기존 부원/);
 await dialog.querySelector('[data-partner-history-more]').onclick();assert.match(historyHtml(dialog),/기존 부원/);assert.match(historyHtml(dialog),/일시적인 조회 오류|불러오지 못|조회하지 못/);
 await dialog.querySelector('[data-partner-history-more]').onclick();assert.match(historyHtml(dialog),/기존 부원/);assert.match(historyHtml(dialog),/이전 적립/);
 assert.deepEqual(calls.filter(call=>call.op==='couponHistory').slice(-2).map(call=>call.data.cursor),['retry-page','retry-page']);
},{path:'/admin/partners'}));

test('closed, replaced, navigated, or changed-identity history requests never show the late private result',async()=>host(async({dialogs})=>{
 const changes=[async(_ctx,dialog)=>dialog.close(),async ctx=>{await renderPartnerAdmin(ctx);await partnerAdminAction(ctx,'partneradmin-history');},async()=>{location.pathname='/admin';},async ctx=>{ctx.state.user={uid:'other-admin'};},async ctx=>{ctx.state.profile={permissions:['settings']};}];
 for(const change of changes){
  location.pathname='/admin/partners';const pending=deferred();let requests=0;const {ctx}=adminContext(()=>++requests===1?pending.promise:Promise.resolve({items:[],nextCursor:null}));await renderPartnerAdmin(ctx);
  const opening=partnerAdminAction(ctx,'partneradmin-history'),dialog=dialogs.at(-1);await change(ctx,dialog);pending.resolve({items:[historyRow('PRIVATE LATE MEMBER',7)],nextCursor:null});await opening;
  assert.doesNotMatch(historyHtml(dialog),/PRIVATE LATE MEMBER/);assert.doesNotMatch(historyHtml(dialogs.at(-1)),/PRIVATE LATE MEMBER/);
 }
},{path:'/admin/partners'}));

test('permission failures close partner history and authorization is checked before reading any history',async()=>host(async({dialogs})=>{
 const {ctx,calls}=adminContext(async()=>{throw Object.assign(Error('권한이 해제되었습니다'),{code:'functions/permission-denied'});});await renderPartnerAdmin(ctx);
 await partnerAdminAction(ctx,'partneradmin-history');assert.equal(dialogs.at(-1).open,false);assert.equal(ctx.state.partnerAdminView,undefined);
 const denied=adminContext();denied.ctx.state.profile={permissions:['members']};assert.match(await renderPartnerAdmin(denied.ctx),/권한/);
 await partnerAdminAction(denied.ctx,'partneradmin-history').catch(()=>{});assert.deepEqual(denied.calls,[]);
 assert.equal(calls.filter(call=>call.op==='couponHistory').length,1);
},{path:'/admin/partners'}));
