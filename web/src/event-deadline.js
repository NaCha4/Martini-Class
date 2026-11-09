import { eventStatus } from '../../functions/src/event-status.js';
import { esc, label } from './ui.js';

export const eventDeadlineAttributes=event=>' data-event-status="'+esc(event.status)+'" data-event-closes-at="'+esc(event.closesAt||'')+'" data-event-ends-at="'+esc(event.endsAt||'')+'"';
export const eventStatusBadge=event=>'<span data-event-status-label class="badge '+esc(eventStatus(event))+'">'+esc(label(eventStatus(event)))+'</span>';

// Update only deadline-related UI so an open editor or application keeps its input.
export function updateEventDeadlines(root,now=Date.now()){
 let changed=false;
 for(const node of root.querySelectorAll('[data-event-status="open"],[data-event-status="closed"]')){
  const {eventStatus:previous,eventClosesAt:closesAt,eventEndsAt:endsAt}=node.dataset;
  const status=eventStatus({status:previous,closesAt,endsAt},now);
  if(status===previous)continue;
  const statusLabel=label(status);
  node.dataset.eventStatus=status;
  if(node.dataset.status)node.dataset.status=status;
  if(status==='completed'&&node.matches('.event-card-wrap')){
   const grid=root.querySelector('#event-completed .event-grid');
   const nextCard=Array.from(grid.children).find(card=>card.dataset.eventStartsAt<node.dataset.eventStartsAt);
   grid.insertBefore(node,nextCard||null);
  }
  for(const badge of node.querySelectorAll('[data-event-status-label]')){
   badge.textContent=statusLabel;
   badge.classList.remove('open','closed','planned','waiting','approved','pending');
   badge.classList.add(badge.classList.contains('member-status')?'cancelled':status);
  }
  node.querySelector('.member-event-title')?.classList.add('is-closed');
  const heading=node.querySelector('#apply-title');if(heading)heading.textContent=statusLabel;
  const form=node.querySelector('form[data-form="apply"]');
  if(form){
   for(const submit of form.querySelectorAll('[type="submit"]')){submit.disabled=true;submit.textContent=statusLabel;}
  }
  const card=node.querySelector('.apply-card');
  if(card){
   let note=card.querySelector('.event-state-note,.notice-warning');
   if(!note){note=node.ownerDocument.createElement('p');note.className='notice-warning';note.setAttribute('role','status');card.insertBefore(note,form);}
   note.textContent=status==='completed'?'진행이 끝난 행사입니다.':'신청이 마감되었습니다. 기존 신청은 개인 확인 링크에서 확인할 수 있습니다.';
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
