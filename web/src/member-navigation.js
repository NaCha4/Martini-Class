import { esc, icon } from './ui.js';

export const MEMBER_TABS = [
  { id: 'home', label: '홈', icon: 'house' },
  { id: 'events', label: '행사', icon: 'calendar-days' },
  { id: 'visits', label: '출입', icon: 'door-open' },
  { id: 'benefits', label: '혜택', icon: 'ticket' },
  { id: 'activity', label: '마이', icon: 'user-round' },
];
const validTab = tab => MEMBER_TABS.some(item => item.id === tab);

export function memberTabForPath(path = globalThis.location?.pathname || '') {
  const pathname = String(path).split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (/^\/(?:members\/)?events(?:\/|$)/.test(pathname)) return 'events';
  if (/^\/members\/(?:applications|more)(?:\/|$)/.test(pathname)) return 'activity';
  if (pathname === '/members/coupons') return 'benefits';
  return 'home';
}

export function currentMemberTab(ctx) {
  return validTab(ctx?.state?.memberAppTab) ? ctx.state.memberAppTab : memberTabForPath();
}

// Panels stay mounted: switching tabs preserves form values and loaded records.
export function activateMemberTab(ctx, tab) {
  if (!validTab(tab)) return false;
  const doc = globalThis.document, app = doc?.querySelector('[data-member-app]');
  if (!app) return false;
  const panels = Array.from(app.querySelectorAll('[data-member-panel]'));
  const panel = panels.find(item => item.dataset.memberPanel === tab);
  if (!panel) return false;
  const previous = panels.find(item => !item.hidden)?.dataset.memberPanel || currentMemberTab(ctx);
  const win = doc.defaultView || globalThis.window;
  if (previous !== tab) {
    ctx.state.memberAppGeneration = (ctx.state.memberAppGeneration || 0) + 1;
    const positions = ctx.state.memberAppScroll ??= {};
    positions[previous] = Math.max(0, Number(win?.scrollY ?? doc.documentElement?.scrollTop) || 0);
  }
  ctx.state.memberAppTab = tab;
  for (const item of panels) item.hidden = item !== panel;
  for (const item of app.querySelectorAll('.member-bottom-nav [data-action="member-tab"]')) {
    if (item.dataset.id === tab) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  panel.focus?.({ preventScroll: true });
  if (previous !== tab) win?.scrollTo?.({ top: ctx.state.memberAppScroll?.[tab] || 0, behavior: 'instant' });
  return true;
}

export function memberShell(content, { title, memberName = '', activeTab = 'home' } = {}) {
  const heading = title === undefined || title === null || title === '' ? '' : '<h1 class="member-shell-title">' + esc(title) + '</h1>';
  const selected = validTab(activeTab) ? activeTab : 'home';
  const initial = Array.from(String(memberName).trim())[0] || 'M';
  const navigation = MEMBER_TABS.map(item => '<button type="button" class="member-bottom-button" data-action="member-tab" data-id="' + item.id + '" aria-controls="member-panel-' + item.id + '"' + (item.id === selected ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + item.label + '</span></button>').join('');
  return '<div class="member-shell member-app-shell" data-member-app><header class="member-app-header"><button type="button" class="member-app-brand" data-action="member-tab" data-id="home" aria-label="부원 홈으로"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></button><button type="button" class="member-app-profile" data-action="member-tab" data-id="activity" aria-label="내 활동 보기"><span aria-hidden="true">' + esc(initial) + '</span></button></header><div class="member-shell-content">' + heading + String(content ?? '') + '</div><nav class="member-bottom-nav" aria-label="부원 메뉴">' + navigation + '</nav></div>';
}
