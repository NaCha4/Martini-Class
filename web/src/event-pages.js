import { shortLink, linkKey } from './share-links.js';
import { publicShell as shell } from './public-shell.js';
import { getMemberSessionKey, getVerifiedMember, clearMemberIdentity, isMemberAccessError, refreshMemberSession } from './member-session.js';
import { renderMemberVerificationGate } from './member-portal.js';
import { memberShell } from './member-navigation.js';
import { esc, icon, textBlock, field, badge, button, money, label, modal } from './ui.js';

const key=()=>linkKey(location.hash);
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
async function applicationScope(payload){
 // Bind retry capabilities to the same access, identity and submitted answers.
 // Persist only this digest, never identity fields or a member session token.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}
const memberReturnTo=()=>location.pathname.replace(/\/+$/,'')||'/members';
const detailShell=(body,member,embedded=false)=>embedded?body.replaceAll('<h1>','<h2>').replaceAll('</h1>','</h2>'):shell(member?memberShell(body):body);
function memberGate(ctx,description){
 return shell(renderMemberVerificationGate(ctx,{returnTo:memberReturnTo(),description}));
}
function memberError(error,kind,embedded=false){
 const application=kind==='application';
 if(embedded)return '<div class="member-inline-message" role="alert"><p>'+esc(error.message||'상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')+'</p>'+button('다시 불러오기','public-refresh',{class:'button secondary'})+'</div>';
 return shell('<section class="member-login-page member-retry-page"><div class="member-login-card member-retry-card"><h1>'+(application?'신청을 확인할 수 없습니다':'행사를 확인할 수 없습니다')+'</h1><p>'+esc(error.message||'잠시 후 다시 시도해 주세요.')+'</p><div class="receipt-actions">'+button('다시 불러오기','public-refresh',{class:'button secondary'})+'<a href="'+(application?'/members/applications':'/members/events')+'" data-nav class="button">'+(application?'내 신청으로':'행사 목록으로')+'</a></div>'+(application?'<p class="help">이전 신청은 신청할 때 받은 개인 확인 링크로 열어 주세요.</p>':'')+'</div></section>');
}
async function requireMemberAgain(ctx,error){
 clearMemberIdentity(ctx);ctx.state.memberVerificationReturnTo=memberReturnTo();
 await ctx.render();
 if(error)error.message='로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.';
}
async function recoverPendingApplication(ctx,event,payload,pending,current){
 let result;
 try{
  const resolved=await ctx.api('resolveLink',{kind:'r',key:pending.receiptKey});
  if(!current())return true;
  result=await ctx.api('receipt',{id:resolved.id,key:pending.receiptKey,action:'get'});
 }catch(error){
  if(!current())return true;
  if(['functions/not-found','functions/invalid-argument'].includes(error.code))return false;
  // A failed lookup is not proof that the prior submission failed.
  throw error;
 }
 if(!current())return true;
 let intendedName=payload.name;
 if(event.memberAccess){
  intendedName=getVerifiedMember(ctx)?.name;
  if(!intendedName){
   try{intendedName=(await ctx.api('memberPortal',{sessionKey:payload.sessionKey})).member?.name;}
   catch(error){if(!current())return true;if(isMemberAccessError(error))await requireMemberAgain(ctx,error);throw error;}
  }
 }
 if(!current())return true;
 const receiptUrl=shortLink('r',pending.receiptKey);
 if(result.application?.eventId===event.id&&result.application?.name===intendedName){
  // Recover the existing private capability; do not claim it as a member record.
  const navigated=await ctx.navigate(receiptUrl,{discard:true});
  if(navigated===true){
   const storageKey='martini-pending-'+event.id;
   try{sessionStorage.removeItem(storageKey);}catch{}
   if(ctx.state.pendingApplications)delete ctx.state.pendingApplications[storageKey];
  }
  ctx.toast('이전에 접수된 신청을 불러왔습니다.');return true;
 }
 modal('이전에 접수된 신청 확인','<p class="wide prose">이 탭에 이전 신청의 확인 정보가 남아 있습니다. 이전 신청을 먼저 확인해 주세요. 공용 기기에서 다른 부원으로 로그인하려면 라운지 상단의 ‘로그아웃’을 선택한 뒤 다시 로그인해 주세요.</p><div class="wide"><a href="'+esc(receiptUrl)+'" data-nav class="button">이전에 접수된 신청 확인</a></div>',null);
 throw new Error('이전에 접수된 신청의 확인 정보를 보존했습니다. 이전 신청을 먼저 확인해 주세요.');
}
const scheduleDate=value=>value?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value)):'일정 미정';
export function renderLinkError(error,kind){
 const invalid=['functions/not-found','functions/invalid-argument'].includes(error.code);
 const title=invalid?(kind==='event'?'행사 링크를 확인해 주세요.':'신청 확인 링크를 확인해 주세요.'):'연결을 확인해 주세요.';
 const message=invalid?(kind==='event'?'전달받은 행사 링크 전체를 다시 열어주세요. 계속 열리지 않으면 운영진에게 새 링크를 요청해 주세요.':'신청 완료 후 받은 개인 확인 링크 전체가 필요합니다. 링크를 잃어버렸다면 운영진에게 재발급을 요청해 주세요.'):error.message;
 return shell('<section class="page-intro"><span class="eyebrow">신청 안내</span><h1>'+title+'</h1><p>'+esc(message)+'</p><div class="receipt-actions">'+button('다시 불러오기','public-refresh',{class:'button secondary'})+'<a data-nav href="/" class="button secondary">홈으로</a></div></section>');
}
export async function renderEventPage(ctx,id,{member=false,embedded=false}={}){
 delete ctx.state.currentEvent;
 const accessKey=key(),accessUrl=location.href;
 const sessionKey=member?getMemberSessionKey(ctx):'';
 const selection=ctx.state.memberInlineDetail;
 const current=()=>location.href===accessUrl&&(!member||getMemberSessionKey(ctx)===sessionKey)&&(!embedded||ctx.state.memberInlineDetail===selection);
 if(member&&!sessionKey)return memberGate(ctx,'등록된 이름과 학번으로 로그인하면 이 행사를 확인할 수 있어요.');
 let e;
 try{e=await ctx.api(member?'memberEventAccess':'eventAccess',{eventId:id,...(member?{sessionKey}:{key:accessKey})});}
 catch(error){
  if(!current())return '';
  if(!member)return renderLinkError(error,'event');
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);return memberGate(ctx,'로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.');}
  return memberError(error,'event',embedded);
 }
 if(!current())return '';
 e.memberAccess=member;e.embedded=embedded;e.inlineSelection=selection;
 e.accessUrl=accessUrl;
 if(location.href===accessUrl&&key()===accessKey)ctx.state.currentEvent=e;
 const now=Date.now(),beforeOpen=Date.parse(e.opensAt)>now,afterClose=Date.parse(e.closesAt)<=now;
 const open=e.status==='open'&&!beforeOpen&&!afterClose,willWait=e.registered>=e.capacity||e.waiting>0;
 const canApply=open&&(!willWait||e.waitlist);
 let statusText=label(e.status),statusClass=e.status,stateNote='';
 if(e.status==='cancelled')stateNote='취소된 행사입니다. 기존 신청과 환불 상태는 개인 확인 링크에서 확인해 주세요.';
 else if(e.status==='completed')stateNote='진행이 끝난 행사입니다.';
 else if(e.status==='draft')stateNote='운영진이 신청을 준비하고 있습니다.';
 else if(e.status==='closed'||afterClose){statusText='모집 마감';statusClass='closed';stateNote='신청이 마감되었습니다. 기존 신청은 개인 확인 링크에서 확인할 수 있습니다.';}
 else if(beforeOpen){statusText='신청 예정';statusClass='planned';stateNote=scheduleDate(e.opensAt)+'부터 신청할 수 있습니다.';}
 else if(willWait&&e.waitlist){statusText='대기 접수 중';statusClass='waiting';stateNote='현재는 대기 신청을 받습니다. 빈자리가 생기면 기존 대기자부터 운영진이 참가를 안내합니다.';}
 else if(willWait){statusText=e.registered>=e.capacity?'정원 마감':'대기자 우선 안내 중';statusClass='closed';stateNote=e.registered>=e.capacity?'신청 정원이 찼습니다. 대기 신청은 받지 않습니다.':'기존 대기자에게 먼저 참가를 안내하고 있습니다. 새로운 신청은 받지 않습니다.';}
 const verifiedMember=member?getVerifiedMember(ctx):null;
 const identity=member?'<div class="member-form-identity">'+icon('shield-check')+'<span>'+(verifiedMember?'<strong>'+esc(verifiedMember.name)+'</strong> 님의 ':'')+'확인된 부원 정보로 신청합니다.</span></div>':field('name','이름','',{required:true,autocomplete:'name',maxLength:40})+field('studentId','학번','',{required:true,maxLength:30,inputMode:'numeric',autocomplete:'off',spellcheck:false});
 const applicationForm=canApply?'<form data-form="apply" aria-labelledby="apply-title">'+identity+e.questions.map((q,i)=>field('answer'+i,q,'',{type:'textarea',rows:2,required:true,maxLength:500})).join('')+field('consent','개인정보 수집·이용과 취소 안내를 확인했습니다',false,{type:'checkbox',required:true})+'<a class="privacy-link" href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 안내 보기 (새 탭)</a><p role="alert" class="form-error"></p><button type="submit" class="button full">'+(willWait?'대기 신청하기':'신청하기')+icon('arrow-right')+'</button></form>':'<div class="notice-warning">'+esc(stateNote)+'</div>'+button('신청 상태 새로고침','public-refresh',{class:'button secondary full'});
 return detailShell((member&&!embedded?'<a class="member-text-link" href="/members/events" data-nav>'+icon('arrow-left')+' 행사 목록</a>':'')+'<div class="application-layout"><section class="event-public-detail"><span class="eyebrow">'+esc(label(e.type))+'</span><span class="badge '+esc(statusClass)+'">'+esc(statusText)+'</span><h1>'+esc(e.title)+'</h1><div class="event-facts"><p>'+icon('calendar-days')+'<span>'+scheduleDate(e.startsAt)+'<small>종료 '+scheduleDate(e.endsAt)+'</small></span></p><p>'+icon('map-pin')+'<span>'+esc(e.location)+'</span></p><p>'+icon('wallet')+'<span>'+(e.fee?money(e.fee):'참가비 없음')+'</span></p><p>'+icon('users')+'<span>등록 '+e.registered+' / '+e.capacity+'명'+(e.waitlist?' · 대기 '+e.waiting+'명':'')+'</span></p></div>'+'<section class="application-description"><h2>활동 안내</h2>'+textBlock(e.description||'별도 준비물 안내가 없습니다.')+'</section><hr><h2>신청과 취소</h2><p class="help">신청 시작 '+scheduleDate(e.opensAt)+'<br>신청 마감 '+scheduleDate(e.closesAt)+'<br>취소 마감 '+scheduleDate(e.cancelUntil)+'</p>'+textBlock(e.policy)+'</section><aside class="apply-card" aria-labelledby="apply-title"><span class="eyebrow">행사 신청</span><h2 id="apply-title">'+(canApply?(willWait?'대기 신청':'참가 신청'):statusText)+'</h2>'+(canApply&&willWait?'<p class="event-state-note">'+esc(stateNote)+'</p>':'')+applicationForm+'</aside></div>',member,embedded);
}
export async function renderApplicationPage(ctx,id,{member=false,embedded=false}={}){
 delete ctx.state.currentReceipt;
 const accessKey=key(),accessUrl=location.href;
 const sessionKey=member?getMemberSessionKey(ctx):'';
 const selection=ctx.state.memberInlineDetail;
 const current=()=>location.href===accessUrl&&(!member||getMemberSessionKey(ctx)===sessionKey)&&(!embedded||ctx.state.memberInlineDetail===selection);
 if(member&&!sessionKey)return memberGate(ctx,'등록된 이름과 학번으로 로그인하면 신청 내역을 확인할 수 있어요.');
 let result;
 try{result=await ctx.api(member?'memberApplication':'receipt',{id,...(member?{sessionKey}:{key:accessKey}),action:'get'});}
 catch(error){
  if(!current())return '';
  if(!member)return renderLinkError(error,'receipt');
  if(isMemberAccessError(error)){clearMemberIdentity(ctx);return memberGate(ctx,'로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.');}
  return memberError(error,'application',embedded);
 }
 if(!current())return '';
 if(member)refreshMemberSession(ctx,result.expiresAt);
 if(key()===accessKey)ctx.state.currentReceipt={id,key:accessKey,memberAccess:member,accessUrl,...result,embedded,inlineSelection:selection};
 const {application:a,event:e}=result,now=Date.now(),effective=e.status==='cancelled'?'cancelled':a.status;
 const activeEvent=e.status!=='cancelled',offered=activeEvent&&a.status==='offered';
 const showPayment=a.payment!=='none'&&(!['cancelled','expired'].includes(effective)||!['unpaid','requested'].includes(a.payment));
 const canAccept=offered&&Date.parse(a.offerExpiresAt)>now;
 const canCancel=activeEvent&&['registered','waiting'].includes(a.status)&&Date.parse(e.cancelUntil)>now;
 let details='';
 if(effective==='waiting')details+='<p>대기 신청이 접수되었습니다.<br>빈자리가 생기면 접수 순서대로 운영진이 안내합니다. 참가 제안을 받으면 이 페이지에서 기한 안에 수락해 주세요.</p>';
 if(offered)details+=canAccept?'<p><strong>참가 자리가 준비되었습니다.</strong><br>'+scheduleDate(a.offerExpiresAt)+'까지 수락해 주세요. 수락 후 참가 등록이 완료됩니다.</p>':'<p class="event-state-note">참가 제안의 응답 기한이 지났습니다. 참가를 원하시면 운영진에게 문의해 주세요.</p>';
 if(effective==='expired')details+='<p>이 신청은 만료되었습니다. 참가를 원하시면 운영진에게 문의해 주세요.</p>';
 if(activeEvent&&a.status==='registered'&&a.fee>0){
  if(e.accountNumber)details+='<section class="receipt-account"><h3>입금 계좌</h3>'+([e.bankName,e.accountHolder].some(Boolean)?'<p class="account-owner">'+[e.bankName,e.accountHolder].filter(Boolean).map(esc).join(' <span aria-hidden="true">|</span> ')+'</p>':'')+'<p class="account-number">'+esc(e.accountNumber)+'</p><p class="account-fee">참가비 <strong>'+money(a.fee)+'</strong></p>'+button('계좌번호 복사','account-copy',{class:'button secondary',icon:'copy'})+'</section>';
  else details+='<p>참가비 <strong>'+money(a.fee)+'</strong></p>';
  if(a.payment==='unpaid')details+='<p class="help">입금을 마친 뒤 아래에서 확인을 요청해 주세요.</p>';
  if(a.payment==='requested')details+='<p>운영진이 입금을 확인 중입니다. 확인이 끝나면 이 페이지에 납부 완료로 표시됩니다.</p>';
  if(a.payment==='paid')details+='<p>참가비 납부가 확인되었습니다.</p>';
 }
 if(a.paidAmount>0)details+='<p>확인한 입금 '+money(a.paidAmount)+(a.refundAmount?' · 확인한 환불 '+money(a.refundAmount):'')+'</p>';
 if(e.status==='cancelled')details+='<p>행사가 취소되었습니다.'+(a.paidAmount>a.refundAmount?' 납부한 참가비는 운영진에게 환불 처리를 확인해 주세요.':'')+'</p>';
 else if(a.status==='cancelled')details+='<p>신청이 취소되었습니다.'+(a.payment==='refund_pending'?' 환불이 완료되면 이 페이지에 반영됩니다.':'')+'</p>';
 if(activeEvent&&['registered','waiting'].includes(a.status))details+='<p class="help">'+(canCancel?'취소 마감 '+scheduleDate(e.cancelUntil):'취소 기한이 지났습니다. 취소가 필요하면 운영진에게 문의해 주세요.')+'</p>';
 const actions=(canAccept?button('참가 자리 수락','receipt-accept'):'')+(a.status==='registered'&&a.payment==='unpaid'&&activeEvent?button('입금 확인 요청','receipt-payment'):'')+(offered?button('참가 자리 거절','receipt-decline',{class:'button secondary'}):'')+(canCancel?button('신청 취소','receipt-cancel',{class:'button secondary'}):'')+button('상태 새로고침','public-refresh',{class:'button secondary',icon:'history'});
 const recovery=member?'<p>내 신청에서 언제든 다시 확인할 수 있어요. 저장한 주소도 로그인 후 열립니다.</p>'+button('신청 페이지 복사','receipt-copy',{class:'button secondary',icon:'copy'}):'<h3 id="receipt-link-title">개인 확인 링크를 보관해 주세요.</h3><p>이 링크에서 신청 상태를 확인하고 취소할 수 있습니다. 다른 사람에게 공유하지 마세요.</p>'+button('확인 링크 복사','receipt-copy',{class:'button secondary',icon:'copy'});
 const savedLink=member?'<details class="receipt-policy member-receipt-recovery"><summary>신청 페이지 보관</summary>'+recovery+'</details>':'<section class="receipt-link-save" aria-labelledby="receipt-link-title">'+recovery+'</section>';
 return detailShell((member&&!embedded?'<a class="member-text-link" href="/members/applications" data-nav>'+icon('arrow-left')+' 내 신청</a>':'')+'<section class="receipt-card"><span class="success-mark '+esc(effective)+'">'+icon(['cancelled','expired'].includes(effective)?'circle-x':['waiting','offered'].includes(effective)?'history':'check')+'</span><span class="eyebrow">신청 내역</span><h1>'+esc(e.title)+'</h1><div class="receipt-status">'+badge(effective)+(showPayment?badge(a.payment):'')+'</div><p>'+esc(a.name)+'님 · '+scheduleDate(e.startsAt)+'</p><p>'+esc(e.location)+'</p>'+(member?'':savedLink)+'<div class="receipt-details">'+details+'</div><div class="receipt-actions">'+actions+'</div>'+(member?savedLink:'')+(a.policy?'<details class="receipt-policy"><summary>취소·환불 안내</summary>'+textBlock(a.policy)+'</details>':'')+'<p class="help">접수 번호 '+esc(a.sequence)+' · 신청 '+scheduleDate(a.createdAt)+'</p></section>',member,embedded);
}
export async function eventSubmit(ctx,form,f){
 if(form!=='apply')return;
 const e=ctx.state.currentEvent;
 if(!e||e.accessUrl!==location.href)throw new Error('행사 정보를 다시 확인해 주세요.');
 const sessionKey=e.memberAccess?getMemberSessionKey(ctx):'';
 if(e.memberAccess&&!sessionKey){await requireMemberAgain(ctx);throw new Error('부원 확인을 마친 뒤 다시 신청해 주세요.');}
 const current=()=>ctx.state.currentEvent===e&&e.accessUrl===location.href&&(!e.memberAccess||getMemberSessionKey(ctx)===sessionKey)&&(!e.embedded||ctx.state.memberInlineDetail===e.inlineSelection);
 const storageKey='martini-pending-'+e.id;
 const payload={eventId:e.id,...(e.memberAccess?{sessionKey}:{key:key(),name:String(f.get('name')||'').trim(),studentId:String(f.get('studentId')||'').trim()}),answers:e.questions.map((q,i)=>String(f.get('answer'+i)||'').trim()),consent:f.has('consent')};
 const accessScope=await applicationScope(payload);
 if(!current())return;
 ctx.state.pendingApplications??={};
 let pending=ctx.state.pendingApplications[storageKey];
 if(!pending){try{pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}}
 const validPending=pending&&typeof pending.requestId==='string'&&/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(pending.receiptKey||'');
 if(validPending&&pending.accessScope!==accessScope&&await recoverPendingApplication(ctx,e,payload,pending,current))return;
 if(!current())return;
 if(!pending||pending.accessScope!==accessScope||typeof pending.requestId!=='string'||!/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(pending.receiptKey||''))pending={requestId:crypto.randomUUID(),receiptKey:secret(),accessScope};
 ctx.state.pendingApplications[storageKey]=pending;
 try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}
 let result;
 try{result=await ctx.api('apply',{...payload,requestId:pending.requestId,receiptKey:pending.receiptKey});}
 catch(error){
  if(!current())return;
  if(e.memberAccess&&isMemberAccessError(error)&&getMemberSessionKey(ctx)===sessionKey)await requireMemberAgain(ctx,error);
  else if(error.code==='functions/permission-denied')error.message='활동 자격을 확인할 수 없습니다. 이름·학번을 다시 확인해 주세요.';
  if(error.code==='functions/already-exists')error.message=e.memberAccess?'이미 신청한 행사입니다. 내 신청에서 신청 상태를 확인해 주세요. 이전 신청은 보관한 개인 확인 링크로 열 수 있습니다.':'이미 신청한 행사입니다. 신청할 때 받은 개인 확인 링크에서 내역을 확인해 주세요. 링크를 잃어버렸다면 운영진에게 재발급을 요청해 주세요.';
  throw error;
 }
 if(!current())return;
 try{sessionStorage.removeItem(storageKey);}catch{}
 delete ctx.state.pendingApplications[storageKey];
 if(e.embedded){
  delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
  ctx.state.memberInlineDetail={kind:'application',id:result.id};ctx.state.memberScrollTarget='member-detail';
  await ctx.render();ctx.toast('신청을 접수했습니다. 아래에서 신청 상태를 확인하세요.');
 }else await ctx.navigate(e.memberAccess?'/members/applications/'+encodeURIComponent(result.id):shortLink('r',pending.receiptKey),{discard:true});
}
export async function eventAction(ctx,action,id,target){
 if(action==='application-jump'){
  const target=document.querySelector('.apply-card input,.apply-card textarea,.apply-card button');
  target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:'auto'});return;
 }
 const r=ctx.state.currentReceipt;
 if(!r||r.accessUrl!==location.href)return;
 const actionSession=r.memberAccess?getMemberSessionKey(ctx):'';
 if(r.memberAccess&&!actionSession){await requireMemberAgain(ctx);return;}
 const current=()=>ctx.state.currentReceipt===r&&r.accessUrl===location.href&&(!r.memberAccess||getMemberSessionKey(ctx)===actionSession)&&(!r.embedded||ctx.state.memberInlineDetail===r.inlineSelection);
 if(action==='account-copy'){
  const number=r?.event?.accountNumber;if(!number)return;
  try{await navigator.clipboard.writeText(number);ctx.toast('계좌번호를 복사했습니다.');}
  catch{const dialog=modal('계좌번호 복사',field('accountCopy','입금 계좌번호',number,{wide:true,readOnly:true,hint:'계좌번호를 선택해 직접 복사해 주세요.'}),null);const input=dialog.querySelector('[name=accountCopy]');input.focus();input.select();}
  return;
 }
 if(action==='receipt-copy'){
  if(!r)return;
  const shareUrl=location.origin+(r.memberAccess?'/members/applications/'+encodeURIComponent(r.id):shortLink('r',r.key));
  try{await navigator.clipboard.writeText(shareUrl);ctx.toast(r.memberAccess?'신청 페이지를 복사했습니다. 다시 열 때 부원 확인이 필요합니다.':'개인 확인 링크를 복사했습니다. 나만 볼 수 있는 곳에 보관해 주세요.');}
  catch{
   const dialog=modal(r.memberAccess?'신청 페이지':'개인 확인 링크',field('receiptLink','복사해서 보관할 링크',shareUrl,{wide:true,readOnly:true,spellcheck:false,hint:r.memberAccess?'선택한 주소를 직접 복사해 주세요. 이 신청은 부원 확인 후에 열 수 있습니다.':'자동 복사를 사용할 수 없습니다. 선택한 주소를 직접 복사해 주세요. 다른 사람에게 공유하지 마세요.'}),null);
   const input=dialog.querySelector('[name=receiptLink]');input.focus();input.select();input.addEventListener('click',()=>input.select());
  }
  return;
 }
 if(!r||!action.startsWith('receipt-'))return;
 const op=action.replace('receipt-',''),messages={cancel:'신청을 취소했습니다.',decline:'참가 자리를 거절했습니다.',accept:'참가 등록이 완료되었습니다.',payment:'입금 확인을 요청했습니다. 운영진이 확인하면 상태가 바뀝니다.'};
 const submit=async()=>{
  if(!current())return;
  const sessionKey=actionSession;
  if(r.memberAccess&&!sessionKey){await requireMemberAgain(ctx);throw new Error('부원 확인을 마친 뒤 다시 시도해 주세요.');}
  try{await ctx.api(r.memberAccess?'memberApplication':'receipt',{id:r.id,...(r.memberAccess?{sessionKey}:{key:r.key}),action:op});}
  catch(error){if(!current())return;if(r.memberAccess&&isMemberAccessError(error))await requireMemberAgain(ctx,error);throw error;}
  if(!current())return;
  await ctx.render();ctx.toast(messages[op]||'신청 상태를 반영했습니다.');
 };
 if(op==='cancel'||op==='decline')return modal(op==='decline'?'참가 자리를 거절할까요?':'신청을 취소할까요?','<p class="wide prose"><strong>'+esc(r.event.title)+'</strong><br>취소 후에는 좌석이 다른 부원에게 돌아갈 수 있습니다. 납부한 참가비는 취소·환불 안내에 따라 운영진이 확인합니다.</p>',submit,{submit:op==='decline'?'참가 자리 거절':'신청 취소',submitClass:'button danger',busyText:'처리 중…'});
 if(op==='payment')return modal('입금을 완료하셨나요?','<p class="wide prose">참가비 <strong>'+money(r.application.fee)+'</strong>를 안내된 계좌로 입금한 뒤 확인을 요청해 주세요.</p>'+field('paymentConfirmed','안내에 따라 입금을 완료했습니다',false,{type:'checkbox',required:true,wide:true}),submit,{submit:'입금 확인 요청',busyText:'요청 중…'});
 return submit();
}
