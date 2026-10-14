import { hasPermission } from '../../functions/src/permissions.js';
import { esc, icon, button, date, empty, modal, refreshIcons } from './ui.js';
import './absence-report.css';

const allowed=ctx=>hasPermission(ctx.state.profile,'events');
const onPage=()=>location.pathname.replace(/\/$/,'')==='/admin/absences';
const current=(ctx,view)=>onPage()&&allowed(ctx)&&ctx.state.absenceReportView===view&&ctx.state.user===view.user&&ctx.state.profile===view.profile&&location.search===view.search;
const defaults=()=>({search:'',eventId:'all',minimum:1,sort:'count'});
const collator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
const eventDate=event=>event?.startsAt?date(event.startsAt,true):'일정 미입력';

export function absenceRows(report,filters=defaults()){
 const events=new Map(report.events.map(event=>[event.id,event]));
 const needle=String(filters.search||'').trim().toLocaleLowerCase('ko-KR');
 const rows=report.rows.map(person=>{
  const records=person.records.filter(record=>filters.eventId==='all'||!filters.eventId||record.eventId===filters.eventId);
  const absences=records.filter(record=>record.attendance==='absent').sort((a,b)=>String(events.get(b.eventId)?.startsAt||'').localeCompare(String(events.get(a.eventId)?.startsAt||'')));
  return {...person,records,absences,count:absences.length,present:records.filter(record=>record.attendance==='present').length,unchecked:records.filter(record=>record.attendance==='unchecked').length,latest:events.get(absences[0]?.eventId)?.startsAt||''};
 }).filter(person=>person.count>=Number(filters.minimum||1)&&(!needle||[person.name,person.studentId,person.department].join(' ').toLocaleLowerCase('ko-KR').includes(needle)));
 return rows.sort((a,b)=>(filters.sort==='name'?collator.compare(a.name,b.name):filters.sort==='recent'?b.latest.localeCompare(a.latest)||b.count-a.count:b.count-a.count||b.latest.localeCompare(a.latest))||collator.compare(a.name,b.name)||collator.compare(a.studentId,b.studentId)||a.id.localeCompare(b.id));
}

function results(view){
 const rows=absenceRows(view.report,view.filters),events=new Map(view.report.events.map(event=>[event.id,event]));
 const eventCount=view.filters.eventId==='all'?events.size:Number(events.has(view.filters.eventId));
 const stats=[['결석한 부원',rows.length,'명'],['누적 결석',rows.reduce((sum,row)=>sum+row.count,0),'회'],['2회 이상 결석',rows.filter(row=>row.count>=2).length,'명'],['집계 행사',eventCount,'개']];
 return '<dl class="absence-summary">'+stats.map(([title,value,unit])=>'<div><dt>'+title+'</dt><dd>'+value+'<small>'+unit+'</small></dd></div>').join('')+'</dl><div class="absence-list-heading"><h2>부원별 결석</h2><p role="status" aria-live="polite">검색·필터 결과 '+rows.length+'명</p></div>'
  +(rows.length?'<div class="absence-list">'+rows.map(person=>'<button type="button" class="absence-member-row" data-action="absence-member" data-id="'+esc(person.id)+'" aria-haspopup="dialog"><span class="absence-person"><strong>'+esc(person.name)+'</strong><small>'+esc([person.studentId,person.department].filter(Boolean).join(' · ')||'명부 연결 정보 없음')+(person.removed?' · 명부에서 제거됨':'')+'</small></span><span class="absence-history"><span>'+person.absences.slice(0,2).map(record=>esc(events.get(record.eventId)?.title)).join(' · ')+(person.count>2?' 외 '+(person.count-2)+'개':'')+'</span><small>최근 결석 '+(person.latest?esc(date(person.latest)):'일정 미입력')+' · 출석 '+person.present+'회</small></span><span class="absence-count">'+person.count+'<small>회 결석</small></span>'+icon('arrow-right')+'</button>').join('')+'</div>':empty(view.report.events.length?'조건에 맞는 결석자가 없습니다':'집계할 종료 행사가 없습니다',view.report.events.length?'검색어나 행사, 최소 결석 횟수를 바꿔 확인해 주세요.':'행사가 끝나고 출석이 기록되면 이곳에서 확인할 수 있습니다.',button('필터 초기화','absence-reset',{class:'button secondary'})));
}

function content(view){
 const {report,filters}=view;
 const selected=(a,b)=>a===b?' selected':'';
 const unchecked=report.events.reduce((sum,event)=>sum+event.unchecked,0);
 return '<div class="absence-page" data-absence-page><div class="page-heading"><div><h1 id="page-title" tabindex="-1">결석자 관리</h1><p>학기별 결석 횟수와 빠진 행사를 함께 확인하세요.</p></div>'+button('새로고침','absence-refresh',{class:'button secondary',icon:'refresh-cw'})+'</div>'
  +'<div class="absence-filters"><label class="field"><span>학기</span><select data-absence-semester>'+report.semesters.map(semester=>'<option value="'+esc(semester)+'"'+selected(semester,report.semester)+'>'+esc(semester)+'</option>').join('')+'</select></label><label class="field absence-search"><span>부원 검색</span><input type="search" data-absence-search value="'+esc(filters.search)+'" placeholder="이름 · 학번 · 학과" autocomplete="off"></label><label class="field"><span>행사</span><select data-absence-filter="eventId"><option value="all">전체 종료 행사</option>'+report.events.map(event=>'<option value="'+esc(event.id)+'"'+selected(event.id,filters.eventId)+'>'+esc(event.title)+' · '+esc(eventDate(event))+'</option>').join('')+'</select></label><label class="field"><span>최소 결석</span><select data-absence-filter="minimum">'+[1,2,3,5].map(value=>'<option value="'+value+'"'+selected(value,filters.minimum)+'>'+value+'회 이상</option>').join('')+'</select></label><label class="field"><span>정렬</span><select data-absence-filter="sort">'+[['count','결석 많은 순'],['recent','최근 결석순'],['name','이름순']].map(([value,title])=>'<option value="'+value+'"'+selected(value,filters.sort)+'>'+title+'</option>').join('')+'</select></label></div>'
  +'<div data-absence-results>'+results(view)+'</div><p class="absence-updated">선택 학기 '+esc(report.semester)+' · '+esc(date(report.generatedAt,true))+' 조회'+(unchecked?' · 출석 미확인 '+unchecked+'건은 결석 횟수에서 제외':'')+'</p></div>';
}

export async function renderAbsenceReport(ctx){
 if(!allowed(ctx)){delete ctx.state.absenceReportView;return empty('출석 관리 권한이 필요합니다','행사·참가자·출석 관리 권한이 있는 운영진만 확인할 수 있습니다.');}
 const semester=new URLSearchParams(location.search).get('semester')||undefined;
 const previous=ctx.state.absenceReportView;
 const view={user:ctx.state.user,profile:ctx.state.profile,search:location.search,report:null,filters:defaults()};
 ctx.state.absenceReportView=view;
 try{
  const report=await ctx.api('absenceReport',semester?{semester}:{});
  if(!current(ctx,view))return '';
  view.report=report;
  if(previous?.user===view.user&&previous.report?.semester===report.semester)view.filters={...previous.filters};
  if(view.filters.eventId!=='all'&&!report.events.some(event=>event.id===view.filters.eventId))view.filters.eventId='all';
  return content(view);
 }catch(error){
  if(!current(ctx,view))return '';
  delete ctx.state.absenceReportView;
  throw error;
 }
}

function updateResults(ctx,view){
 if(!current(ctx,view))return;
 const target=document.querySelector('[data-absence-results]');
 if(target){target.innerHTML=results(view);refreshIcons();}
}

export function mountAbsenceReport(ctx,scope){
 const root=scope.querySelector('[data-absence-page]'),view=ctx.state.absenceReportView;
 if(!root||!view?.report||root.dataset.bound)return;
 root.dataset.bound='true';
 root.addEventListener('input',event=>{
  if(event.target.matches('[data-absence-search]')){view.filters.search=event.target.value;updateResults(ctx,view);}
 });
 root.addEventListener('change',async event=>{
  if(!current(ctx,view))return;
  if(event.target.matches('[data-absence-semester]')){
   try{await ctx.navigate('/admin/absences?semester='+encodeURIComponent(event.target.value));}catch(error){ctx.toast(error.message||'학기를 불러오지 못했습니다.');}return;
  }
  const key=event.target.dataset.absenceFilter;if(!key)return;
  view.filters[key]=key==='minimum'?Number(event.target.value):event.target.value;updateResults(ctx,view);
 });
}

export async function absenceReportAction(ctx,action,id){
 if(!allowed(ctx)||!onPage())return;
 if(action==='absence-refresh')return ctx.render();
 const view=ctx.state.absenceReportView;if(!view?.report||!current(ctx,view))return;
 if(action==='absence-reset'){
  view.filters=defaults();
  const root=document.querySelector('[data-absence-page]');
  root.querySelector('[data-absence-search]').value='';
  for(const control of root.querySelectorAll('[data-absence-filter]'))control.value=String(view.filters[control.dataset.absenceFilter]);
  updateResults(ctx,view);return;
 }
 if(action!=='absence-member')return;
 const person=absenceRows(view.report,view.filters).find(row=>row.id===id);if(!person)return;
 const events=new Map(view.report.events.map(event=>[event.id,event]));
 const body='<p class="absence-detail-identity">'+esc([person.studentId,person.department].filter(Boolean).join(' · ')||'명부 연결 정보 없음')+'</p><div class="absence-detail-summary"><strong>결석 '+person.count+'회</strong><span>출석 '+person.present+'회'+(person.unchecked?' · 미확인 '+person.unchecked+'회':'')+'</span></div><p class="absence-detail-note">'+esc(view.report.semester)+'학기 · 현재 선택한 행사 기준</p><ul class="absence-detail-list">'+person.absences.map(record=>{const event=events.get(record.eventId);return '<li><div><strong>'+esc(event.title)+'</strong><span>'+esc(eventDate(event))+'</span></div><a class="button secondary small" data-nav href="/admin/events/'+esc(event.id)+'">출석 확인 '+icon('arrow-up-right')+'</a></li>';}).join('')+'</ul>';
 const dialog=modal(person.name+' · 결석 내역',body,null,{contentOnly:true,wide:true});dialog.classList.add('absence-dialog');
}
