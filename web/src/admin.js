import { hasPermission, permissionLabels } from '../../functions/src/permissions.js';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, field, icon, badge, button, date, money, label, empty, textBlock, refreshIcons, modal } from './ui.js';
import { auth, signInWithEmailAndPassword, signOut, local, sendPasswordResetEmail } from './firebase.js';
import { handleAdminAction, handleAdminSubmit } from './admin-forms.js';
const navigation=[['','layout-dashboard','오늘의 운영'],['events','calendar-days','행사 · 교육'],['members','users-round','부원 명부'],['inventory','package','재고 관리'],['finance','wallet','회비 · 정산'],['meetings','notebook-pen','회의록'],['decisions','list-checks','결정 · 할 일'],['content','megaphone','공지 · 활동'],['settings','settings-2','학기 · 운영 설정'],['roles','list-checks','역할 관리'],['admins','shield-check','임원 배정'],['privacy','shield-check','학기말 정보 정리'],['audit','history','변경 이력']];
const can=(ctx,kind)=>hasPermission(ctx.state.profile,['roles','privacy'].includes(kind)?'admins':kind==='events'?'eventRead':kind);
const scopeEvent=ctx=>hasPermission(ctx.state.profile,'events');
const menuGroups=[['활동 운영',['','events','members','content']],['운영 지원',['inventory','finance','meetings','decisions']],['관리 · 설정',['settings','roles','admins','privacy','audit']]];
const menuKeywords={events:'신청 참가자 출석 교육 행사',members:'회원 연락처 명부',inventory:'재료 주류 구매 도구 재고',finance:'예산 지출 수입 회비 정산',meetings:'회의 안건 회의록',decisions:'업무 담당 기한 결정 할 일',content:'공지 홍보 게시글',settings:'학기 장소 가입 링크',roles:'권한 역할',admins:'임원 계정 배정',privacy:'개인정보 삭제 학기말',audit:'변경 기록 이력'};
function groupedNavigation(ctx,kind){
 return menuGroups.map(([title,keys])=>{
  const links=navigation.filter(([k])=>keys.includes(k)&&(!k||can(ctx,k)));
  return links.length?'<section class="nav-group"><h2>'+title+'</h2>'+links.map(([k,i,t])=>'<a href="/admin'+(k?'/'+k:'')+'" data-nav data-menu-item="'+esc(t+' '+(menuKeywords[k]||''))+'" class="'+(kind===k?'active':'')+'"'+(kind===k?' aria-current="page"':'')+'>'+icon(i)+'<span>'+t+'</span></a>').join('')+'</section>':'';
 }).join('');
}
function quickStart(ctx){
 const actions=[['events','calendar-days','행사 · 교육 관리','모집, 신청자와 출석 확인'],['members','users-round','부원 명부','신청 자격과 등록 정보 확인'],['meetings','notebook-pen','회의록','안건과 논의 기록'],['finance','wallet','회비 · 정산','예산과 지출 확인']].filter(([k])=>can(ctx,k));
 return '<section class="quick-start" aria-label="자주 하는 업무">'+actions.map(([k,i,t,d])=>'<a data-nav href="/admin/'+k+'">'+icon(i)+'<span><strong>'+t+'</strong><small>'+d+'</small></span>'+icon('arrow-right')+'</a>').join('')+'</section>';
}
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
function deleteButton(kind,id,title='기록'){
 return '<button type="button" class="icon-button record-delete" data-action="record-delete" data-id="'+esc(id)+'" data-kind="'+esc(kind)+'" aria-label="'+esc(title)+' 삭제" title="'+esc(title)+' 삭제">'+icon('x')+'</button>';
}
function managementActions(kind,id,allowDelete=true){
 const title=({role:'역할',admin:'임원',budget:'지출 계획'})[kind];
 return '<div class="management-actions"><button type="button" class="icon-button" data-action="'+kind+'-edit" data-id="'+esc(id)+'" aria-label="수정" title="'+title+' 수정">'+icon('wrench')+'</button>'+(allowDelete?'<button type="button" class="icon-button management-delete-button" data-action="'+kind+'-delete" data-id="'+esc(id)+'" aria-label="삭제" title="'+title+' 삭제">'+icon('x')+'</button>':'<span class="help">내 계정</span>')+'</div>';
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
 return heading('YOUR CLUB, AT A GLANCE','운영 현황','이번 학기의 행사, 부원, 재고와 진행 중인 업무입니다.')+quickStart(ctx)+setup+
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
  return heading('','역할 관리','역할을 만들고 업무 권한을 정한 뒤 임원에게 배정합니다.',button('역할 만들기','role-edit',{icon:'plus'}))+table(heads,roles.map(r=>row(r,r.name,['<span class="role-name">'+esc(r.name)+'</span>',r.permissions.map(p=>esc(permissionLabels[p]||'역할·임원 관리')).join(' · '),r.assigned+'명',r.id==='owner'?'<span class="help">필수 관리 권한 유지</span>':managementActions('role',r.id)],heads)))+'<p class="help">회비·정산 권한은 기본적으로 회장·부회장·재무부에만 부여됩니다. 권한을 수정하면 배정된 임원 모두에게 적용됩니다. 회장을 제외한 역할은 삭제할 수 있으며, 배정 인원이 있으면 먼저 다른 역할로 변경해야 합니다.</p>';
 }

 const {rows}=['events','finance','members','meetings','decisions'].includes(kind)?await readAll(ctx,kind):await read(ctx,kind);
 if(kind==='events'){
  const writable=hasPermission(ctx.state.profile,'events');
  const rank=e=>e.status==='draft'?1:['completed','cancelled'].includes(e.status)||Date.parse(e.endsAt)<Date.now()?2:0;
  rows.sort((a,b)=>rank(a)-rank(b)||(rank(a)===2?b.startsAt.localeCompare(a.startsAt):a.startsAt.localeCompare(b.startsAt)));
  const types='<select data-event-type aria-label="활동 유형 필터"><option value="all">전체 활동</option>'+['class','meeting','social','workshop','other'].map(t=>'<option value="'+t+'">'+esc(label(t))+'</option>').join('')+'</select>';
  return heading('GATHER & LEARN','행사 · 교육','신청 접수부터 출석과 정산까지 관리합니다.',writable?button('행사 만들기','event-edit',{icon:'plus'}):'')+'<p class="list-guide">다가오는 활동 → 초안 → 지난 활동 순서입니다. 행사 카드를 열면 신청자와 출석을 확인할 수 있습니다.</p>'+toolbar(kind,['draft','open','closed','completed','cancelled'],types)+
  (rows.length?'<div class="event-grid">'+rows.map(e=>'<article class="event-card-wrap" data-searchable="'+esc(e.title+' '+e.location+' '+label(e.type)+' '+e.semester+' '+e.owner)+'" data-type="'+esc(e.type)+'" data-status="'+e.status+'"><a class="event-card" href="/admin/events/'+e.id+'" data-nav><div class="event-visual '+e.type+'">'+icon(e.type==='class'?'martini':e.type==='meeting'?'users-round':'sparkles')+'<span>'+esc(label(e.type))+'</span>'+badge(e.status)+'</div><div class="event-content"><span class="event-term">'+esc(e.semester)+' · '+esc(e.owner||'담당 미정')+'</span><h2>'+esc(e.title)+'</h2><p>'+icon('calendar-days')+date(e.startsAt,true)+'</p><p>'+icon('map-pin')+esc(e.location)+'</p><p class="event-deadline">신청 마감 '+date(e.closesAt,true)+'</p><div class="event-bottom"><span>등록 <b>'+e.registered+'</b> / '+e.capacity+'명</span><span>'+money(e.fee)+'</span></div><div class="capacity-bar"><span style="width:'+Math.min(100,e.registered/Math.max(1,e.capacity)*100)+'%"></span></div><div class="event-card-footer"><span>대기 '+e.waiting+'명</span><strong>신청자 · 출석 관리 →</strong></div></div></a>'+(writable?deleteButton('events',e.id,'행사'):'')+'</article>').join('')+'</div>':empty('아직 등록된 행사가 없습니다','행사를 만들고 공유 링크를 전달하면 부원이 로그인 없이 신청할 수 있습니다.',writable?button('첫 행사 준비','event-edit',{class:'button secondary'}):''))+next(ctx,kind);
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
  (rows.length?table(heads,rows.map(i=>row(i,i.name+' '+i.location,[ '<strong>'+esc(i.name)+'</strong><small>'+label(i.category)+(i.size?' · '+i.size+'mL':'')+'</small>',esc(i.location),esc(i.quantity)+(i.unit==='bottle'?'병':' '+unit(i)),Object.values(i.bottles||{}).map(p=>'<span class="bottle-pill">'+p+'%</span>').join('')||'—','<strong>'+total(i).toLocaleString()+' '+unit(i)+'</strong>'+(total(i)<i.minimum?'<small class="warning-text">최소 기준보다 부족</small>':''),'<div class="row-actions">'+button('기록','stock-record',{id:i.id,class:'button small'})+button('상세','item-view',{id:i.id,class:'button small secondary'})+deleteButton('inventory',i.id,'품목')+'</div>'],heads,i.category))):empty('아직 등록된 품목이 없습니다','품목을 등록한 뒤 입고 기록으로 수량을 입력하세요. 주류는 개봉 병의 잔량을 따로 관리합니다.',button('첫 품목 등록','item-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='meetings'){
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  return heading('','회의록','회의를 준비하고, 안건별 논의를 기록한 뒤 후속 업무로 연결하세요.',button('회의 기록하기','meeting-edit',{icon:'plus'}))+toolbar(kind,['draft','in_progress','final'])+
  (rows.length?'<div class="meeting-list">'+rows.map(m=>'<article class="meeting-entry" data-searchable="'+esc(m.title+' '+m.body+' '+m.attendees.join(' ')+' '+m.agendas.map(a=>a.title+' '+a.notes).join(' '))+'" data-status="'+m.status+'"><div class="meeting-date">'+icon('calendar-days')+'<span>'+date(m.date,true)+'</span></div><div class="meeting-entry-content"><div class="record-meta">'+badge(m.status)+'<span>'+esc(m.semester)+'</span></div><button class="title-button" data-action="meeting-view" data-id="'+esc(m.id)+'"><h2>'+esc(m.title)+'</h2></button><p>'+esc(m.body?m.body.slice(0,140):m.agendas.map(a=>a.title).join(' · ')||'안건을 추가해 회의를 준비하세요.')+'</p><div class="meeting-tags"><span>안건 '+m.agendas.filter(a=>a.status==='discussed').length+'/'+m.agendas.length+'개 논의 완료</span><span>참석 '+m.attendees.length+'명 · 부서</span><span>'+esc(m.location||'장소 미정')+'</span></div></div><div class="meeting-entry-actions">'+button('열기','meeting-view',{id:m.id,class:'button secondary'})+'<button type="button" class="icon-button" data-action="meeting-edit" data-id="'+esc(m.id)+'" aria-label="회의록 수정" title="회의록 수정">'+icon('wrench')+'</button>'+deleteButton('meetings',m.id,'회의록')+'</div></article>').join('')+'</div>':empty('첫 회의를 준비해 보세요','회의 이름과 일시만 입력해 초안을 저장할 수 있습니다. 안건과 참석자는 나중에 추가하세요.',button('회의 기록하기','meeting-edit',{class:'button secondary'})));
 }
 if(kind==='decisions'){
  const active=d=>!['done','deferred'].includes(d.status),overdue=d=>active(d)&&d.dueAt&&Date.parse(d.dueAt)<Date.now();
  rows.sort((a,b)=>Number(!!overdue(b))-Number(!!overdue(a))||(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  const groups=[['다음에 할 일',['proposed','approved']],['진행 중',['in_progress']],['보류',['deferred']],['완료',['done']]];
  return heading('','결정 · 할 일','담당자와 기한을 정하고, 진행 상황을 바로 업데이트하세요.',button('기록 추가','decision-edit',{icon:'plus'}))+'<p class="work-overview">남은 기록 <strong>'+rows.filter(active).length+'</strong> · 기한 지남 <strong>'+rows.filter(overdue).length+'</strong> · 담당 미정 <strong>'+rows.filter(d=>active(d)&&!d.owner).length+'</strong></p>'+toolbar(kind,['proposed','approved','in_progress','done','deferred'])+
  (rows.length?'<div class="work-board">'+groups.map(([title,states])=>'<section class="work-lane"><h2>'+title+' <span>'+rows.filter(d=>states.includes(d.status)).length+'</span></h2>'+rows.filter(d=>states.includes(d.status)).map(d=>'<article class="work-card" data-searchable="'+esc(d.title+' '+d.body+' '+d.owner)+'" data-status="'+d.status+'"><div class="record-meta">'+badge(d.type)+(d.status==='approved'?badge(d.status):'')+(d.meetingId?'<span>회의에 연결됨</span>':'')+'</div><button class="title-button" data-action="decision-view" data-id="'+esc(d.id)+'"><h3>'+esc(d.title)+'</h3></button>'+(d.body?'<p class="clamp">'+esc(d.body)+'</p>':'')+'<div class="work-owner">'+icon('users-round')+esc(d.owner||'담당 미정')+'</div><div class="work-due '+(overdue(d)?'warning-text':'')+'">'+icon('calendar-days')+(d.dueAt?date(d.dueAt):'기한 미정')+(overdue(d)?' · 기한 지남':'')+'</div><footer>'+button(d.status==='done'?'다시 열기':d.status==='in_progress'?'완료':d.status==='deferred'?'다시 시작':'진행 시작','decision-progress',{id:d.id,class:'button small secondary'})+'<button type="button" class="icon-button" data-action="decision-edit" data-id="'+esc(d.id)+'" aria-label="수정" title="결정·할 일 수정">'+icon('wrench')+'</button>'+deleteButton('decisions',d.id,'결정 · 할 일')+'</footer></article>').join('')+'</section>').join('')+'</div>':empty('회의에서 나온 일을 기록하세요','할 일은 담당자와 기한을, 결정 사항은 결정 내용과 이유를 남기세요.',button('기록 추가','decision-edit',{class:'button secondary'})));
 }
 if(kind==='finance'){
  const plans=(await readAll(ctx,'budgets')).rows,open=plans.filter(p=>p.status==='planned').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title,'ko'));
  const balance=rows.reduce((sum,r)=>sum+(['income','dues'].includes(r.kind)?r.amount:-r.amount),0),planned=open.reduce((sum,p)=>sum+p.amount,0),remaining=balance-planned;
  let running=balance;const heads=['사용 목적','예정일 · 학기','예상 지출','지출 후 잔액','관리'];
  const planRows=open.map(p=>{running-=p.amount;return row(p,p.title+' '+p.note,[esc(p.title)+'<small>'+esc(p.note)+'</small>',(p.dueDate?esc(p.dueDate):'미정')+'<small>'+esc(p.semester)+'</small>',money(p.amount),'<strong class="'+(running<0?'warning-text':'')+'">'+money(running)+'</strong>','<div class="row-actions">'+button('집행 완료','budget-execute',{id:p.id,class:'button small secondary'})+managementActions('budget',p.id)+'</div>'],heads);});
  const actualHeads=['내용','구분','금액','학기','확인자','기록일','관리'];
  return heading('','회비 · 정산','입력된 수입·지출의 잔액을 기준으로 앞으로의 사용 계획을 세웁니다.','<div class="row-actions">'+button('수입 · 지출 기록','finance-add',{class:'button secondary'})+button('지출 계획 추가','budget-edit',{icon:'plus'})+'</div>')+
  '<div class="finance-summary"><div><span>현재 잔액</span><strong>'+money(balance)+'</strong></div><div><span>예정 지출</span><strong>'+money(planned)+'</strong></div><div><span>계획 후 예상 잔액</span><strong class="'+(remaining<0?'warning-text':'')+'">'+money(remaining)+'</strong></div></div><p class="data-caption">전체 학기 장부와 미집행 계획의 합계 · 추가 수입은 가정하지 않습니다. 예정일 미정인 계획은 마지막에 계산합니다.</p>'+
  (remaining<0?'<p class="form-error" role="status">계획대로 사용하면 '+money(-remaining)+'이 부족합니다. 예정 지출이나 확보 가능한 수입을 확인해 주세요.</p>':'')+
  (planRows.length?table(heads,planRows):empty('아직 예정된 지출이 없습니다','교육 재료, 주류 구매, 행사 비용 등 앞으로 사용할 금액을 입력해 주세요.',button('지출 계획 추가','budget-edit',{class:'button secondary'})))+
  '<details class="finance-ledger" open><summary>실제 입출금 기록 · '+rows.length+'건</summary><p class="help">현재 잔액의 근거가 되는 기록입니다. 계획의 집행 완료는 실제 지출을 한 번만 기록합니다.</p>'+
  (rows.length?table(actualHeads,rows.map(r=>row(r,r.title,[esc(r.title)+'<small>'+esc(r.note)+'</small>',esc({income:'수입',expense:'지출',dues:'학기 회비',refund:'환불'}[r.kind]),money(r.amount),esc(r.semester),esc(r.actor),date(r.createdAt),deleteButton('finance',r.id,'입출금 기록')],actualHeads))):'<p class="help">기록된 입출금이 없습니다. 보유 금액은 수입 기록으로 입력해 주세요.</p>')+'</details>';
 }
 if(kind==='content'){
  const heads=['제목','유형','공개 상태','수정일','관리'];
  return heading('SHARE OUR STORY','공지 · 활동','홈페이지에 공개할 공지와 활동 이야기를 관리합니다.',button('글 작성','content-edit',{icon:'plus'}))+toolbar(kind)+
  (rows.length?table(heads,rows.map(c=>row(c,c.title+' '+c.body,[esc(c.title),c.type==='notice'?'공지':'활동 기록',badge(c.published?'final':'draft'),date(c.updatedAt),'<div class="row-actions">'+button('수정','content-edit',{id:c.id,class:'button small secondary'})+deleteButton('content',c.id,'게시글')+'</div>'],heads))):empty('아직 작성한 글이 없습니다','초안으로 저장한 글은 홈페이지에 보이지 않습니다.',button('첫 글 작성','content-edit',{class:'button secondary'})))+next(ctx,kind);
 }
 if(kind==='admins'){
  const roleRows=(await ctx.api('listRoles')).rows,roleName=id=>roleRows.find(r=>r.id===id)?.name||id;
  const heads=['임원','부서 · 권한','임기 종료','상태','관리'];
  return heading('THE TEAM','임원 권한','Firebase Authentication에 존재하는 계정 UID를 임원으로 등록합니다.',button('임원 등록','admin-edit',{icon:'user-plus'}))+toolbar(kind)+table(heads,rows.map(a=>row(a,a.displayName+' '+a.role,[esc(a.displayName),'<span class="role-name">'+esc(roleName(a.role))+'</span>',date(a.expiresAt),a.active?'사용 가능':'중지',managementActions('admin',a.id,a.id!==ctx.state.profile.uid)],heads)));
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
 let html='<a class="back-link" href="/admin/events" data-nav>'+icon('arrow-left')+' 행사 목록</a>'+heading(esc(label(e.type)),esc(e.title),date(e.startsAt,true)+' · '+esc(e.location),write?'<div class="row-actions">'+button('신청 링크 재발급','event-link',{id:e.id,class:'button secondary',icon:'link'})+button('편집','event-edit',{id:e.id,icon:'pencil'})+deleteButton('events',e.id,'행사')+'</div>':'')+
 '<div class="event-statbar"><span>'+badge(e.status)+'</span><span>등록 <b>'+e.registered+'</b> / '+e.capacity+'명</span><span>대기 <b>'+e.waiting+'</b>명</span><span>참가비 <b>'+money(e.fee)+'</b></span></div>'+
 '<nav class="tabs" aria-label="행사 상세 메뉴">'+[['participants','신청 · 출석'],['detail','안내 · 정책'],['preparation','준비 · 결과']].map(([key,t])=>'<a href="/admin/events/'+id+'?tab='+key+'" data-nav class="'+(tab===key?'active':'')+'"'+(tab===key?' aria-current="page"':'')+'>'+t+'</a>').join('')+'</nav>';
 if(tab==='detail')return html+'<section class="panel padded"><h2>행사 안내</h2>'+textBlock(e.description)+'<hr><h3>취소 · 환불 안내</h3>'+textBlock(e.policy)+'<hr><h3>납부 안내</h3>'+textBlock(e.paymentInstructions||'무료 행사입니다.')+'<div class="detail-grid"><p>신청 시작<br><strong>'+date(e.opensAt,true)+'</strong></p><p>신청 마감<br><strong>'+date(e.closesAt,true)+'</strong></p><p>취소 마감<br><strong>'+date(e.cancelUntil,true)+'</strong></p></div></section>';
 if(tab==='preparation')return html+'<section class="panel padded"><h2>준비와 마무리</h2><p>관련 업무는 결정 · 할 일에 남기고, 사용한 재료는 재고 기록에서 이 행사에 연결해 주세요.</p><div class="quick-links">'+(can(ctx,'decisions')?'<a href="/admin/decisions" data-nav class="button secondary">할 일 관리</a>':'')+(can(ctx,'inventory')?'<a href="/admin/inventory" data-nav class="button secondary">재고 사용 기록</a>':'')+(can(ctx,'finance')?'<a href="/admin/finance" data-nav class="button secondary">지출 · 정산</a>':'')+'</div><ul class="checklist"><li>담당자와 장소 · 준비물 확인</li><li>참가자 · 납부 · 대기자 확인</li><li>행사 당일 수기 호명 후 출석 기록</li><li>사용한 재료와 지출 기록</li><li>환불 · 정산 확인 후 진행 완료 처리</li></ul></section>';
 const {rows,truncated}=await read(ctx,'applications',{eventId:e.id});const finance=can(ctx,'finance'),heads=['신청자','신청',...(finance?['납부']:[]),'출석','처리'];
 return html+toolbar('applications',['registered','waiting','offered','cancelled','expired'])+
 (e.status==='cancelled'?'<div class="notice-warning">행사가 취소되었습니다. 납부 내역이 있는 신청의 환불을 확인해 주세요.</div>':'')+
 (truncated?'<div class="notice-warning">참가자 500개까지만 불러왔습니다. 운영 담당자에게 확인해 주세요.</div>':'')+
 (rows.length?table(heads,rows.map(a=>row(a,a.name,['<strong>'+esc(a.name)+'</strong><small>'+date(a.createdAt,true)+'</small>',badge(a.status)+(a.status==='waiting'?'<small>접수 순서 '+a.sequence+'</small>':''),...(finance?[badge(a.payment)+'<small>'+money(a.paidAmount)+' 확인</small>']:[]),badge(a.attendance),'<div class="row-actions">'+button('신청 상세 · 처리','application-manage',{id:a.id,class:'button small secondary'})+(write?deleteButton('applications',a.id,'참가 신청'):'')+'</div>'],heads))):empty('아직 신청자가 없습니다','행사 신청 링크를 복사해서 부원들에게 전달해 주세요.'));
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
 return '<div class="workspace"><aside class="sidebar"><a href="/admin" data-nav class="side-brand"><img src="/assets/logo.png" alt="" width="42" height="42"><span>MARTINI<small>운영실</small></span></a><div class="side-semester">'+icon('calendar-days')+esc(ctx.state.settings.semester)+'<span>운영 중</span></div>'+button('메뉴 찾기','mobile-menu',{class:'button secondary menu-finder',icon:'search'})+'<nav aria-label="운영 메뉴">'+groupedNavigation(ctx,kind)+'</nav><div class="side-footer"><a href="/" data-nav>'+icon('arrow-up-right')+' 홈페이지 보기</a><button data-action="logout">'+icon('log-out')+' 로그아웃</button></div></aside><div class="workspace-main"><header class="workspace-header"><div class="breadcrumb">마티니 <span>/</span> '+esc(navigation.find(([k])=>k===kind)?.[2]||'운영실')+'</div><div class="account-chip"><span class="avatar">'+esc(ctx.state.profile.displayName.slice(0,1))+'</span><div>'+esc(ctx.state.profile.displayName)+'<small>'+esc(ctx.state.profile.roleName||label(ctx.state.profile.role))+'</small></div></div></header>'+(local?'<div class="local-strip">개발 환경 · 가상 데이터</div>':'')+'<main id="main-content" class="workspace-content">'+body+'</main><nav class="mobile-admin-nav" aria-label="빠른 운영 메뉴">'+navigation.filter(([k])=>['','events','inventory','meetings'].includes(k)&&(!k||can(ctx,k))).map(([key,i,t])=>'<a data-nav href="/admin'+(key?'/'+key:'')+'" class="'+(kind===key?'active':'')+'"'+(kind===key?' aria-current="page"':'')+'>'+icon(i)+'<span>'+t+'</span></a>').join('')+button('전체 메뉴','mobile-menu',{class:'mobile-more',icon:'menu'})+'</nav></div></div>';
}
export async function adminAction(ctx,action,id,target){
 if(action==='password-reset'){modal('비밀번호 재설정',field('email','가입한 이메일',document.querySelector('[name=email]')?.value||ctx.state.user?.email||'',{type:'email',required:true,wide:true,autocomplete:'email',inputmode:'email',maxLength:254}),async f=>{await sendPasswordResetEmail(auth,String(f.get('email')).trim());ctx.toast('등록된 계정이면 비밀번호 재설정 메일이 발송됩니다.');},{submit:'재설정 메일 요청'});return;}
 if(action==='logout'){ctx.state.profile=null;ctx.state.data={};ctx.state.authError='';await signOut(auth);return ctx.render();}
 if(action==='local-login'&&local){await signInWithEmailAndPassword(auth,'admin@martini.local','Martini-Local-2026!');ctx.state.profile=await ctx.api('profile');return ctx.render();}
 if(action==='mobile-menu'){
  const dialog=modal('운영 메뉴',field('menuSearch','메뉴 찾기','',{type:'search',wide:true,placeholder:'예: 출석, 예산, 안건',autocomplete:'off'})+'<nav class="mobile-menu-list wide" aria-label="전체 운영 메뉴">'+groupedNavigation(ctx,location.pathname.split('/')[2]||'')+'</nav><p class="wide help" data-menu-empty hidden>찾는 메뉴가 없습니다. 다른 업무 이름으로 검색해 주세요.</p>',null);
  const input=dialog.querySelector('[name=menuSearch]');
  input.addEventListener('input',()=>{const words=input.value.trim().toLocaleLowerCase('ko-KR').split(/\s+/);let count=0;dialog.querySelectorAll('[data-menu-item]').forEach(a=>{a.hidden=!words.every(w=>a.dataset.menuItem.toLocaleLowerCase('ko-KR').includes(w));if(!a.hidden)count++;});dialog.querySelectorAll('.nav-group').forEach(g=>g.hidden=![...g.querySelectorAll('a')].some(a=>!a.hidden));dialog.querySelector('[data-menu-empty]').hidden=!!count;});
  input.focus();return;
 }
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
