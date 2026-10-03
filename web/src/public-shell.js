import { icon } from './ui.js';
const publicLinks=[['/about','소개'],['/activities','활동'],['/notices','공지'],['/join','가입 안내']];
export function publicHeader(home=false){
 const pathname=location.pathname.replace(/\/+$/,'')||'/';
 const memberPage=pathname==='/events'||/^\/members(?:\/|$)/.test(pathname);
 const links=memberPage?'':publicLinks.map(([href,title])=>'<a href="'+href+'" data-nav'+(pathname===href?' aria-current="page"':'')+'>'+title+'</a>').join('');
 const navigation=memberPage?'':'<nav aria-label="홈페이지 메뉴">'+links+'</nav>';
 const mobileMenu=memberPage?'':'<details class="public-mobile-menu"><summary aria-label="홈페이지 메뉴" aria-controls="public-mobile-links">'+icon('menu')+'</summary><nav id="public-mobile-links" aria-label="모바일 홈페이지 메뉴">'+links+'</nav></details>';
 return '<a class="skip-link" href="#main-content">본문으로 건너뛰기</a><header class="public-header '+(home?'over-hero':'')+'"><a class="brand" href="/" data-nav aria-label="마티니 홈"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></a>'+navigation+'<div class="header-actions"><a class="member-header-link" href="/members" data-nav'+(pathname==='/members'?' aria-current="page"':'')+'>'+icon('users-round')+'<span>부원 라운지</span></a>'+mobileMenu+'</div></header>';
}
export function publicFooter(){
 return `<footer class="public-footer" id="contact">
  <div class="footer-contact"><strong>Martini</strong><span>한양대학교 ERICA 학생복지관 502호</span></div>
  <div class="footer-meta">
   <a class="footer-instagram" href="https://www.instagram.com/hy_martini/" target="_blank" rel="noopener noreferrer" aria-label="Martini Instagram (새 탭)">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg>
   </a>
   <p lang="en">&copy; 2026 Martini. Central Club of Hanyang University ERICA.</p>
   <p class="footer-links" lang="en"><a href="/privacy" data-nav>Privacy Policy</a><span aria-hidden="true">|</span><span>All Rights Reserved.</span></p><p class="footer-links"><a class="footer-admin-link" href="/admin" data-nav>운영자</a></p>
  </div>
 </footer>`;
}

export function publicShell(body){
 return publicHeader()+'<main id="main-content" class="public-page">'+body+'</main>'+publicFooter();
}
