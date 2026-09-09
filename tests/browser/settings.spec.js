import { test, expect } from '@playwright/test';

test.beforeEach(async({baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local emulator tests only');
});

test('original privacy policy stays readable when the API is unavailable',async({page})=>{
 let apiRequests=0;
 await page.route('**/martiniApi',route=>{apiRequests++;return route.abort();});
 await page.goto('/privacy');
 await expect(page.getByRole('heading',{name:'개인정보 처리방침',exact:true})).toBeVisible();
 await expect(page.locator('.privacy-content h2')).toHaveCount(10);
 await expect(page.locator('.privacy-content')).toContainText('가입 승인 또는 반려 후 1년까지 보관');
 await expect(page.locator('.privacy-content')).toContainText('시행일자: 2026년 6월 17일');
 expect(apiRequests).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('settings save an open-chat link without preset dues or dates and joining uses that link',async({page})=>{
 await page.goto('/admin');
 await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();
 await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
 await page.goto('/admin/settings');
 await page.getByRole('button',{name:'설정 수정'}).click();
 const dialog=page.getByRole('dialog');
 for(const name of ['duesAmount','semesterEndsAt','bankInstructions','privacy'])await expect(dialog.locator('[name='+name+']')).toHaveCount(0);
 const chat=dialog.getByLabel('가입 오픈채팅 링크');
 await chat.fill('https://example.com/form');
 await dialog.getByRole('button',{name:'저장',exact:true}).click();
 await expect(dialog.locator('.form-error')).toContainText('카카오톡 오픈채팅 주소를 확인해 주세요');
 await chat.fill('https://open.kakao.com/o/testClub');
 await dialog.getByRole('button',{name:'저장',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await page.goto('/join');
 await expect(page.getByRole('link',{name:'가입 오픈채팅 열기 (새 탭)'})).toHaveAttribute('href','https://open.kakao.com/o/testClub');
 await expect(page.locator('main')).not.toContainText('회비');
 await expect(page.locator('main form')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Leave the local test fixture without a joining link.
 await page.goto('/admin/settings');
 await page.getByRole('button',{name:'설정 수정'}).click();
 await page.getByRole('dialog').getByLabel('가입 오픈채팅 링크').fill('');
 await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto('/join');
 await expect(page.locator('.join-guide').getByRole('status')).toContainText('가입 오픈채팅을 준비 중');
 await expect(page.getByRole('link',{name:'가입 오픈채팅 열기 (새 탭)'})).toHaveCount(0);
});
