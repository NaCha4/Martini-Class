import { esc, icon } from './ui.js';

const memberLinks = [
  { href: '/members', title: '홈', icon: 'house' },
  { href: '/members/events', title: '행사', icon: 'calendar-days' },
  { href: '/members/applications', title: '내 신청', icon: 'clipboard-list' },
  { href: '/members/coupons', title: '쿠폰', icon: 'ticket' },
  { href: '/members/more', title: '더보기', icon: 'menu' },
];

export function memberNavigation(path = globalThis.location?.pathname || '/members') {
  const requestedPath = String(path || '/members').split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/members';
  const pathname = requestedPath === '/events' ? '/members/events' : requestedPath;
  return '<nav class="member-navigation" aria-label="부원 메뉴">' + memberLinks.map(link => {
    const current = pathname === link.href || (link.href !== '/members' && pathname.startsWith(link.href + '/'));
    return '<a class="member-navigation-link' + (current ? ' is-active' : '') + '" href="' + link.href + '" data-nav' + (current ? ' aria-current="page"' : '') + '>' + icon(link.icon) + '<span class="member-navigation-label">' + link.title + '</span></a>';
  }).join('') + '</nav>';
}

export function memberShell(content, { path, title } = {}) {
  const heading = title === undefined || title === null || title === '' ? '' : '<h1 class="member-shell-title">' + esc(title) + '</h1>';
  return '<div class="member-shell">' + memberNavigation(path) + '<div class="member-shell-content">' + heading + String(content ?? '') + '</div></div>';
}
