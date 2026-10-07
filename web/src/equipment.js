import { esc,icon,field,button,textBlock,modal,refreshIcons,date } from './ui.js';
import { hasPermission } from '../../functions/src/permissions.js';
import { memberState,getMemberSessionKey,clearMemberIdentity,isMemberAccessError,refreshMemberSession } from './member-session.js';
import { activateMemberRequestView } from './member-navigation.js';
import './equipment.css';
import { bindEquipmentPullRefresh } from './equipment-pull-refresh.js';

const info=item=>'<dl class="equipment-facts">'+[['보관 위치',item.location],['주의사항',item.precautions],...(item.details||[]).map(d=>[d.label,d.value])].filter(([,v])=>v).map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+textBlock(value)+'</dd></div>').join('')+'</dl>';
const overdue=loan=>loan.status==='borrowed'&&loan.dueDate&&Date.parse(loan.dueDate+'T23:59:59+09:00')<Date.now();
const status=loan=>loan.status==='returned'?'반납 완료':overdue(loan)?'반납 예정일 지남':'대여 중';
const singleItem=item=>item?.quantity===1;
const singleLoan=(loan,item)=>singleItem(item)&&loan.quantity===1;
const loanTitle=(loan,item)=>loan.item.name+(singleLoan(loan,item)?'':' · '+loan.quantity+'개');
export function equipmentLoanRow(loan,item){return '<button type="button" class="member-request-row" data-action="member-equipment-loan" data-id="'+esc(loan.id)+'"><span class="member-request-icon">'+icon('package')+'</span><span class="member-request-content"><span class="member-request-kind">비품 대여</span><strong>'+esc(loanTitle(loan,item))+'</strong><small>'+esc(loan.status==='returned'?date(loan.returnedAt,true)+' 반납':loan.dueDate?'반납 예정 '+loan.dueDate:date(loan.borrowedAt,true)+' 대여')+'</small></span><span class="member-status '+(loan.status==='returned'?'cancelled':overdue(loan)?'rejected':'approved')+'">'+status(loan)+'</span>'+icon('arrow-right')+'</button>';}
function equipmentMemberCard(item,loans){
 const mine=loans.some(loan=>loan.itemId===item.id&&loan.status==='borrowed');
 return '<button type="button" class="equipment-choice'+(mine?' is-mine':'')+'" data-equipment-item="'+esc(item.id)+'" data-action="member-equipment-detail" data-id="'+esc(item.id)+'" aria-haspopup="dialog" aria-label="'+esc(item.name+' 상세 보기')+'">'
  +'<strong class="equipment-card-title">'+esc(item.name)+'</strong></button>';
}
export function renderEquipmentMember(ctx){
 const data=memberState(ctx).equipment;
 if(!data?.items)return '<p role="status">'+(data?.error?esc(data.error):'비품 목록을 불러와 주세요.')+'</p>';
 const loans=data.loans||[],owned=new Set(loans.filter(loan=>loan.status==='borrowed').map(loan=>loan.itemId));
 const items=data.items.filter(item=>item.enabled||owned.has(item.id));
 return items.length?'<div class="equipment-grid">'+items.map(item=>equipmentMemberCard(item,loans)).join('')+'</div>':'<p class="member-quiet-empty">현재 대여 가능한 비품이 없습니다.</p>';
}
let mountedRefresh=null;
export function clearMemberEquipmentRefresh(){mountedRefresh?.dispose();mountedRefresh=null;}
async function refreshEquipmentContents(ctx){
 const shot=memberSnapshot(ctx);
 if(await loadMemberEquipment(ctx)&&shot.current()){
  const node=document.querySelector('[data-equipment-member]');
  if(node){node.innerHTML=renderEquipmentMember(ctx);refreshIcons();}
 }
}
export function mountMemberEquipmentRefresh(ctx,scope=document){
 clearMemberEquipmentRefresh();
 const panel=scope.querySelector('#member-equipment-view');if(!panel)return;
 const control=panel.querySelector('[data-action="member-equipment-refresh"]'),status=panel.querySelector('[data-equipment-pull-text]'),content=panel.querySelector('[data-equipment-member]');
 const enabled=()=>!!getMemberSessionKey(ctx)&&ctx.state.memberAppTab==='visits'&&ctx.state.memberRequestView==='equipment'&&!panel.closest('[hidden],[inert]')&&!document.querySelector('dialog[open]');
 const binding=bindEquipmentPullRefresh(panel,()=>refreshEquipmentContents(ctx),{enabled,onError:()=>ctx.toast('새로고침하지 못했습니다. 다시 시도해 주세요.'),onState:({phase,distance})=>{
  const busy=phase==='refreshing',pulling=phase==='pulling'||phase==='ready';
  panel.classList.toggle('is-pulling',pulling);panel.classList.toggle('is-refreshing',busy);
  panel.style.setProperty('--equipment-pull',busy?'44px':distance+'px');
  status.textContent=busy?'새로고침 중…':phase==='ready'?'놓으면 새로고침':phase==='pulling'?'아래로 당겨 새로고침':'';
  control.disabled=busy;content.setAttribute('aria-busy',String(busy));
 }});
 mountedRefresh={ctx,panel,...binding};
}
function memberSnapshot(ctx){const view=memberState(ctx),sessionKey=getMemberSessionKey(ctx),route=location.href,generation=ctx.state.memberAppGeneration||0;return {view,sessionKey,current:()=>memberState(ctx)===view&&getMemberSessionKey(ctx)===sessionKey&&location.href===route&&(ctx.state.memberAppGeneration||0)===generation};}
export async function loadMemberEquipment(ctx){
 const shot=memberSnapshot(ctx);if(!shot.sessionKey)return false;
 const generation=(shot.view.equipmentLoad||0)+1;shot.view.equipmentLoad=generation;
 try{const data=await ctx.api('memberEquipment',{sessionKey:shot.sessionKey});if(!shot.current()||shot.view.equipmentLoad!==generation)return false;shot.view.equipment=data;shot.view.equipmentLoans=data.loans;refreshMemberSession(ctx,data.expiresAt);return true;}
 catch(error){if(!shot.current()||shot.view.equipmentLoad!==generation)return false;if(isMemberAccessError(error)){clearMemberIdentity(ctx);await ctx.render();return false;}shot.view.equipment={error:'비품 목록을 불러오지 못했습니다. 다시 시도해 주세요.'};return true;}
}
const pendingKey='martini-pending-equipment';
async function borrowRequestId(ctx,payload,shot){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([shot.sessionKey,payload]))),scope=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
 if(!shot.current())return null;
 let pending=shot.view.equipmentPending;try{pending??=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
 if(pending?.scope!==scope||!/^[a-zA-Z0-9_-]{1,128}$/.test(pending?.requestId||''))pending={scope,requestId:crypto.randomUUID()};
 shot.view.equipmentPending=pending;try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{}
 return pending.requestId;
}
export async function memberEquipmentAction(ctx,action,id){
 if(!getMemberSessionKey(ctx))return ctx.render();
 if(['member-equipment-open','member-equipment-refresh'].includes(action)){
  if(!activateMemberRequestView(ctx,'equipment')){ctx.state.memberRequestView='equipment';ctx.state.memberAppTab='visits';return ctx.render();}
  if(mountedRefresh?.ctx===ctx&&mountedRefresh.panel.isConnected)await mountedRefresh.refresh();else await refreshEquipmentContents(ctx);return;
 }
 const shot=memberSnapshot(ctx);
 if(!await loadMemberEquipment(ctx)||!shot.current())return;
 const data=shot.view.equipment;
 if(!data?.items)throw Error('비품 목록을 불러온 뒤 다시 시도해 주세요.');
 if(action==='member-equipment-detail'){
  const item=data.items.find(item=>item.id===id),mine=data.loans.filter(loan=>loan.itemId===id&&loan.status==='borrowed');
  if(!item||(!item.enabled&&!mine.length))throw Error('현재 확인할 수 없는 비품입니다. 목록을 새로고침해 주세요.');
  const single=singleItem(item),canBorrow=item.enabled&&item.available>0;
  const availability=!item.enabled?'신규 대여 중지':item.available>0?'대여 가능':'대여 중';
  const summary=single?availability:'전체 '+item.quantity+'개 · 대여 중 '+item.borrowed+'개 · 남은 수량 '+item.available+'개'+(!item.enabled?' · 신규 대여 중지':'');
  const own=mine.length?'<p class="equipment-availability">내가 대여 중'+(single?'':' '+mine.reduce((sum,loan)=>sum+loan.quantity,0)+'개')+(mine.some(overdue)?' · 반납 기한 지남':'')+'</p>':'';
  const actions=(canBorrow?button(mine.length?'추가 대여':'대여하기','member-equipment-borrow',{id:item.id,class:mine.length?'button secondary':'button'}):'')+(mine.length?button('반납하기','member-equipment-returns',{id:item.id}):'');
  const dialog=modal(item.name,textBlock(item.description)+info(item)+'<p class="equipment-availability">'+summary+'</p>'+own+(actions?'<div class="equipment-detail-actions">'+actions+'</div>':''),null,{contentOnly:true,wide:true});
  dialog.classList.add('member-dialog');return;
 }
 if(action==='member-equipment-returns'){
  const item=data.items.find(item=>item.id===id),loans=data.loans.filter(loan=>loan.itemId===id&&loan.status==='borrowed');
  if(!loans.length)throw Error('대여 중인 기록이 없습니다. 목록을 새로고침해 주세요.');
  if(loans.length===1){action='member-equipment-loan';id=loans[0].id;}
  else{
   const dialog=modal('반납할 내역 선택','<div class="member-record-list">'+loans.map(loan=>equipmentLoanRow(loan,item)).join('')+'</div>',null,{contentOnly:true,wide:true});
   dialog.classList.add('member-dialog');return;
  }
 }
 if(action==='member-equipment-borrow'){
  const item=data.items.find(i=>i.id===id&&i.enabled);if(!item)throw Error('현재 대여할 수 없는 비품입니다.');
  const canBorrow=item.available>0,single=singleItem(item);
  const body='<div class="wide">'+textBlock(item.description)+info(item)+(single?'':'<p class="equipment-availability">전체 '+item.quantity+'개 · 대여 중 '+item.borrowed+'개 · 남은 수량 '+item.available+'개</p>')+'</div>'+(canBorrow?(single?'':field('quantity','대여 수량',1,{required:true,type:'number',min:1,max:item.available,wide:true}))+field('dueDate','반납 예정일 (선택)','',{type:'date',wide:true})+field('note','사용 메모 (선택)','',{type:'textarea',maxLength:1000,wide:true,placeholder:'예: 동아리방에서 연습할 때 사용'})+'<p class="wide help">이름과 대여·반납 기록은 본인 확인 및 비품 관리를 위해 저장됩니다. 대여 내역은 본인만 확인할 수 있습니다.</p>'+field('confirmed','안내와 주의사항을 확인했고, 비품을 가져갑니다',false,{type:'checkbox',required:true,wide:true}):'<p class="wide help">'+(single?'대여 중입니다.':'모두 대여 중입니다.')+' 반납이 기록되면 다시 대여할 수 있습니다.</p>');
  let dialog;dialog=modal(item.name,body,canBorrow?async f=>{
   if(!shot.current()||!dialog.open)throw Error('로그인 상태가 변경되었습니다. 다시 열어 주세요.');
   const payload={itemId:id,quantity:single?1:Number(f.get('quantity')),dueDate:String(f.get('dueDate')||''),note:String(f.get('note')||'').trim(),confirmed:f.has('confirmed')};
   const requestId=await borrowRequestId(ctx,payload,shot);if(!requestId||!shot.current())return;
   const result=await ctx.api('borrowEquipment',{...payload,sessionKey:shot.sessionKey,requestId});if(!shot.current())return;
   delete shot.view.equipmentPending;try{sessionStorage.removeItem(pendingKey);}catch{}
   await ctx.render();ctx.toast(result.duplicate?'이미 기록된 대여 내역을 확인했습니다.':'대여를 기록했습니다. 사용 후 반납도 기록해 주세요.');
  }:null,{submit:'대여 기록',wide:true});dialog.classList.add('member-dialog');return;
 }
 if(action==='member-equipment-loan'){
  const loan=data.loans.find(l=>l.id===id);if(!loan)throw Error('대여 기록을 찾을 수 없습니다.');
  const currentItem=data.items.find(i=>i.id===loan.itemId),borrowed=loan.status==='borrowed',single=singleLoan(loan,currentItem);
  const body='<div class="wide"><p class="equipment-availability">'+status(loan)+'</p>'+textBlock(loan.item.description)+info({...loan.item,location:currentItem?.location??loan.item.location})+'<dl class="equipment-facts">'+(single?'':'<div><dt>대여 수량</dt><dd>'+loan.quantity+'개</dd></div>')+'<div><dt>대여 일시</dt><dd>'+date(loan.borrowedAt,true)+'</dd></div>'+(loan.dueDate?'<div><dt>반납 예정일</dt><dd>'+esc(loan.dueDate)+'</dd></div>':'')+(loan.returnedAt?'<div><dt>반납 일시</dt><dd>'+date(loan.returnedAt,true)+'</dd></div>':'')+'</dl>'+textBlock(loan.note)+'</div>'+(borrowed?field('confirmed',(single?'':loan.quantity+'개 모두 ')+'보관 위치에 반납했습니다',false,{type:'checkbox',required:true,wide:true})+'<p class="wide help">실제로 반납한 뒤 기록해 주세요. 기록하면 다른 부원이 대여할 수 있습니다.</p>':'');
  let dialog;dialog=modal(loanTitle(loan,currentItem),body,borrowed?async f=>{
   if(!shot.current()||!dialog.open)throw Error('로그인 상태가 변경되었습니다. 다시 열어 주세요.');
   await ctx.api('returnEquipment',{sessionKey:shot.sessionKey,id,confirmed:f.has('confirmed')});if(!shot.current())return;await ctx.render();ctx.toast('반납을 기록했습니다.');
  }:null,{submit:'반납 기록',wide:true});dialog.classList.add('member-dialog');
 }
}

function equipmentAdminCard(item){
 const availability=!item.enabled?'신규 대여 중지':item.available?'대여 가능':'모두 대여 중';
 return '<article class="admin-catalog-card equipment-admin-card">'
  +'<div class="admin-catalog-top"><span class="admin-catalog-icon" aria-hidden="true">'+icon('package')+'</span><span class="admin-catalog-status '+(item.enabled&&item.available?'is-active':'')+'">'+availability+'</span></div>'
  +'<h2 class="admin-catalog-title" title="'+esc(item.name)+'">'+esc(item.name)+'</h2>'
  +'<p class="admin-catalog-description">'+esc(item.description||'등록된 설명이 없습니다.')+'</p>'
  +'<p class="admin-catalog-location" title="'+esc(item.location||'보관 위치 미입력')+'">'+icon('map-pin')+'<span><span class="sr-only">보관 위치: </span>'+esc(item.location||'보관 위치 미입력')+'</span></p>'
  +'<dl class="admin-catalog-stats">'+[['전체',item.quantity],['대여 중',item.borrowed],['대여 가능',item.available]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'<small>개</small></dd></div>').join('')+'</dl>'
  +'<div class="admin-catalog-footer"><div class="admin-catalog-actions">'+button('상세 정보','equipment-detail',{id:item.id,class:'button secondary',icon:'clipboard-list'})+button('정보 수정','equipment-edit',{id:item.id,icon:'pencil'})+'</div>'
  +button('목록에서 삭제','equipment-delete',{id:item.id,class:'button admin-catalog-utility',icon:'x'})+'</div></article>';
}
export async function renderEquipmentAdmin(ctx){
 if(!hasPermission(ctx.state.profile,'inventory'))return '<h1>접근 권한이 없습니다</h1>';
 const version=ctx.state.adminDataVersion||0,uid=ctx.state.user?.uid;
 const data=await ctx.api('equipmentCatalog',{});if(version!==(ctx.state.adminDataVersion||0)||uid!==ctx.state.user?.uid)return '';
 ctx.state.equipmentAdmin=data;
 return '<div class="page-heading"><div><h1 tabindex="-1">비품 대여</h1><p>부원이 직접 대여·반납을 기록합니다. 비품 목록과 안내만 설정해 주세요.</p></div>'+button('비품 추가','equipment-edit',{icon:'plus'})+'</div>'+(data.items.length?'<div class="admin-catalog-grid">'+data.items.map(equipmentAdminCard).join('')+'</div>':'<div class="empty-state"><h2>등록된 비품이 없습니다</h2><p>비품 이름과 보관 위치, 주의사항을 등록해 주세요.</p></div>');
}
function extraRow(detail={}){return '<div class="equipment-extra-row" data-equipment-detail>'+field('extraLabel','항목명',detail.label||'',{maxLength:60,placeholder:'예: 구성품, 사용 방법, 담당자'})+field('extraValue','내용',detail.value||'',{type:'textarea',maxLength:2000,rows:2})+'<button type="button" class="icon-button x-button" data-equipment-remove aria-label="추가 정보 삭제">'+icon('x')+'</button></div>';}
export async function equipmentAdminAction(ctx,action,id){
 if(!hasPermission(ctx.state.profile,'inventory'))throw Error('재고 관리 권한이 필요합니다.');
 const uid=ctx.state.user?.uid,version=ctx.state.adminDataVersion||0;
 const current=()=>uid===ctx.state.user?.uid&&version===(ctx.state.adminDataVersion||0)&&hasPermission(ctx.state.profile,'inventory')&&location.pathname.replace(/\/$/,'')==='/admin/equipment';
 const data=await ctx.api('equipmentCatalog',{});if(!current())return;
 const item=id?data.items.find(i=>i.id===id):null;if(id&&!item)throw Error('비품 목록을 새로고침해 주세요.');
 if(action==='equipment-detail'){
  if(!item)throw Error('비품 목록을 새로고침해 주세요.');
  return modal(item.name,'<div class="equipment-admin-detail">'+textBlock(item.description)+info(item)+'<p class="equipment-availability">전체 '+item.quantity+'개 · 대여 중 '+item.borrowed+'개 · 남은 수량 '+item.available+'개</p></div>',null,{contentOnly:true,wide:true});
 }
 if(action==='equipment-delete'){
  if(item.borrowed)throw Error('대여 중인 비품은 삭제할 수 없습니다. 정보 수정에서 신규 대여를 중지할 수 있습니다.');
  return modal('비품 목록에서 삭제','<p class="wide">'+esc(item.name)+'을(를) 목록에서 삭제합니다. 기존 대여·반납 기록은 유지됩니다.</p>',async()=>{if(!current())throw Error('권한이나 화면이 변경되었습니다.');await ctx.api('deleteEquipmentItem',{id,revision:item.revision,confirmed:true});if(!current())return;await ctx.render();ctx.toast('비품을 목록에서 삭제했습니다.');},{submit:'목록에서 삭제',submitClass:'button danger'});
 }
 if(action!=='equipment-edit')return;
 const body=field('name','비품 이름',item?.name||'',{required:true,maxLength:100,wide:true})+field('description','설명',item?.description||'',{type:'textarea',maxLength:3000,wide:true,rows:3})+field('location','보관 위치',item?.location||'',{maxLength:300,wide:true,placeholder:'예: 동아리방 입구 오른쪽 수납장 2층'})+field('precautions','주의사항',item?.precautions||'',{type:'textarea',maxLength:3000,wide:true,rows:3})+field('quantity','전체 보유 수량',item?.quantity||1,{type:'number',required:true,min:Math.max(1,item?.borrowed||0),max:1000,wide:true,hint:'현재 대여 중인 수량도 포함해 입력해 주세요.'})+field('enabled','부원이 새로 대여할 수 있음',item?.enabled??true,{type:'checkbox',wide:true})+'<section class="wide equipment-extra"><h3>추가 정보</h3><p class="help">원하는 항목명과 내용을 최대 12개까지 추가할 수 있습니다.</p><div data-equipment-details>'+((item?.details||[]).map(extraRow).join(''))+'</div><button type="button" class="button secondary small" data-equipment-add>정보 추가</button></section>';
 let dialog;dialog=modal(item?'비품 정보 수정':'비품 추가',body,async f=>{
  if(!current()||!dialog.open)throw Error('권한이나 화면이 변경되었습니다.');
  const details=[...dialog.querySelectorAll('[data-equipment-detail]')].map(row=>({label:row.querySelector('[name=extraLabel]').value.trim(),value:row.querySelector('[name=extraValue]').value.trim()})).filter(d=>d.label||d.value);
  if(details.some(d=>!d.label||!d.value))throw Error('추가 정보의 항목명과 내용을 모두 입력해 주세요.');
  await ctx.api('saveEquipmentItem',{...(item?{id:item.id}:{}),revision:item?.revision||0,name:String(f.get('name')||'').trim(),description:String(f.get('description')||'').trim(),location:String(f.get('location')||'').trim(),precautions:String(f.get('precautions')||'').trim(),quantity:Number(f.get('quantity')),enabled:f.has('enabled'),details});if(!current())return;await ctx.render();ctx.toast('비품 정보를 저장했습니다.');
 },{wide:true,submit:'비품 저장'});
 const container=dialog.querySelector('[data-equipment-details]');
 dialog.querySelector('[data-equipment-add]').addEventListener('click',()=>{if(container.querySelectorAll('[data-equipment-detail]').length>=12){ctx.toast('추가 정보는 최대 12개까지 입력할 수 있습니다.');return;}container.insertAdjacentHTML('beforeend',extraRow());refreshIcons();container.lastElementChild.querySelector('input').focus();});
 container.addEventListener('click',event=>{const remove=event.target.closest('[data-equipment-remove]');if(remove){remove.closest('[data-equipment-detail]').remove();dialog.querySelector('[data-equipment-add]').focus();}});
}
