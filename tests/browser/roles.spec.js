import {test,expect} from '@playwright/test';
test('custom role assignment refreshes menus, blocks finance, and can later grant it',async({page,browser,request,baseURL,isMobile})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Emulator-only test');
 const suffix=Date.now().toString(36)+(isMobile?'m':'d'),name='검증 역할 '+suffix;
 const email='roles-'+suffix+'@example.invalid',password='Local-only-roles-2026!';
 const result=await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{data:{email,password,returnSecureToken:true}});
 expect(result.ok()).toBe(true);const uid=(await result.json()).localId;
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();
 await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
 await page.goto('/admin/roles');await page.getByRole('button',{name:'역할 만들기'}).click();
 await page.getByLabel('역할 이름').fill(name);await page.getByLabel('재고 관리',{exact:true}).check();
 await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const row=page.getByRole('row').filter({hasText:name}),roleId=await row.getByRole('button',{name:'수정',exact:true}).getAttribute('data-id');
 await page.goto('/admin/admins');await page.getByRole('button',{name:'임원 등록'}).click();
 await page.getByLabel('Firebase Authentication UID').fill(uid);await page.getByLabel('표시 이름').fill('검증 담당자 '+suffix);
 await page.getByLabel('부서 · 역할').selectOption(roleId);
 await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const staffContext=await browser.newContext({viewport:page.viewportSize()}),staff=await staffContext.newPage();
 try{
  await staff.goto(baseURL+'/admin');await staff.locator('[name=email]').fill(email);await staff.locator('[name=password]').fill(password);
  await staff.getByRole('button',{name:'로그인',exact:true}).click();await expect(staff.getByRole('heading',{name:'운영 현황'})).toBeVisible();
  await expect(staff.locator('.sidebar a[href="/admin/finance"]')).toHaveCount(0);
  if(isMobile){await staff.getByRole('button',{name:'전체 메뉴'}).click();await expect(staff.getByRole('dialog').getByRole('link',{name:'회비 · 정산'})).toHaveCount(0);await staff.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();}
  await staff.goto(baseURL+'/admin/finance');await expect(staff.getByRole('heading',{name:'접근 권한이 없습니다'})).toBeVisible();
  await page.goto('/admin/roles');await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'수정',exact:true}).click();
  await page.getByLabel('재고 관리',{exact:true}).uncheck();await page.getByLabel('회비·정산 관리',{exact:true}).check();
  await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await staff.goto(baseURL+'/admin/finance');await expect(staff.getByRole('heading',{name:'회비 · 정산',exact:true})).toBeVisible();
  await expect(staff.getByRole('button',{name:'수입 · 지출 기록'})).toBeVisible();
  await staff.goto(baseURL+'/admin/inventory');await expect(staff.getByRole('heading',{name:'접근 권한이 없습니다'})).toBeVisible();
  await page.goto('/admin/admins');await page.getByRole('row').filter({hasText:'검증 담당자 '+suffix}).getByRole('button',{name:'수정',exact:true}).click();
  await page.getByLabel('부서 · 역할').selectOption('education');await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const application=await page.evaluate(async()=>{
   const {ctx}=await import(document.querySelector('script[type=module][src*="/src/main.js"]').src);
   return ctx.api('apply',{eventId:'demo-class',key:'a'.repeat(64),name:'가상부원 가',studentId:'202600001',phone:'01000000001',answers:[],consent:true,requestId:crypto.randomUUID(),receiptKey:'f'.repeat(64)});
  });
  await staff.goto(baseURL+'/admin/events/demo-class');
  await expect(staff.getByRole('columnheader',{name:'납부',exact:true})).toHaveCount(0);
  await staff.getByRole('row').filter({hasText:'가상부원 가'}).getByRole('button',{name:'신청 상세 · 처리'}).click();
  await expect(staff.getByRole('dialog')).not.toContainText('납부 확인');
  await expect(staff.getByRole('dialog')).not.toContainText('환불 확인');
  await expect(staff.getByRole('button',{name:'입금 확인 기록'})).toHaveCount(0);
  await staff.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
  await page.evaluate(async id=>{const {ctx}=await import(document.querySelector('script[type=module][src*="/src/main.js"]').src);await ctx.api('applicationCommand',{id,action:'cancel',reason:'로컬 검증 종료'});},application.id);
  await page.goto('/admin/roles');await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'삭제',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'역할 삭제',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:name})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await staffContext.close();}
});
