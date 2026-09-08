import './style.css';
import { api, auth, local, onAuthStateChanged } from './firebase.js';
import { esc, icon, refreshIcons, toast } from './ui.js';
import { renderPublic, publicAction, publicSubmit } from './public.js';
import { renderAdmin, adminAction, adminSubmit } from './admin.js';
export const state={profile:null,user:null,authReady:false,data:{},settings:{},search:'',filter:'all'};
export const ctx={state,api,toast,navigate,render};
const app=document.querySelector('#app');
let renderNumber=0;
export function navigate(path){document.querySelector('#modal')?.close();history.pushState({},'',path);state.search='';state.filter='all';render();window.scrollTo(0,0);}
window.addEventListener('popstate',()=>{document.querySelector('#modal')?.close();state.search='';state.filter='all';render();});
document.addEventListener('click',async event=>{
  const link=event.target.closest('a[data-nav]');
  if(link && !event.ctrlKey && !event.metaKey){event.preventDefault();navigate(link.getAttribute('href'));return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  try { if(location.pathname.startsWith('/admin')) await adminAction(ctx,target.dataset.action,target.dataset.id,target); else await publicAction(ctx,target.dataset.action,target.dataset.id,target); }
  catch(error){toast(error.message);}
});
document.addEventListener('submit',async event=>{
  if(!event.target.matches('form[data-form]'))return;event.preventDefault();
  const button=event.target.querySelector('[type=submit]');const alert=event.target.querySelector('[role=alert]');if(button)button.disabled=true;if(alert)alert.textContent='';
  try{const data=new FormData(event.target);if(location.pathname.startsWith('/admin'))await adminSubmit(ctx,event.target.dataset.form,data,event.target);else await publicSubmit(ctx,event.target.dataset.form,data,event.target);}
  catch(error){const message=error.code?.startsWith('auth/')?'이메일과 비밀번호를 확인해 주세요.':error.message;if(alert)alert.textContent=message;else toast(message);}
  finally{if(button)button.disabled=false;}
});
document.addEventListener('input',event=>{if(event.target.matches('[data-search]')){state.search=event.target.value;filterRows();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-filter]')){state.filter=event.target.value;filterRows();}});
function filterRows(){let count=0;document.querySelectorAll('[data-searchable]').forEach(el=>{const show=el.dataset.searchable.toLowerCase().includes(state.search.toLowerCase())&&(state.filter==='all'||el.dataset.status===state.filter);el.hidden=!show;if(show)count++;});const counter=document.querySelector('#filtered-count');if(counter)counter.textContent=count+'건';}
export async function render(){
 const current=++renderNumber;
 app.innerHTML='<div class="loading">'+icon('loader-circle')+'<span>불러오는 중</span></div>';refreshIcons();
 try{const html=location.pathname.startsWith('/admin')?await renderAdmin(ctx):await renderPublic(ctx);if(current!==renderNumber)return;app.innerHTML=html;refreshIcons();const search=app.querySelector('[data-search]'),filter=app.querySelector('[data-filter]');if(search)search.value=state.search;if(filter)filter.value=state.filter;filterRows();document.title=location.pathname==='/'?'Martini · 마티니':(app.querySelector('h1')?.textContent||'마티니')+' · Martini';}
 catch(error){if(current!==renderNumber)return;app.innerHTML='<main class="connection-page"><a href="/" data-nav class="brand">MARTINI</a><h1>연결을 확인해 주세요</h1><p>'+esc(error.message)+'</p><button class="button" onclick="location.reload()">다시 시도</button></main>';}
}
onAuthStateChanged(auth,async user=>{
 state.user=user;state.profile=null;
 if(user){try{state.profile=await api('profile');}catch(error){state.authError=error.message;}}
 state.authReady=true;if(location.pathname.startsWith('/admin'))render();
});
render();
