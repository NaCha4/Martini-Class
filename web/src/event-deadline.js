import { eventStatus } from '../../functions/src/event-status.js';
import { esc, label } from './ui.js';

export const eventDeadlineAttributes=event=>' data-event-status="'+esc(eventStatus(event))+'" data-event-closes-at="'+esc(event.closesAt||'')+'"';
export const eventStatusBadge=event=>'<span data-event-status-label class="badge '+esc(eventStatus(event))+'">'+esc(label(eventStatus(event)))+'</span>';

// Update only deadline-related UI so an open editor or application keeps its input.
export function updateEventDeadlines(root,now=Date.now()){
 let changed=false;
 for(const node of root.querySelectorAll('[data-event-status="open"][data-event-closes-at]')){
  if(eventStatus({status:'open',closesAt:node.dataset.eventClosesAt},now)!=='closed')continue;
  node.dataset.eventStatus='closed';
  if(node.dataset.status==='open')node.dataset.status='closed';
  for(const badge of node.querySelectorAll('[data-event-status-label]')){
   badge.textContent='모집 마감';
   badge.classList.remove('open','planned','waiting','approved','pending');
   badge.classList.add(badge.classList.contains('member-status')?'cancelled':'closed');
  }
  node.querySelector('.member-event-title')?.classList.add('is-closed');
  const heading=node.querySelector('#apply-title');if(heading)heading.textContent='모집 마감';
  const form=node.querySelector('form[data-form="apply"]');
  if(form){
   for(const submit of form.querySelectorAll('[type="submit"]')){submit.disabled=true;submit.textContent='모집 마감';}
  }
  const card=node.querySelector('.apply-card');
  if(card){
   let note=card.querySelector('.event-state-note,.notice-warning');
   if(!note){note=node.ownerDocument.createElement('p');note.className='notice-warning';note.setAttribute('role','status');card.insertBefore(note,form);}
   note.textContent='신청이 마감되었습니다. 기존 신청은 개인 확인 링크에서 확인할 수 있습니다.';
  }
  changed=true;
 }
 return changed;
}

export function watchEventDeadlines(root,onChange){
 const refresh=()=>{if(updateEventDeadlines(root))onChange();};
 const view=root.defaultView;
 let timer;
 const start=()=>{clearInterval(timer);refresh();timer=setInterval(refresh,1000);};
 view.addEventListener('focus',refresh);
 view.addEventListener('pageshow',start);
 view.addEventListener('pagehide',()=>clearInterval(timer));
 root.addEventListener('visibilitychange',()=>{if(!root.hidden)refresh();});
 start();
}
