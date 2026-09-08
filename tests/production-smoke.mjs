import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
// Only normal public reads and login-form rendering. No credentials, emails or business data writes.
const base='https://hyu-martini.site';
const browser=await chromium.launch({...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),headless:true});
await fs.mkdir('.local/screenshots',{recursive:true});
const results=[];
try {
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  const pageErrors=[],appCheckStatuses=[],apiStatuses=[];
  page.on('pageerror',error=>pageErrors.push(error.name));
  page.on('response',response=>{const url=new URL(response.url());if(['firebaseappcheck.googleapis.com','content-firebaseappcheck.googleapis.com'].includes(url.hostname))appCheckStatuses.push(response.status());if(url.hostname.endsWith('.cloudfunctions.net'))apiStatuses.push(response.status());});
  for(const route of ['/','/about/','/activities/','/notices/','/join/','/privacy/','/admin/','/admin/meetings/']){
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
   expect(response.status()).toBe(200);
   await expect(page.locator('h1')).toBeVisible({timeout:60000});
   await expect(page.locator('h1')).not.toContainText(/불러오지 못|연결을 확인|찾을 수 없/);
   await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   if(route==='/'){await expect(page.locator('#hero-title')).toHaveText('Martini');await page.screenshot({path:'.local/screenshots/live-home-'+device+'.jpg',type:'jpeg',quality:80});}
   if(route.startsWith('/admin/')){
    await expect(page.locator('form[data-form="login"]')).toBeVisible();
    await expect(page.getByRole('button',{name:'가상 임원으로 확인하기'})).toHaveCount(0);
    if(route==='/admin/'){
     await page.screenshot({path:'.local/screenshots/live-login-'+device+'.jpg',type:'jpeg',quality:80});
     await page.locator('[data-action="password-reset"]').click();
     await expect(page.getByRole('dialog')).toBeVisible();
     await expect(page.getByRole('button',{name:'재설정 메일 요청'})).toBeVisible();
    }
   }
   results.push({device,route,status:response.status(),overflow:false});
  }
  expect(pageErrors).toEqual([]);
  expect(apiStatuses.length).toBeGreaterThan(0);expect(apiStatuses.every(code=>code===200)).toBe(true);
  expect(appCheckStatuses.length).toBeGreaterThan(0);
  results.push({device,pageErrors,apiStatuses,appCheckStatuses});
  await page.close();
 }
 const attestationPassed=results.filter(row=>row.appCheckStatuses).every(row=>row.appCheckStatuses.every(code=>code===200)); console.log(JSON.stringify({uiPassed:true,attestationPassed,authenticatedLoginTested:false,results},null,2));
 await fs.writeFile('.local/production-smoke.json',JSON.stringify({verifiedAt:new Date().toISOString(),uiPassed:true,attestationPassed,authenticatedLoginTested:false,results},null,2));
expect(attestationPassed, 'App Check rejected this automated browser; do not disable protection to make this check pass.').toBe(true);
} finally {await browser.close();}
