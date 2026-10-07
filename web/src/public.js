import { publicHeader as header, publicFooter as footer, publicShell as shell } from './public-shell.js';
import { linkKey } from './share-links.js';
import { renderEventPage, renderApplicationPage, renderLinkError, eventSubmit, eventAction } from './event-pages.js';
import { renderMemberPortal, renderMemberVerificationGate, memberPortalAction, memberPortalSubmit } from './member-portal.js';
import { getMemberSessionKey, isMemberRoute } from './member-session.js';
import { MEMBER_TABS, memberTabForPath, activateMemberTab, activateMemberRequestView } from './member-navigation.js';
import { partnerAction } from './partner-stamps.js';
import privacyContent from './content/privacy.html?raw';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, icon, textBlock, date, empty } from './ui.js';
function home(){
 return header(true)+'<main id="main-content"><section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="hero-kicker">HANYANG COCKTAIL SOCIETY</p><h1 id="hero-title">Martini</h1><p class="hero-description">칵테일을 배우고, 직접 만들고, 함께 나누는<br class="mobile-break"> 한양대학교 ERICA 칵테일 동아리.</p><div class="hero-tags"><span>Cocktail</span><span>Craft</span><span>Community</span></div></div><a class="hero-scroll" href="#club-intro">마티니 알아보기 '+icon('arrow-right')+'</a></section><section class="home-intro" id="club-intro"><div class="section-heading"><span class="eyebrow">마티니의 활동</span><h2>처음 만드는 한 잔부터.</h2></div><p>칵테일에 관심이 있다면 누구나. 재료와 도구를 배우는 교육, 새 학기를 시작하는 총회, 함께 즐기는 모임을 준비합니다.</p></section><section class="home-activities" aria-label="주요 활동"><a href="/activities" data-nav><span class="activity-index">01</span><div><h3>칵테일 교육</h3><p>재료와 도구의 기초부터 직접 만드는 실습까지.</p></div>'+icon('arrow-up-right')+'</a><a href="/activities" data-nav><span class="activity-index">02</span><div><h3>총회와 모임</h3><p>개강총회와 친목 활동으로 부원들을 만납니다.</p></div>'+icon('arrow-up-right')+'</a><a href="/notices" data-nav><span class="activity-index">03</span><div><h3>동아리 소식</h3><p>모집 안내와 동아리의 새로운 소식을 확인하세요.</p></div>'+icon('arrow-up-right')+'</a></section><section class="join-banner"><div><span class="eyebrow">가입 안내</span><h2>이번 학기, 마티니에서 만나요.</h2></div><a href="/join" data-nav class="button">가입 절차 확인 '+icon('arrow-up-right')+'</a></section></main>'+footer();
}
async function publicInfo(ctx){
 if(ctx.state.publicInfo)return ctx.state.publicInfo;
 try{ctx.state.publicInfo=await ctx.api('publicRead');return ctx.state.publicInfo;}
 catch(error){return {settings:null,content:[],unavailable:true};}
}
export async function renderPublic(ctx){
 const path=location.pathname.replace(/\/+$/,'')||'/',parts=path.split('/').filter(Boolean);
 if(path==='/')return home();
 if(isMemberRoute(path)&&!getMemberSessionKey(ctx))return shell(renderMemberVerificationGate(ctx,{returnTo:path}));
 const memberPaths=['/members','/events','/members/events','/members/applications','/members/coupons','/members/more'];
 const memberDetail=parts[0]==='members'&&['events','applications'].includes(parts[1])&&parts.length===3;
 if(memberPaths.includes(path)||memberDetail){
  if(ctx.state.memberRouteSource!==path){
   ctx.state.memberRouteSource=path;
   ctx.state.memberAppTab=memberTabForPath(path);
   delete ctx.state.memberAppScroll;
   delete ctx.state.memberRequestView;
   ctx.state.memberInlineDetail=memberDetail?{kind:parts[1]==='events'?'event':'application',id:parts[2]}:null;
   delete ctx.state.memberScrollTarget;
  }
  const selection=ctx.state.memberInlineDetail,marker='<!--member-inline-detail-->';
  let content=await renderMemberPortal(ctx);
  if(!content)return '';
  if(selection&&content.includes(marker)){
   const sessionKey=getMemberSessionKey(ctx);
   const detail=await (selection.kind==='event'?renderEventPage:renderApplicationPage)(ctx,selection.id,{member:true,embedded:true});
   if(!getMemberSessionKey(ctx))return shell(renderMemberVerificationGate(ctx,{returnTo:path}));
   if(ctx.state.memberInlineDetail!==selection||getMemberSessionKey(ctx)!==sessionKey)return '';
   if(!detail)return '';
   content=content.replace(marker,()=>'<template id="member-detail-content" data-kind="'+esc(selection.kind)+'" data-id="'+esc(selection.id)+'" data-title="'+(selection.kind==='event'?'행사 상세':'신청 상세')+'">'+detail+'</template>');
  }
  return shell(content.replace(marker,''));
 }
 if(['e','r'].includes(parts[0])&&parts.length===1){
  const resolvingUrl=location.href;
  try{const result=await ctx.api('resolveLink',{kind:parts[0],key:linkKey(location.hash)});if(location.href!==resolvingUrl)return '';return parts[0]==='e'?renderEventPage(ctx,result.id):renderApplicationPage(ctx,result.id);}catch(error){return renderLinkError(error,parts[0]==='e'?'event':'receipt');}
 }
 if(parts[0]==='e'&&parts.length===2)return renderEventPage(ctx,parts[1]);
 if(parts[0]==='r'&&parts.length===2)return renderApplicationPage(ctx,parts[1]);
 if(path==='/privacy')return shell('<section class="page-intro"><span class="eyebrow">개인정보</span><h1>개인정보 처리방침</h1></section>'+privacyContent+currentPrivacyNotice()+partnerPrivacyNotice());
 const info=await publicInfo(ctx),conf=info.settings;
 if(info.unavailable&&['/notices','/join'].includes(path))return shell('<section class="page-intro"><h1>안내를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p><a href="'+esc(path)+'" class="button secondary">다시 불러오기</a></section>');
 if(path==='/about')return shell('<section class="page-intro"><span class="eyebrow">동아리 소개</span><h1>한양대학교 ERICA<br>칵테일 동아리, 마티니.</h1><p>'+esc(conf?.intro||'마티니는 함께 칵테일을 배우고 만들어보며 자연스럽게 가까워지는 동아리입니다.')+'</p></section><div class="public-two-col"><section class="panel padded"><h2>처음이어도 괜찮아요.</h2><p>재료와 도구를 알아가는 교육부터 서로의 취향을 나누는 친목 모임까지, 함께 경험하는 시간을 만들어갑니다.</p></section><section class="panel padded"><h2>우리의 공간</h2><p>'+esc(conf?.location||'동아리방에서 교육과 모임을 준비합니다.')+'</p><p>회장단·교육부·집행부·재무부·홍보부가 함께 운영합니다.</p></section></div>');
 if(path==='/activities')return shell('<section class="page-intro"><span class="eyebrow">활동 안내</span><h1>교육과 모임</h1><p>부원 확인 후 행사 목록에서 일정과 자세한 안내를 확인하고 신청할 수 있습니다.<br>공지로 전달받은 기존 행사 신청 링크도 계속 사용할 수 있습니다.</p><a href="/members/events" data-nav class="button">부원 행사 보기 '+icon('arrow-right')+'</a></section><div class="public-two-col"><section class="panel padded">'+icon('martini')+'<h2>칵테일 교육</h2><p>도구와 재료를 익히고 직접 만들어보는 실습. 회차별 자세한 안내는 부원 행사 목록이나 전달받은 신청 링크에서 확인하세요.</p></section><section class="panel padded">'+icon('users-round')+'<h2>총회와 친목 모임</h2><p>새 학기를 함께 시작하고 일상의 이야기를 나누는 시간. 개강총회와 다양한 모임을 준비합니다.</p></section></div><section class="public-records"><h2>활동 이야기</h2>'+contentCards(info.content.filter(c=>c.type==='activity'))+'</section>');
 if(path==='/join'){
  const chat=openChatUrl(conf?.joinUrl);
  return shell('<section class="page-intro"><span class="eyebrow">가입 안내</span><h1>마티니와 함께하기</h1><p>카카오톡 오픈채팅으로 찾아와 주세요.<br>운영진이 가입 방법과 활동을 안내해 드립니다.</p></section><section class="panel padded join-guide"><h2>오픈채팅에서 만나요.</h2><p>궁금한 점도 편하게 물어보세요.</p>'+(chat?'<a class="button" href="'+esc(chat)+'" target="_blank" rel="noopener noreferrer" aria-label="가입 오픈채팅 열기 (새 탭)">가입 오픈채팅 열기 '+icon('arrow-up-right')+'</a>':'<p class="notice-warning" role="status">가입 오픈채팅을 준비 중입니다. 링크가 등록되면 여기에서 바로 연결됩니다.</p>')+'</section>');
 }

 if(path==='/notices')return shell('<section class="page-intro"><span class="eyebrow">동아리 소식</span><h1>공지사항</h1></section>'+contentCards(info.content.filter(c=>c.type==='notice')));
 return shell('<section class="page-intro"><h1>페이지를 찾을 수 없습니다.</h1><a href="/" data-nav class="button">홈으로 돌아가기</a></section>');
}
function contentCards(items){return items.length?'<div class="content-list">'+items.map(c=>'<details class="panel padded"><summary><span>'+esc(c.title)+'</span><small>'+date(c.updatedAt)+'</small></summary>'+textBlock(c.body)+'</details>').join('')+'</div>':empty('아직 공개된 기록이 없습니다','새로운 소식이 등록되면 이곳에서 확인할 수 있습니다.');}
function currentPrivacyNotice(){
 return '<section class="privacy-content" aria-label="부원 라운지 개인정보 추가 안내"><h2>현재 홈페이지의 부원 확인 · 신청 수집 항목</h2><p>앞의 가입·명부 관련 항목은 별도 가입 절차와 운영 명부에 관한 안내입니다. 현재 홈페이지의 부원 확인과 신청 화면에서 받는 정보는 아래와 같습니다.</p><p>부원 확인에는 명부에 등록된 이름·학번만 입력합니다. 연락처는 입력받거나 새 신청에 저장하지 않습니다. 부원 로그인은 쿠키로 7일 동안 유지되며, 쿠키에는 인증용 임의 값과 만료 시간만 저장합니다. 이름·학번은 쿠키에 저장하지 않습니다. 로그아웃하거나 기간이 만료되면 다시 로그인해야 하며, 현재 학기와 명부 상태가 변경되면 다시 확인합니다. 공용 기기에서는 이용 후 로그아웃해 주세요. 확인한 부원은 같은 정보를 다시 입력하지 않고 행사·출입 신청을 접수할 수 있습니다.</p><p>외부인 출입 신청에는 신청 부원의 이름·학번, 방문 날짜와 시작 시간, 외부인 인원 1~3명, 외부인 이름과 방문 사유를 수집합니다. 종료 시간은 입력받지 않습니다. 출입 승인과 동아리방 운영을 위해 사용하며 방문 시작 후 180일을 보관 검토 기준으로 삼습니다. 신청 부원은 외부인에게 이름 수집 목적을 안내해 주세요. 외부인의 연락처·학번·신분증 정보는 입력하지 않습니다.</p><p>이전에 접수된 문의의 이름·학번과 제목·본문은 답변 후 180일을 보관 검토 기준으로 삼습니다. 현재 문의는 카카오톡으로 안내하며 라운지에서는 새 문의를 접수하지 않습니다. 행사 신청에는 명부의 이름·학번 확인 결과와 행사별 질문의 답변, 동의 및 신청·입금·취소 상태를 처리합니다. 가입 안내의 운영진 오픈채팅에서 별도 가입 절차를 안내하며, 부원 라운지는 가입 신청을 접수하지 않습니다. 이전에 접수된 가입 신청은 기존 보관 기준을 유지합니다. 운영진이 보존 기한과 처리 상태를 확인해 정리하며, 보관 안내가 자동 삭제 기능을 의미하지는 않습니다.</p><p>수집에 동의하지 않으면 온라인 신청을 접수할 수 없습니다. 조회·정정·삭제 요청은 운영진 카카오톡 문의 채널로 남길 수 있습니다. 개인 신청 확인 링크는 신청 기록을 열 수 있으므로 본인만 보관해 주세요.</p></section>';
}


function partnerPrivacyNotice(){
 return '<section class="privacy-content"><h2>필링파인 제휴 스탬프</h2><p>제휴 스탬프는 부원 확인 정보와 연결된 식별값, 적립 개수와 처리 이력을 저장합니다. 학기가 바뀌어도 기존 적립은 유지됩니다. 부원이 QR을 표시하고 매장에서 스캔하면, 로그인한 제휴처에 부원 이름과 적립 개수가 표시됩니다. 각 QR은 한 번만 적립할 수 있으며 QR 자체에 이름이나 학번을 넣지 않습니다.</p><p>매장 로그인은 해당 기기의 쿠키로 최대 1년 유지하며, 쿠키에는 임의 인증값과 만료 시각만 저장합니다. 매장 코드 변경·적립 중지·로그아웃·만료 시 서버가 접근을 제한합니다. 보관 기록의 조회·정정·삭제 요청은 운영진 카카오톡으로 문의해 주세요.</p></section>';
}
export async function publicSubmit(ctx,form,data,node){
 if(form.startsWith('member-'))return memberPortalSubmit(ctx,form,data,node);
 return eventSubmit(ctx,form,data);
}
export async function publicAction(ctx,action,id,target){
 if(isMemberRoute()&&!getMemberSessionKey(ctx)&&!['member-verify','member-refresh','public-refresh'].includes(action))return ctx.render();
 if(['member-tab','member-visit','member-request-back'].includes(action)){
  if(action!=='member-tab')id='visits';
  if(!isMemberRoute()||!MEMBER_TABS.some(tab=>tab.id===id))return false;
  const sessionKey=getMemberSessionKey(ctx),path=location.pathname;
  if(!sessionKey)return ctx.render();
  if(ctx.mayLeave&&!await ctx.mayLeave({preserveVisitDraft:true}))return false;
  if(location.pathname!==path)return false;
  if(getMemberSessionKey(ctx)!==sessionKey)return ctx.render();
  const activated=id==='visits'?activateMemberRequestView(ctx,action==='member-visit'?'visit':'menu'):activateMemberTab(ctx,id);
  if(!activated)return false;
  delete ctx.state.memberInlineDetail;delete ctx.state.currentEvent;delete ctx.state.currentReceipt;delete ctx.state.memberScrollTarget;
  return true;
 }
 if(action.startsWith('member-equipment-')){
  const sessionKey=getMemberSessionKey(ctx),path=location.pathname;
  if(ctx.mayLeave&&!await ctx.mayLeave({preserveVisitDraft:true}))return false;
  if(location.pathname!==path||getMemberSessionKey(ctx)!==sessionKey)return false;
  return memberPortalAction(ctx,action,id,target);
 }
 if(action.startsWith('partner-'))return partnerAction(ctx,action,id,target);
 const refreshSelection=['member-refresh','public-refresh'].includes(action)?ctx.state.memberInlineDetail:null;
 if(isMemberRoute()&&['member-refresh','public-refresh','member-request','member-events','member-partners'].includes(action)&&ctx.mayLeave&&!await ctx.mayLeave())return;
 if(refreshSelection&&getMemberSessionKey(ctx))ctx.state.memberInlineDetail={...refreshSelection};
 if(['member-request','member-events','member-partners'].includes(action)){
  delete ctx.state.memberInlineDetail;delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
 }
 if(['member-event-open','member-application-open','member-detail-close'].includes(action)){
  if(ctx.mayLeave&&!await ctx.mayLeave())return;
  if(action==='member-detail-close')delete ctx.state.memberInlineDetail;
  else{
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id||''))throw new Error('상세 정보를 확인할 수 없습니다.');
   ctx.state.memberInlineDetail={kind:action==='member-event-open'?'event':'application',id};
  }
  delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
  delete ctx.state.memberScrollTarget;
  await ctx.render();return;
 }
 if(action.startsWith('member-'))return memberPortalAction(ctx,action,id,target);
 if(action==='public-refresh'){delete ctx.state.publicInfo;await ctx.render();return;}
 return eventAction(ctx,action,id,target);
}
