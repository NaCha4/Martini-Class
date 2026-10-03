import { icon, refreshIcons } from './ui.js';

export function filterListRows(app,state){
  const rows=Array.from(app.querySelectorAll('[data-searchable]'));let count=0;
  const query=state.search.trim().toLocaleLowerCase('ko-KR');
  const eventType=app.querySelector('[data-event-type]')?state.eventType:'all';
  const filtered=!!query||state.filter!=='all'||eventType!=='all';
  rows.forEach(el=>{const show=query.split(/\s+/).every(word=>el.dataset.searchable.toLocaleLowerCase('ko-KR').includes(word))&&(state.filter==='all'||el.dataset.status===state.filter)&&(eventType==='all'||el.dataset.type===eventType);el.hidden=!show;if(show)count++;});
  app.querySelectorAll('.work-lane').forEach(lane=>{lane.querySelector('h2 span').textContent=lane.querySelectorAll('.work-card:not([hidden])').length;});
  app.querySelectorAll('.event-section').forEach(section=>{
    const visible=section.querySelectorAll('.event-card-wrap:not([hidden])').length;
    section.hidden=!visible;
    section.querySelector('[data-event-section-count]').textContent=visible;
  });
  const counter=app.querySelector('#filtered-count'),toolbar=app.querySelector('.toolbar:has([data-search])');
  if(counter)counter.textContent='불러온 '+rows.length+'건 중 '+count+'건';
  if(!toolbar)return;
  let reset=toolbar.querySelector('[data-action=reset-filters]');
  if(!reset){reset=document.createElement('button');reset.type='button';reset.dataset.action='reset-filters';reset.className='button ghost filter-reset';reset.textContent='초기화';toolbar.append(reset);}
  reset.hidden=!filtered;
  let noResults=app.querySelector('#filter-empty');
  if(!noResults){noResults=document.createElement('section');noResults.id='filter-empty';noResults.className='empty filter-empty';noResults.innerHTML=icon('search')+'<h3>조건에 맞는 항목이 없습니다</h3><p>검색어를 줄이거나 상태 필터를 바꿔 보세요.</p><button type="button" class="button secondary" data-action="reset-filters">검색 조건 초기화</button>';toolbar.after(noResults);refreshIcons();}
  noResults.hidden=!!count||!filtered;
  const list=rows[0]?.closest('.table-wrap,.event-grid,.meeting-grid,.meeting-list,.work-board');if(list&&!list.closest('.event-section'))list.hidden=!count&&filtered;
}
