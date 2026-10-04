import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const cssHook=registerHooks({load(url,context,nextLoad){
 if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
 return nextLoad(url,context);
}});
let renderBudgetPlanner,budgetPlannerAction;
try{({renderBudgetPlanner,budgetPlannerAction}=await import('../web/src/budget-planner.js'));}
finally{cssHook.deregister();}

const board=(extra={})=>({revision:3,funds:100000,plans:[{id:'party',name:'친목 모임',allocated:60000,items:[{id:'rental',title:'장소 대여',amount:20000},{id:'food',title:'음식',amount:10000}]}],...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function context(value=board()){
 const calls=[],toasts=[],ctx={state:{user:{uid:'planner'},profile:{uid:'planner',permissions:['budget']}},api:async(op,data)=>{calls.push({op,data});return op==='saveBudgetPlanner'?{...data,revision:data.revision+1}:value;},render:async()=>{ctx.renders++;ctx.state.profile={...ctx.state.profile};},toast:message=>toasts.push(message),renders:0};
 return {ctx,calls,toasts};
}
beforeEach(()=>{globalThis.location={pathname:'/admin/budget',search:''};});

// A small host for the actual shared modal submit/close listeners. It verifies
// form state and async behavior; native browser focus and layout are not modeled.
async function withDialogs(run){
 const previous=new Map(['document','CSS','FormData'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),NativeFormData=globalThis.FormData,dialogs=[];
 class Element{
  constructor(tag='div'){this.tag=tag;this.innerHTML='';this.textContent='';this.style={};this.attrs=new Map();this.listeners=new Map();this.parts=new Map();this.dataset={};this.isConnected=true;this.entries=[];const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  setAttribute(name,value){this.attrs.set(name,String(value));}getAttribute(name){return this.attrs.get(name)||null;}removeAttribute(name){this.attrs.delete(name);}
  addEventListener(name,handler){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(handler);}
  fire(name,event={}){return Promise.all((this.listeners.get(name)||[]).map(handler=>handler({preventDefault(){},...event})));}
  focus(){document.activeElement=this;}matches(){return this.tag==='button';}closest(){return null;}getClientRects(){return [1];}getBoundingClientRect(){return {width:100};}scrollIntoView(){}
  after(node){this.parent.notice=node;node.parent=this.parent;}remove(){this.isConnected=false;if(this.parent?.notice===this)this.parent.notice=null;}
  showModal(){this.open=true;}close(){if(!this.open)return;this.open=false;this.fire('close');}
  querySelector(selector){
   if(selector==='form[aria-busy=true]'){const form=this.querySelector('form');return form.getAttribute('aria-busy')==='true'?form:null;}
   if(selector==='#discard-changes')return this.notice||null;
   if(!this.parts.has(selector)){
    const part=new Element(selector==='form'?'form':selector.includes('button')||selector==='[type=submit]'?'button':'div');part.parent=this;
    if(selector==='form')part.innerHTML=this.innerHTML;
    if(selector==='[data-budget-items]')part.innerHTML=this.innerHTML.match(/<div data-budget-items>([\s\S]*?)<\/div><p class="budget-expense-count"/)?.[1]||'';
    const name=selector.match(/^\[name=([^\]]+)\]$/)?.[1];
    if(name)part.value=[...this.innerHTML.matchAll(/<input\b([^>]*)>/g)].find(match=>match[1].includes('name="'+name+'"'))?.[1].match(/value="([^"]*)"/)?.[1]||'';
    this.parts.set(selector,part);
   }
   return this.parts.get(selector);
  }
  querySelectorAll(selector){
   if(selector==='[data-close]')return [this.querySelector('button.header-close'),this.querySelector('button.footer-close')];
   if(selector==='[data-budget-item]')return [...this.innerHTML.matchAll(/<div class="budget-expense-row" data-budget-item="([^"]+)">([\s\S]*?)<\/div>/g)].map(match=>{const row=new Element();row.dataset.budgetItem=match[1];row.innerHTML=match[2];row.parent=this;return row;});
   if(selector==='input[type=number]')return [...this.innerHTML.matchAll(/<input\b([^>]*type="number"[^>]*)>/g)].map(match=>{const input=new Element('input');input.value=match[1].match(/value="([^"]*)"/)?.[1]||'';return input;});
   return [];
  }
 }
 const document={activeElement:null,body:new Element('body'),documentElement:new Element('html'),querySelector(selector){
  if(selector==='#modal')return dialogs.findLast(dialog=>dialog.isConnected)||null;
  if(['#modal[open]','dialog[open]','dialog.budgetplanner-dialog[open]'].includes(selector))return dialogs.findLast(dialog=>dialog.isConnected&&dialog.open)||null;
  return null;
 },querySelectorAll:()=>[],createElement:tag=>new Element(tag)};
 document.body.append=dialog=>dialogs.push(dialog);document.activeElement=document.body;
 class DialogFormData extends NativeFormData{constructor(form){super();for(const [key,value] of form?.entries||[])this.append(key,value);}}
 for(const [key,value] of Object.entries({document,CSS:{supports:()=>true},FormData:DialogFormData}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 try{return await run({dialogs});}
 finally{await Promise.resolve();for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

test('budget page shows independent funds, allocations, spending, and all plan items without linked records',async()=>{
 const {ctx,calls}=context(),html=await renderBudgetPlanner(ctx);
 assert.deepEqual(calls,[{op:'budgetPlanner',data:{}}]);
 for(const expected of ['보유 금액','100,000원','편성한 예산','60,000원','미편성 금액','40,000원','예상 지출','30,000원','지출 후 남을 금액','70,000원','친목 모임','장소 대여','음식'])assert.ok(html.includes(expected),expected);
 assert.doesNotMatch(html,/10,000원<small>남음|<select|<details|class="tabs"|\/admin\/(?:events|finance)|학기|회비|정산/);
});

test('over-budget plans and total deficits stay visible as shortfalls without zero-clamping',async()=>{
 const {ctx}=context(board({funds:10000,plans:[{id:'a',name:'모임',allocated:20000,items:[{id:'b',title:'준비물',amount:35000}]}]}));
 const html=await renderBudgetPlanner(ctx);
 assert.match(html,/편성 초과 금액/);assert.match(html,/10,000원<small>초과/);assert.match(html,/25,000원<small>부족/);assert.match(html,/15,000원<small>초과/);
});

test('empty budgets offer a first plan and user supplied labels are escaped',async()=>{
 const empty=context(board({funds:0,plans:[]}));assert.match(await renderBudgetPlanner(empty.ctx),/첫 행사 예산을 편성해 보세요/);
 const {ctx}=context(board({plans:[{id:'safe',name:'<img src=x onerror=alert(1)>',allocated:0,items:[{id:'item',title:'<script>bad()</script>',amount:0}]}]}));
 const html=await renderBudgetPlanner(ctx);assert.doesNotMatch(html,/<script|<img/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);
});

test('ungranted profiles neither fetch nor act on cached budgets',async()=>{
 const {ctx,calls}=context();ctx.state.profile.permissions=['finance'];ctx.state.budgetPlannerView={board:board()};
 assert.match(await renderBudgetPlanner(ctx),/예산 업무 권한이 필요합니다/);assert.equal(ctx.state.budgetPlannerView,undefined);
 for(const action of ['refresh','funds','add','edit','delete'])await budgetPlannerAction(ctx,'budgetplanner-'+action,'party');
 assert.deepEqual(calls,[]);assert.equal(ctx.renders,0);
});

test('late reads are discarded after route, user, or profile changes',async()=>{
 for(const change of [ctx=>{location.pathname='/admin/events';},ctx=>{ctx.state.user={uid:'another'};},ctx=>{ctx.state.profile={uid:'planner',permissions:[]};}]){
  location.pathname='/admin/budget';const {ctx}=context(),pending=deferred();ctx.api=()=>pending.promise;
  const rendering=renderBudgetPlanner(ctx);change(ctx);pending.resolve(board());assert.equal(await rendering,'');assert.equal(ctx.state.budgetPlannerView.board,null);
 }
});

test('a superseded budget read cannot replace a newer render',async()=>{
 const {ctx}=context(),old=deferred();let count=0;ctx.api=()=>++count===1?old.promise:Promise.resolve(board({funds:200000}));
 const first=renderBudgetPlanner(ctx);const html=await renderBudgetPlanner(ctx);old.resolve(board());assert.equal(await first,'');assert.match(html,/200,000원/);assert.equal(ctx.state.budgetPlannerView.board.funds,200000);
});

test('fund edits save only the current board and preserve the toast after profile refresh',async()=>withDialogs(async()=>{
 const {ctx,calls,toasts}=context();await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-funds');
 assert.ok(dialog.classList.contains('budgetplanner-dialog'));const form=dialog.querySelector('form');form.entries=[['funds','250000']];await form.fire('submit');
 assert.deepEqual(calls[1],{op:'saveBudgetPlanner',data:{revision:3,funds:250000,plans:board().plans}});assert.equal(ctx.renders,1);assert.deepEqual(toasts,['보유 금액을 저장했습니다.']);assert.equal(dialog.open,false);
}));

test('add and edit dialogs serialize planned expense rows and preserve other plans and funds',async()=>withDialogs(async()=>{
 const {ctx,calls}=context();await renderBudgetPlanner(ctx);
 const adding=await budgetPlannerAction(ctx,'budgetplanner-add');assert.ok(adding.open);assert.ok(adding.classList.contains('budgetplanner-dialog'));
 const addForm=adding.querySelector('form'),newItemId=addForm.querySelectorAll('[data-budget-item]')[0].dataset.budgetItem;
 addForm.entries=[['name','새 행사'],['allocated','45000'],['item-title-'+newItemId,'행사 준비물'],['item-amount-'+newItemId,'17000']];await addForm.fire('submit');
 const addition=calls.find(call=>call.op==='saveBudgetPlanner').data;
 assert.equal(addition.funds,100000);assert.equal(addition.revision,3);assert.deepEqual(addition.plans[0],board().plans[0]);
 assert.equal(addition.plans.length,2);assert.match(addition.plans[1].id,/^[0-9a-f-]{36}$/);
 assert.deepEqual(addition.plans[1],{id:addition.plans[1].id,name:'새 행사',allocated:45000,items:[{id:newItemId,title:'행사 준비물',amount:17000}]});assert.equal(adding.open,false);

 const savedBoard={...addition,revision:4};ctx.api=async(op,data)=>{calls.push({op,data});return op==='saveBudgetPlanner'?{...data,revision:5}:savedBoard;};await renderBudgetPlanner(ctx);
 const editing=await budgetPlannerAction(ctx,'budgetplanner-edit','party');assert.ok(editing.open);assert.ok(editing.classList.contains('budgetplanner-dialog'));
 const editForm=editing.querySelector('form');assert.deepEqual(editForm.querySelectorAll('[data-budget-item]').map(row=>row.dataset.budgetItem),['rental','food']);
 editForm.entries=[['name','수정한 모임'],['allocated','50000'],['item-title-rental','공간 대여'],['item-amount-rental','30000'],['item-title-food','간식'],['item-amount-food','8000']];await editForm.fire('submit');
 const edited=calls.findLast(call=>call.op==='saveBudgetPlanner').data;
 assert.equal(edited.revision,4);assert.equal(edited.funds,100000);assert.equal(edited.plans.length,2);assert.deepEqual(edited.plans[1],addition.plans[1]);
 assert.deepEqual(edited.plans[0],{id:'party',name:'수정한 모임',allocated:50000,items:[{id:'rental',title:'공간 대여',amount:30000},{id:'food',title:'간식',amount:8000}]});assert.equal(editing.open,false);
}));

test('deleting one plan retains available funds and all unrelated planned expenses',async()=>withDialogs(async()=>{
 const other={id:'other',name:'다른 행사',allocated:9000,items:[{id:'other-item',title:'소모품',amount:7000}]},value=board({plans:[board().plans[0],other]});
 const {ctx,calls,toasts}=context(value);await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-delete','party');
 assert.ok(dialog.open);assert.ok(dialog.classList.contains('budgetplanner-dialog'));assert.match(dialog.innerHTML,/친목 모임/);
 await dialog.querySelector('form').fire('submit');
 assert.deepEqual(calls[1],{op:'saveBudgetPlanner',data:{revision:3,funds:100000,plans:[other]}});assert.equal(dialog.open,false);assert.deepEqual(toasts,['행사 예산을 삭제했습니다.']);
}));

test('invalid amounts and revision conflicts retain the entered form without automatic retry',async()=>withDialogs(async()=>{
 const {ctx,calls}=context();await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-funds'),form=dialog.querySelector('form');
 form.entries=[['funds','1.5']];await form.fire('submit');assert.equal(calls.length,1);assert.match(form.querySelector('.form-error,[role=alert]').textContent,/정수/);assert.equal(dialog.open,true);
 form.entries=[['funds','250000']];ctx.api=async(op,data)=>{calls.push({op,data});throw Object.assign(new Error('conflict'),{code:'functions/aborted'});};await form.fire('submit');
 assert.equal(calls.length,2);assert.equal(dialog.open,true);assert.deepEqual(form.entries,[['funds','250000']]);assert.match(form.querySelector('.form-error,[role=alert]').textContent,/입력 내용은 유지.*새로고침/);assert.equal(ctx.renders,0);
}));

test('saving an already open dialog is blocked after grant removal',async()=>withDialogs(async()=>{
 const {ctx,calls}=context();await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-funds'),form=dialog.querySelector('form');
 form.entries=[['funds','250000']];ctx.state.profile.permissions=[];await form.fire('submit');assert.equal(calls.length,1);assert.match(form.querySelector('.form-error,[role=alert]').textContent,/권한/);
}));

test('late save responses do not render or toast into another signed-in account',async()=>withDialogs(async()=>{
 const {ctx,toasts}=context();await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-funds'),form=dialog.querySelector('form'),pending=deferred();
 ctx.api=()=>pending.promise;form.entries=[['funds','250000']];const saving=form.fire('submit');ctx.state.user={uid:'different'};pending.resolve(board({funds:250000,revision:4}));await saving;
 assert.equal(ctx.renders,0);assert.deepEqual(toasts,[]);
}));

test('server access revocation clears budget state, closes the form, and reloads current permissions',async()=>withDialogs(async()=>{
 const {ctx,toasts}=context();await renderBudgetPlanner(ctx);const dialog=await budgetPlannerAction(ctx,'budgetplanner-funds'),form=dialog.querySelector('form');
 ctx.api=async()=>{throw Object.assign(new Error('Access revoked'),{code:'functions/permission-denied'});};form.entries=[['funds','250000']];await form.fire('submit');
 assert.equal(ctx.state.budgetPlannerView,undefined);assert.equal(dialog.open,false);assert.equal(ctx.renders,1);assert.deepEqual(toasts,[]);
}));
