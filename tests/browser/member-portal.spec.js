import { test, expect } from '@playwright/test';

const member = { name: '가상부원 가', studentId: '202600001', phone: '01000000001' };
const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const action = (page, name) => page.locator('[data-action="' + name + '"]').first();
const ownRequest = (page, text) => page.locator('.member-request-row').filter({ hasText: text });
const adminRequest = (page, text) => page.locator('.request-entry').filter({ hasText: text });

test.beforeEach(async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5173') throw new Error('Member portal tests require the local emulator-backed development server.');
  page._portalErrors = [];
  page.on('pageerror', error => page._portalErrors.push(error.message));
});

test.afterEach(async ({ page }, info) => {
  expect(page._portalErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: '.local/screenshots/member-portal-' + info.project.name + '-' + info.title.replace(/[^a-z0-9]+/gi, '-') + '.jpg', type: 'jpeg', quality: 75 });
});

async function fillIdentity(dialog, person = member) {
  await expect(dialog.locator('[name=phone], input[type=tel]')).toHaveCount(0);
  for (const key of ['name', 'studentId']) await dialog.locator('[name=' + key + ']').fill(person[key]);
}

async function submitDialog(page, title) {
  await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function loginHere(page) {
  const form = page.locator('form[data-form="member-login"]');
  await expect(form).toBeVisible();
  await expect(page.getByRole('navigation', { name: '부원 메뉴', exact: true })).toHaveCount(0);
  await fillIdentity(form);
  await form.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(form).toHaveCount(0);
}

async function verifyMember(page) {
  await page.goto('/members');
  await loginHere(page);
  await expect(page.locator('.member-account-bar')).toContainText(member.name);
}

async function loginAdmin(page, baseURL) {
  await page.goto(baseURL + '/admin');
  await page.getByRole('button', { name: '가상 임원으로 확인하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영 현황', exact: true })).toBeVisible();
  await page.goto(baseURL + '/admin/requests');
  await expect(page.getByRole('heading', { name: '신청 · 문의', exact: true })).toBeVisible();
  await expect(page.locator('.request-queue-summary > div')).toHaveCount(2);
  await expect(page.locator('.request-queue-summary')).not.toContainText('가입');
}

function visitDay(days=2) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + days * 86400000));
}

async function selectVisitDay(dialog, day) {
  while (await dialog.locator('[data-visit-calendar]').getAttribute('data-month') !== day.slice(0, 7)) {
    const month = await dialog.locator('[data-visit-calendar]').getAttribute('data-month');
    await dialog.getByRole('button', { name: month < day.slice(0, 7) ? '다음 달' : '이전 달', exact: true }).click();
  }
  await dialog.locator('[data-visit-day="' + day + '"]').click();
  await expect(dialog.locator('[data-visit-day="' + day + '"]')).toHaveAttribute('aria-pressed', 'true');
}

async function submitVisit(page, purpose) {
  const destination = page.url();
  await page.locator('#member-visits').scrollIntoViewIfNeeded();
  await action(page, 'member-visit').click();
  const dialog = page.getByRole('dialog');
  await selectVisitDay(dialog, visitDay());
  await dialog.locator('[name=startTime]').fill('18:00');
  await expect(dialog.locator('[name=endTime], [name=endNextDay]')).toHaveCount(0);
  await dialog.locator('.visit-guest-option').filter({ hasText: '2명' }).click();
  await dialog.locator('[name=guestNames]').fill('가상 방문자 가, 가상 방문자 나');
  await dialog.locator('[name=purpose]').fill(purpose);
  await dialog.locator('[name=consent]').check();
  await submitDialog(page, '출입 승인 요청');
  await expect(page).toHaveURL(destination);
  await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인 대기');
}

test('visit calendar preserves input across months and validates dates, start time and the three-guest limit', async ({ page }, info) => {
  await verifyMember(page);
  const dates = await page.evaluate(async () => {
    const { koreaDay, visitSchedule } = await import('/src/visit-calendar.js');
    const data = new FormData();
    data.set('visitDate', '2026-12-31');data.set('startTime', '23:00');
    return [koreaDay('2026-12-31T15:00:00Z'), visitSchedule(data)];
  });
  expect(dates).toEqual(['2027-01-01', { startsAt: '2026-12-31T23:00' }]);
  await page.locator('#member-visits').scrollIntoViewIfNeeded();
  await action(page, 'member-visit').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '이전 달', exact: true })).toBeDisabled();
  const today = visitDay(0);
  for (const day of await dialog.locator('[data-visit-day]').all()) {
    if (await day.getAttribute('data-visit-day') < today) await expect(day).toBeDisabled();
  }
  await dialog.locator('[name=startTime]').fill('23:00');
  await expect(dialog.locator('[name=endTime], [name=endNextDay]')).toHaveCount(0);
  await expect(dialog.getByRole('radio')).toHaveCount(3);
  await expect(dialog.getByRole('radio', { name: '1명', exact: true })).toBeChecked();
  await expect(dialog.locator('input[type=number]')).toHaveCount(0);
  await dialog.getByRole('radio', { name: '1명', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: '2명', exact: true })).toBeChecked();
  await dialog.locator('.visit-guest-option').filter({ hasText: '3명' }).click();
  const purpose = '달력 야간 방문 ' + unique();
  await dialog.locator('[name=purpose]').fill(purpose);
  await dialog.locator('[name=guestNames]').fill('가상 가, 가상 나, 가상 다');
  await dialog.locator('[name=consent]').check();
  const submit = dialog.getByRole('button', { name: '출입 승인 요청', exact: true });
  await submit.click();
  await expect(dialog.locator('.form-error')).toContainText('달력에서 방문 날짜');
  await selectVisitDay(dialog, visitDay());
  await dialog.getByRole('button', { name: '다음 달', exact: true }).click();
  await dialog.getByRole('button', { name: '이전 달', exact: true }).click();
  await expect(dialog.locator('[data-visit-day="' + visitDay() + '"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('[name=purpose]')).toHaveValue(purpose);
  await expect(dialog.getByRole('radio', { name: '3명', exact: true })).toBeChecked();
  await dialog.locator('.visit-guest-option').filter({ hasText: '1명' }).click();
  await expect(dialog.locator('[data-visit-summary]')).toContainText('외부인 1명');
  await dialog.locator('.visit-guest-option').filter({ hasText: '2명' }).click();
  await expect(dialog.locator('[data-visit-summary]')).toContainText('외부인 2명');
  await dialog.locator('.visit-guest-option').filter({ hasText: '3명' }).click();
  await expect(dialog.locator('[data-visit-summary]')).toContainText('23:00 시작 · 외부인 3명');
  await selectVisitDay(dialog, visitDay(90));
  await expect(dialog.getByRole('button', { name: '다음 달', exact: true })).toBeDisabled();
  for (const day of await dialog.locator('[data-visit-day]').all()) {
    if (await day.getAttribute('data-visit-day') > visitDay(90)) await expect(day).toBeDisabled();
  }
  await selectVisitDay(dialog, visitDay());
  await dialog.locator('.dialog-scroll').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: '.local/screenshots/visit-calendar-' + info.project.name + '.png' });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await dialog.locator('[name=purpose]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/screenshots/visit-calendar-details-' + info.project.name + '.png' });
  const requestPromise = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/martiniApi') && request.postDataJSON()?.data?.op === 'submitClubRequest');
  await submitDialog(page, '출입 승인 요청');
  const payload = (await requestPromise).postDataJSON().data;
  expect(payload.guestCount).toBe(3);
  expect(payload.startsAt).toBe(new Date(visitDay() + 'T23:00:00+09:00').toISOString());
  expect(payload).not.toHaveProperty('endsAt');
  expect(payload).not.toHaveProperty('phone');
  await expect(page).toHaveURL(/\/members$/);
  await expect(ownRequest(page, purpose)).toContainText('외부인 3명');
});

test('member verification rejects wrong identity and can be cleared on a shared device', async ({ page }) => {
  await page.goto('/members');
  await expect(page.getByRole('heading', { name: '부원 로그인', exact: true })).toBeVisible();
  const login = page.locator('form[data-form="member-login"]');
  await expect(login).toBeVisible();
  await expect(page.getByRole('navigation', { name: '부원 메뉴', exact: true })).toHaveCount(0);
  await expect(action(page, 'member-join')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '동아리 가입 신청', exact: true })).toHaveCount(0);
  await fillIdentity(login, { ...member, name: '명부에 없는 이름' });
  await login.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(login.locator('.form-error')).toContainText('로그인할 수 없습니다');
  await expect(page.getByRole('navigation', { name: '부원 메뉴', exact: true })).toHaveCount(0);
  await login.locator('[name=name]').fill(member.name);
  await login.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(login).toHaveCount(0);
  await expect(page.locator('.member-account-bar')).toContainText(member.name);
  await expect(page.locator('.member-event')).toHaveCount(0);
  await expect(page.locator('.member-services > button.member-service-card')).toHaveCount(3);
  for (const [section, title] of [['visits', '외부인 출입신청'], ['events', '행사'], ['partners', '제휴']]) {
    const card = page.locator('#member-' + section);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(card).toContainText(title);
    await expect(card.locator('button, a, input, select, .member-request-row, .member-application-row')).toHaveCount(0);
    await expect(page).toHaveURL(/\/members$/);
  }
  await expect(page.locator('.member-home-grid, .member-home-notices, .member-home-coupon, #member-coupons, [data-coupon-state], [data-action="member-section"], [data-action="member-inquiry"], #member-more, .member-lounge details, .member-lounge summary')).toHaveCount(0);
  const menu = page.getByRole('navigation', { name: '부원 메뉴', exact: true });
  await expect(menu).toHaveCount(0);
  await page.screenshot({ path: '.local/screenshots/member-portal-hub-' + test.info().project.name + '.png' });
  await page.reload();
  await expect(page.locator('.member-account-bar')).toContainText(member.name);
  await page.locator('#member-visits').scrollIntoViewIfNeeded();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.locator('#member-visits[data-action="member-visit"]')).toBeVisible();
  await expect(action(page, 'member-inquiry')).toHaveCount(0);
  await action(page, 'member-forget').click();
  await expect(page.locator('form[data-form="member-login"]')).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(action(page, 'member-forget')).toHaveCount(0);
});

test('three large service buttons open popups and leave all application records below the cards', async ({ page }) => {
  await verifyMember(page);
  const destination = page.url();
  await expect(page.locator('.member-services > button.member-service-card')).toHaveCount(3);
  await expect(page.locator('.member-services .member-request-row, .member-services .member-application-row')).toHaveCount(0);
  expect(await page.locator('#member-records').evaluate(el => !!(document.querySelector('.member-services').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
  await action(page, 'member-events').click();
  const eventDialog = page.getByRole('dialog');
  await expect(eventDialog).toHaveClass(/member-events-dialog/);
  await expect(eventDialog.locator('.member-event').first()).toBeVisible();
  await eventDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.member-event')).toHaveCount(0);
  await action(page, 'member-partners').click();
  await expect(page.getByRole('dialog')).toHaveClass(/member-partners-dialog/);
  await expect(page.getByRole('dialog')).toContainText('등록된 제휴 정보가 없습니다.');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(page).toHaveURL(destination);
  await action(page, 'member-visit').click();
  await expect(page.getByRole('dialog')).toContainText('외부인 출입 신청');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(page).toHaveURL(destination);
});

test('visitor request passes through officer approval and both future and pending visits can be cancelled', async ({ page, browser, baseURL }) => {
  await verifyMember(page);
  const purpose = '승인 검증 방문 ' + unique();
  await submitVisit(page, purpose);
  const adminContext = await browser.newContext({ viewport: page.viewportSize() });
  const admin = await adminContext.newPage();
  try {
    await loginAdmin(admin, baseURL);
    await admin.screenshot({ path: '.local/screenshots/member-portal-admin-' + test.info().project.name + '.png' });
    await adminRequest(admin, purpose).getByRole('button', { name: '검토', exact: true }).click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toContainText(member.name);
    await expect(dialog).toContainText('가상 방문자 가');
    await expect(dialog).toContainText('방문 시작');
    await expect(dialog).not.toContainText('방문 종료');
    await dialog.locator('[name=response]').fill('신청한 시간에 부원과 함께 방문해 주세요.');
    await submitDialog(admin, '승인');
    await expect(adminRequest(admin, purpose).locator('.request-status')).toHaveText('승인');
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await action(page, 'member-refresh').click();
    await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인');
    await ownRequest(page, purpose).click();
    await expect(page.getByRole('dialog')).not.toContainText('방문 종료');
    await expect(page.getByRole('dialog')).toContainText('신청한 시간에 부원과 함께 방문해 주세요.');
    await page.getByRole('dialog').locator('[data-action=member-cancel]').click();
    await submitDialog(page, '신청 취소');
    await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('취소');
    await admin.reload();
    await expect(adminRequest(admin, purpose).locator('.request-status')).toHaveText('취소');

    const cancelled = '취소 검증 방문 ' + unique();
    await submitVisit(page, cancelled);
    await ownRequest(page, cancelled).click();
    await page.getByRole('dialog').locator('[data-action=member-cancel]').click();
    await submitDialog(page, '신청 취소');
    await expect(ownRequest(page, cancelled).locator('.member-status')).toHaveText('취소');
    await admin.reload();
    await expect(adminRequest(admin, cancelled).locator('.request-status')).toHaveText('취소');
    await expect(adminRequest(admin, cancelled).getByRole('button', { name: '검토', exact: true })).toHaveCount(0);
  } finally {
    await adminContext.close();
  }
});

test('a logged-in member can recover a visitor request and its personal link requires login before opening', async ({ page, browser, baseURL }) => {
  const suffix = unique();
  const applicant = member;
  await page.goto('/members');
  await expect(action(page, 'member-join')).toHaveCount(0);
  await expect(action(page, 'member-inquiry')).toHaveCount(0);
  await loginHere(page);

  const purpose = '접수 응답 복구 방문 ' + suffix;
  await action(page, 'member-visit').click();
  await expect(page.getByRole('dialog').locator('[name=name], [name=studentId], [name=phone]')).toHaveCount(0);
  await selectVisitDay(page.getByRole('dialog'), visitDay());
  await page.getByRole('dialog').locator('[name=startTime]').fill('18:00');
  await page.getByRole('dialog').locator('[name=guestNames]').fill('가상 방문자 가');
  await page.getByRole('dialog').locator('[name=purpose]').fill(purpose);
  await page.getByRole('dialog').locator('[name=consent]').check();
  let lostSubmissionResponse = false;
  await page.route('**/martiniApi', async route => {
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    if (body?.data?.op === 'submitClubRequest') expect(body.data).not.toHaveProperty('phone');
    if (!lostSubmissionResponse && body?.data?.op === 'submitClubRequest' && body.data.kind === 'visit') {
      const savedResponse = await route.fetch();
      expect(savedResponse.ok()).toBeTruthy();
      lostSubmissionResponse = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('dialog').getByRole('button', { name: '출입 승인 요청', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.form-error')).toContainText('연결하지 못했습니다');
  expect(lostSubmissionResponse).toBeTruthy();
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/members$/);
  await expect(ownRequest(page, purpose)).toHaveCount(1);
  await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인 대기');
  expect(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('martini-member-lounge-v1')).pending.visit)).toBeTruthy();

  const adminContext = await browser.newContext({ viewport: page.viewportSize() });
  const admin = await adminContext.newPage();
  try {
    await loginAdmin(admin, baseURL);
    await adminRequest(admin, purpose).getByRole('button', { name: '검토', exact: true }).click();
    await expect(admin.getByRole('dialog')).toContainText(applicant.name);
    const reply = '신청한 시간에 부원과 함께 방문해 주세요.';
    await admin.getByRole('dialog').locator('[name=response]').fill(reply);
    await submitDialog(admin, '승인');
    await expect(adminRequest(admin, purpose).locator('.request-status')).toHaveText('승인');
    await page.reload();
    await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인');
    await ownRequest(page, purpose).click();
    await expect(page.getByRole('dialog')).toContainText(reply);
    // Capture the copy action without changing the desktop user's clipboard.
    await page.evaluate(() => {
      window._portalCopiedLink = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window._portalCopiedLink = value; } } });
    });
    await page.getByRole('dialog').locator('[data-action=member-receipt-copy]').click();
    const receiptLink = await page.evaluate(() => window._portalCopiedLink);
    expect(Boolean(receiptLink && new URL(receiptLink).hash.startsWith('#request='))).toBeTruthy();
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(ownRequest(page, purpose)).toHaveCount(1);

    const reopenedContext = await browser.newContext({ viewport: page.viewportSize() });
    try {
      const reopened = await reopenedContext.newPage();
      await reopened.goto(receiptLink);
      await expect(reopened.locator('.member-receipt-banner')).toHaveCount(0);
      await loginHere(reopened);
      await expect(reopened.locator('.member-receipt-banner')).toContainText('개인 확인 링크의 신청을 불러왔습니다.');
      await reopened.locator('.member-receipt-banner').getByRole('button', { name: '신청 내역 보기', exact: true }).click();
      await expect(reopened.getByRole('dialog')).toContainText(purpose);
      await expect(reopened.getByRole('dialog')).toContainText(reply);
      expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    } finally {
      await reopenedContext.close();
    }
  } finally {
    await adminContext.close();
  }
});

test('member event application uses verified identity and its direct detail survives reload and a lost session', async ({ page, browser, baseURL }) => {
  const title = '라운지 행사 검증 ' + unique();
  const adminContext = await browser.newContext({ viewport: page.viewportSize() });
  const admin = await adminContext.newPage();
  try {
    await loginAdmin(admin, baseURL);
    await admin.goto(baseURL + '/admin/events');
    await admin.getByRole('button', { name: '행사 만들기', exact: true }).click();
    await admin.getByRole('dialog').locator('[name=title]').fill(title);
    await admin.getByRole('dialog').locator('[name=status]').selectOption('open');
    await admin.getByRole('dialog').getByRole('button', { name: '행사 저장', exact: true }).click();
    await expect(admin.locator('[name=shareUrl]')).toBeVisible();
    await admin.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();

    await verifyMember(page);
    await action(page, 'member-events').click();
    await page.locator('.member-event').filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible();
    const application = page.locator('form[data-form=apply]');
    await expect(application).toBeVisible();
    await expect(application.locator('[name=name], [name=studentId], [name=phone]')).toHaveCount(0);
    await expect(application.locator('.member-form-identity')).toContainText('확인된 부원 정보로 신청합니다.');
    await application.locator('[name=consent]').check();
    const submission = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/martiniApi') && request.postDataJSON()?.data?.op === 'apply');
    await application.getByRole('button', { name: '신청하기', exact: true }).click();
    const payload = (await submission).postDataJSON().data;
    expect(payload.sessionKey).toMatch(/^[a-f0-9]{64}$/);
    for (const key of ['name', 'studentId', 'phone']) expect(payload).not.toHaveProperty(key);
    await expect(page).toHaveURL(/\/members$/);
    const ownApplication = page.locator('.member-application-row').filter({ hasText: title });
    const applicationId = await ownApplication.getAttribute('data-id');
    const detailLink = new URL('/members/applications/' + applicationId, baseURL).href;
    await expect(page.locator('.receipt-card').getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('.receipt-status')).toContainText('참가 등록');
    const recovery = page.locator('details.member-receipt-recovery');
    await expect(recovery).not.toHaveAttribute('open', '');
    await recovery.locator('summary').click();
    await expect(recovery).toContainText('내 신청');
    await page.evaluate(() => {
      window._portalCopiedLink = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window._portalCopiedLink = value; } } });
    });
    await action(page, 'receipt-copy').click();
    expect(await page.evaluate(() => window._portalCopiedLink)).toBe(detailLink);
    await page.reload();
    await expect(page.locator('.receipt-card')).toHaveCount(0);
    await ownApplication.click();
    await expect(page.locator('.receipt-status')).toContainText('참가 등록');
    await page.goto('/members/applications');
    await expect(ownApplication).toHaveAttribute('data-id', applicationId);
    await expect(ownApplication).toHaveAttribute('data-action', 'member-application-open');
    await ownApplication.click();
    await expect(page).toHaveURL(/\/members\/applications$/);
    const reopenedContext = await browser.newContext({ viewport: page.viewportSize() });
    try {
      const reopened = await reopenedContext.newPage();
      await reopened.goto(detailLink);
      await expect(reopened).toHaveURL(detailLink);
      await expect(reopened.locator('.receipt-card')).toHaveCount(0);
      await loginHere(reopened);
      await expect(reopened).toHaveURL(detailLink);
      await expect(reopened.locator('.receipt-card').getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(reopened.locator('.receipt-status')).toContainText('참가 등록');
      expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    } finally {
      await reopenedContext.close();
    }
    await page.getByRole('button', { name: '신청 취소', exact: true }).click();
    const cancellation = page.getByRole('dialog', { name: '신청을 취소할까요?', exact: true });
    await cancellation.getByRole('button', { name: '신청 취소', exact: true }).click();
    await expect(cancellation).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveClass(/member-detail-dialog/);
    await expect(page.locator('.receipt-status')).toContainText('취소');
  } finally {
    await adminContext.close();
  }
});
