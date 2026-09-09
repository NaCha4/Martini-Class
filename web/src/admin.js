import { hasPermission, permissionLabels } from '../../functions/src/permissions.js';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, field, icon, badge, button, date, money, label, empty, textBlock, refreshIcons, modal } from './ui.js';
import { auth, signInWithEmailAndPassword, signOut, local, sendPasswordResetEmail } from './firebase.js';
import { handleAdminAction, handleAdminSubmit } from './admin-forms.js';
const navigation=[['','layout-dashboard','오늘의 운영'],['events','calendar-days','행사 · 교육'],['members','users-round','부원 명부'],['inventory','package','재고 관리'],['finance','wallet','회비 · 정산'],['meetings','notebook-pen','회의록'],['decisions','list-checks','결정 · 할 일'],['content','megaphone','공지 · 활동'],['settings','settings-2','학기 · 운영 설정'],['roles','list-checks','역할 관리'],['admins','shield-check','임원 배정'],['privacy','shield-check','학기말 정보 정리'],['audit','history','변경 이력']];
const can=(ctx,kind)=>hasPermission(ctx.state.profile,['roles','privacy'].includes(kind)?'admins':kind==='events'?'eventRead':kind);
const scopeEvent=ctx=>hasPermission(ctx.state.profile,'events');
const memberSortFields=[['name','이름별'],['grade','학년별'],['department','학과별'],['studentId','학번별']];
const memberCollator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
function compareMembers(a,b,field='name',direction='asc'){
 const left=String(a[field]??'').trim(),right=String(b[field]??'').trim();
 // Keep missing values last in either direction; resolve ties consistently.
 if(!left!==!right)return left?-1:1;
 return memberCollator.compare(left,right)*(direction==='desc'?-1:1)||memberCollator.compare(a.name||'',b.name||'')||memberCollator.compare(a.studentId||'',b.studentId||'')||memberCollator.compare(a.id,b.id);
}
function memberSortControls(ctx){
 return '<label class="member-sort">정렬 기준<select id="member-sort-field" aria-label="정렬 기준" data-member-sort="field">'+memberSortFields.map(([value,title])=>'<option value="'+value+'"'+((ctx.state.memberSortField||'name')===value?' selected':'')+'>'+title+'</option>').join('')+'</select></label><label class="member-sort">정렬 방향<select id="member-sort-direction" aria-label="정렬 방향" data-member-sort="direction"><option value="asc"'+(ctx.state.memberSortDirection!=='desc'?' selected':'')+'>오름차순</option><option value="desc"'+(ctx.state.memberSortDirection==='desc'?' selected':'')+'>내림차순</option></select></label>';
}
export function sortMemberRows(ctx,control){
 if(control.dataset.memberSort==='field')ctx.state.memberSortField=memberSortFields.some(([value])=>value===control.value)?control.value:'name';
 else ctx.state.memberSortDirection=control.value==='desc'?'desc':'asc';
 const body=document.querySelector('#app tbody');if(!body)return;
 const member=tr=>ctx.state.data.members[tr.querySelector('[data-action="member-view"]').dataset.id];
 body.append(...Array.from(body.rows).sort((a,b)=>compareMembers(member(a),member(b),ctx.state.memberSortField,ctx.state.memberSortDirection)));
}

export const rosterSemester=ctx=>/^20\d{2}-[12]$/.test(new URLSearchParams(location.search).get('semester')||'')&&location.pathname.replace(/\/$/,'')==='/admin/members'?new URLSearchParams(location.search).get('semester'):ctx.state.settings.semester;
function memberParams(ctx,kind,params){if(kind!=='members')return params;const semester=params.semester||rosterSemester(ctx),removed=false;if(ctx.state.memberSemester!==semester||ctx.state.memberRemoved!==removed){ctx.state.data.members={};if(ctx.state.pages)delete ctx.state.pages.members;ctx.state.memberSemester=semester;ctx.state.memberRemoved=removed;}return {...params,semester,removed};}
export async function read(ctx,kind,params={}){
 params=memberParams(ctx,kind,params);
 const result=await ctx.api('read',{kind,...params});
 ctx.state.data[kind]||={};result.rows.forEach(row=>ctx.state.data[kind][row.id]=row);
 ctx.state.pages||={};if(!params.recordId&&!params.eventId&&!params.revisions)ctx.state.pages[kind]=result;
 return result;
}
export async function readAll(ctx,kind,params={}){
 params=memberParams(ctx,kind,params);
 const rows=[];let cursor;
 do{const page=await ctx.api('read',{kind,...params,...(cursor?{cursor}:{})});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 ctx.state.data[kind]||={};rows.forEach(r=>ctx.state.data[kind][r.id]=r);ctx.state.pages||={};ctx.state.pages[kind]={rows,nextCursor:null};return {rows,nextCursor:null};
}
function heading(eyebrow,title,description,action=''){return '<div class="page-heading"><div><h1 id="page-title" tabindex="-1">'+title+'</h1><p>'+description+'</p></div>'+action+'</div>';}
function toolbar(kind,choices=[],extra=''){
 const inventory=kind==='inventory',config={events:['행사 이름 · 장소','행사'],members:['이름 · 학번 · 연락처 · 학과','부원'],inventory:['품목 이름 · 보관 위치','품목'],meetings:['회의 이름 · 안건 · 내용','회의'],decisions:['제목 · 내용 · 담당자','결정 · 할 일'],finance:['내용 · 메모','정산'],content:['제목 · 내용','게시글'],admins:['이름 · 역할','임원'],audit:['작업 · 처리자','변경 이력'],applications:['신청자 이름','신청자']}[kind]||['이름 · 내용','목록'];
 return '<div class="toolbar"><label class="search-box">'+icon('search')+'<input type="search" data-search placeholder="'+config[0]+' 검색" aria-label="'+config[1]+' 검색" autocomplete="off" spellcheck="false" aria-describedby="filtered-count"></label>'+(choices.length?'<select data-filter aria-label="'+(inventory?'분류':'상태')+' 필터"><option value="all">전체 '+(inventory?'분류':'상태')+'</option>'+choices.map(c=>'<option value="'+c+'">'+esc(label(c))+'</option>').join('')+'</select>':'')+extra+'<span id="filtered-count" class="muted" role="status" aria-live="polite" aria-atomic="true"></span></div>';
}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
function row(record,search,cells,headers,status=record.status){return '<tr data-searchable="'+esc(search)+'" data-status="'+esc(status||'')+'">'+cells.map((cell,i)=>'<td data-label="'+esc(headers[i])+'">'+cell+'</td>').join('')+'</tr>';}
function next(ctx,kind){return ctx.state.pages?.[kind]?.nextCursor?'<div class="pagination">'+button('기록 100개 더 보기','load-more',{id:kind,class:'button secondary'})+'</div>':'';}
function statusOverview(events){return events.filter(e=>!['cancelled','completed','draft'].includes(e.status)&&Date.parse(e.endsAt)>=Date.now());}
async function home(ctx){
 const kinds=['events','members','inventory','decisions'].filter(k=>can(ctx,k));
 const loaded=await Promise.all(kinds.map(async k=>[k,(await readAll(ctx,k)).rows.filter(r=>k==='inventory'||r.semester===ctx.state.settings.semester)]));const data=Object.fromEntries(loaded);
 const events=statusOverview(data.events||[]).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 const tasks=(data.decisions||[]).filter(d=>d.type==='action'&&!['done','deferred'].includes(d.status));
 const items=(data.inventory||[]).filter(i=>total(i)<i.minimum);
 const metrics=[['calendar-days','다가오는 행사',events.length,'events'],['users-round','등록 부원',(data.members||[]).filter(m=>!m.anonymizedAt).length,'members'],['package','확인할 재고',items.length,'inventory'],['list-checks','진행 중 할 일',tasks.length,'decisions']].filter(m=>can(ctx,m[3]));
 const setup=can(ctx,'settings')&&(!ctx.state.settings.id||(!ctx.state.settings.contact&&!openChatUrl(ctx.state.settings.joinUrl)))?'<section class="operations-note">'+icon('settings-2')+'<div><h2>모집 전에 운영 정보를 확인해 주세요</h2><p>현재 학기와 동아리 문의 채널 또는 가입 오픈채팅 링크를 확인해 주세요.</p></div><a href="/admin/settings" data-nav class="button secondary">운영 설정 확인</a></section>':'';
 return heading('YOUR CLUB, AT A GLANCE','운영 현황','이번 학기의 행사, 부원, 재고와 진행 중인 업무입니다.')+setup+
 '<div class="metrics">'+metrics.map(([i,t,n,k])=>'<a data-nav href="/admin/'+k+'" class="metric"><span class="metric-icon">'+icon(i)+'</span><div><span>'+t+'</span><strong>'+n+'<small>'+(k==='members'?'명':'건')+'</small></strong></div>'+icon('arrow-up-right')+'</a>').join('')+'</div><p class="data-caption">현재 학기의 전체 기록 기준입니다.</p>'+
 '<div class="dashboard-grid">'+(can(ctx,'events')?'<section class="panel"><div class="panel-title"><h2>다가오는 행사</h2><a data-nav href="/admin/events">전체 보기 '+icon('arrow-right')+'</a></div>'+(events.length?events.slice(0,4).map(e=>'<a data-nav href="/admin/events/'+e.id+'" class="schedule-row"><div class="date-tile"><b>'+new Date(e.startsAt).getDate()+'</b><small>'+new Intl.DateTimeFormat('ko-KR',{month:'short'}).format(new Date(e.startsAt))+'</small></div><div><h3>'+esc(e.title)+'</h3><p>'+esc(date(e.startsAt,true))+' · '+esc(e.location)+'</p></div>'+badge(e.status)+'</a>').join(''):empty('예정된 행사가 없습니다',scopeEvent(ctx)?'행사 일정과 신청 기간을 정하고 모집을 준비하세요.':'행사 담당자가 일정을 등록하면 이곳에서 확인할 수 있습니다.',scopeEvent(ctx)?button('첫 행사 준비','event-edit',{class:'button secondary'}):''))+'</section>':'')+
 '<section class="panel"><div class="panel-title"><h2>함께 처리할 일</h2><a data-nav href="/admin/decisions">전체 보기 '+icon('arrow-right')+'</a></div>'+(tasks.length?tasks.slice(0,5).map(d=>'<button class="task-row" data-action="decision-view" data-id="'+d.id+'"><span class="task-dot"></span><div><h3>'+esc(d.title)+'</h3><p>'+esc(d.owner||'담당 미정')+' · '+(d.dueAt?date(d.dueAt):'기한 미정')+'</p></div>'+badge(d.status)+'</button>').join(''):empty('남은 할 일이 없습니다','회의에서 정한 후속 업무와 담당자를 기록하세요.',button('결정 · 업무 추가','decision-edit',{class:'button secondary'})))+'</section></div>'+
 '<section class="operations-note">'+icon('notebook-pen')+'<div><h3>회의와 결정 기록</h3><p>회의 안건과 결정 사항을 작성하고 담당자와 처리 기한을 지정하세요.</p></div><a href="/admin/meetings" data-nav class="button secondary">회의록 열기 '+icon('arrow-right')+'</a></section>';
}
export const total=item=>item.unit==='bottle'?item.quantity*item.size+Object.values(item.bottles||{}).reduce((sum,p)=>sum+item.size*p/100,0):item.quantity;
export const unit=item=>item.unit==='bottle'?'mL (추정)':({each:'개',g:'g',ml:'mL',pack:'팩'}[item.unit]||item.unit);
function previousSemester(term){const [year,half]=String(term).split('-').map(Number);return half===2?year+'-1':(year-1)+'-2';}
async function list(ctx,kind){
 if(kind==='privacy'){
  const semester=ctx.state.privacySemester||previousSemester(ctx.state.settings.semester);
  let result,error;try{result=await ctx.api('privacyCandidates',{semester});}catch(e){error=e.message;}
  const heads=['대상','신청 기록','명부','검토'];
  return heading('','학기말 개인정보 정리','보존 기한이 지난 학기의 정보를 검토하고, 정산이 끝난 대상부터 정리합니다.')+
  '<form class="toolbar" data-form="privacy-filter">'+field('semester','정리할 학기',semester,{required:true,hint:'예: 2026-1'})+'<button type="submit" class="button secondary">대상 조회</button><p class="form-error" role="alert"></p></form>'+
  '<div class="notice-warning">정리 후에는 이름·학번·연락처·신청 답변과 개인 확인 링크를 복구할 수 없습니다. 회의 내용·게시글·외부에 내려받은 명부는 별도로 확인하세요.</div>'+
  (error?'<p class="help">'+esc(error)+'</p>':result.rows.length?table(heads,result.rows.map(r=>row(r,r.name,[esc(r.name),r.applications+'건',r.roster?'함께 정리':'현재 명부 유지',button('정리 대상 확인','privacy-preview',{id:r.id,class:'button small secondary'})],heads))):empty('정리할 대상이 없습니다','선택한 학기에 보관 중인 부원 정보와 신청 기록이 없습니다.'));
 }

 if(kind==='roles'){
  const result=await ctx.api('listRoles'),roles=result.rows;ctx.state.roles=roles;
  const heads=['역할','사용할 수 있는 업무','배정 인원','관리'];
  return heading('','역할 관리','역할을 만들고 업무 권한을 정한 뒤 임원에게 배정합니다.',button('역할 만들기','role-edit',{icon:'plus'}))+table(heads,roles.map(r=>row(r,r.name,[esc(r.name),r.permissions.map(p=>esc(permissionLabels[p]||'역할·임원 관리')).join(' · '),r.assigned+'명',r.id==='owner'?'<span class="help">필수 관리 권한 유지</span>':button('수정','role-edit',{id:r.id,class:'button small secondary'})+(!r.system?button('삭제','role-delete',{id:r.id,class:'button small secondary'}):'')],heads)))+'<p class="help">회비·정산 권한은 기본적으로 회장·부회장·재무부에만 부여됩니다. 권한을 수정하면 배정된 임원 모두에게 적용됩니다.</p>';
 }

 const {rows}=['finance','members'].includes(kind)?await readAll(ctx,kind):await read(ctx,kind);
 if(kind==='events'){
  const writable=hasPermission(ctx.state.profile,'events');
  return heading('GATHER & LEARN','행사 · 교육','신청 접수부터 출석과 정산까지 관리합니다.',writable?button('행사 만들기','event-edit',{icon:'plus'}):'')+toolbar(kind,['draft','open','closed','completed','cancelled'])+
  (rows.length?'<div class="event-grid">'+rows.map(e=>'<a class="event-card" href="/admin/events/'+e.id+'" data-nav data-searchable="'+esc(e.title+' '+e.location)+'" data-status="'+e.status+'"><div class="event-visual '+e.type+'">'+icon(e.type==='class'?'martini':e.type==='meeting'?'users-round':'sparkles')+'<span>'+esc(label(e.type))+'</span>'+badge(e.status)+'</div><div class="event-content"><h2>'+esc(e.title)+'</h2><p>'+icon('calendar-days')+date(e.startsAt,true)+'</p><p>'+icon('map-pin')+esc(e.location)+'</p><div class="event-bottom"><span>등록 <b>'+e.registered+'</b> / '+e.capacity+'명</span><span>'+money(e.fee)+'</span></div><div class="capacity-bar"><span style="width:'+Math.min(100,e.registered/e.capacity*100)+'%"></span></div></div></a>').join('')+'</div>':empty('아직 등록된 행사가 없습니다','행사를 만들고 공유 링크를 전달하면 부원이 로그인 없이 신청할 수 있습니다.',writable?button('첫 행사 준비','event-edit',{class:'button secondary'}):''))+next(ctx,kind);
 }
 if(kind==='members'){
  rows.sort((a,b)=>compareMembers(a,b,ctx.state.memberSortField,ctx.state.memberSortDirection));
  const term=rosterSemester(ctx),terms=[...new Set([...(await ctx.api('rosterTerms')).rows,term])].sort().reverse();
  const tree='<nav class="semester-tree" aria-label="명부 학기">'+terms.map(t=>'<a data-nav href="/admin/members?semester='+t+'"'+(t===term?' aria-current="page"':'')+'>'+icon('folder')+'<span>'+esc(t)+'</span></a>').join('')+button('다른 학기 열기','roster-term',{class:'button secondary small',icon:'plus'})+'</nav>';
  const heads=['부원','소속','학번 · 연락처','관리'];
  return heading('THE PEOPLE OF MARTINI','부원 명부','학기를 선택하면 해당 학기의 부원 정보를 확인할 수 있습니다.',button('부원 등록','member-edit',{icon:'user-plus'}))+tree+toolbar(kind,[],memberSortControls(ctx))+
  '<div class="list-meta"><p>선택한 학기에 등록됩니다. 다른 학기의 명부는 변경되지 않습니다.</p>'+button('CSV 내보내기','export',{id:kind,class:'button small secondary',icon:'download'})+'</div>'+
  (rows.length?table(heads,rows.map(m=>row(m,m.name+' '+m.studentId+' '+m.phone+' '+m.department,[ '<button class="title-button" data-action="member-view" data-id="'+esc(m.id)+'"><strong>'+esc(m.name)+'</strong></button><small>'+esc(m.grade?m.grade+'학년':'')+'</small>',esc(m.college)+'<small>'+esc(m.department)+'</small>',esc(m.studentId)+'<small>'+esc(m.phone)+'</small>','<div class="member-actions"><button type="button" class="icon-button member-edit-button" data-action="member-edit" data-id="'+esc(m.id)+'" aria-label="수정" title="부원 정보 수정">'+icon('wrench')+'</button><button type="button" class="icon-button member-remove-button" data-action="member-remove" data-id="'+esc(m.id)+'" aria-label="명부에서 제거" title="이 학기 명부에서 제거">'+icon('x')+'</button></div>'],heads))):empty('명부가 아직 비어 있습니다','학번과 연락처가 행사 신청 정보와 일치해야 참가 자격을 확인할 수 있습니다.',button('첫 부원 등록','member-edit',{class:'button secondary'})))+next(ctx,kind);
 }

 if(kind==='inventory'){
  const heads=['품목','보관 위치','미개봉 / 수량','개봉 잔량','총 보유량','기록'];
  return heading('EVERY DROP COUNTS','재고 관리','주류, 재료, 도구를 한곳에서 확인하고 사용 이력을 남깁니다.',button('품목 등록','item-edit',{icon:'plus'}))+toolbar(kind,['spirit','ingredient','supply','tool'])+
  (rows.length?table(heads,rows.map(i=>row(i,i.name+' '+i.location,[ '<strong>'+esc(i.name)+'</strong><small>'+label(i.category)+(i.size?' · '+i.size+'mL':'')+'</small>',esc(i.location),esc(i.quantity)+(i.unit==='bottle'?'병':' '+unit(i)),Object.values(i.bottles||{}).map(p=>'<span class="bottle-pill">'+p+'%</span>').join('')||'—','<strong>'+total(i).toLocaleString()+' '+unit(i)+'</strong>'+(total(i)<i.minimum?'<small class="warning-text">최소 기준보다 부족</small>':''),'<div class="row-actions">'+button('기록','stock-record',{id:i.id,class:'button small'})+button('상세','item-view',{id:i.id,class:'button small secondary'})+'</div>'],heads,i.category))):empty('아직 등록된 품목이 없습니다','품목을 등록한 뒤 입고 기록으로 수량을 입력하세요. 주류는 개봉 병의 잔량을 따로 관리합니다.',button('첫 품목 등록','item-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='meetings'){
  return heading('OUR SHARED MEMORY','회의록','안건별 논의와 결정, 참석자와 수정 이력을 확인합니다.',button('회의 기록하기','meeting-edit',{icon:'plus'}))+toolbar(kind,['draft','in_progress','final'])+
  (rows.length?'<div class="meeting-grid">'+rows.map(m=>'<article class="meeting-card" data-searchable="'+esc(m.title+' '+m.body+' '+m.agendas.map(a=>a.title+' '+a.notes).join(' '))+'" data-status="'+m.status+'"><div class="card-top">'+badge(m.status)+'<span class="muted">'+date(m.date)+'</span></div><button class="title-button" data-action="meeting-view" data-id="'+m.id+'"><h2>'+esc(m.title)+'</h2></button><p class="clamp">'+esc(m.body||'회의에서 나눌 이야기를 기록해 주세요.')+'</p><div class="meeting-tags"><span>'+icon('list')+' 안건 '+m.agendas.length+'개</span><span>'+icon('users')+' '+m.attendees.length+'명 · 부서</span></div><footer><span>'+esc(m.location||'장소 미정')+'</span><button data-action="meeting-view" data-id="'+m.id+'" class="text-button">회의록 열기 '+icon('arrow-right')+'</button></footer></article>').join('')+'</div>':empty('아직 회의 기록이 없습니다','회의 개요와 안건을 작성하면 수정 이력과 함께 보관됩니다.',button('첫 회의 기록','meeting-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='decisions'){
  const heads=['결정 · 할 일','구분','담당','기한','상태','관리'];
  return heading('FROM WORDS TO ACTION','결정 · 할 일','회의에서 나온 결정을 모으고 담당자와 진행 상태를 확인합니다.',button('기록 추가','decision-edit',{icon:'plus'}))+toolbar(kind,['proposed','approved','in_progress','done','deferred'])+
  (rows.length?table(heads,rows.map(d=>row(d,d.title+' '+d.body+' '+d.owner,['<button class="title-button" data-action="decision-view" data-id="'+d.id+'"><strong>'+esc(d.title)+'</strong></button>'+ (d.meetingId?'<small>회의에 연결됨</small>':''),badge(d.type),esc(d.owner||'미정'),d.dueAt?date(d.dueAt):'—',badge(d.status),button('수정','decision-edit',{id:d.id,class:'button small secondary'})],heads))):empty('아직 기록된 결정이 없습니다','회의에 연결하거나 독립적인 결정·업무를 등록할 수 있습니다.',button('첫 결정 기록','decision-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='finance'){
  const heads=['내용','구분','금액','학기','확인자','기록일'];
  const received=rows.filter(r=>['income','dues'].includes(r.kind)).reduce((s,r)=>s+r.amount,0),spent=rows.filter(r=>r.kind==='expense').reduce((s,r)=>s+r.amount,0),refund=rows.filter(r=>r.kind==='refund').reduce((s,r)=>s+r.amount,0);
  return heading('CLEAR & ACCOUNTABLE','회비 · 정산','확인한 입금과 지출, 환불을 기록합니다. 실제 송금은 계좌에서 처리합니다.',button('수입 · 지출 기록','finance-add',{icon:'plus'}))+
  '<div class="finance-summary"><div><span>확인한 수입</span><strong>'+money(received)+'</strong></div><div><span>지출</span><strong>'+money(spent)+'</strong></div><div><span>환불</span><strong>'+money(refund)+'</strong></div><div><span>기록상 잔액</span><strong>'+money(received-spent-refund)+'</strong></div></div><p class="data-caption">전체 '+rows.length+'개 정산 기록의 합계 · 부원 등록과 장부 기록은 별도로 관리합니다.</p>'+toolbar(kind,['income','expense','dues','refund'])+
  (rows.length?table(heads,rows.map(r=>row(r,r.title+' '+r.note,[esc(r.title)+'<small>'+esc(r.note)+'</small>',esc({income:'수입',expense:'지출',dues:'학기 회비',refund:'환불'}[r.kind]),'<strong>'+money(r.amount)+'</strong>',esc(r.semester),esc(r.actor),date(r.createdAt)],heads,r.kind))):empty('아직 정산 기록이 없습니다','행사 참가비는 행사 상세의 신청 명단에서 확인할 수 있습니다.'))+next(ctx,kind);
 }
 if(kind==='content'){
  const heads=['제목','유형','공개 상태','수정일','관리'];
  return heading('SHARE OUR STORY','공지 · 활동','홈페이지에 공개할 공지와 활동 이야기를 관리합니다.',button('글 작성','content-edit',{icon:'plus'}))+toolbar(kind)+
  (rows.length?table(heads,rows.map(c=>row(c,c.title+' '+c.body,[esc(c.title),c.type==='notice'?'공지':'활동 기록',badge(c.published?'final':'draft'),date(c.updatedAt),button('수정','content-edit',{id:c.id,class:'button small secondary'})],heads))):empty('아직 작성한 글이 없습니다','초안으로 저장한 글은 홈페이지에 보이지 않습니다.',button('첫 글 작성','content-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='admins'){
  const roleRows=(await ctx.api('listRoles')).rows,roleName=id=>roleRows.find(r=>r.id===id)?.name||id;
  const heads=['임원','부서 · 권한','임기 종료','상태','관리'];
  return heading('THE TEAM','임원 권한','Firebase Authentication에 존재하는 계정 UID를 임원으로 등록합니다.',button('임원 등록','admin-edit',{icon:'user-plus'}))+toolbar(kind)+table(heads,rows.map(a=>row(a,a.displayName+' '+a.role,[esc(a.displayName),esc(roleName(a.role)),date(a.expiresAt),a.active?'사용 가능':'중지',button('수정','admin-edit',{id:a.id,class:'button small secondary'})],heads)));
 }
 if(kind==='audit'){
  const heads=['작업','대상','처리자','시각'];
  return heading('TRACEABLE OPERATIONS','변경 이력','중요한 운영 변경과 자료 내보내기 기록을 확인합니다.')+toolbar(kind)+
  (rows.length?table(heads,rows.map(a=>row(a,a.action+' '+a.actorName,[esc(a.action),esc(a.entityType)+'<small>'+esc(a.entityId)+'</small>',esc(a.actorName),date(a.at,true)],heads))):empty('변경 이력이 없습니다','운영 기록이 저장되면 이곳에 남습니다.'))+next(ctx,kind);
 }
 return '';
}
async function eventDetail(ctx,id){
 const e=(await read(ctx,'events',{recordId:id})).rows[0];const tab=new URLSearchParams(location.search).get('tab')||'participants';
 const write=hasPermission(ctx.state.profile,'events');
 let html='<a class="back-link" href="/admin/events" data-nav>'+icon('arrow-left')+' 행사 목록</a>'+heading(esc(label(e.type)),esc(e.title),date(e.startsAt,true)+' · '+esc(e.location),write?'<div class="row-actions">'+button('신청 링크 재발급','event-link',{id:e.id,class:'button secondary',icon:'link'})+button('편집','event-edit',{id:e.id,icon:'pencil'})+'</div>':'')+
 '<div class="event-statbar"><span>'+badge(e.status)+'</span><span>등록 <b>'+e.registered+'</b> / '+e.capacity+'명</span><span>대기 <b>'+e.waiting+'</b>명</span><span>참가비 <b>'+money(e.fee)+'</b></span></div>'+
 '<nav class="tabs" aria-label="행사 상세 메뉴">'+[['participants','신청 · 출석'],['detail','안내 · 정책'],['preparation','준비 · 결과']].map(([key,t])=>'<a href="/admin/events/'+id+'?tab='+key+'" data-nav class="'+(tab===key?'active':'')+'"'+(tab===key?' aria-current="page"':'')+'>'+t+'</a>').join('')+'</nav>';
 if(tab==='detail')return html+'<section class="panel padded"><h2>행사 안내</h2>'+textBlock(e.description)+'<hr><h3>취소 · 환불 안내</h3>'+textBlock(e.policy)+'<hr><h3>납부 안내</h3>'+textBlock(e.paymentInstructions||'무료 행사입니다.')+'<div class="detail-grid"><p>신청 시작<br><strong>'+date(e.opensAt,true)+'</strong></p><p>신청 마감<br><strong>'+date(e.closesAt,true)+'</strong></p><p>취소 마감<br><strong>'+date(e.cancelUntil,true)+'</strong></p></div></section>';
 if(tab==='preparation')return html+'<section class="panel padded"><h2>준비와 마무리</h2><p>관련 업무는 결정 · 할 일에 남기고, 사용한 재료는 재고 기록에서 이 행사에 연결해 주세요.</p><div class="quick-links">'+(can(ctx,'decisions')?'<a href="/admin/decisions" data-nav class="button secondary">할 일 관리</a>':'')+(can(ctx,'inventory')?'<a href="/admin/inventory" data-nav class="button secondary">재고 사용 기록</a>':'')+(can(ctx,'finance')?'<a href="/admin/finance" data-nav class="button secondary">지출 · 정산</a>':'')+'</div><ul class="checklist"><li>담당자와 장소 · 준비물 확인</li><li>참가자 · 납부 · 대기자 확인</li><li>행사 당일 수기 호명 후 출석 기록</li><li>사용한 재료와 지출 기록</li><li>환불 · 정산 확인 후 진행 완료 처리</li></ul></section>';
 const {rows,truncated}=await read(ctx,'applications',{eventId:e.id});const finance=can(ctx,'finance'),heads=['신청자','신청',...(finance?['납부']:[]),'출석','처리'];
 return html+toolbar('applications',['registered','waiting','offered','cancelled','expired'])+
 (e.status==='cancelled'?'<div class="notice-warning">행사가 취소되었습니다. 납부 내역이 있는 신청의 환불을 확인해 주세요.</div>':'')+
 (truncated?'<div class="notice-warning">참가자 500개까지만 불러왔습니다. 운영 담당자에게 확인해 주세요.</div>':'')+
 (rows.length?table(heads,rows.map(a=>row(a,a.name,['<strong>'+esc(a.name)+'</strong><small>'+date(a.createdAt,true)+'</small>',badge(a.status)+(a.status==='waiting'?'<small>접수 순서 '+a.sequence+'</small>':''),...(finance?[badge(a.payment)+'<small>'+money(a.paidAmount)+' 확인</small>']:[]),badge(a.attendance),button('신청 상세 · 처리','application-manage',{id:a.id,class:'button small secondary'})],heads))):empty('아직 신청자가 없습니다','행사 신청 링크를 복사해서 부원들에게 전달해 주세요.'));
}
function login(ctx){
 return '<main id="main-content" class="login-page"><a href="/" data-nav class="brand"><img class="wordmark" src="/assets/wordmark.png" alt="Martini" width="170" height="42"></a><section class="login-card"><span class="eyebrow">임원 로그인</span><h1 id="page-title" tabindex="-1">마티니 운영실</h1><p>임원 계정으로 로그인해 주세요.</p><form data-form="login">'+field('email','이메일',ctx.state.user?.email||'',{type:'email',required:true,autocomplete:'username',inputmode:'email',maxLength:254})+field('password','비밀번호','',{type:'password',required:true,autocomplete:'current-password',maxLength:4096})+'<p role="alert" class="form-error">'+esc(ctx.state.authError||'')+'</p><button type="submit" class="button full">로그인 '+icon('arrow-right')+'</button></form>'+button('비밀번호 재설정','password-reset',{class:'button ghost full'})+(ctx.state.user?button('다른 계정으로 로그인','logout',{class:'button secondary full'}):'')+(local?'<div class="local-note">로컬 검증 환경 · 실제 데이터와 분리되어 있습니다.'+button('가상 임원으로 확인하기','local-login',{class:'button secondary full'})+'</div>':'')+'</section></main>';
}
export async function renderAdmin(ctx){
 if(!ctx.state.authReady)return '<div class="loading" role="status">'+icon('loader-circle')+'로그인 상태 확인 중</div>';
 if(!ctx.state.profile)return login(ctx);
 const profile=await ctx.api('profile');
 if(JSON.stringify(profile.permissions)!==JSON.stringify(ctx.state.profile.permissions)||profile.role!==ctx.state.profile.role){ctx.state.data={};ctx.state.pages={};}
 ctx.state.profile=profile;
 const part=location.pathname.split('/').filter(Boolean),kind=part[1]||'';
 if(kind && !can(ctx,kind))return '<main id="main-content" class="connection-page"><h1 id="page-title" tabindex="-1">접근 권한이 없습니다</h1><p>현재 임원 역할에서 사용할 수 없는 메뉴입니다.</p><a href="/admin" data-nav class="button">운영 홈</a></main>';
 const config=(await read(ctx,'settings')).rows[0];ctx.state.settings=config||{semester:'2026-2'};
 let body=kind==='events'&&part[2]?await eventDetail(ctx,part[2]):kind==='settings'?heading('','학기 · 운영 설정','홈페이지 소개와 가입 오픈채팅을 관리합니다.',button('설정 수정','settings-edit',{icon:'pencil'}))+'<section class="panel padded">'+(config?'<div class="detail-grid"><p>현재 학기<br><strong>'+esc(config.semester)+'</strong></p><p>기본 활동 장소<br><strong>'+esc(config.location||'미입력')+'</strong></p><p>동아리 문의 채널<br><strong>'+esc(config.contact||(openChatUrl(config.joinUrl)?'가입 오픈채팅':'미입력'))+'</strong></p></div><hr><h3>가입 오픈채팅</h3>'+(openChatUrl(config.joinUrl)?'<a class="button secondary" href="'+esc(openChatUrl(config.joinUrl))+'" target="_blank" rel="noopener noreferrer">가입 오픈채팅 열기 (새 탭)</a>':'<p>가입 오픈채팅 준비 중입니다. 설정 수정에서 링크를 입력해 주세요.</p>')+'<hr><h3>소개</h3>'+textBlock(config.intro):empty('운영 정보를 입력해 주세요','현재 학기, 동아리 소개와 가입 오픈채팅을 설정합니다.'))+'<hr><h3>개인정보 처리방침</h3><p>기존 홈페이지의 개인정보 처리방침을 사용합니다. 보존 여부는 처리방침에 따라 검토해 주세요.</p><a class="button secondary" href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 처리방침 보기 (새 탭)</a></section>':kind?await list(ctx,kind):await home(ctx);
 return '<div class="workspace"><aside class="sidebar"><a href="/admin" data-nav class="side-brand"><img src="/assets/logo.png" alt="" width="42" height="42"><span>MARTINI<small>운영실</small></span></a><div class="side-semester">'+icon('calendar-days')+esc(ctx.state.settings.semester)+'<span>운영 중</span></div><div class="side-label">운영 메뉴</div><nav aria-label="운영 메뉴">'+navigation.filter(([k])=>!k||can(ctx,k)).map(([key,i,t])=>'<a href="/admin'+(key?'/'+key:'')+'" data-nav class="'+(kind===key?'active':'')+'"'+(kind===key?' aria-current="page"':'')+'>'+icon(i)+'<span>'+t+'</span>'+(kind===key?'<span class="nav-dot"></span>':'')+'</a>').join('')+'</nav><div class="side-footer"><a href="/" data-nav>'+icon('arrow-up-right')+' 홈페이지 보기</a><button data-action="logout">'+icon('log-out')+' 로그아웃</button></div></aside><div class="workspace-main"><header class="workspace-header"><div class="breadcrumb">마티니 <span>/</span> '+esc(navigation.find(([k])=>k===kind)?.[2]||'운영실')+'</div><div class="account-chip"><span class="avatar">'+esc(ctx.state.profile.displayName.slice(0,1))+'</span><div>'+esc(ctx.state.profile.displayName)+'<small>'+esc(ctx.state.profile.roleName||label(ctx.state.profile.role))+'</small></div></div></header>'+(local?'<div class="local-strip">개발 환경 · 가상 데이터</div>':'')+'<main id="main-content" class="workspace-content">'+body+'</main><nav class="mobile-admin-nav" aria-label="빠른 운영 메뉴">'+navigation.filter(([k])=>['','events','inventory','meetings'].includes(k)&&(!k||can(ctx,k))).map(([key,i,t])=>'<a data-nav href="/admin'+(key?'/'+key:'')+'" class="'+(kind===key?'active':'')+'"'+(kind===key?' aria-current="page"':'')+'>'+icon(i)+'<span>'+t+'</span></a>').join('')+button('전체 메뉴','mobile-menu',{class:'mobile-more',icon:'menu'})+'</nav></div></div>';
}
export async function adminAction(ctx,action,id,target){
 if(action==='password-reset'){modal('비밀번호 재설정',field('email','가입한 이메일',document.querySelector('[name=email]')?.value||ctx.state.user?.email||'',{type:'email',required:true,wide:true,autocomplete:'email',inputmode:'email',maxLength:254}),async f=>{await sendPasswordResetEmail(auth,String(f.get('email')).trim());ctx.toast('등록된 계정이면 비밀번호 재설정 메일이 발송됩니다.');},{submit:'재설정 메일 요청'});return;}
 if(action==='logout'){ctx.state.profile=null;ctx.state.data={};ctx.state.authError='';await signOut(auth);return ctx.render();}
 if(action==='local-login'&&local){await signInWithEmailAndPassword(auth,'admin@martini.local','Martini-Local-2026!');ctx.state.profile=await ctx.api('profile');return ctx.render();}
 if(action==='mobile-menu'){modal('운영 메뉴','<div class="mobile-menu-list wide">'+navigation.filter(([k])=>!k||can(ctx,k)).map(([k,i,t])=>'<a href="/admin'+(k?'/'+k:'')+'" data-nav'+((location.pathname.split('/')[2]||'')===k?' aria-current="page"':'')+'>'+icon(i)+t+'</a>').join('')+'</div>',null);return;}
 if(action==='load-more'){const current=ctx.state.pages[id];const result=await ctx.api('read',{kind:id,cursor:current.nextCursor,...(id==='members'?{semester:rosterSemester(ctx),removed:false}:{})});result.rows.forEach(r=>ctx.state.data[id][r.id]=r);ctx.state.pages[id]={rows:[...current.rows,...result.rows],nextCursor:result.nextCursor};ctx.toast('추가 기록 '+result.rows.length+'개를 불러왔습니다.');return showMoreRows(ctx,id);}
 return handleAdminAction(ctx,action,id,target);
}
async function showMoreRows(ctx,kind){
 // Render with the already fetched accumulated page once.
 const original=ctx.api,accumulated=ctx.state.pages[kind];
 ctx.api=async(op,data)=>op==='read'&&data.kind===kind&&!data.recordId?accumulated:original(op,data);
 try{await ctx.render();}finally{ctx.api=original;}
}
export async function adminSubmit(ctx,form,data,target){
 if(form==='privacy-filter'){ctx.state.privacySemester=String(data.get('semester')).trim();return ctx.render();}
 if(form==='login'){await signInWithEmailAndPassword(auth,data.get('email'),data.get('password'));ctx.state.profile=await ctx.api('profile');ctx.state.authError='';return ctx.render();}
 return handleAdminSubmit(ctx,form,data,target);
}
