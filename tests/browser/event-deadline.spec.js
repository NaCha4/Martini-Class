import {test,expect} from '@playwright/test';

test.beforeEach(async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local fixtures only');
 await page.clock.install({time:new Date('2026-10-12T09:00:00Z')});
 // Exercise the real app in Chrome without Firebase or production requests.
 await page.route('**/src/firebase.js*',route=>route.fulfill({contentType:'text/javascript',body:`
  export const auth={},local=true;
  export const onAuthStateChanged=(_,callback)=>queueMicrotask(()=>callback(null));
  export const api=async()=>{throw Error('Unexpected live API call');};
  export const signInWithEmailAndPassword=api,signInAdmin=api,signOut=api,sendPasswordResetEmail=api;
  export const verifyAdminSession=async()=>null;
 `}));
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'마티니 운영실'})).toBeVisible();
 await page.evaluate(async()=>{
  const {ctx,state}=await import(document.querySelector('script[src*="/src/main.js"]').src);
  window.deadlineCtx=ctx;window.deadlineCalls=[];
  const time=offset=>new Date(Date.now()+offset).toISOString();
  const base={id:'soon',title:'마감 예정 교육',type:'class',semester:'2026-2',status:'open',location:'동아리방',startsAt:time(86400000),endsAt:time(90000000),opensAt:time(-3600000),closesAt:time(5000),cancelUntil:time(80000000),registered:1,waiting:0,capacity:20,fee:0,waitlist:true,questions:[],policy:'가상 취소 안내',description:'로컬 검증',revision:1};
  window.deadlineEvents=[base,{...base,id:'expired',title:'마감된 행사',type:'meeting',closesAt:time(-1)},...['draft','completed','cancelled'].map(status=>({...base,id:status,title:status,status,closesAt:time(-1)}))];
  state.user={uid:'fixture'};
  state.profile={uid:'fixture',role:'owner',displayName:'가상 운영진'};
  ctx.api=async(op,data={})=>{
   window.deadlineCalls.push(op);
   if(op==='profile')return state.profile;
   if(op==='read')return {rows:data.kind==='settings'?[{id:'club',semester:'2026-2',contact:'가상 연락처'}]:data.kind==='events'?structuredClone(window.deadlineEvents.filter(e=>!data.recordId||e.id===data.recordId)):[],nextCursor:null};
   if(op==='eventAccess')return structuredClone(window.deadlineEvents.find(e=>e.id===data.eventId));
   throw Error('Unexpected fixture API: '+op);
  };
  await ctx.navigate('/admin/events');
 });
});

test('expired events show closed in admin filters while other states are preserved',async({page})=>{
 const card=title=>page.locator('.event-card-wrap').filter({hasText:title});
 await expect(card('마감된 행사').locator('[data-event-status-label]')).toHaveText('모집 마감');
 for(const [id,label] of [['draft','초안'],['completed','진행 완료'],['cancelled','취소']])await expect(card(id).locator('[data-event-status-label]')).toHaveText(label);
 await page.getByLabel('상태 필터').selectOption('closed');
 await expect(page.locator('.event-card-wrap:visible')).toHaveCount(1);
 await expect(card('마감된 행사')).toBeVisible();
});

test('an open list updates its filter at the deadline without network reads',async({page})=>{
 await page.getByLabel('상태 필터').selectOption('closed');
 await expect(page.locator('.event-card-wrap:visible')).toHaveCount(1);
 const calls=await page.evaluate(()=>window.deadlineCalls.length);
 await page.clock.runFor(6000);
 await expect(page.locator('.event-card-wrap:visible')).toHaveCount(2);
 await expect(page.locator('#filtered-count')).toContainText('2건');
 expect(await page.evaluate(()=>window.deadlineCalls.length)).toBe(calls);
});

test('detail closes while an open editor keeps its unsaved input',async({page})=>{
 await page.locator('.event-card').filter({hasText:'마감 예정 교육'}).click();
 await expect(page.locator('.event-statbar [data-event-status-label]')).toHaveText('모집 중');
 await page.getByRole('button',{name:'편집',exact:true}).click();
 await page.getByRole('dialog').locator('[name=title]').fill('작성 중인 새 행사 이름');
 await page.clock.runFor(6000);
 await expect(page.locator('.event-statbar [data-event-status-label]')).toHaveText('모집 마감');
 await expect(page.getByRole('dialog').locator('[name=title]')).toHaveValue('작성 중인 새 행사 이름');
});

test('application closes and disables submission without discarding typed information',async({page})=>{
 await page.evaluate(async()=>{await window.deadlineCtx.navigate('/e/soon#key='+'a'.repeat(24));});
 await expect(page.locator('form[data-form="apply"]')).toBeVisible();
 await page.locator('form[data-form="apply"] [name="name"]').fill('가상 참가자');
 await page.clock.runFor(6000);
 await expect(page.locator('.event-public-detail [data-event-status-label]')).toHaveText('모집 마감');
 await expect(page.locator('#apply-title')).toHaveText('모집 마감');
 await expect(page.locator('form[data-form="apply"] [type="submit"]')).toBeDisabled();
 await expect(page.locator('form[data-form="apply"] [name="name"]')).toHaveValue('가상 참가자');
 await expect(page.locator('.apply-card .notice-warning')).toContainText('신청이 마감되었습니다');
 await page.screenshot({path:'.local/screenshots/event-deadline-application.png',fullPage:true});
});

test('member event cards close on the same timer',async({page})=>{
 await page.evaluate(async()=>{
  const {renderMemberEventChoices}=await import('/src/member-portal.js');
  const {memberState}=await import('/src/member-session.js');
  memberState(window.deadlineCtx).events=[structuredClone(window.deadlineEvents[0])];
  document.querySelector('#app').innerHTML=renderMemberEventChoices(window.deadlineCtx);
 });
 await expect(page.locator('.member-event [data-event-status-label]')).toHaveText('신청 가능');
 await page.clock.runFor(6000);
 await expect(page.locator('.member-event [data-event-status-label]')).toHaveText('모집 마감');
 await expect(page.locator('.member-event-title')).toHaveClass(/is-closed/);
});
