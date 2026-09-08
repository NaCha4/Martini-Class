import { esc, icon, textBlock, field, badge, button, date, money, label, empty, modal } from './ui.js';
const publicLinks=[['/about','소개'],['/activities','활동'],['/notices','공지'],['/join','가입 안내']];
function header(home=false){
 const links=publicLinks.map(([href,title])=>'<a href="'+href+'" data-nav'+((location.pathname.replace(/\/+$/,'')||'/')===href?' aria-current="page"':'')+'>'+title+'</a>').join('');
 return '<a class="skip-link" href="#main-content">본문으로 건너뛰기</a><header class="public-header '+(home?'over-hero':'')+'"><a class="brand" href="/" data-nav aria-label="마티니 홈"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></a><nav aria-label="홈페이지 메뉴">'+links+'</nav><div class="header-actions"><a class="staff-link" href="/admin" data-nav>'+icon('log-out')+'<span>운영실</span></a><details class="public-mobile-menu"><summary aria-label="홈페이지 메뉴" aria-controls="public-mobile-links">'+icon('menu')+'</summary><nav id="public-mobile-links" aria-label="모바일 홈페이지 메뉴">'+links+'</nav></details></div></header>';
}
function footer(){
 return '<footer class="public-footer"><a href="/" data-nav class="brand"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="130" height="32"></a><span>한양대학교 ERICA 칵테일 동아리</span><div><a href="/privacy" data-nav>개인정보 안내</a><a href="/admin" data-nav>운영실</a></div></footer>';
}
function home(){
 return header(true)+'<main id="main-content"><section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="hero-kicker">HANYANG COCKTAIL SOCIETY</p><h1 id="hero-title">Martini</h1><p class="hero-description">칵테일을 배우고, 직접 만들고, 함께 나누는<br class="mobile-break"> 한양대학교 ERICA 칵테일 동아리.</p><div class="hero-tags"><span>Cocktail</span><span>Craft</span><span>Community</span></div></div><a class="hero-scroll" href="#club-intro">마티니 알아보기 '+icon('arrow-right')+'</a></section><section class="home-intro" id="club-intro"><div class="section-heading"><span class="eyebrow">마티니의 활동</span><h2>처음 만드는 한 잔부터.</h2></div><p>칵테일에 관심이 있다면 누구나. 재료와 도구를 배우는 교육, 새 학기를 시작하는 총회, 함께 즐기는 모임을 준비합니다.</p></section><section class="home-activities" aria-label="주요 활동"><a href="/activities" data-nav><span class="activity-index">01</span><div><h3>칵테일 교육</h3><p>재료와 도구의 기초부터 직접 만드는 실습까지.</p></div>'+icon('arrow-up-right')+'</a><a href="/activities" data-nav><span class="activity-index">02</span><div><h3>총회와 모임</h3><p>개강총회와 친목 활동으로 부원들을 만납니다.</p></div>'+icon('arrow-up-right')+'</a><a href="/notices" data-nav><span class="activity-index">03</span><div><h3>동아리 소식</h3><p>모집 안내와 동아리의 새로운 소식을 확인하세요.</p></div>'+icon('arrow-up-right')+'</a></section><section class="join-banner"><div><span class="eyebrow">가입 안내</span><h2>이번 학기, 마티니에서 만나요.</h2></div><a href="/join" data-nav class="button">가입 절차 확인 '+icon('arrow-up-right')+'</a></section></main>'+footer();
}
function shell(body){
 return header()+'<main id="main-content" class="public-page">'+body+'</main>'+footer();
}
const key=()=>new URLSearchParams(location.hash.slice(1)).get('key')||'';
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function publicInfo(ctx){
 if(ctx.state.publicInfo)return ctx.state.publicInfo;
 try{ctx.state.publicInfo=await ctx.api('publicRead');return ctx.state.publicInfo;}
 catch(error){return {settings:null,content:[],unavailable:true};}
}
export async function renderPublic(ctx){
 const path=location.pathname.replace(/\/+$/,'')||'/',parts=path.split('/').filter(Boolean);
 if(path==='/')return home();
 if(parts[0]==='e'&&parts.length===2)return eventPage(ctx,parts[1]);
 if(parts[0]==='r'&&parts.length===2)return receiptPage(ctx,parts[1]);
 const info=await publicInfo(ctx),conf=info.settings;
 if(info.unavailable&&['/notices','/join','/privacy'].includes(path))return shell('<section class="page-intro"><h1>안내를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p><a href="'+esc(path)+'" class="button secondary">다시 불러오기</a></section>');
 if(path==='/about')return shell('<section class="page-intro"><span class="eyebrow">동아리 소개</span><h1>한양대학교 ERICA<br>칵테일 동아리, 마티니.</h1><p>'+esc(conf?.intro||'마티니는 함께 칵테일을 배우고 만들어보며 자연스럽게 가까워지는 동아리입니다.')+'</p></section><div class="public-two-col"><section class="panel padded"><h2>처음이어도 괜찮아요.</h2><p>재료와 도구를 알아가는 교육부터 서로의 취향을 나누는 친목 모임까지, 함께 경험하는 시간을 만들어갑니다.</p></section><section class="panel padded"><h2>우리의 공간</h2><p>'+esc(conf?.location||'동아리방에서 교육과 모임을 준비합니다.')+'</p><p>회장단·교육부·집행부·총무부·홍보부가 함께 운영합니다.</p></section></div>');
 if(path==='/activities')return shell('<section class="page-intro"><span class="eyebrow">활동 안내</span><h1>교육과 모임</h1><p>교육과 행사 일정은 부원 공지로 안내합니다.<br>전달받은 신청 링크에서 자세한 내용을 확인하고 참여할 수 있습니다.</p></section><div class="public-two-col"><section class="panel padded">'+icon('martini')+'<h2>칵테일 교육</h2><p>도구와 재료를 익히고 직접 만들어보는 실습. 회차별 자세한 안내는 부원에게 전달되는 행사 링크에서 확인할 수 있습니다.</p></section><section class="panel padded">'+icon('users-round')+'<h2>총회와 친목 모임</h2><p>새 학기를 함께 시작하고 일상의 이야기를 나누는 시간. 개강총회와 다양한 모임을 준비합니다.</p></section></div><section class="public-records"><h2>활동 이야기</h2>'+contentCards(info.content.filter(c=>c.type==='activity'))+'</section>');
 if(path==='/join')return shell('<section class="page-intro"><span class="eyebrow">가입 안내</span><h1>마티니와 함께하기</h1><p>칵테일에 대한 관심으로 충분합니다.<br>가입 신청과 회비 확인 후 운영진이 활동 안내를 전해드립니다.</p></section><section class="panel padded join-guide"><ol><li><strong>가입 신청</strong><p>기존 가입 신청서에 정보를 작성해 주세요.</p></li><li><strong>회비 안내 확인</strong><p>총무부가 회비 납부를 확인합니다. 임원도 동일하게 학기 회비를 납부합니다.</p></li><li><strong>함께 활동하기</strong><p>승인이 완료되면 교육과 행사 신청 링크를 안내받습니다.</p></li></ol>'+(conf?.joinUrl?'<a class="button" href="'+esc(conf.joinUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="가입 신청서 열기 (새 탭)">가입 신청서 열기 '+icon('arrow-up-right')+'</a>':'<div class="notice-warning">가입 신청 주소는 운영진에게 문의해 주세요.</div>')+'<p class="help">문의: '+esc(conf?.contact||'동아리 운영진')+'</p></section>');
 if(path==='/privacy')return shell('<section class="page-intro"><span class="eyebrow">개인정보</span><h1>개인정보 안내</h1></section><section class="panel padded">'+textBlock(conf?.privacy||'행사 신청 시 이름·학번·전화번호로 명부와 활동 자격을 확인합니다. 입력한 개인정보와 신청 기록은 한 학기 기준으로 관리합니다. 자세한 처리 안내와 문의처는 운영진에게 확인해 주세요.')+'</section>');
 if(path==='/notices')return shell('<section class="page-intro"><span class="eyebrow">동아리 소식</span><h1>공지사항</h1></section>'+contentCards(info.content.filter(c=>c.type==='notice')));
 if(path==='/events')return shell('<section class="page-intro"><span class="eyebrow">부원 안내</span><h1>행사 신청은 전달받은 링크에서.</h1><p>부원 공지에서 행사 신청 링크를 열어주세요.<br>별도 회원가입이나 로그인 없이 신청할 수 있습니다.</p></section>');
 return shell('<section class="page-intro"><h1>페이지를 찾을 수 없습니다.</h1><a href="/" data-nav class="button">홈으로 돌아가기</a></section>');
}
function contentCards(items){return items.length?'<div class="content-list">'+items.map(c=>'<details class="panel padded"><summary><span>'+esc(c.title)+'</span><small>'+date(c.updatedAt)+'</small></summary>'+textBlock(c.body)+'</details>').join('')+'</div>':empty('아직 공개된 기록이 없습니다','새로운 소식이 등록되면 이곳에서 확인할 수 있습니다.');}

const scheduleDate=value=>value?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value)):'일정 미정';
function linkError(error,kind){
 const invalid=['functions/not-found','functions/invalid-argument'].includes(error.code);
 const title=invalid?(kind==='event'?'행사 링크를 확인해 주세요.':'신청 확인 링크를 확인해 주세요.'):'연결을 확인해 주세요.';
 const message=invalid?(kind==='event'?'전달받은 행사 링크 전체를 다시 열어주세요. 계속 열리지 않으면 운영진에게 새 링크를 요청해 주세요.':'신청 완료 후 받은 개인 확인 링크 전체가 필요합니다. 링크를 잃어버렸다면 운영진에게 재발급을 요청해 주세요.'):error.message;
 return shell('<section class="page-intro"><span class="eyebrow">신청 안내</span><h1>'+title+'</h1><p>'+esc(message)+'</p><div class="receipt-actions">'+button('다시 불러오기','public-refresh',{class:'button secondary'})+'<a data-nav href="/" class="button secondary">홈으로</a></div></section>');
}
async function eventPage(ctx,id){
 const accessKey=key();
 let e;try{e=await ctx.api('eventAccess',{eventId:id,key:accessKey});}catch(error){return linkError(error,'event');}
 if(location.pathname.replace(/\/+$/,'')==='/e/'+id&&key()===accessKey)ctx.state.currentEvent=e;
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
 const applicationForm=canApply?'<form data-form="apply" aria-labelledby="apply-title" aria-describedby="apply-help"><p class="help">별도 로그인 없이 신청할 수 있습니다. <span aria-hidden="true">*</span> 표시는 필수 항목입니다.</p>'+field('name','이름','',{required:true,autocomplete:'name',maxLength:40})+field('studentId','학번','',{required:true,maxLength:30,inputMode:'numeric',autocomplete:'off',spellcheck:false})+field('phone','전화번호','',{type:'tel',required:true,autocomplete:'tel',inputMode:'tel',maxLength:30,hint:'명부에 등록한 번호를 입력해 주세요. 하이픈은 생략해도 됩니다.'})+e.questions.map((q,i)=>field('answer'+i,q,'',{type:'textarea',rows:2,required:true,maxLength:500})).join('')+field('consent','개인정보 수집·이용과 취소 안내를 확인했습니다',false,{type:'checkbox',required:true})+'<a class="privacy-link" href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 안내 보기 (새 탭)</a><p role="alert" class="form-error"></p><button type="submit" class="button full">'+(willWait?'대기 신청하기':'신청하기')+icon('arrow-right')+'</button><p class="help">신청 결과에서 참가 등록·대기 여부를 확인하고, 개인 확인 링크를 꼭 보관해 주세요.</p></form>':'<div class="notice-warning">'+esc(stateNote)+'</div>'+button('신청 상태 새로고침','public-refresh',{class:'button secondary full'});
 return shell('<div class="application-layout"><section class="event-public-detail"><span class="eyebrow">'+esc(label(e.type))+'</span><span class="badge '+esc(statusClass)+'">'+esc(statusText)+'</span><h1>'+esc(e.title)+'</h1><div class="event-facts"><p>'+icon('calendar-days')+'<span>'+scheduleDate(e.startsAt)+'<small>종료 '+scheduleDate(e.endsAt)+'</small></span></p><p>'+icon('map-pin')+'<span>'+esc(e.location)+'</span></p><p>'+icon('wallet')+'<span>'+(e.fee?money(e.fee):'참가비 없음')+'</span></p><p>'+icon('users')+'<span>등록 '+e.registered+' / '+e.capacity+'명'+(e.waitlist?' · 대기 '+e.waiting+'명':'')+'</span></p></div>'+textBlock(e.description)+'<hr><h2>신청과 취소</h2><p class="help">신청 시작 '+scheduleDate(e.opensAt)+'<br>신청 마감 '+scheduleDate(e.closesAt)+'<br>자율 취소 마감 '+scheduleDate(e.cancelUntil)+'</p>'+textBlock(e.policy)+'</section><aside class="apply-card" aria-labelledby="apply-title"><span class="eyebrow">행사 신청</span><h2 id="apply-title">'+(canApply?(willWait?'대기 신청':'참가 신청'):statusText)+'</h2>'+(canApply?'<p class="help" id="apply-help">이번 행사 학기에 활동 중이며 회비 납부가 확인된 부원만 신청할 수 있습니다. 이름·학번·전화번호를 명부와 같게 입력해 주세요.</p>':'')+(canApply&&willWait?'<p class="event-state-note">'+esc(stateNote)+'</p>':'')+applicationForm+'</aside></div>');
}
async function receiptPage(ctx,id){
 const accessKey=key();
 let result;try{result=await ctx.api('receipt',{id,key:accessKey,action:'get'});}catch(error){return linkError(error,'receipt');}
 if(location.pathname.replace(/\/+$/,'')==='/r/'+id&&key()===accessKey)ctx.state.currentReceipt={id,key:accessKey,...result};
 const {application:a,event:e}=result,now=Date.now(),effective=e.status==='cancelled'?'cancelled':a.status;
 const activeEvent=e.status!=='cancelled',offered=activeEvent&&a.status==='offered';
 const showPayment=a.payment!=='none'&&(!['cancelled','expired'].includes(effective)||!['unpaid','requested'].includes(a.payment));
 const canAccept=offered&&Date.parse(a.offerExpiresAt)>now;
 const canCancel=activeEvent&&['registered','waiting'].includes(a.status)&&Date.parse(e.cancelUntil)>now;
 let details='';
 if(effective==='waiting')details+='<p>대기 신청이 접수되었습니다.<br>빈자리가 생기면 접수 순서대로 운영진이 안내합니다. 참가 제안을 받으면 이 페이지에서 기한 안에 수락해 주세요.</p>';
 if(offered)details+=canAccept?'<p><strong>참가 자리가 준비되었습니다.</strong><br>'+scheduleDate(a.offerExpiresAt)+'까지 수락해 주세요. 수락 후 참가 등록이 완료됩니다.</p>':'<p class="event-state-note">참가 제안의 응답 기한이 지났습니다. 참가를 원하시면 운영진에게 문의해 주세요.</p>';
 if(effective==='expired')details+='<p>이 신청은 만료되었습니다. 참가를 원하시면 운영진에게 문의해 주세요.</p>';
 if(activeEvent&&a.status==='registered'&&e.fee){
  if(a.payment==='unpaid')details+='<h3>참가비 납부 안내</h3>'+textBlock(e.paymentInstructions)+'<p>참가비 <strong>'+money(a.fee)+'</strong></p><p class="help">입금을 마친 뒤 아래에서 확인을 요청해 주세요.</p>';
  if(a.payment==='requested')details+='<p>운영진이 입금을 확인 중입니다. 확인이 끝나면 이 페이지에 납부 완료로 표시됩니다.</p>';
  if(a.payment==='paid')details+='<p>참가비 납부가 확인되었습니다.</p>';
 }
 if(a.paidAmount>0)details+='<p>확인한 입금 '+money(a.paidAmount)+(a.refundAmount?' · 확인한 환불 '+money(a.refundAmount):'')+'</p>';
 if(e.status==='cancelled')details+='<p>행사가 취소되었습니다.'+(a.paidAmount>a.refundAmount?' 납부한 참가비는 운영진에게 환불 처리를 확인해 주세요.':'')+'</p>';
 else if(a.status==='cancelled')details+='<p>신청이 취소되었습니다.'+(a.payment==='refund_pending'?' 환불이 완료되면 이 페이지에 반영됩니다.':'')+'</p>';
 if(activeEvent&&['registered','waiting'].includes(a.status))details+='<p class="help">'+(canCancel?'자율 취소 마감 '+scheduleDate(e.cancelUntil):'자율 취소 기한이 지났습니다. 취소가 필요하면 운영진에게 문의해 주세요.')+'</p>';
 const actions=(canAccept?button('참가 자리 수락','receipt-accept'):'')+(a.status==='registered'&&a.payment==='unpaid'&&activeEvent?button('입금 확인 요청','receipt-payment'):'')+(offered?button('참가 자리 거절','receipt-decline',{class:'button secondary'}):'')+(canCancel?button('신청 취소','receipt-cancel',{class:'button secondary'}):'')+button('상태 새로고침','public-refresh',{class:'button secondary',icon:'history'});
 return shell('<section class="receipt-card"><span class="success-mark '+esc(effective)+'">'+icon(['cancelled','expired'].includes(effective)?'circle-x':['waiting','offered'].includes(effective)?'history':'check')+'</span><span class="eyebrow">신청 내역</span><h1>내 신청 확인</h1><h2>'+esc(e.title)+'</h2><div class="receipt-status">'+badge(effective)+(showPayment?badge(a.payment):'')+'</div><p>'+esc(a.name)+'님 · '+scheduleDate(e.startsAt)+'</p><p>'+esc(e.location)+'</p><section class="receipt-link-save" aria-labelledby="receipt-link-title"><h3 id="receipt-link-title">개인 확인 링크를 보관해 주세요.</h3><p>이 링크에서 신청 상태를 확인하고 취소할 수 있습니다. 다른 사람에게 공유하지 마세요.</p>'+button('확인 링크 복사','receipt-copy',{class:'button secondary',icon:'copy'})+'</section><div class="receipt-details">'+details+'</div><div class="receipt-actions">'+actions+'</div>'+(a.policy?'<details class="receipt-policy"><summary>신청 당시 취소 안내</summary>'+textBlock(a.policy)+'</details>':'')+'<p class="help">접수 번호 '+esc(a.sequence)+' · 신청 '+scheduleDate(a.createdAt)+'</p></section>');
}
export async function publicSubmit(ctx,form,f){
 if(form!=='apply')return;
 const e=ctx.state.currentEvent,storageKey='martini-pending-'+e.id;
 ctx.state.pendingApplications??={};
 let pending=ctx.state.pendingApplications[storageKey];
 if(!pending){try{pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}}
 if(!pending||typeof pending.requestId!=='string'||!/^[a-f0-9]{64}$/.test(pending.receiptKey||''))pending={requestId:crypto.randomUUID(),receiptKey:secret()};
 ctx.state.pendingApplications[storageKey]=pending;
 try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}
 let result;
 try{result=await ctx.api('apply',{eventId:e.id,key:key(),name:String(f.get('name')).trim(),studentId:String(f.get('studentId')).trim(),phone:String(f.get('phone')).trim(),answers:e.questions.map((q,i)=>String(f.get('answer'+i)||'').trim()),consent:f.has('consent'),...pending});}
 catch(error){
  if(error.code==='functions/permission-denied')error.message='명부 정보 또는 활동 자격을 확인할 수 없습니다. 이름·학번·전화번호를 다시 확인해 주세요. 정보가 맞다면 운영진에게 이번 학기 활동 상태와 회비 납부 확인을 요청해 주세요.';
  if(error.code==='functions/already-exists')error.message='이미 신청한 행사입니다. 신청할 때 받은 개인 확인 링크에서 내역을 확인해 주세요. 링크를 잃어버렸다면 운영진에게 재발급을 요청해 주세요.';
  throw error;
 }
 try{sessionStorage.removeItem(storageKey);}catch{}
 delete ctx.state.pendingApplications[storageKey];
 await ctx.navigate('/r/'+result.id+'#key='+pending.receiptKey,{discard:true});
}
export async function publicAction(ctx,action){
 if(action==='public-refresh'){delete ctx.state.publicInfo;await ctx.render();return;}
 const r=ctx.state.currentReceipt;
 if(action==='receipt-copy'){
  try{await navigator.clipboard.writeText(location.href);ctx.toast('개인 확인 링크를 복사했습니다. 나만 볼 수 있는 곳에 보관해 주세요.');}
  catch{
   const dialog=modal('개인 확인 링크',field('receiptLink','복사해서 보관할 링크',location.href,{wide:true,readOnly:true,spellcheck:false,hint:'자동 복사를 사용할 수 없습니다. 선택한 주소를 직접 복사해 주세요. 다른 사람에게 공유하지 마세요.'}),null);
   const input=dialog.querySelector('[name=receiptLink]');input.focus();input.select();input.addEventListener('click',()=>input.select());
  }
  return;
 }
 if(!r||!action.startsWith('receipt-'))return;
 const op=action.replace('receipt-',''),messages={cancel:'신청을 취소했습니다.',decline:'참가 자리를 거절했습니다.',accept:'참가 등록이 완료되었습니다.',payment:'입금 확인을 요청했습니다. 운영진이 확인하면 상태가 바뀝니다.'};
 const submit=async()=>{await ctx.api('receipt',{id:r.id,key:r.key,action:op});await ctx.render();ctx.toast(messages[op]||'신청 상태를 반영했습니다.');};
 if(op==='cancel'||op==='decline')return modal(op==='decline'?'참가 자리를 거절할까요?':'신청을 취소할까요?','<p class="wide prose"><strong>'+esc(r.event.title)+'</strong><br>취소 후에는 좌석이 다른 부원에게 돌아갈 수 있습니다. 납부한 참가비는 신청 당시 취소 안내에 따라 운영진이 확인합니다.</p>',submit,{submit:op==='decline'?'참가 자리 거절':'신청 취소',submitClass:'button danger',busyText:'처리 중…'});
 if(op==='payment')return modal('입금을 완료하셨나요?','<p class="wide prose">참가비 <strong>'+money(r.application.fee)+'</strong>를 안내된 계좌로 입금한 뒤 확인을 요청해 주세요.</p>'+field('paymentConfirmed','안내에 따라 입금을 완료했습니다',false,{type:'checkbox',required:true,wide:true}),submit,{submit:'입금 확인 요청',busyText:'요청 중…'});
 return submit();
}
