import { esc, icon, textBlock, field, badge, button, date, money, label, empty, modal } from './ui.js';
const publicLinks=[['/about','소개'],['/activities','활동'],['/notices','공지'],['/join','가입 안내']];
function header(home=false){
 const links=publicLinks.map(([href,title])=>'<a href="'+href+'" data-nav'+((location.pathname.replace(/\/+$/,'')||'/')===href?' aria-current="page"':'')+'>'+title+'</a>').join('');
 return '<a class="skip-link" href="#main-content">본문으로 건너뛰기</a><header class="public-header '+(home?'over-hero':'')+'"><a class="brand" href="/" data-nav aria-label="마티니 홈"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></a><nav aria-label="홈페이지 메뉴">'+links+'</nav><div class="header-actions"><a class="staff-link" href="/admin" data-nav>'+icon('log-out')+'<span>운영실</span></a><details class="public-mobile-menu"><summary aria-label="메뉴 열기">'+icon('menu')+'</summary><nav aria-label="모바일 홈페이지 메뉴">'+links+'</nav></details></div></header>';
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
 if(parts[0]==='e')return eventPage(ctx,parts[1]);
 if(parts[0]==='r')return receiptPage(ctx,parts[1]);
 const info=await publicInfo(ctx),conf=info.settings;
 if(info.unavailable&&['/notices','/join','/privacy'].includes(path))return shell('<section class="page-intro"><h1>안내를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p><a href="'+esc(path)+'" class="button secondary">다시 불러오기</a></section>');
 if(path==='/about')return shell('<section class="page-intro"><span class="eyebrow">동아리 소개</span><h1>한양대학교 ERICA<br>칵테일 동아리, 마티니.</h1><p>'+esc(conf?.intro||'마티니는 함께 칵테일을 배우고 만들어보며 자연스럽게 가까워지는 동아리입니다.')+'</p></section><div class="public-two-col"><section class="panel padded"><h2>처음이어도 괜찮아요.</h2><p>재료와 도구를 알아가는 교육부터 서로의 취향을 나누는 친목 모임까지, 함께 경험하는 시간을 만들어갑니다.</p></section><section class="panel padded"><h2>우리의 공간</h2><p>'+esc(conf?.location||'동아리방에서 교육과 모임을 준비합니다.')+'</p><p>회장단·교육부·집행부·총무부·홍보부가 함께 운영합니다.</p></section></div>');
 if(path==='/activities')return shell('<section class="page-intro"><span class="eyebrow">활동 안내</span><h1>교육과 모임</h1><p>교육과 행사 일정은 부원 공지로 안내합니다.<br>전달받은 신청 링크에서 자세한 내용을 확인하고 참여할 수 있습니다.</p></section><div class="public-two-col"><section class="panel padded">'+icon('martini')+'<h2>칵테일 교육</h2><p>도구와 재료를 익히고 직접 만들어보는 실습. 회차별 자세한 안내는 부원에게 전달되는 행사 링크에서 확인할 수 있습니다.</p></section><section class="panel padded">'+icon('users-round')+'<h2>총회와 친목 모임</h2><p>새 학기를 함께 시작하고 일상의 이야기를 나누는 시간. 개강총회와 다양한 모임을 준비합니다.</p></section></div><section class="public-records"><h2>활동 이야기</h2>'+contentCards(info.content.filter(c=>c.type==='activity'))+'</section>');
 if(path==='/join')return shell('<section class="page-intro"><span class="eyebrow">가입 안내</span><h1>마티니와 함께하기</h1><p>칵테일에 대한 관심으로 충분합니다.<br>가입 신청과 회비 확인 후 운영진이 활동 안내를 전해드립니다.</p></section><section class="panel padded join-guide"><ol><li><strong>가입 신청</strong><p>기존 가입 신청서에 정보를 작성해 주세요.</p></li><li><strong>회비 안내 확인</strong><p>총무부가 회비 납부를 확인합니다. 임원도 동일하게 학기 회비를 납부합니다.</p></li><li><strong>함께 활동하기</strong><p>승인이 완료되면 교육과 행사 신청 링크를 안내받습니다.</p></li></ol>'+(conf?.joinUrl?'<a class="button" href="'+esc(conf.joinUrl)+'" target="_blank" rel="noopener noreferrer">가입 신청서 열기 '+icon('arrow-up-right')+'</a>':'<div class="notice-warning">가입 신청 주소는 운영진에게 문의해 주세요.</div>')+'<p class="help">문의: '+esc(conf?.contact||'동아리 운영진')+'</p></section>');
 if(path==='/privacy')return shell('<section class="page-intro"><span class="eyebrow">개인정보</span><h1>개인정보 안내</h1></section><section class="panel padded">'+textBlock(conf?.privacy||'행사 신청 시 이름·학번·전화번호로 명부와 활동 자격을 확인합니다. 입력한 개인정보와 신청 기록은 한 학기 기준으로 관리합니다. 자세한 처리 안내와 문의처는 운영진에게 확인해 주세요.')+'</section>');
 if(path==='/notices')return shell('<section class="page-intro"><span class="eyebrow">동아리 소식</span><h1>공지사항</h1></section>'+contentCards(info.content.filter(c=>c.type==='notice')));
 if(path==='/events')return shell('<section class="page-intro"><span class="eyebrow">부원 안내</span><h1>행사 신청은 전달받은 링크에서.</h1><p>부원 공지에서 행사 신청 링크를 열어주세요.<br>별도 회원가입이나 로그인 없이 신청할 수 있습니다.</p></section>');
 return shell('<section class="page-intro"><h1>페이지를 찾을 수 없습니다.</h1><a href="/" data-nav class="button">홈으로 돌아가기</a></section>');
}
function contentCards(items){return items.length?'<div class="content-list">'+items.map(c=>'<details class="panel padded"><summary><span>'+esc(c.title)+'</span><small>'+date(c.updatedAt)+'</small></summary>'+textBlock(c.body)+'</details>').join('')+'</div>':empty('아직 공개된 기록이 없습니다','새로운 소식이 등록되면 이곳에서 확인할 수 있습니다.');}
async function eventPage(ctx,id){
 let e;try{e=await ctx.api('eventAccess',{eventId:id,key:key()});}catch(error){return shell('<section class="page-intro"><span class="eyebrow">신청 안내</span><h1>행사 링크를 확인해 주세요.</h1><p>'+esc(error.message)+'</p><a data-nav href="/" class="button secondary">홈으로</a></section>');}
 ctx.state.currentEvent=e;
 const time=Date.now(),open=e.status==='open'&&Date.parse(e.opensAt)<=time&&Date.parse(e.closesAt)>time,full=e.registered>=e.capacity;
 return shell('<div class="application-layout"><section class="event-public-detail"><span class="eyebrow">'+esc(label(e.type))+'</span>'+badge(e.status)+'<h1>'+esc(e.title)+'</h1><div class="event-facts"><p>'+icon('calendar-days')+'<span>'+date(e.startsAt,true)+'<small>종료 '+date(e.endsAt,true)+'</small></span></p><p>'+icon('map-pin')+'<span>'+esc(e.location)+'</span></p><p>'+icon('wallet')+'<span>'+(e.fee?money(e.fee):'참가비 없음')+'</span></p><p>'+icon('users')+'<span>등록 '+e.registered+' / '+e.capacity+'명'+(e.waitlist?' · 대기 '+e.waiting+'명':'')+'</span></p></div>'+textBlock(e.description)+'<hr><h3>신청과 취소</h3><p class="help">신청 마감 '+date(e.closesAt,true)+'<br>자율 취소 마감 '+date(e.cancelUntil,true)+'</p>'+textBlock(e.policy)+'</section><aside class="apply-card"><span class="eyebrow">행사 신청</span><h2>'+(full?'대기 신청':'참가 신청')+'</h2><p class="help">회비 납부가 확인된 부원만 신청할 수 있습니다. 명부에 등록된 정보를 입력해 주세요.</p>'+(open&&(!full||e.waitlist)?'<form data-form="apply">'+field('name','이름','',{required:true,autocomplete:'name',maxLength:40})+field('studentId','학번','',{required:true,maxLength:30})+field('phone','전화번호','',{type:'tel',required:true,autocomplete:'tel'})+e.questions.map((q,i)=>field('answer'+i,q,'',{required:true,maxLength:500})).join('')+field('consent','신청 정보 수집과 취소 안내를 확인했습니다',false,{type:'checkbox',required:true})+'<a class="privacy-link" href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 안내 보기</a><p role="alert" class="form-error"></p><button type="submit" class="button full">'+(full?'대기 신청하기':'신청하기')+icon('arrow-right')+'</button></form>':'<div class="notice-warning">'+(e.status==='cancelled'?'취소된 행사입니다.':!open?'현재는 신청 기간이 아닙니다.':'신청 정원이 마감되었습니다.')+'</div>')+'<p class="help">신청 완료 후 나오는 개인 확인 링크를 보관해 주세요.</p></aside></div>');
}
async function receiptPage(ctx,id){
 let result;try{result=await ctx.api('receipt',{id,key:key(),action:'get'});}catch(error){return shell('<section class="page-intro"><h1>신청 확인 링크를 확인해 주세요.</h1><p>'+esc(error.message)+'</p></section>');}
 ctx.state.currentReceipt={id,key:key(),...result};
 const {application:a,event:e}=result;
 const effective=e.status==='cancelled'?'cancelled':a.status;
 return shell('<section class="receipt-card"><span class="success-mark">'+icon(effective==='cancelled'?'circle-x':'check')+'</span><span class="eyebrow">신청 내역</span><h1>내 신청 확인</h1><h2>'+esc(e.title)+'</h2><div class="receipt-status">'+badge(effective)+badge(a.payment)+'</div><p>'+esc(a.name)+'님 · '+date(e.startsAt,true)+'</p><p>'+esc(e.location)+'</p><div class="receipt-details">'+(a.status==='waiting'?'<p>대기 접수 순서 <strong>'+a.sequence+'</strong><br><small>빈자리가 나면 운영진이 순서대로 안내합니다.</small></p>':'')+(a.status==='offered'?'<p>참가 자리가 준비되었습니다.<br>응답 기한: '+date(a.offerExpiresAt,true)+'</p>':'')+(a.status==='registered'&&e.fee?'<h3>납부 안내</h3>'+textBlock(e.paymentInstructions)+'<p>참가비 '+money(a.fee)+' · 확인한 입금 '+money(a.paidAmount)+'</p>':'')+(e.status==='cancelled'?'<p>행사가 취소되었습니다. 납부했다면 운영진에게 환불 처리를 확인해 주세요.</p>':'')+'</div><div class="receipt-actions">'+(a.status==='offered'&&Date.parse(a.offerExpiresAt)>Date.now()&&e.status!=='cancelled'?button('참가 자리 수락','receipt-accept'):'')+(a.status==='registered'&&a.payment==='unpaid'&&e.status!=='cancelled'?button('입금 확인 요청','receipt-payment'):'')+ (a.status==='offered'&&e.status!=='cancelled'?button('참가 자리 거절','receipt-decline',{class:'button secondary'}):'')+(['registered','waiting'].includes(a.status)?button('신청 취소','receipt-cancel',{class:'button secondary'}):'')+button('확인 링크 복사','receipt-copy',{class:'button secondary',icon:'copy'})+'</div><p class="help">이 링크로 신청 내용을 확인하고 취소할 수 있습니다.<br>다른 사람에게 공유하지 말고 안전하게 보관해 주세요.</p></section>');
}
export async function publicSubmit(ctx,form,f){
 if(form!=='apply')return;
 const e=ctx.state.currentEvent,storageKey='martini-pending-'+e.id;
 let pending;try{pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
 if(!pending){pending={requestId:crypto.randomUUID(),receiptKey:secret()};sessionStorage.setItem(storageKey,JSON.stringify(pending));}
 const result=await ctx.api('apply',{eventId:e.id,key:key(),name:String(f.get('name')).trim(),studentId:String(f.get('studentId')).trim(),phone:String(f.get('phone')).trim(),answers:e.questions.map((q,i)=>String(f.get('answer'+i)||'').trim()),consent:f.has('consent'),...pending});
 sessionStorage.removeItem(storageKey);
 ctx.navigate('/r/'+result.id+'#key='+pending.receiptKey);
}
export async function publicAction(ctx,action){
 const r=ctx.state.currentReceipt;
 if(action==='receipt-copy'){try{await navigator.clipboard.writeText(location.href);ctx.toast('개인 확인 링크를 복사했습니다.');}catch{modal('확인 링크',field('receiptLink','안전하게 보관할 링크',location.href,{wide:true}),null);}return;}
 if(!r||!action.startsWith('receipt-'))return;
 const op=action.replace('receipt-','');
 const submit=async()=>{await ctx.api('receipt',{id:r.id,key:r.key,action:op});ctx.toast('처리했습니다.');await ctx.render();};
 if(op==='cancel'||op==='decline')return modal(op==='decline'?'참가 자리를 거절할까요?':'신청을 취소할까요?','<p class="wide prose">취소 후에는 좌석이 다른 부원에게 돌아갈 수 있습니다. 납부한 참가비는 운영진이 환불 기준에 따라 확인합니다.</p>',submit,{submit:'신청 취소'});
 return submit();
}
