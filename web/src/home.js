import { publicHeader, publicFooter } from './public-shell.js';
import { icon } from './ui.js';

const activities=[
 {index:'01',href:'/activities',title:'칵테일 교육',description:'재료와 도구의 기초부터 직접 만드는 실습까지.'},
 {index:'02',href:'/activities',title:'총회와 모임',description:'개강총회와 친목 활동으로 부원들을 만납니다.'},
 {index:'03',href:'/notices',title:'동아리 소식',description:'모집 안내와 동아리의 새로운 소식을 확인하세요.'},
];
function hero(){return '<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="hero-kicker">HANYANG COCKTAIL SOCIETY</p><h1 id="hero-title">Martini</h1><p class="hero-description">칵테일을 배우고, 직접 만들고, 함께 나누는<br class="mobile-break"> 한양대학교 ERICA 칵테일 동아리.</p><div class="hero-tags"><span>Cocktail</span><span>Craft</span><span>Community</span></div></div><a class="hero-scroll" href="#club-intro">마티니 알아보기 '+icon('arrow-right')+'</a></section>';}
function introduction(){return '<section class="home-intro" id="club-intro"><div class="section-heading"><span class="eyebrow">마티니의 활동</span><h2>처음 만드는 한 잔부터.</h2></div><p>칵테일에 관심이 있다면 누구나. 재료와 도구를 배우는 교육, 새 학기를 시작하는 총회, 함께 즐기는 모임을 준비합니다.</p></section>';}
function activityList(){return '<section class="home-activities" aria-label="주요 활동">'+activities.map(item=>
 '<a href="'+item.href+'" data-nav><span class="activity-index">'+item.index+'</span><div><h3>'+item.title+'</h3><p>'+item.description+'</p></div>'+icon('arrow-up-right')+'</a>'
).join('')+'</section>';}
function joinBanner(){return '<section class="join-banner"><div><span class="eyebrow">가입 안내</span><h2>이번 학기, 마티니에서 만나요.</h2></div><a href="/join" data-nav class="button">가입 절차 확인 '+icon('arrow-up-right')+'</a></section>';}
export function renderHome(){
 return publicHeader(true)+'<main id="main-content">'+hero()+introduction()+activityList()+joinBanner()+'</main>'+publicFooter();
}
