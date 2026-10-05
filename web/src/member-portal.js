import './member-portal.css';
import './member-app.css';
import { visitCalendar, visitSchedule } from './visit-calendar.js';
import { esc, icon, field, button, date, label, money, textBlock, modal } from './ui.js';
import { memberState as state, memberStorage as storage, persistMemberStorage as persist, clearMemberIdentity as clearIdentity, validMemberReceipt as validReceipt, getMemberSessionKey, getVerifiedMember, setMemberSession, refreshMemberSession, isMemberAccessError, safeMemberReturnTarget, forgetMemberDevice } from './member-session.js';
import { memberShell, currentMemberTab, activateMemberRequestView } from './member-navigation.js';
import { openMemberPartner } from './partner-stamps.js';
export { getMemberSessionKey } from './member-session.js';

// Keep labels and receipt recovery for requests submitted before online joining closed.
const kinds={visit:'외부인 출입',join:'이전 가입 신청',inquiry:'문의'};
const activeKinds=['visit'];
const statuses={pending:'검토 대기',approved:'승인',rejected:'반려',answered:'답변 완료',cancelled:'취소'};
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
const input=(name,title,value='',options={})=>field(name,title,value,{id:'member-'+name,...options});
const stamp=value=>value&&!Number.isNaN(Date.parse(value))?date(value,true)+' (KST)':'일정 미정';
const shortStamp=value=>value&&!Number.isNaN(Date.parse(value))?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(new Date(value)):'일정 미정';
function requestStatus(request){const title=request.status==='pending'?(request.kind==='inquiry'?'답변 대기':'승인 대기'):statuses[request.status]||'상태 확인 중';return '<span class="member-status '+esc(request.status)+'">'+esc(title)+'</span>';}
function requestTitle(request){return request.kind==='visit'?request.purpose:request.kind==='inquiry'?request.subject:'동아리 가입 신청';}
function requestSummary(request){return request.kind==='visit'?shortStamp(request.startsAt)+' · '+Number(request.guestCount||0)+'명':shortStamp(request.createdAt)+' 접수';}
function allRequests(ctx){const view=state(ctx),rows=new Map();for(const row of [...view.receiptRows,...view.requests])if(row?.id)rows.set(row.id,row);return [...rows.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
function findRequest(ctx,id){return allRequests(ctx).find(row=>row.id===id);}
function receiptFor(ctx,id){return storage(ctx).receipts.find(item=>item.id===id);}
function identityFields(){return input('name','이름','',{required:true,maxLength:40,autocomplete:'name'})+input('studentId','학번','',{required:true,maxLength:30,inputMode:'numeric',autocomplete:'off',spellcheck:false});}
function consent(){
 const description='이름·학번, 방문 일정·목적과 외부인 이름을 출입 승인 및 안전한 공간 운영을 위해 수집합니다. 외부인의 연락처나 신분증 정보는 적지 마세요.';
 return '<div class="member-consent-note wide"><h3>개인정보 수집·이용 안내</h3><p>'+description+' 동의하지 않으면 이 신청을 접수할 수 없습니다. 보관 기간과 삭제 요청 방법은 개인정보 안내에서 확인할 수 있습니다.</p><a href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 안내 보기 (새 탭) '+icon('arrow-up-right')+'</a></div>'+input('consent','개인정보 수집·이용에 동의합니다',false,{required:true,type:'checkbox',wide:true});
}
function verifiedNote(ctx){const member=state(ctx).member;return member?'<div class="member-form-identity wide">'+icon('shield-check')+'<span><strong>'+esc(member.name)+'</strong> 님의 부원 정보로 접수합니다.</span></div>':'';}
function guestCountChoices(){
 return '<fieldset class="visit-guest-count" aria-describedby="member-guestCount-hint"><legend>외부인 인원 <b aria-label="필수">*</b></legend><div class="visit-guest-options">'+[1,2,3].map(count=>'<label class="visit-guest-option"><input class="sr-only" type="radio" name="guestCount" value="'+count+'" required'+(count===1?' checked':'')+'><span>'+count+'명</span></label>').join('')+'</div><small id="member-guestCount-hint">신청한 부원 제외 · 최대 3명</small></fieldset>';
}
function visitBody(ctx){
 return '<p class="member-form-intro wide">날짜를 고르고, 인원과 방문 사유를 알려 주세요.</p><div class="visit-layout wide">'+visitCalendar()+'<section class="visit-details" aria-labelledby="visit-details-title"><h3 id="visit-details-title">방문 내용</h3>'+verifiedNote(ctx)+'<div class="visit-time-fields">'+input('startTime','시작 시간','',{required:true,type:'time'})+'</div>'+guestCountChoices()+input('purpose','방문 사유','',{required:true,type:'textarea',rows:3,maxLength:1000,placeholder:'예: 친구와 함께 칵테일 연습을 하려고 합니다.'})+input('guestNames','외부인 이름','',{required:true,type:'textarea',rows:2,maxLength:300,placeholder:'방문자 전원의 이름을 쉼표로 구분해 주세요.'})+'</section></div>'+consent('visit');
}
function openVisitTab(ctx){
 if(activateMemberRequestView(ctx,'visit'))return true;
 ctx.state.memberAppTab='visits';ctx.state.memberRequestView='visit';return ctx.render();
}
export function renderMemberVerificationGate(ctx,{returnTo,title='부원 로그인',description='부원 명단에 등록된 이름과 학번으로 로그인해 주세요.',message=''}={}){
 const path=safeMemberReturnTarget(returnTo||location.pathname);ctx.state.memberVerificationReturnTo=path;
 return '<section class="member-login-page"><div class="member-login-card"><h1 id="page-title" tabindex="-1">'+esc(title)+'</h1><p class="member-login-description">'+esc(description)+'</p>'+(message?'<p class="member-login-message" role="status">'+esc(message)+'</p>':'')+'<form data-form="member-login"><input type="hidden" name="returnTo" value="'+esc(path)+'">'+identityFields()+'<p class="form-error" role="alert"></p><button type="submit" class="button full">로그인</button></form><p class="member-login-help">로그인은 7일간 유지됩니다. 공용 기기에서는 이용 후 로그아웃해 주세요.</p><a href="/" data-nav class="member-login-back">'+icon('arrow-left')+' 홈페이지로 돌아가기</a></div></section>';
}
function portalUnavailable(){
 return '<section class="member-login-page member-retry-page"><div class="member-login-card member-retry-card">'+icon('circle-x')+'<h1 id="page-title" tabindex="-1">로그인 상태를 확인하지 못했습니다</h1><p class="member-login-description">잠시 후 다시 시도해 주세요.</p>'+button('다시 불러오기','member-refresh',{class:'button full',icon:'refresh-cw'})+'<a href="/" data-nav class="member-login-back">'+icon('arrow-left')+' 홈페이지로 돌아가기</a></div></section>';
}
export function openMemberVerification(ctx,{returnTo,continueToVisit=false}={}){
 const target=safeMemberReturnTarget(returnTo||ctx.state.memberVerificationReturnTo||location.pathname);
 const dialog=modal('부원 로그인','<p class="member-form-intro wide">부원 명단에 등록된 이름과 학번으로 로그인해 주세요.</p>'+identityFields()+'<p class="member-form-note wide">로그인은 7일간 유지됩니다. 공용 기기에서는 이용 후 로그아웃해 주세요.</p>',async(data,node)=>{
  if(!await memberPortalSubmit(ctx,'member-verify',data,node))return;
  dialog.addEventListener('close',()=>setTimeout(async()=>{
   try{
    delete ctx.state.memberVerificationReturnTo;
    if(location.pathname!==target)await ctx.navigate(target,{discard:true});else await ctx.render();
    if(continueToVisit&&getVerifiedMember(ctx))await openVisitTab(ctx);
   }catch(error){ctx.toast(error.message||'화면을 불러오지 못했습니다. 다시 시도해 주세요.');}
  },0),{once:true});
 },{submit:'로그인',busyText:'로그인 중…'});
 dialog.classList.add('member-dialog');return dialog;
}
const routeSnapshot=()=>[location.href,location.pathname,location.search,location.hash].join('|');
async function loadReceipts(ctx,view,current){
 const pendingEntries=Object.entries(storage(ctx).pending),recoveredRows=[];
 const recovered=await Promise.allSettled(pendingEntries.map(([,pending])=>ctx.api('clubRequestReceipt',{id:pending.requestId,receiptKey:pending.receiptKey})));
 if(!current())return false;
 recovered.forEach((result,index)=>{
  const [kind,pending]=pendingEntries[index];
  if(result.status==='fulfilled'&&result.value.request){
   const saved=storage(ctx);saved.receipts=saved.receipts.filter(item=>item.id!==pending.requestId).concat({id:pending.requestId,receiptKey:pending.receiptKey}).slice(-20);delete saved.pending[kind];recoveredRows.push(result.value.request);view.lastReceiptId=pending.requestId;persist(ctx);
  }else if(result.status==='rejected'&&!['functions/not-found','functions/invalid-argument'].includes(result.reason?.code))view.receiptErrors++;
 });
 const fragment=new URLSearchParams((location.hash||'').slice(1));let linkedRequest=null;
 if(fragment.has('request')||fragment.has('key')){
  const linked={id:fragment.get('request'),receiptKey:fragment.get('key')};
  if(!validReceipt(linked))view.linkError='개인 확인 링크가 올바르지 않습니다. 전달받은 링크 전체를 다시 열어 주세요.';
  else try{
   const result=await ctx.api('clubRequestReceipt',linked);if(!current())return false;
   linkedRequest=result.request;view.linkedId=linked.id;const saved=storage(ctx);saved.receipts=saved.receipts.filter(item=>item.id!==linked.id).concat(linked).slice(-20);persist(ctx);
  }catch(error){if(!current())return false;view.linkError=['functions/not-found','functions/invalid-argument'].includes(error.code)?'신청 내역을 확인할 수 없습니다. 저장한 개인 확인 링크 전체를 다시 확인해 주세요.':'신청 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';}
 }
 const known=new Set([...view.requests.map(row=>row.id),...recoveredRows.map(row=>row.id),...(linkedRequest?[linkedRequest.id]:[])]),receipts=storage(ctx).receipts.filter(item=>!known.has(item.id));
 const fetched=await Promise.allSettled(receipts.map(item=>ctx.api('clubRequestReceipt',item)));
 if(!current())return false;
 view.receiptRows=linkedRequest?[...recoveredRows,linkedRequest]:recoveredRows;
 fetched.forEach(result=>{if(result.status==='fulfilled'&&result.value.request)view.receiptRows.push(result.value.request);else view.receiptErrors++;});
 return true;
}
async function loadPortal(ctx){
 const view=state(ctx),sessionKey=getMemberSessionKey(ctx),route=routeSnapshot();
 if(!sessionKey)return {status:'login'};
 const attempt=(view.portalLoad||0)+1;view.portalLoad=attempt;
 const current=()=>ctx.state.memberLounge===view&&view.portalLoad===attempt&&getMemberSessionKey(ctx)===sessionKey&&routeSnapshot()===route;
 view.error='';view.applicationsError='';view.receiptErrors=0;view.linkError='';view.linkedId='';
 let portal;
 try{portal=await ctx.api('memberPortal',{sessionKey});}
 catch(error){
  if(!current())return {status:'stale'};
  if(isMemberAccessError(error)){clearIdentity(ctx);return {status:'login',message:'로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.'};}
  return {status:'unavailable'};
 }
 if(!current())return {status:'stale'};
 if(!portal.member||typeof portal.member.name!=='string'){clearIdentity(ctx);return {status:'login',message:'부원 정보를 확인할 수 없습니다. 다시 로그인해 주세요.'};}
 view.member=portal.member;view.events=(portal.events||[]).filter(event=>event.memberVisible!==false);view.requests=portal.requests||[];refreshMemberSession(ctx,portal.expiresAt);
 if(!current())return {status:'stale'};
 try{
  const result=await ctx.api('memberApplications',{sessionKey});
  if(!current())return {status:'stale'};
  view.applications=(result.applications||[]).filter(row=>row.event?.memberVisible!==false);refreshMemberSession(ctx,result.expiresAt);
 }catch(error){
  if(!current())return {status:'stale'};
  if(isMemberAccessError(error)){clearIdentity(ctx);return {status:'login',message:'로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.'};}
  view.applications=[];view.applicationsError='행사 신청 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
 }
 if(!current())return {status:'stale'};
 if(!await loadReceipts(ctx,view,current))return {status:'stale'};
 if(!current())return {status:'stale'};
 view.loaded=true;return {status:'ok'};
}
function currentEvent(event){return !['draft','cancelled','completed'].includes(event.status)&&(!event.endsAt||Date.parse(event.endsAt)>=Date.now());}
function eventCards(ctx,{past=false}={}){
 const view=state(ctx);
 const events=view.events.filter(event=>event.status!=='draft'&&(past?!currentEvent(event):currentEvent(event))).sort((a,b)=>(past?-1:1)*String(a.startsAt).localeCompare(String(b.startsAt)));
 if(!events.length)return past?'':'<p class="member-quiet-empty">예정된 행사가 없습니다.</p>';
 return '<div class="member-events">'+events.map(event=>{
  const when=event.startsAt&&!Number.isNaN(Date.parse(event.startsAt))?new Date(event.startsAt):null;
  const month=when?new Intl.DateTimeFormat('ko-KR',{month:'short',timeZone:'Asia/Seoul'}).format(when):'예정',day=when?new Intl.DateTimeFormat('ko-KR',{day:'numeric',timeZone:'Asia/Seoul'}).format(when).replace('일',''):'—';
  const closed=event.status==='closed'||Date.parse(event.closesAt)<=Date.now(),upcoming=Date.parse(event.opensAt)>Date.now();
  const status=past?(event.status==='cancelled'?'행사 취소':'종료'):closed?'모집 마감':upcoming?'신청 예정':'신청 가능';
  return '<button type="button" class="member-event" data-action="member-event-open" data-id="'+esc(event.id||event.eventId)+'"><span class="member-event-date"><span>'+esc(month)+'</span><strong>'+esc(day)+'</strong></span><span class="member-event-copy"><span class="member-event-meta"><span>'+esc(label(event.type))+'</span><span class="member-status '+(past||closed?'cancelled':upcoming?'pending':'approved')+'">'+status+'</span></span><strong class="member-event-title'+(closed?' is-closed':'')+'">'+esc(event.title)+'</strong><span class="member-event-summary">'+esc(shortStamp(event.startsAt))+' · '+esc(event.location||'장소 미정')+'</span><small>'+(event.fee?money(event.fee):'무료')+'</small></span>'+icon('arrow-right')+'</button>';
 }).join('')+'</div>';
}
export function renderMemberEventChoices(ctx){
 const past=state(ctx).events.some(event=>event.status!=='draft'&&!currentEvent(event));
 return eventCards(ctx)+(past?'<div class="member-past-history"><h3>지난 행사</h3>'+eventCards(ctx,{past:true})+'</div>':'');
}
function currentRequest(request){
 if(request.kind==='visit')return ['pending','approved'].includes(request.status)&&(!request.startsAt||Date.parse(request.endsAt||request.startsAt)>=Date.now());
 return request.status==='pending';
}
function requestRow(request){return '<button type="button" class="member-request-row" data-action="member-request" data-id="'+esc(request.id)+'"><span class="member-request-icon">'+icon(request.kind==='visit'?'door-open':request.kind==='join'?'user-plus':'notebook-pen')+'</span><span class="member-request-content"><span class="member-request-kind">'+esc(kinds[request.kind]||'신청')+'</span><strong>'+esc(requestTitle(request)||kinds[request.kind])+'</strong><small>'+esc(requestSummary(request))+'</small></span>'+requestStatus(request)+icon('arrow-right')+'</button>';}
function connectionMessage(message){return message?'<div class="member-connection-note" role="alert">'+icon('circle-x')+'<p>'+esc(message)+'</p>'+button('다시 불러오기','member-refresh',{class:'button secondary small'})+'</div>':'';}
function receiptMessages(ctx,{legacy=false}={}){
 const view=state(ctx);
 const linked=findRequest(ctx,view.linkedId),last=findRequest(ctx,view.lastReceiptId);
 let output=!legacy&&view.linkError?connectionMessage(view.linkError):linked&&(legacy?linked.kind!=='visit':linked.kind==='visit')?'<div class="member-receipt-banner" role="status">'+icon('shield-check')+'<p>신청 내역을 불러왔습니다.</p>'+button('내역 보기','member-request',{id:view.linkedId,class:'button secondary small'})+'</div>':'';
 if(!legacy&&last?.kind==='visit'&&receiptFor(ctx,view.lastReceiptId)&&view.lastReceiptId!==view.linkedId)output+='<div class="member-receipt-banner" role="status">'+icon('check')+'<p>신청 완료. 확인 링크를 보관해 주세요.</p>'+button('확인 링크 복사','member-receipt-copy',{id:view.lastReceiptId,class:'button secondary small',icon:'copy'})+'</div>';
 return output;
}
function appIntro(title){return '<h1 class="sr-only" tabindex="-1">'+title+'</h1>';}
function appPanel(id,title,content,activeTab){return '<section class="member-app-panel" id="member-panel-'+id+'" data-member-panel="'+id+'" aria-label="'+title+'" tabindex="-1"'+(activeTab===id?'':' hidden')+'>'+content+'</section>';}
function appEmpty(symbol,message){return '<div class="member-app-empty">'+icon(symbol)+'<p>'+message+'</p></div>';}
function visitsPanel(ctx){
 const visiting=ctx.state.memberRequestView==='visit';
 return '<div id="member-request-menu" data-member-request-view="menu" tabindex="-1" aria-labelledby="member-request-title"'+(visiting?' hidden':'')+'><h1 id="member-request-title" class="sr-only">신청</h1><button type="button" class="member-request-option" data-action="member-visit" aria-controls="member-visit-view"><span class="member-request-option-icon" aria-hidden="true">'+icon('door-open')+'</span><span class="member-request-option-copy"><strong>출입 신청</strong><small>외부인과 함께 동아리방을 방문할 때</small></span>'+icon('arrow-right')+'</button></div>'
  +'<div id="member-visit-view" data-member-request-view="visit" tabindex="-1" aria-labelledby="member-visit-title"'+(visiting?'':' hidden')+'><button type="button" class="member-app-link member-request-back" data-action="member-request-back" aria-controls="member-request-menu">'+icon('arrow-left')+' 신청 목록</button><div class="member-app-intro"><h1 id="member-visit-title">출입 신청</h1><p>방문 일정과 외부인 정보를 입력해 주세요.</p></div><form class="member-visit-form" data-form="member-visit" aria-labelledby="member-visit-title">'+visitBody(ctx)+'<p class="form-error" role="alert"></p><button type="submit" class="button full">출입 승인 요청</button></form></div>';
}
function benefitsPanel(){
 return appIntro('혜택')+'<button type="button" class="member-benefit-feature" data-action="member-partners" aria-haspopup="dialog" aria-label="필링파인 열기"><span class="member-benefit-photo"><img src="/assets/feelingfine-bar-hero.jpg" alt="" loading="lazy"></span><span class="member-benefit-copy"><strong class="member-benefit-title">필링파인</strong><span class="member-benefit-cta" aria-hidden="true">'+icon('arrow-up-right')+'</span></span></button>';
}
function activityPanel(ctx){
 const view=state(ctx),groups={action:[],current:[],past:[]};
 for(const row of view.applications.filter(row=>row.application?.id&&row.event)){
  const group=applicationNeedsAction(row)?'action':currentApplication(row)?'current':'past';
  groups[group].push({at:row.event.startsAt||row.application.createdAt,html:applicationRow(row)});
 }
 for(const row of allRequests(ctx).filter(row=>row.kind==='visit'))groups[currentRequest(row)?'current':'past'].push({at:row.startsAt||row.createdAt,html:requestRow(row)});
 const incomplete=Boolean(view.applicationsError||view.receiptErrors);
 let records='';
 for(const [group,title,emptyMessage] of [['action','확인 필요','확인할 내역이 없습니다.'],['current','진행 중','진행 중인 내역이 없습니다.'],['past','지난 내역','지난 내역이 없습니다.']]){
  const rows=groups[group];
  rows.sort((a,b)=>(group==='past'?-1:1)*String(a.at||'').localeCompare(String(b.at||'')));
  records+='<section class="member-app-section member-status-section" data-member-status="'+group+'" aria-labelledby="member-status-'+group+'"><div class="member-app-section-heading"><h2 id="member-status-'+group+'">'+title+'</h2><span class="member-section-count">'+(!rows.length&&incomplete?'—':rows.length)+'</span></div>'+(rows.length?'<div class="member-record-list">'+rows.map(row=>row.html).join('')+'</div>':appEmpty('clipboard-list',incomplete?'내역을 확인하지 못했습니다.':emptyMessage))+'</section>';
 }
 const errors=connectionMessage(view.applicationsError)+(view.receiptErrors?connectionMessage('일부 신청 내역을 불러오지 못했습니다.'):'');
 return appIntro('내 현황')+receiptMessages(ctx)+receiptMessages(ctx,{legacy:true})+errors+'<div id="member-records">'+records+'</div>';
}
function activeApplication(row){
 const a=row.application,e=row.event;if(!a||!e)return false;
 return !['cancelled','completed'].includes(e.status)&&(!e.endsAt||Date.parse(e.endsAt)>=Date.now())&&!['cancelled','expired'].includes(a.status);
}
function applicationNeedsAction(row){
 const a=row.application;
 return activeApplication(row)&&((a.status==='offered'&&(!a.offerExpiresAt||Date.parse(a.offerExpiresAt)>Date.now()))||(a.status==='registered'&&a.payment==='unpaid'));
}
function currentApplication(row){return activeApplication(row)||row.application?.payment==='refund_pending';}
function applicationRow(row){
  const a=row.application,e=row.event,effective=e.status==='cancelled'?'cancelled':a.status;
  const needsAction=applicationNeedsAction(row);
  const payment=a.payment&&a.payment!=='none'?'<span class="member-status '+esc(a.payment)+'">'+esc(label(a.payment))+'</span>':'';
  return '<button type="button" data-action="member-application-open" data-id="'+esc(a.id)+'" class="member-application-row'+(needsAction?' needs-action':'')+'"><span class="member-request-icon">'+icon('calendar-days')+'</span><span class="member-request-content"><span class="member-request-kind">행사</span><strong>'+esc(e.title)+'</strong><small>'+esc(shortStamp(e.startsAt))+' · '+esc(e.location||'장소 미정')+'</small>'+(needsAction?'<span class="member-application-prompt">'+(a.status==='offered'?'참가 수락':'입금 확인 요청')+icon('arrow-right')+'</span>':'')+'</span>'+(needsAction?'':'<span class="member-application-statuses"><span class="member-status '+esc(effective)+'">'+esc(label(effective))+'</span>'+payment+'</span>')+icon('arrow-right')+'</button>';
}
export async function renderMemberPortal(ctx){
 if(!getMemberSessionKey(ctx))return renderMemberVerificationGate(ctx);
 const loaded=await loadPortal(ctx);
 if(loaded.status==='stale')return '';
 if(loaded.status==='login'||!getMemberSessionKey(ctx))return renderMemberVerificationGate(ctx,{message:loaded.message});
 if(loaded.status!=='ok')return portalUnavailable();
 const view=state(ctx);
 // A private receipt link lands on its history; ordinary tab changes keep that hash intact.
 if((view.linkedId||view.linkError)&&ctx.state.memberAppReceiptHash!==location.hash){ctx.state.memberAppTab='activity';ctx.state.memberAppReceiptHash=location.hash;}
 const activeTab=currentMemberTab(ctx);
 let content=appPanel('activity','내 현황',activityPanel(ctx),activeTab)
  +appPanel('events','행사',appIntro('행사')+renderMemberEventChoices(ctx),activeTab)
  +appPanel('visits','신청',visitsPanel(ctx),activeTab)
  +appPanel('benefits','혜택',benefitsPanel(),activeTab)
  +'<!--member-inline-detail-->';
 if(view.storageUnavailable&&allRequests(ctx).length)content+='<p class="member-history-warning" role="status">브라우저 저장 공간을 사용할 수 없습니다. 새로고침하거나 창을 닫으면 현재 접수 내역의 조회 권한이 사라질 수 있습니다.</p>';
 return memberShell('<div class="member-lounge member-app">'+content+'</div>',{memberName:view.member.name,activeTab});
}
function requestDetail(ctx,request){
 let body='<div class="member-detail-heading wide"><span>'+esc(kinds[request.kind]||'신청')+'</span>'+requestStatus(request)+'</div>';
 if(receiptFor(ctx,request.id))body+='<section class="member-save-receipt wide"><h3>개인 확인 링크를 보관해 주세요</h3><p>다음에 이 링크를 열면 처리 결과와 답변을 확인할 수 있습니다. 신청 정보에 접근할 수 있는 링크이므로 다른 사람에게 공유하지 마세요.</p>'+button('개인 확인 링크 복사','member-receipt-copy',{id:request.id,class:'button secondary full',icon:'copy'})+'</section>';
 if(request.kind==='visit')body+='<dl class="member-detail-facts wide"><div><dt>방문 시작</dt><dd>'+esc(stamp(request.startsAt))+'</dd></div>'+(request.endsAt?'<div><dt>방문 종료</dt><dd>'+esc(stamp(request.endsAt))+'</dd></div>':'')+'<div><dt>외부인</dt><dd>'+Number(request.guestCount||0)+'명 · '+esc(request.guestNames)+'</dd></div></dl><div class="member-detail-section wide"><h3>방문 목적</h3>'+textBlock(request.purpose)+'</div>';
 else if(request.kind==='inquiry')body+='<div class="member-detail-section wide"><h3>'+esc(request.subject)+'</h3>'+textBlock(request.message)+'</div>';
 else body+='<div class="member-detail-section wide"><h3>가입 신청 내용</h3><p>'+esc(request.department||'')+' · '+esc(request.grade||'')+'</p>'+textBlock(request.message)+'</div>';
 if(request.status==='approved')body+='<div class="member-visit-guidance wide"><strong>'+(request.kind==='visit'?'방문이 승인되었습니다.':'가입 신청이 승인되었습니다.')+'</strong><p>'+(request.kind==='visit'?'승인된 날짜와 시간에만 신청한 부원이 외부인과 동행해 주세요. 일정이나 인원이 달라지면 운영진에게 문의해 주세요.':'최종 부원 등록과 회비 등 후속 절차는 운영진 안내를 따라 주세요.')+'</p></div>';
 body+='<div class="member-response wide"><h3>운영진 답변</h3>'+(request.response?textBlock(request.response):'<p>'+(request.status==='pending'?'운영진이 내용을 검토하고 있습니다. 답변이 등록되면 여기에서 확인할 수 있어요.':request.status==='cancelled'?'취소된 신청입니다.':'등록된 답변이 없습니다.')+'</p>')+'</div><p class="member-form-note wide">접수 '+esc(stamp(request.createdAt))+'<br> 접수 번호 '+esc(request.id)+'</p>';
 const cancellable=request.kind==='visit'?['pending','approved'].includes(request.status)&&Date.parse(request.startsAt)>Date.now():request.status==='pending';
 if(cancellable&&receiptFor(ctx,request.id))body+='<div class="wide">'+button('신청 취소','member-cancel',{class:'button secondary',id:request.id})+'</div>';
 else if(cancellable)body+='<p class="member-form-note wide">이 탭에 접수 확인 정보가 없어 상태만 조회할 수 있습니다. 취소가 필요하면 운영진에게 문의해 주세요.</p>';
 const dialog=modal(kinds[request.kind]+' 내역',body,null);dialog.classList.add('member-dialog');return dialog;
}
export async function memberPortalAction(ctx,action,id){
 if(action==='member-verify')return openMemberVerification(ctx);
 if(action==='member-refresh'){await ctx.render();return;}
 if(action==='member-forget'){
  if(ctx.mayLeave&&!await ctx.mayLeave())return;
  const sessionKey=getMemberSessionKey(ctx);
  const revoked=sessionKey?ctx.api('memberLogout',{sessionKey}).then(()=>true,()=>false):Promise.resolve(true);
  let removalError;try{forgetMemberDevice(ctx);}catch(error){removalError=error;}
  await ctx.navigate('/members',{replace:true,discard:true});
  const serverCleared=await revoked;
  ctx.toast(removalError?.message||(serverCleared?'로그아웃했습니다.':'이 기기에서 로그아웃했습니다. 서버 연결이 끊겨 인증 해제를 확인하지 못했습니다.'));return;
 }
 if(!getMemberSessionKey(ctx))return ctx.render();
 if(action==='member-visit')return getVerifiedMember(ctx)?openVisitTab(ctx):ctx.render();
 if(action==='member-events'){
  if(!getVerifiedMember(ctx))return ctx.render();
  const dialog=modal('행사','<div class="wide member-event-picker">'+renderMemberEventChoices(ctx)+'</div>',null,{wide:true});
  dialog.classList.add('member-dialog','member-events-dialog');return dialog;
 }
 if(action==='member-partners'){
  if(!getVerifiedMember(ctx))return ctx.render();
  return openMemberPartner(ctx);
 }
 if(action==='member-receipt-copy'){
  const receipt=receiptFor(ctx,id);if(!receipt)throw new Error('이 탭의 접수 확인 정보가 없습니다.');
  const url=location.origin+'/members#request='+encodeURIComponent(receipt.id)+'&key='+encodeURIComponent(receipt.receiptKey);
  try{await navigator.clipboard.writeText(url);ctx.toast('개인 확인 링크를 복사했습니다. 나만 볼 수 있는 곳에 보관해 주세요.');}
  catch{const dialog=modal('개인 확인 링크',input('receiptLink','복사해서 보관할 링크',url,{readOnly:true,wide:true,spellcheck:false,hint:'주소 전체를 선택해 직접 복사해 주세요. 다른 사람에게 공유하지 마세요.'}),null);const node=dialog.querySelector('[name=receiptLink]');node.focus();node.select();}
  return;
 }
 if(action==='member-request'){
  const view=state(ctx),route=routeSnapshot(),sessionKey=getMemberSessionKey(ctx),stored=receiptFor(ctx,id),generation=ctx.state.memberAppGeneration||0;
  const current=()=>ctx.state.memberLounge===view&&getMemberSessionKey(ctx)===sessionKey&&routeSnapshot()===route&&(ctx.state.memberAppGeneration||0)===generation;
  let portal,request;
  try{portal=await ctx.api('memberPortal',{sessionKey});}
  catch(error){
   if(!current())return;
   if(isMemberAccessError(error)){clearIdentity(ctx);ctx.toast('로그인이 만료되었습니다. 다시 로그인해 주세요.');return ctx.render();}
   throw new Error('신청 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if(!current())return;
  view.member=portal.member;view.requests=portal.requests||[];refreshMemberSession(ctx,portal.expiresAt);
  if(!current())return;
  if(stored){const result=await ctx.api('clubRequestReceipt',stored);if(!current())return;request=result.request;view.receiptRows=view.receiptRows.filter(row=>row.id!==id).concat(request?[request]:[]);}
  else request=view.requests.find(row=>row.id===id);
  if(!current())return;
  if(!request)throw new Error('신청 내역을 찾을 수 없습니다. 새로고침 후 다시 확인해 주세요.');
  return requestDetail(ctx,request);
 }
 if(action==='member-cancel'){
  const receipt=receiptFor(ctx,id),request=findRequest(ctx,id);if(!receipt||!request)throw new Error('이 탭의 접수 확인 정보가 없습니다. 운영진에게 취소를 문의해 주세요.');
  const view=state(ctx),sessionKey=getMemberSessionKey(ctx),route=routeSnapshot();
  return modal('신청을 취소할까요?','<p class="member-form-intro wide"><strong>'+esc(requestTitle(request)||kinds[request.kind])+'</strong><br> 취소한 신청은 되돌릴 수 없습니다. 다시 신청하려면 새 신청서를 작성해 주세요.</p>',async()=>{await ctx.api('cancelClubRequest',receipt);if(ctx.state.memberLounge!==view||getMemberSessionKey(ctx)!==sessionKey||routeSnapshot()!==route)return;await ctx.render();ctx.toast('신청을 취소했습니다.');},{submit:'신청 취소',submitClass:'button danger',busyText:'취소 중…'});
 }
}
function required(data,name,title,max){const value=String(data.get(name)||'').trim();if(!value)throw new Error(title+'을(를) 입력해 주세요.');if(value.length>max)throw new Error(title+'은(는) '+max+'자 이하로 입력해 주세요.');return value;}
function identity(data){return {name:required(data,'name','이름',40),studentId:required(data,'studentId','학번',30)};}
function koreaISO(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('방문 날짜와 시간을 정확히 입력해 주세요.');const result=new Date(value+':00+09:00');if(Number.isNaN(result.getTime()))throw new Error('유효한 방문 날짜와 시간을 입력해 주세요.');return result.toISOString();}
export async function memberPortalSubmit(ctx,form,data,node){
 if(form==='member-login'||form==='member-verify'){
  const view=state(ctx),route=routeSnapshot(),previousSession=getMemberSessionKey(ctx),attempt=(view.loginAttempt||0)+1;
  view.loginAttempt=attempt;
  const current=()=>ctx.state.memberLounge===view&&view.loginAttempt===attempt&&getMemberSessionKey(ctx)===previousSession&&routeSnapshot()===route;
  const target=safeMemberReturnTarget(data.get('returnTo')||ctx.state.memberVerificationReturnTo||location.pathname),sessionKey=secret();let result;
  try{result=await ctx.api('memberAccess',{...identity(data),sessionKey,remember:true});}
  catch(error){if(!current())return;if(isMemberAccessError(error)||['functions/not-found','not-found'].includes(error.code))throw new Error('로그인할 수 없습니다. 부원 명단에 등록된 이름·학번을 확인해 주세요.');throw error;}
  if(!current())return;
  setMemberSession(ctx,{sessionKey,expiresAt:result.expiresAt,member:result.member});
  if(form==='member-login'){
   delete ctx.state.memberVerificationReturnTo;
   const currentPath=location.pathname.replace(/\/+$/,'')||'/';
   if(currentPath!==target)await ctx.navigate(target,{discard:true});
   else await ctx.render();
  }else if(!node?.closest?.('dialog'))await ctx.render();
  ctx.toast(state(ctx).cookieUnavailable?'로그인했습니다. 쿠키를 저장할 수 없어 이 탭에서만 유지됩니다.':'로그인했습니다.');return true;
 }
 const kind=form.replace(/^member-/,'');if(!activeKinds.includes(kind))return;
 if(!data.has('consent'))throw new Error('개인정보 수집·이용 동의를 확인해 주세요.');
 const payload={kind,consent:true},sessionKey=getMemberSessionKey(ctx),view=state(ctx),route=routeSnapshot();
 const current=()=>ctx.state.memberLounge===view&&getMemberSessionKey(ctx)===sessionKey&&routeSnapshot()===route;
 if(!sessionKey)throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  const schedule=visitSchedule(data);
  payload.sessionKey=sessionKey;payload.startsAt=koreaISO(schedule.startsAt);
  if(Date.parse(payload.startsAt)<=Date.now())throw new Error('방문 시작은 현재 시간 이후로 입력해 주세요.');
  if(Date.parse(payload.startsAt)>Date.now()+90*86400000)throw new Error('방문은 현재 이후 90일 이내로 신청해 주세요.');
  payload.guestCount=Number(data.get('guestCount'));if(!Number.isInteger(payload.guestCount)||payload.guestCount<1||payload.guestCount>3)throw new Error('외부인 인원은 1명부터 3명까지 입력해 주세요.');
  payload.guestNames=required(data,'guestNames','외부인 이름',300);payload.purpose=required(data,'purpose','방문 목적',1000);
 const saved=storage(ctx);saved.pending[kind]??={requestId:crypto.randomUUID(),receiptKey:secret()};persist(ctx);
 const pending=saved.pending[kind];let result,recovered=false;
 try{result=await ctx.api('submitClubRequest',{...payload,...pending});}
 catch(error){
  if(!current())return;
  if(isMemberAccessError(error)){clearIdentity(ctx);await ctx.render();ctx.toast('로그인이 만료되었거나 부원 정보가 변경되었습니다. 다시 로그인해 주세요.');return;}
  if(error.code!=='functions/already-exists')throw error;
  try{const receipt=await ctx.api('clubRequestReceipt',{id:pending.requestId,receiptKey:pending.receiptKey});result={id:pending.requestId,request:receipt.request};recovered=true;}catch{if(!current())return;throw error;}
 }
 if(!current())return;
 if(!result.id)throw new Error('접수 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 요청해 주세요.');
 saved.receipts=saved.receipts.filter(item=>item.id!==result.id).concat({id:result.id,receiptKey:pending.receiptKey}).slice(-20);delete saved.pending[kind];persist(ctx);
 state(ctx).lastReceiptId=result.id;
 ctx.state.memberAppTab='activity';
 delete ctx.state.memberRequestView;
 ctx.state.memberAppScroll={...ctx.state.memberAppScroll,activity:0,visits:0};
 if(result.request)state(ctx).receiptRows.push(result.request);
 await ctx.render({focus:true,scroll:0});ctx.toast(recovered?'이전에 접수된 신청을 확인했습니다. 내 현황에서 확인해 주세요.':'출입 승인 요청을 보냈습니다. 내 현황에서 승인 결과를 확인해 주세요.');
}
