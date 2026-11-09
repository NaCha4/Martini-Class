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
  const base={id:'soon',title:'마감 예정 교육',type:'class',semester:'2026-2',status:'open',location:'동아리방',startsAt:time(10000),endsAt:time(12000),opensAt:time(-3600000),closesAt:time(5000),cancelUntil:time(8000),registered:1,waiting:0,capacity:20,fee:0,waitlist:true,questions:[],policy:'가상 취소 안내',description:'로컬 검증',revision:1};
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

test('the old budget URL lands on events and the retired links are absent',async({page})=>{
 await page.evaluate(()=>window.deadlineCtx.navigate('/admin/budget?category=legacy#record'));
 await expect(page).toHaveURL(/\/admin\/events$/);
 await expect(page.getByRole('heading',{name:'행사 · 교육',exact:true})).toBeVisible();
 await expect(page.locator('.workspace nav a[href="/admin"], .workspace a[href="/admin/budget"]')).toHaveCount(0);
 const calls=await page.evaluate(()=>window.deadlineCalls);
 expect(calls).not.toContain('dashboard');
 expect(calls).not.toContain('budgetPlanner');
});

test('event detail reads in parallel while the loading bar fills once',async({page})=>{
 await page.evaluate(()=>{
  const ctx=window.deadlineCtx,api=ctx.api,gate=new Promise(resolve=>{window.releaseReads=resolve;});
  window.startedReads=[];
  ctx.api=async(op,data)=>{
   if(op==='read'){window.startedReads.push(data.kind);await gate;}
   return api(op,data);
  };
  window.detailNavigation=ctx.navigate('/admin/events/soon');
 });
 await expect.poll(()=>page.evaluate(()=>window.startedReads.slice().sort())).toEqual(['applications','events','settings']);

 const progress=page.locator('#page-progress');
 const widths=await progress.evaluate(async bar=>{
  const animation=bar.getAnimations()[0];
  animation.pause();
  await animation.ready;
  return [100,500,900,1300,1700,3300].map(time=>{
   animation.currentTime=time;
   return new DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
  });
 });
 [0,.225,.45,.675,.9,.9].forEach((expected,index)=>expect(widths[index]).toBeCloseTo(expected));

 const [start,end]=await page.evaluate(async()=>{
  window.releaseReads();
  await window.detailNavigation;
  return document.querySelector('#page-progress').getAnimations()[0].effect.getKeyframes().map(frame=>new DOMMatrixReadOnly(frame.transform).a);
 });
 expect(start).toBeCloseTo(.9);
 expect(end).toBe(1);
 await expect(page.getByRole('heading',{name:'마감 예정 교육'})).toBeVisible();
 await expect(progress).toHaveCount(0);
});

test('completed events start folded and can be opened and closed',async({page})=>{
 const card=title=>page.locator('.event-card-wrap').filter({hasText:title});
 const completed=page.locator('#event-completed'),summary=completed.locator('summary');
 await expect(summary).toBeVisible();
 await expect(summary.locator('[data-event-section-count]')).toHaveText('1');
 await expect(card('completed')).toBeHidden();
 await summary.click();
 await expect(card('completed')).toBeVisible();
 await expect(card('마감된 행사').locator('[data-event-status-label]')).toHaveText('모집 마감');
 for(const [id,label] of [['draft','초안'],['completed','진행 완료'],['cancelled','취소']])await expect(card(id).locator('[data-event-status-label]')).toHaveText(label);
 await summary.press('Enter');
 await expect(card('completed')).toBeHidden();
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

test('ended events move into the completed section and match its filter',async({page})=>{
 await page.evaluate(async()=>{
  window.deadlineEvents=window.deadlineEvents.filter(e=>e.status!=='completed');
  await window.deadlineCtx.render();
 });
 const completed=page.locator('#event-completed');
 await expect(completed).toBeHidden();
 await page.getByLabel('상태 필터').selectOption('completed');
 const calls=await page.evaluate(()=>window.deadlineCalls.length);
 await page.clock.runFor(13000);
 await expect(completed).toBeVisible();
 await expect(completed.locator('[data-event-section-count]')).toHaveText('2');
 await expect(completed.locator('.event-card-wrap:visible')).toHaveCount(0);
 await completed.locator('summary').click();
 await expect(completed.locator('.event-card-wrap:visible')).toHaveCount(2);
 await expect(completed.locator('[data-event-status-label]')).toHaveText(['진행 완료','진행 완료']);
 await expect(page.locator('#event-operating')).toBeHidden();
 expect(await page.evaluate(()=>window.deadlineCalls.length)).toBe(calls);
});

test('detail closes while an open editor keeps its unsaved input',async({page})=>{
 await page.locator('.event-card').filter({hasText:'마감 예정 교육'}).click();
 await expect(page.locator('.event-statbar [data-event-status-label]')).toHaveText('모집 중');
 await page.getByRole('button',{name:'편집',exact:true}).click();
 await page.getByRole('dialog').locator('[name=title]').fill('작성 중인 새 행사 이름');
 await page.clock.runFor(6000);
 await expect(page.locator('.event-statbar [data-event-status-label]')).toHaveText('모집 마감');
 await page.clock.runFor(8000);
 await expect(page.locator('.event-statbar [data-event-status-label]')).toHaveText('진행 완료');
 await expect(page.getByRole('dialog').locator('[name=title]')).toHaveValue('작성 중인 새 행사 이름');
});

test('admin manually adds a participant to a closed event',async({page})=>{
 await page.evaluate(()=>{
  const previous=window.deadlineCtx.api;
  window.deadlineCtx.api=async(op,data)=>{if(op==='manualApplication'){window.manualInput=data;return {id:'new-participant'};}return previous(op,data);};
 });
 await page.locator('.event-card').filter({hasText:'마감된 행사'}).click();
 await page.getByRole('button',{name:'참가자 수동 추가'}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('정원 초과');
 await dialog.getByLabel('이름').fill('가상 부원');
 await dialog.getByLabel('학번').fill('TEST-100');
 await dialog.getByRole('button',{name:'참가 등록'}).click();
 await expect(dialog).not.toBeVisible();
 expect(await page.evaluate(()=>({eventId:window.manualInput.eventId,name:window.manualInput.name,studentId:window.manualInput.studentId,answers:window.manualInput.answers}))).toEqual({eventId:'expired',name:'가상 부원',studentId:'TEST-100',answers:[]});
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
 await page.clock.runFor(8000);
 await expect(page.locator('.event-public-detail [data-event-status-label]')).toHaveText('진행 완료');
 await expect(page.locator('#apply-title')).toHaveText('진행 완료');
 await expect(page.locator('form[data-form="apply"] [type="submit"]')).toBeDisabled();
 await expect(page.locator('form[data-form="apply"] [name="name"]')).toHaveValue('가상 참가자');
 await page.screenshot({path:'.local/screenshots/event-deadline-application.png',fullPage:true});
});

test('member event cards close and complete on the same timer',async({page})=>{
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
 await page.clock.runFor(8000);
 await expect(page.locator('.member-event [data-event-status-label]')).toHaveText('진행 완료');
});
