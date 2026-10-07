import './style.css';
import { api } from './api.js';
import { esc, icon, refreshIcons, toast, closeModal, formSignature, captureFocus, restoreFocus } from './ui.js';
import { renderScreen, mountScreen, prepareScreenRender, isAdminScreen } from './screen-router.js';
import { filterListRows } from './list-filters.js';
import { isMemberRoute, getMemberSessionKey } from './member-session.js';
import { clearAdminData } from './admin-session.js';
import { isRequestViewer } from '../../functions/src/permissions.js';
import { createNavigation } from './app-navigation.js';
import { createSessionLifecycle } from './app-session.js';
import { bindAppEvents } from './app-events.js';

export const state={profile:null,user:null,authReady:false,data:{},settings:{},search:'',filter:'all',eventType:'all'};
export const ctx={state,api,toast,navigate,render,mayLeave};
const app=document.querySelector('#app');
const runtime={rendering:false,trackedForm:null,renderedMemberSession:''};
let renderNumber=0;
const navigation=createNavigation(ctx,runtime);
const sessions=createSessionLifecycle(ctx,app,runtime);
export function navigate(...args){return navigation.navigate(...args);}
function mayLeave(...args){return navigation.mayLeave(...args);}
const filterRows=()=>filterListRows(app,state);
bindAppEvents(ctx,app,runtime,filterRows);
export async function render({focus=false,scroll,pageData}={}) {
  prepareScreenRender();
  const current=++renderNumber,savedFocus=captureFocus(),savedScroll=scrollY;
  const session=isMemberRoute()?getMemberSessionKey(ctx):'',memberLocked=isMemberRoute()&&(!session||session!==runtime.renderedMemberSession);
  const adminLocked=isAdminScreen()&&(!state.profile||isRequestViewer(state.profile));
  if(memberLocked)void closeModal({discard:true});
  runtime.rendering=true;app.setAttribute('aria-busy','true');
  let progress=document.querySelector('#page-progress');
  if(!progress){progress=document.createElement('div');progress.id='page-progress';progress.setAttribute('role','status');progress.innerHTML='<span class="sr-only">화면을 불러오고 있습니다.</span>';document.body.append(progress);}
  const hasView=!!app.querySelector('h1');
  if(!hasView||memberLocked||adminLocked){app.innerHTML='<div class="loading" role="status">'+icon('loader-circle')+'<span>불러오는 중</span></div>';refreshIcons();}
  else{
    app.style.minHeight=app.getBoundingClientRect().height+'px';
    const view=app.querySelector('.workspace-content,main');if(view)view.inert=true;
  }
  try{
    await sessions.ensureAdminAuth();
    if(current!==renderNumber)return;
    let html=await renderScreen(ctx,{pageData});
    if(current===renderNumber&&!html&&isMemberRoute())html=await renderScreen(ctx);
    if(current!==renderNumber)return;
    if(isMemberRoute()&&!getMemberSessionKey(ctx))await closeModal({discard:true});
    app.innerHTML=html;runtime.renderedMemberSession=isMemberRoute()?getMemberSessionKey(ctx):'';refreshIcons();
    navigation.syncUrl();
    const search=app.querySelector('[data-search]'),filter=app.querySelector('[data-filter]');
    if(search)search.value=state.search;if(filter)filter.value=state.filter;const type=app.querySelector('[data-event-type]');if(type)type.value=state.eventType;filterRows();
    document.title=location.pathname==='/'?'Martini · 마티니':(app.querySelector('h1')?.textContent||'마티니')+' · Martini';
    const application=app.querySelector('form[data-form=apply],form[data-form^="member-"]:not([data-form=member-login])');
    runtime.trackedForm=application?{node:application,signature:formSignature(application)}:null;
    app.style.minHeight='';
    window.scrollTo({top:scroll??savedScroll,behavior:'instant'});
    if(focus)restoreFocus(null);else restoreFocus(savedFocus,{fallback:false});
    if(isMemberRoute()&&state.memberScrollTarget&&app.querySelector('.member-shell')){
      const section=document.getElementById(state.memberScrollTarget);delete state.memberScrollTarget;
      if(section){section.scrollIntoView({block:'start',behavior:'instant'});section.focus({preventScroll:true});}
    }
    mountScreen(ctx,app);
  }catch(error){
    if(current!==renderNumber)return;
    if(isAdminScreen()){clearAdminData(state);await closeModal({discard:true});}
    app.innerHTML='<main class="connection-page"><a href="/" data-nav class="brand">MARTINI</a><h1 tabindex="-1">연결을 확인해 주세요</h1><p>'+esc(error.message)+'</p><button class="button" type="button" id="retry-page">다시 시도</button></main>';
    app.querySelector('#retry-page').onclick=()=>render({focus:true});runtime.trackedForm=null;app.style.minHeight='';restoreFocus(null);
  }finally{if(current===renderNumber){runtime.rendering=false;app.removeAttribute('aria-busy');progress.remove();sessions.schedule();}}
}

void render();
