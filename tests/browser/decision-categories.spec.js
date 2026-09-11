import {test,expect} from '@playwright/test';

async function setup(page,baseURL,permissions=null){
 if(!/^http:\/\/127\.0\.0\.1:(5173|5185)$/.test(baseURL))throw Error('Local UI tests only');
 const seed={categories:[{id:'category-a',name:'개강총회',revision:1},{id:'category-b',name:'칵테일 교육',revision:1}],events:[{id:'activity-event',title:'활동 운영 전용 행사'}],decisions:[{id:'legacy',title:'공통 운영 준비',eventId:'activity-event'},{id:'a-task',title:'총회 장소 예약',categoryId:'category-a'},{id:'b-task',title:'교육 재료 준비',categoryId:'category-b'},{id:'old-task',title:'지난 행사 마무리',categoryId:'deleted'}].map(d=>({body:'준비 사항을 함께 확인합니다.',type:'action',meetingId:'',agendaId:'',owner:'교육부',dueAt:'',status:'proposed',semester:'2026-2',revision:1,updatedAt:'2026-09-11T00:00:00Z',...d}))};
 await page.route('**/src/firebase.js*',route=>route.fulfill({contentType:'application/javascript',body:`
 export const local=true,auth={};
 export function onAuthStateChanged(auth,cb){queueMicrotask(()=>cb({uid:'test-owner'}));return()=>{};}
 export async function signInWithEmailAndPassword(){} export async function signOut(){} export async function sendPasswordResetEmail(){}
 const profile={uid:'test-owner',role:'owner',roleName:'검증 담당',displayName:'로컬 검증',${permissions?'permissions:'+JSON.stringify(permissions):''}};
 const seed=${JSON.stringify(seed)};
 export async function api(op,data={}){
  const store=JSON.parse(sessionStorage.getItem('decision-fixture')||'null')||structuredClone(seed);
  const save=()=>sessionStorage.setItem('decision-fixture',JSON.stringify(store));
  if(op==='profile')return profile;
  if(op==='decisionCategories')return {rows:store.categories,nextCursor:null};
  if(op==='read'){
   if(data.kind==='settings')return {rows:[{semester:'2026-2',location:'동아리방'}]};
   let rows=store[data.kind]||[];
   if(data.recordId)rows=rows.filter(d=>d.id===data.recordId);
   if(data.eventId)rows=rows.filter(d=>d.eventId===data.eventId);
   return {rows:structuredClone(rows),nextCursor:null};
  }
  if(op==='saveDecision'){
   const index=store.decisions.findIndex(d=>d.id===data.id),old=store.decisions[index];
   if(old&&old.revision!==data.revision)throw Error('오래된 기록');
   const saved={...old,...data,id:data.id||'new-task',revision:(old?.revision||0)+1,updatedAt:new Date().toISOString()};
   if(index<0)store.decisions.push(saved);else store.decisions[index]=saved;save();return saved;
  }
  if(op==='createDecisionCategory'){
   if(store.categories.some(c=>c.name===data.name))throw Error('같은 이름의 카테고리가 있습니다.');
   const saved={name:data.name,id:'new-category',revision:1};store.categories.push(saved);save();return saved;
  }
  if(op==='deleteDecisionCategory'){store.categories=store.categories.filter(c=>c.id!==data.id);save();return {saved:true};}
  throw Error('Unexpected API: '+op);
 }
 `}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._decisionErrors=errors;
 await page.goto('/admin/decisions');
 await expect(page.getByRole('heading',{name:'결정 · 할 일',exact:true})).toBeVisible();
 expect((await page.getByLabel('카테고리 선택',{exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(44);
}
test.afterEach(async({page},info)=>{
 expect(page._decisionErrors||[]).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'.local/screenshots/decision-categories-'+info.project.name+'-'+info.title.replace(/[^a-z]+/gi,'-')+'.png'});
});

test('decision-only staff add a category with just a name and no activity event requests',async({page,baseURL})=>{
 await setup(page,baseURL,['decisions']);
 await expect(page.getByLabel('카테고리 선택',{exact:true})).not.toContainText('활동 운영 전용 행사');
 await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();
 await expect(page.getByRole('dialog').locator('input:not([type=hidden]),select,textarea')).toHaveCount(1);
 await page.getByRole('textbox',{name:/^카테고리 이름/}).fill('가을 친목 행사');await page.getByRole('button',{name:'카테고리 만들기',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/\?category=new-category$/);
 await expect(page.locator('.decision-context h2')).toHaveText('가을 친목 행사');
 await page.getByRole('button',{name:'기록 추가',exact:true}).first().click();await expect(page.getByRole('dialog').getByRole('combobox',{name:/^카테고리/})).toHaveValue('new-category');
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
 const data=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('decision-fixture')));expect(data.events).toHaveLength(1);
});

test('deleting a category keeps its work in common and old links provide a recovery path',async({page,baseURL})=>{
 await setup(page,baseURL,['decisions']);await expect(page.getByRole('button',{name:'카테고리 삭제',exact:true})).toHaveCount(0);
 await page.getByLabel('카테고리 선택',{exact:true}).selectOption('category-a');await page.getByRole('button',{name:'카테고리 삭제',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('공통 업무에 남습니다');await page.getByRole('dialog').getByRole('button',{name:'카테고리 삭제',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/\/admin\/decisions$/);
 await expect(page.locator('.work-card')).toHaveCount(3);await expect(page.locator('.work-card').filter({hasText:'총회 장소 예약'})).toBeVisible();
 await expect(page.getByLabel('카테고리 선택',{exact:true})).not.toContainText('개강총회');
 await page.reload();await expect(page.locator('.work-card')).toHaveCount(3);
 await page.goto('/admin/decisions?category=category-a');await expect(page.getByRole('heading',{name:'카테고리를 찾을 수 없습니다',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'기록 추가',exact:true})).toHaveCount(0);await page.getByRole('link',{name:'공통 업무 보기'}).click();
 await page.locator('.work-card').filter({hasText:'총회 장소 예약'}).getByRole('button',{name:'수정',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('combobox',{name:/^카테고리/})).toHaveValue('');await page.getByRole('dialog').getByRole('combobox',{name:/^카테고리/}).selectOption('category-b');await page.getByRole('button',{name:'기록 저장',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.work-card')).toHaveCount(2);
});

test('category selection isolates records, persists on reload and restores browser history',async({page,baseURL})=>{
 await setup(page,baseURL);
 await expect(page.locator('.work-card')).toHaveCount(2);await expect(page.locator('.work-card').filter({hasText:'공통 운영 준비'})).toBeVisible();
 await page.getByLabel('카테고리 선택',{exact:true}).selectOption('category-a');
 await expect(page).toHaveURL(/\?category=category-a$/);await expect(page.locator('.work-card')).toHaveCount(1);await expect(page.locator('.work-card')).toContainText('총회 장소 예약');
 await page.reload();await expect(page.getByLabel('카테고리 선택',{exact:true})).toHaveValue('category-a');await expect(page.locator('.work-card')).toContainText('총회 장소 예약');
 await page.getByLabel('카테고리 선택',{exact:true}).selectOption('category-b');await expect(page.locator('.work-card')).toContainText('교육 재료 준비');
 await page.goBack();await expect(page.getByLabel('카테고리 선택',{exact:true})).toHaveValue('category-a');await expect(page.locator('.work-card')).toContainText('총회 장소 예약');
 await page.getByRole('searchbox',{name:'결정 · 할 일 검색'}).fill('재료');await expect(page.locator('.work-card:visible')).toHaveCount(0);
 await page.getByRole('button',{name:'초기화',exact:true}).click();await expect(page.locator('.work-card:visible')).toHaveCount(1);
});
test('new records inherit the category and moving records or changing progress preserves grouping',async({page,baseURL})=>{
 await setup(page,baseURL);await page.getByLabel('카테고리 선택',{exact:true}).selectOption('category-a');
 await page.getByRole('button',{name:'기록 추가',exact:true}).first().click();
 await expect(page.getByRole('dialog').getByRole('combobox',{name:/^카테고리/})).toHaveValue('category-a');
 await page.getByRole('textbox',{name:/^제목/}).fill('총회 장보기');await page.getByRole('button',{name:'기록 저장',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.work-card')).toHaveCount(2);
 let card=page.locator('.work-card').filter({hasText:'총회 장보기'});await card.getByRole('button',{name:'진행 시작'}).click();
 await expect(page.locator('.work-lane').filter({has:page.getByRole('heading',{name:/진행 중/})})).toContainText('총회 장보기');
 await card.getByRole('button',{name:'수정',exact:true}).click();await page.getByRole('dialog').getByRole('combobox',{name:/^카테고리/}).selectOption('category-b');await page.getByRole('button',{name:'기록 저장',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.work-card').filter({hasText:'총회 장보기'})).toHaveCount(0);
 await page.getByLabel('카테고리 선택',{exact:true}).selectOption('category-b');await expect(page.locator('.work-card')).toHaveCount(2);
 await page.reload();await expect(page.locator('.work-card').filter({hasText:'총회 장보기'})).toBeVisible();
 await page.getByLabel('카테고리 선택',{exact:true}).selectOption('');await expect(page.locator('.work-card')).toHaveCount(2);
});
