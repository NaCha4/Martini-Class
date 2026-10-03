import test from 'node:test';
import assert from 'node:assert/strict';
import { memberShell } from '../web/src/member-navigation.js';

test('member shell renders the whole content without navigation or section controls on every legacy route', () => {
  const content = '<h1>부원 라운지</h1><section id="events">행사</section><section id="requests">신청</section>';
  for (const path of ['/members', '/members/events', '/members/applications', '/members/coupons', '/members/more', '/events']) {
    const html = memberShell(content, { path });
    assert.ok(html.includes('<div class="member-shell-content">' + content), path);
    assert.doesNotMatch(html, /<nav\b|<button\b|<a\b|<details\b|<summary\b|member-navigation|member-section|aria-current=/, path);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, path);
  }
});

test('member shell adds an escaped title only when explicitly requested', () => {
  const titled = memberShell('<p>내용</p>', { title: '<img src=x onerror=alert(1)> & 제목' });
  assert.equal((titled.match(/<h1\b/g) || []).length, 1);
  assert.ok(titled.includes('&lt;img src=x onerror=alert(1)&gt; &amp; 제목'));
  assert.doesNotMatch(titled, /<img\b|<nav\b/);
});
