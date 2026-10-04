import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real board and handlers while keeping Firebase initialization,
// credentials and live browser interaction outside this unit-test process.
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
let renderInventory,inventoryCategories,itemCategory,inventoryAction,bindInventoryBoard,moveInventoryItem;
try{({renderInventory,inventoryCategories,itemCategory,inventoryAction,bindInventoryBoard,moveInventoryItem}=await import('../web/src/inventory.js'));}
finally{hook.deregister();}

const item=(id,name,extra={})=>({id,name,revision:3,categoryId:'',photo:'',unit:'each',quantity:0,minimum:0,bottles:{},...extra});
const category=(id,name,extra={})=>({id,name,revision:1,...extra});
function context({pages=[[]],categories=[]}={}){
 const calls=[],notifications=[];
 let renders=0;
 const ctx={state:{data:{},profile:{uid:'inventory-admin',role:'education',permissions:['inventory']},settings:{semester:'2026-2'}},
  api:async(op,data)=>{
   calls.push({op,data});
   if(op==='listInventoryCategories')return {rows:categories};
   if(op==='read'){
    assert.equal(data.kind,'inventory','The board should only read inventory');
    const page=data.cursor?Number(data.cursor):0;
    return {rows:pages[page],nextCursor:page+1<pages.length?String(page+1):null};
   }
   throw Error('Unexpected API operation: '+op);
  },
  toast:message=>notifications.push(message),
  render:async()=>{renders++;},
 };
 return {ctx,calls,notifications,renders:()=>renders};
}
async function globals(values,run){
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,value});
 try{return await run();}
 finally{for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

async function withDialogs(run){
 const dialogs=[];
 const element=()=>({innerHTML:'',style:{},listeners:new Map(),setAttribute(){},removeAttribute(){},addEventListener(name,handler){this.listeners.set(name,handler);},focus(){},scrollIntoView(){}});
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
   dialog.formError=error;
   return dialog;
  },
 };
 class DialogFormData{
  constructor(form){this.entries=form.entries;}
  *[Symbol.iterator](){yield* this.entries;}
  get(key){return this.entries.find(([name])=>name===key)?.[1]??null;}
  has(key){return this.entries.some(([name])=>name===key);}
 }
 return globals({document,CSS:{supports:()=>true},FormData:DialogFormData,location:{pathname:'/admin/inventory',search:''}},async()=>{
  const result=await run(dialogs);
  await Promise.resolve();
  return result;
 });
}

test('user categories are optional and legacy category groups appear only when used',()=>{
 assert.deepEqual(inventoryCategories([],[]).map(({id,name})=>({id,name})),[{id:'',name:'미분류'}]);
 const rows=[item('legacy','기존 진',{category:'spirit',categoryId:undefined}),item('unassigned','새 레몬')];
 const groups=inventoryCategories(rows,[category('seasonal','가을 파티')]);
 assert.deepEqual(groups.map(({id})=>id),['','legacy-spirit','seasonal']);
 assert.equal(groups.find(group=>group.id==='legacy-spirit').name,'주류');
 assert.equal(itemCategory(rows[0]),'legacy-spirit');
 assert.equal(itemCategory(item('moved','옮긴 진',{category:'spirit',categoryId:''})), '');
});

test('inventory board loads every page and keeps empty user categories available',async()=>{
 const first=Array.from({length:100},(_,i)=>item('item-'+i,'품목 '+i));
 const {ctx,calls}=context({pages:[first,[item('last-item','마지막 품목',{categoryId:'party'})]],categories:[category('party','파티 준비'),category('empty-group','새 선반')]});
 const html=await renderInventory(ctx);
 assert.match(html,/마지막 품목/);
 assert.match(html,/파티 준비/);
 assert.match(html,/새 선반/);
 assert.match(html,/data-inventory-board/);
 assert.deepEqual(calls.filter(call=>call.op==='read').map(call=>call.data.cursor||null),[null,'1']);
 assert.equal(Object.keys(ctx.state.data.inventory).length,101);
 assert.doesNotMatch(html,/<table\b|<th\b/);
});

test('inventory board escapes names and retains unassigned records without forcing fixed system categories',async()=>{
 const hostile='<img src=x onerror=alert(1)> & "진"';
 const {ctx}=context({pages:[[item('unassigned',hostile)]],categories:[category('party','<script>파티</script>')]});
 const html=await renderInventory(ctx);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;진&quot;/);
 assert.match(html,/&lt;script&gt;파티&lt;\/script&gt;/);
 assert.match(html,/미분류/);
 assert.doesNotMatch(html,/<img src=x|<script>파티|legacy-spirit|legacy-ingredient|legacy-supply|legacy-tool/);
});

test('blank board shows item and category creation without photos or onboarding copy',async()=>{
 const {ctx}=context();
 const html=await renderInventory(ctx);
 assert.match(html,/data-action="item-edit"/);
 assert.equal((html.match(/data-action="inventory-category-edit"/g)||[]).length,1);
 assert.match(html,/품목 없음/);
 assert.match(html,/미분류/);
 assert.doesNotMatch(html,/<img\b|사진|우리 동아리의 재고를 한눈에|먼저 품목을|드래그하세요|옮겨 보세요|한 병 용량|관리 단위|최소 보유량/);
});

test('existing photos never render and unknown categories retain their text cards and actions',async()=>{
 const photos=['javascript:alert(1)','https://images.example/private-photo.jpg','data:image/svg+xml;base64,PHN2Zz4='];
 const rows=photos.map((photo,i)=>item('unsafe-'+i,'안전 확인 '+i,{photo,categoryId:'missing-category'}));
 rows.push(item('safe','진',{photo:'data:image/jpeg;base64,/9j/2Q==',quantity:2,unit:'bottle',size:700,bottles:{open:60},location:'옛 보관장소'}));
 const {ctx}=context({pages:[rows]});
 const html=await renderInventory(ctx);
 assert.equal((html.match(/data-inventory-card=/g)||[]).length,4);
 assert.equal((html.match(/data-action="item-view"/g)||[]).length,4);
 assert.equal((html.match(/data-action="stock-record"/g)||[]).length,4);
 assert.equal((html.match(/data-action="record-delete" data-kind="inventory"/g)||[]).length,4);
 assert.match(html,/data-id="safe" aria-label="진 삭제">삭제<\/button>/);
 assert.equal((html.match(/data-action="inventory-move"/g)||[]).length,4);
 assert.equal((html.match(/data-inventory-category=/g)||[]).length,1);
 assert.match(html,/미분류/);
 assert.match(html,/2병 · 개봉 1병/);
 for(const row of rows)assert.ok(html.includes(row.name));
 assert.doesNotMatch(html,/<img\b|data:image|javascript:|images\.example|사진을 추가|옛 보관장소/);
 assert.equal(ctx.state.data.inventory.safe.photo,rows[3].photo,'Rendering must preserve stored records');
});

test('move sends only the item revision and target category, without changing stock locally',async()=>{
 const original=item('gin','진',{quantity:2,unit:'bottle',size:700,bottles:{open:60}});
 const state=context({pages:[[original]],categories:[category('party','파티')]});
 await renderInventory(state.ctx);
 const api=state.ctx.api;
 state.ctx.api=async(op,data)=>{
  if(op!=='moveInventoryItem')return api(op,data);
  state.calls.push({op,data});
  assert.equal(state.ctx.state.inventoryMoving,true);
  return {...original,categoryId:data.categoryId,revision:4};
 };
 await moveInventoryItem(state.ctx,'gin','party');
 assert.deepEqual(state.calls.filter(call=>call.op==='moveInventoryItem'),[{op:'moveInventoryItem',data:{id:'gin',revision:3,categoryId:'party'}}]);
 assert.deepEqual(state.ctx.state.data.inventory.gin,original);
 assert.equal(state.ctx.state.inventoryMoving,false);
 assert.equal(state.renders(),1);
 assert.equal(state.notifications.length,1);
});

test('failed and overlapping moves preserve the last confirmed state and release the moving guard',async()=>{
 const original=item('gin','진');
 const state=context({pages:[[original]],categories:[category('party','파티')]});
 await renderInventory(state.ctx);
 let rejectMove;
 state.ctx.api=async op=>{assert.equal(op,'moveInventoryItem');return new Promise((resolve,reject)=>{rejectMove=reject;});};
 const pending=moveInventoryItem(state.ctx,'gin','party');
 await assert.rejects(moveInventoryItem(state.ctx,'gin','another'),/이동하고 있습니다/);
 assert.equal(state.ctx.state.data.inventory.gin.categoryId,'');
 rejectMove(Error('다른 운영자가 변경했습니다.'));
 await assert.rejects(pending,/다른 운영자가 변경했습니다/);
 assert.deepEqual(state.ctx.state.data.inventory.gin,original);
 assert.equal(state.ctx.state.inventoryMoving,false);
 assert.equal(state.renders(),1,'Rejected revisions must refresh from the server');
 assert.deepEqual(state.notifications,[],'A failed move must not report success');
});

test('keyboard and touch move dialog offers user categories and performs the same revision guarded move',async()=>{
 const state=context({pages:[[item('gin','진')]],categories:[category('party','파티')]});
 await renderInventory(state.ctx);
 const api=state.ctx.api;
 state.ctx.api=async(op,data)=>{if(op==='moveInventoryItem'){state.calls.push({op,data});return {};}return api(op,data);};
 await withDialogs(async dialogs=>{
  await inventoryAction(state.ctx,'inventory-move','gin');
  const dialog=dialogs[0];
  assert.match(dialog.innerHTML,/name="categoryId"/);
  assert.match(dialog.innerHTML,/<option value="party"[^>]*>파티<\/option>/);
  const form=dialog.querySelector('form');form.entries=[['categoryId','party']];
  await form.listeners.get('submit')({preventDefault(){}});
  assert.equal(dialog.open,false);
 });
 assert.deepEqual(state.calls.filter(call=>call.op==='moveInventoryItem'),[{op:'moveInventoryItem',data:{id:'gin',revision:3,categoryId:'party'}}]);
});

test('category editing saves trimmed names and rejects deleting a category containing items',async()=>{
 const state=context({pages:[[item('gin','진',{categoryId:'party'})]],categories:[category('party','파티')]});
 await renderInventory(state.ctx);
 const api=state.ctx.api;
 state.ctx.api=async(op,data)=>{if(op==='saveInventoryCategory'){state.calls.push({op,data});return {};}return api(op,data);};
 await withDialogs(async dialogs=>{
  await inventoryAction(state.ctx,'inventory-category-edit','party');
  const dialog=dialogs[0],form=dialog.querySelector('form');
  assert.match(dialog.innerHTML,/name="name"/);
  assert.match(dialog.innerHTML,/data-action="inventory-category-delete"/);
  assert.doesNotMatch(dialog.innerHTML,/함께 두고 싶은|자유롭게 묶어/);
  form.entries=[['name','  가을 파티  ']];
  await form.listeners.get('submit')({preventDefault(){}});
  assert.equal(dialog.open,false);
  await assert.rejects(inventoryAction(state.ctx,'inventory-category-delete','party'),/다른 카테고리로 옮긴 뒤/);
  assert.equal(dialogs.length,1,'A nonempty category must not open a deletion confirmation');
 });
 assert.deepEqual(state.calls.filter(call=>call.op==='saveInventoryCategory'),[{op:'saveInventoryCategory',data:{id:'party',revision:1,name:'가을 파티'}}]);
});

// A minimal board DOM runs the actual delegated callbacks, including nested
// targets. It intentionally does not claim browser layout or touch simulation.
function boardDOM(){
 const node=(dataset={})=>{
  const classes=new Set();
  return {dataset,hidden:false,listeners:new Map(),attributes:new Map(),classList:{add:(...values)=>values.forEach(value=>classes.add(value)),remove:(...values)=>values.forEach(value=>classes.delete(value)),contains:value=>classes.has(value)},
   addEventListener(name,handler){this.listeners.set(name,handler);},setAttribute(name,value){this.attributes.set(name,value);},removeAttribute(name){this.attributes.delete(name);}};
 };
 const first=node({inventoryCard:'gin',inventoryName:'런던 드라이 진'}),second=node({inventoryCard:'lemon',inventoryName:'레몬'});
 const lanes=[node({inventoryCategory:''}),node({inventoryCategory:'party'})];
 for(const [index,lane] of lanes.entries()){
  lane.cards=index===0?[first,second]:[];
  lane.count={textContent:''};lane.empty={hidden:false,textContent:''};
  lane.querySelectorAll=selector=>{assert.equal(selector,'[data-inventory-card]');return lane.cards;};
  lane.querySelector=selector=>({'[data-inventory-count]':lane.count,'[data-inventory-empty]':lane.empty})[selector]||null;
  lane.closest=selector=>selector==='[data-inventory-category]'?lane:null;
  lane.contains=target=>target===lane||lane.cards.includes(target);
 }
 const handle=node({inventoryDrag:'gin'});
 handle.closest=selector=>({'[data-inventory-drag]':handle,'[data-inventory-card]':first})[selector]||null;
 const nestedHandle={closest:selector=>handle.closest(selector)};
 const nestedLane={closest:selector=>lanes[1].closest(selector)};
 const search=node();search.value='';
 const results={textContent:''},status={textContent:''};
 const board=node();
 board.querySelector=selector=>({'[data-inventory-search]':search,'[data-inventory-results]':results,'.inventory-save-status':status})[selector]||null;
 board.querySelectorAll=selector=>selector==='[data-inventory-card]'?[first,second]:selector==='[data-inventory-category]'?lanes:[...lanes,first,second].filter(el=>selector.split(',').some(value=>el.classList.contains(value.slice(1))));
 const root={querySelector:selector=>selector==='[data-inventory-board]'?board:null};
 const transfer={data:new Map(),setData(name,value){this.data.set(name,value);},setDragImage(){}};
 const event=target=>({target,dataTransfer:transfer,prevented:false,preventDefault(){this.prevented=true;}});
 return {root,board,search,results,status,first,second,lanes,nestedHandle,nestedLane,transfer,event};
}

test('board search filters item names while keeping category counters accurate',async()=>{
 const {ctx}=context();
 const dom=boardDOM();
 bindInventoryBoard(ctx,dom.root);
 dom.search.value='드라이 진';dom.search.listeners.get('input')();
 assert.equal(dom.first.hidden,false);assert.equal(dom.second.hidden,true);
 assert.equal(dom.lanes[0].count.textContent,'1 / 2');
 assert.equal(dom.lanes[1].empty.textContent,'검색 결과 없음');
 assert.equal(dom.results.textContent,'1개 품목 검색됨');
 assert.equal(ctx.state.inventorySearch,'드라이 진');
 dom.search.value='';dom.search.listeners.get('input')();
 assert.equal(dom.second.hidden,false);assert.equal(dom.lanes[0].count.textContent,'2');
 assert.equal(dom.lanes[1].empty.textContent,'품목 없음');
 assert.equal(dom.results.textContent,'');
});

test('delegated drag/drop accepts the dragged item, blocks external drops and clears busy state after failure',async()=>{
 const state=context({pages:[[item('gin','진'),item('lemon','레몬')]],categories:[category('party','파티')]});
 await renderInventory(state.ctx);
 const dom=boardDOM();
 bindInventoryBoard(state.ctx,dom.root);
 const originalHandlers=new Map(dom.board.listeners);
 bindInventoryBoard(state.ctx,dom.root);
 assert.deepEqual(dom.board.listeners,originalHandlers,'Binding a second time must not duplicate handlers');
 const drop=dom.event(dom.nestedLane);
 await dom.board.listeners.get('drop')(drop);
 assert.equal(drop.prevented,false,'External drops without a board drag are ignored');
 const start=dom.event(dom.nestedHandle);dom.board.listeners.get('dragstart')(start);
 assert.equal(dom.transfer.data.get('text/plain'),'gin');
 assert.equal(dom.first.classList.contains('inventory-dragging'),true);
 const over=dom.event(dom.nestedLane);dom.board.listeners.get('dragover')(over);
 assert.equal(over.prevented,true);assert.equal(dom.lanes[1].classList.contains('inventory-drop-target'),true);
 let rejectMove;
 state.ctx.api=async(op,data)=>{
  state.calls.push({op,data});
  assert.equal(op,'moveInventoryItem');
  return new Promise((resolve,reject)=>{rejectMove=reject;});
 };
 const pending=dom.board.listeners.get('drop')(drop);
 assert.equal(dom.board.inert,true);assert.equal(dom.board.attributes.get('aria-busy'),'true');
 assert.match(dom.status.textContent,/옮기고 있습니다/);
 assert.equal(dom.first.classList.contains('inventory-dragging'),false);
 assert.equal(dom.lanes[1].classList.contains('inventory-drop-target'),false);
 assert.deepEqual(dom.lanes[1].cards,[],'Unconfirmed drops must not move the card visually');
 rejectMove(Error('변경 버전을 다시 확인해 주세요.'));await pending;
 assert.deepEqual(state.calls.filter(call=>call.op==='moveInventoryItem'),[{op:'moveInventoryItem',data:{id:'gin',revision:3,categoryId:'party'}}]);
 assert.equal(dom.board.inert,false);assert.equal(dom.board.attributes.has('aria-busy'),false);assert.equal(dom.status.textContent,'');
 assert.deepEqual(state.notifications,['변경 버전을 다시 확인해 주세요.']);
 assert.equal(state.renders(),1);
 // The full card is also a drag source, not only its nested move control.
 dom.first.dataset.inventoryDrag='gin';
 dom.first.closest=selector=>['[data-inventory-drag]','[data-inventory-card]'].includes(selector)?dom.first:null;
 state.ctx.api=async(op,data)=>{state.calls.push({op,data});return {};};
 dom.board.listeners.get('dragstart')(dom.event(dom.first));
 await dom.board.listeners.get('drop')(dom.event(dom.nestedLane));
 assert.deepEqual(state.calls.at(-1),{op:'moveInventoryItem',data:{id:'gin',revision:3,categoryId:'party'}});
 assert.equal(state.notifications.at(-1),'카테고리를 옮겼습니다.');
 assert.equal(state.renders(),2);
});
