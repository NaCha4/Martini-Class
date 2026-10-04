import { hasPermission } from '../../functions/src/permissions.js';
import { calculateBudget, calculatePlan } from '../../functions/src/budget-planner-rules.js';
import { esc, icon, button, field, empty, money, modal, refreshIcons } from './ui.js';
import './budget-planner.css';

const MAX_AMOUNT=1_000_000_000,MAX_PLANS=40,MAX_ITEMS=40;
const onBudgetPage=()=>location.pathname.replace(/\/$/,'')==='/admin/budget';
const allowed=ctx=>hasPermission(ctx.state.profile,'budget');
const active=(ctx,view)=>allowed(ctx)&&onBudgetPage()&&ctx.state.profile===view.profile&&ctx.state.user===view.user&&ctx.state.budgetPlannerView===view;
const balance=(value,positive='남음',negative='부족')=>'<strong class="'+(value<0?'budget-shortfall':'')+'">'+money(Math.abs(value))+'<small>'+esc(value<0?negative:positive)+'</small></strong>';
const amountOptions={type:'number',min:0,max:MAX_AMOUNT,step:1,inputMode:'numeric',required:true};
function plannerModal(...args){
 const dialog=modal(...args);dialog.classList.add('budgetplanner-dialog');return dialog;
}
function amount(value,title){
 const raw=String(value??'').trim();
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>MAX_AMOUNT)throw new Error(title+'은 0원부터 10억 원 사이의 정수로 입력해 주세요.');
 return Number(raw);
}
function title(value,label){
 const result=String(value??'').trim();
 if(!result||result.length>120)throw new Error(label+'은 1자부터 120자까지 입력해 주세요.');
 return result;
}
function planCard(plan){
 const totals=calculatePlan(plan);
 return '<article class="budget-plan"><header><h3>'+esc(plan.name)+'</h3><div>'+button('수정','budgetplanner-edit',{id:plan.id,class:'button small secondary',icon:'pencil'})+'<button type="button" class="icon-button x-button" data-action="budgetplanner-delete" data-id="'+esc(plan.id)+'" aria-label="'+esc(plan.name)+' 예산 삭제">'+icon('x')+'</button></div></header><dl class="budget-plan-totals"><div><dt>편성 예산</dt><dd>'+money(plan.allocated)+'</dd></div><div><dt>예상 지출</dt><dd>'+money(totals.expected)+'</dd></div><div><dt>'+(totals.remaining<0?'예산 초과':'예산 잔액')+'</dt><dd>'+balance(totals.remaining,'','초과')+'</dd></div></dl><div class="budget-items"><h4>예상 소비 내역 <span>'+plan.items.length+'건</span></h4>'+(plan.items.length?'<ul>'+plan.items.map(item=>'<li><span>'+esc(item.title)+'</span><strong>'+money(item.amount)+'</strong></li>').join('')+'</ul>':'<p class="budget-no-items">아직 작성한 소비 내역이 없습니다.</p>')+'</div></article>';
}
function boardHtml(board){
 const totals=calculateBudget(board);
 return '<div class="budget-page"><div class="page-heading"><div><h1 id="page-title" tabindex="-1">예산</h1><p>보유 금액과 행사별 예상 지출을 한눈에 확인하세요.</p></div>'+button('새로고침','budgetplanner-refresh',{class:'button secondary',icon:'refresh-cw'})+'</div><section class="budget-funds" aria-label="보유 금액"><div><span>'+icon('wallet')+' 보유 금액</span><strong>'+money(board.funds)+'</strong></div>'+button('금액 수정','budgetplanner-funds',{class:'button secondary',icon:'pencil'})+'</section><dl class="budget-summary"><div><dt>편성한 예산</dt><dd>'+money(totals.allocated)+'</dd><small>행사에 배정한 금액</small></div><div><dt>'+(totals.unallocated<0?'편성 초과 금액':'미편성 금액')+'</dt><dd>'+balance(totals.unallocated,'','초과')+'</dd><small>보유 금액 − 편성한 예산</small></div><div><dt>예상 지출</dt><dd>'+money(totals.expected)+'</dd><small>모든 소비 내역의 합계</small></div><div class="budget-summary-remaining"><dt>지출 후 남을 금액</dt><dd>'+balance(totals.remaining)+'</dd><small>보유 금액 − 예상 지출</small></div></dl><section aria-labelledby="budget-plans-title"><div class="budget-section-heading"><h2 id="budget-plans-title">행사별 예산 <span>'+board.plans.length+'개</span></h2>'+button('행사 예산 추가','budgetplanner-add',{icon:'plus',disabled:board.plans.length>=MAX_PLANS})+'</div>'+(board.plans.length?'<div class="budget-plans">'+board.plans.map(planCard).join('')+'</div>':empty('첫 행사 예산을 편성해 보세요','행사 이름, 사용할 예산과 예상 소비 내역을 직접 입력할 수 있습니다.',button('행사 예산 추가','budgetplanner-add',{class:'button secondary',icon:'plus'})))+(board.plans.length>=MAX_PLANS?'<p class="budget-limit">행사 예산은 최대 40개까지 작성할 수 있습니다.</p>':'')+'</section></div>';
}

export async function renderBudgetPlanner(ctx){
 if(!allowed(ctx)){delete ctx.state.budgetPlannerView;return empty('예산 업무 권한이 필요합니다','역할 관리에서 예산 업무가 지정된 운영진만 확인할 수 있습니다.');}
 const view={profile:ctx.state.profile,user:ctx.state.user,board:null};
 ctx.state.budgetPlannerView=view;
 const board=await ctx.api('budgetPlanner',{});
 if(!active(ctx,view))return '';
 view.board=board;
 return boardHtml(board);
}

async function save(ctx,view,next,message){
 if(!active(ctx,view))throw new Error('예산 페이지를 다시 열어 로그인 상태와 권한을 확인해 주세요.');
 try{
  const saved=await ctx.api('saveBudgetPlanner',{revision:view.board.revision,funds:next.funds,plans:next.plans});
  if(!active(ctx,view))return;
  view.board=saved;
  await ctx.render();
  if(allowed(ctx)&&onBudgetPage()&&ctx.state.user===view.user)ctx.toast(message);
 }catch(error){
  if(!active(ctx,view))throw new Error('로그인 상태 또는 권한이 변경되었습니다. 예산 페이지를 다시 열어 주세요.');
  if(['permission-denied','functions/permission-denied','unauthenticated','functions/unauthenticated'].includes(error.code)){
   delete ctx.state.budgetPlannerView;
   await document.querySelector('dialog.budgetplanner-dialog[open]')?.requestClose(true);
   await ctx.render();return;
  }
  if(['aborted','functions/aborted','failed-precondition','functions/failed-precondition'].includes(error.code))throw new Error('다른 운영진이 예산을 수정했습니다. 이 창의 입력 내용은 유지됩니다. 필요한 내용을 보관한 뒤 창을 닫고 새로고침해 주세요.');
  throw error;
 }
}
function fundsDialog(ctx,view){
 return plannerModal('보유 금액 수정',field('funds','현재 보유 금액 (원)',view.board.funds,{...amountOptions,wide:true})+'<p class="wide budget-dialog-help">현재 예산을 계산할 기준 금액을 입력하세요.</p>',async data=>{
  const funds=amount(data.get('funds'),'보유 금액');
  await save(ctx,view,{...view.board,funds},'보유 금액을 저장했습니다.');
 });
}
function expenseRow(item={id:crypto.randomUUID(),title:'',amount:''}){
 return '<div class="budget-expense-row" data-budget-item="'+esc(item.id)+'">'+field('item-title-'+item.id,'소비 내역',item.title,{maxLength:120,placeholder:'예: 장소 대여'})+field('item-amount-'+item.id,'예상 금액 (원)',item.amount,{...amountOptions,required:false})+'<button type="button" class="icon-button x-button" data-budget-remove aria-label="소비 내역 삭제">'+icon('x')+'</button></div>';
}
function planFromForm(form,planId){
 const data=new FormData(form),items=[];
 for(const row of form.querySelectorAll('[data-budget-item]')){
  const id=row.dataset.budgetItem,rawTitle=data.get('item-title-'+id),rawAmount=data.get('item-amount-'+id);
  if(!String(rawTitle||'').trim()&&!String(rawAmount||'').trim())continue;
  items.push({id,title:title(rawTitle,'소비 내역'),amount:amount(rawAmount,'예상 금액')});
 }
 if(items.length>MAX_ITEMS)throw new Error('소비 내역은 행사별로 40개까지 작성할 수 있습니다.');
 return {id:planId,name:title(data.get('name'),'행사 이름'),allocated:amount(data.get('allocated'),'편성 예산'),items};
}
function planDialog(ctx,view,plan){
 const planId=plan?.id||crypto.randomUUID();
 if(!plan&&view.board.plans.length>=MAX_PLANS)throw new Error('행사 예산은 최대 40개까지 작성할 수 있습니다.');
 const dialog=plannerModal(plan?'행사 예산 수정':'행사 예산 추가',field('name','행사 이름',plan?.name||'',{required:true,maxLength:120,placeholder:'예: 가을 친목 모임',wide:true})+field('allocated','편성 예산 (원)',plan?.allocated??0,{...amountOptions,wide:true})+'<section class="wide budget-expense-editor" aria-labelledby="budget-expense-title"><div class="budget-expense-heading"><div><h3 id="budget-expense-title">예상 소비 내역</h3><p>필요한 항목만 추가하세요.</p></div><button type="button" class="button small secondary" data-budget-add>'+icon('plus')+'내역 추가</button></div><div data-budget-items>'+(plan?.items.length?plan.items.map(expenseRow).join(''):expenseRow())+'</div><p class="budget-expense-count" data-budget-count></p></section><div class="wide budget-draft-totals" data-budget-preview aria-live="polite"></div>',async(_data,form)=>{
  const next=planFromForm(form,planId);
  const plans=plan?view.board.plans.map(existing=>existing.id===planId?next:existing):[...view.board.plans,next];
  await save(ctx,view,{...view.board,plans},'행사 예산을 저장했습니다.');
 },{wide:true,submit:plan?'수정 저장':'예산 추가'});
 const rows=dialog.querySelector('[data-budget-items]'),add=dialog.querySelector('[data-budget-add]'),preview=dialog.querySelector('[data-budget-preview]');
 const update=()=>{
  const values=[dialog.querySelector('[name=allocated]'),...rows.querySelectorAll('input[type=number]')];
  const invalid=values.some(input=>input.value!==''&&(!/^\d+$/.test(input.value)||Number(input.value)>MAX_AMOUNT));
  const allocated=Number(values[0].value)||0,expected=values.slice(1).reduce((sum,input)=>sum+(Number(input.value)||0),0);
  preview.innerHTML=invalid?'<p>금액은 0원부터 10억 원 사이의 정수로 입력해 주세요.</p>':'<div><span>예상 지출 합계</span><strong>'+money(expected)+'</strong></div><div><span>'+(allocated-expected<0?'편성 예산 초과':'편성 예산 잔액')+'</span>'+balance(allocated-expected,'','초과')+'</div>';
  const count=rows.querySelectorAll('[data-budget-item]').length;
  add.disabled=count>=MAX_ITEMS;
  dialog.querySelector('[data-budget-count]').textContent=count>=MAX_ITEMS?'소비 내역은 행사별로 최대 40개까지 작성할 수 있습니다.':'';
 };
 add.addEventListener('click',()=>{
  if(rows.querySelectorAll('[data-budget-item]').length>=MAX_ITEMS)return;
  rows.insertAdjacentHTML('beforeend',expenseRow());refreshIcons();update();rows.lastElementChild.querySelector('input').focus();
 });
 rows.addEventListener('click',event=>{
  const remove=event.target.closest('[data-budget-remove]');if(!remove)return;
  const row=remove.closest('[data-budget-item]'),focus=row.nextElementSibling?.querySelector('input')||row.previousElementSibling?.querySelector('input')||add;
  row.remove();update();focus.focus();
 });
 dialog.addEventListener('input',update);
 update();return dialog;
}
export async function budgetPlannerAction(ctx,action,id){
 if(!action.startsWith('budgetplanner-'))return;
 if(!allowed(ctx)){delete ctx.state.budgetPlannerView;return;}
 if(!onBudgetPage())return;
 if(action==='budgetplanner-refresh')return ctx.render();
 const view=ctx.state.budgetPlannerView;
 if(!view?.board||!active(ctx,view))return;
 if(action==='budgetplanner-funds')return fundsDialog(ctx,view);
 if(action==='budgetplanner-add')return planDialog(ctx,view);
 const plan=view.board.plans.find(item=>item.id===id);if(!plan)return;
 if(action==='budgetplanner-edit')return planDialog(ctx,view,plan);
 if(action==='budgetplanner-delete')return plannerModal('행사 예산 삭제','<div class="wide budget-delete"><h3>'+esc(plan.name)+'</h3><p>편성 예산 '+money(plan.allocated)+'과 소비 내역 '+plan.items.length+'건을 삭제합니다.</p></div>',async()=>{
  await save(ctx,view,{...view.board,plans:view.board.plans.filter(item=>item.id!==id)},'행사 예산을 삭제했습니다.');
 },{submit:'예산 삭제',submitClass:'button danger'});
}
