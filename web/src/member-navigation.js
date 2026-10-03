import { esc, icon } from './ui.js';

const memberLinks = [
  { id: 'home', title: '홈', icon: 'house' },
  { id: 'events', title: '행사', icon: 'calendar-days' },
  { id: 'applications', title: '내 신청', icon: 'clipboard-list' },
  { id: 'coupons', title: '쿠폰', icon: 'ticket' },
  { id: 'more', title: '더보기', icon: 'menu' },
];

export function memberNavigation(path = globalThis.location?.pathname || '/members', section) {
  const requestedPath = String(path || '/members').split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/members';
  const pathname = requestedPath === '/events' ? '/members/events' : requestedPath;
  const currentSection=memberLinks.some(link=>link.id===section)?section:(memberLinks.find(link=>link.id!=='home'&&(pathname==='/members/'+link.id||pathname.startsWith('/members/'+link.id+'/')))?.id||'home');
  return '<nav class="member-navigation" aria-label="부원 메뉴">' + memberLinks.map(link => {
    const current=link.id===currentSection;
    return '<button type="button" class="member-navigation-link' + (current ? ' is-active' : '') + '" data-action="member-section" data-id="'+link.id+'" aria-controls="member-'+link.id+'"'+(current?' aria-current="location"':'')+'>' + icon(link.icon) + '<span class="member-navigation-label">' + link.title + '</span></button>';
  }).join('') + '</nav>';
}

export function memberShell(content, { path, title, section } = {}) {
  const heading = title === undefined || title === null || title === '' ? '' : '<h1 class="member-shell-title">' + esc(title) + '</h1>';
  return '<div class="member-shell">' + memberNavigation(path,section) + '<div class="member-shell-content">' + heading + String(content ?? '') + '</div></div>';
}
