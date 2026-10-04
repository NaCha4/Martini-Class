import { esc, icon, button, field, modal } from './ui.js';
import './inventory.css';

const legacyNames={spirit:'주류',ingredient:'재료',supply:'소모품',tool:'도구'};
export const itemCategory=item=>item.categoryId??(legacyNames[item.category]?'legacy-'+item.category:'');
export function inventoryCategories(rows,custom=[]){
 const used=new Set(rows.map(itemCategory));
 return [{id:'',name:'미분류'},...Object.entries(legacyNames).filter(([key])=>used.has('legacy-'+key)).map(([key,name])=>({id:'legacy-'+key,name,legacy:true})),...custom];
}
const photo=value=>typeof value==='string'&&value.length<=160000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';
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
 const group=item=>known.has(itemCategory(item))?itemCategory(item):'';
 const card=item=>'<article class="inventory-card" data-inventory-card="'+esc(item.id)+'" data-inventory-name="'+esc(item.name+' '+(item.location||''))+'">'+
  '<button type="button" class="inventory-card-open" data-action="item-view" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 상세 보기"><span class="inventory-card-photo">'+(photo(item.photo)?'<img src="'+esc(photo(item.photo))+'" alt="" loading="lazy" draggable="false" width="320" height="220">':'<span class="inventory-photo-placeholder">'+icon('package')+'<small>사진을 추가해 보세요</small></span>')+'</span><span class="inventory-card-name">'+esc(item.name)+'</span></button>'+
  '<div class="inventory-card-meta"><span>'+esc(quantity(item))+'</span>'+(total(item)<item.minimum?'<span class="inventory-low">재고 부족</span>':'')+'</div>'+
  '<div class="inventory-card-actions">'+button('수량 기록','stock-record',{id:item.id,class:'button small ghost'})+'<button type="button" class="button small secondary inventory-drag" draggable="true" data-inventory-drag="'+esc(item.id)+'" data-action="inventory-move" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 카테고리 이동" title="드래그하거나 눌러서 카테고리 이동">'+icon('arrow-right')+'이동</button></div></article>';
 const lane=(category,index)=>{const items=rows.filter(row=>group(row)===category.id).sort(byName);return '<section class="inventory-lane" data-inventory-category="'+esc(category.id)+'" data-tone="'+index%5+'" aria-label="'+esc(category.name)+' 카테고리"><header class="inventory-lane-heading"><h2><span class="inventory-lane-dot" aria-hidden="true"></span>'+esc(category.name)+'<span class="inventory-lane-count" data-inventory-count>'+items.length+'</span></h2>'+(category.id&&!category.legacy?'<button type="button" class="icon-button" data-action="inventory-category-edit" data-id="'+esc(category.id)+'" aria-label="'+esc(category.name)+' 카테고리 수정">'+icon('pencil')+'</button>':'')+'</header><div class="inventory-lane-items">'+items.map(card).join('')+'</div><p class="inventory-lane-empty" data-inventory-empty'+(items.length?' hidden':'')+'>이곳으로 품목을 옮겨 보세요</p><button type="button" class="inventory-lane-add" data-action="item-edit" data-category="'+esc(category.id)+'">'+icon('plus')+'품목 추가<span class="sr-only"> · '+esc(category.name)+'</span></button></section>';};
 return '<div class="page-heading inventory-heading"><div><h1 id="page-title" tabindex="-1">재고 관리</h1><p>사진으로 찾고, 카테고리로 가볍게 정리하세요.</p></div><div class="inventory-heading-actions">'+button('카테고리 만들기','inventory-category-edit',{class:'button secondary',icon:'folder'})+button('품목 등록','item-edit',{icon:'plus'})+'</div></div>'+
 '<section class="inventory-workspace" data-inventory-board><div class="inventory-guide">'+icon('package')+'<p>이름과 사진으로 등록한 뒤, 카드의 <strong>이동</strong>을 다른 카테고리로 드래그하세요.<span>이동 버튼을 눌러 카테고리를 선택할 수도 있어요.</span></p><span class="inventory-total">전체 <strong>'+rows.length+'</strong>개</span></div>'+
 '<div class="inventory-toolbar"><label class="search-box">'+icon('search')+'<input type="search" data-inventory-search aria-label="품목 검색" placeholder="이름이나 보관 위치로 찾기" autocomplete="off" maxlength="100"></label><span data-inventory-results role="status" aria-live="polite"></span></div>'+
 (!rows.length?'<div class="inventory-welcome"><h2>우리 동아리의 재고를 한눈에</h2><p>먼저 품목을 등록하고, 진 · 시럽 · 글라스처럼 편한 이름으로 카테고리를 만들어 보세요.</p></div>':'')+
 '<div class="inventory-board">'+categories.map(lane).join('')+'<button class="inventory-new-lane" type="button" data-action="inventory-category-edit">'+icon('plus')+'<span>새 카테고리</span></button></div><p class="inventory-save-status sr-only" role="status" aria-live="polite"></p></section>';
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
  const dialog=modal(category?'카테고리 수정':'카테고리 만들기',field('name','카테고리 이름',category?.name||'',{required:true,wide:true,maxLength:50,placeholder:'예: 진, 시럽, 글라스'})+'<p class="wide help">함께 두고 싶은 품목끼리 자유롭게 묶어 주세요.</p>'+(category?'<div class="wide inventory-category-remove">'+button('빈 카테고리 삭제','inventory-category-delete',{id,class:'button ghost'})+'</div>':''),async f=>{
   await ctx.api('saveInventoryCategory',{...(category?{id,revision:category.revision}:{revision:0}),name:String(f.get('name')).trim()});
   ctx.toast(category?'카테고리를 수정했습니다.':'카테고리를 만들었습니다.');await ctx.render();
  });
  return dialog;
 }
 if(action==='inventory-category-delete'){
  const category=ctx.state.inventoryCategories?.find(c=>c.id===id);
  if(!category||category.legacy)throw Error('카테고리를 다시 불러와 주세요.');
  if(Object.values(ctx.state.data.inventory||{}).some(item=>itemCategory(item)===id))throw Error('품목을 다른 카테고리로 옮긴 뒤 삭제해 주세요.');
  modal('빈 카테고리 삭제','<p class="wide"><strong>'+esc(category.name)+'</strong> 카테고리를 삭제할까요?</p>',async()=>{
   await ctx.api('deleteInventoryCategory',{id,revision:category.revision});ctx.toast('빈 카테고리를 삭제했습니다.');await ctx.render();
  },{submit:'카테고리 삭제',submitClass:'button danger'});
 }
}

export function bindInventoryBoard(ctx,root=document){
 const board=root.querySelector('[data-inventory-board]');if(!board||board.dataset.bound)return;
 board.dataset.bound='true';
 const search=board.querySelector('[data-inventory-search]');
 const filter=()=>{
  const query=search.value.trim().toLocaleLowerCase('ko-KR');ctx.state.inventorySearch=search.value;let shown=0;
  board.querySelectorAll('[data-inventory-card]').forEach(card=>{card.hidden=!query.split(/\s+/).every(word=>card.dataset.inventoryName.toLocaleLowerCase('ko-KR').includes(word));if(!card.hidden)shown++;});
  board.querySelectorAll('[data-inventory-category]').forEach(lane=>{
   const cards=Array.from(lane.querySelectorAll('[data-inventory-card]')),visible=cards.filter(c=>!c.hidden).length;
   lane.querySelector('[data-inventory-count]').textContent=query?visible+' / '+cards.length:String(cards.length);
   const empty=lane.querySelector('[data-inventory-empty]');empty.hidden=!!visible;empty.textContent=query?'검색된 품목이 없습니다':'이곳으로 품목을 옮겨 보세요';
  });
  board.querySelector('[data-inventory-results]').textContent=query?shown+'개 품목 검색됨':'';
 };
 search.value=ctx.state.inventorySearch||'';search.addEventListener('input',filter);filter();
 let dragged=null;
 const clear=()=>{board.querySelectorAll('.inventory-drop-target,.inventory-dragging').forEach(el=>el.classList.remove('inventory-drop-target','inventory-dragging'));};
 board.addEventListener('dragstart',event=>{
  const handle=event.target.closest('[data-inventory-drag]');
  if(!handle||ctx.state.inventoryMoving){event.preventDefault();return;}
  dragged=handle.dataset.inventoryDrag;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged);
  const card=handle.closest('[data-inventory-card]');event.dataTransfer.setDragImage?.(card,24,24);card.classList.add('inventory-dragging');
 });
 board.addEventListener('dragover',event=>{
  const lane=event.target.closest('[data-inventory-category]');if(!dragged||!lane)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';board.querySelectorAll('.inventory-drop-target').forEach(el=>{if(el!==lane)el.classList.remove('inventory-drop-target');});lane.classList.add('inventory-drop-target');
 });
 board.addEventListener('dragleave',event=>{const lane=event.target.closest('[data-inventory-category]');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('inventory-drop-target');});
 board.addEventListener('dragend',()=>{dragged=null;clear();});
 board.addEventListener('drop',async event=>{
  const lane=event.target.closest('[data-inventory-category]');if(!dragged||!lane)return;
  event.preventDefault();const id=dragged;dragged=null;clear();
  board.setAttribute('aria-busy','true');board.inert=true;
  board.querySelector('.inventory-save-status').textContent='카테고리를 옮기고 있습니다.';
  try{await moveInventoryItem(ctx,id,lane.dataset.inventoryCategory);}catch(error){ctx.toast(error.message||'이동하지 못했습니다. 다시 시도해 주세요.');}
  finally{board.removeAttribute('aria-busy');board.inert=false;board.querySelector('.inventory-save-status').textContent='';}
 });
}
