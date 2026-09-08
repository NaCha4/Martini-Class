import { createIcons, ArrowRight, ArrowUpRight, ArrowLeft, Check, X, CircleX, CalendarDays, UsersRound, Package, NotebookPen, ListChecks, Wallet, Settings2, ShieldCheck, History, LayoutDashboard, LogOut, Sprout, Search, Inbox, Plus, Pencil, Copy, Download, UserPlus, GraduationCap, Users, Sparkles, Martini, MapPin, List, Link, LoaderCircle, Menu, Megaphone } from 'lucide';
const icons={ArrowRight, ArrowUpRight, ArrowLeft, Check, X, CircleX, CalendarDays, UsersRound, Package, NotebookPen, ListChecks, Wallet, Settings2, ShieldCheck, History, LayoutDashboard, LogOut, Sprout, Search, Inbox, Plus, Pencil, Copy, Download, UserPlus, GraduationCap, Users, Sparkles, Martini, MapPin, List, Link, LoaderCircle, Menu, Megaphone};
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const icon = name => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
export const money = n => Number(n || 0).toLocaleString('ko-KR') + '원';
export const date = (value, time = false) => value ? new Intl.DateTimeFormat('ko-KR', { month:'long', day:'numeric', weekday:'short', ...(time ? {hour:'2-digit', minute:'2-digit'} : {}), timeZone:'Asia/Seoul' }).format(new Date(value)) : '일정 미정';
export const labels = {income:'수입',expense:'지출',dues:'학기 회비',refund:'환불',discussed:'논의 완료',draft:'초안',open:'모집 중',closed:'모집 마감',completed:'진행 완료',cancelled:'취소',active:'활동',inactive:'휴동',withdrawn:'탈퇴',graduated:'졸업',paid:'납부 완료',unpaid:'미납',requested:'확인 요청',none:'해당 없음',refund_pending:'환불 대기',refunded:'환불 완료',partial:'부분 환불',registered:'참가 등록',waiting:'대기',offered:'승급 제안',expired:'만료',present:'출석',absent:'불참',unchecked:'미확인',planned:'예정',in_progress:'진행 중',final:'확정',proposed:'제안',approved:'결정',done:'완료',deferred:'보류',chair:'회장단',education:'교육부',execution:'집행부',finance:'총무부',publicity:'홍보부',owner:'운영 책임자',class:'칵테일 교육',meeting:'총회',social:'친목 모임',workshop:'워크숍',other:'기타',spirit:'주류',ingredient:'재료',supply:'소모품',tool:'도구',decision:'결정 사항',action:'후속 업무'};
export const label = value => labels[value] || value || '—';
export const badge = value => '<span class="badge '+esc(value)+'">'+esc(label(value))+'</span>';
export const button = (text, action, opts = {}) => '<button type="button" class="'+(opts.class || 'button')+'" data-action="'+esc(action)+'" '+(opts.id ? 'data-id="'+esc(opts.id)+'"' : '')+' '+(opts.disabled ? 'disabled' : '')+'>'+(opts.icon ? icon(opts.icon) : '')+esc(text)+'</button>';

let fieldSequence=0;
export const field = (name, title, value = '', options = {}) => {
  const id=options.id || 'field-'+(++fieldSequence);
  const attributes={id,name,required:options.required?true:undefined,min:options.min,max:options.max,step:options.step,minlength:options.minLength,
    autocomplete:options.autocomplete,inputmode:options.inputMode||options.inputmode,placeholder:options.placeholder,pattern:options.pattern,
    readonly:options.readOnly?true:undefined,spellcheck:options.spellcheck===undefined?undefined:String(options.spellcheck),'aria-describedby':options.hint?id+'-hint':undefined};
  const attrs=Object.entries(attributes).filter(([,v])=>v!==undefined&&v!==null&&v!==false).map(([k,v])=>v===true?' '+k:' '+k+'="'+esc(v)+'"').join('');
  let input;
  if(options.choices) input='<select'+attrs+'>'+options.choices.map(c=>{const [v,l]=Array.isArray(c)?c:[c,label(c)];return '<option value="'+esc(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+esc(l)+'</option>';}).join('')+'</select>';
  else if(options.type==='textarea') input='<textarea'+attrs+' rows="'+(options.rows||4)+'" maxlength="'+(options.maxLength||12000)+'">'+esc(value)+'</textarea>';
  else if(options.type==='checkbox') input='<input type="checkbox"'+attrs+(value?' checked':'')+'>';
  else {
    input='<input'+attrs+' type="'+esc(options.type||'text')+'" value="'+esc(value)+'" maxlength="'+(options.maxLength||200)+'">';
    if(options.type==='password') input='<div class="input-with-action">'+input+'<button type="button" class="password-toggle" data-password-toggle aria-controls="'+esc(id)+'" aria-pressed="false">표시<span class="sr-only">: 비밀번호</span></button></div>';
  }
  return '<label for="'+esc(id)+'" class="field '+(options.wide?'wide ':'')+(options.type==='checkbox'?'check-field':'')+'"><span>'+esc(title)+(options.required?' <b aria-label="필수">*</b>':'')+'</span>'+input+(options.hint?'<small id="'+esc(id)+'-hint">'+esc(options.hint)+'</small>':'')+'</label>';
};
export function formSignature(form) {
  return JSON.stringify(Array.from(new FormData(form),([key,value])=>[key,typeof value==='string'?value:value.name]));
}
export function captureFocus(element=document.activeElement) {
  if(!element||element===document.body)return null;
  return {element,id:element.id,name:element.getAttribute('name'),action:element.dataset?.action,record:element.dataset?.id,href:element.getAttribute('href'),
    search:element.matches('[data-search]'),filter:element.matches('[data-filter]'),
    start:element.selectionStart,end:element.selectionEnd};
}
export function restoreFocus(saved,{fallback=true}={}) {
  if(document.querySelector('dialog[open]'))return;
  const visible=e=>e&&e.isConnected&&e.getClientRects().length&&!e.disabled&&!e.closest('[inert]');
  let target=saved?.element;
  if(!visible(target)&&saved) {
    target=saved.search?document.querySelector('[data-search]'):saved.filter?document.querySelector('[data-filter]'):saved.id?document.getElementById(saved.id):null;
    if(!visible(target))target=Array.from(document.querySelectorAll('button,a,input,select,textarea')).find(e=>
      saved.action?e.dataset.action===saved.action&&e.dataset.id===saved.record:saved.name?e.getAttribute('name')===saved.name:saved.href?e.getAttribute('href')===saved.href:false);
  }
  if(!visible(target)&&fallback)target=document.querySelector('#app h1')||document.querySelector('#app main');
  if(!visible(target))return;
  if(!target.matches('button,a,input,select,textarea,[tabindex]'))target.tabIndex=-1;
  target.focus({preventScroll:true});
  if(saved?.start!=null&&target.setSelectionRange)try{target.setSelectionRange(saved.start,saved.end);}catch{}
}
export function busyControl(control,message='처리 중…') {
  if(!control)return ()=>{};
  const original={html:control.innerHTML,disabled:control.disabled,width:control.style.minWidth};
  control.disabled=true;control.setAttribute('aria-busy','true');
  const timer=setTimeout(()=>{if(control.isConnected){control.style.minWidth=control.getBoundingClientRect().width+'px';control.textContent=message;}},150);
  return ()=>{clearTimeout(timer);control.disabled=original.disabled;control.removeAttribute('aria-busy');control.innerHTML=original.html;control.style.minWidth=original.width;};
}
export function showFormError(form,message) {
  const alert=form.querySelector('.form-error,[role=alert]');
  if(!alert){toast(message);return;}
  alert.textContent=message;alert.tabIndex=-1;alert.focus({preventScroll:true});alert.scrollIntoView({block:'nearest',behavior:'auto'});
}
export async function closeModal({discard=false}={}) {
  const dialog=document.querySelector('#modal[open]');
  return dialog?dialog.requestClose(discard):true;
}
export function modal(title, body, onSubmit, {wide=false,submit='저장',submitClass='button',busyText='저장 중…'}={}) {
  const previous=document.querySelector('#modal');
  previous?.close();previous?.remove();
  const opener=captureFocus(),openedPath=location.pathname;
  const dialog=document.createElement('dialog');
  dialog.id='modal';dialog.setAttribute('aria-labelledby','modal-title');dialog.setAttribute('aria-modal','true');dialog.className=wide?'wide-dialog':'';
  dialog.innerHTML='<form id="modal-form"><header><div><h2 id="modal-title" tabindex="-1">'+esc(title)+'</h2></div><button type="button" class="icon-button" data-close aria-label="닫기">'+icon('x')+'</button></header><div class="dialog-scroll"><div class="form-grid">'+body+'</div><p class="form-error" role="alert"></p></div><footer><p class="dialog-status" role="status"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>닫기</button>'+(onSubmit?'<button class="'+esc(submitClass)+'" type="submit">'+esc(submit)+'</button>':'')+'</div></footer></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),scroll=dialog.querySelector('.dialog-scroll'),actions=dialog.querySelector('.dialog-actions');
  let baseline=formSignature(form),saving=false,resolveClose=null;
  dialog.isDirty=()=>!!onSubmit&&formSignature(form)!==baseline;
  dialog.isSaving=()=>saving;
  const releaseConfirmation=accepted=>{
    dialog.querySelector('#discard-changes')?.remove();scroll.inert=false;actions.inert=false;
    const resolve=resolveClose;resolveClose=null;resolve?.(accepted);
  };
  dialog.requestClose=async(discard=false)=>{
    if(!dialog.open)return true;
    if(discard){releaseConfirmation(true);dialog.close();return true;}
    if(saving){dialog.querySelector('.dialog-status').textContent='저장 중입니다. 완료될 때까지 기다려 주세요.';return false;}
    if(!dialog.isDirty()){dialog.close();return true;}
    if(resolveClose)return false;
    const savedFocus=captureFocus();
    const notice=document.createElement('section');notice.id='discard-changes';notice.className='discard-confirmation';notice.setAttribute('role','alert');
    notice.innerHTML='<h3>작성 중인 내용이 있습니다</h3><p>저장하지 않고 닫으면 변경 내용이 사라집니다.</p><div><button type="button" class="button secondary" data-keep-editing>계속 작성</button><button type="button" class="button danger" data-discard-editing>변경사항 버리기</button></div>';
    dialog.querySelector('header').after(notice);scroll.inert=true;actions.inert=true;
    const result=new Promise(resolve=>{resolveClose=resolve;});
    notice.querySelector('[data-keep-editing]').onclick=()=>{releaseConfirmation(false);const el=savedFocus?.element;if(el?.isConnected)el.focus({preventScroll:true});};
    notice.querySelector('[data-discard-editing]').onclick=()=>{releaseConfirmation(true);dialog.close();};
    notice.querySelector('[data-keep-editing]').focus();return result;
  };
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.requestClose());
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(resolveClose){releaseConfirmation(false);dialog.querySelector('#modal-title').focus();}else dialog.requestClose();});
  dialog.addEventListener('close',()=>{
    releaseConfirmation(false);dialog.remove();
    if(!document.querySelector('dialog[open]')){document.documentElement.classList.remove('dialog-open');if(location.pathname===openedPath)restoreFocus(opener);}
  },{once:true});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!onSubmit||saving)return;
    saving=true;scroll.inert=true;const restore=busyControl(form.querySelector('[type=submit]'),busyText);
    form.setAttribute('aria-busy','true');form.querySelector('.form-error').textContent='';
    try{await onSubmit(new FormData(form),form);baseline=formSignature(form);dialog.close();}
    catch(error){scroll.inert=false;showFormError(form,error.message||'저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.');}
    finally{saving=false;scroll.inert=false;restore();form.removeAttribute('aria-busy');dialog.querySelector('.dialog-status').textContent='';}
  });
  if(!CSS.supports('scrollbar-gutter:stable'))document.documentElement.style.setProperty('--scrollbar-compensation',(innerWidth-document.documentElement.clientWidth)+'px');
  document.documentElement.classList.add('dialog-open');dialog.showModal();refreshIcons();
  dialog.querySelector('#modal-title').focus({preventScroll:true});
  queueMicrotask(()=>{baseline=formSignature(form);});
  return dialog;
}
export function refreshIcons(){createIcons({icons,attrs:{'stroke-width':1.7}});}
export function toast(message){
  const el=document.querySelector('#toast');if(!el)return;const opener=captureFocus();
  el.innerHTML='<span>'+esc(message)+'</span><button type="button" class="toast-dismiss" aria-label="알림 닫기">'+icon('x')+'</button>';
  el.classList.add('visible');refreshIcons();clearTimeout(window.toastTimer);
  const hide=()=>{const focused=el.contains(document.activeElement);el.classList.remove('visible');clearTimeout(window.toastTimer);if(focused)restoreFocus(opener);};
  const schedule=()=>{clearTimeout(window.toastTimer);window.toastTimer=setTimeout(hide,Math.min(12000,Math.max(6000,String(message).length*70)));};
  el.querySelector('button').onclick=hide;
  el.onmouseenter=el.onfocusin=()=>clearTimeout(window.toastTimer);
  el.onmouseleave=el.onfocusout=()=>{if(!el.contains(document.activeElement))schedule();};
  schedule();
}
export const empty = (title, message, action='') => '<div class="empty">'+icon('inbox')+'<h3>'+esc(title)+'</h3><p>'+esc(message)+'</p>'+action+'</div>';
export const textBlock = text => '<div class="prose">'+esc(text).replace(/\n/g,'<br>')+'</div>';
export function downloadCSV(name, rows) {
  const safe = v => {let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)) s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
