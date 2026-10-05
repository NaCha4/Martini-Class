import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { getMerchantSessionKey,setMerchantSession,clearMerchantSession,merchantCookieUnavailable,MERCHANT_SESSION_COOKIE } from '../web/src/merchant-session.js';
import { setMemberSession,getMemberSessionKey } from '../web/src/member-session.js';
import { renderPartnerAdmin,partnerAdminAction } from '../web/src/partner-admin.js';
const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
let openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime;
try{({openMemberPartner,partnerAction,renderMerchant,merchantSubmit,merchantAction,mountPartnerViews,clearPartnerViews,qrLifetime}=await import('../web/src/partner-stamps.js'));}finally{hook.deregister();}
const merchantKey='a'.repeat(64),memberKey='b'.repeat(64),qrToken='c'.repeat(64),otherKey='d'.repeat(64);
const future=offset=>new Date(Date.now()+offset).toISOString();
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function context(){const calls=[],toasts=[],ctx={state:{},renders:0,render:async()=>{ctx.renders++;},toast:message=>toasts.push(message),api:async(op,data)=>{calls.push({op,data});if(op==='merchantSession')return {expiresAt:future(86400000),partnerName:'필링파인'};if(op==='merchantCouponPreview')return {memberName:'테스트 부원',stampCount:3,capacity:10,expiresAt:future(30000),serverNow:future(0)};if(op==='stampCoupon')return {stampCount:3+(data.amount||1),amount:data.amount||1,capacity:10};if(op==='merchantCouponHistory')return {items:[],nextCursor:null};if(op==='adjustMerchantCoupon')return {stampCount:data.stampCount,revision:data.expectedRevision+1,memberName:'테스트 부원'};if(op==='merchantLogout')return {ok:true};if(op==='merchantLogin')return {sessionKey:merchantKey,expiresAt:future(365*86400000)};if(op==='memberCoupons')return {available:true,stampCount:3,capacity:10,revision:1,expiresAt:future(600000)};if(op==='issueCouponQr')return {token:qrToken,expiresAt:future(30000),serverNow:future(0)};throw Error('Unexpected op '+op);}};return {ctx,calls,toasts};}
async function host(run,{path='/partners/feelingfine',blocked=false,motion=false}={}){
 const keys=['document','window','location','history','sessionStorage','performance','setInterval','clearInterval','CSS'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const cookies=new Map(),writes=[],dialogs=[],timers=new Map(),tab=new Map(),docListeners=new Map(),winListeners=new Map();let now=1000,timerId=0,rejectCookies=blocked;
 const listen=(map,type,fn)=>{if(!map.has(type))map.set(type,new Set());map.get(type).add(fn);},unlisten=(map,type,fn)=>map.get(type)?.delete(fn);
 class Element{
  constructor(tag='div'){this.tag=tag;this.innerHTML='';this.textContent='';const styles=new Map();this.style={setProperty:(n,v)=>styles.set(n,v),getPropertyValue:n=>styles.get(n)||''};this.attrs=new Map();this.listeners=new Map();this.parts=new Map();this.dataset={};this.isConnected=true;const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  set innerHTML(value){this.html=value;this.parts?.clear();}get innerHTML(){return this.html;}
  setAttribute(n,v){this.attrs.set(n,String(v));}getAttribute(n){return this.attrs.get(n)||null;}removeAttribute(n){this.attrs.delete(n);}addEventListener(n,fn){listen(this.listeners,n,fn);}removeEventListener(n,fn){unlisten(this.listeners,n,fn);}focus(){document.activeElement=this;}matches(){return false;}getClientRects(){return [1];}getBoundingClientRect(){return {width:320,height:200};}closest(selector){return this.selector===selector?this:this.parent?.closest(selector)||null;}remove(){this.isConnected=false;}showModal(){this.open=true;this.modalMode=true;}show(){this.open=true;this.modalMode=false;}close(){if(!this.open)return;this.open=false;for(const fn of this.listeners.get('close')||[])fn();}
  querySelector(selector){
   if(selector==='form'||selector==='form[aria-busy=true]'||selector==='#discard-changes')return null;
   if(this.tag==='dialog'&&['.dialog-actions','.dialog-status'].includes(selector)&&!this.innerHTML.includes('class="'+selector.slice(1)+'"'))return null;
   const couponParts=['[data-coupon-interactive]','[data-partner-qr-face]','.partner-card-back','.partner-qr-slot','[data-partner-countdown]','[data-partner-qr-error]'];
   if(this.tag==='dialog'&&couponParts.includes(selector))return this.querySelector('[data-partner-body]').querySelector(selector);
   if(selector==='[data-partner-countdown]'&&this.selector!=='.partner-qr-slot')return this.querySelector('.partner-qr-slot')?.querySelector(selector)||null;
   if(this.selector==='[data-partner-body]'&&['.partner-card-back','[data-partner-qr-face]'].includes(selector))return this.querySelector('[data-coupon-interactive]')?.querySelector(selector)||null;
   if(this.selector==='[data-coupon-interactive]'&&selector==='[data-partner-qr-face]')return this.querySelector('.partner-card-back').querySelector(selector);
   if(selector==='[data-coupon-interactive]'&&!this.innerHTML.includes('data-coupon-interactive'))return null;
   if(selector==='[data-partner-countdown]'&&!this.innerHTML.includes('data-partner-countdown'))return null;
   if(!this.parts.has(selector)){
    const part=new Element();part.parent=this;part.selector=selector;part.ownerDocument=document;
    if(selector==='[data-coupon-interactive]')part.innerHTML=this.innerHTML.match(/<figure\b[\s\S]*?<\/figure>/)?.[0]||'';
    if(selector==='[data-partner-qr-face]')part.hidden=true;
    this.parts.set(selector,part);
   }
   return this.parts.get(selector);
  }
  querySelectorAll(selector){if(!motion||selector!=='[data-coupon-interactive]')return [];const stage=this.querySelector(selector);return stage?[stage]:[];}scrollIntoView(options){this.scrolled=options;}
 }
 const panel=new Element();
 const document={hidden:false,activeElement:null,body:new Element('body'),documentElement:new Element('html'),createElement:tag=>new Element(tag),querySelector(selector){if(selector==='.merchant-panel'||selector==='.merchant-page')return panel;if(['#modal','#modal[open]','dialog[open]'].includes(selector))return dialogs.findLast(dialog=>dialog.isConnected&&(selector==='#modal'||dialog.open))||null;return null;},querySelectorAll:()=>[],addEventListener:(n,fn)=>listen(docListeners,n,fn),removeEventListener:(n,fn)=>unlisten(docListeners,n,fn)};
 document.body.append=dialog=>dialogs.push(dialog);document.activeElement=document.body;
 Object.defineProperty(document,'cookie',{get:()=>[...cookies].map(([key,value])=>key+'='+value).join('; '),set:raw=>{writes.push(raw);if(rejectCookies)return;const [pair]=raw.split(';'),split=pair.indexOf('='),name=pair.slice(0,split),value=pair.slice(split+1);if(raw.includes('Max-Age=0'))cookies.delete(name);else cookies.set(name,value);}});
 const location={pathname:path,search:'',hash:'',protocol:'https:',hostname:'martini.test',origin:'https://martini.test'};
 const values={document,window:{addEventListener:(n,fn)=>listen(winListeners,n,fn),removeEventListener:(n,fn)=>unlisten(winListeners,n,fn)},location,history:{state:{},replaceState(_s,_t,url){location.hash='';this.last=url;}},sessionStorage:{getItem:key=>tab.get(key)||null,setItem:(key,value)=>tab.set(key,value),removeItem:key=>tab.delete(key),get length(){return tab.size;},key:index=>[...tab.keys()][index]},performance:{now:()=>now},setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),CSS:{supports:()=>true}};
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 try{return await run({cookies,writes,dialogs,timers,tab,panel,windowListenerCount:type=>winListeners.get(type)?.size||0,blockCookies:value=>{rejectCookies=value;},tick:async ms=>{now+=ms;for(const fn of [...timers.values()])fn();await Promise.resolve();},hidden:async value=>{document.hidden=value;for(const fn of [...docListeners.get('visibilitychange')||[]])fn();await Promise.resolve();},pagehide:async()=>{for(const fn of [...winListeners.get('pagehide')||[]])fn();await Promise.resolve();},focus:()=>{for(const fn of [...winListeners.get('focus')||[]])fn();}});}
 finally{for(const dialog of dialogs)dialog.close();for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
function signIn(ctx){setMerchantSession(ctx,{sessionKey:merchantKey,expiresAt:future(365*86400000)});}
function memberSignIn(ctx){setMemberSession(ctx,{sessionKey:memberKey,expiresAt:future(600000),member:{name:'테스트 부원',semester:'2026-2'}});}
async function openRevealedPartner(ctx){const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-reveal');return dialog;}
async function withRandom(values,run){
 const previous=Math.random;let index=0;Math.random=()=>values[index++%values.length];
 try{return await run();}finally{Math.random=previous;}
}
const stampGroups=html=>[...html.matchAll(/<g\b[^>]*class="is-stamped"[^>]*>[\s\S]*?<\/g>/g)].map(match=>match[0]);
const stampAngles=html=>stampGroups(html).map(group=>Number(group.match(/\brotate\(([-\d.]+)\)/)?.[1]));
const dispatch=(element,type,details={})=>{const event={target:element,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...details};for(const listener of [...element.listeners.get(type)||[]])listener(event);return event;};
const flushEvents=()=>new Promise(resolve=>setImmediate(resolve));
const waitForQrIssue=async view=>{for(let step=0;view.issuing&&step<100;step++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(view.issuing,false,'QR encoding should finish before checking the callback result');};
const merchantReceipt=(id='receipt-one',overrides={})=>({id,memberName:'테스트 부원',at:'2026-10-05T04:05:00.000Z',amount:2,stampCount:5,currentStampCount:5,revision:8,adjustable:true,...overrides});

test('merchant chooses a quantity, confirms once, and returns to the credited member history',async()=>host(async({panel})=>{
 const {ctx,calls}=context(),api=ctx.api;let historyReads=0;
 ctx.api=async(op,data)=>{if(op==='merchantCouponHistory'){historyReads++;calls.push({op,data});return {items:[merchantReceipt()],nextCursor:null};}return api(op,data);};
 ctx.render=async()=>{ctx.renders++;panel.innerHTML=await renderMerchant(ctx);};
 signIn(ctx);location.hash='#qr='+qrToken;const preview=await renderMerchant(ctx);
 assert.match(preview,/data-form="merchant-stamp"/);assert.match(preview,/name="amount"[^>]*min="1"[^>]*max="7"[^>]*type="number" value="1"/);
 assert.equal(historyReads,0);assert.equal(calls.filter(call=>call.op==='stampCoupon').length,0);
 await merchantSubmit(ctx,'merchant-stamp',new Map([['amount','3']]));
 assert.deepEqual(calls.find(call=>call.op==='stampCoupon').data,{sessionKey:merchantKey,token:qrToken,amount:3});
 assert.match(panel.innerHTML,/스탬프 3개를 적립했습니다/);assert.match(panel.innerHTML,/data-action="merchant-main"/);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,6);
 await merchantSubmit(ctx,'merchant-stamp',new Map([['amount','3']]));assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);
 await merchantAction(ctx,'merchant-main');assert.equal(historyReads,1);assert.match(panel.innerHTML,/적립 내역/);assert.match(panel.innerHTML,/테스트 부원/);assert.match(panel.innerHTML,/2026\. 10\. 5\. 13:05/);assert.match(panel.innerHTML,/\+2개 적립/);assert.doesNotMatch(panel.innerHTML,/merchant-stamp-form|merchant-result/);
}));

test('merchant quantities reject empty, fractional, negative, and over-capacity values without a write',async()=>host(async()=>{
 const {ctx,calls}=context();signIn(ctx);location.hash='#qr='+qrToken;await renderMerchant(ctx);
 for(const amount of ['', '0', '-1', '1.5', '8', 'not-a-number'])await assert.rejects(merchantSubmit(ctx,'merchant-stamp',new Map([['amount',amount]])),/1~7.*정수/);
 assert.equal(calls.filter(call=>call.op==='stampCoupon').length,0);
 await merchantSubmit(ctx,'merchant-stamp',new Map([['amount','7']]));assert.equal(calls.find(call=>call.op==='stampCoupon').data.amount,7);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,10);
}));

test('merchant history escapes member names and separates earned amounts from current balances',async()=>host(async()=>{
 const {ctx}=context(),api=ctx.api;ctx.api=async(op,data)=>op==='merchantCouponHistory'?{items:[merchantReceipt('receipt-one',{memberName:'<img src=x>',stampCount:2,currentStampCount:8}),merchantReceipt('deleted',{memberName:'삭제된 부원',currentStampCount:null,revision:null,adjustable:false})],nextCursor:null}:api(op,data);
 signIn(ctx);const html=await renderMerchant(ctx);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>|NaN|Invalid Date/);assert.match(html,/현재 <strong>8개/);assert.match(html,/\+2개 적립/);assert.match(html,/현재 <strong>확인 불가/);assert.match(html,/data-id="receipt-one"/);assert.doesNotMatch(html,/data-id="deleted"/);assert.doesNotMatch(html,new RegExp(merchantKey));
}));

test('merchant corrections use the opening revision, allow zero, and reload every member balance',async()=>host(async({panel})=>{
 const {ctx,calls}=context(),api=ctx.api;let balance=5,revision=8;
 ctx.api=async(op,data)=>{
  if(op==='merchantCouponHistory'){calls.push({op,data});return {items:[merchantReceipt('receipt-one',{currentStampCount:balance,revision}),merchantReceipt('receipt-two',{amount:1,currentStampCount:balance,revision})],nextCursor:null};}
  if(op==='adjustMerchantCoupon'){calls.push({op,data});balance=data.stampCount;revision++;return {stampCount:balance,revision,memberName:'테스트 부원'};}return api(op,data);
 };
 ctx.render=async()=>{ctx.renders++;panel.innerHTML=await renderMerchant(ctx);};signIn(ctx);await ctx.render();await merchantAction(ctx,'merchant-edit','receipt-one');
 assert.match(panel.innerHTML,/data-form="merchant-adjust"/);assert.match(panel.innerHTML,/name="stampCount"[^>]*min="0"[^>]*max="10"/);
 for(const stampCount of ['', '-1', '11', '.5'])await assert.rejects(merchantSubmit(ctx,'merchant-adjust',new Map([['stampCount',stampCount]])),/0~10.*정수/);
 await merchantSubmit(ctx,'merchant-adjust',new Map([['stampCount','0']]));
 assert.deepEqual(calls.find(call=>call.op==='adjustMerchantCoupon').data,{sessionKey:merchantKey,receiptId:'receipt-one',stampCount:0,expectedRevision:8});
 assert.equal(calls.filter(call=>call.op==='merchantCouponHistory').length,2);assert.deepEqual(ctx.state.feelingfineMerchant.history.map(row=>row.currentStampCount),[0,0]);assert.deepEqual(ctx.state.feelingfineMerchant.history.map(row=>row.amount),[2,1]);assert.match(panel.innerHTML,/스탬프를 0개로 수정했습니다/);assert.doesNotMatch(panel.innerHTML,/data-form="merchant-adjust"/);
}));

test('merchant cannot open unavailable corrections and cancelling does not write',async()=>host(async()=>{
 const {ctx,calls}=context(),api=ctx.api;ctx.api=async(op,data)=>op==='merchantCouponHistory'?{items:[merchantReceipt(),merchantReceipt('deleted',{adjustable:false,currentStampCount:null,revision:null})],nextCursor:null}:api(op,data);signIn(ctx);await renderMerchant(ctx);
 for(const id of ['deleted','missing']){await merchantAction(ctx,'merchant-edit',id);assert.equal(ctx.state.feelingfineMerchant.edit,null);}
 await merchantAction(ctx,'merchant-edit','receipt-one');assert.ok(ctx.state.feelingfineMerchant.edit);await merchantAction(ctx,'merchant-edit-cancel');assert.equal(ctx.state.feelingfineMerchant.edit,null);
 await merchantSubmit(ctx,'merchant-adjust',new Map([['stampCount','0']]));assert.equal(calls.filter(call=>call.op==='adjustMerchantCoupon').length,0);
}));

test('a stale correction reloads current balances and requires reopening the edit',async()=>host(async({panel})=>{
 const {ctx}=context(),api=ctx.api;let reads=0;
 ctx.api=async(op,data)=>{
  if(op==='merchantCouponHistory')return {items:[merchantReceipt('receipt-one',{currentStampCount:++reads===1?5:7,revision:reads===1?8:9})],nextCursor:null};
  if(op==='adjustMerchantCoupon')throw Object.assign(Error('스탬프가 변경되었습니다. 다시 확인해 주세요.'),{code:'aborted'});return api(op,data);
 };
 ctx.render=async()=>{ctx.renders++;panel.innerHTML=await renderMerchant(ctx);};signIn(ctx);await ctx.render();await merchantAction(ctx,'merchant-edit','receipt-one');await merchantSubmit(ctx,'merchant-adjust',new Map([['stampCount','4']]));
 assert.equal(reads,2);assert.equal(ctx.state.feelingfineMerchant.edit,null);assert.match(panel.innerHTML,/현재 <strong>7개/);assert.match(panel.innerHTML,/스탬프가 변경되었습니다/);await merchantAction(ctx,'merchant-edit','receipt-one');assert.equal(ctx.state.feelingfineMerchant.edit.revision,9);
}));

test('merchant history pagination preserves existing rows after failure and avoids duplicate receipts',async()=>host(async()=>{
 const {ctx,calls}=context(),api=ctx.api;let reads=0;
 ctx.api=async(op,data)=>{if(op==='merchantCouponHistory'){calls.push({op,data});reads++;if(reads===2)throw Error('연결 오류');return reads===1?{items:[merchantReceipt()],nextCursor:'older'}:{items:[merchantReceipt(),merchantReceipt('receipt-two')],nextCursor:null};}return api(op,data);};
 signIn(ctx);await renderMerchant(ctx);await merchantAction(ctx,'merchant-history-more');assert.equal(ctx.state.feelingfineMerchant.history.length,1);assert.equal(ctx.state.feelingfineMerchant.nextCursor,'older');assert.match(ctx.state.feelingfineMerchant.error,/연결 오류/);
 await merchantAction(ctx,'merchant-history-more');assert.deepEqual(ctx.state.feelingfineMerchant.history.map(row=>row.id),['receipt-one','receipt-two']);assert.equal(ctx.state.feelingfineMerchant.nextCursor,null);assert.deepEqual(calls.filter(call=>call.op==='merchantCouponHistory').map(call=>call.data.cursor),[undefined,'older','older']);
}));

test('late merchant history responses are discarded after navigation, account replacement, or hiding',async()=>host(async({hidden})=>{
 for(const change of [()=>{location.pathname='/';},ctx=>setMerchantSession(ctx,{sessionKey:otherKey,expiresAt:future(60000)}),()=>hidden(true)]){
  await hidden(false);location.pathname='/partners/feelingfine';const {ctx}=context(),api=ctx.api,pending=deferred();ctx.api=async(op,data)=>op==='merchantCouponHistory'?pending.promise:api(op,data);signIn(ctx);
  const rendering=renderMerchant(ctx);await Promise.resolve();await change(ctx);pending.resolve({items:[merchantReceipt('private',{memberName:'PRIVATE MEMBER'})],nextCursor:null});assert.equal(await rendering,'');assert.equal(ctx.state.feelingfineMerchant.history,null);clearPartnerViews(ctx);
 }
}));

test('hiding or replacing a merchant session removes history, open edits, and private DOM',async()=>host(async({hidden,cookies,tick,panel})=>{
 for(const change of [()=>hidden(true),async()=>{cookies.delete(MERCHANT_SESSION_COOKIE);await tick(100);}]){
  await hidden(false);const {ctx}=context(),api=ctx.api;ctx.api=async(op,data)=>op==='merchantCouponHistory'?{items:[merchantReceipt('private',{memberName:'PRIVATE MEMBER'})],nextCursor:null}:api(op,data);signIn(ctx);panel.innerHTML=await renderMerchant(ctx);await merchantAction(ctx,'merchant-edit','private');mountPartnerViews(ctx);assert.match(panel.innerHTML,/PRIVATE MEMBER/);
  await change();assert.equal(ctx.state.feelingfineMerchant.history,null);assert.equal(ctx.state.feelingfineMerchant.edit,null);assert.doesNotMatch(panel.innerHTML,/PRIVATE MEMBER/);clearPartnerViews(ctx);
 }
}));

test('a correction response arriving after the page hides cannot restore names or edit state',async()=>host(async({hidden,panel})=>{
 const {ctx}=context(),api=ctx.api,pending=deferred();ctx.api=async(op,data)=>op==='merchantCouponHistory'?{items:[merchantReceipt()],nextCursor:null}:op==='adjustMerchantCoupon'?pending.promise:api(op,data);signIn(ctx);panel.innerHTML=await renderMerchant(ctx);await merchantAction(ctx,'merchant-edit','receipt-one');mountPartnerViews(ctx);
 const saving=merchantSubmit(ctx,'merchant-adjust',new Map([['stampCount','2']]));await hidden(true);pending.resolve({memberName:'PRIVATE LATE MEMBER',stampCount:2,revision:9});await saving;
 assert.equal(ctx.state.feelingfineMerchant.history,null);assert.equal(ctx.state.feelingfineMerchant.edit,null);assert.equal(ctx.state.feelingfineMerchant.notice,'');assert.doesNotMatch(panel.innerHTML,/PRIVATE LATE MEMBER/);clearPartnerViews(ctx);
}));

test('opening partner information exposes only a paper-back button and defers stamps and QR until reveal',async()=>host(async()=>{
 const {ctx,calls}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);
 assert.match(dialog.innerHTML,/class="partner-benefits-copy"/);assert.match(dialog.innerHTML,/<button\b[^>]*class="partner-coupon-peek"[^>]*data-coupon-reveal[^>]*aria-label="내 스탬프 쿠폰 열기"/);
 assert.match(dialog.innerHTML,/src="\/assets\/FeelingFineCouponBack\.png\?v=[a-f0-9]+"/);
 assert.doesNotMatch(dialog.innerHTML,/FeelingFineCoupon\.png|data-coupon-interactive|class="partner-stamps"|data-action="partner-qr"|data:image|partner-stamp-reveal|data-action="partner-reveal"/);
 assert.equal(ctx.state.memberPartner.revealed,false);assert.deepEqual(calls,[]);
 await partnerAction(ctx,'partner-qr');await partnerAction(ctx,'partner-refresh');assert.deepEqual(calls,[]);assert.equal(ctx.state.memberPartner.revealed,false);
 await partnerAction(ctx,'partner-reveal');assert.deepEqual(calls.map(call=>call.op),['memberCoupons']);assert.equal(ctx.state.memberPartner.revealed,true);
 assert.equal(dialog.classList.contains('is-coupon-revealed'),true);assert.equal(dialog.querySelector('.partner-benefits-copy').getAttribute('aria-hidden'),'true');assert.equal(dialog.querySelector('.partner-intro-copy').getAttribute('aria-hidden'),'true');
 assert.match(dialog.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon|data-coupon-interactive/);assert.match(dialog.querySelector('[data-partner-body]').innerHTML,/data-action="partner-qr"/);assert.equal(ctx.state.memberPartner.qr,null);
},{path:'/members'}));

test('simultaneous reveal taps share one stamp read and do not issue a QR automatically',async()=>host(async()=>{
 const {ctx,calls}=context(),api=ctx.api,pending=deferred();ctx.api=async(op,data)=>{if(op==='memberCoupons'){calls.push({op,data});return pending.promise;}return api(op,data);};
 memberSignIn(ctx);const dialog=await openMemberPartner(ctx),first=partnerAction(ctx,'partner-reveal'),second=partnerAction(ctx,'partner-reveal');
 assert.deepEqual(calls.map(call=>call.op),['memberCoupons']);assert.equal(ctx.state.memberPartner.revealed,true);assert.doesNotMatch(dialog.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon|data-action="partner-qr"/);
 pending.resolve({available:true,stampCount:4,capacity:10,expiresAt:future(600000)});await Promise.all([first,second]);await partnerAction(ctx,'partner-reveal');
 assert.equal(calls.filter(call=>call.op==='memberCoupons').length,1);assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,0);assert.equal(stampGroups(dialog.querySelector('[data-partner-body]').innerHTML).length,4);
 await partnerAction(ctx,'partner-qr');assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);
},{path:'/members'}));

test('reopening partner information hides the previous coupon and requires a new reveal',async()=>host(async()=>{
 const {ctx,calls}=context();memberSignIn(ctx);const first=await openRevealedPartner(ctx);assert.equal(calls.filter(call=>call.op==='memberCoupons').length,1);await first.requestClose(true);
 const reopened=await openMemberPartner(ctx);assert.equal(ctx.state.memberPartner.revealed,false);assert.equal(ctx.state.memberPartner.coupons,null);assert.match(reopened.innerHTML,/data-coupon-reveal/);assert.doesNotMatch(reopened.innerHTML,/FeelingFineCoupon\.png|data-coupon-interactive|data-action="partner-qr"/);assert.equal(calls.filter(call=>call.op==='memberCoupons').length,1);
 await partnerAction(ctx,'partner-reveal');assert.equal(calls.filter(call=>call.op==='memberCoupons').length,2);assert.match(reopened.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon/);
},{path:'/members'}));

test('a late stamp read cannot populate a closed or replacement partner dialog',async()=>host(async()=>{
 for(const replace of [false,true]){
  const {ctx,calls}=context(),pending=deferred();ctx.api=async(op,data)=>{calls.push({op,data});assert.equal(op,'memberCoupons');return pending.promise;};memberSignIn(ctx);
  const old=await openMemberPartner(ctx),oldView=ctx.state.memberPartner,reading=partnerAction(ctx,'partner-reveal');await old.requestClose(true);const replacement=replace?await openMemberPartner(ctx):null;
  pending.resolve({available:true,stampCount:9,capacity:10,expiresAt:future(600000)});await reading;assert.equal(oldView.coupons,null);assert.doesNotMatch(old.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon|data-action="partner-qr"/);
  if(replacement){assert.equal(ctx.state.memberPartner.coupons,null);assert.equal(ctx.state.memberPartner.revealed,false);assert.doesNotMatch(replacement.innerHTML,/FeelingFineCoupon\.png|data-coupon-interactive|data-action="partner-qr"/);await replacement.requestClose(true);}else assert.equal(ctx.state.memberPartner,undefined);
  assert.equal(calls.length,1);
 }
},{path:'/members'}));

test('a delayed reveal preserves focus when the member tabs to the close control',async()=>host(async()=>{
 const {ctx}=context(),api=ctx.api,pending=deferred();ctx.api=async(op,data)=>op==='memberCoupons'?pending.promise:api(op,data);memberSignIn(ctx);
 const dialog=await openMemberPartner(ctx),reading=partnerAction(ctx,'partner-reveal'),close=dialog.querySelector('[data-close]');close.focus();
 pending.resolve({available:true,stampCount:3,capacity:10,expiresAt:future(600000)});await reading;
 assert.equal(document.activeElement,close);assert.equal(dialog.querySelector('[data-coupon-interactive]').scrolled,undefined);assert.equal(stampGroups(dialog.querySelector('[data-partner-body]').innerHTML).length,3);
},{path:'/members'}));

test('a rejected member session while revealing closes the dialog and returns to login',async()=>host(async()=>{
 const {ctx,calls}=context();memberSignIn(ctx);ctx.api=async(op,data)=>{calls.push({op,data});throw Object.assign(Error('로그인이 만료되었습니다.'),{code:'functions/unauthenticated'});};
 const dialog=await openMemberPartner(ctx);assert.equal(calls.length,0);await partnerAction(ctx,'partner-reveal');assert.equal(dialog.open,false);assert.equal(ctx.state.memberPartner,undefined);assert.equal(getMemberSessionKey(ctx),'');assert.equal(ctx.renders,1);assert.deepEqual(calls.map(call=>call.op),['memberCoupons']);
},{path:'/members'}));

test('a transient reveal failure offers a deliberate retry without showing cached stamps',async()=>host(async()=>{
 const {ctx,calls}=context(),api=ctx.api;let failed=false;ctx.api=async(op,data)=>{if(op==='memberCoupons'&&!failed){failed=true;calls.push({op,data});throw Error('일시적인 조회 오류');}return api(op,data);};
 memberSignIn(ctx);const dialog=await openMemberPartner(ctx);await partnerAction(ctx,'partner-reveal');assert.match(dialog.querySelector('[data-partner-body]').innerHTML,/일시적인 조회 오류/);assert.doesNotMatch(dialog.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon|data-action="partner-qr"/);
 await partnerAction(ctx,'partner-refresh');assert.equal(calls.filter(call=>call.op==='memberCoupons').length,2);assert.match(dialog.querySelector('[data-partner-body]').innerHTML,/FeelingFineCoupon/);assert.equal(getMemberSessionKey(ctx),memberKey);
},{path:'/members'}));

test('earned stamps use the supplied image with individually randomized angles within eighteen degrees',async()=>host(async()=>withRandom([0,.5,.999999],async()=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),html=dialog.querySelector('[data-partner-body]').innerHTML,marks=stampGroups(html),angles=stampAngles(html);
 assert.equal(marks.length,3);
 for(const mark of marks){assert.equal((mark.match(/<image\b/g)||[]).length,1);assert.match(mark,/\bhref="\/assets\/stamp\.png\?v=[a-f0-9]+"/);}
 assert.ok(angles.every(angle=>Number.isFinite(angle)&&angle>=-18&&angle<=18));assert.equal(new Set(angles).size,3);assert.ok(angles.some(angle=>angle<0));assert.ok(angles.some(angle=>angle>0));
}),{path:'/members'}));

test('member refresh preserves existing stamp angles and adds only the newly earned stamp',async()=>host(async()=>withRandom([0,.15,.3,.45,.6,.75,.9],async()=>{
 const {ctx}=context(),api=ctx.api;let total=3;
 ctx.api=async(op,data)=>op==='memberCoupons'?{available:true,stampCount:total,capacity:10,expiresAt:future(600000)}:api(op,data);
 memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),html=()=>dialog.querySelector('[data-partner-body]').innerHTML,initial=stampAngles(html());assert.equal(initial.length,3);
 await partnerAction(ctx,'partner-refresh');assert.deepEqual(stampAngles(html()),initial);
 total=4;await partnerAction(ctx,'partner-refresh');const updated=stampAngles(html());assert.equal(updated.length,4);assert.deepEqual(updated.slice(0,3),initial);assert.ok(updated[3]>=-18&&updated[3]<=18);
 assert.equal(stampGroups(html()).filter(mark=>mark.includes('/assets/stamp.png')).length,4);
}),{path:'/members'}));

test('merchant result keeps preview stamp angles while a newly scanned QR starts a fresh set',async()=>host(async()=>withRandom([0,.12,.24,.36,.48,.6,.72,.84,.96],async()=>{
 const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;const initial=stampAngles(await renderMerchant(ctx));assert.equal(initial.length,3);
 assert.deepEqual(stampAngles(await renderMerchant(ctx)),initial);
 await merchantAction(ctx,'merchant-stamp');const result=stampAngles(await renderMerchant(ctx));assert.equal(result.length,4);assert.deepEqual(result.slice(0,3),initial);
 location.hash='#qr='+otherKey;const next=stampAngles(await renderMerchant(ctx));assert.equal(next.length,3);assert.notDeepEqual(next,initial);assert.ok(next.every(angle=>Number.isFinite(angle)&&angle>=-18&&angle<=18));
})));

test('coupon retains supplied artwork and front-only stamps while QR replaces its mounted back face',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx);await partnerAction(ctx,'partner-qr');
 const body=dialog.querySelector('[data-partner-body]'),html=body.innerHTML,figure=html.match(/<figure\b[^>]*class="partner-coupon"[^>]*>[\s\S]*?<\/figure>/)?.[0];
 assert.ok(figure);assert.match(figure,/data-coupon-interactive\b[^>]*tabindex="0"[^>]*role="button"/);
 const front=figure.match(/<div class="partner-card-face partner-card-front"[^>]*>([\s\S]*?)<\/div>/)?.[1],back=figure.match(/<div class="partner-card-face partner-card-back"[^>]*>([\s\S]*?)<\/div>/)?.[1];
 assert.ok(front);assert.ok(back);assert.match(front,/src="\/assets\/FeelingFineCoupon\.png\?v=[a-f0-9]+"/);assert.match(back,/src="\/assets\/FeelingFineCouponBack\.png\?v=[a-f0-9]+"/);
 for(const face of [front,back]){assert.match(face,/width="3000" height="1650"/);assert.match(face,/draggable="false"/);}
 assert.equal(stampGroups(front).length,3);assert.doesNotMatch(back,/class="partner-stamps"|\/assets\/stamp\.png/);
 assert.match(figure,/<\/div><ol class="sr-only" aria-label="스탬프 3개 적립, 총 10개">/);
 assert.match(back,/class="partner-card-qr" data-partner-qr-face hidden/);
 const stage=body.querySelector('[data-coupon-interactive]'),face=body.querySelector('[data-partner-qr-face]'),slot=body.querySelector('.partner-qr-slot');
 assert.equal(face,stage.querySelector('.partner-card-back').querySelector('[data-partner-qr-face]'));assert.equal(face.hidden,false);assert.equal(stage.classList.contains('is-qr-visible'),true);
 assert.match(face.innerHTML,/class="partner-qr-paper"><img src="data:image\/png;base64,/);assert.match(slot.innerHTML,/class="partner-qr-timer"/);assert.doesNotMatch(slot.innerHTML,/data:image|partner-qr-frame|<img|data-action="partner-qr"/);
},{path:'/members'}));

test('member refresh replaces motion bindings while QR changes keep the mounted card and closing removes every listener',async()=>host(async({windowListenerCount,tick})=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),body=dialog.querySelector('[data-partner-body]'),stage=()=>body.querySelectorAll('[data-coupon-interactive]')[0];
 const first=stage();assert.equal(first.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);
 assert.equal(first,body.querySelector('[data-coupon-interactive]'));dispatch(first,'keydown',{key:'ArrowRight'});
 assert.equal(first.style.getPropertyValue('--coupon-rotate-y'),'22deg');
 await partnerAction(ctx,'partner-refresh');const next=stage();assert.notEqual(next,first);assert.equal(first.style.getPropertyValue('--coupon-rotate-y'),'0deg');
 assert.ok([...first.listeners.values()].every(listeners=>listeners.size===0));assert.equal(next.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);
 const html=body.innerHTML;await partnerAction(ctx,'partner-qr');assert.equal(stage(),next);assert.equal(body.innerHTML,html);assert.equal(next.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);
 dispatch(next,'keydown',{key:'ArrowRight'});assert.equal(next.style.getPropertyValue('--coupon-rotate-y'),'0deg');
 await tick(30001);assert.equal(stage(),next);dispatch(next,'keydown',{key:'ArrowRight'});assert.equal(next.style.getPropertyValue('--coupon-rotate-y'),'22deg');await dialog.requestClose(true);
 assert.equal(next.style.getPropertyValue('--coupon-rotate-y'),'0deg');assert.ok([...next.listeners.values()].every(listeners=>listeners.size===0));
 for(const type of ['pointermove','pointerup','pointercancel','keyup','blur'])assert.equal(windowListenerCount(type),0,type);
},{path:'/members',motion:true}));

test('merchant remounts keep one motion binding and hiding the preview removes it before a new scan',async()=>host(async({panel,hidden,windowListenerCount})=>{
 const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);
 const first=panel.querySelectorAll('[data-coupon-interactive]')[0];assert.equal(first.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);
 mountPartnerViews(ctx);assert.equal(first.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);
 for(const listener of first.listeners.get('keydown'))listener({key:'Enter',preventDefault(){}});
 assert.equal(first.style.getPropertyValue('--coupon-rotate-y'),'180deg');
 await hidden(true);assert.equal(first.style.getPropertyValue('--coupon-rotate-y'),'0deg');assert.ok([...first.listeners.values()].every(listeners=>listeners.size===0));assert.equal(windowListenerCount('pointermove'),0);
 await hidden(false);location.hash='#qr='+otherKey;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);const next=panel.querySelectorAll('[data-coupon-interactive]')[0];
 assert.notEqual(next,first);assert.equal(next.listeners.get('keydown')?.size,1);assert.equal(windowListenerCount('pointermove'),1);clearPartnerViews(ctx);
 assert.ok([...next.listeners.values()].every(listeners=>listeners.size===0));for(const type of ['pointermove','pointerup','pointercancel','keyup','blur'])assert.equal(windowListenerCount(type),0,type);
},{motion:true}));

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
 assert.deepEqual(calls.map(call=>call.op),['merchantSession','merchantCouponPreview']);assert.match(html,/테스트 부원/);assert.match(html,/data-form="merchant-stamp"/);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);
}));

test('full stamp cards have no add action or invented reward reset',async()=>host(async()=>{
 const {ctx}=context(),api=ctx.api;signIn(ctx);location.hash='#qr='+qrToken;ctx.api=async(op,data)=>op==='merchantCouponPreview'?{memberName:'부원',stampCount:10,capacity:10,expiresAt:future(10000),serverNow:future(0)}:api(op,data);
 const html=await renderMerchant(ctx);assert.match(html,/10개가 모두 채워져/);assert.doesNotMatch(html,/data-form="merchant-stamp"|초기화|보상|무료/);
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
 await tick(30001);assert.equal(ctx.state.feelingfineMerchant.token,qrToken);assert.equal(ctx.state.feelingfineMerchant.preview.memberName,'테스트 부원');assert.match(panel.innerHTML,/data-form="merchant-stamp"/);
 assert.equal(calls.filter(call=>call.op==='stampCoupon').length,0);
 await merchantAction(ctx,'merchant-stamp');assert.deepEqual(calls.filter(call=>call.op==='stampCoupon'),[{op:'stampCoupon',data:{sessionKey:merchantKey,token:qrToken,amount:1}}]);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);clearPartnerViews(ctx);
}));

test('a merchant can finish login after thirty seconds and stamp a preview carrying an elapsed display timestamp',async()=>host(async({tick})=>{
 const {ctx,calls}=context(),api=ctx.api;
 ctx.api=async(op,data)=>{if(op==='merchantCouponPreview'){calls.push({op,data});return {memberName:'로그인 뒤 확인한 부원',stampCount:3,capacity:10,expiresAt:future(-60000),serverNow:future(0)};}return api(op,data);};
 location.hash='#qr='+qrToken;assert.match(await renderMerchant(ctx),/data-form="merchant-login"/);await tick(30001);
 await merchantSubmit(ctx,'merchant-login',{get:()=> 'synthetic-store-code'});const html=await renderMerchant(ctx);
 assert.match(html,/로그인 뒤 확인한 부원/);assert.match(html,/data-form="merchant-stamp"/);assert.doesNotMatch(html,/data-merchant-countdown|QR이 만료/);
 await merchantAction(ctx,'merchant-stamp');assert.equal(calls.filter(call=>call.op==='stampCoupon').length,1);assert.equal(ctx.state.feelingfineMerchant.result.stampCount,4);
}));

test('hiding the merchant tab or leaving the page still erases preview tokens and private DOM after thirty seconds',async()=>host(async({tick,hidden,pagehide,timers,panel})=>{
 for(const leave of [()=>hidden(true),pagehide]){
  await hidden(false);const {ctx}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);
  await tick(30001);assert.match(panel.innerHTML,/테스트 부원/);await leave();
  assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);assert.doesNotMatch(panel.innerHTML,/테스트 부원|data-form="merchant-stamp"/);assert.equal(timers.size,0);clearPartnerViews(ctx);
 }
}));

test('a merchant session replaced in another tab clears an open preview and cannot stamp its old token',async()=>host(async({cookies,tick,panel,timers})=>{
 const {ctx,calls}=context();signIn(ctx);location.hash='#qr='+qrToken;panel.innerHTML=await renderMerchant(ctx);mountPartnerViews(ctx);
 cookies.set(MERCHANT_SESSION_COOKIE,encodeURIComponent(JSON.stringify({sessionKey:otherKey,expiresAt:future(60000)})));await tick(100);
 assert.equal(ctx.state.feelingfineMerchant.token,'');assert.equal(ctx.state.feelingfineMerchant.preview,null);assert.doesNotMatch(panel.innerHTML,/테스트 부원|data-form="merchant-stamp"/);assert.equal(timers.size,0);
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
 const {ctx}=context();memberSignIn(ctx);ctx.api=async()=>({available:false,stampCount:6,capacity:10,expiresAt:future(600000)});const dialog=await openRevealedPartner(ctx),html=dialog.querySelector('[data-partner-body]').innerHTML;
 assert.ok(dialog.classList.contains('member-partners-dialog'));assert.equal((html.match(/class="is-stamped"/g)||[]).length,6);assert.match(html,/모은 스탬프는 유지/);assert.doesNotMatch(html,/data-action="partner-qr"/);
},{path:'/members'}));

test('member QR remains visible after ten seconds, disappears after thirty, and is never regenerated or persisted automatically',async()=>host(async({tick,timers,tab,cookies})=>{
 const {ctx,calls}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),body=dialog.querySelector('[data-partner-body]'),stage=body.querySelector('[data-coupon-interactive]'),face=body.querySelector('[data-partner-qr-face]'),slot=body.querySelector('.partner-qr-slot');await partnerAction(ctx,'partner-qr');
 assert.match(face.innerHTML,/src="data:image\/png;base64,/);assert.equal(face.hidden,false);assert.equal(stage.classList.contains('is-qr-visible'),true);assert.match(slot.innerHTML,/data-partner-countdown/);assert.doesNotMatch(face.innerHTML+slot.innerHTML,new RegExp(qrToken));
 assert.ok([...tab.values(),...cookies.values()].every(value=>!value.includes(qrToken)));assert.equal(timers.size,1);assert.equal(dialog.querySelector('[data-partner-countdown]').textContent,'30');assert.doesNotMatch(slot.innerHTML,/직원에게 QR을 보여 주세요|QR은 30초 동안 표시됩니다|data:image/);
 assert.deepEqual(stage.scrolled,{block:'nearest',inline:'nearest',behavior:'auto'});await tick(10001);
 assert.match(face.innerHTML,/src="data:image\/png;base64,/);assert.ok(ctx.state.memberPartner.qr);assert.equal(timers.size,1);assert.equal(dialog.querySelector('[data-partner-countdown]').textContent,'20');assert.ok(Number(slot.style.getPropertyValue('--qr-progress'))<.67);await tick(20000);
 assert.equal(body.querySelector('[data-coupon-interactive]'),stage);assert.equal(face.innerHTML,'');assert.equal(face.hidden,true);assert.equal(stage.classList.contains('is-qr-visible'),false);assert.equal(stage.getAttribute('aria-disabled'),'false');assert.match(slot.innerHTML,/새 QR 표시/);assert.equal(timers.size,0);assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);
},{path:'/members'}));

test('card tap and Enter flip the same card while issuing and do not issue again while pending or visible',async()=>host(async()=>{
 for(const trigger of ['click','keydown']){
  const {ctx,calls}=context(),api=ctx.api,pending=deferred();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),body=dialog.querySelector('[data-partner-body]'),html=body.innerHTML,stage=body.querySelector('[data-coupon-interactive]'),face=body.querySelector('[data-partner-qr-face]'),slot=body.querySelector('.partner-qr-slot');
  ctx.api=async(op,data)=>{if(op==='issueCouponQr'){calls.push({op,data});return pending.promise;}return api(op,data);};
  dispatch(stage,trigger,trigger==='click'?{button:0,detail:1}:{key:'Enter'});
  assert.equal(ctx.state.memberPartner.issuing,true);assert.equal(stage.classList.contains('is-qr-visible'),true);assert.equal(stage.getAttribute('aria-busy'),'true');assert.equal(face.hidden,false);assert.match(face.innerHTML,/partner-card-qr-loading/);assert.match(slot.innerHTML,/partner-qr-pending/);
  dispatch(stage,trigger,trigger==='click'?{button:0,detail:1}:{key:'Enter',repeat:true});await partnerAction(ctx,'partner-qr');assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);
  pending.resolve({token:qrToken,expiresAt:future(30000),serverNow:future(0)});await waitForQrIssue(ctx.state.memberPartner);
  assert.ok(ctx.state.memberPartner.qr);assert.equal(stage.getAttribute('aria-busy'),'false');assert.equal(stage.getAttribute('aria-disabled'),'true');assert.match(face.innerHTML,/src="data:image\/png;base64,/);assert.match(slot.innerHTML,/partner-qr-timer/);assert.doesNotMatch(slot.innerHTML,/<img|data-action="partner-qr"/);
  dispatch(stage,'click',{button:0,detail:1});await partnerAction(ctx,'partner-qr');assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,1);assert.equal(body.innerHTML,html);assert.equal(body.querySelector('[data-coupon-interactive]'),stage);await dialog.requestClose(true);
 }
},{path:'/members',motion:true}));

test('a failed QR issue restores the front while retaining stamps and permits one deliberate retry',async()=>host(async()=>{
 const {ctx,calls}=context(),api=ctx.api,pending=deferred();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),body=dialog.querySelector('[data-partner-body]'),html=body.innerHTML,stage=body.querySelector('[data-coupon-interactive]'),face=body.querySelector('[data-partner-qr-face]');
 ctx.api=async(op,data)=>{if(op==='issueCouponQr'){calls.push({op,data});return pending.promise;}return api(op,data);};
 const issuing=partnerAction(ctx,'partner-qr');assert.equal(stage.classList.contains('is-qr-visible'),true);pending.reject(Error('연결 오류 <잠시 후 재시도>'));await issuing;
 assert.equal(body.innerHTML,html);assert.equal(body.querySelector('[data-coupon-interactive]'),stage);assert.equal(stampGroups(body.innerHTML).length,3);assert.equal(ctx.state.memberPartner.error,'');assert.equal(ctx.state.memberPartner.qr,null);assert.equal(stage.classList.contains('is-qr-visible'),false);assert.equal(stage.getAttribute('aria-busy'),'false');assert.equal(face.hidden,true);assert.equal(face.innerHTML,'');assert.equal(body.querySelector('[data-partner-qr-error]').textContent,'연결 오류 <잠시 후 재시도>');assert.match(body.querySelector('.partner-qr-slot').innerHTML,/data-action="partner-qr"/);
 ctx.api=api;await partnerAction(ctx,'partner-qr');assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,2);assert.equal(body.querySelector('[data-partner-qr-error]').textContent,'');assert.ok(ctx.state.memberPartner.qr);assert.equal(body.querySelector('[data-coupon-interactive]'),stage);
},{path:'/members'}));

test('full or disabled member coupons retain their stamps and cannot issue a QR through card activation',async()=>host(async()=>{
 for(const coupons of [{available:true,stampCount:10},{available:false,stampCount:3}]){
  const {ctx,calls}=context(),api=ctx.api;ctx.api=async(op,data)=>{if(op==='memberCoupons'){calls.push({op,data});return {...coupons,capacity:10,expiresAt:future(600000)};}return api(op,data);};memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),body=dialog.querySelector('[data-partner-body]'),stage=body.querySelector('[data-coupon-interactive]');
  assert.equal(stampGroups(body.innerHTML).length,coupons.stampCount);assert.equal(stage.getAttribute('aria-disabled'),'true');assert.equal(body.querySelector('.partner-qr-slot').innerHTML,'');dispatch(stage,'click',{button:0,detail:1});dispatch(stage,'keydown',{key:'Enter'});await partnerAction(ctx,'partner-qr');await flushEvents();assert.equal(calls.filter(call=>call.op==='issueCouponQr').length,0);assert.equal(stage.classList.contains('is-qr-visible'),false);assert.equal(body.querySelector('[data-partner-qr-face]').innerHTML,'');await dialog.requestClose(true);
 }
},{path:'/members',motion:true}));

test('expanded member partner preserves header and navigation while isolating and restoring the covered content',async()=>host(async({hidden,timers,windowListenerCount})=>{
 const content={inert:false,getBoundingClientRect:()=>({left:0,width:390})},appHeader={inert:false,getBoundingClientRect:()=>({bottom:64})},nav={inert:false,getBoundingClientRect:()=>({top:773})};
 const app={getBoundingClientRect:()=>({left:0,width:390}),querySelector:selector=>({'.member-app-header':appHeader,'.member-bottom-nav':nav,'.member-shell-content':content})[selector]||null};
 const query=document.querySelector;document.querySelector=selector=>selector==='[data-member-app]'?app:query(selector);window.innerHeight=844;
 const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),html=dialog.innerHTML,body=()=>dialog.querySelector('[data-partner-body]').innerHTML,face=dialog.querySelector('[data-partner-qr-face]'),stage=dialog.querySelector('[data-coupon-interactive]');
 assert.equal(dialog.modalMode,false);assert.equal(dialog.getAttribute('aria-modal'),'false');assert.equal(content.inert,true);assert.equal(appHeader.inert,false);assert.equal(nav.inert,false);
 for(const [key,value] of Object.entries({top:'64px',left:'0px',width:'390px',height:'709px'}))assert.equal(dialog.style.getPropertyValue('--partner-frame-'+key),value);
 assert.equal(windowListenerCount('resize'),1);
 assert.match(html,/<section class="partner-feelingfine" aria-labelledby="modal-title">[\s\S]*?<div class="partner-intro">/);
 const introIndex=html.indexOf('class="partner-intro"'),benefitIndex=html.indexOf('class="partner-coupon-area"');assert.ok(introIndex>=0&&benefitIndex>introIndex);
 assert.match(html.slice(introIndex,benefitIndex),/<h2 id="modal-title" tabindex="-1">필링파인<\/h2>/);
 assert.match(html.slice(benefitIndex),/class="partner-coupon-area"><div data-partner-body>/);
 assert.doesNotMatch(html,/partner-benefit-heading|partner-benefit-title/);
 assert.match(html,/class="partner-benefits-copy"/);assert.ok(html.indexOf('class="partner-benefits-copy"')<benefitIndex);
 assert.match(body(),/<button\b[^>]*class="partner-qr-trigger"[^>]*data-action="partner-qr"[^>]*aria-label="QR 표시"><i data-lucide="qr-code" aria-hidden="true"><\/i><\/button>/);
 assert.equal((html.match(/<h2\b/g)||[]).length,1);assert.equal((html.match(/id="modal-title"/g)||[]).length,1);
 const header=html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];assert.ok(header);assert.doesNotMatch(header,/<h2\b/);
 assert.doesNotMatch(html,/partner-coupon-title|partner-information|partner-info-card|안내 준비 중/);
 assert.doesNotMatch(html,/<footer\b/);assert.equal((html.match(/\bdata-close\b/g)||[]).length,1);
 assert.ok(dialog.classList.contains('partner-expanded'));const back=dialog.querySelector('[data-close]');assert.equal(back.getAttribute('aria-label'),'혜택으로 돌아가기');assert.match(back.innerHTML,/data-lucide="arrow-left"/);assert.doesNotMatch(back.innerHTML,/data-lucide="x"/);
 assert.equal(dialog.querySelector('.dialog-actions'),null);assert.equal(dialog.querySelector('.dialog-status'),null);
 assert.doesNotMatch(body(),/data-action="partner-refresh"|방문하고 스탬프를 모아 보세요|매장에서 적립할 때 QR을 표시해 주세요/);
 await partnerAction(ctx,'partner-qr');await hidden(true);
 assert.equal(face.innerHTML,'');assert.equal(face.hidden,true);assert.equal(stage.classList.contains('is-qr-visible'),false);assert.equal(timers.size,0);await hidden(false);await partnerAction(ctx,'partner-qr');assert.equal(timers.size,1);assert.match(face.innerHTML,/data:image/);
 dialog.pendingRequest=true;assert.equal(await dialog.requestClose(),false);assert.equal(dialog.open,true);assert.equal(ctx.state.memberPartner.closing,false);dialog.pendingRequest=false;
 assert.equal(await dialog.requestClose(true),true);assert.equal(dialog.open,false);assert.equal(timers.size,0);assert.equal(ctx.state.memberPartner,undefined);assert.equal(dialog.querySelector('.partner-qr-slot').innerHTML,'');assert.equal(face.innerHTML,'');
 assert.equal(content.inert,false);assert.equal(windowListenerCount('resize'),0);
},{path:'/members'}));

test('a QR issuance that returns after the member dialog closes cannot restore a QR',async()=>host(async()=>{
 const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),face=dialog.querySelector('[data-partner-qr-face]'),pending=deferred();ctx.api=()=>pending.promise;
 const issuing=partnerAction(ctx,'partner-qr');assert.match(face.innerHTML,/partner-card-qr-loading/);dialog.close();assert.equal(face.innerHTML,'');pending.resolve({token:qrToken,expiresAt:future(30000),serverNow:future(0)});await issuing;assert.equal(ctx.state.memberPartner,undefined);assert.equal(face.innerHTML,'');assert.equal(dialog.querySelector('.partner-qr-slot').innerHTML,'');
},{path:'/members'}));

test('partner expansion reveals a stationary image across frame borders, scrollbar width, and an interrupted opening',async()=>host(async()=>{
 const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
 const content={inert:false,getBoundingClientRect:()=>rect(11,64,678,900)},appHeader={getBoundingClientRect:()=>({bottom:64})},nav={getBoundingClientRect:()=>({top:773})};
 const app={getBoundingClientRect:()=>rect(10,0,680,964),querySelector:selector=>({'.member-app-header':appHeader,'.member-bottom-nav':nav,'.member-shell-content':content})[selector]||null};
 const rejectImageMotion=()=>assert.fail('the image must remain stationary while only its visible area changes');
 const source={getBoundingClientRect:()=>rect(11,48,678,360),animate:rejectImageMotion};
 const photo={getBoundingClientRect:()=>rect(11,72,678,180),querySelector:selector=>selector==='img'?source:null};
 const origin={getBoundingClientRect:()=>rect(11,72,678,248),querySelector:selector=>({'.member-benefit-photo':photo,'.member-benefit-photo>img':source})[selector]||null};
 const query=document.querySelector,create=document.createElement,previousStyle=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle'),motions=[];
 let currentClip='none';
 document.querySelector=selector=>({'[data-member-app]':app,'.member-benefit-feature':origin})[selector]||query(selector);window.innerHeight=844;
 document.createElement=tag=>{
  const element=create(tag);
  if(tag!=='dialog'){element.animate=rejectImageMotion;return element;}
  element.getBoundingClientRect=()=>rect(11,64,678,709);
  const select=element.querySelector.bind(element);
  element.querySelector=selector=>{
   const part=select(selector);
   if(selector==='.partner-hero'){
    part.getBoundingClientRect=()=>rect(11,64,661,369);
    part.querySelector('img').animate=rejectImageMotion;
   }
   return part;
  };
  element.animate=(keyframes,options)=>{
   const pending=deferred(),motion={keyframes,options,finished:pending.promise,finish:pending.resolve,cancel(){this.cancelled=true;pending.resolve();}};
   motions.push(motion);return motion;
  };
  return element;
 };
 Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({clipPath:currentClip})});
 try{
  const {ctx}=context();memberSignIn(ctx);const dialog=await openMemberPartner(ctx);
  for(const [key,value] of Object.entries({top:'64px',left:'11px',width:'678px',height:'709px'}))assert.equal(dialog.style.getPropertyValue('--partner-frame-'+key),value);
  const assertImagePlane=()=>{for(const [key,value] of Object.entries({left:'0px',top:'-16px',width:'678px',height:'360px'}))assert.equal(dialog.style.getPropertyValue('--partner-image-'+key),value);};
  assertImagePlane();assert.equal(motions.length,1);
  const aperture='inset(8px 0px 521px 0px round 0px)',expanded='inset(0px 0px 0px 0px round 0px)';
  assert.deepEqual(motions[0].keyframes,[{clipPath:aperture},{clipPath:expanded}]);
  currentClip='inset(4px 0px 300px 0px round 0px)';const closing=dialog.requestClose();
  assert.equal(motions.length,2);assert.equal(motions[0].cancelled,true);
  assert.deepEqual(motions[1].keyframes,[{clipPath:currentClip},{clipPath:aperture}]);
  assertImagePlane();motions[1].finish();assert.equal(await closing,true);assert.equal(dialog.open,false);assert.equal(content.inert,false);assertImagePlane();
 }finally{
  if(previousStyle)Object.defineProperty(globalThis,'getComputedStyle',previousStyle);else delete globalThis.getComputedStyle;
 }
},{path:'/members'}));

test('reverse expansion immediately clears QR work and discards its late response before the dialog closes',async()=>host(async({timers})=>{
 const {ctx,calls}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),view=ctx.state.memberPartner,face=dialog.querySelector('[data-partner-qr-face]'),pending=deferred(),animation=deferred();
 view.origin={getBoundingClientRect:()=>({top:100,left:20,bottom:400,right:370,width:350,height:300})};
 dialog.getBoundingClientRect=()=>({top:0,left:0,bottom:844,right:390,width:390,height:844});
 let animationCount=0;dialog.animate=()=>{animationCount++;return {finished:animation.promise,cancel:()=>animation.resolve()};};
 ctx.api=async(op,data)=>{calls.push({op,data});return pending.promise;};
 const issuing=partnerAction(ctx,'partner-qr');assert.match(face.innerHTML,/partner-card-qr-loading/);
 const closing=dialog.requestClose();assert.equal(view.closing,true);assert.equal(dialog.open,true);assert.equal(view.issuing,false);assert.equal(face.innerHTML,'');assert.equal(timers.size,0);
 assert.equal(dialog.requestClose(),closing);assert.equal(animationCount,1);
 const callsBefore=calls.length;await partnerAction(ctx,'partner-qr');assert.equal(calls.length,callsBefore);
 pending.resolve({token:qrToken,expiresAt:future(30000),serverNow:future(0)});await issuing;
 assert.equal(view.qr,null);assert.equal(face.innerHTML,'');assert.equal(dialog.open,true);
 animation.resolve();assert.equal(await closing,true);assert.equal(dialog.open,false);assert.equal(ctx.state.memberPartner,undefined);assert.equal(face.innerHTML,'');assert.equal(timers.size,0);
},{path:'/members'}));

test('hiding or leaving during issuance restores the front and discards the late QR reply',async()=>host(async({hidden,pagehide,timers})=>{
 for(const leave of [()=>hidden(true),pagehide]){
  await hidden(false);const {ctx}=context();memberSignIn(ctx);const dialog=await openRevealedPartner(ctx),stage=dialog.querySelector('[data-coupon-interactive]'),face=dialog.querySelector('[data-partner-qr-face]'),pending=deferred();ctx.api=()=>pending.promise;
  const issuing=partnerAction(ctx,'partner-qr');assert.equal(stage.classList.contains('is-qr-visible'),true);await leave();assert.equal(stage.classList.contains('is-qr-visible'),false);assert.equal(face.hidden,true);assert.equal(face.innerHTML,'');
  pending.resolve({token:qrToken,expiresAt:future(30000),serverNow:future(0)});await issuing;assert.equal(ctx.state.memberPartner.qr,null);assert.equal(ctx.state.memberPartner.issuing,false);assert.equal(face.innerHTML,'');assert.equal(timers.size,0);await dialog.requestClose(true);
 }
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
