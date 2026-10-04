import QRCode from 'qrcode';
import { esc, icon, button, field, modal, refreshIcons } from './ui.js';
import { getMemberSessionKey, isMemberRoute, refreshMemberSession, clearMemberIdentity, isMemberAccessError } from './member-session.js';
import { getMerchantSessionKey, setMerchantSession, clearMerchantSession, merchantCookieUnavailable, isMerchantAccessError, MERCHANT_SESSION_CHANNEL } from './merchant-session.js';
import { bindCouponMotion } from './coupon-motion.js';
import { bindCouponReveal } from './coupon-pocket.js';
import './partner-stamps.css';
import './merchant-stamps.css';

const TOKEN=/^[a-f0-9]{64}$/;
const CAPACITY=10;
const monotonic=()=>performance.now();
export const isMerchantRoute=()=>location.pathname.replace(/\/$/,'')==='/partners/feelingfine';
export function qrLifetime(response,started,now=monotonic()){
 const expires=Date.parse(response?.expiresAt),server=Date.parse(response?.serverNow);
 if(!Number.isFinite(expires)||!Number.isFinite(server))return 0;
 return Math.max(0,Math.min(30000,expires-server)-Math.max(0,now-started));
}
const count=value=>Math.min(CAPACITY,Math.max(0,Math.floor(Number(value)||0)));
function stampCard(total,view,{member=false}={}){
 const completed=count(total);
 const angles=view.stampAngles??=[];
 // Keep each impression steady when the same card is refreshed or gains a stamp.
 while(angles.length<completed)angles.push(Math.round((Math.random()*36-18)*10)/10);
 // The supplied 3000 × 1650 artwork stays intact; marks use its glass centers.
 const columns=[439,969.5,1500.5,2031.5,2562.5],rows=[418,900.5];
 const marks=Array.from({length:completed},(_,index)=>'<g class="is-stamped" transform="translate('+columns[index%5]+' '+rows[Math.floor(index/5)]+') rotate('+angles[index]+')"><image href="/assets/stamp.png?v=aeb5a211" x="-225" y="-210" width="450" height="420"/></g>').join('');
 const label=member?'내 스탬프 쿠폰. 누르면 뒷면에 적립 QR이 표시됩니다. 좌우로 끌면 쿠폰을 돌려볼 수 있습니다.':'쿠폰 돌려보기. 좌우로 끌거나 방향키를 누르면 돌아가고, 놓으면 앞면으로 돌아옵니다.';
 return '<figure class="partner-coupon"><div class="partner-coupon-stage" data-coupon-interactive tabindex="0" role="button" aria-label="'+label+'"><div class="partner-coupon-float"><div class="partner-card"><div class="partner-card-face partner-card-front" aria-hidden="true"><img class="partner-card-art" src="/assets/FeelingFineCoupon.png?v=07f0f639" width="3000" height="1650" alt="Feeling Fine × Martini 쿠폰 앞면" draggable="false"><svg class="partner-stamps" viewBox="0 0 3000 1650" aria-hidden="true" focusable="false">'+marks+'</svg></div><div class="partner-card-face partner-card-back" aria-hidden="true"><img class="partner-card-art" src="/assets/FeelingFineCouponBack.png?v=b71658ac" width="3000" height="1650" alt="Feeling Fine × Martini 쿠폰 뒷면" draggable="false">'+(member?'<div class="partner-card-qr" data-partner-qr-face hidden></div>':'')+'</div></div></div></div><ol class="sr-only" aria-label="스탬프 '+completed+'개 적립, 총 10개">'+Array.from({length:CAPACITY},(_,index)=>'<li>'+(index+1)+'번째 '+(index<completed?'적립 완료':'미적립')+'</li>').join('')+'</ol></figure>';
}
function memberCurrent(ctx,view){return ctx.state.memberPartner===view&&!view.disposed&&!view.closing&&view.dialog?.open&&isMemberRoute()&&getMemberSessionKey(ctx)===view.sessionKey;}
function stop(view){view.stop?.();view.stop=null;}
function clearCouponMotion(view){view.couponCleanup?.();view.couponCleanup=null;}
function canIssueQr(view){return view.coupons?.available&&count(view.coupons.stampCount)<CAPACITY;}
function memberBody(view){
 if(!view.revealed)return '<div class="partner-coupon-pocket"><button type="button" class="partner-coupon-peek" data-coupon-reveal aria-label="내 스탬프 쿠폰 열기"><img src="/assets/FeelingFineCouponBack.png?v=b71658ac" width="3000" height="1650" alt="" draggable="false"></button></div>';
 if(view.error)return '<div class="partner-message"><p role="alert">'+esc(view.error)+'</p>'+button('다시 불러오기','partner-refresh',{class:'button secondary'})+'</div>';
 if(!view.coupons)return '<p class="partner-message" role="status">스탬프를 불러오고 있어요.</p>';
 return stampCard(count(view.coupons.stampCount),view,{member:true})+'<div class="partner-qr-slot">'+qrControl(view)+'</div><p class="partner-qr-error" data-partner-qr-error role="alert"></p>'+(!view.coupons.available?'<p class="partner-message">지금은 스탬프를 적립할 수 없습니다. 모은 스탬프는 유지됩니다.</p>':'');
}
function qrControl(view){
 if(!canIssueQr(view))return '';
 if(view.qr)return '<div class="partner-qr-timer" role="timer" aria-live="off" aria-label="QR 남은 시간"><strong data-partner-countdown>'+Math.ceil(Math.max(0,view.qr.deadline-monotonic())/1000)+'</strong><span>초</span></div>';
 if(view.issuing)return '<span class="partner-qr-pending" role="status">'+icon('loader-circle')+'<span class="sr-only">QR을 만들고 있어요.</span></span>';
 return (view.expired?'<span class="sr-only" role="status">QR 표시가 종료되었습니다.</span>':'')+'<button type="button" class="partner-qr-trigger" data-action="partner-qr" aria-label="'+(view.expired?'새 QR 표시':'QR 표시')+'">'+icon('qr-code')+'</button>';
}
function updateCountdown(view){
 if(!view.qr)return;
 const left=Math.max(0,view.qr.deadline-monotonic()),label=view.dialog.querySelector('[data-partner-countdown]');
 if(label)label.textContent=String(Math.ceil(left/1000));
 view.dialog.querySelector('.partner-qr-slot')?.style.setProperty('--qr-progress',String(left/30000));
}
// Update only the back face and control so the mounted card can visibly rotate.
function syncMemberQr(view){
 const body=view.dialog?.querySelector('[data-partner-body]');if(!body||!view.coupons)return;
 const stage=body.querySelector('[data-coupon-interactive]'),face=body.querySelector('[data-partner-qr-face]'),slot=body.querySelector('.partner-qr-slot');
 const showing=Boolean(view.qr||view.issuing),active=document.activeElement;
 const transferFocus=slot?.contains?.(active)&&active?.matches?.(':focus-visible');
 if(stage){
  stage.classList[showing?'add':'remove']('is-qr-visible');
  stage.setAttribute('aria-busy',String(Boolean(view.issuing)));
  stage.setAttribute('aria-disabled',String(showing||!canIssueQr(view)));
  stage.setAttribute('aria-label',view.qr?'매장 적립용 QR 코드':view.issuing?'적립 QR을 만들고 있습니다.':canIssueQr(view)?'내 스탬프 쿠폰. 누르면 뒷면에 적립 QR이 표시됩니다. 좌우로 끌면 쿠폰을 돌려볼 수 있습니다.':'내 스탬프 쿠폰. 지금은 추가 적립을 할 수 없습니다.');
  if(showing){stage.style.setProperty('--coupon-rotate-x','0deg');stage.style.setProperty('--coupon-rotate-y','0deg');}
 }
 if(face){face.hidden=!showing;face.innerHTML=view.qr?'<div class="partner-qr-paper"><img src="'+esc(view.qr.image)+'" width="280" height="280" alt="필링파인 매장에서 스캔할 일회용 적립 QR 코드" draggable="false"></div>':view.issuing?'<span class="partner-card-qr-loading" aria-hidden="true">'+icon('loader-circle')+'</span>':'';}
 body.querySelector('.partner-card-back')?.setAttribute('aria-hidden',String(!view.qr));
 if(slot)slot.innerHTML=qrControl(view);
 const error=body.querySelector('[data-partner-qr-error]');if(error)error.textContent=view.qrError||'';
 refreshIcons();updateCountdown(view);
 if(transferFocus)stage?.focus?.({preventScroll:true});
}
function paintMember(ctx,view){
 const body=view.dialog?.querySelector('[data-partner-body]');if(!body)return;
 clearCouponMotion(view);body.innerHTML=memberBody(view);refreshIcons();
 view.couponCleanup=bindCouponMotion(body,{onActivate:()=>partnerAction(ctx,'partner-qr'),canInteract:()=>memberCurrent(ctx,view)&&!view.qr&&!view.issuing});
 syncMemberQr(view);
}
function expireMemberQr(view){stop(view);view.qr=null;view.issuing=false;view.expired=true;view.generation++;if(!view.disposed)syncMemberQr(view);}
function disposeMember(ctx){
 const view=ctx.state.memberPartner;if(!view)return;stop(view);clearCouponMotion(view);view.revealCleanup?.();view.cleanup?.();view.disposed=true;view.generation++;view.qr=null;view.expansion?.cancel();view.expansion=null;
 for(const selector of ['.partner-qr-slot','[data-partner-qr-face]']){const element=view.dialog?.querySelector(selector);if(element)element.innerHTML='';}
 delete ctx.state.memberPartner;
}
function watchMemberQr(ctx,view){
 stop(view);
 const check=()=>{
  if(!memberCurrent(ctx,view)){disposeMember(ctx);return;}
  if(document.hidden||!view.qr||view.qr.deadline<=monotonic()){expireMemberQr(view);return;}
  updateCountdown(view);
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
  refreshMemberSession(ctx,coupons.expiresAt);view.coupons=coupons;paintMember(ctx,view);
 }catch(error){
  if(!memberCurrent(ctx,view)||generation!==view.generation)return;
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);await view.dialog.requestClose(true);await ctx.render();return;}
  view.error=error.message||'스탬프를 불러오지 못했습니다.';paintMember(ctx,view);
 }
}
function animateMemberExpansion(view,opening){
 const dialog=view.dialog,origin=view.origin?.getBoundingClientRect?.(),frame=dialog?.getBoundingClientRect?.();
 if(!dialog?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||!origin?.width||!origin?.height||!frame?.width||!frame?.height||document.hidden)return Promise.resolve();
 const top=Math.max(0,origin.top-frame.top),left=Math.max(0,origin.left-frame.left);
 const bottom=Math.max(0,frame.bottom-origin.bottom),right=Math.max(0,frame.right-origin.right);
 if(![top,left,bottom,right].every(Number.isFinite))return Promise.resolve();
 const cardClip='inset('+top+'px '+right+'px '+bottom+'px '+left+'px round 16px)',fullClip='inset(0px 0px 0px 0px round 0px)';
 const currentClip=globalThis.getComputedStyle?.(dialog)?.clipPath;
 view.expansion?.cancel();
 const motion=dialog.animate([{clipPath:opening?cardClip:currentClip&&currentClip!=='none'?currentClip:fullClip},{clipPath:opening?fullClip:cardClip}],{duration:opening?360:240,easing:'cubic-bezier(.22,.8,.25,1)'});
 view.expansion=motion;
 return motion.finished.catch(()=>{}).finally(()=>{if(view.expansion===motion)view.expansion=null;});
}
export async function openMemberPartner(ctx){
 const sessionKey=getMemberSessionKey(ctx);if(!sessionKey||!isMemberRoute())return ctx.render();
 disposeMember(ctx);const view={sessionKey,generation:0,coupons:null,qr:null,revealed:false,disposed:false,closing:false,error:'',qrError:'',origin:document.querySelector('.member-benefit-feature')};
 const content='<section class="partner-feelingfine" aria-labelledby="modal-title">'+
  '<div class="partner-intro"><div class="partner-hero"><img src="/assets/feelingfine-bar-hero.jpg" width="1672" height="941" alt="분위기를 표현한 가상의 바 테이블 이미지" decoding="async" draggable="false"><div class="partner-hero-title"><p class="partner-brand" aria-hidden="true">Feeling Fine</p><h2 id="modal-title" tabindex="-1">필링파인</h2><div class="partner-intro-copy"><p class="partner-intro-description">다양한 칵테일과 안주를 즐기는 공간.</p></div></div></div></div>'+
  '<div class="partner-benefits-copy"><p class="partner-benefits-eyebrow">MARTINI MEMBERS</p><h3>함께하는 시간에, 작은 혜택을.</h3><p class="partner-benefits-description">부원 전용 스탬프 적립</p></div>'+
  '<div class="partner-coupon-area"><div data-partner-body>'+memberBody(view)+'</div></div></section>';
 const dialog=modal('필링파인',content,null,{contentOnly:true,bodyTitle:true,footer:false,onClose:()=>{if(ctx.state.memberPartner===view)disposeMember(ctx);}});
 dialog.classList.add('member-dialog','member-partners-dialog','partner-dialog','partner-expanded');view.dialog=dialog;ctx.state.memberPartner=view;
 const back=dialog.querySelector('[data-close]');
 if(back){back.innerHTML=icon('arrow-left');back.setAttribute('aria-label','혜택으로 돌아가기');back.setAttribute('title','뒤로');}
 const close=dialog.requestClose.bind(dialog);
 dialog.requestClose=discard=>{
  if(discard){view.expansion?.cancel();view.closing=true;expireMemberQr(view);return close(true);}
  if(view.closing)return view.closePromise||Promise.resolve(true);
  if(dialog.isSaving())return close();
  view.closing=true;expireMemberQr(view);
  view.closePromise=animateMemberExpansion(view,false).then(()=>close());
  return view.closePromise;
 };
 refreshIcons();void animateMemberExpansion(view,true);
 const hidden=()=>{if(document.hidden&&(view.qr||view.issuing))expireMemberQr(view);};
 const leave=()=>{if(view.qr||view.issuing)expireMemberQr(view);};
 document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
 view.cleanup=()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);};
 view.revealCleanup=bindCouponReveal(dialog.querySelector('[data-coupon-reveal]'),event=>{
  view.pointerReveal=Boolean(event?.type?.startsWith('pointer')||event?.detail>0);
  return partnerAction(ctx,'partner-reveal');
 });
 return dialog;
}
export async function partnerAction(ctx,action){
 const view=ctx.state.memberPartner;if(!view||!memberCurrent(ctx,view))return;
 if(action==='partner-reveal'){
  if(view.revealed)return;
  view.revealed=true;view.revealCleanup?.();view.revealCleanup=null;
  view.dialog.classList.add('is-coupon-revealed');
  view.dialog.querySelector('.partner-benefits-copy')?.setAttribute('aria-hidden','true');
  view.dialog.querySelector('.partner-intro-copy')?.setAttribute('aria-hidden','true');
  paintMember(ctx,view);const loadingFocus=document.activeElement;await loadCoupons(ctx,view);
  if(memberCurrent(ctx,view)&&(document.activeElement===loadingFocus||document.activeElement===document.body)){
   const card=view.dialog.querySelector('[data-coupon-interactive]');
   if(!view.pointerReveal)card?.focus?.({preventScroll:true});
   card?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});
  }
  return;
 }
 if(!view.revealed)return;
 if(action==='partner-refresh'){expireMemberQr(view);view.expired=false;view.qrError='';return loadCoupons(ctx,view);}
 if(action!=='partner-qr'||view.issuing||view.qr||!canIssueQr(view))return;
 view.expired=false;view.issuing=true;view.qrError='';syncMemberQr(view);const generation=++view.generation,started=monotonic();
 try{
  const issued=await ctx.api('issueCouponQr',{sessionKey:view.sessionKey});
  if(!memberCurrent(ctx,view)||generation!==view.generation||document.hidden)return;
  if(!TOKEN.test(issued.token||''))throw new Error('QR을 만들지 못했습니다. 다시 시도해 주세요.');
  const deadline=monotonic()+qrLifetime(issued,started);
  if(deadline<=monotonic()){expireMemberQr(view);return;}
  const image=await QRCode.toDataURL(location.origin+'/partners/feelingfine#qr='+issued.token,{errorCorrectionLevel:'M',margin:4,width:280,color:{dark:'#111111',light:'#ffffff'}});
  if(!memberCurrent(ctx,view)||generation!==view.generation||document.hidden)return;
  if(deadline<=monotonic()){expireMemberQr(view);return;}
  view.issuing=false;view.qr={image,deadline};syncMemberQr(view);watchMemberQr(ctx,view);
  if(view.qr&&memberCurrent(ctx,view))view.dialog.querySelector('[data-coupon-interactive]')?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});
 }catch(error){
  if(!memberCurrent(ctx,view)||generation!==view.generation)return;
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);await view.dialog.requestClose(true);await ctx.render();return;}
  view.issuing=false;view.qrError=error.message||'QR을 만들지 못했습니다.';syncMemberQr(view);
 }
}

function merchantView(ctx){return ctx.state.feelingfineMerchant??={token:'',preview:null,result:null,error:'',request:null,pending:false,sessionKey:'',history:null,nextCursor:null,edit:null,notice:''};}
function clearMerchantHistory(view){view.history=null;view.nextCursor=null;view.edit=null;view.notice='';}
function captureQr(view){
 const hash=location.hash||'';if(!hash)return;
 const token=/^#qr=([a-f0-9]{64})$/.exec(hash)?.[1]||'';
 history.replaceState(history.state,'',location.pathname+location.search);
 stop(view);clearCouponMotion(view);clearMerchantHistory(view);view.token=token;view.preview=null;view.result=null;view.stampAngles=[];view.pending=false;view.error=token?'':'올바른 적립 QR이 아닙니다. 부원에게 새 QR을 요청해 주세요.';
}
function merchantCurrent(ctx,view,sessionKey,request){return !document.hidden&&isMerchantRoute()&&ctx.state.feelingfineMerchant===view&&getMerchantSessionKey(ctx)===sessionKey&&(!request||view.request===request);}
function merchantShell(body,authenticated=false){return '<main id="main-content" class="merchant-page"><header><span class="merchant-brand">FEELING FINE</span><h1 id="page-title" tabindex="-1">필링파인 스탬프</h1><p>매장용 적립 화면</p></header>'+body+(authenticated?'<footer>'+button('로그아웃','merchant-logout',{class:'button ghost'})+'</footer>':'')+'</main>';}
function loginHtml(view){return merchantShell('<section class="merchant-panel"><h2>매장 로그인</h2><p>운영진에게 전달받은 매장 코드를 입력해 주세요.</p>'+(view.token?'<p class="merchant-note">로그인 후 스캔한 QR을 확인합니다.</p>':'')+'<form data-form="merchant-login">'+field('code','매장 코드','',{type:'password',required:true,maxLength:null,autocomplete:'off',spellcheck:false})+'<p class="form-error" role="alert">'+esc(view.error)+'</p><button type="submit" class="button full">로그인</button></form><p class="merchant-note">이 기기에서 최대 1년간 로그인 상태가 유지됩니다.</p></section>');}
function merchantTime(at){const value=new Date(at);return Number.isFinite(value.getTime())?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(value):'시간 확인 불가';}
function merchantHistoryHtml(view){
 const rows=(view.history||[]).map(row=>{
  const editing=view.edit?.id===row.id;
  const balance=Number.isInteger(row.currentStampCount)?row.currentStampCount+'개':'확인 불가';
  return '<li class="merchant-history-row"><div class="merchant-history-person"><strong>'+esc(row.memberName||'확인할 수 없는 부원')+'</strong><time datetime="'+esc(row.at)+'">'+esc(merchantTime(row.at))+'</time></div><span class="merchant-history-earned">+'+esc(row.amount??1)+'개 적립</span><div class="merchant-history-balance"><span>현재 <strong>'+esc(balance)+'</strong></span>'+(!editing&&row.adjustable?button('수정','merchant-edit',{id:row.id,class:'button ghost',icon:'pencil',disabled:view.pending}):'')+'</div>'+(editing?'<form class="merchant-adjust-form" data-form="merchant-adjust">'+field('stampCount','현재 스탬프 개수',view.edit.stampCount,{type:'number',required:true,min:0,max:CAPACITY,step:1,inputMode:'numeric',id:'merchant-adjust-count'})+'<p class="merchant-adjust-hint">'+esc(row.memberName)+' 님의 현재 보유 개수를 변경합니다.</p><div class="merchant-adjust-actions">'+button('취소','merchant-edit-cancel',{class:'button secondary',disabled:view.pending})+'<button type="submit" class="button"'+(view.pending?' disabled':'')+'>저장</button></div><p class="form-error" role="alert"></p></form>':'')+'</li>';
 }).join('');
 return '<section class="merchant-panel merchant-dashboard"><div class="merchant-dashboard-heading"><div><p class="merchant-eyebrow">STAMP HISTORY</p><h2>적립 내역</h2></div>'+button('새로고침','merchant-history-refresh',{class:'button ghost',icon:'refresh-cw',disabled:view.pending})+'</div><p class="merchant-dashboard-hint">부원의 QR을 스캔하면 새로 적립할 수 있습니다.</p>'+(view.notice?'<p class="merchant-feedback" role="status">'+esc(view.notice)+'</p>':'')+(view.error?'<p class="form-error" role="alert">'+esc(view.error)+'</p>':'')+(rows?'<ol class="merchant-history-list">'+rows+'</ol>':'<p class="merchant-history-empty">'+(view.history?'아직 적립 내역이 없습니다.':'적립 내역을 불러오지 못했습니다.')+'</p>')+(view.nextCursor?button('이전 내역 더 보기','merchant-history-more',{class:'button secondary full',disabled:view.pending}):'')+'</section>';
}
function merchantHtml(ctx,view){
 let body='';
 if(view.result)body='<section class="merchant-panel merchant-result">'+icon('check')+'<h2>'+(view.result.duplicate?'이미 적립된 QR입니다':'스탬프 '+esc(view.result.amount??1)+'개를 적립했습니다')+'</h2>'+(view.result.memberName?'<p>'+esc(view.result.memberName)+' 님</p>':'')+stampCard(count(view.result.stampCount),view)+button('적립 내역으로','merchant-main',{class:'button full',icon:'house'})+'</section>';
 else if(view.preview){const remaining=CAPACITY-count(view.preview.stampCount);body='<section class="merchant-panel"><p class="merchant-eyebrow">적립할 부원</p><h2>'+esc(view.preview.memberName)+' 님</h2>'+stampCard(count(view.preview.stampCount),view)+(remaining?'<form class="merchant-stamp-form" data-form="merchant-stamp">'+field('amount','이번에 적립할 개수',1,{type:'number',required:true,min:1,max:remaining,step:1,inputMode:'numeric',id:'merchant-stamp-amount'})+'<p class="merchant-quantity-hint">현재 '+count(view.preview.stampCount)+'개 · 최대 '+remaining+'개 추가 가능</p><button type="submit" class="button full"'+(view.pending?' disabled':'')+'>'+icon('plus')+'적립하기</button><p class="form-error" role="alert">'+esc(view.error)+'</p></form>':'<p>스탬프 10개가 모두 채워져 있습니다.</p>')+button('적립 내역으로','merchant-main',{class:'button ghost full',disabled:view.pending})+'</section>';}
 else body=merchantHistoryHtml(view);
 if(merchantCookieUnavailable(ctx))body+='<p class="merchant-note">쿠키를 저장하지 못해 이 화면을 닫으면 다시 로그인해야 할 수 있습니다.</p>';
 return merchantShell(body,true);
}
function clearMerchantQr(view,message='QR을 다시 스캔해 주세요.'){
 stop(view);clearCouponMotion(view);view.token='';view.preview=null;view.result=null;view.stampAngles=[];view.error=message;
}
async function loadMerchantHistory(ctx,view,sessionKey,request,cursor){
 const result=await ctx.api('merchantCouponHistory',{sessionKey,...(cursor?{cursor}:{})});
 if(!merchantCurrent(ctx,view,sessionKey,request)||document.hidden)return false;
 const items=Array.isArray(result.items)?result.items:[];
 if(cursor){const existing=new Set((view.history||[]).map(row=>row.id));view.history=[...(view.history||[]),...items.filter(row=>!existing.has(row.id))];}
 else view.history=items;
 view.nextCursor=result.nextCursor||null;return true;
}
export async function renderMerchant(ctx){
 const view=merchantView(ctx);clearCouponMotion(view);captureQr(view);stop(view);
 const sessionKey=getMerchantSessionKey(ctx);
 if(!sessionKey){view.preview=null;view.result=null;view.sessionKey='';clearMerchantHistory(view);return loginHtml(view);}
 if(view.sessionKey&&view.sessionKey!==sessionKey){view.token='';view.preview=null;view.result=null;view.stampAngles=[];view.error='';clearMerchantHistory(view);}
 view.sessionKey=sessionKey;const request=Symbol();view.request=request;
 try{
  await ctx.api('merchantSession',{sessionKey});
  if(!merchantCurrent(ctx,view,sessionKey,request))return '';
  if(view.token&&!view.result&&!view.pending){
   const token=view.token,preview=await ctx.api('merchantCouponPreview',{sessionKey,token});
   if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return '';
   view.preview=preview;view.error='';
  }
  if(!view.token&&!view.result&&!view.pending&&view.history===null){if(!await loadMerchantHistory(ctx,view,sessionKey,request))return '';}
  if(document.hidden)return '';
  return merchantHtml(ctx,view);
 }catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request))return '';
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);clearMerchantHistory(view);view.sessionKey='';view.token='';view.preview=null;view.result=null;view.error='매장 로그인이 만료되었거나 해제되었습니다. 다시 로그인해 주세요.';return loginHtml(view);}
  clearMerchantQr(view,error.message||'QR을 확인하지 못했습니다. 부원에게 새 QR을 요청해 주세요.');return merchantHtml(ctx,view);
 }
}
export async function merchantSubmit(ctx,form,data,node){
 if(!isMerchantRoute())return;
 if(form==='merchant-stamp')return stampMerchantCoupon(ctx,data.get('amount'));
 if(form==='merchant-adjust')return adjustMerchantBalance(ctx,data.get('stampCount'));
 if(form!=='merchant-login')return;
 const view=merchantView(ctx),request=Symbol(),before=getMerchantSessionKey(ctx);view.request=request;
 const code=String(data.get('code')||'').trim();if(!code)throw new Error('매장 코드를 입력해 주세요.');
 const result=await ctx.api('merchantLogin',{code});
 if(!isMerchantRoute()||ctx.state.feelingfineMerchant!==view||view.request!==request||getMerchantSessionKey(ctx)!==before)return;
 setMerchantSession(ctx,result);view.sessionKey=result.sessionKey;view.error='';node?.reset?.();await ctx.render();
}
export async function merchantAction(ctx,action,id){
 if(!isMerchantRoute())return;
 const view=merchantView(ctx),sessionKey=getMerchantSessionKey(ctx);
 if(action==='merchant-logout'){
  clearMerchantSession(ctx);clearPartnerViews(ctx);
  if(merchantCookieUnavailable(ctx))merchantView(ctx).error='이 기기의 쿠키를 삭제하지 못했습니다. 브라우저 설정에서 이 사이트의 쿠키를 지워 주세요.';
  const logout=sessionKey?ctx.api('merchantLogout',{sessionKey}).catch(()=>false):Promise.resolve(true);
  await ctx.render();if(await logout===false)ctx.toast('이 기기에서 로그아웃했습니다. 연결을 확인하지 못해 서버 로그아웃 여부는 확인할 수 없습니다.');return;
 }
 if(view.pending||!sessionKey||view.sessionKey!==sessionKey)return;
 if(document.hidden){clearMerchantQr(view);clearMerchantHistory(view);return ctx.render();}
 if(action==='merchant-stamp')return stampMerchantCoupon(ctx,1);
 if(action==='merchant-main'){clearMerchantQr(view,'');clearMerchantHistory(view);return ctx.render();}
 if(view.token||view.preview||view.result)return;
 if(action==='merchant-history-refresh'){clearMerchantHistory(view);view.error='';return ctx.render();}
 if(action==='merchant-edit-cancel'){view.edit=null;view.error='';return ctx.render();}
 if(action==='merchant-edit'){
  const row=view.history?.find(item=>item.id===id);if(!row?.adjustable)return;
  view.edit={id:row.id,stampCount:row.currentStampCount,revision:row.revision};view.error='';view.notice='';await ctx.render();
  const input=document.querySelector('#merchant-adjust-count');input?.focus({preventScroll:true});input?.scrollIntoView({block:'nearest',behavior:'auto'});return;
 }
 if(action!=='merchant-history-more'||!view.nextCursor)return;
 const request=Symbol();view.request=request;view.pending=true;view.error='';
 try{await loadMerchantHistory(ctx,view,sessionKey,request,view.nextCursor);}
 catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request))return;
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);clearMerchantQr(view,'다시 로그인해 주세요.');clearMerchantHistory(view);view.sessionKey='';}
  else view.error=error.message||'이전 내역을 불러오지 못했습니다.';
 }
 if(!merchantCurrent(ctx,view,sessionKey,request)&&view.sessionKey)return;
 view.pending=false;await ctx.render();
}
function integerInput(value,min,max){const raw=String(value??'').trim(),number=Number(raw);if(!raw||!Number.isInteger(number)||number<min||number>max)throw new Error('스탬프 개수는 '+min+'~'+max+' 사이의 정수로 입력해 주세요.');return number;}
async function stampMerchantCoupon(ctx,rawAmount){
 const view=merchantView(ctx),sessionKey=getMerchantSessionKey(ctx);
 if(view.pending||!view.preview||!view.token||!sessionKey||view.sessionKey!==sessionKey||count(view.preview.stampCount)>=CAPACITY)return;
 if(document.hidden){clearMerchantQr(view);return ctx.render();}
 const amount=integerInput(rawAmount,1,CAPACITY-count(view.preview.stampCount));
 const token=view.token,request=Symbol();view.request=request;view.pending=true;view.error='';stop(view);
 try{
  const result=await ctx.api('stampCoupon',{sessionKey,token,amount});
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return;
  view.result={...result,amount:result.amount??amount,memberName:result.memberName||view.preview.memberName};view.token='';view.preview=null;view.pending=false;clearMerchantHistory(view);await ctx.render();
 }catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.token!==token)return;
  view.pending=false;
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);clearMerchantHistory(view);view.token='';view.preview=null;view.result=null;view.sessionKey='';view.error='다시 로그인해 주세요.';}
  else clearMerchantQr(view,'적립 결과를 확인하지 못했습니다. 적립 내역에서 현재 개수를 확인한 뒤 다시 시도해 주세요.');
  await ctx.render();
 }
}
async function adjustMerchantBalance(ctx,rawCount){
 const view=merchantView(ctx),sessionKey=getMerchantSessionKey(ctx),edit=view.edit;
 if(view.pending||!edit||!sessionKey||view.sessionKey!==sessionKey||view.token||view.result)return;
 if(document.hidden){clearMerchantQr(view);clearMerchantHistory(view);return ctx.render();}
 const stampCount=integerInput(rawCount,0,CAPACITY),request=Symbol();view.request=request;view.pending=true;view.error='';
 try{
  const result=await ctx.api('adjustMerchantCoupon',{sessionKey,receiptId:edit.id,stampCount,expectedRevision:edit.revision});
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.edit!==edit)return;
  clearMerchantHistory(view);view.notice=String(result.memberName||'부원')+' 님의 스탬프를 '+result.stampCount+'개로 수정했습니다.';view.pending=false;await ctx.render();
 }catch(error){
  if(!merchantCurrent(ctx,view,sessionKey,request)||view.edit!==edit)return;
  view.pending=false;
  if(isMerchantAccessError(error)){clearMerchantSession(ctx);clearMerchantHistory(view);view.sessionKey='';view.error='다시 로그인해 주세요.';}
  else {clearMerchantHistory(view);view.error=error.message||'수정 결과를 확인하지 못했습니다. 현재 개수를 확인한 뒤 다시 시도해 주세요.';}
  await ctx.render();
 }
}
export function clearPartnerViews(ctx){
 disposeMember(ctx);const view=ctx.state.feelingfineMerchant;if(view){stop(view);clearCouponMotion(view);clearMerchantHistory(view);view.cleanup?.();view.request=null;view.token='';view.preview=null;view.result=null;const panel=document.querySelector('.merchant-panel');if(panel)panel.innerHTML='<p>QR을 다시 스캔해 주세요.</p>';delete ctx.state.feelingfineMerchant;}
}
export function mountPartnerViews(ctx){
 if(!isMemberRoute())disposeMember(ctx);
 const view=ctx.state.feelingfineMerchant;
 if(view)clearCouponMotion(view);
 if(!isMerchantRoute()){if(view){stop(view);view.cleanup?.();clearMerchantHistory(view);view.token='';view.preview=null;view.result=null;delete ctx.state.feelingfineMerchant;}return;}
 if(!view)return;stop(view);view.cleanup?.();view.cleanup=null;
 if(!view.sessionKey)return;
 view.couponCleanup=bindCouponMotion(document.querySelector('.merchant-page'));
 const erasePanel=()=>{const panel=document.querySelector('.merchant-panel');if(panel)panel.innerHTML='<p>QR을 다시 스캔해 주세요.</p>';};
 const check=()=>{
  if(ctx.state.feelingfineMerchant!==view||!isMerchantRoute()){stop(view);clearCouponMotion(view);view.cleanup?.();return;}
  if(getMerchantSessionKey(ctx)!==view.sessionKey){clearMerchantQr(view,'로그인 상태가 변경되었습니다. QR을 다시 스캔해 주세요.');clearMerchantHistory(view);view.result=null;view.request=null;erasePanel();view.cleanup?.();void ctx.render();return;}
 };
 const hide=()=>{clearMerchantQr(view);clearMerchantHistory(view);view.result=null;view.request=null;view.pending=false;erasePanel();};
 const visibility=()=>{if(document.hidden)hide();else{check();if(ctx.state.feelingfineMerchant===view)void ctx.render();}};
 const focus=()=>{if(!document.hidden)check();};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);window.addEventListener('pagehide',hide);
 let channel;try{if(window.BroadcastChannel){channel=new window.BroadcastChannel(MERCHANT_SESSION_CHANNEL);channel.onmessage=check;}}catch{}
 view.cleanup=()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',hide);channel?.close();};
 if(!document.hidden){const timer=setInterval(check,1000);timer.unref?.();view.stop=()=>clearInterval(timer);check();}else hide();
}
