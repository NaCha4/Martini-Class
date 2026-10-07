import { test,expect,chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeApp } from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import { getAuth } from '../../functions/node_modules/firebase-admin/lib/auth/index.js';
import { getFirestore } from '../../functions/node_modules/firebase-admin/lib/firestore/index.js';

process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const app=initializeApp({projectId:'demo-martini'},'viewer-browser'),db=getFirestore(app),auth=getAuth(app);
const endpoint='http://127.0.0.1:5001/demo-martini/asia-northeast3/martiniApi';
test.use({trace:'off'}); // Never retain emulator passwords or bearer tokens in browser traces.
let account,requestIds;
test.beforeEach(async({baseURL,page})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local emulator only');
 const uid='viewer-'+randomUUID();account={uid,email:uid+'@martini.local',password:randomUUID()+'aA1!'};
 await auth.createUser(account);
 await db.doc('martini_v2_admins/'+uid).set({role:'requestsViewer',displayName:'dot 로컬 검증',active:true,expiresAt:new Date(Date.now()+30*86400000).toISOString()});
 requestIds=['inquiry','visit'].map(kind=>kind+'-'+uid);
 for(const [i,kind] of ['inquiry','visit'].entries())await db.doc('martini_v2_clubRequests/'+requestIds[i]).set({id:requestIds[i],kind,name:'조회전용 가상 신청자',studentId:'TEST001',subject:'조회전용 가상 문의',purpose:'조회전용 가상 방문',message:'답변이 필요한 가상 문의 내용',startsAt:new Date(Date.now()+86400000).toISOString(),guestCount:1,guestNames:'가상 방문자',status:'pending',revision:1,retentionUntil:new Date(Date.now()+180*86400000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 page._errors=[];page.on('pageerror',e=>page._errors.push(e.message));
});
test.afterEach(async({page})=>{
 expect(page._errors).toEqual([]);
 await auth.deleteUser(account.uid);
 await db.doc('martini_v2_admins/'+account.uid).delete();
 for(const id of requestIds)await db.doc('martini_v2_clubRequests/'+id).delete();
});
async function login(page,remember=true){
 await page.goto('http://127.0.0.1:5173/admin/requests');
 await page.locator('form[data-form="login"] [name=email]').fill(account.email);
 await page.locator('form[data-form="login"] [name=password]').fill(account.password);
 await page.getByLabel('이 브라우저에서 로그인 유지').setChecked(remember);
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.locator('.workspace h1')).toHaveText('신청 · 문의');
}
const client=page=>page.evaluate(async()=>{const {auth,api}=await import('/src/firebase.js');return {token:await auth.currentUser.getIdToken(),profile:await api('profile')};});
async function call(token,data){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});return response.json();}

test('viewer navigation, read-only details, refresh, token renewal and cross-tab logout',async({page,context})=>{
 const calls=[];page.on('request',r=>{if(r.url()===endpoint)calls.push(r.postDataJSON()?.data);});
 await login(page);
 expect(calls.every(c=>['profile','clubRequests'].includes(c.op))).toBe(true);
 await expect(page.locator('[data-action="club-request-delete"],[data-action="settings-edit"]')).toHaveCount(0);
 expect(await page.locator('.sidebar nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).toEqual(['/admin/requests']);
 await page.screenshot({path:'.local/screenshots/dot-readonly.png',fullPage:true});
 await page.locator('[data-action="club-request-review"][data-id="'+requestIds[0]+'"]').click();
 await expect(page.getByRole('dialog')).toContainText('답변이 필요한 가상 문의 내용');
 await expect(page.getByRole('dialog').locator('textarea,select,[type=submit]')).toHaveCount(0);
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
 for(const route of ['settings','members','events','on-the-rock']){await page.goto('/admin/'+route);await expect(page.getByRole('heading',{name:'접근 권한이 없습니다'})).toBeVisible();}
 await page.goto('/admin');await expect(page).toHaveURL(/\/admin\/requests$/);
 await page.reload();await expect(page.locator('.workspace h1')).toHaveText('신청 · 문의');
 const original=await client(page);
 const renewed=await page.evaluate(async()=>{const {auth,api}=await import('/src/firebase.js');await auth.currentUser.getIdToken(true);return api('profile');});
 expect(renewed.sessionExpiresAt).toBe(original.profile.sessionExpiresAt);
 for(const data of [{op:'clubRequestCommand',id:requestIds[0],revision:1,action:'reply',response:'forbidden'},{op:'read',kind:'settings'},{op:'saveOnTheRockGroup'},{op:'deleteRecord'},{op:'submitClubRequest'}])expect((await call(original.token,data)).error?.status).toBe('PERMISSION_DENIED');
 const second=await context.newPage();await second.goto('/admin/requests');await expect(second.locator('.workspace h1')).toHaveText('신청 · 문의');
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();
 await expect(page.locator('form[data-form="login"]')).toBeVisible();
 await expect(second.locator('form[data-form="login"]')).toBeVisible();
 expect((await call(original.token,{op:'clubRequests'})).error?.status).toBe('UNAUTHENTICATED');
 expect((await call(null,{op:'clubRequests',uid:account.uid})).error?.status).toBe('UNAUTHENTICATED');
 expect(await page.evaluate(async()=>{const {state}=await import('/src/main.js');return !!state.clubRequestPage||!!state.requestPageReuse;})).toBe(false);
 await second.close();
});

test('persistent Chrome profile restores login after closing the browser',async({},info)=>{
 const root=path.resolve('.local/viewer-browser'),directory=path.join(root,randomUUID());
 let context;
 try{
  context=await chromium.launchPersistentContext(directory,{...info.project.use.launchOptions,headless:true});
  const page=await context.newPage();await login(page);await context.close();context=null;
  context=await chromium.launchPersistentContext(directory,{...info.project.use.launchOptions,headless:true});
  const reopened=await context.newPage();await reopened.goto('http://127.0.0.1:5173/admin/requests');
  await expect(reopened.locator('.workspace h1')).toHaveText('신청 · 문의');
  await reopened.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(reopened.locator('form[data-form="login"]')).toBeVisible();
 }finally{await context?.close();if(path.resolve(directory).startsWith(root+path.sep))await fs.rm(directory,{recursive:true,force:true});}
});

test('session-only login stays in its tab and a new tab requires login',async({page,context})=>{
 await login(page,false);await page.reload();await expect(page.locator('.workspace h1')).toHaveText('신청 · 문의');
 const second=await context.newPage();await second.goto('/admin/requests');await expect(second.locator('form[data-form="login"]')).toBeVisible();await second.close();
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();
});

test('grant expiry and access removal clear private detail and cached rows',async({page})=>{
 await login(page);
 await page.locator('[data-action="club-request-review"][data-id="'+requestIds[0]+'"]').click();
 await db.doc('martini_v2_admins/'+account.uid).update({active:false});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('form[data-form="login"]')).toBeVisible();
 await expect(page.getByText('조회전용 가상 신청자')).toHaveCount(0);
 await db.doc('martini_v2_admins/'+account.uid).update({active:true,expiresAt:new Date(Date.now()-1000).toISOString()});
 await page.reload();await expect(page.locator('.form-error')).toContainText('임기가 종료');
});

test('Firebase disabled users and revoked tokens fail even for already issued bearer tokens',async({page})=>{
 await login(page);const {token}=await client(page);
 await auth.updateUser(account.uid,{disabled:true});
 expect((await call(token,{op:'clubRequests'})).error?.status).toBe('UNAUTHENTICATED');
 await auth.updateUser(account.uid,{disabled:false});
 // Firebase uses seconds for auth_time; wait to cross that boundary before revoking.
 await new Promise(resolve=>setTimeout(resolve,1100));await auth.revokeRefreshTokens(account.uid);
 expect((await call(token,{op:'clubRequests'})).error?.status).toBe('UNAUTHENTICATED');
 await page.reload();await expect(page.locator('form[data-form="login"]')).toBeVisible();
});

test('temporary profile failure retries with the existing authentication',async({page})=>{
 await login(page);
 await page.route(endpoint,route=>route.request().postDataJSON()?.data.op==='profile'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{status:'UNAVAILABLE',message:'temporary local failure'}})}):route.continue());
 await page.reload();await expect(page.getByRole('heading',{name:'연결을 확인해 주세요'})).toBeVisible();
 await page.unroute(endpoint);await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await expect(page.locator('.workspace h1')).toHaveText('신청 · 문의');
});

test('late request data cannot repopulate private cache after logout',async({page})=>{
 await login(page);
 let release,arrived;const pending=new Promise(resolve=>{arrived=resolve;});
 await page.route(endpoint,async route=>{
  if(route.request().postDataJSON()?.data.op!=='clubRequests')return route.continue();
  await new Promise(resolve=>{release=resolve;arrived();});
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{rows:[{id:'late',kind:'inquiry',name:'late private response',status:'pending'}],nextCursor:null}})});
 });
 const rendering=page.evaluate(async()=>{const {ctx}=await import('/src/main.js');await ctx.render();});
 await pending;
 await page.evaluate(async()=>{const {ctx}=await import('/src/main.js');const {adminAction}=await import('/src/admin.js');await adminAction(ctx,'logout');});
 release();await rendering;
 await expect(page.locator('form[data-form="login"]')).toBeVisible();
 expect(await page.evaluate(async()=>{const {state}=await import('/src/main.js');return !!state.clubRequestPage||!!state.requestPageReuse;})).toBe(false);
});

test('existing owner can approve and reject visits, reply to inquiries and delete records',async({page})=>{
 const sessionKey=randomUUID().replaceAll('-','').repeat(2),receiptKey=randomUUID().replaceAll('-','').repeat(2),id='approved-'+account.uid;
 expect((await call(null,{op:'memberAccess',name:'가상부원 가',studentId:'202600001',sessionKey})).error).toBeUndefined();
 const submitted=await call(null,{op:'submitClubRequest',kind:'visit',sessionKey,requestId:id,receiptKey,consent:true,startsAt:new Date(Date.now()+86400000).toISOString(),guestCount:1,guestNames:'승인 가상 방문자',purpose:'기존 관리자 승인 회귀'});
 expect(submitted.error).toBeUndefined();requestIds.push(id);
 await page.goto('/admin');await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();await expect(page.getByRole('heading',{name:'운영 현황'})).toBeVisible();
 await page.goto('/admin/requests');
 const review=id=>page.locator('[data-action="club-request-review"][data-id="'+id+'"]');
 await review(requestIds[0]).click();await page.getByRole('dialog').locator('[name=response]').fill('기존 관리자 답변');await page.getByRole('dialog').getByRole('button',{name:'답변 저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await db.doc('martini_v2_clubRequests/'+requestIds[0]).get()).data().status).toBe('answered');
 await review(requestIds[1]).click();await page.getByRole('dialog').locator('[name=decision]').selectOption('reject');await page.getByRole('dialog').locator('[name=response]').fill('기존 관리자 반려');await page.getByRole('dialog').getByRole('button',{name:'반려',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await db.doc('martini_v2_clubRequests/'+requestIds[1]).get()).data().status).toBe('rejected');
 await review(id).click();await page.getByRole('dialog').getByRole('button',{name:'승인',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await db.doc('martini_v2_clubRequests/'+id).get()).data().status).toBe('approved');
 await page.locator('[data-action="club-request-delete"][data-id="'+requestIds[0]+'"]').click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(review(requestIds[0])).toHaveCount(0);
 expect((await db.doc('martini_v2_clubRequests/'+requestIds[0]).get()).data().deletedAt).toBeTruthy();
});
