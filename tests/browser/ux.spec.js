import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5173') {
    throw new Error('UX regressions must run only against the local emulator-backed app.');
  }
  page._uxErrors = [];
  page.on('pageerror', error => page._uxErrors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page._uxErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});

async function readyPublic(page) {
  await page.goto('/about');
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function loginMembers(page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: '가상 임원으로 확인하기' }).click();
  await expect(page.getByRole('heading', { name: '운영 현황' })).toBeVisible();
  await page.goto('/admin/members');
  await expect(page.getByRole('button', { name: '부원 등록', exact: true })).toBeVisible();
}

test('scrollbar space and modal preserve horizontal geometry and background position', async ({ page }) => {
  await readyPublic(page);
  await page.evaluate(async () => {
    const { modal } = await import('/src/ui.js');
    document.querySelector('#app').hidden = true;
    const fixture = document.createElement('section');
    fixture.id = 'ux-geometry';
    fixture.style.height = '320px';
    fixture.innerHTML = '<div id="ux-probe" style="width:min(600px,80%);height:48px;margin:0 auto">너비 기준</div><button id="ux-open" type="button" class="button" style="position:fixed;left:24px;top:24px">안내 열기</button>';
    document.body.append(fixture);
    document.querySelector('#ux-open').onclick = () => modal('스크롤 위치 확인', '<p class="wide">안내를 닫아도 읽던 위치를 유지합니다.</p>', null);
  });
  const bounds = () => page.locator('#ux-probe').boundingBox();
  const shortBounds = await bounds();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toContain('stable');
  await page.locator('#ux-geometry').evaluate(element => { element.style.height = '3000px'; });
  const longBounds = await bounds();
  expect(Math.abs(longBounds.x - shortBounds.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(longBounds.width - shortBounds.width)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await page.locator('#ux-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const modalBounds = await bounds();
  expect(Math.abs(modalBounds.x - longBounds.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(modalBounds.width - longBounds.width)).toBeLessThanOrEqual(1);
  const lockedScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(2, 200);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(150); // Allow a real wheel event to settle before checking the lock.
  expect(await page.evaluate(() => window.scrollY)).toBe(lockedScroll);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await expect(page.locator('#ux-open')).toBeFocused();
  const restoredBounds = await bounds();
  expect(Math.abs(restoredBounds.x - longBounds.x)).toBeLessThanOrEqual(1);
});

test('unchanged member dialog supports keyboard focus and Escape return', async ({ page }) => {
  await loginMembers(page);
  const opener = page.getByRole('button', { name: '부원 등록', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toBeFocused();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('dirty member dialog preserves edits until discard is explicitly chosen', async ({ page }) => {
  await loginMembers(page);
  const opener = page.getByRole('button', { name: '부원 등록', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name=name]').fill('작성 중인 부원');
  await page.keyboard.press('Escape');
  const confirmation = page.locator('#discard-changes');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(dialog.locator('[name=name]')).toHaveValue('작성 중인 부원');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '변경사항 버리기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('pending save blocks duplicates and dismissal while a failed save preserves input for retry', async ({ page }) => {
  await readyPublic(page);
  await page.evaluate(async () => {
    const { modal, field } = await import('/src/ui.js');
    window.__uxSaveCalls = 0;
    window.__uxSavedValues = [];
    const opener = document.createElement('button');
    opener.id = 'ux-save-opener';
    opener.type = 'button';
    opener.textContent = '작성 시작';
    document.body.append(opener);
    opener.focus();
    modal('저장 결과 확인', field('memo', '기록 내용', '', { required: true, wide: true }), async form => {
      window.__uxSaveCalls += 1;
      window.__uxSavedValues.push(form.get('memo'));
      if (window.__uxSaveCalls === 1) {
        await new Promise((resolve, reject) => { window.__uxRejectSave = reject; });
      }
    });
  });
  const dialog = page.getByRole('dialog');
  const input = dialog.locator('[name=memo]');
  await input.fill('실패해도 남아 있어야 하는 기록');
  const submit = dialog.locator('button[type=submit]');
  await submit.click();
  await expect(submit).toBeDisabled();
  // requestSubmit also covers Enter/queued submission events after the first click.
  await dialog.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await page.keyboard.press('Escape');
  await dialog.locator('[data-close]').first().evaluate(button => button.click());
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__uxSaveCalls)).toBe(1);
  await page.evaluate(() => window.__uxRejectSave(new Error('연결이 잠시 끊겼습니다. 다시 저장해 주세요.')));
  await expect(dialog.locator('.form-error')).toContainText('다시 저장해 주세요.');
  await expect(input).toHaveValue('실패해도 남아 있어야 하는 기록');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__uxSaveCalls)).toBe(2);
  expect(await page.evaluate(() => window.__uxSavedValues)).toEqual([
    '실패해도 남아 있어야 하는 기록',
    '실패해도 남아 있어야 하는 기록',
  ]);
});

test('empty search explains the result and reset restores the member list', async ({ page }) => {
  await loginMembers(page);
  const visibleRows = page.locator('[data-searchable]:visible');
  await expect(visibleRows.first()).toBeVisible();
  const before = await visibleRows.count();
  const search = page.locator('[data-search]');
  await search.fill('일치하지않는검색어-UX-없는부원');
  await expect(visibleRows).toHaveCount(0);
  await expect(page.locator('#filtered-count')).toBeVisible();
  await expect(page.locator('#filtered-count')).toContainText('0');
  const reset = page.locator('[data-action=reset-filters]').filter({ visible: true });
  await expect(reset.first()).toBeVisible();
  await reset.first().click();
  await expect(search).toHaveValue('');
  await expect(visibleRows).toHaveCount(before);
  await expect(search).toBeFocused();
});

test('SPA navigation announces the new heading and preserves modified link clicks', async ({ page, isMobile }) => {
  await readyPublic(page);
  const hrefBefore = page.url();
  const modifiedClicks = await page.locator('a[data-nav][href="/activities"]').first().evaluate(anchor => {
    return [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ].map(modifiers => {
      let preventedByApp = null;
      // This observer is registered after the app listener. Prevent the browser's
      // actual new-window/download action only after recording the app behavior.
      const observer = event => {
        preventedByApp = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', observer, { once: true });
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }));
      return preventedByApp;
    });
  });
  expect(modifiedClicks).toEqual([false, false, false, false, false]);
  expect(page.url()).toBe(hrefBefore);
  if (isMobile) await page.locator('.public-mobile-menu summary').click();
  await page.locator('a[data-nav][href="/activities"]:visible').first().click();
  await expect(page).toHaveURL(/\/activities\/?$/);
  const heading = page.locator('h1');
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  expect(await page.title()).toContain((await heading.textContent()).trim());
});


test('same-route refresh retains the rendered event and scroll while its read is pending', async ({ page }) => {
  const eventPath = '/e/demo-opening#key=' + 'a'.repeat(64);
  await page.goto(eventPath);
  const form = page.locator('form[data-form=apply]');
  await expect(form).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const originalHeading = await page.locator('h1').textContent();
  const originalUrl = page.url();
  const initial = await page.evaluate(() => {
    const available = document.documentElement.scrollHeight - innerHeight;
    const scroll = Math.min(240, available);
    window.scrollTo({ top: scroll, behavior: 'instant' });
    document.querySelector('form[data-form=apply] [name=name]').focus({ preventScroll: true });
    window.__uxKeptView = document.querySelector('.application-layout');
    return { available, scroll, height: document.querySelector('#app').getBoundingClientRect().height };
  });
  expect(initial.available).toBeGreaterThan(0);

  try {
    await page.evaluate(async () => {
      const { ctx } = await import(document.querySelector('script[type=module][src*="/src/main.js"]').src);
      const originalApi = ctx.api;
      const gate = new Promise(resolve => { window.__uxReleaseRead = resolve; });
      window.__uxReadStarted = false;
      window.__uxRefreshFinished = false;
      ctx.api = async (operation, ...args) => {
        if (operation === 'eventAccess') {
          window.__uxReadStarted = true;
          await gate;
        }
        return originalApi(operation, ...args);
      };
      // The real server read still runs after release; only its start is gated.
      window.__uxRefreshPromise = ctx.render().finally(() => {
        ctx.api = originalApi;
        window.__uxRefreshFinished = true;
      });
    });
    await expect.poll(() => page.evaluate(() => window.__uxReadStarted)).toBe(true);
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#page-progress')).toBeVisible();
    expect(await page.locator('h1').textContent()).toBe(originalHeading);
    expect(await page.evaluate(() => document.querySelector('.application-layout') === window.__uxKeptView)).toBe(true);
    expect(await page.evaluate(() => document.querySelector('#app .loading') === null)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(initial.scroll);
    expect(Math.abs(await page.locator('#app').evaluate(element => element.getBoundingClientRect().height) - initial.height)).toBeLessThanOrEqual(1);
    expect(page.url()).toBe(originalUrl);

    await page.evaluate(() => window.__uxReleaseRead());
    await expect.poll(() => page.evaluate(() => window.__uxRefreshFinished)).toBe(true);
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#page-progress')).toHaveCount(0);
    expect(await page.locator('h1').textContent()).toBe(originalHeading);
    expect(await page.evaluate(() => window.scrollY)).toBe(initial.scroll);
    await expect(form.locator('[name=name]')).toBeFocused();
  } finally {
    await page.evaluate(async () => {
      window.__uxReleaseRead?.();
      await window.__uxRefreshPromise;
      delete window.__uxKeptView;
      delete window.__uxReleaseRead;
      delete window.__uxRefreshPromise;
    });
  }
});

test('unfinished application survives cancelled links and browser Back until navigation is confirmed', async ({ page, isMobile }) => {
  const eventPath = '/e/demo-opening#key=' + 'a'.repeat(64);
  await readyPublic(page);
  await page.evaluate(async path => {
    const { ctx } = await import(document.querySelector('script[type=module][src*="/src/main.js"]').src);
    await ctx.navigate(path);
  }, eventPath);
  const form = page.locator('form[data-form=apply]');
  await expect(form).toBeVisible();
  const eventUrl = page.url();
  await form.locator('[name=name]').fill('신청서 작성 중');
  await form.locator('[name=studentId]').fill('202600001');

  await form.locator('[name=consent]').check();

  const navigateToAbout = async () => {
    if (isMobile) {
      const menu = page.locator('.public-mobile-menu');
      if (!(await menu.evaluate(element => element.open))) {
        await menu.locator('summary').click();
      }
    }
    await page.locator('.public-header a[data-nav][href="/about"]:visible').first().click();
  };
  const expectDraft = async () => {
    await expect(form.locator('[name=name]')).toHaveValue('신청서 작성 중');
    await expect(form.locator('[name=studentId]')).toHaveValue('202600001');
    await expect(form.locator('[name=phone]')).toHaveCount(0);
    await expect(form.locator('[name=consent]')).toBeChecked();
  };
  const warning = page.getByRole('dialog', { name: '신청서 작성을 그만둘까요?' });

  await navigateToAbout();
  await expect(warning).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(eventUrl);
  await expectDraft();

  // This same-document Back changes the URL before the app can ask. Cancelling
  // must restore both the history entry and the still-connected draft controls.
  await page.evaluate(() => history.back());
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(eventUrl);
  await expectDraft();

  await navigateToAbout();
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: '작성 내용 버리고 이동', exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(/\/about\/?$/);
  await expect(page.locator('h1')).toBeFocused();
  await expect(form).toHaveCount(0);

  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(eventUrl);
  await expect(form).toBeVisible();
  await expect(form.locator('[name=name]')).toHaveValue('');
  await expect(form.locator('[name=studentId]')).toHaveValue('');
  await expect(form.locator('[name=phone]')).toHaveCount(0);
  await expect(form.locator('[name=consent]')).not.toBeChecked();
});
