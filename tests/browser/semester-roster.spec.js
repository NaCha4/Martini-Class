import {test,expect} from '@playwright/test';
test('semester folders isolate member forms, edits and exported roster',async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local only');
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
 const id=Date.now().toString(),name='학기 분리 '+id;
 await page.goto('/admin/members?semester=2026-2');await page.getByRole('button',{name:'부원 등록',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('2026-2');await expect(dialog.locator('[name=semester]')).toHaveCount(0);
 await dialog.locator('[name=name]').fill(name);await dialog.locator('[name=studentId]').fill(id);await dialog.locator('[name=phone]').fill('01022223333');await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('tbody')).toContainText(name);await expect(page.getByRole('columnheader',{name:'등록 학기'})).toHaveCount(0);
 await page.getByRole('button',{name:'다른 학기 열기'}).click();await dialog.locator('[name=semester]').fill('2027-1');await dialog.getByRole('button',{name:'명부 열기'}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.roster-title')).toHaveText('2027-1 부원 명부');await expect(page.locator('main')).not.toContainText(name);
 await page.getByRole('button',{name:'부원 등록',exact:true}).click();await dialog.locator('[name=name]').fill(name+' 새학기');await dialog.locator('[name=studentId]').fill(id);await dialog.locator('[name=phone]').fill('01022223333');await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('navigation',{name:'명부 학기'}).getByRole('link',{name:'2026-2',exact:true}).click();await expect(page.locator('tbody')).toContainText(name);await expect(page.locator('tbody')).not.toContainText(name+' 새학기');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV 내보내기'}).click();await dialog.locator('[name=reason]').fill('학기별 확인');await dialog.getByRole('button',{name:'저장',exact:true}).click();expect((await download).suggestedFilename()).toBe('martini-members-2026-2.csv');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.local/screenshots/semester-roster-'+test.info().project.name+'.jpg',type:'jpeg'});
});
