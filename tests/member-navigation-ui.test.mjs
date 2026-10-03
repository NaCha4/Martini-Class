import test from 'node:test';
import assert from 'node:assert/strict';
import { memberNavigation, memberShell } from '../web/src/member-navigation.js';
import { renderMemberCouponPreparation } from '../web/src/member-coupons.js';

const navigationLinks = html => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
const navigationButtons = html => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);

test('member navigation has five section scroll buttons with decorative icons and no route links', () => {
  const html = memberNavigation('/members');
  assert.match(html, /<nav\b[^>]*aria-label="부원 메뉴"/);
  const links = navigationButtons(html);
  assert.equal(links.length, 5);assert.equal(navigationLinks(html).length,0);
  for (const [index, [id, title, icon]] of [
    ['home', '홈', 'house'],
    ['events', '행사', 'calendar-days'],
    ['applications', '내 신청', 'clipboard-list'],
    ['coupons', '쿠폰', 'ticket'],
    ['more', '더보기', 'menu'],
  ].entries()) {
    assert.ok(links[index].includes('type="button"'));
    assert.ok(links[index].includes('data-action="member-section"'));
    assert.ok(links[index].includes('data-id="' + id + '"'));
    assert.ok(links[index].includes('aria-controls="member-' + id + '"'));
    assert.doesNotMatch(links[index],/href=|data-nav/);
    assert.ok(links[index].includes('>' + title + '</span>'));
    assert.ok(links[index].includes('data-lucide="' + icon + '" aria-hidden="true"'));
  }
});

test('member detail paths keep exactly their owning menu current', () => {
  for (const [path, id] of [
    ['/members', 'home'],
    ['/members/events/event-a', 'events'],
    ['/members/applications/request-a', 'applications'],
    ['/members/coupons', 'coupons'],
    ['/members/more/', 'more'],
    ['/members/events/event-a/?view=detail#date', 'events'],
    ['/events?view=list#date', 'events'],
  ]) {
    const links = navigationButtons(memberNavigation(path));
    const current = links.filter(link => link.includes('aria-current="location"'));
    assert.equal(current.length, 1, path);
    assert.ok(current[0].includes('data-id="' + id + '"'), path);
  }
  const fallback=navigationButtons(memberNavigation('/members/events-archive')).find(button=>button.includes('aria-current="location"'));
  assert.ok(fallback.includes('data-id="home"'));
});

test('member navigation defaults to the active browser path or home without a browser', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname: '/members/applications/request-a' } });
    assert.ok(navigationButtons(memberNavigation()).find(link => link.includes('aria-current="location"')).includes('data-id="applications"'));
    delete globalThis.location;
    assert.ok(navigationButtons(memberNavigation()).find(link => link.includes('aria-current="location"')).includes('data-id="home"'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  }
});

test('member shell preserves the page heading and only adds an escaped title on request', () => {
  const content = '<h1>행사</h1><p>내용</p>';
  const html = memberShell(content, { path: '/members/events' });
  assert.match(html, /^<div class="member-shell"><nav/);
  assert.ok(html.includes('<div class="member-shell-content">' + content));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const titled = memberShell('<p>내용</p>', { title: '<img src=x onerror=alert(1)> & 제목' });
  assert.equal((titled.match(/<h1\b/g) || []).length, 1);
  assert.ok(titled.includes('&lt;img src=x onerror=alert(1)&gt; &amp; 제목'));
  assert.doesNotMatch(titled, /<img\b/);
});

test('coupon preparation is one concise unavailable notice without unused previews or controls', () => {
  for (const compact of [false, true]) {
    const html = renderMemberCouponPreparation({ compact });
    assert.match(html, /data-coupon-state="PREPARING"/);
    assert.match(html, /준비 중/);
    assert.match(html, /<h2 class="member-coupon-title">필링파인 쿠폰/);
    assert.match(html, /안내/);
    assert.doesNotMatch(html, /<h1\b|<button\b|<form\b|<input\b|<canvas\b|<img\b|data-action=|\bQR\b|잔액|보유|보상 정책|\b0\s*\/\s*10\b|\d+\s*(?:장|개|원)/i);
    assert.doesNotMatch(html, /member-coupon-slot|member-coupon-preview|쿠폰 구성 미리보기|최대 10칸|혜택·상품|운영 정책|이용 대상|유효기간/);
    assert.equal(navigationLinks(html).length, 0);
  }
});
