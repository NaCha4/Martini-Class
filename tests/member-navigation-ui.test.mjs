import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_TABS, memberShell, memberTabForPath, currentMemberTab, activateMemberTab, activateMemberRequestView } from '../web/src/member-navigation.js';

const ids = ['activity', 'events', 'visits', 'benefits'];

test('member shell exposes four accessible tabs and selects only the requested panel', () => {
  assert.deepEqual(MEMBER_TABS.map(tab => tab.id), ids);
  assert.equal(MEMBER_TABS.find(tab => tab.id === 'visits').label, '신청');
  for (const activeTab of ids) {
    const content = '<section id="member-panel-' + activeTab + '">내용</section>';
    const html = memberShell(content, { activeTab, memberName: '테스트 부원' });
    assert.ok(html.includes('<div class="member-shell-content">' + content));
    assert.doesNotMatch(html, /data-member-visit-actions|data-action="member-visit"|member-visit-create/);
    const nav = html.match(/<nav\b[^>]*aria-label="부원 메뉴"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    const buttons = [...nav.matchAll(/<button\b[^>]*data-action="member-tab"[^>]*data-id="([^"]+)"[^>]*>/g)];
    assert.deepEqual(buttons.map(button => button[1]), ids);
    for (const button of buttons) {
      assert.ok(button[0].includes('aria-controls="member-panel-' + button[1] + '"'));
      assert.equal(button[0].includes('aria-current="page"'), button[1] === activeTab);
    }
    assert.doesNotMatch(nav, /<a\b|href=|<select\b/);
    assert.doesNotMatch(html, /<h1\b/);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.match(header, /테스트 부원/);
    assert.match(header, /data-action="member-forget"[^>]*aria-label="로그아웃"/);
    assert.doesNotMatch(html, /data-id="home"|member-app-profile/);
  }
});

test('request menu and visit form switch without replacing the mounted draft', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), scrolls = [], focuses = [];
  const draft = { purpose: '작성 중인 방문 사유', date: '2026-10-07', time: '18:00', guests: 2, consent: true };
  const views = ['menu', 'visit', 'equipment'].map(view => ({ dataset: { memberRequestView: view }, hidden: view !== 'menu', draft, focus: options => focuses.push({ view, options }) }));
  const panels = ids.map(id => ({ dataset: { memberPanel: id }, hidden: id !== 'activity', focus() {} }));
  const buttons = ids.map(id => ({ dataset: { id }, setAttribute() {}, removeAttribute() {} }));
  const app = {
    querySelector: selector => views.find(view => selector === '[data-member-request-view="' + view.dataset.memberRequestView + '"]') || null,
    querySelectorAll: selector => selector === '[data-member-panel]' ? panels : selector === '[data-member-request-view]' ? views : buttons,
  };
  const ctx = { state: { memberAppTab: 'activity' }, api: () => assert.fail('request view must not query the API'), render: () => assert.fail('request view must not rerender'), navigate: () => assert.fail('request view must not navigate') };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => app, defaultView: { scrollY: 180, scrollTo: options => scrolls.push(options) } } });
  try {
    assert.equal(activateMemberRequestView(ctx, 'visit'), true);
    assert.equal(ctx.state.memberAppTab, 'visits');assert.equal(ctx.state.memberRequestView, 'visit');
    assert.deepEqual(views.filter(view => !view.hidden).map(view => view.dataset.memberRequestView), ['visit']);
    assert.deepEqual(panels.filter(panel => !panel.hidden).map(panel => panel.dataset.memberPanel), ['visits']);
    assert.equal(focuses.at(-1).view, 'visit');assert.equal(focuses.at(-1).options.preventScroll, true);assert.equal(scrolls.at(-1).top, 0);
    assert.equal(activateMemberRequestView(ctx, 'menu'), true);assert.equal(ctx.state.memberRequestView, 'menu');
    assert.deepEqual(views.filter(view => !view.hidden).map(view => view.dataset.memberRequestView), ['menu']);
    assert.equal(focuses.at(-1).view, 'menu');assert.equal(scrolls.at(-1).top, 0);
    assert.equal(activateMemberRequestView(ctx, 'visit'), true);assert.equal(views[1].draft, draft);
    assert.deepEqual(draft, { purpose: '작성 중인 방문 사유', date: '2026-10-07', time: '18:00', guests: 2, consent: true });
    const scrollCount = scrolls.length;assert.equal(activateMemberRequestView(ctx, 'visit'), true);assert.equal(scrolls.length, scrollCount);
    assert.equal(activateMemberRequestView(ctx, 'equipment'), true);assert.deepEqual(views.filter(view=>!view.hidden).map(view=>view.dataset.memberRequestView),['equipment']);
    assert.equal(activateMemberRequestView(ctx, 'visit'), true);
    assert.equal(activateMemberRequestView(ctx, 'unknown'), false);assert.equal(ctx.state.memberRequestView, 'visit');
    views.splice(0, 1);assert.equal(activateMemberRequestView(ctx, 'menu'), false);assert.equal(ctx.state.memberRequestView, 'visit');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
  }
});

test('member shell escapes optional text and falls back to activity for an invalid selected tab', () => {
  const html = memberShell('<p>내용</p>', { title: '<img src=x onerror=alert(1)> & 제목', memberName: '<script>', activeTab: 'unknown' });
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; 제목'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-id="activity" aria-controls="member-panel-activity" aria-current="page"/);
  assert.doesNotMatch(html, /data-member-visit-actions|data-action="member-visit"/);
  assert.doesNotMatch(html, /<script\b|<img src=x/);
});

test('legacy member URLs initialize the relevant tab while explicit tab state takes priority', () => {
  const cases = [
    ['/members', 'activity'], ['/members/', 'activity'], ['/members/unknown', 'activity'],
    ['/events', 'events'], ['/events/', 'events'], ['/members/events/event-one?mode=view#receipt', 'events'],
    ['/members/applications', 'activity'], ['/members/applications/request-one', 'activity'], ['/members/more/', 'activity'],
    ['/members/coupons', 'benefits'], ['/members/coupons/?source=old', 'benefits'],
  ];
  for (const [path, expected] of cases) assert.equal(memberTabForPath(path), expected, path);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname: '/members/events' } });
  try {
    assert.equal(currentMemberTab({ state: {} }), 'events');
    assert.equal(currentMemberTab({ state: { memberAppTab: 'visits' } }), 'visits');
    assert.equal(currentMemberTab({ state: { memberAppTab: 'invalid' } }), 'events');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous); else delete globalThis.location;
  }
});

test('tab changes preserve mounted content, restore scroll and never refetch or navigate', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), scrolls = [], focuses = [];
  const draft = { value: '작성 중인 방문 목적', date: '2026-10-07', time: '18:00', guests: 2, consent: true }, loadedEvent = { id: 'already-loaded' };
  const panels = ids.map(id => ({ dataset: { memberPanel: id }, hidden: id !== 'activity', draft, loadedEvent, focus: options => focuses.push({ id, options }) }));
  const buttons = ids.map(id => ({ dataset: { id }, attrs: new Map(id === 'activity' ? [['aria-current', 'page']] : []), setAttribute(name, value) { this.attrs.set(name, value); }, removeAttribute(name) { this.attrs.delete(name); } }));
  const app = { querySelector: () => null, querySelectorAll: selector => selector === '[data-member-panel]' ? panels : buttons };
  const win = { scrollY: 125, scrollTo: options => scrolls.push(options) };
  const ctx = { state: { memberAppTab: 'activity', memberAppScroll: { visits: 48 } }, api: () => assert.fail('tab change must not query the API'), render: () => assert.fail('tab change must not rerender'), navigate: () => assert.fail('tab change must not navigate') };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => app, defaultView: win } });
  try {
    assert.equal(activateMemberTab(ctx, 'visits'), true);
    assert.equal(ctx.state.memberAppTab, 'visits');
    assert.equal(ctx.state.memberAppGeneration, 1);
    assert.deepEqual(panels.filter(panel => !panel.hidden).map(panel => panel.dataset.memberPanel), ['visits']);
    assert.deepEqual(buttons.filter(button => button.attrs.has('aria-current')).map(button => button.dataset.id), ['visits']);
    assert.equal(ctx.state.memberAppScroll.activity, 125);
    assert.equal(scrolls.at(-1).top, 48);
    assert.equal(focuses.at(-1).id, 'visits');
    assert.equal(focuses.at(-1).options.preventScroll, true);
    win.scrollY = 90;
    assert.equal(activateMemberTab(ctx, 'activity'), true);
    assert.equal(scrolls.at(-1).top, 125);
    assert.equal(ctx.state.memberAppScroll.visits, 90);
    assert.equal(ctx.state.memberAppGeneration, 2);
    assert.ok(panels.every(panel => panel.draft === draft && panel.loadedEvent === loadedEvent));
    assert.deepEqual(draft, { value: '작성 중인 방문 목적', date: '2026-10-07', time: '18:00', guests: 2, consent: true });
    const scrollCount = scrolls.length;
    assert.equal(activateMemberTab(ctx, 'activity'), true);
    assert.equal(scrolls.length, scrollCount);
    assert.equal(ctx.state.memberAppGeneration, 2);
    assert.equal(activateMemberTab(ctx, 'invalid'), false);
    assert.equal(ctx.state.memberAppTab, 'activity');
    assert.equal(activateMemberTab(ctx, 'visits'), true);
    assert.equal(activateMemberTab(ctx, 'invalid'), false);
    assert.equal(ctx.state.memberAppTab, 'visits');
    panels.splice(panels.findIndex(panel => panel.dataset.memberPanel === 'benefits'), 1);
    assert.equal(activateMemberTab(ctx, 'benefits'), false);
    assert.equal(ctx.state.memberAppTab, 'visits');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
  }
});
