import { busyControl, showFormError, toast } from './ui.js';
import { screenAction, screenSubmit, screenChange } from './screen-router.js';

export function bindAppEvents(ctx,app,runtime,filterRows){
const {state,api}=ctx;
const navigate=(...args)=>ctx.navigate(...args);
function closePublicMenus(except=null){document.querySelectorAll('.public-mobile-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false;});}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('dialog[open]')){
    const menu=document.querySelector('.public-mobile-menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();}
  }
});
document.addEventListener('click',async event=>{
 const control=event.target.closest('[data-attendance-id]');if(!control||control.disabled)return;
 const value=control.dataset.savedValue==='present'?'absent':'present',id=control.dataset.attendanceId;
 control.disabled=true;control.setAttribute('aria-busy','true');
 try{await api('applicationCommand',{id,action:'attendance',attendance:value,reason:'신청자 목록에서 출석 변경'});control.dataset.savedValue=value;control.textContent=value==='present'?'출석':'불참';control.classList.toggle('present',value==='present');control.classList.toggle('absent',value==='absent');control.setAttribute('aria-pressed',String(value==='present'));if(state.data.applications?.[id])state.data.applications[id].attendance=value;toast('출석 상태를 저장했습니다.');}
 catch(error){toast(error.message||'출석 상태를 저장하지 못했습니다. 다시 시도해 주세요.');}
 finally{control.disabled=false;control.removeAttribute('aria-busy');}
});
const pendingActions=new Set();
document.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  closePublicMenus(event.target.closest('.public-mobile-menu'));
  const password=event.target.closest('[data-password-toggle]');
  if(password){
    event.preventDefault();const input=document.getElementById(password.getAttribute('aria-controls'));
    const showing=input.type==='password';input.type=showing?'text':'password';password.setAttribute('aria-pressed',String(showing));
    password.innerHTML=(showing?'숨김':'표시')+'<span class="sr-only">: 비밀번호</span>';return;
  }
  const link=event.target.closest('a[data-nav]');
  if(link&&!event.defaultPrevented&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&!link.hasAttribute('download')&&(!link.target||link.target==='_self')){
    event.preventDefault();await navigate(link.getAttribute('href'));return;
  }
  const target=event.target.closest('[data-action]');if(!target)return;
  if(target.dataset.action==='reset-filters'){
    state.search='';state.filter='all';state.eventType='all';const search=app.querySelector('[data-search]'),filter=app.querySelector('[data-filter]');
    if(search)search.value='';if(filter)filter.value='all';const type=app.querySelector('[data-event-type]');if(type)type.value='all';filterRows();search?.focus({preventScroll:true});return;
  }
  if(runtime.rendering&&!target.closest('dialog'))return;
  const key=target.dataset.action+':'+(target.dataset.id||'');
  if(pendingActions.has(key)||target.disabled)return;
  pendingActions.add(key);
  const release=target.matches('button')?busyControl(target):()=>{};
  try{await screenAction(ctx,target.dataset.action,target.dataset.id,target);}
  catch(error){toast(error.message||'처리하지 못했습니다. 다시 시도해 주세요.');}
  finally{release();pendingActions.delete(key);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('form[data-form]'))return;event.preventDefault();
  if(form.getAttribute('aria-busy')==='true')return;
  const restore=busyControl(form.querySelector('[type=submit]'),form.dataset.form==='apply'?'신청 중…':['login','member-login'].includes(form.dataset.form)?'로그인 중…':'처리 중…');
  form.setAttribute('aria-busy','true');form.inert=true;const alert=form.querySelector('[role=alert]');if(alert)alert.textContent='';
  try{const data=new FormData(form);await screenSubmit(ctx,form.dataset.form,data,form);}
  catch(error){form.inert=false;showFormError(form,error.code?.startsWith('auth/')?'이메일과 비밀번호를 확인해 주세요.':error.message);}
  finally{form.inert=false;restore();form.removeAttribute('aria-busy');}
});
function clearInvalid(input) {
  if(!input.id)return;
  input.removeAttribute('aria-invalid');document.getElementById(input.id+'-error')?.remove();
  const described=(input.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==input.id+'-error');
  if(described.length)input.setAttribute('aria-describedby',described.join(' '));else input.removeAttribute('aria-describedby');
}
document.addEventListener('invalid',event=>{
  const input=event.target;if(!input.matches('input,select,textarea'))return;
  for(let parent=input.parentElement;parent;parent=parent.parentElement)if(parent.matches('details'))parent.open=true;
  input.setAttribute('aria-invalid','true');
  const field=input.closest('.field');if(!field||!input.id)return;
  let message='입력 형식을 확인해 주세요.';
  if(input.validity.valueMissing)message=input.type==='checkbox'?'내용을 확인하고 체크해 주세요.':'필수 항목을 입력해 주세요.';
  else if(input.validity.typeMismatch)message=input.type==='email'?'이메일 주소를 확인해 주세요.':'주소 형식을 확인해 주세요.';
  else if(input.validity.rangeUnderflow)message=input.min+' 이상으로 입력해 주세요.';
  else if(input.validity.rangeOverflow)message=input.max+' 이하로 입력해 주세요.';
  else if(input.validity.stepMismatch)message='허용되는 간격으로 입력해 주세요.';
  let hint=document.getElementById(input.id+'-error');if(!hint){hint=document.createElement('small');hint.id=input.id+'-error';hint.className='field-error';field.append(hint);}
  hint.textContent=message;
  input.setAttribute('aria-describedby',[...(input.getAttribute('aria-describedby')||'').split(' ').filter(Boolean),hint.id].filter((id,i,list)=>list.indexOf(id)===i).join(' '));
},true);
document.addEventListener('input',event=>{
  if(event.target.matches('input,select,textarea'))clearInvalid(event.target);
  if(event.target.matches('[data-search]')){state.search=event.target.value;filterRows();}
});
document.addEventListener('change',async event=>{
  if(event.target.matches('input,select,textarea'))clearInvalid(event.target);
  if(event.target.matches('[data-event-type]')){state.eventType=event.target.value;filterRows();}
  if(event.target.matches('[data-filter]')){state.filter=event.target.value;filterRows();}
  if(event.target.matches('[data-staff-id]')){await screenAction(ctx,'application-staff',event.target.dataset.staffId,event.target);return;}
  if(event.target.matches('[data-member-sort]'))await screenChange(ctx,event.target);
});
}
