import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { getMerchantSessionKey,setMerchantSession,clearMerchantSession,merchantCookieUnavailable,MERCHANT_SESSION_COOKIE } from '../web/src/merchant-session.js';
import { setMemberSession } from '../web/src/member-session.js';
const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
let openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime;
try{({openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime}=await import('../web/src/partner-stamps.js'));}finally{hook.deregister();}
const merchantKey='a'.repeat(64),memberKey='b'.repeat(64),qrToken='c'.repeat(64),otherKey='d'.repeat(64);
const future=offset=>new Date(Date.now()+offset).toISOString();
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
function context(){const calls=[],toasts=[],ctx={state:{},renders:0,render:async()=>{ctx.renders++;},toast:message=>toasts.push(message),api:async(op,data)=>{calls.push({op,data});if(op==='merchantSession')return {expiresAt:future(86400000),partnerName:'필링파인'};if(op==='merchantCouponPreview')return {memberName:'테스트 부원',stampCount:3,capacity:10,expiresAt:future(10000),serverNow:future(0)};if(op==='stampCoupon')return {stampCount:4,capacity:10};if(op==='merchantLogout')return {ok:true};if(op==='merchantLogin')return {sessionKey:merchantKey,expiresAt:future(365*86400000)};if(op==='memberCoupons')return {available:true,stampCount:3,capacity:10,revision:1,expiresAt:future(600000)};if(op==='issueCouponQr')return {token:qrToken,expiresAt:future(10000),serverNow:future(0)};throw Error('Unexpected op '+op);}};return {ctx,calls,toasts};}
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
 try{return await run({cookies,writes,dialogs,timers,tab,panel,blockCookies:value=>{rejectCookies=value;},tick:async ms=>{now+=ms;for(const fn of [...timers.values()])fn();await Promise.resolve();},hidden:async value=>{document.hidden=value;for(const fn of [...docListeners.get('visibilitychange')||[]])fn();await Promise.resolve();},focus:()=>{for(const fn of [...winListeners.get('focus')||[]])fn();}});}
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

test('QR lifetime subtracts request latency, caps at ten seconds, and fails closed on malformed times',()=>{
 const response={expiresAt:'2026-10-05T01:00:10.000Z',serverNow:'2026-10-05T01:00:00.000Z'};
 assert.equal(qrLifetime(response,1000,3000),8000);assert.equal(qrLifetime(response,1000,12000),0);
 assert.equal(qrLifetime({...response,expiresAt:'2026-10-05T01:00:30.000Z'},1000,3000),8000);assert.equal(qrLifetime({},1000,1000),0);
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

test('late merchant preview responses do not populate another account or route',async()=>host(async()=>{
 for(const change of [ctx=>setMerchantSession(ctx,{sessionKey:otherKey,expiresAt:future(60000)}),()=>{location.pathname='/';}]){
  location.pathname='/partners/feelingfine';const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;const pending=deferred();ctx.api=async op=>op==='merchantSession'?{}:pending.promise;
  const loading=renderMerchant(ctx);await Promise.resolve();change(ctx);pending.resolve({memberName:'PRIVATE',stampCount:3,expiresAt:future(10000),serverNow:future(0)});assert.equal(await loading,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);
 }
}));

test('merchant expiry and tab hiding discard preview tokens and stop local timers',async()=>host(async({tick,hidden,timers})=>{
 const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;await renderMerchant(ctx);mountPartnerViews(ctx);assert.equal(timers.size,1);
 await tick(10001);assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);assert.equal(timers.size,0);
 location.hash='#qr='+qrToken;await renderMerchant(ctx);mountPartnerViews(ctx);await hidden(true);assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(timers.size,0);clearPartnerViews(ctx);
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

test('server merchant revocation clears the cookie and returns to login while QR expiry preserves the merchant session',async()=>host(async()=>{
 const {ctx}=context();signIn(ctx);ctx.api=async()=>{throw Object.assign(Error('Revoked'),{code:'unauthenticated'});};assert.match(await renderMerchant(ctx),/data-form="merchant-login"/);assert.equal(getMerchantSessionKey(ctx),'');
 signIn(ctx);location.hash='#qr='+qrToken;ctx.api=async op=>{if(op==='merchantSession')return {};throw Object.assign(Error('QR이 만료되었습니다.'),{code:'failed-precondition'});};assert.match(await renderMerchant(ctx),/QR이 만료/);assert.equal(getMerchantSessionKey(ctx),merchantKey);
}));

test('logout warns if this browser refuses cookie removal and sends server revocation',async()=>host(async({blockCookies})=>{
 const {ctx,calls}=context();signIn(ctx);await renderMerchant(ctx);blockCookies(true);await merchantAction(ctx,'merchant-logout');
 assert.equal(getMerchantSessionKey(ctx),'');assert.match(ctx.state.feelingfineMerchant.error,/쿠키를 삭제하지 못했습니다.*사이트의 쿠키/);assert.ok(calls.some(call=>call.op==='merchantLogout'));
}));

test('member partner popup keeps earned stamps when the partnership is disabled',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);ctx.api=async()=>({available:false,stampCount:6,capacity:10,expiresAt:future(600000)});const dialog=await openMemberPartner(ctx),html=dialog.querySelector('[data-partner-body]').innerHTML;
 assert.ok(dialog.classList.contains('member-partners-dialog'));assert.equal((html.match(/class="is-stamped"/g)||[]).length,6);assert.match(html,/모은 스탬프는 유지/);assert.doesNotMatch(html,/data-action="partner-qr"/);
},{path:'/members'}));

test('member QR is generated locally, removed at expiry, and never automatically regenerated or persisted',async()=>host(async({tick,timers,tab,cookies})=>{
 const {ctx,calls}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-qr');let html=dialog.querySelector('[data-partner-body]').innerHTML;
 assert.match(html,/src="data:image\/png;base64,/);assert.match(html,/partner-qr-frame/);assert.match(html,/data-partner-countdown/);assert.doesNotMatch(html,new RegExp(qrToken));
 assert.ok([...tab.values(),...cookies.values()].every(value=>!value.includes(qrToken)));assert.equal(timers.size,1);await tick(10001);
 html=dialog.querySelector('[data-partner-body]').innerHTML;assert.doesNotMatch(html,/data:image/);assert.match(html,/새 QR 표시/);assert.equal(timers.size,0);assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);
},{path:'/members'}));

test('hiding a member QR or closing its dialog destroys the QR and its timers',async()=>host(async({hidden,timers})=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-qr');await hidden(true);
 assert.doesNotMatch(dialog.querySelector('[data-partner-body]').innerHTML,/data:image/);assert.equal(timers.size,0);await hidden(false);await partnerAction(ctx,'partner-qr');assert.equal(timers.size,1);dialog.close();assert.equal(timers.size,0);assert.equal(ctx.state.memberPartner,undefined);
},{path:'/members'}));

test('a QR issuance that returns after the member dialog closes cannot restore a QR',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx),pending=deferred();ctx.api=()=>pending.promise;
 const issuing=partnerAction(ctx,'partner-qr');dialog.close();pending.resolve({token:qrToken,expiresAt:future(10000),serverNow:future(0)});await issuing;assert.equal(ctx.state.memberPartner,undefined);
},{path:'/members'}));
