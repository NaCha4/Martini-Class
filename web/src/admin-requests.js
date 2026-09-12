import { esc, icon, button, field, textBlock, empty, modal } from './ui.js';
import './admin-requests.css';

const kinds={visit:'외부인 출입',join:'이전 가입 신청',inquiry:'문의'};
const statuses={pending:'승인 대기',approved:'승인',rejected:'반려',answered:'답변 완료',cancelled:'취소'};
const stamp=value=>value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value)):'—';
const status=r=>'<span class="badge request-status '+esc(r.status)+'">'+esc(r.kind==='inquiry'&&r.status==='pending'?'답변 대기':statuses[r.status]||r.status)+'</span>';
const title=r=>r.kind==='visit'?r.purpose:r.kind==='inquiry'?r.subject:r.department||'가입 신청';
function details(r){
 const applicant=r.applicant||r;
 return '<div class="wide request-detail"><div class="request-detail-head"><span class="eyebrow">'+esc(kinds[r.kind])+'</span>'+status(r)+'</div><h3>'+esc(title(r))+'</h3><dl class="request-facts"><div><dt>신청자</dt><dd>'+esc(applicant.name)+'</dd></div><div><dt>학번</dt><dd>'+esc(applicant.studentId)+'</dd></div><div><dt>연락처</dt><dd>'+esc(applicant.phone)+'</dd></div><div><dt>접수</dt><dd>'+stamp(r.createdAt)+'</dd></div>'+(r.kind==='visit'?'<div><dt>방문 시작</dt><dd>'+stamp(r.startsAt)+'</dd></div><div><dt>방문 종료</dt><dd>'+stamp(r.endsAt)+'</dd></div><div><dt>외부인</dt><dd>'+esc(r.guestCount)+'명 · '+esc(r.guestNames)+'</dd></div>':r.kind==='join'?'<div><dt>학과 · 학년</dt><dd>'+esc(r.department)+' · '+esc(r.grade)+'</dd></div>':'')+'</dl>'+textBlock(r.kind==='visit'?r.purpose:r.message||'별도 메시지가 없습니다.')+(r.response?'<div class="request-response"><h4>운영진 답변</h4>'+textBlock(r.response)+'<small>'+stamp(r.reviewedAt||r.updatedAt)+'</small></div>':'')+'</div>';
}
function renderRows(rows){
 return rows.map(r=>{const applicant=r.applicant||r;return '<article class="request-entry" data-searchable="'+esc([kinds[r.kind],applicant.name,applicant.studentId,title(r),r.guestNames].join(' '))+'" data-status="'+esc(r.status)+'" data-type="'+esc(r.kind)+'"><div class="request-entry-icon">'+icon(r.kind==='visit'?'door-open':r.kind==='join'?'user-plus':'message-circle')+'</div><div class="request-entry-main"><div class="request-entry-meta"><span>'+esc(kinds[r.kind])+'</span><span>'+stamp(r.createdAt)+'</span></div><h2>'+esc(title(r))+'</h2><p>'+esc(applicant.name)+(r.kind==='visit'?' · '+stamp(r.startsAt)+' · '+esc(r.guestCount)+'명':' · '+esc(applicant.department||r.department||applicant.studentId||''))+'</p></div><div class="request-entry-actions">'+status(r)+button(r.status==='pending'?'검토':'상세','club-request-review',{id:r.id,class:'button small secondary'})+'</div></article>';}).join('');
}
export async function renderAdminRequests(ctx){
 const result=ctx.state.requestPageReuse||await ctx.api('clubRequests');delete ctx.state.requestPageReuse;
 ctx.state.clubRequestPage=result;
 const rows=result.rows;
 return '<div class="page-heading"><div><h1 tabindex="-1">신청 · 문의</h1><p>방문 목적과 일정을 확인하고 출입을 승인하거나 문의에 답변하세요.</p></div>'+button('새로고침','club-request-refresh',{class:'button secondary',icon:'refresh-cw'})+'</div>'+
 '<div class="request-queue-summary">'+[['visit','외부인 출입 대기','door-open'],['inquiry','답변 대기','message-circle']].map(([kind,label,i])=>'<div>'+icon(i)+'<span>'+label+'</span><strong>'+rows.filter(r=>r.kind===kind&&r.status==='pending').length+'<small>건</small></strong></div>').join('')+'</div><p class="data-caption">불러온 '+rows.length+'건 기준'+(result.nextCursor?' · 이전 기록은 아래에서 더 불러올 수 있습니다.':'.')+'</p>'+
 '<div class="toolbar"><label class="search-box">'+icon('search')+'<input type="search" data-search aria-label="신청 검색" placeholder="이름 · 목적 · 학번 검색"></label><select data-filter aria-label="상태 필터"><option value="all">전체 상태</option>'+Object.entries(statuses).map(([s,t])=>'<option value="'+s+'">'+(s==='pending'?'처리 대기':t)+'</option>').join('')+'</select><select data-event-type aria-label="신청 종류"><option value="all">전체 종류</option>'+Object.entries(kinds).filter(([kind])=>kind!=='join'||rows.some(row=>row.kind==='join')).map(([k,t])=>'<option value="'+k+'">'+t+'</option>').join('')+'</select><span id="filtered-count" class="muted" role="status"></span></div>'+
 (rows.length?'<div class="request-list">'+renderRows(rows)+'</div>':empty('접수된 신청이 없습니다','부원 라운지에서 외부인 출입 신청이나 문의를 접수하면 이곳에 표시됩니다.','<a href="/members" data-nav class="button secondary">부원 라운지 열기</a>'))+
 (result.nextCursor?'<div class="pagination">'+button('이전 신청 더 보기','club-request-more',{class:'button secondary'})+'</div>':'')+
 '<section class="operations-note">'+icon('shield-check')+'<div><h3>출입 승인 안내</h3><p>승인된 시간과 방문 인원만 출입할 수 있습니다. 신청 부원이 동행하도록 안내하세요.</p></div></section>';
}
export async function adminRequestAction(ctx,action,id){
 if(action==='club-request-refresh'){return ctx.render();}
 if(action==='club-request-more'){
  const current=ctx.state.clubRequestPage;if(!current?.nextCursor)return;
  const more=await ctx.api('clubRequests',{cursor:current.nextCursor});ctx.state.requestPageReuse={rows:[...current.rows,...more.rows],nextCursor:more.nextCursor};return ctx.render();
 }
 if(action!=='club-request-review')return;
 const r=ctx.state.clubRequestPage?.rows.find(r=>r.id===id);if(!r)return;
 if(r.status!=='pending')return modal(kinds[r.kind]+' 내역',details(r),null,{wide:true});
 const inquiry=r.kind==='inquiry';
 const body=details(r)+(inquiry?'':field('decision','처리 결과','approve',{choices:[['approve','승인'],['reject','반려']],required:true,wide:true}))+field('response',inquiry?'답변':'신청자에게 전달할 안내','',{type:'textarea',maxLength:2000,required:inquiry,wide:true,hint:inquiry?'신청자가 본인의 접수 내역에서 답변을 확인합니다.':'반려할 때는 사유를 반드시 입력해 주세요.'});
 const dialog=modal(inquiry?'문의 답변':'신청 검토',body,async f=>{
  const decision=inquiry?'reply':String(f.get('decision')),response=String(f.get('response')||'').trim();
  if(decision==='reject'&&!response)throw new Error('반려 사유를 입력해 주세요.');
  await ctx.api('clubRequestCommand',{id:r.id,revision:r.revision,action:decision,response});await ctx.render();ctx.toast(inquiry?'답변을 저장했습니다.':decision==='approve'?'신청을 승인했습니다.':'신청을 반려했습니다.');
 },{wide:true,submit:inquiry?'답변 저장':'승인',busyText:'처리 중…'});
 if(!inquiry)dialog.querySelector('[name=decision]').addEventListener('change',event=>{
  const reject=event.target.value==='reject';dialog.querySelector('[name=response]').required=reject;dialog.querySelector('[type=submit]').textContent=reject?'반려':'승인';
 });
}
