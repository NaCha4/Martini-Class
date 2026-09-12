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
  for (const key of ['name', 'studentId', 'phone']) await dialog.locator('[name=' + key + ']').fill(person[key]);
}

async function submitDialog(page, title) {
  await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function verifyMember(page) {
  await page.goto('/members');
  await action(page, 'member-verify').click();
  await fillIdentity(page.getByRole('dialog'));
  await submitDialog(page, '부원 확인하기');
  await expect(action(page, 'member-forget')).toBeVisible();
}

async function loginAdmin(page, baseURL) {
  await page.goto(baseURL + '/admin');
  await page.getByRole('button', { name: '가상 임원으로 확인하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영 현황', exact: true })).toBeVisible();
  await page.goto(baseURL + '/admin/requests');
  await expect(page.getByRole('heading', { name: '신청 · 문의', exact: true })).toBeVisible();
}

function visitTime(hours) {
  const time = new Date(Date.now() + hours * 3600000);
  time.setMinutes(0, 0, 0);
  const local = new Date(time.getTime() - time.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function submitVisit(page, purpose) {
  await action(page, 'member-visit').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name=startsAt]').fill(visitTime(48));
  await dialog.locator('[name=endsAt]').fill(visitTime(50));
  await dialog.locator('[name=guestCount]').fill('2');
  await dialog.locator('[name=guestNames]').fill('가상 방문자 가, 가상 방문자 나');
  await dialog.locator('[name=purpose]').fill(purpose);
  await dialog.locator('[name=consent]').check();
  await submitDialog(page, '출입 승인 요청');
  await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인 대기');
}

test('member verification rejects wrong identity and can be cleared on a shared device', async ({ page }) => {
  await page.goto('/members');
  await expect(page.locator('h1')).toBeVisible();
  for (const name of ['member-verify', 'member-visit', 'member-join', 'member-inquiry']) await expect(action(page, name)).toBeVisible();
  await action(page, 'member-verify').click();
  await fillIdentity(page.getByRole('dialog'), { ...member, phone: '01099999999' });
  await page.getByRole('dialog').getByRole('button', { name: '부원 확인하기', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.form-error')).toContainText('확인할 수 없습니다');
  await page.getByRole('dialog').locator('[name=phone]').fill(member.phone);
  await submitDialog(page, '부원 확인하기');
  await expect(action(page, 'member-forget')).toBeVisible();
  await expect(page.locator('.member-event').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '진행 중인 행사', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '새로운 소식', exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/member-portal-hub-' + test.info().project.name + '.png' });
  await page.reload();
  await expect(action(page, 'member-forget')).toBeVisible();
  await action(page, 'member-forget').click();
  await submitDialog(page, '이 기기에서 나가기');
  await expect(action(page, 'member-verify')).toBeVisible();
  await expect(action(page, 'member-forget')).toHaveCount(0);
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
    await expect(dialog).toContainText('방문 종료');
    await dialog.locator('[name=response]').fill('신청한 시간에 부원과 함께 방문해 주세요.');
    await submitDialog(admin, '승인');
    await expect(adminRequest(admin, purpose).locator('.request-status')).toHaveText('승인');
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await action(page, 'member-refresh').click();
    await expect(ownRequest(page, purpose).locator('.member-status')).toHaveText('승인');
    await ownRequest(page, purpose).click();
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

test('prospective member can submit a join request and read the officer reply to an inquiry', async ({ page, browser, baseURL }) => {
  const suffix = unique();
  const applicant = { name: '가입 검증 ' + suffix, studentId: '2099' + String(Date.now()).slice(-5), phone: '01088887777' };
  const department = '검증학과 ' + suffix;
  await page.goto('/members');
  await action(page, 'member-join').click();
  await fillIdentity(page.getByRole('dialog'), applicant);
  await page.getByRole('dialog').locator('[name=department]').fill(department);
  await page.getByRole('dialog').locator('[name=grade]').selectOption('2학년');
  await page.getByRole('dialog').locator('[name=message]').fill('칵테일 교육에 참여하고 싶습니다.');
  await page.getByRole('dialog').locator('[name=consent]').check();
  await submitDialog(page, '가입 신청 보내기');
  await expect(page.locator('.member-request-row').filter({ hasText: /가입/ }).first().locator('.member-status')).toHaveText('승인 대기');

  const subject = '가입 전 문의 ' + suffix;
  await action(page, 'member-inquiry').click();
  await fillIdentity(page.getByRole('dialog'), applicant);
  await page.getByRole('dialog').locator('[name=subject]').fill(subject);
  await page.getByRole('dialog').locator('[name=message]').fill('첫 교육에 준비해야 할 도구가 있나요?');
  await page.getByRole('dialog').locator('[name=consent]').check();
  let lostSubmissionResponse = false;
  await page.route('**/martiniApi', async route => {
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    if (!lostSubmissionResponse && body?.data?.op === 'submitClubRequest' && body.data.kind === 'inquiry') {
      const savedResponse = await route.fetch();
      expect(savedResponse.ok()).toBeTruthy();
      lostSubmissionResponse = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('dialog').getByRole('button', { name: '문의 보내기', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.form-error')).toContainText('연결하지 못했습니다');
  expect(lostSubmissionResponse).toBeTruthy();
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(ownRequest(page, subject)).toHaveCount(1);
  await expect(ownRequest(page, subject).locator('.member-status')).toHaveText('답변 대기');
  expect(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('martini-member-lounge-v1')).pending.inquiry)).toBeTruthy();

  const adminContext = await browser.newContext({ viewport: page.viewportSize() });
  const admin = await adminContext.newPage();
  try {
    await loginAdmin(admin, baseURL);
    await adminRequest(admin, department).getByRole('button', { name: '검토', exact: true }).click();
    await expect(admin.getByRole('dialog')).toContainText(applicant.name);
    await admin.getByRole('dialog').locator('[name=decision]').selectOption('reject');
    await admin.getByRole('dialog').locator('[name=response]').fill('가입 검증 완료: 이번 신청은 테스트이므로 반려합니다.');
    await submitDialog(admin, '반려');
    await expect(adminRequest(admin, department).locator('.request-status')).toHaveText('반려');
    await adminRequest(admin, subject).getByRole('button', { name: '검토', exact: true }).click();
    const reply = '필요한 도구는 동아리에서 준비합니다. 편하게 참여해 주세요.';
    await admin.getByRole('dialog').locator('[name=response]').fill(reply);
    await submitDialog(admin, '답변 저장');
    await expect(adminRequest(admin, subject).locator('.request-status')).toHaveText('답변 완료');
    await page.reload();
    await expect(ownRequest(page, subject).locator('.member-status')).toHaveText('답변 완료');
    await ownRequest(page, subject).click();
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
    await expect(page.locator('.member-request-row').filter({ hasText: '동아리 가입 신청' }).first().locator('.member-status')).toHaveText('반려');

    const reopenedContext = await browser.newContext({ viewport: page.viewportSize() });
    try {
      const reopened = await reopenedContext.newPage();
      await reopened.goto(receiptLink);
      await expect(reopened.locator('.member-receipt-banner')).toContainText('개인 확인 링크의 신청을 불러왔습니다.');
      await expect(reopened.locator('.member-request-row')).toHaveCount(1);
      await reopened.locator('.member-receipt-banner').getByRole('button', { name: '신청 내역 보기', exact: true }).click();
      await expect(reopened.getByRole('dialog')).toContainText(subject);
      await expect(reopened.getByRole('dialog')).toContainText(reply);
      expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    } finally {
      await reopenedContext.close();
    }
  } finally {
    await adminContext.close();
  }
});

test('member lounge event card supports application and receipt cancellation', async ({ page, browser, baseURL }) => {
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
    await page.locator('.member-event').filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/members\/events\/[a-zA-Z0-9_-]+$/);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const application = page.locator('form[data-form=apply]');
    await expect(application).toBeVisible();
    await application.locator('[name=name]').fill(member.name);
    await application.locator('[name=studentId]').fill(member.studentId);
    await application.locator('[name=consent]').check();
    await application.getByRole('button', { name: '신청하기', exact: true }).click();
    await expect(page.locator('.receipt-card').getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('.receipt-status')).toContainText('참가 등록');
    await page.reload();
    await expect(page.locator('.receipt-status')).toContainText('참가 등록');
    await page.getByRole('button', { name: '신청 취소', exact: true }).click();
    await submitDialog(page, '신청 취소');
    await expect(page.locator('.receipt-status')).toContainText('취소');
  } finally {
    await adminContext.close();
  }
});
