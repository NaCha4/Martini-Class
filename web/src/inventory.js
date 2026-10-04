import { esc, button, field, modal } from './ui.js';
import './inventory.css';

const legacyNames={spirit:'주류',ingredient:'재료',supply:'소모품',tool:'도구'};
export const itemCategory=item=>item.categoryId??(legacyNames[item.category]?'legacy-'+item.category:'');
export function inventoryCategories(rows,custom=[]){
 const used=new Set(rows.map(itemCategory));
 return [{id:'',name:'미분류'},...Object.entries(legacyNames).filter(([key])=>used.has('legacy-'+key)).map(([key,name])=>({id:'legacy-'+key,name,legacy:true})),...custom];
}
const quantity=item=>item.unit==='bottle'?(item.quantity||0)+'병 · 개봉 '+Object.keys(item.bottles||{}).length+'병':Number(item.quantity||0).toLocaleString('ko-KR')+' '+({each:'개',g:'g',ml:'mL',pack:'팩'}[item.unit]||'개');
const total=item=>item.unit==='bottle'?(item.quantity||0)*item.size+Object.values(item.bottles||{}).reduce((n,p)=>n+item.size*p/100,0):item.quantity||0;
const byName=(a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true})||a.id.localeCompare(b.id);
async function loadInventory(ctx){
 const rows=[];let cursor;
 do{const page=await ctx.api('read',{kind:'inventory',...(cursor?{cursor}:{})});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 return rows;
}
export async function renderInventory(ctx){
 const [rows,{rows:custom}]=await Promise.all([loadInventory(ctx),ctx.api('listInventoryCategories')]);
 const categories=inventoryCategories(rows,custom);
 ctx.state.data.inventory=Object.fromEntries(rows.map(row=>[row.id,row]));
 ctx.state.inventoryCategories=categories;
 const known=new Set(categories.map(c=>c.id));
 const selected=ctx.state.inventoryCategory==='*'||known.has(ctx.state.inventoryCategory)?ctx.state.inventoryCategory:'*';
 ctx.state.inventoryCategory=selected;
 const group=item=>known.has(itemCategory(item))?itemCategory(item):'';
 const grouped=new Map(categories.map(category=>[category.id,[]]));
 for(const row of rows)grouped.get(group(row)).push(row);
 for(const items of grouped.values())items.sort(byName);
 const card=item=>'<article class="inventory-card" draggable="true" data-inventory-drag="'+esc(item.id)+'" data-inventory-card="'+esc(item.id)+'" data-inventory-name="'+esc(item.name)+'">'+
  '<button type="button" class="inventory-card-open" data-action="item-view" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 상세 보기"><span class="inventory-card-name">'+esc(item.name)+'</span></button>'+
  '<button type="button" class="inventory-delete" data-action="record-delete" data-kind="inventory" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 삭제"><span aria-hidden="true">×</span></button>'+
  '<div class="inventory-card-meta"><span>'+esc(quantity(item))+'</span>'+(total(item)<item.minimum?'<span class="inventory-low">재고 부족</span>':'')+'</div>'+
  '<div class="inventory-card-actions"><button type="button" class="button small ghost" data-action="stock-record" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 수량 기록">수량</button><button type="button" class="button small ghost inventory-drag" draggable="true" data-inventory-drag="'+esc(item.id)+'" data-action="inventory-move" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 카테고리 이동">이동</button></div></article>';
 const lane=category=>{const items=grouped.get(category.id),visible=selected==='*'?(items.length>0||rows.length===0&&category.id===''):selected===category.id;return '<section class="inventory-lane" data-inventory-category="'+esc(category.id)+'" data-inventory-drop="'+esc(category.id)+'" aria-label="'+esc(category.name)+' 카테고리"'+(visible?'':' hidden')+'><header class="inventory-lane-heading"><h2>'+esc(category.name)+'<span class="inventory-lane-count" data-inventory-count>'+items.length+'</span></h2><div class="inventory-lane-controls">'+(category.id&&!category.legacy?'<button type="button" class="button small ghost" data-action="inventory-category-edit" data-id="'+esc(category.id)+'" aria-label="'+esc(category.name)+' 카테고리 수정">수정</button>':'')+'<button type="button" class="button small ghost inventory-lane-add" data-action="item-edit" data-category="'+esc(category.id)+'" aria-label="'+esc(category.name)+' 품목 추가">+ 품목 추가</button></div></header><div class="inventory-lane-items">'+items.map(card).join('')+'</div><p class="inventory-lane-empty" data-inventory-empty'+(items.length?' hidden':'')+'>품목 없음</p></section>';};
 const tab=category=>'<button type="button" class="inventory-category-tab" data-inventory-filter="'+esc(category.id)+'"'+(category.id==='*'?'':' data-inventory-drop="'+esc(category.id)+'"')+' aria-pressed="'+String(selected===category.id)+'"><span>'+esc(category.name)+'</span><span data-inventory-nav-count>'+(category.id==='*'?rows.length:grouped.get(category.id).length)+'</span></button>';
 return '<div class="page-heading inventory-heading"><h1 id="page-title" tabindex="-1">재고 관리</h1><div class="inventory-heading-actions">'+button('카테고리 추가','inventory-category-edit',{class:'button secondary'})+'<button type="button" class="button" data-action="item-edit" data-inventory-create data-category="'+esc(selected==='*'?'':selected)+'">품목 등록</button></div></div>'+
 '<section class="inventory-workspace" data-inventory-board><div class="inventory-toolbar"><label class="search-box"><input type="search" data-inventory-search aria-label="품목 검색" placeholder="품목 검색" autocomplete="off" maxlength="100"></label><span data-inventory-results role="status" aria-live="polite">'+rows.length+'개 품목</span></div>'+
 '<div class="inventory-layout"><nav class="inventory-navigation" aria-label="재고 카테고리">'+tab({id:'*',name:'전체'})+categories.map(tab).join('')+'</nav><div class="inventory-list"><div class="inventory-columns" aria-hidden="true"><span>품목</span><span>잔여량</span><span>관리</span></div><div class="inventory-board">'+categories.map(lane).join('')+'</div><p class="inventory-no-results" data-inventory-no-results hidden>검색 결과 없음</p></div></div><p class="inventory-save-status sr-only" role="status" aria-live="polite"></p></section>';
}

export async function moveInventoryItem(ctx,id,categoryId){
 const item=ctx.state.data.inventory?.[id];
 if(!item)throw Error('품목을 다시 불러온 뒤 이동해 주세요.');
 if(itemCategory(item)===categoryId)return;
 if(ctx.state.inventoryMoving)throw Error('품목을 이동하고 있습니다. 잠시 기다려 주세요.');
 ctx.state.inventoryMoving=true;
 try{
  await ctx.api('moveInventoryItem',{id,revision:item.revision,categoryId});
  ctx.toast('카테고리를 옮겼습니다.');
  await ctx.render();
 }catch(error){
  // Refresh stale revisions after a rejected move; never display an unsaved move.
  try{await ctx.render();}catch{}
  throw error;
 }finally{ctx.state.inventoryMoving=false;}
}

export async function inventoryAction(ctx,action,id){
 if(action==='inventory-move'){
  const item=ctx.state.data.inventory?.[id];if(!item)throw Error('품목을 다시 불러와 주세요.');
  const {rows:custom}=await ctx.api('listInventoryCategories');
  const categories=inventoryCategories(Object.values(ctx.state.data.inventory||{}),custom);
  modal('카테고리 이동','<p class="wide">'+esc(item.name)+'</p>'+field('categoryId','옮길 카테고리',itemCategory(item),{wide:true,choices:categories.map(c=>[c.id,c.name])}),async f=>moveInventoryItem(ctx,id,String(f.get('categoryId'))),{submit:'이동'});
  return;
 }
 if(action==='inventory-category-edit'){
  const category=id?ctx.state.inventoryCategories?.find(c=>c.id===id):null;
  if(id&&(!category||category.legacy))throw Error('카테고리를 다시 불러와 주세요.');
  const dialog=modal(category?'카테고리 수정':'카테고리 추가',field('name','카테고리 이름',category?.name||'',{required:true,wide:true,maxLength:50})+(category?'<div class="wide inventory-category-remove">'+button('카테고리 삭제','inventory-category-delete',{id,class:'button ghost'})+'</div>':''),async f=>{
   await ctx.api('saveInventoryCategory',{...(category?{id,revision:category.revision}:{revision:0}),name:String(f.get('name')).trim()});
   ctx.toast(category?'카테고리를 수정했습니다.':'카테고리를 만들었습니다.');await ctx.render();
  });
  return dialog;
 }
 if(action==='inventory-category-delete'){
  const category=ctx.state.inventoryCategories?.find(c=>c.id===id);
  if(!category||category.legacy)throw Error('카테고리를 다시 불러와 주세요.');
  if(Object.values(ctx.state.data.inventory||{}).some(item=>itemCategory(item)===id))throw Error('품목을 다른 카테고리로 옮긴 뒤 삭제해 주세요.');
  modal('카테고리 삭제','<p class="wide"><strong>'+esc(category.name)+'</strong> 카테고리를 삭제할까요?</p>',async()=>{
   await ctx.api('deleteInventoryCategory',{id,revision:category.revision});ctx.toast('빈 카테고리를 삭제했습니다.');await ctx.render();
  },{submit:'카테고리 삭제',submitClass:'button danger'});
 }
}

export function bindInventoryBoard(ctx,root=document){
 const board=root.querySelector('[data-inventory-board]');if(!board||board.dataset.bound)return;
 board.dataset.bound='true';
 const search=board.querySelector('[data-inventory-search]');
 const lanes=Array.from(board.querySelectorAll('[data-inventory-category]'));
 const tabs=Array.from(board.querySelectorAll('[data-inventory-filter]'));
 const create=root.querySelector('[data-inventory-create]');
 const totalCount=lanes.reduce((count,lane)=>count+lane.querySelectorAll('[data-inventory-card]').length,0);
 const filter=()=>{
  const query=search.value.trim().toLocaleLowerCase('ko-KR');ctx.state.inventorySearch=search.value;let shown=0;
  const selected=tabs.some(tab=>tab.dataset.inventoryFilter===ctx.state.inventoryCategory)?ctx.state.inventoryCategory:'*';
  ctx.state.inventoryCategory=selected;
  tabs.forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.inventoryFilter===selected)));
  if(create)create.dataset.category=selected==='*'?'':selected;
  lanes.forEach(lane=>{
   const active=selected==='*'||selected===lane.dataset.inventoryCategory;
   const cards=Array.from(lane.querySelectorAll('[data-inventory-card]'));
   cards.forEach(card=>{card.hidden=!active||!query.split(/\s+/).every(word=>card.dataset.inventoryName.toLocaleLowerCase('ko-KR').includes(word));});
   const visible=cards.filter(card=>!card.hidden).length;shown+=visible;
   lane.querySelector('[data-inventory-count]').textContent=query?visible+' / '+cards.length:String(cards.length);
   const empty=lane.querySelector('[data-inventory-empty]');empty.hidden=!!visible;empty.textContent=query?'검색 결과 없음':'품목 없음';
   lane.hidden=!active||(query?!visible:selected==='*'&&!cards.length&&(totalCount>0||lane.dataset.inventoryCategory!==''));
  });
  board.querySelector('[data-inventory-results]').textContent=shown+(query?'개 품목 검색됨':'개 품목');
  board.querySelector('[data-inventory-no-results]').hidden=!query||shown>0;
 };
 search.value=ctx.state.inventorySearch||'';search.addEventListener('input',filter);filter();
 board.addEventListener('click',event=>{
  const tab=event.target.closest('[data-inventory-filter]');if(!tab||ctx.state.inventoryMoving)return;
  ctx.state.inventoryCategory=tab.dataset.inventoryFilter;filter();
 });
 let dragged=null;
 const clear=()=>{board.querySelectorAll('.inventory-drop-target,.inventory-dragging').forEach(el=>el.classList.remove('inventory-drop-target','inventory-dragging'));};
 board.addEventListener('dragstart',event=>{
  const handle=event.target.closest('[data-inventory-drag]');
  if(!handle||ctx.state.inventoryMoving){event.preventDefault();return;}
  dragged=handle.dataset.inventoryDrag;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged);
  const card=handle.closest('[data-inventory-card]');event.dataTransfer.setDragImage?.(card,24,24);card.classList.add('inventory-dragging');
 });
 board.addEventListener('dragover',event=>{
  const lane=event.target.closest('[data-inventory-drop]');if(!dragged||!lane)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';board.querySelectorAll('.inventory-drop-target').forEach(el=>{if(el!==lane)el.classList.remove('inventory-drop-target');});lane.classList.add('inventory-drop-target');
 });
 board.addEventListener('dragleave',event=>{const lane=event.target.closest('[data-inventory-drop]');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('inventory-drop-target');});
 board.addEventListener('dragend',()=>{dragged=null;clear();});
 board.addEventListener('drop',async event=>{
  const lane=event.target.closest('[data-inventory-drop]');if(!dragged||!lane)return;
  event.preventDefault();const id=dragged;dragged=null;clear();
  board.setAttribute('aria-busy','true');board.inert=true;
  board.querySelector('.inventory-save-status').textContent='카테고리를 옮기고 있습니다.';
  try{await moveInventoryItem(ctx,id,lane.dataset.inventoryDrop);}catch(error){ctx.toast(error.message||'이동하지 못했습니다. 다시 시도해 주세요.');}
  finally{board.removeAttribute('aria-busy');board.inert=false;board.querySelector('.inventory-save-status').textContent='';}
 });
}
