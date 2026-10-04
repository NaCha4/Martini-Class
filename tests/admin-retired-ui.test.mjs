import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { defaultRoles, hasPermission, permissionLabels } from '../functions/src/permissions.js';
import { field } from '../web/src/ui.js';
import { renderPartnerAdmin, partnerAdminAction } from '../web/src/partner-admin.js';

// Load the actual renderer and form handlers without initializing Firebase.
// In particular, these checks never load the app's Firebase configuration.
const firebaseUrl=new URL('../web/src/firebase.js',import.meta.url).href;
const hook=registerHooks({load(url,context,nextLoad){
 if(url===firebaseUrl)return {format:'module',shortCircuit:true,source:`
  export const auth={},local=false;
  export const signInWithEmailAndPassword=async()=>{throw Error('Unexpected authentication call');};
  export const signOut=async()=>{throw Error('Unexpected authentication call');};
  export const sendPasswordResetEmail=async()=>{throw Error('Unexpected authentication call');};
 `};
 if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
 return nextLoad(url,context);
}});
let renderAdmin,adminAction;
try{({renderAdmin,adminAction}=await import('../web/src/admin.js'));}
finally{hook.deregister();}

const retired=['finance','meetings','decisions','content','notices'];
const permissions=['events','members','inventory','finance','meetings','decisions','content','settings','audit','admins'];
const profile=(extra={})=>({uid:'admin-a',role:'owner',roleName:'회장',displayName:'운영진',permissions:[...permissions],...extra});
const settings={id:'current',semester:'2026-2',contact:'동아리 문의 채널'};
const event=(extra={})=>({id:'event-a',title:'가을 교육',type:'class',semester:'2026-2',status:'open',location:'교육실',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),registered:1,waiting:0,capacity:20,fee:5000,staffFee:2000,staffFeeRevision:1,description:'칵테일 교육',policy:'환불 안내',...extra});
const application={id:'application-a',name:'김부원',status:'registered',attendance:'present',payment:'paid',paidAmount:5000,fee:5000,createdAt:'2026-10-01T03:00:00.000Z',isStaff:false};

function context({operator=profile(),rows={},roles=[]}={}){
 const calls=[],navigations=[];
 const ctx={state:{authReady:true,profile:operator,data:{},settings:{...settings}},
  api:async(op,data)=>{
   calls.push({op,data});
   if(op==='profile')return operator;
   if(op==='listRoles')return {rows:roles};
   if(op==='listInventoryCategories')return {rows:rows.inventoryCategories||[]};
   if(op==='read'){
    assert.ok(!retired.includes(data.kind),'Retired records must not be read: '+data.kind);
    assert.ok(['settings','events','members','inventory','applications'].includes(data.kind),'Unexpected read: '+data.kind);
    return {rows:data.kind==='settings'?[{...settings}]:rows[data.kind]||[],nextCursor:null};
   }
   throw Error('Unexpected API operation: '+op);
  },
  navigate:async(...args)=>{navigations.push(args);},
 };
 return {ctx,calls,navigations};
}
async function globals(values,run){
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,value});
 try{return await run();}
 finally{for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
const at=(path,run)=>{const url=new URL(path,'https://martini.test');return globals({location:{pathname:url.pathname,search:url.search}},run);};
const hrefs=html=>[...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map(match=>match[1]);
function noRetiredLinks(html){
 for(const href of hrefs(html))assert.ok(!retired.some(kind=>new RegExp('^/admin/'+kind+'(?:[/?#]|$)').test(href)),'Retired link: '+href);
 assert.doesNotMatch(html,/data-action="(?:finance-|budget-|meeting-|decision-|content-)/);
}
const main=html=>html.match(/<main id="main-content" class="workspace-content">([\s\S]*?)<\/main>/)?.[1]||'';
const nav=(html,label)=>html.match(new RegExp('<nav aria-label="'+label+'">([\\s\\S]*?)<\\/nav>'))?.[1]||'';

// A tiny dialog host lets the real modal renderer and submit callbacks run.
// Browser layout and icon replacement are outside these checks.
async function withDialogs(run){
 const dialogs=[];
 const element=()=>({innerHTML:'',style:{},isConnected:true,classList:{toggle(){},add(){}},listeners:new Map(),setAttribute(){},removeAttribute(){},addEventListener(name,handler){this.listeners.set(name,handler);},querySelectorAll:()=>[],focus(){},scrollIntoView(){},remove(){this.isConnected=false;}});
 const document={
  activeElement:null,
  body:{append:dialog=>dialogs.push(dialog)},
  documentElement:{classList:{add(){},remove(){}},style:{setProperty(){}}},
  querySelector:()=>null,querySelectorAll:()=>[],
  createElement:tag=>{
   assert.equal(tag,'dialog');
   const dialog=element(),form=element(),parts=new Map([['form',form],['.dialog-scroll',element()],['.dialog-actions',element()],['.dialog-status',element()],['#modal-title',element()]]);
   form.entries=[];
   const error=element();
   form.querySelector=selector=>selector.includes('form-error')?error:null;
   dialog.querySelector=selector=>{
    if(parts.has(selector))return parts.get(selector);
    if(selector==='[type=submit]'||selector==='[data-event-status-help]'||selector==='[data-existing-applications]'||selector==='[data-partner-reset-progress]'){
     const control=element();parts.set(selector,control);return control;
    }
    const name=selector.match(/^\[name=([^\]]+)\]$/)?.[1];
    if(name){
     const tag=dialog.innerHTML.match(new RegExp('<(?:input|select|textarea)\\b[^>]*name="'+name+'"[^>]*>'))?.[0];
     if(!tag)return null;
     const control=element(),wrapper=element();
     control.value=tag.match(/\bvalue="([^"]*)"/)?.[1]??dialog.innerHTML.match(new RegExp('<select\\b[^>]*name="'+name+'"[^>]*>[\\s\\S]*?<option value="([^"]*)" selected'))?.[1]??'';
     control.checked=/\bchecked\b/.test(tag);
     control.closest=()=>wrapper;parts.set(selector,control);return control;
    }
    return null;
   };
   dialog.querySelectorAll=()=>[];
   dialog.showModal=()=>{dialog.open=true;};
   dialog.close=()=>{if(!dialog.open)return;dialog.open=false;dialog.listeners.get('close')?.();};
   return dialog;
  },
 };
 class DialogFormData{
  constructor(form){this.entries=form.entries;}
  *[Symbol.iterator](){yield* this.entries;}
  get(key){return this.entries.find(([name])=>name===key)?.[1]??null;}
  has(key){return this.entries.some(([name])=>name===key);}
 }
 return globals({document,CSS:{supports:()=>true},FormData:DialogFormData},async()=>{
  const result=await run(dialogs);
  await Promise.resolve(); // Modal baseline refresh uses a microtask.
  return result;
 });
}

const resetUuid='12345678-1234-4234-8234-123456789abc';
const resetReply=(requestId,done=false,total=1)=>({requestId,done,deleted:{coupons:total,qrs:total,adjustments:0,audit:total}});
const pendingReply=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function withReset(run,{reset,respond}={}){
 const {ctx}=context();ctx.state.user={uid:'reset-test-admin'};const calls=[],toasts=[];
 const config={enabled:true,configured:true,revision:2,...(reset?{reset}:{})};
 ctx.renders=0;ctx.toast=value=>toasts.push(value);
 ctx.api=async(op,data)=>{calls.push({op,data});if(op==='couponSettings')return structuredClone(config);if(op==='resetCouponData'){const result=await (respond?respond(data,calls.filter(call=>call.op==='resetCouponData').length):resetReply(data.requestId,true));config.reset=result;return result;}throw Error('Unexpected reset test operation '+op);};
 ctx.render=async()=>{ctx.renders++;return renderPartnerAdmin(ctx);};
 return at('/admin/partners',async()=>{const html=await renderPartnerAdmin(ctx);return withDialogs(async dialogs=>{
  const open=async()=>{await partnerAdminAction(ctx,'partneradmin-reset');return dialogs.at(-1);};
  const submit=async(dialog,value='초기화')=>{const form=dialog.querySelector('form');form.entries=[['confirmation',value]];await form.listeners.get('submit')({preventDefault(){}});};
  return run({ctx,calls,toasts,html,config,dialogs,open,submit});
 });});
}

test('stamp reset stays inside the partner card and opening or cancelling never deletes records',async()=>withReset(async({html,calls,open})=>{
 assert.match(html,/partner-admin-actions[\s\S]*data-action="partneradmin-reset"/);assert.match(html,/스탬프 초기화 \(임시\)/);
 const dialog=await open();assert.match(dialog.innerHTML,/현재 보유 스탬프/);assert.match(dialog.innerHTML,/적립·수정 내역과 발급된 QR/);assert.match(dialog.innerHTML,/스탬프 관련 활동 로그/);assert.match(dialog.innerHTML,/설정과 사장님 로그인은 유지/);assert.match(dialog.innerHTML,/초기화 작업 자체는 로그/);assert.match(dialog.innerHTML,/button danger/);
 assert.equal(await dialog.requestClose(),true);assert.equal(dialog.open,false);assert.deepEqual(calls.map(call=>call.op),['couponSettings']);
}));

test('stamp reset requires the exact confirmation phrase before any destructive request',async()=>withReset(async({calls,open,submit})=>{
 const dialog=await open();for(const phrase of ['', '삭제', ' 초기화', '초기화 ', '초 기화']){await submit(dialog,phrase);assert.equal(dialog.open,true);assert.match(dialog.querySelector('form').querySelector('.form-error').textContent,/정확히 입력/);}
 assert.equal(calls.filter(call=>call.op==='resetCouponData').length,0);
}));

test('stamp reset sends one operation ID through sequential batches and closes only after completion',async()=>{
 let active=0,maxActive=0;
 await withReset(async({calls,toasts,open,submit,ctx})=>{
  const dialog=await open();await submit(dialog);const writes=calls.filter(call=>call.op==='resetCouponData');assert.equal(writes.length,3);assert.equal(new Set(writes.map(call=>call.data.requestId)).size,1);assert.match(writes[0].data.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for(const write of writes)assert.deepEqual(Object.keys(write.data).sort(),['confirmation','requestId']);assert.ok(writes.every(call=>call.data.confirmation==='초기화'));assert.equal(dialog.open,false);assert.equal(ctx.renders,1);assert.equal(toasts.length,1);assert.equal(maxActive,1);
 },{respond:async(data,n)=>{active++;maxActive=Math.max(active,maxActive);await Promise.resolve();active--;return resetReply(data.requestId,n===3,n);}});
});

test('an in-progress reset cannot be closed and a network retry retains its operation ID',async()=>{
 const pending=pendingReply();
 await withReset(async({calls,open,submit})=>{
  const dialog=await open(),saving=submit(dialog);await Promise.resolve();await Promise.resolve();assert.equal(await dialog.requestClose(),false);assert.equal(dialog.open,true);
  pending.reject(Error('네트워크 오류'));await saving;assert.equal(dialog.open,true);assert.match(dialog.querySelector('form').querySelector('.form-error').textContent,/일부 기록이 삭제되었을 수 있습니다/);
  const first=calls.find(call=>call.op==='resetCouponData').data.requestId;await submit(dialog);const writes=calls.filter(call=>call.op==='resetCouponData');assert.equal(writes.length,2);assert.ok(writes.every(call=>call.data.requestId===first));assert.equal(dialog.open,false);
 },{respond:(data,n)=>n===1?pending.promise:resetReply(data.requestId,true)});
});

test('an interrupted reset is resumed from settings and closing an error keeps its ID for reopening',async()=>{
 await withReset(async({calls,html,open,submit})=>{
  assert.match(html,/초기화 이어서/);assert.match(html,/초기화 진행 중/);assert.match(html,/data-action="partneradmin-history"[^>]*disabled/);assert.match(html,/data-action="partneradmin-edit"[^>]*disabled/);const dialog=await open();assert.match(dialog.innerHTML,/진행 중인 초기화/);await submit(dialog);assert.ok(calls.filter(call=>call.op==='resetCouponData').every(call=>call.data.requestId===resetUuid));
 },{reset:resetReply(resetUuid,false,10)});
 await withReset(async({calls,open,submit,ctx})=>{
  const dialog=await open();await submit(dialog);const id=calls.find(call=>call.op==='resetCouponData').data.requestId;await dialog.requestClose(true);const reopened=await open();assert.match(reopened.innerHTML,/초기화 이어서/);await submit(reopened);assert.equal(ctx.state.partnerAdminView.settings.reset.requestId,id);assert.equal(new Set(calls.filter(call=>call.op==='resetCouponData').map(call=>call.data.requestId)).size,1);
 },{respond:()=>{throw Error('연결 오류');}});
});

test('reset batches stop at a bounded checkpoint and the next confirmation continues the same operation',async()=>withReset(async({calls,open,submit})=>{
 const dialog=await open();await submit(dialog);assert.equal(calls.filter(call=>call.op==='resetCouponData').length,30);assert.equal(dialog.open,true);assert.match(dialog.querySelector('form').querySelector('.form-error').textContent,/아직 진행 중/);
 await submit(dialog);const writes=calls.filter(call=>call.op==='resetCouponData');assert.equal(writes.length,31);assert.equal(new Set(writes.map(call=>call.data.requestId)).size,1);assert.equal(dialog.open,false);
},{respond:(data,n)=>resetReply(data.requestId,n===31,n)}));

test('permission or identity loss before confirmation prevents reset and closes the old dialog',async()=>{
 for(const change of [ctx=>{ctx.state.profile={...ctx.state.profile,permissions:[]};},ctx=>{ctx.state.user={uid:'other-admin'};},ctx=>{ctx.state.profile={...ctx.state.profile};}])await withReset(async({ctx,calls,open,submit})=>{
  const dialog=await open();change(ctx);await submit(dialog);assert.equal(dialog.open,false);assert.equal(calls.filter(call=>call.op==='resetCouponData').length,0);assert.equal(ctx.renders,1);
 });
});

test('permission rejection during reset closes the dialog and cannot trigger another batch',async()=>withReset(async({ctx,calls,open,submit,toasts})=>{
 const dialog=await open();await submit(dialog);assert.equal(dialog.open,false);assert.equal(calls.filter(call=>call.op==='resetCouponData').length,1);assert.equal(ctx.renders,1);assert.equal(toasts.length,0);
},{respond:()=>{throw Object.assign(Error('권한이 없습니다.'),{code:'functions/permission-denied'});}}));

test('late reset responses cannot continue after navigation, account replacement, or dialog closure',async()=>{
 for(const change of [async()=>{location.pathname='/admin/events';},async ctx=>{ctx.state.user={uid:'different-admin'};},async(_ctx,dialog)=>dialog.requestClose(true)]){
  const pending=pendingReply();await withReset(async({ctx,calls,toasts,open,submit})=>{
   const dialog=await open(),saving=submit(dialog);await Promise.resolve();await Promise.resolve();assert.equal(calls.filter(call=>call.op==='resetCouponData').length,1);await change(ctx,dialog);pending.resolve(resetReply(calls.find(call=>call.op==='resetCouponData').data.requestId,false));await saving;
   assert.equal(dialog.open,false);assert.equal(calls.filter(call=>call.op==='resetCouponData').length,1);assert.equal(toasts.length,0);
  },{respond:()=>pending.promise});
 }
});

test('a completed reset response does not issue a second destructive request',async()=>withReset(async({calls,open,submit})=>{
 const dialog=await open();await submit(dialog);await submit(dialog);assert.equal(calls.filter(call=>call.op==='resetCouponData').length,1);
},{reset:resetReply(resetUuid,true,4)}));

test('partner management requires settings permission and reads only safe dedicated configuration',async()=>{
 for(const permitted of [false,true]){
  const {ctx,calls}=context({operator:profile({permissions:permitted?['settings']:['events']})}),api=ctx.api;
  ctx.api=async(op,data)=>{if(op==='couponSettings'){calls.push({op,data});return {revision:1,configured:true,enabled:true};}return api(op,data);};
  const html=await at('/admin/partners',()=>renderAdmin(ctx));
  if(permitted){assert.match(html,/필링파인/);assert.doesNotMatch(html,/사장님 화면 열기|href="\/partners\/feelingfine/);assert.match(html,/설정됨/);assert.match(html,/data-action="partneradmin-edit"/);assert.match(html,/data-action="partneradmin-history"/);assert.deepEqual(calls.map(call=>call.op),['profile','couponSettings']);}
  else{assert.match(html,/접근 권한이 없습니다/);assert.doesNotMatch(html,/필링파인|설정됨/);assert.deepEqual(calls.map(call=>call.op),['profile']);}
 }
});

test('partner code editor has no enable control or length limits and saves confirmed short and long codes',async()=>{
 for(const code of ['7','synthetic-long-code-'.repeat(20)]){
 const {ctx}=context(),api=ctx.api,payloads=[];
 ctx.render=async()=>{};ctx.toast=()=>{};
 ctx.api=async(op,data)=>{if(op==='couponSettings')return {revision:0,configured:false,enabled:false};if(op==='saveCouponSettings'){payloads.push(data);return {revision:1,configured:true,enabled:true};}return api(op,data);};
 await at('/admin/partners',async()=>{
  await renderAdmin(ctx);
  await withDialogs(async dialogs=>{
   await adminAction(ctx,'partneradmin-edit');const dialog=dialogs[0],form=dialog.querySelector('form');
   assert.doesNotMatch(dialog.innerHTML,/name="enabled"|스탬프 적립 사용/);
   for(const name of ['code','codeConfirmation']){
    const input=dialog.innerHTML.match(new RegExp('<input\\b[^>]*name="'+name+'"[^>]*>'))?.[0];
    assert.ok(input);assert.match(input,/\brequired\b/);assert.match(input,/type="password"[^>]*value=""/);assert.doesNotMatch(input,/\b(?:minlength|maxlength)=/);
   }
   form.entries=[['code',code],['codeConfirmation',code]];
   await form.listeners.get('submit')({preventDefault(){}});
   assert.deepEqual(payloads,[{revision:0,code}]);assert.equal(dialog.open,false);
   assert.equal(Object.hasOwn(ctx.state.partnerAdminView||{},'code'),false);
   if(code.length>1)assert.ok(!JSON.stringify(ctx.state).includes(code));
  });
 });
 }
});

test('partner code editor still requires a nonblank initial code and matching confirmation',async()=>{
 for(const [code,confirmation] of [['',''],['  ','  '],['7','8'],['synthetic-long-code-'.repeat(20),'different']]){
  const {ctx}=context(),api=ctx.api,payloads=[];ctx.render=async()=>{};ctx.toast=()=>{};
  ctx.api=async(op,data)=>{if(op==='couponSettings')return {revision:0,configured:false,enabled:false};if(op==='saveCouponSettings'){payloads.push(data);return {revision:1,configured:true,enabled:true};}return api(op,data);};
  await at('/admin/partners',async()=>{
   await renderAdmin(ctx);
   await withDialogs(async dialogs=>{
    await adminAction(ctx,'partneradmin-edit');const dialog=dialogs[0],form=dialog.querySelector('form');form.entries=[['code',code],['codeConfirmation',confirmation]];
    await form.listeners.get('submit')({preventDefault(){}});
    assert.deepEqual(payloads,[]);assert.equal(dialog.open,true);assert.ok(form.querySelector('.form-error').textContent);
   });
  });
 }
});

test('ordinary fields retain their existing default length limits',()=>{
 assert.match(field('title','제목'),/maxlength="200"/);
 assert.match(field('description','내용','',{type:'textarea'}),/maxlength="12000"/);
});

test('partner settings can retain a configured code and cannot submit after permission removal',async()=>{
 for(const revoked of [false,true]){
  const {ctx}=context(),api=ctx.api,payloads=[];ctx.render=async()=>{};ctx.toast=()=>{};
  ctx.api=async(op,data)=>{if(op==='couponSettings')return {revision:3,configured:true,enabled:true};if(op==='saveCouponSettings'){payloads.push(data);return {revision:4,configured:true,enabled:true};}return api(op,data);};
  await at('/admin/partners',async()=>{
   await renderAdmin(ctx);
   await withDialogs(async dialogs=>{
    await adminAction(ctx,'partneradmin-edit');const form=dialogs[0].querySelector('form');form.entries=[['code',''],['codeConfirmation','']];
    if(revoked)ctx.state.profile={...ctx.state.profile,permissions:[]};
    await form.listeners.get('submit')({preventDefault(){}});
    assert.deepEqual(payloads,revoked?[]:[{revision:3}]);
    if(revoked)assert.match(form.querySelector('.form-error').textContent,/계정이나 권한이 변경/);
   });
  });
 }
});

test('all retired routes redirect before authentication and API reads, including old detail and query links',async()=>{
 for(const kind of retired)for(const suffix of ['', '/', '/old-record?category=old&tab=detail'])for(const authenticated of [true,false]){
  const {ctx,calls,navigations}=context();
  if(!authenticated){ctx.state.authReady=false;ctx.state.profile=null;}
  const html=await at('/admin/'+kind+suffix,()=>renderAdmin(ctx));
  assert.equal(html,'');
  assert.deepEqual(navigations,[['/admin',{replace:true,discard:true}]],kind+suffix);
  assert.deepEqual(calls,[],'Redirect must precede every API call');
 }
});

test('dashboard loads only active operational records and renders current-term metrics without retired work',async()=>{
 const {ctx,calls}=context({rows:{
  events:[event(),event({id:'past',endsAt:'2025-01-01T00:00:00.000Z'}),event({id:'draft',status:'draft'}),event({id:'other-term',semester:'2026-1'})],
  members:[{id:'current',semester:'2026-2'},{id:'old',semester:'2026-1'},{id:'anonymous',semester:'2026-2',anonymizedAt:'2026-10-01'}],
  inventory:[{id:'low',name:'레몬',unit:'each',quantity:1,minimum:2},{id:'enough',name:'컵',unit:'each',quantity:3,minimum:2}],
 }});
 const html=await at('/admin',()=>renderAdmin(ctx)),body=main(html);
 assert.deepEqual(calls.filter(call=>call.op==='read').map(call=>call.data.kind).sort(),['events','inventory','members','settings']);
 for(const label of ['다가오는 행사','등록 부원','확인할 재고'])assert.match(body,new RegExp(label+'<\\/span><strong>1<small>'));
 assert.match(body,/가을 교육/);
 assert.match(body,/레몬/);
 assert.doesNotMatch(body,/진행 중 할 일|함께 처리할 일|회의와 결정 기록|회의록|결정 · 할 일|회비 · 정산|활동 기록/);
 noRetiredLinks(html);
});

test('desktop groups and mobile quick navigation retain active menus for an operator with all old permissions',async()=>{
 const {ctx}=context();
 const html=await at('/admin/events',()=>renderAdmin(ctx));
 const desktop=nav(html,'운영 메뉴');
 assert.ok(desktop,'Grouped desktop navigation must render');
 assert.deepEqual(hrefs(desktop),['/admin','/admin/events','/admin/members','/admin/requests','/admin/on-the-rock','/admin/partners','/admin/inventory','/admin/settings','/admin/roles','/admin/admins','/admin/privacy','/admin/audit']);
 assert.match(desktop,/<a href="\/admin\/events"[^>]*aria-current="page"/);
 const mobile=html.match(/<nav class="mobile-admin-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert.ok(mobile,'Mobile quick navigation must render');
 for(const required of ['/admin','/admin/events','/admin/inventory'])assert.ok(hrefs(mobile).includes(required));
 assert.match(mobile,/data-action="mobile-menu"/);
 noRetiredLinks(html);
});

test('mobile full menu uses the active grouped navigation and cannot reopen retired sections',async()=>{
 const {ctx,calls}=context();
 await at('/admin/inventory',()=>withDialogs(async dialogs=>{
  await adminAction(ctx,'mobile-menu');
  assert.equal(dialogs.length,1);
  const html=dialogs[0].innerHTML;
  assert.match(html,/전체 운영 메뉴/);
  for(const required of ['/admin/events','/admin/members','/admin/requests','/admin/on-the-rock','/admin/inventory','/admin/roles'])assert.ok(hrefs(html).includes(required));
  assert.match(html,/<a href="\/admin\/inventory"[^>]*aria-current="page"/);
  noRetiredLinks(html);
 }));
 assert.deepEqual(calls,[]);
});

test('event preparation keeps its inventory workflow without meetings, tasks, publishing, or ledger links',async()=>{
 const {ctx,calls}=context({rows:{events:[event()]}});
 const html=await at('/admin/events/event-a?tab=preparation',()=>renderAdmin(ctx)),body=main(html);
 assert.match(body,/준비와 마무리/);
 assert.ok(hrefs(body).includes('/admin/inventory'));
 assert.doesNotMatch(body,/회의록|결정 · 할 일|지출 · 정산|활동 기록/);
 assert.deepEqual(calls.filter(call=>call.op==='read').map(call=>call.data.kind),['settings','events']);
 noRetiredLinks(html);
});

test('new, legacy, and private event editors preserve visibility defaults and save an explicit public flag',async()=>{
 for(const {existing,storedVisible,submitVisible} of [{existing:false,submitVisible:true},{existing:true,submitVisible:true},{existing:true,storedVisible:false,submitVisible:false},{existing:false,submitVisible:false}]){
  const current=event({revision:4,sequence:1,questions:['준비물 확인'],...(storedVisible===undefined?{}:{memberVisible:storedVisible})});
  const {ctx}=context();
  if(existing)ctx.state.data.events={[current.id]:current};
  const saved=[];let rendered=0;
  ctx.api=async(op,data)=>{assert.equal(op,'saveEvent');saved.push(data);return {saved:true,...(!submitVisible?{linkKey:'legacy-private-link'}:{})};};
  ctx.render=async()=>{rendered++;};ctx.toast=()=>{};
  await at('/admin/events'+(existing?'/'+current.id:''),()=>withDialogs(async dialogs=>{
   await adminAction(ctx,'event-edit',existing?current.id:undefined);
   assert.equal(dialogs.length,1);
   const dialog=dialogs[0],html=dialog.innerHTML;
   assert.equal(dialog.open,true);
   assert.match(html,new RegExp(existing?'행사 편집':'새 행사 만들기'));
   for(const title of ['1. 기본 정보','2. 행사 · 신청 일정','3. 정원 · 참가비','4. 모집 상태 확인'])assert.ok(html.includes(title),title);
   for(const name of ['title','semester','location','startsAt','endsAt','opensAt','closesAt','cancelUntil','capacity','fee','policy']){
    assert.match(html,new RegExp('<(?:input|textarea)\\b[^>]*name="'+name+'"[^>]*\\brequired\\b'),name+' must be editable and required');
   }
   assert.equal(dialog.querySelector('[name=status]').value,existing?'open':'draft');
   assert.equal(dialog.querySelector('[name=memberVisible]').checked,storedVisible!==false);
   assert.match(html,/부원에게 공개/);assert.match(html,/체크를 해제하면 부원 라운지와 행사 신청 링크에서 숨겨지며/);
   assert.equal(dialog.querySelector('[name=confirmCancellation]').disabled,true);
   assert.equal(dialog.querySelector('[type=submit]').textContent,'행사 저장');
   if(existing){
    assert.match(html,/name="title"[^>]*value="가을 교육"/);
    assert.equal(dialog.querySelector('[data-existing-applications]').hidden,true);
   }
   const dates={startsAt:'2026-11-10T18:00',endsAt:'2026-11-10T20:00',opensAt:'2026-11-01T09:00',closesAt:'2026-11-09T18:00',cancelUntil:'2026-11-09T18:00'};
   const values={title:'  새 칵테일 교육  ',type:'class',semester:'2026-2',description:'잔을 준비해 주세요.',location:'교육실',owner:'교육부',...dates,capacity:'24',fee:'5000',status:'open',...(submitVisible?{memberVisible:'on'}:{}),waitlist:'on',questions:'준비물 확인\n\n기타 요청',policy:'취소 마감 전 환불 가능',accountNumber:'000-000',bankName:'테스트은행',accountHolder:'테스트동아리'};
   const form=dialog.querySelector('form');form.entries=Object.entries(values);
   await form.listeners.get('submit')({preventDefault(){}});
   assert.deepEqual(saved,[{...(existing?{id:current.id,revision:4}:{revision:0}),...values,title:'새 칵테일 교육',...Object.fromEntries(Object.entries(dates).map(([key,value])=>[key,new Date(value).toISOString()])),capacity:24,fee:5000,memberVisible:submitVisible,waitlist:true,questions:['준비물 확인','기타 요청']}]);
   assert.equal(rendered,1);
   assert.equal(dialog.open,false);
   if(!submitVisible){await new Promise(resolve=>setTimeout(resolve,0));assert.equal(dialogs.length,1,'Private event saves must not open a share dialog even if an older response contains a link');}
  }));
 }
});

test('private events remain in admin cards and details with a clear label and editable settings, without invite controls',async()=>{
 for(const memberVisible of [undefined,true,false]){
  const current=event(memberVisible===undefined?{}:{memberVisible}),{ctx}=context({rows:{events:[current]}});
  const list=main(await at('/admin/events',()=>renderAdmin(ctx)));
  assert.match(list,memberVisible===false?/event-term[^>]*>[^<]*운영진 전용/:/event-term[^>]*>[^<]*부원 공개/);
  assert.ok(hrefs(list).includes('/admin/events/event-a'));
  const detail=main(await at('/admin/events/event-a',()=>renderAdmin(ctx)));
  assert.match(detail,/data-action="event-edit"/);
  assert.match(detail,memberVisible===false?/<span class="badge">운영진 전용<\/span>/:/<span class="badge">부원 공개<\/span>/);
  if(memberVisible===false){assert.doesNotMatch(detail,/data-action="event-link"|신청 링크를 복사해서/);assert.match(detail,/공개 설정을 변경해 주세요/);}
  else assert.match(detail,/data-action="event-link"/);
 }
});

test('private event link actions do not open the share workflow or request a new link',async()=>{
 const {ctx,calls}=context(),messages=[];ctx.state.data.events={'event-a':event({memberVisible:false})};ctx.toast=message=>messages.push(message);
 await at('/admin/events/event-a',()=>withDialogs(async dialogs=>{
  await adminAction(ctx,'event-link','event-a');assert.equal(dialogs.length,0);
 }));
 assert.deepEqual(calls,[]);assert.match(messages[0],/운영진 전용 행사/);
});

test('finance permission still opens event participants and existing event payment controls',async()=>{
 const {ctx,calls}=context({operator:profile({role:'finance',permissions:['finance']}),rows:{events:[event()],applications:[application]}});
 const html=await at('/admin/events/event-a',()=>renderAdmin(ctx)),body=main(html);
 assert.match(body,/<th scope="col">납부<\/th>/);
 assert.match(body,/data-action="event-staff-pricing"/);
 assert.match(body,/data-staff-id="application-a"/);
 assert.match(body,/납부 완료/);
 assert.doesNotMatch(body,/data-action="event-edit"|data-attendance-id=/);
 assert.deepEqual(calls.filter(call=>call.op==='read').map(call=>call.data.kind),['settings','events','applications']);
 noRetiredLinks(html);
});

test('event operators retain attendance access without gaining finance controls',async()=>{
 const {ctx}=context({operator:profile({role:'education',permissions:['events']}),rows:{events:[event()],applications:[application]}});
 const html=await at('/admin/events/event-a',()=>renderAdmin(ctx)),body=main(html);
 assert.match(body,/data-attendance-id="application-a"/);
 assert.doesNotMatch(body,/<th scope="col">납부<\/th>|data-action="event-staff-pricing"|data-staff-id=/);
 noRetiredLinks(html);
});

test('role summaries present retained event finance access and omit retired workflows from old role data',async()=>{
 const {ctx}=context({roles:[{id:'custom',name:'운영팀',permissions:[...permissions],assigned:2}]});
 const html=await at('/admin/roles',()=>renderAdmin(ctx)),body=main(html);
 assert.match(body,/운영팀/);
 assert.match(body,/행사 참가비 관리/);
 assert.match(body,/행사·참가자·출석 관리/);
 assert.doesNotMatch(body,/회비·정산|회의록|결정·할 일|공지·활동 게시|활동 기록 게시/);
 noRetiredLinks(html);
});

test('role editor still offers event finance permission while hiding retired workflow permissions',async()=>{
 const {ctx,calls}=context({roles:[{id:'custom',name:'재무 담당',permissions:['finance','meetings','decisions','content'],assigned:1}]});
 await at('/admin/roles',()=>withDialogs(async dialogs=>{
  await adminAction(ctx,'role-edit','custom');
  assert.equal(dialogs.length,1);
  const html=dialogs[0].innerHTML;
  assert.match(html,/name="permission-finance"[^>]*checked/);
  assert.match(html,/행사 참가비 관리/);
  assert.doesNotMatch(html,/name="permission-(?:meetings|decisions|content)"|회비·정산|회의록|결정·할 일|공지·활동 게시/);
 }));
 assert.deepEqual(calls,[{op:'listRoles',data:undefined}]);
});

test('saving an existing role updates active permission selections while preserving hidden historical permissions',async()=>{
 const legacy=['meetings','decisions','content'];
 const {ctx}=context({roles:[{id:'custom',name:'재무 담당',revision:3,permissions:['finance','inventory',...legacy],assigned:1}]});
 const saved=[],api=ctx.api;
 ctx.api=async(op,data)=>{if(op==='saveRole'){saved.push(data);return data;}return api(op,data);};
 let rendered=0;
 ctx.render=async()=>{rendered++;};ctx.toast=()=>{};
 await at('/admin/roles',()=>withDialogs(async dialogs=>{
  await adminAction(ctx,'role-edit','custom');
  const dialog=dialogs[0],form=dialog.querySelector('form');
  form.entries=[['name','행사 재무'],['permission-finance','on']];
  await form.listeners.get('submit')({preventDefault(){}});
  assert.deepEqual(saved,[{id:'custom',revision:3,name:'행사 재무',permissions:['finance',...legacy]}]);
  assert.equal(rendered,1);
  assert.equal(dialog.open,false);
 }));
});

test('retired editor actions cannot reopen removed workflows or make API calls',async()=>{
 const {ctx,calls}=context();
 await at('/admin',()=>withDialogs(async dialogs=>{
  for(const action of ['finance-add','budget-edit','budget-execute','meeting-edit','meeting-view','decision-edit','decision-view','decision-progress','decision-category-add','content-edit']){
   assert.equal(await adminAction(ctx,action,'old-record'),undefined,action);
  }
  assert.deepEqual(dialogs,[]);
 }));
 assert.deepEqual(calls,[]);
});

test('participant payment and refund records stay linked to their application without loading a dues roster',async()=>{
 for(const [action,kind,amount] of [['application-payment','income',3000],['application-refund','refund',1500]]){
  const {ctx,calls}=context();
  ctx.state.data.applications={'application-a':{...application,eventId:'event-a',eventTitle:'가을 교육',semester:'2026-2',paidAmount:2000,refundAmount:500}};
  const saved=[];
  ctx.api=async(op,data)=>{calls.push({op,data});assert.equal(op,'finance');saved.push(data);return {saved:true};};
  ctx.render=async()=>{};ctx.toast=()=>{};
  await at('/admin/events/event-a',()=>withDialogs(async dialogs=>{
   await adminAction(ctx,action,'application-a');
   assert.deepEqual(calls,[]);
   const dialog=dialogs[0],html=dialog.innerHTML;
   assert.match(html,new RegExp('name="amount"[^>]*max="'+amount+'"'));
   assert.doesNotMatch(html,/name="memberId"|학기 회비|기타 수입|지출/);
   const form=dialog.querySelector('form');
   form.entries=[['amount',String(amount)],['title','참가비 기록'],['note','확인 완료'],['confirmed','on']];
   await form.listeners.get('submit')({preventDefault(){}});
   assert.equal(saved.length,1);
   const {requestId,...payload}=saved[0];
   assert.ok(requestId);
   assert.deepEqual(payload,{kind,amount,title:'참가비 기록',eventId:'event-a',applicationId:'application-a',semester:'2026-2',note:'확인 완료'});
  }));
 }
});

test('budget access is an explicit grant and is absent from every built-in default role',()=>{
 assert.equal(permissionLabels.budget,'예산 업무');
 for(const role of defaultRoles){
  assert.ok(!role.permissions.includes('budget'),role.id+' must opt in to budget work');
  assert.equal(hasPermission({role:role.id},'budget'),false,role.id);
 }
 assert.equal(hasPermission(profile({permissions:['finance']}),'budget'),false);
 assert.equal(hasPermission(profile({permissions:['admins']}),'budget'),false);
 assert.equal(hasPermission(profile({permissions:['budget']}),'budget'),true);
 assert.equal(hasPermission(profile({permissions:['budget']}),'finance'),false);
 assert.equal(hasPermission(profile({permissions:['budget']}),'eventRead'),false);
});

test('the budget menu is in operational support only for explicitly granted roles',async()=>{
 for(const granted of [true,false]){
  const {ctx,calls}=context({operator:profile({role:'custom',permissions:granted?['budget']:['finance']})});
  const html=await at('/admin',()=>renderAdmin(ctx)),desktop=nav(html,'운영 메뉴');
  const support=desktop.match(/<section class="nav-group"><h2>운영 지원<\/h2>([\s\S]*?)<\/section>/)?.[1]||'';
  assert.equal(hrefs(support).includes('/admin/budget'),granted);
  assert.equal(hrefs(html).includes('/admin/budget'),granted);
  assert.ok(!calls.some(({op,data})=>op.toLowerCase().includes('budget')||data?.kind?.toLowerCase().includes('budget')),'The dashboard must not load independent budget data');
  await at('/admin',()=>withDialogs(async dialogs=>{
   await adminAction(ctx,'mobile-menu');
   assert.equal(hrefs(dialogs[0].innerHTML).includes('/admin/budget'),granted);
  }));
 }
});

test('direct budget URLs deny access before data reads without a current budget grant',async()=>{
 for(const role of ['owner','chair','finance','custom']){
  const operator=profile({role,permissions:role==='finance'?['finance']:role==='custom'?[]:[...permissions]});
  const {ctx,calls}=context({operator});
  const html=await at('/admin/budget',()=>renderAdmin(ctx));
  assert.match(html,/접근 권한이 없습니다/);
  assert.deepEqual(calls,[{op:'profile',data:undefined}],role);
 }
 // The fresh profile response must override a stale grant held by the page.
 const {ctx,calls}=context({operator:profile({permissions:['finance']})});
 ctx.state.profile=profile({permissions:['finance','budget']});
 const html=await at('/admin/budget',()=>renderAdmin(ctx));
 assert.match(html,/접근 권한이 없습니다/);
 assert.deepEqual(calls,[{op:'profile',data:undefined}]);
});

test('authorized budget pages load their independent board without reading settings, events, participants, or finance',async()=>{
 const {ctx,calls}=context({operator:profile({role:'planner',permissions:['budget']})}),api=ctx.api;
 ctx.api=async(op,data)=>{
  if(op==='budgetPlanner'){
   calls.push({op,data});
   return {revision:2,funds:100000,plans:[{id:'plan-a',name:'독립 행사 예산',allocated:80000,items:[{id:'food',title:'식비',amount:50000}]}]};
  }
  return api(op,data);
 };
 const html=await at('/admin/budget',()=>renderAdmin(ctx)),body=main(html);
 assert.deepEqual(calls,[{op:'profile',data:undefined},{op:'budgetPlanner',data:{}}]);
 assert.match(body,/독립 행사 예산/);
 assert.match(body,/식비/);
 assert.match(body,/지출 후 남을 금액/);
 assert.match(nav(html,'운영 메뉴'),/<a href="\/admin\/budget"[^>]*aria-current="page"/);
 assert.equal(hrefs(body).some(href=>/^\/admin\/(?:events|finance|members|settings)/.test(href)),false);
});

test('role editors expose and persist a separate budget checkbox without adding finance or event grants',async()=>{
 for(const existing of [false,true]){
  const role={id:'planner',name:'예산 담당',revision:4,permissions:['inventory'],assigned:2};
  const {ctx}=context({roles:[role]});
  const saved=[],api=ctx.api;
  ctx.api=async(op,data)=>{if(op==='saveRole'){saved.push(data);return data;}return api(op,data);};
  ctx.render=async()=>{};ctx.toast=()=>{};
  await at('/admin/roles',()=>withDialogs(async dialogs=>{
   await adminAction(ctx,'role-edit',existing?role.id:undefined);
   const dialog=dialogs[0],html=dialog.innerHTML,form=dialog.querySelector('form');
   assert.match(html,/name="permission-budget"/);
   assert.match(html,/예산 업무/);
   assert.doesNotMatch(html,/name="permission-budget"[^>]*checked/);
   form.entries=[['name','예산 담당'],['permission-budget','on']];
   await form.listeners.get('submit')({preventDefault(){}});
   assert.deepEqual(saved,[{...(existing?{id:role.id,revision:4}:{revision:0}),name:'예산 담당',permissions:['budget']}]);
   assert.equal(dialog.open,false);
  }));
 }
});

test('unchecking budget on an ordinary role removes only that grant and preserves historical permissions',async()=>{
 const {ctx}=context({roles:[{id:'planner',name:'운영팀',revision:7,permissions:['finance','budget','meetings','decisions','content'],assigned:2}]});
 const saved=[],api=ctx.api;
 ctx.api=async(op,data)=>{if(op==='saveRole'){saved.push(data);return data;}return api(op,data);};
 ctx.render=async()=>{};ctx.toast=()=>{};
 await at('/admin/roles',()=>withDialogs(async dialogs=>{
  await adminAction(ctx,'role-edit','planner');
  const dialog=dialogs[0],form=dialog.querySelector('form');
  assert.match(dialog.innerHTML,/name="permission-budget"[^>]*checked/);
  form.entries=[['name','운영팀'],['permission-finance','on']];
  await form.listeners.get('submit')({preventDefault(){}});
  assert.deepEqual(saved,[{id:'planner',revision:7,name:'운영팀',permissions:['finance','meetings','decisions','content']}]);
 }));
});

test('protected leadership roles expose only a budget opt-in and save it through the restricted endpoint',async()=>{
 for(const id of ['owner','chair'])for(const enabled of [false,true]){
  const role={id,name:id==='owner'?'회장':'부회장',revision:3,permissions:[...permissions,...(enabled?[]:['budget'])],assigned:1};
  const {ctx}=context({roles:[role]});
  const saved=[],api=ctx.api;
  ctx.api=async(op,data)=>{if(op==='setRoleBudget'){saved.push(data);return data;}return api(op,data);};
  ctx.render=async()=>{};ctx.toast=()=>{};
  const page=await at('/admin/roles',()=>renderAdmin(ctx));
  assert.match(main(page),new RegExp('data-action="role-edit"[^>]*data-id="'+id+'"'));
  await at('/admin/roles',()=>withDialogs(async dialogs=>{
   await adminAction(ctx,'role-edit',id);
   const dialog=dialogs[0],form=dialog.querySelector('form');
   assert.match(dialog.innerHTML,/예산 업무 설정/);
   assert.match(dialog.innerHTML,/name="permission-budget"/);
   assert.doesNotMatch(dialog.innerHTML,/name="(?:name|permission-(?:admins|finance|events|members|inventory|settings|audit))"/);
   form.entries=enabled?[['permission-budget','on']]:[];
   await form.listeners.get('submit')({preventDefault(){}});
   assert.deepEqual(saved,[{id,revision:3,enabled}]);
   assert.equal(dialog.open,false);
  }));
 }
});
