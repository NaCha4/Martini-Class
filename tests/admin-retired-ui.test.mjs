import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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
 const element=()=>({innerHTML:'',style:{},listeners:new Map(),setAttribute(){},removeAttribute(){},addEventListener(name,handler){this.listeners.set(name,handler);},focus(){}});
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
   dialog.querySelector=selector=>parts.get(selector)||null;
   dialog.querySelectorAll=()=>[];
   dialog.showModal=()=>{dialog.open=true;};
   dialog.close=()=>{dialog.open=false;};
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
 assert.deepEqual(hrefs(desktop),['/admin','/admin/events','/admin/members','/admin/requests','/admin/on-the-rock','/admin/inventory','/admin/settings','/admin/roles','/admin/admins','/admin/privacy','/admin/audit']);
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
