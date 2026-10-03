import test from 'node:test';
import assert from 'node:assert/strict';
import { memberNavigation, memberShell } from '../web/src/member-navigation.js';
import { renderMemberCouponPreparation } from '../web/src/member-coupons.js';

const navigationLinks = html => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);

test('member navigation exposes the five named destinations with decorative icons', () => {
  const html = memberNavigation('/members');
  assert.match(html, /<nav\b[^>]*aria-label="부원 메뉴"/);
  const links = navigationLinks(html);
  assert.equal(links.length, 5);
  for (const [index, [href, title, icon]] of [
    ['/members', '홈', 'house'],
    ['/members/events', '행사', 'calendar-days'],
    ['/members/applications', '내 신청', 'clipboard-list'],
    ['/members/coupons', '쿠폰', 'ticket'],
    ['/members/more', '더보기', 'menu'],
  ].entries()) {
    assert.ok(links[index].includes('href="' + href + '"'));
    assert.ok(links[index].includes('data-nav'));
    assert.ok(links[index].includes('>' + title + '</span>'));
    assert.ok(links[index].includes('data-lucide="' + icon + '" aria-hidden="true"'));
  }
});

test('member detail paths keep exactly their owning menu current', () => {
  for (const [path, href] of [
    ['/members', '/members'],
    ['/members/events/event-a', '/members/events'],
    ['/members/applications/request-a', '/members/applications'],
    ['/members/coupons', '/members/coupons'],
    ['/members/more/', '/members/more'],
    ['/members/events/event-a/?view=detail#date', '/members/events'],
    ['/events?view=list#date', '/members/events'],
  ]) {
    const links = navigationLinks(memberNavigation(path));
    const current = links.filter(link => link.includes('aria-current="page"'));
    assert.equal(current.length, 1, path);
    assert.ok(current[0].includes('href="' + href + '"'), path);
  }
  assert.doesNotMatch(memberNavigation('/members/events-archive'), /aria-current/);
});

test('member navigation defaults to the active browser path or home without a browser', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname: '/members/applications/request-a' } });
    assert.ok(navigationLinks(memberNavigation()).find(link => link.includes('aria-current="page"')).includes('href="/members/applications"'));
    delete globalThis.location;
    assert.ok(navigationLinks(memberNavigation()).find(link => link.includes('aria-current="page"')).includes('href="/members"'));
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

test('coupon preparation remains a static announced-later state in both variants', () => {
  for (const compact of [false, true]) {
    const html = renderMemberCouponPreparation({ compact });
    assert.match(html, /data-coupon-state="PREPARING"/);
    assert.match(html, /준비 중/);
    assert.match(html, /<h2 class="member-coupon-title">필링파인 쿠폰/);
    assert.match(html, /운영 정책과 이용 대상, 사용 방법, 유효기간은 확정되면 안내/);
    assert.match(html, /최대 10칸/);
    assert.match(html, /혜택·상품 추후 안내/);
    assert.doesNotMatch(html, /<h1\b|<button\b|<form\b|<input\b|<canvas\b|<img\b|data-action=|\bQR\b|잔액|보유|보상 정책|\b0\s*\/\s*10\b|\d+\s*(?:장|개|원)/i);
    const links = navigationLinks(html);
    assert.equal(links.length, compact ? 1 : 0);
    if (compact) {
      assert.match(links[0], /href="\/members\/coupons"[^>]*data-nav/);
      assert.doesNotMatch(html, /member-coupon-slot/);
    } else {
      assert.match(html, /빈칸은 디자인 미리보기이며 내 적립 내역이 아닙니다/);
      assert.match(html, /class="member-coupon-preview-grid" aria-hidden="true"/);
      assert.equal((html.match(/<span class="member-coupon-slot"><\/span>/g) || []).length, 10);
    }
  }
});
