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
export const field = (name, title, value = '', options = {}) => {
  const required = options.required ? 'required' : '';
  const attrs = (options.min !== undefined ? ' min="'+options.min+'"' : '') + (options.max !== undefined ? ' max="'+options.max+'"' : '') + (options.step ? ' step="'+options.step+'"' : '');
  let input = '';
  if (options.choices) input = '<select name="'+name+'" '+required+'>'+options.choices.map(c => { const [v,l] = Array.isArray(c) ? c : [c,label(c)]; return '<option value="'+esc(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+esc(l)+'</option>'; }).join('')+'</select>';
  else if(options.type==='textarea') input = '<textarea name="'+name+'" rows="'+(options.rows||4)+'" maxlength="'+(options.maxLength||12000)+'" '+required+'>'+esc(value)+'</textarea>';
  else if(options.type==='checkbox') input = '<input type="checkbox" name="'+name+'" '+(value?'checked':'')+' '+required+'>';
  else input = '<input name="'+name+'" type="'+(options.type||'text')+'" value="'+esc(value)+'" '+required+attrs+' maxlength="'+(options.maxLength||200)+'" '+(options.autocomplete ? 'autocomplete="'+options.autocomplete+'"' : '')+'>';
  return '<label class="field '+(options.wide?'wide':'')+' '+(options.type==='checkbox'?'check-field':'')+'"><span>'+esc(title)+(options.required?' <b aria-label="필수">*</b>':'')+'</span>'+input+(options.hint?'<small>'+esc(options.hint)+'</small>':'')+'</label>';
};
export function modal(title, body, onSubmit, {wide=false, submit='저장'} = {}) {
  document.querySelector('#modal')?.remove();
  const dialog = document.createElement('dialog'); dialog.id='modal'; dialog.setAttribute('aria-labelledby','modal-title'); dialog.className=wide?'wide-dialog':'';
  dialog.innerHTML='<form id="modal-form"><header><div><h2 id="modal-title">'+esc(title)+'</h2></div><button type="button" class="icon-button" data-close aria-label="닫기">'+icon('x')+'</button></header><div class="form-grid">'+body+'</div><p class="form-error" role="alert"></p><footer><button type="button" class="button secondary" data-close>닫기</button>'+(onSubmit?'<button class="button" type="submit">'+esc(submit)+'</button>':'')+'</footer></form>';
  document.body.append(dialog);
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault(); if(!onSubmit)return; const submitButton=dialog.querySelector('[type=submit]'); submitButton.disabled=true;
    dialog.querySelector('.form-error').textContent='';
    try { await onSubmit(new FormData(event.target), event.target); dialog.close(); }
    catch(error) { dialog.querySelector('.form-error').textContent=error.message || '저장하지 못했습니다.'; }
    finally { submitButton.disabled=false; }
  };
  dialog.showModal(); refreshIcons(); return dialog;
}
export function refreshIcons(){createIcons({icons,attrs:{'stroke-width':1.7}});}
export function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('visible'),4000);}
export const empty = (title, message, action='') => '<div class="empty">'+icon('inbox')+'<h3>'+esc(title)+'</h3><p>'+esc(message)+'</p>'+action+'</div>';
export const textBlock = text => '<div class="prose">'+esc(text).replace(/\n/g,'<br>')+'</div>';
export function downloadCSV(name, rows) {
  const safe = v => {let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)) s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
