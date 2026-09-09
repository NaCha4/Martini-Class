import './style.css';
import { api, auth, onAuthStateChanged } from './firebase.js';
import { esc, icon, refreshIcons, toast, modal, closeModal, formSignature, captureFocus, restoreFocus, busyControl, showFormError } from './ui.js';
import { renderPublic, publicAction, publicSubmit } from './public.js';
import { renderAdmin, adminAction, adminSubmit, sortMemberRows } from './admin.js';
export const state={profile:null,user:null,authReady:false,data:{},settings:{},search:'',filter:'all',eventType:'all'};
export const ctx={state,api,toast,navigate,render};
const app=document.querySelector('#app');
let renderNumber=0,rendering=false,trackedForm=null,navigating=false;
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
  try{if(location.pathname.startsWith('/admin'))await adminAction(ctx,target.dataset.action,target.dataset.id,target);else await publicAction(ctx,target.dataset.action,target.dataset.id,target);}
  catch(error){toast(error.message||'처리하지 못했습니다. 다시 시도해 주세요.');}
  finally{release();pendingActions.delete(key);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('form[data-form]'))return;event.preventDefault();
  if(form.getAttribute('aria-busy')==='true')return;
  const restore=busyControl(form.querySelector('[type=submit]'),form.dataset.form==='apply'?'신청 중…':form.dataset.form==='login'?'로그인 중…':'처리 중…');
  form.setAttribute('aria-busy','true');form.inert=true;const alert=form.querySelector('[role=alert]');if(alert)alert.textContent='';
  try{const data=new FormData(form);if(location.pathname.startsWith('/admin'))await adminSubmit(ctx,form.dataset.form,data,form);else await publicSubmit(ctx,form.dataset.form,data,form);}
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
document.addEventListener('change',event=>{
  if(event.target.matches('input,select,textarea'))clearInvalid(event.target);
  if(event.target.matches('[data-event-type]')){state.eventType=event.target.value;filterRows();}
  if(event.target.matches('[data-filter]')){state.filter=event.target.value;filterRows();}
  if(event.target.matches('[data-member-sort]'))sortMemberRows(ctx,event.target);
});
function filterRows(){
  const rows=Array.from(app.querySelectorAll('[data-searchable]'));let count=0;
  const query=state.search.trim().toLocaleLowerCase('ko-KR');
  const eventType=app.querySelector('[data-event-type]')?state.eventType:'all';
  const filtered=!!query||state.filter!=='all'||eventType!=='all';
  rows.forEach(el=>{const show=query.split(/\s+/).every(word=>el.dataset.searchable.toLocaleLowerCase('ko-KR').includes(word))&&(state.filter==='all'||el.dataset.status===state.filter)&&(eventType==='all'||el.dataset.type===eventType);el.hidden=!show;if(show)count++;});
  app.querySelectorAll('.work-lane').forEach(lane=>{lane.querySelector('h2 span').textContent=lane.querySelectorAll('.work-card:not([hidden])').length;});
  const counter=app.querySelector('#filtered-count'),toolbar=app.querySelector('.toolbar:has([data-search])');
  if(counter)counter.textContent='불러온 '+rows.length+'건 중 '+count+'건';
  if(!toolbar)return;
  let reset=toolbar.querySelector('[data-action=reset-filters]');
  if(!reset){reset=document.createElement('button');reset.type='button';reset.dataset.action='reset-filters';reset.className='button ghost filter-reset';reset.textContent='초기화';toolbar.append(reset);}
  reset.hidden=!filtered;
  let noResults=app.querySelector('#filter-empty');
  if(!noResults){noResults=document.createElement('section');noResults.id='filter-empty';noResults.className='empty filter-empty';noResults.innerHTML=icon('search')+'<h3>조건에 맞는 항목이 없습니다</h3><p>검색어를 줄이거나 상태 필터를 바꿔 보세요.</p><button type="button" class="button secondary" data-action="reset-filters">검색 조건 초기화</button>';toolbar.after(noResults);refreshIcons();}
  noResults.hidden=!!count||!filtered;
  const list=rows[0]?.closest('.table-wrap,.event-grid,.meeting-grid,.meeting-list,.work-board');if(list)list.hidden=!count&&filtered;
}
export async function render({focus=false,scroll}={}) {
  const current=++renderNumber,savedFocus=captureFocus(),savedScroll=scrollY;
  rendering=true;app.setAttribute('aria-busy','true');
  let progress=document.querySelector('#page-progress');
  if(!progress){progress=document.createElement('div');progress.id='page-progress';progress.setAttribute('role','status');progress.innerHTML='<span class="sr-only">화면을 불러오고 있습니다.</span>';document.body.append(progress);}
  const hasView=!!app.querySelector('h1');
  if(!hasView){app.innerHTML='<div class="loading" role="status">'+icon('loader-circle')+'<span>불러오는 중</span></div>';refreshIcons();}
  else{
    app.style.minHeight=app.getBoundingClientRect().height+'px';
    const view=app.querySelector('.workspace-content,main');if(view)view.inert=true;
  }
  try{
    const html=location.pathname.startsWith('/admin')?await renderAdmin(ctx):await renderPublic(ctx);
    if(current!==renderNumber)return;
    app.innerHTML=html;refreshIcons();
    const search=app.querySelector('[data-search]'),filter=app.querySelector('[data-filter]');
    if(search)search.value=state.search;if(filter)filter.value=state.filter;const type=app.querySelector('[data-event-type]');if(type)type.value=state.eventType;filterRows();
    document.title=location.pathname==='/'?'Martini · 마티니':(app.querySelector('h1')?.textContent||'마티니')+' · Martini';
    const application=app.querySelector('form[data-form=apply]');
    trackedForm=application?{node:application,signature:formSignature(application)}:null;
    app.style.minHeight='';
    window.scrollTo({top:scroll??savedScroll,behavior:'instant'});
    if(focus)restoreFocus(null);else restoreFocus(savedFocus,{fallback:false});
  }catch(error){
    if(current!==renderNumber)return;
    app.innerHTML='<main class="connection-page"><a href="/" data-nav class="brand">MARTINI</a><h1 tabindex="-1">연결을 확인해 주세요</h1><p>'+esc(error.message)+'</p><button class="button" type="button" id="retry-page">다시 시도</button></main>';
    app.querySelector('#retry-page').onclick=()=>render({focus:true});trackedForm=null;app.style.minHeight='';restoreFocus(null);
  }finally{if(current===renderNumber){rendering=false;app.removeAttribute('aria-busy');progress.remove();}}
}
onAuthStateChanged(auth,async user=>{
  state.user=user;state.profile=null;
  if(user){try{state.profile=await api('profile');}catch(error){state.authError=error.message;}}
  state.authReady=true;if(location.pathname.startsWith('/admin'))render();
});
render();
