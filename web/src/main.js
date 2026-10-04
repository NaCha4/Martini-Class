import './style.css';
import { api, auth, onAuthStateChanged } from './firebase.js';
import { esc, icon, refreshIcons, toast, modal, closeModal, formSignature, captureFocus, restoreFocus, busyControl, showFormError } from './ui.js';
import { renderScreen, screenAction, screenSubmit, isAdminScreen } from './screen-router.js';
import { sortMemberRows } from './admin.js';
import { bindInventoryBoard } from './inventory.js';
import { filterListRows } from './list-filters.js';
import { isMemberRoute, getMemberSessionKey, memberStorage } from './member-session.js';
export const state={profile:null,user:null,authReady:false,data:{},settings:{},search:'',filter:'all',eventType:'all'};
export const ctx={state,api,toast,navigate,render,mayLeave};
const app=document.querySelector('#app');
let renderNumber=0,rendering=false,trackedForm=null,navigating=false;
let memberExpiryTimer;
function expireMemberView(){
  if(!isMemberRoute()||getMemberSessionKey(ctx))return;
  if(!app.querySelector('.member-shell,.member-retry-page')&&!document.querySelector('.member-dialog'))return;
  void closeModal({discard:true});
  void render({focus:true});
}
function scheduleMemberExpiry(){
  clearTimeout(memberExpiryTimer);
  if(!isMemberRoute()||!getMemberSessionKey(ctx))return;
  const remaining=Date.parse(memberStorage(ctx).session.expiresAt)-Date.now();
  memberExpiryTimer=setTimeout(()=>{expireMemberView();scheduleMemberExpiry();},Math.max(0,Math.min(remaining+20,2147483647)));
}
window.addEventListener('focus',expireMemberView);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')expireMemberView();});
let currentIndex=Number(history.state?.martiniIndex||0),currentUrl=location.pathname+location.search+location.hash,restoringHistory=false;
const positions=new Map();
history.replaceState({...history.state,martiniIndex:currentIndex},'');
history.scrollRestoration='manual';
function rememberPosition(){positions.set(currentIndex,{scroll:scrollY,search:state.search,filter:state.filter,eventType:state.eventType});}
function dirtyApplication(){return trackedForm?.node.isConnected&&formSignature(trackedForm.node)!==trackedForm.signature;}
async function mayLeave() {
  if(document.querySelector('form[data-form][aria-busy=true]')){toast('요청을 처리하고 있습니다. 완료될 때까지 기다려 주세요.');return false;}
  if(!await closeModal())return false;
  if(!dirtyApplication())return true;
  return new Promise(resolve=>{
    let accepted=false;
    const dialog=modal('신청서 작성을 그만둘까요?','<p class="wide">아직 신청이 완료되지 않았습니다. 이동하면 입력한 내용이 사라집니다.</p>',async()=>{accepted=true;},{submit:'작성 내용 버리고 이동',submitClass:'button danger',busyText:'이동 중…'});
    dialog.addEventListener('close',()=>resolve(accepted),{once:true});
  });
}
export async function navigate(path,{discard=false,replace=false}={}) {
  if(navigating&&!discard)return false;
  navigating=true;
  try {
    if(!discard&&!await mayLeave())return false;
    if(discard)await closeModal({discard:true});
    rememberPosition();
    if(!replace)currentIndex++;
    history[replace?'replaceState':'pushState']({martiniIndex:currentIndex},'',path);
    currentUrl=location.pathname+location.search+location.hash;
    state.search='';state.filter='all';state.eventType='all';
    await render({focus:true,scroll:0});
    return true;
  } finally {navigating=false;}
}
window.addEventListener('popstate',async event=>{
  if(restoringHistory){restoringHistory=false;return;}
  const destination=Number(event.state?.martiniIndex??currentIndex),destinationUrl=location.pathname+location.search+location.hash;
  rememberPosition();
  if(!await mayLeave()){
    const delta=currentIndex-destination;
    if(delta){restoringHistory=true;history.go(delta);}else history.replaceState({martiniIndex:currentIndex},'',currentUrl);
    return;
  }
  currentIndex=destination;currentUrl=destinationUrl;
  const remembered=positions.get(currentIndex);
  state.search=remembered?.search||'';state.filter=remembered?.filter||'all';state.eventType=remembered?.eventType||'all';
  await render({focus:true,scroll:remembered?.scroll||0});
});
window.addEventListener('beforeunload',event=>{
  if(document.querySelector('#modal[open]')?.isDirty()||dirtyApplication()||document.querySelector('form[aria-busy=true]')){event.preventDefault();event.returnValue='';}
});
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
  if(rendering&&!target.closest('dialog'))return;
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
  if(event.target.matches('[data-member-sort]'))sortMemberRows(ctx,event.target);
});
const filterRows=()=>filterListRows(app,state);
export async function render({focus=false,scroll}={}) {
  const current=++renderNumber,savedFocus=captureFocus(),savedScroll=scrollY;
  const memberLocked=isMemberRoute()&&!getMemberSessionKey(ctx);
  if(memberLocked)void closeModal({discard:true});
  rendering=true;app.setAttribute('aria-busy','true');
  let progress=document.querySelector('#page-progress');
  if(!progress){progress=document.createElement('div');progress.id='page-progress';progress.setAttribute('role','status');progress.innerHTML='<span class="sr-only">화면을 불러오고 있습니다.</span>';document.body.append(progress);}
  const hasView=!!app.querySelector('h1');
  if(!hasView||memberLocked){app.innerHTML='<div class="loading" role="status">'+icon('loader-circle')+'<span>불러오는 중</span></div>';refreshIcons();}
  else{
    app.style.minHeight=app.getBoundingClientRect().height+'px';
    const view=app.querySelector('.workspace-content,main');if(view)view.inert=true;
  }
  try{
    let html=await renderScreen(ctx);
    if(current===renderNumber&&!html&&isMemberRoute()&&!getMemberSessionKey(ctx))html=await renderScreen(ctx);
    if(current!==renderNumber)return;
    app.innerHTML=html;refreshIcons();bindInventoryBoard(ctx,app);
    const search=app.querySelector('[data-search]'),filter=app.querySelector('[data-filter]');
    if(search)search.value=state.search;if(filter)filter.value=state.filter;const type=app.querySelector('[data-event-type]');if(type)type.value=state.eventType;filterRows();
    document.title=location.pathname==='/'?'Martini · 마티니':(app.querySelector('h1')?.textContent||'마티니')+' · Martini';
    const application=app.querySelector('form[data-form=apply],form[data-form^="member-"]:not([data-form=member-login])');
    trackedForm=application?{node:application,signature:formSignature(application)}:null;
    app.style.minHeight='';
    window.scrollTo({top:scroll??savedScroll,behavior:'instant'});
    if(focus)restoreFocus(null);else restoreFocus(savedFocus,{fallback:false});
    if(isMemberRoute()&&state.memberScrollTarget&&app.querySelector('.member-shell')){
      const section=document.getElementById(state.memberScrollTarget);delete state.memberScrollTarget;
      if(section){section.scrollIntoView({block:'start',behavior:'instant'});section.focus({preventScroll:true});}
    }
  }catch(error){
    if(current!==renderNumber)return;
    app.innerHTML='<main class="connection-page"><a href="/" data-nav class="brand">MARTINI</a><h1 tabindex="-1">연결을 확인해 주세요</h1><p>'+esc(error.message)+'</p><button class="button" type="button" id="retry-page">다시 시도</button></main>';
    app.querySelector('#retry-page').onclick=()=>render({focus:true});trackedForm=null;app.style.minHeight='';restoreFocus(null);
  }finally{if(current===renderNumber){rendering=false;app.removeAttribute('aria-busy');progress.remove();scheduleMemberExpiry();}}
}
onAuthStateChanged(auth,async user=>{
  state.user=user;state.profile=null;
  if(user){try{state.profile=await api('profile');}catch(error){state.authError=error.message;}}
  state.authReady=true;if(isAdminScreen())render();
});
render();
