import {test,expect} from '@playwright/test';

async function setup(page,baseURL,{staffFee=null,permissions=['finance'],failToggle=false}={}){
 if(!/^http:\/\/127\.0\.0\.1:(5173|5185)$/.test(baseURL))throw Error('Local UI tests only');
 const event={id:'event',title:'가상 교육',type:'class',status:'open',fee:25000,staffFee,staffFeeRevision:staffFee===null?0:1,registered:2,waiting:0,capacity:20,semester:'2026-2',location:'동아리방',startsAt:'2026-09-20T09:00:00Z',questions:[]};
 const seed={events:[event,{...event,id:'other',title:'다른 행사',staffFee:2000}],applications:['one','two','cancelled'].map((id,i)=>({id,eventId:'event',name:['가상하나','가상둘','가상취소'][i],fee:25000,isStaff:false,staffFee:25000,pricingRevision:0,paidAmount:0,refundAmount:0,status:id==='cancelled'?'cancelled':'registered',payment:'unpaid',attendance:'absent',answers:[],createdAt:'2026-09-11T00:00:00Z'})),failToggle,requests:[]};
 await page.route('**/src/firebase.js*',route=>route.fulfill({contentType:'application/javascript',body:`
 export const local=true,auth={};export function onAuthStateChanged(auth,cb){queueMicrotask(()=>cb({uid:'test'}));return()=>{};}
 export async function signInWithEmailAndPassword(){} export async function signOut(){} export async function sendPasswordResetEmail(){}
 const profile={uid:'test',role:'finance',roleName:'검증 담당',displayName:'로컬 검증',permissions:${JSON.stringify(permissions)}};
 const seed=${JSON.stringify(seed)};
 export async function api(op,data={}){
  const store=JSON.parse(sessionStorage.getItem('staff-fixture')||'null')||structuredClone(seed),save=()=>sessionStorage.setItem('staff-fixture',JSON.stringify(store));
  if(op==='profile')return profile;
  if(op==='read'){
   if(data.kind==='settings')return {rows:[{semester:'2026-2',location:'동아리방'}]};
   let rows=store[data.kind]||[];if(data.recordId)rows=rows.filter(r=>r.id===data.recordId);if(data.eventId)rows=rows.filter(r=>r.eventId===data.eventId);
   rows=structuredClone(rows);if(!profile.permissions.includes('finance'))for(const row of rows)for(const key of ['isStaff','staffFee','staffFeeRevision','pricingRevision','payment','paidAmount','refundAmount'])delete row[key];
   return {rows,nextCursor:null};
  }
  if(op==='participantContact')return {department:'가상학과',studentId:'20260000',phone:'01000000000'};
  if(op==='setEventStaffFee'){
   const e=store.events.find(e=>e.id===data.id);if(e.staffFeeRevision!==data.staffFeeRevision)throw Error('금액이 변경되었습니다.');
   const rows=store.applications.filter(a=>a.eventId===e.id&&a.isStaff&&a.status==='registered');if(rows.some(a=>a.paidAmount>data.staffFee))throw Error('입금액보다 낮습니다.');
   e.staffFee=data.staffFee;e.staffFeeRevision++;for(const a of rows){a.staffFee=e.staffFee;a.pricingRevision++;a.payment=e.staffFee===0?'none':'unpaid';}
   store.requests.push({op,...data});save();return {saved:true};
  }
  if(op==='setApplicationStaff'){
   if(store.failToggle){save();throw Error('저장하지 못했습니다. 다시 시도해 주세요.');}
   const a=store.applications.find(a=>a.id===data.id),e=store.events.find(e=>e.id===a.eventId);
   if(a.pricingRevision!==data.pricingRevision||data.isStaff&&e.staffFeeRevision!==data.staffFeeRevision)throw Error('금액이 변경되었습니다.');
   a.isStaff=data.isStaff;a.staffFee=a.isStaff?e.staffFee:a.fee;a.pricingRevision++;a.payment=a.staffFee===0?'none':'unpaid';
   store.requests.push({op,...data});save();return {saved:true,isStaff:a.isStaff,staffFee:a.staffFee,pricingRevision:a.pricingRevision,payment:a.payment};
  }
  throw Error('Unexpected API: '+op);
 }
 `}));
 page._staffErrors=[];page.on('pageerror',e=>page._staffErrors.push(e.message));
 await page.goto('/admin/events/event');await expect(page.getByRole('heading',{name:'가상 교육',exact:true})).toBeVisible();
}
const row=(page,name)=>page.locator('tbody tr').filter({hasText:name});
async function setFee(page,fee){
 await page.getByRole('button',{name:'관리인원 금액 설정',exact:true}).click();
 await page.getByRole('spinbutton',{name:/관리인원 참가비/}).fill(String(fee));await page.getByRole('button',{name:'공통 금액 적용',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.afterEach(async({page},info)=>{
 expect(page._staffErrors||[]).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'.local/screenshots/staff-pricing-'+info.project.name+'-'+info.title.replace(/[^a-z]+/gi,'-')+'.png'});
});

test('set a shared amount once and use list checkboxes to register staff or update everyone',async({page,baseURL})=>{
 await setup(page,baseURL);await expect(page.getByRole('checkbox',{name:'가상하나 관리인원',exact:true})).toBeDisabled();
 await setFee(page,10000);await expect(page.getByRole('region',{name:'관리인원 공통 금액'})).toContainText('10,000원');
 for(const name of ['가상하나','가상둘']){await page.getByRole('checkbox',{name:name+' 관리인원',exact:true}).check();await expect(row(page,name)).toContainText('0원 / 10,000원');}
 await setFee(page,12000);for(const name of ['가상하나','가상둘'])await expect(row(page,name)).toContainText('0원 / 12,000원');
 await page.reload();await expect(page.getByRole('checkbox',{name:'가상하나 관리인원',exact:true})).toBeChecked();
 const data=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('staff-fixture')));expect(data.events[1].staffFee).toBe(2000);expect(data.events[0].fee).toBe(25000);
 const toggles=data.requests.filter(r=>r.op==='setApplicationStaff');expect(toggles).toHaveLength(2);expect(toggles.every(r=>!('staffFee' in r))).toBe(true);
 await expect(page.getByRole('button',{name:'참가비 설정',exact:true})).toHaveCount(0);
});

test('application processing has one staff checkbox and unchecking restores the original fee',async({page,baseURL})=>{
 await setup(page,baseURL,{staffFee:8000});await row(page,'가상하나').getByRole('button',{name:'신청 상세 · 처리'}).click();
 await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(1);await expect(page.getByRole('dialog').getByRole('spinbutton')).toHaveCount(0);
 await page.getByRole('dialog').getByRole('checkbox',{name:'가상하나 관리인원',exact:true}).check();
 await expect(page.getByRole('dialog').locator('.detail-grid')).toContainText('8,000원');
 await page.getByRole('dialog').getByRole('checkbox',{name:'가상하나 관리인원',exact:true}).uncheck();
 await expect(page.getByRole('dialog').locator('.detail-grid')).toContainText('25,000원');
 await page.screenshot({path:'.local/screenshots/staff-processing-'+test.info().project.name+'.png'});
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();await expect(row(page,'가상하나')).toContainText('0원 / 25,000원');
});

test('zero fee works, cancelled applications stay disabled, and failed saves restore checkbox state',async({page,baseURL})=>{
 await setup(page,baseURL,{staffFee:0,failToggle:true});const checkbox=page.getByRole('checkbox',{name:'가상하나 관리인원',exact:true});
 await checkbox.click();await expect(checkbox).not.toBeChecked();await expect(checkbox).toBeEnabled();
 await expect(page.getByRole('checkbox',{name:'가상취소 관리인원',exact:true})).toBeDisabled();
 await page.evaluate(()=>sessionStorage.setItem('staff-fixture',JSON.stringify({...JSON.parse(sessionStorage.getItem('staff-fixture')||'null'),failToggle:false})));
 await page.getByRole('checkbox',{name:'가상하나 관리인원',exact:true}).check();await expect(row(page,'가상하나')).toContainText('0원 / 0원');
});

test('event-only staff cannot see financial settings or designation checkboxes',async({page,baseURL})=>{
 await setup(page,baseURL,{staffFee:8000,permissions:['events']});await expect(page.getByRole('region',{name:'관리인원 공통 금액'})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:/관리인원/})).toHaveCount(0);
 await row(page,'가상하나').getByRole('button',{name:'신청 상세 · 처리'}).click();await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
 await expect(page.getByRole('dialog').locator('.detail-grid')).toContainText('25,000원');await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).last().click();
});
