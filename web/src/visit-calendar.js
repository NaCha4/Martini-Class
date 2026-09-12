import { esc, date } from './ui.js';

const DAY=86400000;
export const koreaDay=(value=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const monthOffset=(month,offset)=>{const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);};
const dayLabel=day=>date(day+'T00:00:00+09:00');

function monthBody(month,selected){
 const today=koreaDay(),last=koreaDay(Date.now()+90*DAY),[year,m]=month.split('-').map(Number);
 const first=new Date(Date.UTC(year,m-1,1)).getUTCDay(),count=new Date(Date.UTC(year,m,0)).getUTCDate();
 let cells=Array.from({length:first},()=>'<span aria-hidden="true"></span>');
 for(let day=1;day<=count;day++){
  const value=month+'-'+String(day).padStart(2,'0'),isToday=value===today;
  cells.push('<button type="button" class="visit-day" data-visit-day="'+value+'" aria-label="'+year+'년 '+esc(dayLabel(value))+'" aria-pressed="'+(value===selected)+'"'+(isToday?' aria-current="date"':'')+(value<today||value>last?' disabled':'')+'><span>'+day+'</span><small>'+(isToday?'오늘':value===selected?'선택':'')+'</small></button>');
 }
 while(cells.length%7)cells.push('<span aria-hidden="true"></span>');
 return '<div class="visit-calendar-nav"><button type="button" class="icon-button" data-visit-month="-1" aria-label="이전 달"'+(month<=today.slice(0,7)?' disabled':'')+'>←</button><h4 aria-live="polite">'+year+'년 '+m+'월</h4><button type="button" class="icon-button" data-visit-month="1" aria-label="다음 달"'+(month>=last.slice(0,7)?' disabled':'')+'>→</button></div><div class="visit-weekdays" aria-hidden="true">'+['일','월','화','수','목','금','토'].map(day=>'<span>'+day+'</span>').join('')+'</div><div class="visit-days" role="group" aria-label="방문 날짜 선택">'+cells.join('')+'</div>';
}

export function visitCalendar(){
 return '<section class="visit-calendar" aria-labelledby="visit-calendar-title"><span class="member-section-kicker">STEP 01</span><h3 id="visit-calendar-title">언제 방문하나요?</h3><p>달력에서 방문할 날짜를 눌러 주세요.</p><input type="hidden" name="visitDate" value=""><div data-visit-calendar data-month="'+koreaDay().slice(0,7)+'">'+monthBody(koreaDay().slice(0,7),'')+'</div><p class="visit-calendar-hint">한국 시간 기준 · 오늘부터 90일 이내</p><div class="visit-selection" role="status" aria-live="polite"><strong data-visit-selected>방문 날짜를 선택해 주세요</strong><span data-visit-summary>날짜와 시간을 선택하면 여기에 표시됩니다.</span></div><p class="visit-approval-note">간부 승인 후, 신청한 부원과 함께 입장해 주세요.</p></section>';
}

export function visitSchedule(data){
 const selected=String(data.get('visitDate')||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(selected))throw new Error('달력에서 방문 날짜를 선택해 주세요.');
 return {startsAt:selected+'T'+String(data.get('startTime')||'')};
}

export function bindVisitCalendar(dialog){
 const calendar=dialog.querySelector('[data-visit-calendar]'),selected=dialog.querySelector('[name=visitDate]');
 const summary=()=>{
  dialog.querySelector('[data-visit-selected]').textContent=selected.value?dayLabel(selected.value)+' 방문':'방문 날짜를 선택해 주세요';
  const data=new FormData(dialog.querySelector('form')),start=data.get('startTime'),count=data.get('guestCount');
  dialog.querySelector('[data-visit-summary]').textContent=selected.value?[(start?start+' 시작':'방문 시간을 입력해 주세요'),count?'외부인 '+count+'명':''].filter(Boolean).join(' · '):'날짜와 시간을 선택하면 여기에 표시됩니다.';
 };
 calendar.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target||target.disabled)return;
  if(target.dataset.visitDay){selected.value=target.dataset.visitDay;calendar.innerHTML=monthBody(calendar.dataset.month,selected.value);calendar.querySelector('[data-visit-day="'+selected.value+'"]').focus({preventScroll:true});summary();}
  else if(target.dataset.visitMonth){const offset=Number(target.dataset.visitMonth);calendar.dataset.month=monthOffset(calendar.dataset.month,offset);calendar.innerHTML=monthBody(calendar.dataset.month,selected.value);const next=calendar.querySelector('[data-visit-month="'+offset+'"]');(next.disabled?calendar.querySelector('[data-visit-month="'+(-offset)+'"]'):next).focus({preventScroll:true});}
 });
 dialog.addEventListener('input',summary);
 dialog.addEventListener('change',summary);
}
