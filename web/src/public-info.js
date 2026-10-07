import { publicShell as shell } from './public-shell.js';
import { renderHome } from './home.js';
import privacyContent from './content/privacy.html?raw';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, icon, textBlock, date, empty } from './ui.js';
async function publicInfo(ctx){
 if(ctx.state.publicInfo)return ctx.state.publicInfo;
 try{ctx.state.publicInfo=await ctx.api('publicRead');return ctx.state.publicInfo;}
 catch(error){return {settings:null,content:[],unavailable:true};}
}
export async function renderPublicInfo(ctx){
 const path=location.pathname.replace(/\/+$/,'')||'/';
 if(path==='/')return renderHome();
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
