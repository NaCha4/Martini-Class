import { defineConfig,devices } from '@playwright/test';
import fs from 'node:fs';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:60000,
 expect:{timeout:12000},reporter:[['list'],['html',{outputFolder:'.local/playwright-report',open:'never'}]],
 outputDir:'.local/playwright-results',
 use:{baseURL:'http://127.0.0.1:5173',headless:true,trace:'retain-on-failure',launchOptions:fs.existsSync(chrome)?{executablePath:chrome}:{}},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}]
});
