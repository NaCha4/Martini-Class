import QRCode from 'qrcode';
import { esc, icon, button, field, modal, refreshIcons } from './ui.js';
import { getMemberSessionKey, isMemberRoute, refreshMemberSession, clearMemberIdentity, isMemberAccessError } from './member-session.js';
import { getMerchantSessionKey, setMerchantSession, clearMerchantSession, merchantCookieUnavailable, isMerchantAccessError, MERCHANT_SESSION_CHANNEL } from './merchant-session.js';
import './partner-stamps.css';

const TOKEN=/^[a-f0-9]{64}$/;
const CAPACITY=10;
const monotonic=()=>performance.now();
export const isMerchantRoute=()=>location.pathname.replace(/\/$/,'')==='/partners/feelingfine';
export function qrLifetime(response,started,now=monotonic()){
 const expires=Date.parse(response?.expiresAt),server=Date.parse(response?.serverNow);
 if(!Number.isFinite(expires)||!Number.isFinite(server))return 0;
 return Math.max(0,Math.min(10000,expires-server)-Math.max(0,now-started));
}
const count=value=>Math.min(CAPACITY,Math.max(0,Math.floor(Number(value)||0)));
function stampCard(total){
 const completed=count(total);
 // The supplied 3000 × 1650 artwork stays intact; marks use its glass centers.
 const columns=[439,969.5,1500.5,2031.5,2562.5],rows=[418,900.5];
 const marks=Array.from({length:completed},(_,index)=>'<g class="is-stamped" transform="translate('+columns[index%5]+' '+rows[Math.floor(index/5)]+') rotate('+(index%2?6:-8)+')" fill="none" stroke="currentColor"><circle r="185" stroke-width="12"/><circle r="172" stroke-width="4" opacity=".55"/><circle cx="132" cy="128" r="52" fill="currentColor" stroke="none"/><path d="M106 128l18 18 30-36" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></g>').join('');
 return '<figure class="partner-coupon"><div class="partner-card"><img class="partner-card-art" src="/assets/FeelingFineCoupon.png" width="3000" height="1650" alt="Feeling Fine × Martini 쿠폰" draggable="false"><svg class="partner-stamps" viewBox="0 0 3000 1650" aria-hidden="true" focusable="false">'+marks+'</svg><ol class="sr-only" aria-label="스탬프 적립 현황">'+Array.from({length:CAPACITY},(_,index)=>'<li>'+(index+1)+'번째 '+(index<completed?'적립 완료':'미적립')+'</li>').join('')+'</ol></div><figcaption class="partner-card-status">'+(completed>=CAPACITY?'<span class="partner-complete">스탬프 10개를 모두 모았어요.</span>':'')+'<span class="partner-card-count">적립 <strong>'+completed+' / 10</strong></span></figcaption></figure>';
}
function memberCurrent(ctx,view){return ctx.state.memberPartner===view&&!view.disposed&&view.dialog?.open&&isMemberRoute()&&getMemberSessionKey(ctx)===view.sessionKey;}
function stop(view){view.stop?.();view.stop=null;}
function memberBody(view){
 if(view.error)return '<div class="partner-message"><p role="alert">'+esc(view.error)+'</p>'+button('다시 불러오기','partner-refresh',{class:'button secondary'})+'</div>';
 if(!view.coupons)return '<p class="partner-message" role="status">스탬프를 불러오고 있어요.</p>';
 if(!view.coupons.available)return stampCard(count(view.coupons.stampCount))+'<p class="partner-message">지금은 스탬프를 적립할 수 없습니다. 모은 스탬프는 유지됩니다.</p>';
 const full=count(view.coupons.stampCount)>=CAPACITY;
 return '<div class="partner-heading"><p>방문하고 스탬프를 모아 보세요.</p>'+button('새로고침','partner-refresh',{class:'button small secondary',icon:'refresh-cw'})+'</div>'+stampCard(count(view.coupons.stampCount))+(!full?'<section class="partner-qr-slot" aria-label="스탬프 적립 QR">'+(view.qr?'<div class="partner-qr-frame"><div class="partner-qr-paper"><img src="'+esc(view.qr.image)+'" width="280" height="280" alt="필링파인 매장에서 스캔할 일회용 적립 QR 코드"></div></div><p class="partner-qr-timer"><span class="partner-live-dot" aria-hidden="true"></span>남은 시간 <strong data-partner-countdown>'+Math.ceil(Math.max(0,view.qr.deadline-monotonic())/1000)+'</strong>초</p><p class="partner-qr-help">직원에게 QR을 보여 주세요. 10초 동안 한 번만 사용할 수 있어요.</p>':view.issuing?'<p class="partner-qr-help" role="status">QR을 만들고 있어요.</p>':(view.expired?'<p class="partner-qr-help" role="status">QR이 만료되었습니다. 적립하려면 새 QR을 표시해 주세요.</p>':'<p class="partner-qr-help">매장에서 적립할 때 QR을 표시해 주세요.</p>')+button(view.expired?'새 QR 표시':'QR 표시','partner-qr',{icon:'ticket'}))+'</section>':'');
}
function paintMember(view){const body=view.dialog?.querySelector('[data-partner-body]');if(body){body.innerHTML=memberBody(view);refreshIcons();}}
function expireMemberQr(view){stop(view);view.qr=null;view.issuing=false;view.expired=true;view.generation++;if(!view.disposed)paintMember(view);}
function disposeMember(ctx){
 const view=ctx.state.memberPartner;if(!view)return;stop(view);view.cleanup?.();view.disposed=true;view.generation++;view.qr=null;
 const slot=view.dialog?.querySelector('.partner-qr-slot');if(slot)slot.innerHTML='';delete ctx.state.memberPartner;
}
function watchMemberQr(ctx,view){
 stop(view);
 const check=()=>{
  if(!memberCurrent(ctx,view)){disposeMember(ctx);return;}
  if(document.hidden||!view.qr||view.qr.deadline<=monotonic()){expireMemberQr(view);return;}
  const label=view.dialog.querySelector('[data-partner-countdown]');if(label)label.textContent=String(Math.ceil((view.qr.deadline-monotonic())/1000));
 };
 const timer=setInterval(check,100);timer.unref?.();
 const expiry=setTimeout(()=>{if(memberCurrent(ctx,view))expireMemberQr(view);else disposeMember(ctx);},Math.max(0,view.qr.deadline-monotonic()));expiry.unref?.();
 const hide=()=>expireMemberQr(view);
 document.addEventListener('visibilitychange',check);window.addEventListener('pagehide',hide);
 view.stop=()=>{clearInterval(timer);clearTimeout(expiry);document.removeEventListener('visibilitychange',check);window.removeEventListener('pagehide',hide);};check();
}
async function loadCoupons(ctx,view){
 const generation=++view.generation;view.error='';
 try{
  const coupons=await ctx.api('memberCoupons',{sessionKey:view.sessionKey});
  if(!memberCurrent(ctx,view)||generation!==view.generation)return;
  refreshMemberSession(ctx,coupons.expiresAt);view.coupons=coupons;paintMember(view);
 }catch(error){
  if(!memberCurrent(ctx,view)||generation!==view.generation)return;
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);await view.dialog.requestClose(true);await ctx.render();return;}
  view.error=error.message||'스탬프를 불러오지 못했습니다.';paintMember(view);
 }
}
export async function openMemberPartner(ctx){
 const sessionKey=getMemberSessionKey(ctx);if(!sessionKey||!isMemberRoute())return ctx.render();
 disposeMember(ctx);const view={sessionKey,generation:0,coupons:null,qr:null,disposed:false,error:''};
 const dialog=modal('필링파인','<div data-partner-body>'+memberBody(view)+'</div>',null,{contentOnly:true,onClose:()=>{if(ctx.state.memberPartner===view)disposeMember(ctx);}});
 dialog.classList.add('member-dialog','member-partners-dialog','partner-dialog');view.dialog=dialog;ctx.state.memberPartner=view;
 const hidden=()=>{if(document.hidden&&(view.qr||view.issuing))expireMemberQr(view);};
 document.addEventListener('visibilitychange',hidden);view.cleanup=()=>document.removeEventListener('visibilitychange',hidden);
 await loadCoupons(ctx,view);return dialog;
}
export async function partnerAction(ctx,action){
 const view=ctx.state.memberPartner;if(!view||!memberCurrent(ctx,view))return;
 if(action==='partner-refresh'){expireMemberQr(view);view.expired=false;return loadCoupons(ctx,view);}
 if(action!=='partner-qr'||view.issuing||!view.coupons?.available||count(view.coupons.stampCount)>=CAPACITY)return;
 expireMemberQr(view);view.expired=false;view.issuing=true;paintMember(view);const generation=++view.generation,started=monotonic();
 try{
  const issued=await ctx.api('issueCouponQr',{sessionKey:view.sessionKey});
  if(!memberCurrent(ctx,view)||generation!==view.generation||document.hidden)return;
  if(!TOKEN.test(issued.token||''))throw new Error('QR을 만들지 못했습니다. 다시 시도해 주세요.');
  const deadline=monotonic()+qrLifetime(issued,started);
  if(deadline<=monotonic()){expireMemberQr(view);return;}
  const image=await QRCode.toDataURL(location.origin+'/partners/feelingfine#qr='+issued.token,{errorCorrectionLevel:'M',margin:4,width:280,color:{dark:'#111111',light:'#ffffff'}});
  if(!memberCurrent(ctx,view)||generation!==view.generation||document.hidden)return;
  if(deadline<=monotonic()){expireMemberQr(view);return;}
  view.issuing=false;view.qr={image,deadline};paintMember(view);watchMemberQr(ctx,view);
 }catch(error){
  if(!memberCurrent(ctx,view)||generation!==view.generation)return;
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);await view.dialog.requestClose(true);await ctx.render();return;}
  view.issuing=false;view.error=error.message||'QR을 만들지 못했습니다.';paintMember(view);
 }
}

function merchantView(ctx){return ctx.state.feelingfineMerchant??={token:'',preview:null,result:null,error:'',request:null,pending:false,sessionKey:'',deadline:0};}
function captureQr(view){
 const hash=location.hash||'';if(!hash)return;
 const token=/^#qr=([a-f0-9]{64})$/.exec(hash)?.[1]||'';
 history.replaceState(history.state,'',location.pathname+location.search);
 stop(view);view.token=token;view.preview=null;view.result=null;view.pending=false;view.error=token?'':'올바른 적립 QR이 아닙니다. 부원에게 새 QR을 요청해 주세요.';view.deadline=0;
}
function merchantCurrent(ctx,view,sessionKey,request){return isMerchantRoute()&&ctx.state.feelingfineMerchant===view&&getMerchantSessionKey(ctx)===sessionKey&&(!request||view.request===request);}
function merchantShell(body,authenticated=false){return '<main id="main-content" class="merchant-page"><header><span class="merchant-brand">FEELING FINE</span><h1 id="page-title" tabindex="-1">필링파인 스탬프</h1><p>매장용 적립 화면</p></header>'+body+(authenticated?'<footer>'+button('로그아웃','merchant-logout',{class:'button ghost'})+'</footer>':'')+'</main>';}
function loginHtml(view){return merchantShell('<section class="merchant-panel"><h2>매장 로그인</h2><p>운영진에게 전달받은 매장 코드를 입력해 주세요.</p>'+(view.token?'<p class="merchant-note">로그인 후 스캔한 QR을 확인합니다. 시간이 지나면 부원에게 새 QR을 요청해 주세요.</p>':'')+'<form data-form="merchant-login">'+field('code','매장 코드','',{type:'password',required:true,maxLength:null,autocomplete:'off',spellcheck:false})+'<p class="form-error" role="alert">'+esc(view.error)+'</p><button type="submit" class="button full">로그인</button></form><p class="merchant-note">이 기기에서 최대 1년간 로그인 상태가 유지됩니다.</p></section>');}
function merchantHtml(ctx,view){
 let body='';
 if(view.result)body='<section class="merchant-panel merchant-result">'+icon('check')+'<h2>'+(view.result.duplicate?'이미 적립된 QR입니다':'스탬프를 적립했습니다')+'</h2>'+(view.result.memberName?'<p>'+esc(view.result.memberName)+' 님</p>':'')+stampCard(count(view.result.stampCount))+'<p class="merchant-note">다음 부원의 QR을 휴대전화 카메라로 스캔해 주세요.</p></section>';
 else if(view.preview){const full=count(view.preview.stampCount)>=CAPACITY;body='<section class="merchant-panel"><p class="merchant-eyebrow">적립할 부원</p><h2>'+esc(view.preview.memberName)+' 님</h2>'+stampCard(count(view.preview.stampCount))+(full?'<p>스탬프 10개가 모두 채워져 있습니다.</p>':'<p class="merchant-countdown">QR 유효시간 <strong data-merchant-countdown>'+Math.ceil(Math.max(0,view.deadline-monotonic())/1000)+'</strong>초</p>'+button('스탬프 1개 적립','merchant-stamp',{class:'button full',icon:'plus',disabled:view.pending}))+'<p class="form-error" role="alert">'+esc(view.error)+'</p></section>';}
 else body='<section class="merchant-panel merchant-scan">'+icon('ticket')+'<h2>'+(view.error?'QR을 다시 확인해 주세요':'부원의 QR을 스캔해 주세요')+'</h2><p'+(view.error?' role="status"':'')+'>'+esc(view.error||'휴대전화 카메라로 부원이 표시한 QR을 스캔하면 적립 화면이 열립니다.')+'</p></section>';
 if(merchantCookieUnavailable(ctx))body+='<p class="merchant-note">쿠키를 저장하지 못해 이 화면을 닫으면 다시 로그인해야 할 수 있습니다.</p>';
 return merchantShell(body,true);
}
function expiredMerchant(view,message='QR이 만료되었습니다. 부원에게 새 QR을 요청해 주세요.'){
 stop(view);view.token='';view.preview=null;view.result=null;view.deadline=0;view.error=message;
}
export async function renderMerchant(ctx){
 const view=merchantView(ctx);captureQr(view);stop(view);
 const sessionKey=getMerchantSessionKey(ctx);
 if(!sessionKey){view.preview=null;view.result=null;view.sessionKey='';return loginHtml(view);}
 if(view.sessionKey&&view.sessionKey!==sessionKey){view.token='';view.preview=null;view.result=null;view.error='';}
 view.sessionKey=sessionKey;const request=Symbol();view.request=request;
 try{
  await ctx.api('merchantSession',{sessionKey});
  if(!merchantCurrent(ctx,view,sessionKey,request))return '';
  if(view.token&&!view.result&&!view.pending){
   const token=view.token,started=monotonic(),preview=await ctx.api('merchantCouponPreview',{sessionKey,token});
   if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return '';
   view.deadline=monotonic()+qrLifetime(preview,started);view.preview=preview;view.error='';
   if(view.deadline<=monotonic())expiredMerchant(view);
  }
  return merchantHtml(ctx,view);
 }catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request))return '';
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);view.sessionKey='';view.token='';view.preview=null;view.result=null;view.error='매장 로그인이 만료되었거나 해제되었습니다. 다시 로그인해 주세요.';return loginHtml(view);}
  expiredMerchant(view,error.message||'QR을 확인하지 못했습니다. 부원에게 새 QR을 요청해 주세요.');return merchantHtml(ctx,view);
 }
}
export async function merchantSubmit(ctx,form,data,node){
 if(form!=='merchant-login'||!isMerchantRoute())return;
 const view=merchantView(ctx),request=Symbol(),before=getMerchantSessionKey(ctx);view.request=request;
 const code=String(data.get('code')||'').trim();if(!code)throw new Error('매장 코드를 입력해 주세요.');
 const result=await ctx.api('merchantLogin',{code});
 if(!isMerchantRoute()||ctx.state.feelingfineMerchant!==view||view.request!==request||getMerchantSessionKey(ctx)!==before)return;
 setMerchantSession(ctx,result);view.sessionKey=result.sessionKey;view.error='';node?.reset?.();await ctx.render();
}
export async function merchantAction(ctx,action){
 if(!isMerchantRoute())return;
 const view=merchantView(ctx),sessionKey=getMerchantSessionKey(ctx);
 if(action==='merchant-logout'){
  clearMerchantSession(ctx);clearPartnerViews(ctx);
  if(merchantCookieUnavailable(ctx))merchantView(ctx).error='이 기기의 쿠키를 삭제하지 못했습니다. 브라우저 설정에서 이 사이트의 쿠키를 지워 주세요.';
  const logout=sessionKey?ctx.api('merchantLogout',{sessionKey}).catch(()=>false):Promise.resolve(true);
  await ctx.render();if(await logout===false)ctx.toast('이 기기에서 로그아웃했습니다. 연결을 확인하지 못해 서버 로그아웃 여부는 확인할 수 없습니다.');return;
 }
 if(action!=='merchant-stamp'||view.pending||!view.preview||!view.token||!sessionKey||view.sessionKey!==sessionKey||count(view.preview.stampCount)>=CAPACITY)return;
 if(view.deadline<=monotonic()||document.hidden){expiredMerchant(view);return ctx.render();}
 const token=view.token,request=Symbol();view.request=request;view.pending=true;view.error='';stop(view);
 try{
  const result=await ctx.api('stampCoupon',{sessionKey,token});
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return;
  view.result={...result,memberName:result.memberName||view.preview.memberName};view.token='';view.preview=null;view.deadline=0;view.pending=false;await ctx.render();
 }catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return;
  view.pending=false;
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);view.token='';view.preview=null;view.result=null;view.sessionKey='';view.error='다시 로그인해 주세요.';}
  else expiredMerchant(view,'적립 결과를 확인하지 못했습니다. 부원 화면을 새로고침하여 스탬프 개수를 확인한 뒤 다시 시도해 주세요.');
  await ctx.render();
 }
}
export function clearPartnerViews(ctx){
 disposeMember(ctx);const view=ctx.state.feelingfineMerchant;if(view){stop(view);view.cleanup?.();view.request=null;view.token='';view.preview=null;view.result=null;const panel=document.querySelector('.merchant-panel');if(panel)panel.innerHTML='<p>QR을 다시 스캔해 주세요.</p>';delete ctx.state.feelingfineMerchant;}
}
export function mountPartnerViews(ctx){
 if(!isMemberRoute())disposeMember(ctx);
 const view=ctx.state.feelingfineMerchant;
 if(!isMerchantRoute()){if(view){stop(view);view.cleanup?.();view.token='';view.preview=null;view.result=null;delete ctx.state.feelingfineMerchant;}return;}
 if(!view)return;stop(view);view.cleanup?.();view.cleanup=null;
 if(!view.sessionKey)return;
 const erasePanel=()=>{const panel=document.querySelector('.merchant-panel');if(panel)panel.innerHTML='<p>QR을 다시 스캔해 주세요.</p>';};
 const check=()=>{
  if(ctx.state.feelingfineMerchant!==view||!isMerchantRoute()){stop(view);view.cleanup?.();return;}
  if(getMerchantSessionKey(ctx)!==view.sessionKey){expiredMerchant(view,'로그인 상태가 변경되었습니다. QR을 다시 스캔해 주세요.');view.result=null;view.request=null;erasePanel();view.cleanup?.();void ctx.render();return;}
  if(view.preview&&view.token&&!view.pending&&view.deadline<=monotonic()){expiredMerchant(view);erasePanel();void ctx.render();return;}
  const label=document.querySelector('[data-merchant-countdown]');if(label&&view.preview)label.textContent=String(Math.max(0,Math.ceil((view.deadline-monotonic())/1000)));
 };
 const hide=()=>{expiredMerchant(view);view.result=null;view.request=null;view.pending=false;erasePanel();};
 const visibility=()=>{if(document.hidden)hide();else{check();if(ctx.state.feelingfineMerchant===view)void ctx.render();}};
 const focus=()=>{if(!document.hidden)check();};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);window.addEventListener('pagehide',hide);
 let channel;try{if(window.BroadcastChannel){channel=new window.BroadcastChannel(MERCHANT_SESSION_CHANNEL);channel.onmessage=check;}}catch{}
 view.cleanup=()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',hide);channel?.close();};
 if(!document.hidden){const timer=setInterval(check,view.preview?100:1000);timer.unref?.();view.stop=()=>clearInterval(timer);check();}else hide();
}
