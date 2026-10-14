import { test, expect } from '@playwright/test';

// Exercise the real admin shell, controls and modal with local synthetic data only.
test('absence report filters members, opens event history and switches semesters without writes',async({page,baseURL},info)=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(baseURL))throw Error('Absence tests require the local development server.');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort());
 await page.route(/\/src\/firebase\.js(?:\?|$)/,route=>route.fulfill({contentType:'text/javascript',body:'export const auth={},local=false,signInAdmin=()=>{},signOut=()=>{},sendPasswordResetEmail=()=>{};'}));
 await page.route('**/__absence-report-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><body><div id="app"></div></body></html>'}));
 await page.goto('/__absence-report-test');
 await page.evaluate(async()=>{
  history.replaceState({},'','/admin/absences');
  const {renderAdmin,adminAction,mountAdminView}=await import('/src/admin.js');
  const {refreshIcons}=await import('/src/ui.js');
  const profile={uid:'test-admin',role:'education',displayName:'테스트 운영진',roleName:'교육부',permissions:['events']};
  const events=[{id:'third',title:'가을 칵테일 워크숍',type:'workshop',startsAt:'2026-10-03T09:00:00Z',unchecked:0},{id:'second',title:'두 번째 칵테일 교육',type:'class',startsAt:'2026-09-20T09:00:00Z',unchecked:1},{id:'first',title:'첫 번째 칵테일 교육',type:'class',startsAt:'2026-09-10T09:00:00Z',unchecked:0}];
  const rows=[{id:'a',name:'김부원',studentId:'20260001',department:'기계공학과',records:events.map(event=>({eventId:event.id,attendance:'absent'}))},{id:'b',name:'김부원',studentId:'20260002',department:'디자인학과',records:[{eventId:'first',attendance:'absent'},{eventId:'second',attendance:'present'}]},{id:'c',name:'박부원',studentId:'20260003',department:'컴퓨터학과',records:[{eventId:'second',attendance:'absent'}]}];
  const calls=[],ctx={state:{authReady:true,user:{uid:'test-admin'},profile,data:{},settings:{}},toast:()=>{},api:async(op,data)=>{
   calls.push(op);if(op==='profile')return profile;
   if(op!=='absenceReport')throw Error('Unexpected operation: '+op);
   const semester=data.semester||'2026-2';return {semester,semesters:['2026-2','2026-1'],generatedAt:'2026-10-14T03:00:00Z',events,rows:semester==='2026-1'?[rows[2]]:rows};
  }};
  ctx.render=async()=>{document.querySelector('#app').innerHTML=await renderAdmin(ctx);refreshIcons();mountAdminView(ctx,document.querySelector('#app'));};
  ctx.navigate=async path=>{history.pushState({},'',path);await ctx.render();};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)void adminAction(ctx,button.dataset.action,button.dataset.id,button);});
  window.absenceTest={calls,ctx};await ctx.render();
 });
 const rows=page.locator('.absence-member-row');
 await expect(rows).toHaveCount(3);
 await expect(page.getByRole('heading',{name:'결석자 관리',exact:true})).toBeVisible();
 await expect(rows.first()).toContainText('20260001');
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:'.local/screenshots/absence-'+info.project.name+'.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.locator('[data-absence-filter="minimum"]').selectOption('2');await expect(rows).toHaveCount(1);
 await rows.first().click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('결석 3회');await expect(dialog.locator('a[href^="/admin/events/"]')).toHaveCount(3);
 await expect(dialog.getByRole('link',{name:'출석 확인'}).first()).toHaveAttribute('href','/admin/events/third');
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBeTruthy();
 await page.screenshot({path:'.local/screenshots/absence-detail-'+info.project.name+'.png'});
 await dialog.locator('footer [data-close]').click();await expect(dialog).toHaveCount(0);
 await page.locator('[data-absence-filter="minimum"]').selectOption('1');
 await page.locator('[data-absence-search]').fill('20260002');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('디자인학과');
 await page.locator('[data-absence-search]').fill('찾을 수 없음');await expect(rows).toHaveCount(0);
 await page.getByRole('button',{name:'필터 초기화'}).click();await expect(rows).toHaveCount(3);
 await page.locator('[data-absence-filter="eventId"]').selectOption('third');await expect(rows).toHaveCount(1);
 expect(await page.evaluate(()=>window.absenceTest.calls)).toEqual(['profile','absenceReport']);
 await page.getByRole('button',{name:'새로고침',exact:true}).click();await expect(rows).toHaveCount(1);
 await expect(page.locator('[data-absence-filter="eventId"]')).toHaveValue('third');
 await page.locator('[data-absence-semester]').selectOption('2026-1');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('박부원');
 expect(errors).toEqual([]);
});
