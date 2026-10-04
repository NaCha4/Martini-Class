import { esc, icon } from './ui.js';

export const MEMBER_TABS = [
  { id: 'activity', label: '내 현황', icon: 'clipboard-list' },
  { id: 'events', label: '행사', icon: 'calendar-days' },
  { id: 'visits', label: '출입', icon: 'door-open' },
  { id: 'benefits', label: '혜택', icon: 'ticket' },
];
const validTab = tab => MEMBER_TABS.some(item => item.id === tab);

export function memberTabForPath(path = globalThis.location?.pathname || '') {
  const pathname = String(path).split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (/^\/(?:members\/)?events(?:\/|$)/.test(pathname)) return 'events';
  if (/^\/members\/(?:applications|more)(?:\/|$)/.test(pathname)) return 'activity';
  if (pathname === '/members/coupons') return 'benefits';
  return 'activity';
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

export function memberShell(content, { title, memberName = '', activeTab = 'activity' } = {}) {
  const heading = title === undefined || title === null || title === '' ? '' : '<h1 class="member-shell-title">' + esc(title) + '</h1>';
  const selected = validTab(activeTab) ? activeTab : 'activity';
  const navigation = MEMBER_TABS.map(item => '<button type="button" class="member-bottom-button" data-action="member-tab" data-id="' + item.id + '" aria-controls="member-panel-' + item.id + '"' + (item.id === selected ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + item.label + '</span></button>').join('');
  return '<div class="member-shell member-app-shell" data-member-app><header class="member-app-header"><button type="button" class="member-app-brand" data-action="member-tab" data-id="activity" aria-label="내 현황으로"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></button><div class="member-app-account"><span class="member-app-identity" title="' + esc(memberName) + '">' + esc(memberName) + '</span><button type="button" class="member-app-logout" data-action="member-forget" aria-label="로그아웃" title="로그아웃">' + icon('log-out') + '</button></div></header><div class="member-shell-content">' + heading + String(content ?? '') + '</div><nav class="member-bottom-nav" aria-label="부원 메뉴">' + navigation + '</nav></div>';
}
