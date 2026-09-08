import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
await fs.mkdir('.local/screenshots',{recursive:true});
for(const [name,viewport,path] of [['home-desktop',{width:1440,height:1000},'/'],['home-mobile',{width:390,height:844},'/'],['admin-desktop',{width:1440,height:1000},'/admin'],['event-mobile',{width:390,height:844},'/e/demo-opening#key='+ 'a'.repeat(64)]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173'+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
 if(name==='admin-desktop'){await page.getByRole('button',{name:'가상 임원으로 확인하기'}).click();await page.getByRole('heading',{name:'운영 현황'}).waitFor();}
 await page.screenshot({path:'.local/screenshots/'+name+'.jpg',type:'jpeg',quality:75});
 console.log(JSON.stringify({name,title:await page.title(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors}));
 await page.close();
}await browser.close();
