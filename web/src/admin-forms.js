import { shortLink } from './share-links.js';
import { hasPermission, permissionLabels } from '../../functions/src/permissions.js';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, field, icon, badge, button, date, money, label, modal, textBlock, downloadCSV, refreshIcons } from './ui.js';
import { read,readAll,total,unit,rosterSemester } from './admin.js';
const uuid=()=>crypto.randomUUID();
const val=(f,n)=>String(f.get(n)||'').trim(),num=(f,n)=>Number(f.get(n)||0);
const localTime=v=>{const d=v?new Date(v):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const toISO=value=>new Date(value).toISOString();
const meta=r=>r?{id:r.id,revision:r.revision}:{revision:0};
const semester=ctx=>ctx.state.settings.semester||'2026-2';

async function record(ctx,kind,id){return id?(ctx.state.data[kind]?.[id]||(await read(ctx,kind,{recordId:id})).rows[0]):null;}
async function save(ctx,op,data){const result=await ctx.api(op,data);if(['saveContent','saveSettings'].includes(op))delete ctx.state.publicInfo;ctx.toast('저장했습니다.');await ctx.render();return result;}
function share(title,url){const personal=new URL(url).pathname.startsWith('/r/');modal(title,'<div class="wide prose">'+(personal?'이 링크로 신청 내용 확인과 취소가 가능합니다. 본인에게만 개별 전달해 주세요.':'이 링크를 가진 부원이 행사 내용을 확인하고 신청할 수 있습니다. 부원 공지 채널에 전달해 주세요.')+'</div>'+field('shareUrl','링크',url,{wide:true,readOnly:true,autocomplete:'off',spellcheck:false,hint:'링크 전체를 복사해 전달하세요.'})+'<div class="wide">'+button('링크 복사','copy-link',{icon:'copy'})+'</div>',null);}
function agendaRow(a={id:uuid(),title:'',notes:'',status:'planned'}){return '<section class="agenda-edit wide"><input type="hidden" name="agendaId" value="'+esc(a.id)+'"><div class="agenda-row-head"><h3>안건 <span data-agenda-number></span></h3><div class="row-actions">'+button('위로','agenda-up',{class:'button small ghost'})+button('아래로','agenda-down',{class:'button small ghost'})+button('제거','agenda-remove',{class:'button small ghost',icon:'x'})+'</div></div>'+field('agendaTitle','안건 제목',a.title,{required:true,maxLength:200,placeholder:'예: 개강총회 일정 확정'})+field('agendaNotes','논의 내용',a.notes,{type:'textarea',rows:4,maxLength:10000,placeholder:'논의한 의견, 합의한 내용, 남은 질문을 적어 주세요.'})+field('agendaStatus','논의 상태',a.status,{choices:[['planned','논의 예정'],['discussed','논의 완료'],['deferred','보류']]})+'</section>';}
function numberAgendas(){const rows=[...document.querySelectorAll('#agenda-rows .agenda-edit')];rows.forEach((r,i)=>{r.querySelector('[data-agenda-number]').textContent=i+1;r.querySelector('[data-action=agenda-up]').disabled=i===0;r.querySelector('[data-action=agenda-down]').disabled=i===rows.length-1;});refreshIcons();}
function editorSection(title,help,body){return '<section class="editor-section wide"><h3>'+title+'</h3><p class="help">'+help+'</p><div class="editor-fields">'+body+'</div></section>';}

async function memberEdit(ctx,id){
 const term=rosterSemester(ctx),r=id?(await read(ctx,'members',{recordId:id})).rows[0]:null;
 modal((r?'부원 정보 수정':'부원 등록')+' · '+term,field('name','이름',r?.name,{required:true,maxLength:40,autocomplete:'off'})+field('studentId','학번',r?.studentId,{required:true,maxLength:30,autocomplete:'off',spellcheck:false})+field('phone','전화번호',r?.phone,{required:true,type:'tel',inputmode:'tel',maxLength:30,autocomplete:'off',hint:'행사 신청에 사용할 부원 본인의 번호입니다.'})+field('college','단과대학',r?.college,{maxLength:80})+field('department','학과 · 학부',r?.department,{maxLength:80})+field('grade','학년',r?.grade,{maxLength:20})+field('gender','성별',['남성','여성'].includes(r?.gender)?r.gender:'',{choices:[['','선택 안 함'],['남성','남성'],['여성','여성']]})+field('note','부원 메모',r?.note,{type:'textarea',wide:true,rows:4,maxLength:3000,hint:'이름을 눌러 상세 화면을 열었을 때만 표시됩니다. 명부 목록과 CSV에는 포함되지 않습니다.'})+'<p class="wide help">등록할 부원의 학번과 연락처를 확인해 주세요. 등록 후에는 별도의 회비 납부 확인이 필요하지 않습니다.</p>',async f=>save(ctx,'saveMember',{...meta(r),name:val(f,'name'),studentId:val(f,'studentId'),phone:val(f,'phone'),college:val(f,'college'),department:val(f,'department'),grade:val(f,'grade'),gender:val(f,'gender'),note:val(f,'note'),semester:term}),{wide:true});
}
async function eventEdit(ctx,id){
 const r=await record(ctx,'events',id),start=new Date(Date.now()+7*86400000).toISOString(),end=new Date(Date.now()+7*86400000+7200000).toISOString();
 const dialog=modal(r?'행사 편집':'새 행사 만들기',(r?.sequence?'<div class="notice-warning wide" data-existing-applications role="status" hidden>신청 이력이 있습니다. 변경한 참가비·학기는 새 신청부터 적용됩니다. 기존 신청자의 금액·납부 내역과 대기 자격은 유지됩니다.</div>':'')+editorSection('1. 기본 정보','어떤 활동인지 먼저 알려주세요. 소개와 준비물은 신청 화면에 표시됩니다.',field('title','행사 이름',r?.title,{required:true,wide:true,maxLength:120,placeholder:'예: 9월 칵테일 기초 교육'})+
 field('type','활동 유형',r?.type||'meeting',{choices:['meeting','class','social','workshop','other']})+field('semester','학기',r?.semester||semester(ctx),{required:true,maxLength:30,hint:'예: 2026-2'})+
 field('description','소개 · 준비물',r?.description,{type:'textarea',wide:true,rows:4,maxLength:8000})+
 field('location','장소',r?.location||ctx.state.settings.location||'동아리방',{required:true,maxLength:200})+field('owner','진행 담당',r?.owner||'기획부',{maxLength:80}))+
 editorSection('2. 행사 · 신청 일정','행사 시간과 신청 기간을 구분해 입력하세요. 모든 시간은 현재 기기의 시간대 기준입니다.',
 field('startsAt','행사 시작',localTime(r?.startsAt||start),{type:'datetime-local',required:true})+field('endsAt','행사 종료',localTime(r?.endsAt||end),{type:'datetime-local',required:true})+
 field('opensAt','신청 시작',localTime(r?.opensAt),{type:'datetime-local',required:true})+field('closesAt','신청 마감',localTime(r?.closesAt||new Date(Date.now()+6*86400000)),{type:'datetime-local',required:true})+
 field('cancelUntil','취소 마감',localTime(r?.cancelUntil||new Date(Date.now()+6*86400000)),{type:'datetime-local',required:true,wide:true}))+
 editorSection('3. 정원 · 참가비','참가비와 취소 기준은 신청 전에 부원에게 안내됩니다.',field('capacity','정원',r?.capacity||20,{type:'number',min:1,max:500,required:true})+
 field('fee','참가비 (원)',r?.fee||0,{type:'number',min:0,max:1000000,required:true,hint:'무료 행사는 0원으로 입력하세요.'})+
 field('waitlist','정원 초과 시 대기 신청 허용',r?.waitlist??true,{type:'checkbox',wide:true})+
 field('bankName','은행명',r?.bankName||'',{maxLength:80,placeholder:'예: 카카오뱅크'})+
 field('accountHolder','예금주명',r?.accountHolder||'',{maxLength:80,placeholder:'계좌에 등록된 예금주명'})+
 field('accountNumber','입금 계좌번호',r?.accountNumber||'',{wide:true,maxLength:60,inputmode:'numeric',placeholder:'계좌번호를 입력하세요',hint:'숫자와 하이픈으로 입력하세요.'})+
 field('policy','취소 · 환불 안내',r?.policy||'취소 마감 전에는 확인 링크에서 취소할 수 있습니다. 마감 이후 취소와 환불은 운영진에게 문의해 주세요.',{type:'textarea',wide:true,required:true,rows:3,maxLength:2000}))+
 '<details class="editor-options wide"'+(r?.questions?.length?' open':'')+'><summary>추가 질문 · 선택 사항</summary><div class="editor-fields">'+field('questions','추가 질문 (줄마다 1개, 최대 3개)',r?.questions?.join('\n')||'',{type:'textarea',wide:true,rows:3,maxLength:602,hint:'등록한 질문은 신청자가 필수로 답해야 합니다. 필요한 질문만 추가하세요. 질문 하나당 200자까지 입력할 수 있습니다.'})+'</div></details>'+
 editorSection('4. 모집 상태 확인','초안으로 먼저 저장한 뒤 준비가 끝나면 모집 중으로 변경하세요.',field('status','모집 상태',r?.status||'draft',{choices:r?.status==='cancelled'?['cancelled']:['draft','open','closed','completed','cancelled'],wide:true})+'<p class="wide help" data-event-status-help></p>'+field('confirmCancellation','행사와 모든 신청을 취소하며, 이 행사를 다시 열 수 없음을 확인했습니다',false,{type:'checkbox',wide:true})),
 async f=>{
  const starts=Date.parse(val(f,'startsAt')),ends=Date.parse(val(f,'endsAt')),opens=Date.parse(val(f,'opensAt')),closes=Date.parse(val(f,'closesAt')),cancel=Date.parse(val(f,'cancelUntil'));
  if(starts>=ends)throw Error('행사 종료는 시작 이후로 정해 주세요.');
  if(opens>=closes)throw Error('신청 마감은 신청 시작 이후로 정해 주세요.');
  if(closes>starts)throw Error('신청 마감은 행사 시작 이전으로 정해 주세요.');
  if(cancel>starts)throw Error('취소 마감은 행사 시작 이전으로 정해 주세요.');
  const questions=val(f,'questions').split('\n').map(v=>v.trim()).filter(Boolean);
  if(questions.length>3||questions.some(q=>q.length>200))throw Error('추가 질문은 최대 3개, 질문 하나당 200자까지 입력해 주세요.');
  if(r?.status!=='cancelled'&&val(f,'status')==='cancelled'&&!f.has('confirmCancellation'))throw Error('행사 취소의 영향을 확인해 주세요.');
  const result=await save(ctx,'saveEvent',{...meta(r),title:val(f,'title'),type:val(f,'type'),semester:val(f,'semester'),description:val(f,'description'),location:val(f,'location'),owner:val(f,'owner'),startsAt:toISO(val(f,'startsAt')),endsAt:toISO(val(f,'endsAt')),opensAt:toISO(val(f,'opensAt')),closesAt:toISO(val(f,'closesAt')),cancelUntil:toISO(val(f,'cancelUntil')),capacity:num(f,'capacity'),fee:num(f,'fee'),status:val(f,'status'),waitlist:f.has('waitlist'),questions,policy:val(f,'policy'),accountNumber:val(f,'accountNumber'),bankName:val(f,'bankName'),accountHolder:val(f,'accountHolder')});
  if(result.linkKey)setTimeout(()=>share('행사 신청 링크',location.origin+shortLink('e',result.linkKey)),0);
 },{wide:true,submit:'행사 저장'});
 const updateStatus=()=>{const status=dialog.querySelector('[name=status]').value,confirmation=dialog.querySelector('[name=confirmCancellation]'),destructive=status==='cancelled'&&r?.status!=='cancelled';confirmation.closest('label').hidden=!destructive;confirmation.required=destructive;confirmation.disabled=!destructive;dialog.querySelector('[data-event-status-help]').textContent={draft:'초안은 신청을 받지 않습니다. 내용을 확인한 뒤 모집 중으로 변경하세요.',open:'신청 시작부터 마감까지, 활동 자격이 확인된 부원의 신청을 받습니다.',closed:'새 신청 접수를 중지합니다. 기존 신청은 유지됩니다.',completed:'행사 진행이 끝난 상태입니다. 출석과 정산 기록을 함께 확인하세요.',cancelled:r?.status==='cancelled'?'취소된 행사입니다. 새 모집이 필요하면 새 행사를 만들어 주세요.':'저장하면 등록·대기·승급 제안 중인 모든 신청도 취소됩니다. 이미 납부된 참가비는 환불을 별도로 처리해야 합니다.'}[status];const submit=dialog.querySelector('[type=submit]');submit.classList.toggle('danger',destructive);submit.textContent=destructive?'행사 취소 확정':'행사 저장';};
 dialog.querySelector('[name=status]').addEventListener('change',updateStatus);updateStatus();
 if(r?.sequence){const warn=()=>{dialog.querySelector('[data-existing-applications]').hidden=Number(dialog.querySelector('[name=fee]').value)===r.fee&&dialog.querySelector('[name=semester]').value.trim()===r.semester;};for(const name of ['fee','semester'])dialog.querySelector('[name='+name+']').addEventListener('input',warn);warn();}
}
async function itemEdit(ctx,id){
 const r=await record(ctx,'inventory',id);
 modal(r?'품목 정보 수정':'재고 품목 등록',field('name','품목 이름',r?.name,{required:true,wide:true,maxLength:100})+field('category','분류',r?.category||'spirit',{choices:['spirit','ingredient','supply','tool']})+field('unit','관리 단위',r?.unit||'bottle',{choices:[['bottle','병 (개봉 잔량 관리)'],['each','개'],['g','g'],['ml','mL'],['pack','팩']]})+field('size','한 병 용량 (mL)',r?.size||700,{type:'number',min:0,max:100000})+field('minimum','최소 보유량 (병 품목은 mL)',r?.minimum||0,{type:'number',min:0,max:100000})+field('location','보관 위치',r?.location||'동아리방',{required:true,wide:true,maxLength:100})+field('note','메모',r?.note,{type:'textarea',wide:true,rows:2,maxLength:1000})+'<p class="wide help">처음 등록한 품목의 수량은 0입니다. 등록 후 입고 또는 실사 기록으로 수량을 입력해 주세요.</p>',async f=>save(ctx,'saveItem',{...meta(r),name:val(f,'name'),category:val(f,'category'),unit:val(f,'unit'),size:num(f,'size'),minimum:num(f,'minimum'),location:val(f,'location'),note:val(f,'note')}),{wide:true});
}
async function stockRecord(ctx,id){
 const r=await record(ctx,'inventory',id),events=hasPermission(ctx.state.profile,'eventRead')?(await readAll(ctx,'events')).rows:[];
 const choices=[['receive','입고'],['use','미개봉 · 일반 수량 사용'],['count','미개봉 · 일반 수량 실사'],['move','품목 전체 위치 이동']];
 if(r.unit==='bottle')choices.splice(2,0,['open','새 병 개봉'],['remaining','개봉 병 잔량 기록'],['adjustRemaining','개봉 병 잔량 실사 · 정정']);
 const requestId=uuid();
 const dialog=modal('재고 기록 · '+r.name,'<div class="wide stock-current">현재 <strong>'+total(r).toLocaleString()+' '+unit(r)+'</strong> · 미개봉/일반 수량 '+r.quantity+'</div>'+field('action','작업 종류','receive',{choices})+field('amount','입고 수량',0,{type:'number',min:1,max:100000,step:r.unit==='g'||r.unit==='ml'?'0.1':'1',required:true})+
 (r.unit==='bottle'?field('bottleId','개봉 병',Object.keys(r.bottles||{})[0]||'',{choices:[['','병 선택'],...Object.entries(r.bottles||{}).map(([id,p],index)=>[id,'개봉 병 '+(index+1)+' · 현재 '+p+'%'])]})+field('percent','사용 후 잔량 (%)',50,{choices:Array.from({length:11},(_,i)=>[i*10,i*10+'%'])}):'')+
 field('location','이동할 위치',r.location,{maxLength:100})+field('eventId','연결 행사','',{choices:[['','행사 연결 안 함'],...events.map(e=>[e.id,e.title])]})+
 field('reason','사유', '',{required:true,wide:true,maxLength:500,hint:'입고·사용·실사 이유를 남겨 주세요. 개봉/잔량/이동 작업은 수량 입력값을 사용하지 않습니다.'}),
 async f=>save(ctx,'stock',{id:r.id,revision:r.revision,requestId,action:val(f,'action'),amount:num(f,'amount'),...(val(f,'bottleId')?{bottleId:val(f,'bottleId')} : {}),...(r.unit==='bottle'?{percent:num(f,'percent')}:{}),location:val(f,'location'),eventId:val(f,'eventId'),reason:val(f,'reason')}),{wide:true});
 const update=()=>{const action=dialog.querySelector('[name=action]').value,amount=dialog.querySelector('[name=amount]'),quantityAction=['receive','use','count'].includes(action),location=dialog.querySelector('[name=location]');amount.closest('label').hidden=!quantityAction;amount.required=quantityAction;amount.disabled=!quantityAction;amount.min=action==='count'?'0':amount.step;const title=amount.closest('label').querySelector('span');title.textContent={receive:'입고할 수량',use:'사용한 수량',count:'실사 후 남은 수량'}[action]||'수량';location.closest('label').hidden=action!=='move';location.required=action==='move';location.disabled=action!=='move';['bottleId','percent'].forEach(n=>{const el=dialog.querySelector('[name='+n+']');if(el){const visible=['remaining','adjustRemaining'].includes(action);el.closest('label').hidden=!visible;el.required=visible;el.disabled=!visible;}});};dialog.querySelector('[name=action]').onchange=update;update();
}
async function linkedRecords(ctx,kind,filter){
 const rows=[];let cursor;
 do{const page=await ctx.api('read',{kind,...filter,...(cursor?{cursor}:{})});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 ctx.state.data[kind]||={};rows.forEach(r=>ctx.state.data[kind][r.id]=r);return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
async function itemView(ctx,id){
 const r=await record(ctx,'inventory',id),moves=await linkedRecords(ctx,'stockMoves',{itemId:id});
 modal(r.name,'<div class="wide detail-grid"><p>보유량<br><strong>'+total(r).toLocaleString()+' '+unit(r)+'</strong></p><p>보관 위치<br><strong>'+esc(r.location)+'</strong></p></div><div class="wide row-actions">'+button('품목 수정','item-edit',{id,class:'button secondary'})+button('입고 · 사용 · 실사','stock-record',{id})+'</div><div class="wide"><h3>최근 변경 이력</h3>'+ (moves.length?moves.map(m=>'<div class="history-entry"><strong>'+esc(m.reason)+'</strong><p>'+m.before+' → '+m.after+' · '+esc(m.actor)+' · '+date(m.createdAt,true)+'</p></div>').join(''):'<p class="help">아직 이 품목의 변경 기록이 없습니다.</p>')+'</div>',null,{wide:true});
}
async function meetingEdit(ctx,id){
 const r=id?(await read(ctx,'meetings',{recordId:id})).rows[0]:null;
 const dialog=modal(r?'회의록 수정':'회의 기록하기',
 editorSection('회의 기본 정보','이름과 일시만 입력해도 초안을 저장할 수 있습니다.',field('title','회의 이름',r?.title,{required:true,wide:true,maxLength:160,placeholder:'예: 9월 운영회의'})+field('date','회의 일시',localTime(r?.date||new Date()),{type:'datetime-local',required:true})+field('status','회의록 상태',r?.status||'draft',{choices:[['draft','초안 · 회의 준비'],['in_progress','진행 중 · 기록 작성'],['final','확정 · 공유 가능']]}))+
 '<details class="editor-options wide"'+(r?' open':'')+'><summary>참석자 · 장소 · 학기</summary><div class="editor-fields">'+field('attendees','참석자 · 부서 (쉼표로 구분)',r?.attendees?.join(', ')||'',{wide:true,maxLength:2400,hint:'이름이나 부서를 쉼표로 구분해 입력하세요. 미정이면 비워두세요.'})+field('location','장소',r?.location||'동아리방',{maxLength:200})+field('semester','학기',r?.semester||semester(ctx),{required:true})+'</div></details>'+
 editorSection('안건별 기록','한 안건에 한 주제를 적으세요. 순서는 위로·아래로 버튼으로 바꿀 수 있습니다.','<div id="agenda-rows" class="wide">'+(r?.agendas||[]).map(agendaRow).join('')+'</div><div class="wide">'+button('안건 추가','agenda-add',{class:'button secondary',icon:'plus'})+'</div>')+
 editorSection('전체 요약','안건 외의 메모나 회의의 핵심 내용을 정리하세요.',field('body','회의 개요 · 전체 기록',r?.body,{type:'textarea',wide:true,rows:5,maxLength:30000,placeholder:'오늘 합의한 내용과 다음 회의에서 확인할 사항'})),
 async(f,form)=>{
 const agendas=[...form.querySelectorAll('.agenda-edit')].map(el=>({id:el.querySelector('[name=agendaId]').value,title:el.querySelector('[name=agendaTitle]').value.trim(),notes:el.querySelector('[name=agendaNotes]').value.trim(),status:el.querySelector('[name=agendaStatus]').value}));
 await save(ctx,'saveMeeting',{...meta(r),title:val(f,'title'),date:toISO(val(f,'date')),location:val(f,'location'),semester:val(f,'semester'),status:val(f,'status'),attendees:val(f,'attendees').split(',').map(x=>x.trim()).filter(Boolean),body:val(f,'body'),agendas});
 },{wide:true,submit:'회의록 저장'});dialog.classList.add('record-editor');numberAgendas();
}
async function meetingView(ctx,id){
 const r=await record(ctx,'meetings',id),canDecide=hasPermission(ctx.state.profile,'decisions'),decisions=canDecide?await linkedRecords(ctx,'decisions',{meetingId:id}):[];
 modal(r.title,'<div class="wide record-meta">'+badge(r.status)+'<span>'+date(r.date,true)+'</span><span>'+esc(r.location)+'</span><span>버전 '+r.revision+'</span></div><div class="wide row-actions">'+button('회의록 수정','meeting-edit',{id,class:'button secondary',icon:'pencil'})+(canDecide?button('결정 · 할 일 추가','decision-for-meeting',{id,icon:'plus'}):'')+button('수정 이력','meeting-history',{id,class:'button secondary',icon:'history'})+'</div><div class="wide"><p class="help">참석: '+esc(r.attendees.join(', ')||'미기록')+'</p><h3>전체 기록</h3>'+textBlock(r.body||'아직 내용이 없습니다.')+'</div><div class="wide agenda-view">'+r.agendas.map((a,i)=>'<section><div class="section-index">안건 '+(i+1)+' · '+esc({planned:'논의 예정',discussed:'논의 완료',deferred:'보류'}[a.status])+'</div><h3>'+esc(a.title)+'</h3>'+textBlock(a.notes||'논의 내용을 기록해 주세요.')+(canDecide?'<button type="button" class="button small secondary" data-action="decision-for-agenda" data-id="'+esc(id)+'" data-agenda="'+esc(a.id)+'">'+icon('plus')+'이 안건에서 할 일 만들기</button>':'')+'</section>').join('')+'</div>'+(canDecide?'<div class="wide"><h3>연결된 결정 · 할 일</h3>'+(decisions.length?decisions.map(d=>'<button class="linked-decision" data-action="decision-view" data-id="'+d.id+'">'+badge(d.status)+'<span>'+esc(d.title)+'</span>'+icon('arrow-right')+'</button>').join(''):'<p class="help">아직 연결된 결정이 없습니다.</p>')+'</div>':'') ,null,{wide:true});
}
async function decisionEdit(ctx,id,meetingId='',agendaId='',initialTitle=''){
 const r=id?(await read(ctx,'decisions',{recordId:id})).rows[0]:null,canMeet=hasPermission(ctx.state.profile,'meetings'),meetings=canMeet?(await readAll(ctx,'meetings')).rows:[];
 const selected=r?.meetingId||meetingId;
 if(selected&&!meetings.some(m=>m.id===selected))meetings.push(canMeet?await record(ctx,'meetings',selected):{id:selected,title:'연결된 회의',agendas:r?.agendaId?[{id:r.agendaId,title:'연결된 안건'}]:[]});
 const selectedMeeting=meetings.find(m=>m.id===selected);
 const dialog=modal(r?'결정 · 할 일 수정':'결정 · 할 일 추가',
 editorSection('무엇을 해야 하나요?','할 일은 실행할 작업을, 결정 사항은 합의한 내용을 남깁니다.',field('title','제목',r?.title||initialTitle,{required:true,wide:true,maxLength:160,placeholder:'예: 총회 장소 예약하기'})+field('type','구분',r?.type||'action',{choices:[['action','할 일 · 실행할 작업'],['decision','결정 사항 · 합의한 내용']]})+field('status','진행 상태',r?.status||'proposed',{choices:[['proposed','예정 · 검토 중'],['approved','결정됨'],['in_progress','진행 중'],['done','완료'],['deferred','보류']]}))+
 editorSection('누가, 언제까지 하나요?','담당자와 기한이 정해지면 후속 확인이 쉬워집니다. 미정이면 비워두세요.',field('owner','담당자 · 부서',r?.owner,{maxLength:80,placeholder:'예: 교육부'})+field('dueAt','완료 목표',r?.dueAt?localTime(r.dueAt):'',{type:'datetime-local'}))+
 field('body','결정 내용 · 이유 · 후속 처리',r?.body,{type:'textarea',wide:true,rows:5,maxLength:10000,placeholder:'완료 기준이나 결정 이유, 필요한 준비물을 적어 주세요.'})+
 '<details class="editor-options wide"'+(selected?' open':'')+'><summary>회의 · 안건 연결 및 학기</summary><div class="editor-fields">'+field('meetingId','연결 회의',selected,{choices:[['','회의 연결 안 함'],...meetings.map(m=>[m.id,m.title])]})+field('agendaId','연결 안건',r?.agendaId||agendaId,{choices:[['','회의 전체'],...(selectedMeeting?.agendas||[]).map(a=>[a.id,a.title])]})+field('semester','학기',r?.semester||meetings.find(m=>m.id===selected)?.semester||semester(ctx),{required:true})+'</div></details>',async f=>save(ctx,'saveDecision',{...meta(r),title:val(f,'title'),type:val(f,'type'),status:val(f,'status'),meetingId:val(f,'meetingId'),agendaId:val(f,'agendaId'),owner:val(f,'owner'),dueAt:val(f,'dueAt')?toISO(val(f,'dueAt')):'',semester:val(f,'semester'),body:val(f,'body')}),{wide:true,submit:'기록 저장'});dialog.classList.add('record-editor');
 dialog.querySelector('[name=meetingId]').onchange=event=>{const meeting=meetings.find(m=>m.id===event.target.value);dialog.querySelector('[name=agendaId]').innerHTML='<option value="">회의 전체</option>'+(meeting?.agendas||[]).map(a=>'<option value="'+a.id+'">'+esc(a.title)+'</option>').join('');};
}
async function decisionView(ctx,id){
 const d=await record(ctx,'decisions',id);
 modal(d.title,'<div class="wide record-meta">'+badge(d.type)+badge(d.status)+'<span>'+esc(d.owner||'담당 미정')+'</span><span>'+date(d.dueAt)+'</span></div><div class="wide">'+textBlock(d.body)+'</div><div class="wide row-actions">'+button('수정 · 진행 상태 변경','decision-edit',{id,class:'button secondary'})+button('수정 이력','decision-history',{id,class:'button secondary'})+(d.meetingId&&hasPermission(ctx.state.profile,'meetings')?button('연결된 회의 보기','meeting-view',{id:d.meetingId}):'')+'</div>',null,{wide:true});
}
async function history(ctx,kind,id){
 const {rows}=await ctx.api('read',{kind,parentId:id,revisions:true});
 modal('수정 이력','<div class="wide">'+rows.map(r=>'<details class="history-entry"><summary><strong>버전 '+r.revision+'</strong> · '+date(r.updatedAt,true)+' · '+esc(r.revisionActor)+'</summary><h3>'+esc(r.title)+'</h3>'+textBlock(r.body)+(r.agendas||[]).map(a=>'<h4>'+esc(a.title)+'</h4>'+textBlock(a.notes)).join('')+'<p class="help">'+esc(r.status)+' '+esc(r.owner||'')+'</p></details>').join('')+'</div>',null,{wide:true});
}
async function applicationManage(ctx,id){
 const a=await record(ctx,'applications',id),e=await record(ctx,'events',a.eventId),contact=await ctx.api('participantContact',{id});
 const showFinance=hasPermission(ctx.state.profile,'finance'),canEvent=!a.anonymizedAt&&hasPermission(ctx.state.profile,'events'),canFinance=!a.anonymizedAt&&showFinance;
 modal(a.name+' · 신청 처리','<p class="wide help">'+esc(contact.department)+' · '+esc(contact.studentId)+' · '+esc(contact.phone||'연락처 없음')+'</p><div class="wide record-meta">'+badge(a.status)+(showFinance?badge(a.payment):'')+badge(a.attendance)+'</div><div class="wide detail-grid"><p>참가비<br><strong>'+money(a.fee)+'</strong></p>'+(showFinance?'<p>납부 확인<br><strong>'+money(a.paidAmount)+'</strong></p><p>환불 확인<br><strong>'+money(a.refundAmount)+'</strong></p>':'')+'</div><div class="wide">'+a.answers.map((answer,i)=>'<h4>'+esc(e.questions[i]||'질문 '+(i+1))+'</h4>'+textBlock(answer)).join('')+'</div>'+
 (a.status==='offered'?'<p class="wide help">승급 응답 기한: '+date(a.offerExpiresAt,true)+'</p>':'')+
 '<div class="wide action-grid">'+
 (canEvent?button('확인 링크 재발급','receipt-reissue',{id,class:'button secondary'}):'')+
 (canEvent&&e.status!=='cancelled'&&a.status==='registered'?button('출석','attendance-present',{id})+button('불참','attendance-absent',{id,class:'button secondary'})+button('출석 미확인으로','attendance-unchecked',{id,class:'button secondary'}):'')+
 (canEvent&&a.status==='waiting'?button('대기 승급 제안','application-offer',{id}):'')+
 (canEvent&&a.status==='offered'?button('기한 지난 예약 해제','application-expire',{id,class:'button secondary'}):'')+
 (canEvent&&['registered','waiting','offered'].includes(a.status)?button('신청 취소 처리','application-cancel',{id,class:'button danger secondary'}):'')+
 (canFinance&&e.status!=='cancelled'&&a.status==='registered'&&a.fee>a.paidAmount?button('입금 확인 기록','application-payment',{id,icon:'wallet'}):'')+
 (canFinance&&a.paidAmount>a.refundAmount?button('환불 기록','application-refund',{id,class:'button secondary'}):'')+'</div>',null,{wide:true});
}
async function applicationChange(ctx,id,action,attendance){
 const a=await record(ctx,'applications',id),copy=action==='attendance'?{title:'출석 상태 변경',submit:label(attendance)+' 기록',description:'출석 상태를 '+label(attendance)+'으로 변경합니다.'}:action==='offer'?{title:'대기자에게 참가 제안',submit:'승급 제안',description:'이 부원의 자리를 응답 기한까지 예약합니다. 개인 확인 링크에서 수락하도록 직접 안내해 주세요.'}:action==='expire'?{title:'기한 지난 예약 해제',submit:'예약 해제',description:'응답 기한이 지난 예약을 해제합니다. 빈자리는 다음 대기자에게 제안할 수 있습니다.'}:{title:'신청 취소 처리',submit:'신청 취소 확정',description:'신청을 취소하고 예약된 자리를 반환합니다. 이미 납부된 참가비는 별도로 환불을 기록해야 합니다.'};
 modal(copy.title,'<p class="wide prose"><strong>'+esc(a.name)+'</strong>님의 신청에 적용합니다. '+copy.description+'</p>'+field('reason','처리 사유','',{required:true,wide:true,maxLength:500})+
 (action==='offer'?field('offerExpiresAt','승급 응답 기한',localTime(new Date(Date.now()+6*3600000)),{type:'datetime-local',required:true,wide:true}):''),
 async f=>save(ctx,'applicationCommand',{id,action,reason:val(f,'reason'),...(attendance?{attendance}:{}),...(action==='offer'?{offerExpiresAt:toISO(val(f,'offerExpiresAt'))}:{})}),{submit:copy.submit,submitClass:action==='cancel'||action==='expire'?'button danger':'button'});
}
async function budgetEdit(ctx,id){
 const r=id?(await read(ctx,'budgets',{recordId:id})).rows[0]:null;
 modal(r?'지출 계획 수정':'지출 계획 추가',field('title','사용 목적',r?.title,{required:true,wide:true,maxLength:160})+field('amount','예상 금액 (원)',r?.amount,{type:'number',min:1,max:100000000,required:true})+field('dueDate','예정일',r?.dueDate,{type:'date'})+field('semester','학기',r?.semester||semester(ctx),{required:true})+field('note','산정 근거 · 메모',r?.note,{type:'textarea',wide:true,maxLength:2000})+'<p class="wide help">계획은 실제 잔액을 차감하지 않습니다. 예정일이 없으면 미정으로 표시됩니다.</p>',async f=>save(ctx,'saveBudget',{...meta(r),title:val(f,'title'),amount:num(f,'amount'),dueDate:val(f,'dueDate'),semester:val(f,'semester'),note:val(f,'note')}));
}
async function budgetCommand(ctx,id,execute){
 const r=(await read(ctx,'budgets',{recordId:id})).rows[0];
 modal(execute?'지출 집행 완료':'지출 계획 삭제','<p class="wide">'+esc(r.title)+'</p>'+(execute?field('amount','실제 지출액 (원)',r.amount,{type:'number',min:1,max:100000000,required:true})+field('confirmed','실제로 지출했으며 장부에 별도로 기록하지 않았습니다',false,{type:'checkbox',required:true,wide:true})+'<p class="wide help">실제 지출액을 장부에 기록하고 예정 지출에서 제외합니다. 송금은 실행하지 않습니다.</p>':'<p class="wide help">이 계획을 예상 지출에서 제외합니다. 실제 장부는 변경하지 않습니다.</p>'),async f=>save(ctx,execute?'executeBudget':'deleteBudget',{id:r.id,revision:r.revision,...(execute?{amount:num(f,'amount'),confirmed:f.has('confirmed')}:{})}),{submit:execute?'집행 완료 기록':'계획 삭제',submitClass:execute?'button':'button danger'});
}
async function financeAdd(ctx,applicationId='',refund=false){
 if(!hasPermission(ctx.state.profile,'finance'))throw Error('회비 · 정산 권한이 없습니다.');
 const a=applicationId?await record(ctx,'applications',applicationId):null;
 const events=(await readAll(ctx,'events')).rows,members=(await readAll(ctx,'members',{semester:a?.semester||semester(ctx)})).rows;
 const requestId=uuid(),choices=a?[[refund?'refund':'income',refund?'참가비 환불':'참가비 입금']]:[['income','기타 수입'],['expense','지출'],['dues','학기 회비']];
 const dialog=modal(refund?'환불 완료 기록':'입금 · 지출 기록',field('kind','구분',refund?'refund':'income',{choices})+field('amount','금액 (원)',a?(refund?a.paidAmount-a.refundAmount:a.fee-a.paidAmount):'',{type:'number',min:1,max:a?(refund?a.paidAmount-a.refundAmount:a.fee-a.paidAmount):100000000,required:true})+field('title','내용',a?a.eventTitle+' · '+a.name:'',{required:true,wide:true,maxLength:160})+field('eventId','연결 행사',a?.eventId||'',{choices:a?[[a.eventId,a.eventTitle]]:[['','행사 연결 안 함'],...events.map(e=>[e.id,e.title])]})+field('memberId','회비 납부 부원','',{choices:[['','선택 안 함'],...members.filter(m=>!m.anonymizedAt).map(m=>[m.id,m.name+' · '+m.studentId])]})+field('semester','학기',a?.semester||semester(ctx),{required:true,maxLength:30,readOnly:!!a})+field('note','메모', '',{type:'textarea',wide:true,rows:2,maxLength:2000})+field('confirmed','실제 거래 내역을 확인했습니다',false,{type:'checkbox',required:true,wide:true})+'<p class="wide help">이 기능은 실제 입금·송금·환불을 실행하지 않습니다. 은행에서 처리한 내용을 기록합니다.</p>',async f=>save(ctx,'finance',{requestId,kind:val(f,'kind'),amount:num(f,'amount'),title:val(f,'title'),eventId:a?.eventId||val(f,'eventId'),applicationId:a?.id||'',memberId:val(f,'memberId'),semester:val(f,'semester'),note:val(f,'note')}),{wide:true});
 let termRequest=0;
 dialog.querySelector('[name=semester]').addEventListener('change',async e=>{
  const term=e.target.value.trim(),request=++termRequest,select=dialog.querySelector('[name=memberId]');select.replaceChildren(new Option('선택 안 함',''));select.disabled=true;
  try{if(!/^20\d{2}-[12]$/.test(term))throw Error('학기를 2026-2 형식으로 입력해 주세요.');const result=await readAll(ctx,'members',{semester:term});if(request!==termRequest)return;result.rows.filter(m=>!m.anonymizedAt).forEach(m=>select.add(new Option(m.name+' · '+m.studentId,m.id)));dialog.querySelector('.form-error').textContent='';}
  catch(error){if(request===termRequest)dialog.querySelector('.form-error').textContent=error.message;}
  finally{if(request===termRequest)select.disabled=false;}
 });
 const update=()=>{const dues=dialog.querySelector('[name=kind]').value==='dues';dialog.querySelector('[name=memberId]').closest('label').hidden=!dues;dialog.querySelector('[name=memberId]').required=dues;};dialog.querySelector('[name=kind]').onchange=update;update();
}
async function settingsEdit(ctx){
 const r=ctx.state.settings?.id?ctx.state.settings:null;
 modal('학기 · 운영 설정',field('semester','현재 학기',r?.semester||'2026-2',{required:true,hint:'명부·행사·회의 기록을 구분하는 학기입니다. 예: 2026-2'})+field('location','기본 활동 장소',r?.location||'동아리방',{required:true})+field('joinUrl','가입 오픈채팅 링크',openChatUrl(r?.joinUrl),{type:'url',inputmode:'url',spellcheck:false,wide:true,hint:'https://open.kakao.com/o/… 주소를 입력하세요. 비워두면 준비 중으로 표시합니다.'})+field('contact','동아리 문의 채널',r?.contact,{wide:true,maxLength:200,hint:'행사 문의를 받을 연락 방법입니다. 가입 오픈채팅을 그대로 사용하면 비워도 됩니다.'})+field('intro','동아리 소개',r?.intro||'칵테일을 배우고, 함께 만들고, 가까워지는 동아리 마티니.',{type:'textarea',wide:true,required:true,maxLength:2000,rows:3})+'<p class="wide help">가입 방법은 오픈채팅에서 안내합니다. 개인정보 처리방침은 <a href="/privacy" target="_blank" rel="noopener noreferrer">홈페이지에서 확인 (새 탭)</a>할 수 있습니다.</p>',async f=>{
  const joinUrl=val(f,'joinUrl');
  if(joinUrl&&!openChatUrl(joinUrl))throw Error('카카오톡 오픈채팅 주소를 확인해 주세요. https://open.kakao.com/o/… 형식으로 입력하세요.');
  return save(ctx,'saveSettings',{...meta(r),semester:val(f,'semester'),location:val(f,'location'),contact:val(f,'contact'),joinUrl:openChatUrl(joinUrl),intro:val(f,'intro')});
 },{wide:true});
}
async function contentEdit(ctx,id){
 const r=await record(ctx,'content',id);
 modal('공지 · 활동 기록',field('title','제목',r?.title,{required:true,wide:true,maxLength:160})+field('type','유형',r?.type||'notice',{choices:[['notice','공지'],['activity','활동 기록']]})+field('semester','학기',r?.semester||semester(ctx),{required:true})+field('body','내용',r?.body,{type:'textarea',wide:true,rows:10,maxLength:16000})+field('published','홈페이지에 공개',r?.published,{type:'checkbox',wide:true,hint:'부원 개인정보나 비공개 행사 신청 링크가 포함되지 않았는지 확인하세요.'}),async f=>save(ctx,'saveContent',{...meta(r),title:val(f,'title'),type:val(f,'type'),semester:val(f,'semester'),body:val(f,'body'),published:f.has('published')}),{wide:true});
}

async function roleEdit(ctx,id){
 if(!hasPermission(ctx.state.profile,'admins'))throw Error('역할 관리 권한이 없습니다.');
 const r=id?(await ctx.api('listRoles')).rows.find(role=>role.id===id):null;
 modal(r?'역할 수정':'역할 만들기',field('name','역할 이름',r?.name,{required:true,wide:true,maxLength:50})+'<fieldset class="wide role-permissions"><legend>사용할 수 있는 업무</legend>'+Object.entries(permissionLabels).map(([key,title])=>field('permission-'+key,title,r?.permissions.includes(key)||false,{type:'checkbox'})).join('')+'</fieldset><p class="wide help">선택한 업무만 메뉴에 표시됩니다. 회비·정산은 해당 담당 역할에만 선택하세요.</p>',async f=>{
  const permissions=Object.keys(permissionLabels).filter(key=>f.has('permission-'+key));
  if(!permissions.length)throw Error('업무 권한을 하나 이상 선택해 주세요.');
  return save(ctx,'saveRole',{...meta(r),name:val(f,'name'),permissions});
 },{wide:true});
}
async function roleDelete(ctx,id){
 const r=(await ctx.api('listRoles')).rows.find(role=>role.id===id);
 if(!r)throw Error('역할을 찾을 수 없습니다.');
 if(['owner','chair'].includes(r.id))throw Error('회장·부회장 역할은 삭제할 수 없습니다.');
 if(r.assigned)throw Error('이 역할을 배정받은 임원의 역할을 먼저 변경해 주세요.');
 modal('역할 삭제','<p class="wide">'+esc(r.name)+' 역할을 삭제합니다. 삭제한 역할은 임원에게 배정할 수 없으며, 되돌릴 수 없습니다.</p>',async()=>save(ctx,'deleteRole',{id:r.id,revision:r.revision}),{submit:'역할 삭제',submitClass:'button danger'});
}

async function adminDelete(ctx,id){
 const r=(await read(ctx,'admins',{recordId:id})).rows[0];
 if(!r)throw Error('임원을 찾을 수 없습니다.');
 if(id===ctx.state.profile.uid)throw Error('본인 계정은 삭제할 수 없습니다.');
 modal('임원 삭제','<p class="wide"><strong>'+esc(r.displayName)+'</strong> 님을 임원 목록에서 삭제합니다. 삭제 후에는 관리자 화면에 접근할 수 없습니다.</p><p class="wide help">부원 명부와 기존 업무 기록은 유지됩니다. 다시 임원으로 등록할 수 있습니다.</p>',async()=>save(ctx,'deleteAdmin',{uid:id,updatedAt:r.updatedAt}),{submit:'임원 삭제',submitClass:'button danger'});
}
async function adminEdit(ctx,id){
 const availableRoles=(await ctx.api('listRoles')).rows;
 const r=await record(ctx,'admins',id);
 modal('임원 계정 권한',field('uid','Firebase Authentication UID',r?.id,{required:true,wide:true,maxLength:100,readOnly:!!r,autocomplete:'off',spellcheck:false})+field('displayName','표시 이름',r?.displayName,{required:true,maxLength:80})+field('role','부서 · 역할',r?.role||'execution',{choices:availableRoles.map(role=>[role.id,role.name])})+field('expiresAt','임기 종료',localTime(r?.expiresAt||new Date(Date.now()+120*86400000)),{type:'datetime-local',required:true})+field('active','관리자 접근 허용',r?.active??true,{type:'checkbox'})+'<p class="wide help">계정을 새로 만들거나 비밀번호를 변경하지 않습니다. 지정한 계정의 시스템 내 권한만 변경합니다.</p>',async f=>save(ctx,'saveAdmin',{uid:val(f,'uid'),displayName:val(f,'displayName'),role:val(f,'role'),expiresAt:toISO(val(f,'expiresAt')),active:f.has('active')}),{wide:true});
}
async function exportRecords(ctx,kind){
 const rows=ctx.state.pages[kind]?.rows||Object.values(ctx.state.data[kind]||{}),more=!!ctx.state.pages[kind]?.nextCursor;
 modal('자료 내보내기','<p class="wide prose">현재 불러온 기록 <strong>'+rows.length+'건</strong>을 CSV로 내려받습니다. 검색과 상태 필터는 내보내기에 적용되지 않습니다.'+(more?' 전체 기록이 필요하면 목록에서 기록을 더 불러온 뒤 다시 진행해 주세요.':'')+'</p>'+field('reason','사용 목적','',{required:true,wide:true,maxLength:200})+'<p class="wide help">명부 파일은 필요한 담당자에게만 전달하고 사용 후 정리해 주세요.</p>',async f=>{
  await ctx.api('recordExport',{kind,reason:val(f,'reason')});
  const columns=kind==='members'?['name','studentId','phone','college','department','grade','gender']:['title','status','semester','updatedAt'];
  downloadCSV('martini-'+kind+(kind==='members'?'-'+rosterSemester(ctx):'')+'.csv',[columns,...rows.map(r=>columns.map(k=>r[k]))]);
 });
}
export async function handleAdminAction(ctx,action,id,target){
 if(action==='record-delete'){
  const kind=target.dataset.kind,titles={events:'행사',applications:'참가 신청',finance:'입출금 기록',inventory:'품목',meetings:'회의록',decisions:'결정 · 할 일',content:'게시글'};
  if(!titles[kind])throw Error('삭제할 항목을 확인해 주세요.');
  const r=(await read(ctx,kind,{recordId:id})).rows[0];
  const effects={events:'행사 목록과 신청 링크에서 제외됩니다. 진행 중인 행사는 먼저 취소하거나 완료하고, 미납·대기·환불을 정리해 주세요. 연결된 신청·정산 이력은 보관됩니다.',applications:'취소·만료된 신청만 삭제할 수 있습니다. 환불이 남아 있으면 먼저 처리해 주세요. 개인 확인 링크는 사용할 수 없게 됩니다.',finance:'장부에서 제외하고 잔액을 다시 계산합니다. 연결된 납부·환불 금액과 회비 기록도 함께 정정됩니다. 집행한 지출 계획은 예정 상태로 돌아갑니다. 실제 송금·환불은 실행하지 않습니다.',inventory:'품목 목록에서 제외됩니다. 보유 수량은 먼저 사용·폐기·실사로 정리해야 합니다. 입출고 이력은 보관됩니다.',meetings:'회의록 목록에서 제외됩니다. 연결된 결정·할 일은 먼저 회의 연결을 해제하거나 삭제해 주세요.',decisions:'결정·할 일 목록에서 제외됩니다. 연결된 회의 내용은 변경하지 않습니다.',content:'목록과 홈페이지에서 게시글이 내려갑니다.'};
  modal(titles[kind]+' 삭제','<div class="wide delete-impact"><strong>'+esc(r.title||r.name||titles[kind])+'</strong><p>'+effects[kind]+'</p>'+(kind==='finance'?'<p>삭제 금액: <strong>'+money(r.amount)+'</strong> · '+esc(label(r.kind))+'</p>':'')+'</div><p class="wide help">삭제 이력과 원본은 정산·운영 기록을 위해 보관합니다. 개인정보 영구 정리는 학기말 정보 정리에서 진행합니다.</p>'+field('confirmed','삭제 대상과 영향을 확인했습니다',false,{type:'checkbox',required:true,wide:true}),async()=>{
   await ctx.api('deleteRecord',{kind,id,updatedAt:r.updatedAt,...(r.revision!==undefined?{revision:r.revision}:{}),confirmed:true});
   ctx.state.data={};ctx.state.pages={};delete ctx.state.publicInfo;
   if(kind==='events'&&location.pathname.replace(/\/+$/,'')==='/admin/events/'+id)await ctx.navigate('/admin/events',{discard:true});else await ctx.render();
   ctx.toast(titles[kind]+'을 삭제했습니다.');
  },{submit:'삭제',submitClass:'button danger',busyText:'삭제 중…'});return;
 }
 if(action==='roster-term'){
  modal('학기 열기',field('semester','학기',rosterSemester(ctx),{required:true,pattern:'20[0-9]{2}-[12]',hint:'예: 2026-2 또는 2027-1'}),async f=>{const term=val(f,'semester');if(!/^20\d{2}-[12]$/.test(term))throw Error('학기는 2026-2 형식으로 입력해 주세요.');await ctx.navigate('/admin/members?semester='+term,{discard:true});},{submit:'명부 열기'});return;
 }

 if(action==='privacy-preview'){
  const current=ctx.state.settings.semester.split('-').map(Number),semester=ctx.state.privacySemester||(current[1]===2?current[0]+'-1':(current[0]-1)+'-2');
  const plan=await ctx.api('privacyReview',{semester,memberId:id});
  modal('개인정보 정리 · '+plan.name,'<div class="wide prose">'+esc(semester)+' 학기 · 명부 '+plan.counts.member+'건, 신청 및 재신청 이력 '+plan.counts.application+'건, 정산 '+plan.counts.finance+'건, 변경 이력 '+plan.counts.audit+'건을 정리합니다. 금액·참가 집계·연결 관계는 유지됩니다.</div>'+
   (plan.blockers.length?'<div class="wide notice-warning">'+plan.blockers.map(esc).join('<br>')+'</div>':field('reason','정리 사유','학기 보존 기한 종료',{required:true,wide:true,maxLength:200})+field('confirmation','확인 문구: '+semester+' 정리','',{required:true,wide:true})+'<p class="wide help">저장하면 즉시 적용됩니다. 복구할 수 없으므로 대상과 정산 내역을 먼저 확인해 주세요.</p>'),
   plan.blockers.length?null:async f=>save(ctx,'privacyAnonymize',{semester,memberId:id,fingerprint:plan.fingerprint,confirmation:val(f,'confirmation'),reason:val(f,'reason')}),{submit:'개인정보 영구 정리',submitClass:'button danger',wide:true});return;
 }
 if(action==='member-view'){
  const r=(await read(ctx,'members',{recordId:id})).rows[0];
  modal('부원 정보 · '+r.name,'<div class="wide detail-grid"><p>학기<br><strong>'+esc(rosterSemester(ctx))+'</strong></p><p>학번<br><strong>'+esc(r.studentId)+'</strong></p><p>전화번호<br><strong>'+esc(r.phone)+'</strong></p><p>소속<br><strong>'+esc([r.college,r.department].filter(Boolean).join(' · ')||'미입력')+'</strong></p></div><section class="wide"><h3>부원 메모</h3>'+textBlock(r.note||'작성된 메모가 없습니다.')+'</section>'+(!r.removedAt&&!r.anonymizedAt?'<div class="wide">'+button('정보 · 메모 수정','member-edit',{id:r.id,class:'button secondary'})+'</div>':''),null,{wide:true});return;
 }
 if(action==='member-remove'){
  const term=rosterSemester(ctx),r=await record(ctx,'members',id);
  if(!r)throw Error('명부를 다시 불러와 주세요.');
  modal('학기 명부에서 제거','<p class="wide"><strong>'+esc(r.name)+'</strong> · '+esc(term)+'</p><p class="wide help">이 학기의 명부와 인원 집계에서 제외합니다. 다른 학기 정보와 기존 행사 신청·정산 기록은 그대로 유지됩니다. 새 행사 신청과 대기 승급은 제한됩니다.</p>',async()=>{
   await ctx.api('removeMember',{id:r.id,semester:term,revision:r.revision});delete ctx.state.data.members;delete ctx.state.pages.members;
   ctx.toast('이 학기 명부에서 제거했습니다.');await ctx.render();
  },{submit:'명부에서 제거',submitClass:'button danger'});return;
 }
 if(action==='member-edit')return memberEdit(ctx,id);
 if(action==='event-edit')return eventEdit(ctx,id);
 if(action==='item-edit')return itemEdit(ctx,id);
 if(action==='item-view')return itemView(ctx,id);
 if(action==='stock-record')return stockRecord(ctx,id);
 if(action==='meeting-edit')return meetingEdit(ctx,id);
 if(action==='meeting-view')return meetingView(ctx,id);
 if(action==='decision-edit')return decisionEdit(ctx,id);
 if(action==='decision-for-meeting')return decisionEdit(ctx,null,id);
 if(action==='decision-view')return decisionView(ctx,id);
 if(action==='decision-progress'){
 const d=await record(ctx,'decisions',id);
 const status=d.status==='in_progress'?'done':d.status==='done'?'proposed':'in_progress';
 const data={id:d.id,revision:d.revision,title:d.title,body:d.body,type:d.type,meetingId:d.meetingId,agendaId:d.agendaId||'',owner:d.owner,dueAt:d.dueAt,status,semester:d.semester};
 await ctx.api('saveDecision',data);ctx.toast(status==='done'?'완료했습니다. 다시 열기로 되돌릴 수 있습니다.':'진행 상태를 변경했습니다.');await ctx.render();return;
 }
 if(action==='decision-for-agenda'){
 const m=(await read(ctx,'meetings',{recordId:id})).rows[0],a=m.agendas.find(a=>a.id===target.dataset.agenda);if(!a)throw Error('안건을 다시 확인해 주세요.');return decisionEdit(ctx,null,id,a.id,a.title);
 }
 if(action==='agenda-up'||action==='agenda-down'){const row=target.closest('.agenda-edit'),sibling=action==='agenda-up'?row.previousElementSibling:row.nextElementSibling;if(sibling){if(action==='agenda-up')sibling.before(row);else sibling.after(row);numberAgendas();row.querySelector('[name=agendaTitle]').focus();}return;}
 if(action==='meeting-history')return history(ctx,'meetings',id);
 if(action==='decision-history')return history(ctx,'decisions',id);
 if(action==='agenda-add'){const container=document.querySelector('#agenda-rows');if(container.children.length>=30)throw Error('회의 안건은 최대 30개입니다.');container.insertAdjacentHTML('beforeend',agendaRow());container.lastElementChild.querySelector('[name=agendaTitle]').focus();numberAgendas();return;}
 if(action==='agenda-remove'){const row=target.closest('.agenda-edit');if([...row.querySelectorAll('[name=agendaTitle],[name=agendaNotes]')].some(input=>input.value.trim())){if(!row.querySelector('[data-agenda-confirm]'))row.insertAdjacentHTML('beforeend','<div class="notice-warning" data-agenda-confirm><p>이 안건의 제목과 논의 내용을 제거합니다. 회의록을 저장하기 전까지는 기존 기록이 유지됩니다.</p><div class="row-actions">'+button('안건 제거','agenda-remove-confirm',{class:'button small danger'})+button('안건 유지','agenda-remove-keep',{class:'button small secondary'})+'</div></div>');row.querySelector('[data-action=agenda-remove-keep]').focus();}else{const focus=row.previousElementSibling?.querySelector('[name=agendaTitle]')||row.nextElementSibling?.querySelector('[name=agendaTitle]')||document.querySelector('[data-action=agenda-add]');row.remove();numberAgendas();focus?.focus();}return;}
 if(action==='agenda-remove-confirm'){const row=target.closest('.agenda-edit'),focus=row.previousElementSibling?.querySelector('[name=agendaTitle]')||row.nextElementSibling?.querySelector('[name=agendaTitle]')||document.querySelector('[data-action=agenda-add]');row.remove();numberAgendas();focus?.focus();return;}
 if(action==='agenda-remove-keep'){const row=target.closest('.agenda-edit');row.querySelector('[data-agenda-confirm]')?.remove();row.querySelector('[name=agendaTitle]').focus();return;}
 if(action==='event-link'){
  const e=await record(ctx,'events',id);
  modal('신청 링크 다시 만들기','<p class="wide prose">새 링크를 만들면 이전 행사 신청 링크는 사용할 수 없습니다. 기존 참가자의 개인 확인 링크는 유지됩니다.</p>',async()=>{const result=await save(ctx,'rotateEventLink',{id,revision:e.revision});setTimeout(()=>share('행사 신청 링크',location.origin+shortLink('e',result.linkKey)),0);},{submit:'이전 링크 만료 · 재발급',submitClass:'button danger'});return;
 }
 if(action==='copy-link'){const input=document.querySelector('[name=shareUrl]');try{await navigator.clipboard.writeText(input.value);ctx.toast('링크를 복사했습니다.');}catch{input.select();ctx.toast('선택된 링크를 복사해 주세요.');}return;}
 if(action==='receipt-reissue'){modal('개인 확인 링크 재발급',field('reason','본인 확인 및 재발급 사유','',{required:true,wide:true,maxLength:200})+'<p class="wide help">기존 확인 링크는 즉시 만료됩니다. 신원을 확인한 본인에게만 새 링크를 전달해 주세요.</p>',async f=>{const result=await save(ctx,'rotateReceipt',{id,reason:val(f,'reason')});setTimeout(()=>share('개인 신청 확인 링크',location.origin+shortLink('r',result.key)),0);});return;}
 if(action==='application-manage')return applicationManage(ctx,id);
 if(action.startsWith('attendance-'))return applicationChange(ctx,id,'attendance',action.replace('attendance-',''));
 if(action==='application-offer')return applicationChange(ctx,id,'offer');
 if(action==='application-expire')return applicationChange(ctx,id,'expire');
 if(action==='application-cancel')return applicationChange(ctx,id,'cancel');
 if(action==='application-payment')return financeAdd(ctx,id,false);
 if(action==='application-refund')return financeAdd(ctx,id,true);
 if(action==='budget-edit')return budgetEdit(ctx,id);
 if(action==='budget-delete')return budgetCommand(ctx,id,false);
 if(action==='budget-execute')return budgetCommand(ctx,id,true);
 if(action==='finance-add')return financeAdd(ctx);
 if(action==='settings-edit')return settingsEdit(ctx);
 if(action==='content-edit')return contentEdit(ctx,id);
 if(action==='role-edit')return roleEdit(ctx,id);
 if(action==='role-delete')return roleDelete(ctx,id);
 if(action==='admin-edit')return adminEdit(ctx,id);
 if(action==='admin-delete')return adminDelete(ctx,id);
 if(action==='export')return exportRecords(ctx,id);
}
export async function handleAdminSubmit(){}
