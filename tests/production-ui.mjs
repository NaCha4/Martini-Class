import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
// Public rendering only: no sign-in, email submission or business record writes.
const base='https://hyu-martini.site';
const expectedAssets=[...(await fs.readFile('index.html','utf8')).matchAll(/(?:src|href)="(\/assets\/index-[^"]+\.(?:js|css))"/g)].map(match=>match[1]);
if(expectedAssets.length!==2)throw Error('Build the Pages output before verifying its release.');
const browser=await chromium.launch({...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),headless:true});
const results=[];
try {
 for(const [device,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.name));
  const response=await page.goto(base+'/',{waitUntil:'domcontentloaded'});expect(response.status()).toBe(200);
  await expect(page.locator('#hero-title')).toHaveText('Martini');
  const assets=await page.locator('script[src],link[rel=stylesheet]').evaluateAll(elements=>elements.map(element=>new URL(element.src||element.href).pathname));
  expectedAssets.forEach(asset=>expect(assets).toContain(asset));
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarGutter)).toContain('stable');
  if(device==='mobile'){await page.locator('.public-mobile-menu summary').click();await page.keyboard.press('Escape');await expect(page.locator('.public-mobile-menu')).not.toHaveAttribute('open','');}
  await page.locator('.staff-link').click();await expect(page.locator('form[data-form=login]')).toBeVisible();
  await expect(page.locator('h1')).toBeFocused();
  const before=await page.locator('.login-card').boundingBox();
  await page.locator('[data-action=password-reset]').click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading')).toBeFocused();
  const during=await page.locator('.login-card').boundingBox();expect(Math.abs(before.x-during.x)).toBeLessThanOrEqual(1);
  await dialog.locator('[name=email]').fill('ui-check@example.invalid');
  await page.keyboard.press('Escape');await expect(page.locator('#discard-changes')).toBeVisible();
  await page.getByRole('button',{name:'변경사항 버리기',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-action=password-reset]')).toBeFocused();
  const password=page.locator('[name=password]');await password.fill('local-ui-preview');
  await page.locator('[data-password-toggle]').click();await expect(password).toHaveAttribute('type','text');
  await page.locator('[data-password-toggle]').click();await expect(password).toHaveAttribute('type','password');await password.fill('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:'.local/screenshots/released-login-'+device+'.jpg',type:'jpeg',quality:80});
  results.push({device,assets:expectedAssets,scrollbarStable:true,modalGeometryStable:true,dirtyCloseGuard:true,passwordToggle:true,overflow:false,errors});
  await page.close();
 }
 console.log(JSON.stringify({ok:true,results},null,2));
 await fs.writeFile('.local/production-ui.json',JSON.stringify({verifiedAt:new Date().toISOString(),ok:true,results},null,2));
} finally {await browser.close();}
