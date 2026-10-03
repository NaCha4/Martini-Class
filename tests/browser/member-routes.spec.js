import { test, expect } from '@playwright/test';

const member = { name: '가상부원 가', studentId: '202600001' };
const action = (page, name) => page.locator('[data-action="' + name + '"]').first();

test.beforeEach(async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5173') throw new Error('Member route tests require the local development server.');
  page._memberRouteErrors = [];
  page.on('pageerror', error => page._memberRouteErrors.push(error.message));
});

test.afterEach(async ({ page }, info) => {
  expect(page._memberRouteErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: '.local/screenshots/member-routes-' + info.project.name + '-' + info.title.replace(/[^a-z0-9]+/gi, '-') + '.png' });
});

async function verifyHere(page) {
  const destination = page.url();
  const form = page.locator('form[data-form="member-login"]');
  await expect(form).toBeVisible();
  await expect(page.getByRole('navigation', { name: '부원 메뉴', exact: true })).toHaveCount(0);
  await expect(form.locator('[name=phone], input[type=tel]')).toHaveCount(0);
  await form.locator('[name=name]').fill(member.name);
  await form.locator('[name=studentId]').fill(member.studentId);
  await form.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(destination);
}

test('public pages expose a member entry in the header and the operator entry in the footer', async ({ page }) => {
  for (const path of ['/', '/about']) {
    await page.goto(path);
    const memberLink = page.locator('.public-header .member-header-link');
    await expect(memberLink).toBeVisible();
    await expect(memberLink).toHaveAttribute('href', '/members');
    await expect(memberLink).toContainText('부원 라운지');
    await expect(page.locator('.public-header a[href="/admin"]')).toHaveCount(0);
    const operatorLink = page.locator('.public-footer .footer-admin-link');
    await expect(operatorLink).toHaveAttribute('href', '/admin');
    await expect(operatorLink).toContainText('운영자');
  }
  await page.locator('.public-header .member-header-link').click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByRole('navigation', { name: '부원 메뉴', exact: true })).toHaveCount(0);
  await expect(page.locator('form[data-form="member-login"]')).toBeVisible();
  await expect(page.locator('.public-header > nav, .public-mobile-menu nav')).toHaveCount(0);
});

test('a direct member event verifies in place and keeps its destination on reload', async ({ page }) => {
  await page.goto('/members/events/demo-opening');
  const destination = page.url();
  await expect(page.locator('form[data-form=apply]')).toHaveCount(0);
  await verifyHere(page);
  const form = page.locator('form[data-form=apply]');
  await expect(form).toBeVisible();
  await expect(form.locator('[name=name], [name=studentId], [name=phone]')).toHaveCount(0);
  await expect(form.locator('.member-form-identity')).toContainText('확인된 부원 정보로 신청합니다.');
  await expect(page.locator('.member-navigation, [data-action="member-section"]')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(destination);
  await expect(form).toBeVisible();
});

test('the events alias keeps all lounge content in the document and inline event actions preserve its URL', async ({ page }) => {
  await page.goto('/events');
  const alias = page.url();
  await expect(page.getByRole('heading', { name: '부원 로그인', exact: true })).toBeVisible();
  await verifyHere(page);
  await expect(page.getByRole('heading', { name: '행사', exact: true })).toBeVisible();
  await expect(page).toHaveURL(alias);
  const events = page.locator('.member-event');
  await expect(events.first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '행사 신청은 전달받은 링크에서.', exact: true })).toHaveCount(0);
  const eventId = await events.first().getAttribute('data-id');
  expect(eventId).toMatch(/^[a-zA-Z0-9_-]+$/);
  await expect(events.first()).toHaveAttribute('data-action', 'member-event-open');
  await expect(events.first()).not.toHaveAttribute('href');
  await expect(page.locator('.member-navigation, [data-action="member-section"], #member-coupons, .member-lounge details')).toHaveCount(0);
  await expect(page.locator('.member-services > .member-service-card')).toHaveCount(3);
  for (const section of ['visits', 'events', 'partners']) await expect(page.locator('#member-' + section)).toBeVisible();
  await page.locator('#member-visits').scrollIntoViewIfNeeded();
  await expect(action(page, 'member-visit')).toBeVisible();
  await expect(action(page, 'member-inquiry')).toHaveCount(0);
  await expect(page).toHaveURL(alias);
  await page.reload();
  await expect(page).toHaveURL(alias);
  await expect(events.first()).toBeVisible();
  await events.first().click();
  await expect(page).toHaveURL(alias);
  await expect(page.locator('#member-detail form[data-form=apply]')).toBeVisible();
  await page.locator('#member-visits').scrollIntoViewIfNeeded();
  await expect(page).toHaveURL(alias);
  await expect(action(page, 'member-visit')).toBeVisible();
});

test('additional privacy guidance matches the identity and one-to-three visitor form', async ({ page }) => {
  await page.goto('/privacy');
  const additional = page.getByRole('region', { name: '부원 라운지 개인정보 추가 안내', exact: true });
  await expect(additional).toContainText('이름·학번');
  await expect(additional).toContainText('방문 시작');
  await expect(additional).toContainText(/1명\s*부터\s*3명|1~3명|1–3명|1~3/);
  await expect(additional).not.toContainText('종료 시각');
  await expect(additional).not.toContainText('이름·학번·연락처');
  await expect(additional).not.toContainText('Google Form');
  await expect(additional).toContainText('개인 신청 확인 링크');
});

async function fixtureApplication(page, { status = 'registered', payment = 'unpaid', expired = false } = {}) {
  const future = days => new Date(Date.now() + days * 86400000).toISOString();
  const event = {
    id: 'fixture-event', title: '부원 신청 상태 검증', type: 'class', status: 'open', semester: '2026-2',
    startsAt: future(7), endsAt: future(8), opensAt: future(-1), closesAt: future(6), cancelUntil: future(6),
    capacity: 20, registered: 1, waiting: 0, waitlist: true, fee: 10000, questions: [], location: '동아리방',
    bankName: '가상은행', accountHolder: '마티니', accountNumber: '000-0000-0000', policy: '취소 마감 전 취소할 수 있습니다.'
  };
  const application = {
    id: 'fixture-application', eventId: event.id, name: member.name, status, payment, fee: 10000,
    paidAmount: 0, refundAmount: 0, sequence: 1, answers: [], createdAt: future(-1),
    offerExpiresAt: future(expired ? -1 : 1), policy: event.policy
  };
  await page.route('**/src/firebase.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const local = true, auth = {};
    export function onAuthStateChanged(auth, callback) { queueMicrotask(() => callback(null)); return () => {}; }
    export async function signInWithEmailAndPassword() {} export async function signOut() {} export async function sendPasswordResetEmail() {}
    const seed = ${JSON.stringify({ application, event })};
    export async function api(op, data = {}) {
      const saved = JSON.parse(sessionStorage.getItem('member-route-fixture') || 'null') || structuredClone(seed);
      const result = () => structuredClone(saved);
      window.__memberRouteCalls ??= []; window.__memberRouteCalls.push({ op, ...data });
      if (op === 'publicRead') return { settings: {}, content: [] };
      if (op === 'memberAccess') return { sessionKey: data.sessionKey, member: { name: ${JSON.stringify(member.name)}, semester: '2026-2' }, expiresAt: new Date(Date.now() + 7200000).toISOString() };
      if (op === 'memberPortal') return { member: { name: ${JSON.stringify(member.name)}, semester: '2026-2' }, events: [saved.event], requests: [] };
      if (op === 'memberApplications') return { applications: [result()], legacyAccessRequiresReceipt: true };
      if (op === 'memberApplication') {
        if (data.id !== saved.application.id || !/^[a-f0-9]{64}$/.test(data.sessionKey || '')) throw new Error('Unexpected member application capability');
        if (data.action === 'payment') saved.application.payment = 'requested';
        else if (data.action === 'accept') { saved.application.status = 'registered'; saved.application.payment = 'unpaid'; }
        else if (data.action === 'cancel' || data.action === 'decline') saved.application.status = 'cancelled';
        else if (data.action !== 'get') throw new Error('Unexpected member application action: ' + data.action);
        sessionStorage.setItem('member-route-fixture', JSON.stringify(saved));
        return result();
      }
      throw new Error('Unexpected route fixture operation: ' + op);
    }
  ` }));
  await page.goto('/members/applications/fixture-application');
  await verifyHere(page);
  await expect(page.locator('.receipt-card')).toBeVisible();
}

async function expectMemberCommand(page, command) {
  const calls = await page.evaluate(() => window.__memberRouteCalls.filter(call => call.op === 'memberApplication'));
  const matching = calls.filter(call => call.action === command);
  expect(matching).toHaveLength(1);
  expect(matching[0].id).toBe('fixture-application');
  expect(matching[0].sessionKey).toMatch(/^[a-f0-9]{64}$/);
  for (const key of ['key', 'receiptKey', 'name', 'studentId', 'phone']) expect(matching[0]).not.toHaveProperty(key);
  await expect(page).toHaveURL(/\/members\/applications\/fixture-application$/);
}

test('member detail requests payment and cancels through the same receipt confirmations', async ({ page }) => {
  await fixtureApplication(page);
  await expect(page.locator('.receipt-status')).toContainText('참가 등록');
  await expect(page.locator('.receipt-account')).toContainText('000-0000-0000');
  await action(page, 'receipt-payment').click();
  const payment = page.getByRole('dialog', { name: '입금을 완료하셨나요?' });
  await payment.locator('[name=paymentConfirmed]').check();
  await payment.getByRole('button', { name: '입금 확인 요청', exact: true }).click();
  await expect(payment).toHaveCount(0);
  await expect(page.locator('.receipt-status')).toContainText('확인 요청');
  await expectMemberCommand(page, 'payment');
  await action(page, 'receipt-cancel').click();
  const cancellation = page.getByRole('dialog', { name: '신청을 취소할까요?' });
  await cancellation.getByRole('button', { name: '신청 취소', exact: true }).click();
  await expect(cancellation).toHaveCount(0);
  await expect(page.locator('.receipt-status')).toContainText('취소');
  await expectMemberCommand(page, 'cancel');
  await page.reload();
  await expect(page.locator('.receipt-status')).toContainText('취소');
  await expect(action(page, 'receipt-cancel')).toHaveCount(0);
});

test('member detail accepts a live offered seat and exposes its payment follow-up', async ({ page }) => {
  await fixtureApplication(page, { status: 'offered', payment: 'none' });
  await expect(page.locator('.receipt-details')).toContainText('참가 자리가 준비되었습니다.');
  await action(page, 'receipt-accept').click();
  await expect(page.locator('.receipt-status')).toContainText('참가 등록');
  await expectMemberCommand(page, 'accept');
  await expect(action(page, 'receipt-payment')).toBeVisible();
  await expect(action(page, 'receipt-accept')).toHaveCount(0);
  await expect(action(page, 'receipt-decline')).toHaveCount(0);
});

test('member detail declines an offered seat and cannot accept an expired offer', async ({ page }) => {
  await fixtureApplication(page, { status: 'offered', payment: 'none', expired: true });
  await expect(page.locator('.receipt-details')).toContainText('응답 기한이 지났습니다.');
  await expect(action(page, 'receipt-accept')).toHaveCount(0);
  await action(page, 'receipt-decline').click();
  const decline = page.getByRole('dialog', { name: '참가 자리를 거절할까요?' });
  await decline.getByRole('button', { name: '참가 자리 거절', exact: true }).click();
  await expect(decline).toHaveCount(0);
  await expect(page.locator('.receipt-status')).toContainText('취소');
  await expectMemberCommand(page, 'decline');
  await expect(action(page, 'receipt-decline')).toHaveCount(0);
});

test('uncommitted application retries keep tokens only for the same session or link identity and answers', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('h1')).toBeVisible();
  const attempts = await page.evaluate(async () => {
    const { eventSubmit } = await import('/src/event-pages.js');
    const { setMemberSession, MEMBER_STORAGE_KEY } = await import('/src/member-session.js');
    const pendingKey = 'martini-pending-scope-regression';
    const previousSession = sessionStorage.getItem(MEMBER_STORAGE_KEY), previousPending = sessionStorage.getItem(pendingKey), originalUrl = location.href;
    const privateValues = ['e'.repeat(64), 'f'.repeat(64), 'a'.repeat(64), 'b'.repeat(64), 'scope-private-name-one', 'scope-private-name-two', 'scope-private-student-one', 'scope-private-student-two', 'scope-private-answer-one', 'scope-private-answer-two'];
    const results = [];
    const ctx = {
      state: { currentEvent: { id: 'scope-regression', memberAccess: true, questions: ['참여 이유'], accessUrl: location.href } },
      api: async (op, payload) => {
        if (op === 'resolveLink') {
          const error = new Error('No committed receipt for this attempt');error.code = 'functions/not-found';throw error;
        }
        if (op !== 'apply' || 'accessScope' in payload) throw new Error('Unexpected application payload');
        throw new Error('simulated-lost-response');
      }
    };
    const form = new FormData();
    form.set('answer0', privateValues[8]);form.set('consent', 'on');
    const session = sessionKey => {
      setMemberSession(ctx, { sessionKey, expiresAt: new Date(Date.now() + 7200000).toISOString(), member: { name: '확인된 가상부원', semester: '2026-2' } });
      // A new identity discards cached detail; simulate its freshly verified event page.
      ctx.state.currentEvent = { id: 'scope-regression', memberAccess: true, questions: ['참여 이유'], accessUrl: location.href };
    };
    const retry = async (label, fromStorage = false) => {
      if (fromStorage) { delete ctx.state.pendingApplications; delete ctx.state.memberLounge; }
      let caught = '';
      try { await eventSubmit(ctx, 'apply', form); } catch (error) { caught = error.message; }
      if (caught !== 'simulated-lost-response') throw new Error('Expected a simulated lost response: ' + caught);
      const raw = sessionStorage.getItem(pendingKey);
      results.push({ label, pending: JSON.parse(raw), privateValueStored: privateValues.some(value => raw.includes(value)) });
    };
    try {
      session(privateValues[0]);
      await retry('member first');await retry('member same');await retry('member restored', true);
      session(privateValues[1]);await retry('member changed session');
      form.set('answer0', privateValues[9]);await retry('member changed answer');
      ctx.state.currentEvent.memberAccess = false;
      history.replaceState(history.state, '', location.pathname + '#key=' + privateValues[2]);
      ctx.state.currentEvent.accessUrl = location.href;
      form.set('name', privateValues[4]);form.set('studentId', privateValues[6]);form.set('answer0', privateValues[8]);
      await retry('link first');await retry('link same');await retry('link restored', true);
      form.set('name', privateValues[5]);await retry('link changed name');
      form.set('studentId', privateValues[7]);await retry('link changed student');
      form.set('answer0', privateValues[9]);await retry('link changed answer');
      history.replaceState(history.state, '', location.pathname + '#key=' + privateValues[3]);
      ctx.state.currentEvent.accessUrl = location.href;
      await retry('link changed key');
      form.delete('consent');await retry('link changed consent');
      return results;
    } finally {
      history.replaceState(history.state, '', originalUrl);
      for (const [key, saved] of [[MEMBER_STORAGE_KEY, previousSession], [pendingKey, previousPending]]) {
        if (saved === null) sessionStorage.removeItem(key);else sessionStorage.setItem(key, saved);
      }
    }
  });
  const byLabel = label => attempts.find(attempt => attempt.label === label).pending;
  for (const attempt of attempts) {
    expect(Object.keys(attempt.pending).sort()).toEqual(['accessScope', 'receiptKey', 'requestId']);
    expect(attempt.pending.accessScope).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.pending.receiptKey).toMatch(/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/);
    expect(attempt.privateValueStored).toBe(false);
  }
  for (const mode of ['member', 'link']) {
    expect(byLabel(mode + ' same')).toEqual(byLabel(mode + ' first'));
    expect(byLabel(mode + ' restored')).toEqual(byLabel(mode + ' first'));
  }
  for (const [before, after] of [
    ['member restored', 'member changed session'], ['member changed session', 'member changed answer'],
    ['member changed answer', 'link first'], ['link restored', 'link changed name'],
    ['link changed name', 'link changed student'], ['link changed student', 'link changed answer'],
    ['link changed answer', 'link changed key'], ['link changed key', 'link changed consent']
  ]) {
    for (const key of ['requestId', 'receiptKey', 'accessScope']) expect(byLabel(after)[key]).not.toBe(byLabel(before)[key]);
  }
});

async function pendingRecoveryAttempt(page, options = {}) {
  await page.goto('/privacy');
  await expect(page.locator('h1')).toBeVisible();
  return page.evaluate(async options => {
    const { eventSubmit } = await import('/src/event-pages.js');
    const { shortLink } = await import('/src/share-links.js');
    const { setMemberSession, MEMBER_STORAGE_KEY } = await import('/src/member-session.js');
    const eventId = 'legacy-scope-regression', storageKey = 'martini-pending-' + eventId;
    const previousSession = sessionStorage.getItem(MEMBER_STORAGE_KEY), previousPending = sessionStorage.getItem(storageKey);
    let pending = { requestId: '11111111-1111-4111-8111-111111111111', receiptKey: 'd'.repeat(24) };
    let original = JSON.stringify(pending);
    const calls = [], navigations = [];
    if (options.scopedPending) sessionStorage.removeItem(storageKey);else sessionStorage.setItem(storageKey, original);
    const ctx = {
      state: { currentEvent: { id: eventId, memberAccess: !!options.memberAccess, questions: options.scopedPending ? ['참여 이유'] : [], accessUrl: location.href }, ...(options.inMemory && !options.scopedPending ? { pendingApplications: { [storageKey]: { ...pending } } } : {}) },
      api: async (op, payload) => {
        calls.push({ op, ...payload });
        if (op === options.failureAt) {
          const error = new Error('simulated-legacy-lookup-failure');
          if (options.errorCode) error.code = options.errorCode;
          throw error;
        }
        if (op === 'resolveLink') return { id: 'old-server-record-id' };
        if (op === 'receipt') return { application: { id: 'old-server-record-id', eventId: options.receiptEventId || eventId, name: options.receiptName || '기존 신청 부원' }, event: { id: eventId } };
        if (op === 'memberPortal') return { member: { name: '기존 신청 부원', semester: '2026-2' } };
        if (op === 'apply') throw new Error('simulated-new-apply-response-loss');
        throw new Error('Unexpected legacy recovery operation: ' + op);
      },
      navigate: async (path, settings) => { navigations.push({ path, settings }); return !options.navigationBlocked; },
      toast: () => {}
    };
    try {
      if (options.memberAccess) {
        setMemberSession(ctx, { sessionKey: 'e'.repeat(64), expiresAt: new Date(Date.now() + 7200000).toISOString(), member: options.unloadedMember ? null : { name: '기존 신청 부원', semester: '2026-2' } });
        ctx.state.currentEvent = { id: eventId, memberAccess: true, questions: options.scopedPending ? ['참여 이유'] : [], accessUrl: location.href };
      }
      const form = new FormData();form.set('name', '기존 신청 부원');form.set('studentId', '202600001');form.set('consent', 'on');
      if (options.scopedPending) {
        // Save a real scoped bundle through the submission code before losing
        // the committed response, then retry with a changed payload.
        form.set('answer0', '원래 답변');
        let firstError = '';
        try { await eventSubmit(ctx, 'apply', form); } catch (caught) { firstError = caught.message; }
        if (firstError !== 'simulated-new-apply-response-loss') throw new Error('Expected the first response to be lost');
        pending = JSON.parse(sessionStorage.getItem(storageKey));
        if (!/^[a-f0-9]{64}$/.test(pending.accessScope || '')) throw new Error('Expected a saved scoped application');
        original = JSON.stringify(pending);calls.length = 0;
        if (!options.inMemory) delete ctx.state.pendingApplications;
        if (options.changeSession) {
          setMemberSession(ctx, { sessionKey: 'f'.repeat(64), expiresAt: new Date(Date.now() + 7200000).toISOString(), member: { name: options.newMemberName || '기존 신청 부원', semester: '2026-2' } });
          ctx.state.currentEvent = { id: eventId, memberAccess: true, questions: ['참여 이유'], accessUrl: location.href };
        }
        else if (options.changedName) form.set('name', options.changedName);
        else form.set('answer0', '수정한 답변');
      }
      let error = '';
      try { await eventSubmit(ctx, 'apply', form); } catch (caught) { error = caught.message; }
      return { calls, navigations, error, pending, memoryPending: ctx.state.pendingApplications?.[storageKey] || null, savedPending: JSON.parse(sessionStorage.getItem(storageKey)), storageUnchanged: sessionStorage.getItem(storageKey) === original, expectedReceiptPath: shortLink('r', pending.receiptKey) };
    } finally {
      for (const [key, saved] of [[MEMBER_STORAGE_KEY, previousSession], [storageKey, previousPending]]) {
        if (saved === null) sessionStorage.removeItem(key);else sessionStorage.setItem(key, saved);
      }
    }
  }, options);
}

test('committed pending submissions recover the original receipt without a second or member-bound application', async ({ page }) => {
  for (const options of [
    {}, { memberAccess: true, inMemory: true }, { memberAccess: true, unloadedMember: true }, { memberAccess: true, inMemory: true, navigationBlocked: true },
    { scopedPending: true }, { scopedPending: true, memberAccess: true, inMemory: true },
    { scopedPending: true, memberAccess: true, changeSession: true }, { scopedPending: true, memberAccess: true, inMemory: true, changeSession: true, navigationBlocked: true }
  ]) {
    const result = await pendingRecoveryAttempt(page, options);
    expect(result.error).toBe('');
    expect(result.storageUnchanged).toBe(!!options.navigationBlocked);
    expect(result.savedPending).toEqual(options.navigationBlocked ? result.pending : null);
    expect(result.memoryPending).toEqual(options.navigationBlocked ? result.pending : null);
    expect(result.calls.map(call => call.op)).toEqual(options.unloadedMember ? ['resolveLink', 'receipt', 'memberPortal'] : ['resolveLink', 'receipt']);
    expect(result.calls[0]).toEqual({ op: 'resolveLink', kind: 'r', key: result.pending.receiptKey });
    expect(result.calls[1]).toEqual({ op: 'receipt', id: 'old-server-record-id', key: result.pending.receiptKey, action: 'get' });
    expect(result.navigations).toEqual([{ path: result.expectedReceiptPath, settings: { discard: true } }]);
  }
});

test('unknown pending lookup failures preserve the only receipt token and prevent new application attempts', async ({ page }) => {
  for (const options of [
    { failureAt: 'resolveLink', errorCode: 'functions/unavailable' }, { failureAt: 'receipt', memberAccess: true, inMemory: true },
    { scopedPending: true, failureAt: 'resolveLink', errorCode: 'functions/unavailable' },
    { scopedPending: true, failureAt: 'receipt', memberAccess: true, inMemory: true, changeSession: true }
  ]) {
    const result = await pendingRecoveryAttempt(page, options);
    expect(result.error).toBe('simulated-legacy-lookup-failure');
    expect(result.storageUnchanged).toBe(true);
    expect(result.savedPending).toEqual(result.pending);
    if (options.inMemory) expect(result.memoryPending).toEqual(result.pending);
    expect(result.calls.map(call => call.op)).toEqual(options.failureAt === 'resolveLink' ? ['resolveLink'] : ['resolveLink', 'receipt']);
    expect(result.navigations).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('a pending receipt for another applicant or event stays available before any new application', async ({ page }) => {
  for (const options of [
    { memberAccess: true, receiptName: '다른 신청 부원' }, { receiptEventId: 'another-event' },
    { scopedPending: true, changedName: '다른 신청 부원' },
    { scopedPending: true, memberAccess: true, changeSession: true, newMemberName: '다른 확인 부원' },
    { scopedPending: true, receiptEventId: 'another-event' }
  ]) {
    const result = await pendingRecoveryAttempt(page, options);
    expect(result.storageUnchanged).toBe(true);
    expect(result.savedPending).toEqual(result.pending);
    expect(result.calls.map(call => call.op)).toEqual(['resolveLink', 'receipt']);
    expect(result.navigations).toEqual([]);
    const dialog = page.getByRole('dialog', { name: '이전에 접수된 신청 확인', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: '이전에 접수된 신청 확인', exact: true })).toHaveAttribute('href', result.expectedReceiptPath);
    await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
  }
});

test('a missing or invalid pending receipt permits a fresh scoped retry pair', async ({ page }) => {
  for (const options of [
    { failureAt: 'resolveLink', errorCode: 'functions/not-found' }, { failureAt: 'receipt', errorCode: 'functions/invalid-argument', memberAccess: true },
    { scopedPending: true, failureAt: 'resolveLink', errorCode: 'functions/not-found' },
    { scopedPending: true, failureAt: 'receipt', errorCode: 'functions/invalid-argument', memberAccess: true, changeSession: true }
  ]) {
    const result = await pendingRecoveryAttempt(page, options);
    expect(result.error).toBe('simulated-new-apply-response-loss');
    expect(result.calls.at(-1).op).toBe('apply');
    const applications = result.calls.filter(call => call.op === 'apply');
    expect(applications).toHaveLength(1);
    expect(applications[0].requestId).toBe(result.savedPending.requestId);
    expect(applications[0].receiptKey).toBe(result.savedPending.receiptKey);
    expect(result.savedPending.requestId).not.toBe(result.pending.requestId);
    expect(result.savedPending.receiptKey).not.toBe(result.pending.receiptKey);
    expect(result.savedPending.accessScope).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(result.savedPending).sort()).toEqual(['accessScope', 'receiptKey', 'requestId']);
    expect(result.navigations).toEqual([]);
  }
});
