import { test,expect } from '@playwright/test';
test.beforeEach(async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Browser tests must use the local emulator-backed development server.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
});
test.afterEach(async({page},info)=>{
 expect(page._errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:'.local/screenshots/'+info.project.name+'-'+info.title.replace(/[^a-z0-9]+/gi,'-')+'.jpg',type:'jpeg',quality:75});
});
const unique=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
async function login(page){
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
}
async function saveModal(page,name='저장'){
 await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('public navigation and responsive content',async({page,isMobile})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Martini',exact:true})).toBeVisible();
 await expect(page.locator('.hero')).toHaveCSS('background-image',/background.png/);
 if(isMobile){await page.locator('.public-mobile-menu summary').click();await page.locator('.public-mobile-menu').getByRole('link',{name:'소개',exact:true}).click();}
 else await page.getByRole('navigation',{name:'홈페이지 메뉴',exact:true}).getByRole('link',{name:'소개',exact:true}).click();
 await expect(page.getByRole('heading',{name:/한양대학교 ERICA/})).toBeVisible();
 for(const route of ['/activities','/notices','/join','/privacy']){await page.goto(route);await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});
test('event creation application rejection and cancellation',async({page,browser})=>{
 await login(page);await page.goto('/admin/events');await page.getByRole('button',{name:'행사 만들기'}).click();
 const title='브라우저 검증 총회 '+unique();
 await page.locator('[name=title]').fill(title);await page.locator('[name=status]').selectOption('open');
 await page.getByRole('button',{name:'행사 저장',exact:true}).click();
 const linkField=page.locator('[name=shareUrl]');await expect(linkField).toBeVisible();const link=await linkField.inputValue(),before=page.url();
 await linkField.press('Enter');await expect(linkField).toBeVisible();expect(page.url()).toBe(before);expect(new URL(page.url()).search).toBe('');
 const guest=await browser.newContext({viewport:page.viewportSize()});const p=await guest.newPage();
 await p.goto(link);await p.locator('[name=name]').fill('명부에 없는 사람');await p.locator('[name=studentId]').fill('202600003');await p.locator('[name=phone]').fill('01000000003');await p.locator('[name=consent]').check();
 await p.getByRole('button',{name:'신청하기',exact:true}).click();await expect(p.locator('.form-error')).toContainText('활동 자격');
 await p.locator('[name=name]').fill('가상부원 가');await p.locator('[name=studentId]').fill('202600001');await p.locator('[name=phone]').fill('01000000001');
 await p.getByRole('button',{name:'신청하기',exact:true}).click();await expect(p.getByRole('heading',{name:'내 신청 확인',exact:true})).toBeVisible();
 await p.reload();await expect(p.getByText('참가 등록',{exact:true})).toBeVisible();
 await p.getByRole('button',{name:'신청 취소',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'신청 취소',exact:true}).click();
 await expect(p.locator('.receipt-status')).toContainText('취소');await guest.close();
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
});
test('meeting agendas decisions revisions and navigation',async({page})=>{
 await login(page);await page.goto('/admin/meetings');await page.getByRole('button',{name:'회의 기록하기'}).click();
 const title='브라우저 운영회의 '+unique();
 await page.locator('[name=title]').fill(title);await page.locator('[name=body]').fill('교육 일정과 재료 준비를 논의했습니다.');
 await page.locator('[name=agendaTitle]').fill('교육 준비');await page.locator('[name=agendaNotes]').fill('진과 토닉워터 재고를 확인합니다.');await saveModal(page,'회의록 저장');
 await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:'결정 · 할 일 추가'}).click();
 await page.locator('[name=title]').fill('재료 확인 '+title);await page.locator('[name=type]').selectOption('action');await page.locator('[name=owner]').fill('교육부');
 const agenda=await page.locator('[name=agendaId] option').nth(1).getAttribute('value');await page.locator('[name=agendaId]').selectOption(agenda);await saveModal(page);
 await page.getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('dialog').getByText('재료 확인 '+title,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'회의록 수정',exact:true}).click();await page.locator('[name=body]').fill('담당자를 지정하고 준비를 시작했습니다.');await saveModal(page,'회의록 저장');
 await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:'수정 이력',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('버전 2');
 await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('inventory receiving opening remaining and persisted history',async({page})=>{
 await login(page);await page.goto('/admin/inventory');await page.getByRole('button',{name:'품목 등록'}).click();const title='브라우저 진 '+unique();
 await page.locator('[name=name]').fill(title);await saveModal(page);
 const row=()=>page.locator('tr').filter({has:page.getByText(title,{exact:true})});
 await row().getByRole('button',{name:'기록',exact:true}).click();await page.locator('[name=amount]').fill('3');await page.locator('[name=reason]').fill('검증 입고');await saveModal(page);
 await row().getByRole('button',{name:'기록',exact:true}).click();await page.locator('[name=action]').selectOption('open');await page.locator('[name=reason]').fill('검증 개봉');await saveModal(page);
 await row().getByRole('button',{name:'기록',exact:true}).click();await page.locator('[name=action]').selectOption('remaining');await page.locator('[name=percent]').selectOption('60');await page.locator('[name=reason]').fill('검증 사용');await saveModal(page);
 await page.reload();await expect(row()).toContainText('1,820');await expect(row()).toContainText('60%');
 await row().getByRole('button',{name:'상세',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('검증 입고');await expect(page.getByRole('dialog')).toContainText('검증 사용');
});
test('member dues ledger and admin sections',async({page})=>{
 await login(page);await page.goto('/admin/members');await page.getByRole('button',{name:'부원 등록'}).click();const name='브라우저 부원 '+unique();
 await page.locator('[name=name]').fill(name);await page.locator('[name=studentId]').fill('TEST'+unique());await page.locator('[name=phone]').fill('01012345678');await expect(page.locator('[name=duesPaid]')).toHaveCount(0);await expect(page.getByRole('dialog').locator('[name=status]')).toHaveCount(0);await saveModal(page);
 await page.goto('/admin/finance');await page.getByRole('button',{name:'수입 · 지출 기록'}).click();await page.locator('[name=kind]').selectOption('dues');await expect(page.locator('[name=amount]')).toHaveValue('');await page.locator('[name=amount]').fill('17000');await page.locator('[name=title]').fill(name+' 회비');
 const id=await page.locator('[name=memberId] option').filter({hasText:name}).getAttribute('value');await page.locator('[name=memberId]').selectOption(id);await page.locator('[name=confirmed]').check();await saveModal(page);
 await expect(page.getByText(name+' 회비',{exact:true})).toBeVisible();
 for(const route of ['decisions','content','settings','admins','privacy','audit']){await page.goto('/admin/'+route);await expect(page.locator('h1')).toBeVisible();expect(await page.locator('.connection-page').count()).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});
