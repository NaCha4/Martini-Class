import {test,expect} from '@playwright/test';
test.beforeEach(async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local emulator only');
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();
 await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
});
test.afterEach(async({page},info)=>{
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:'.local/screenshots/'+info.project.name+'-'+info.title+'.png',fullPage:true});
});
test('menu discovery and combined event filters survive browser back',async({page,isMobile})=>{
 await page.getByRole('button',{name:isMobile?'전체 메뉴':'메뉴 찾기',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('searchbox',{name:'메뉴 찾기'}).fill('출석');
 await expect(dialog.locator('[data-menu-item]:visible')).toHaveCount(1);
 await dialog.getByRole('link',{name:'행사 · 교육'}).click();
 await expect(page.getByRole('heading',{name:'행사 · 교육',exact:true})).toBeVisible();
 await page.locator('[data-event-type]').selectOption('class');
 const count=await page.locator('.event-card-wrap:visible').count();expect(count).toBeGreaterThan(0);
 await page.locator('.event-card-wrap:visible .event-card').first().click();await expect(page.locator('.event-statbar')).toBeVisible();
 await page.goBack();await expect(page.locator('[data-event-type]')).toHaveValue('class');
 await expect(page.locator('.event-card-wrap:visible')).toHaveCount(count);
 await page.getByRole('searchbox',{name:'행사 검색'}).fill('찾을수없는행사');
 await expect(page.locator('#filter-empty')).toBeVisible();
 await page.locator('#filter-empty').getByRole('button').click();await expect(page.locator('[data-event-type]')).toHaveValue('all');
});
test('X deletes a draft only after confirmation and cancellation leaves it intact',async({page})=>{
 await page.goto('/admin/events');await page.getByRole('button',{name:'행사 만들기'}).click();
 const title='삭제 검증 '+Date.now();await page.locator('[name=title]').fill(title);
 await expect(page.getByRole('heading',{name:'1. 기본 정보'})).toBeVisible();
 await page.getByRole('button',{name:'행사 저장',exact:true}).click();
 await expect(page.locator('[name=shareUrl]')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
 const card=page.locator('.event-card-wrap').filter({hasText:title});await card.getByRole('button',{name:'행사 삭제'}).click();
 await expect(page.getByRole('dialog')).toContainText(title);
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();await expect(card).toBeVisible();
 await card.getByRole('button',{name:'행사 삭제'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();await expect(card).toHaveCount(1);
 await page.getByRole('dialog').getByRole('checkbox').check();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(card).toHaveCount(0);await page.reload();await expect(card).toHaveCount(0);
});
test('X removes a ledger record and recomputes balance',async({page})=>{
 await page.goto('/admin/finance');const balance=page.locator('.finance-summary strong').first(),before=await balance.textContent();
 await page.getByRole('button',{name:'수입 · 지출 기록'}).click();const title='삭제 장부 '+Date.now();
 await page.locator('[name=title]').fill(title);await page.locator('[name=amount]').fill('1234');await page.locator('[name=confirmed]').check();
 await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(balance).not.toHaveText(before);
 const row=page.locator('.finance-ledger tr').filter({hasText:title});await row.getByRole('button',{name:'입출금 기록 삭제'}).click();
 await page.getByRole('dialog').getByRole('checkbox').check();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(balance).toHaveText(before);
});
