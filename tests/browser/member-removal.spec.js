import {test,expect} from '@playwright/test';
test('member action icons remove only the selected semester without a removed-members view',async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local only');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
 const id=Date.now().toString(),name='명부 제거 검증 '+id;
 for(const semester of ['2026-2','2027-1']){
  await page.goto('/admin/members?semester='+semester);await page.getByRole('button',{name:'부원 등록',exact:true}).click();const d=page.getByRole('dialog');await d.locator('[name=name]').fill(name);await d.locator('[name=studentId]').fill(id);await d.locator('[name=phone]').fill('01012345678');await d.getByRole('button',{name:'저장',exact:true}).click();await expect(d).toHaveCount(0);
 }
 await page.goto('/admin/members?semester=2026-2');const row=()=>page.locator('tr').filter({has:page.getByText(name,{exact:true})});
 const edit=row().getByRole('button',{name:'수정',exact:true}),remove=row().getByRole('button',{name:'명부에서 제거',exact:true});await expect(edit.locator('svg.lucide-wrench')).toBeVisible();await expect(remove.locator('svg.lucide-x')).toBeVisible();const eb=await edit.boundingBox(),rb=await remove.boundingBox();expect(eb.x+eb.width).toBeLessThanOrEqual(rb.x);expect(rb.width).toBeGreaterThanOrEqual(44);
 await remove.click();const d=page.getByRole('dialog');await expect(d).toContainText(name);await expect(d).toContainText('2026-2');await d.getByRole('button',{name:'닫기',exact:true}).last().click();await expect(row()).toHaveCount(1);
 await row().getByRole('button',{name:'명부에서 제거',exact:true}).click();await d.getByRole('button',{name:'명부에서 제거',exact:true}).click();await expect(d).toHaveCount(0);await expect(row()).toHaveCount(0);
 await page.reload();await expect(row()).toHaveCount(0);await expect(page.getByRole('link',{name:'제거한 부원 보기'})).toHaveCount(0);await expect(page.locator('.roster-title')).toHaveCount(0);
 await page.goto('/admin/members?semester=2026-2&removed=1');await expect(row()).toHaveCount(0);
 await page.goto('/admin/members?semester=2027-1');await expect(row()).toHaveCount(1);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.local/screenshots/member-removal-'+test.info().project.name+'.jpg',type:'jpeg'});
});
