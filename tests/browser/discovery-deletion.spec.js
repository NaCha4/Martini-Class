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
test('operating navigation and combined event filters survive browser back',async({page,isMobile})=>{
 if(isMobile){
  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  await page.getByRole('dialog').getByRole('link',{name:'행사 · 교육',exact:true}).click();
 }else{
  await page.getByRole('navigation',{name:'운영 메뉴',exact:true}).getByRole('link',{name:'행사 · 교육',exact:true}).click();
 }
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
