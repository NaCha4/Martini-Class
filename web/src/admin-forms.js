import { hasStaffFee, staffCheckbox } from './staff-pricing.js';
import { billingFee } from '../../functions/src/billing.js';
import { shortLink } from './share-links.js';
import { hasPermission, permissionLabels } from '../../functions/src/permissions.js';
import { openChatUrl } from '../../functions/src/public-links.js';
import { esc, field, icon, badge, button, date, money, label, modal, textBlock, downloadCSV } from './ui.js';
import { read,total,unit,rosterSemester } from './admin-data.js';
import { itemEdit } from './inventory-forms.js';
const uuid=()=>crypto.randomUUID();
const val=(f,n)=>String(f.get(n)||'').trim(),num=(f,n)=>Number(f.get(n)||0);
const localTime=v=>{const d=v?new Date(v):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const toISO=value=>new Date(value).toISOString();
const meta=r=>r?{id:r.id,revision:r.revision}:{revision:0};
const semester=ctx=>ctx.state.settings.semester||'2026-2';

async function record(ctx,kind,id){return id?(ctx.state.data[kind]?.[id]||(await read(ctx,kind,{recordId:id})).rows[0]):null;}
async function save(ctx,op,data){const result=await ctx.api(op,data);if(op==='saveSettings')delete ctx.state.publicInfo;ctx.toast('저장했습니다.');await ctx.render();return result;}
function share(title,url){const personal=new URL(url).pathname.startsWith('/r/');modal(title,'<div class="wide prose">'+(personal?'이 링크로 신청 내용 확인과 취소가 가능합니다. 본인에게만 개별 전달해 주세요.':'이 링크를 가진 부원이 행사 내용을 확인하고 신청할 수 있습니다. 신청받을 부원에게 전달해 주세요.')+'</div>'+field('shareUrl','링크',url,{wide:true,readOnly:true,autocomplete:'off',spellcheck:false,hint:'링크 전체를 복사해 전달하세요.'})+'<div class="wide">'+button('링크 복사','copy-link',{icon:'copy'})+'</div>',null);}
async function memberEdit(ctx,id){
 const term=rosterSemester(ctx),r=id?(await read(ctx,'members',{recordId:id})).rows[0]:null;
 modal((r?'부원 정보 수정':'부원 등록')+' · '+term,field('name','이름',r?.name,{required:true,maxLength:40,autocomplete:'off'})+field('studentId','학번',r?.studentId,{required:true,maxLength:30,autocomplete:'off',spellcheck:false})+field('phone','전화번호',r?.phone,{required:true,type:'tel',inputmode:'tel',maxLength:30,autocomplete:'off',hint:'행사 신청에 사용할 부원 본인의 번호입니다.'})+field('college','단과대학',r?.college,{maxLength:80})+field('department','학과 · 학부',r?.department,{maxLength:80})+field('grade','학년',r?.grade,{maxLength:20})+field('gender','성별',['남성','여성'].includes(r?.gender)?r.gender:'',{choices:[['','선택 안 함'],['남성','남성'],['여성','여성']]})+field('note','부원 메모',r?.note,{type:'textarea',wide:true,rows:4,maxLength:3000,hint:'이름을 눌러 상세 화면을 열었을 때만 표시됩니다. 명부 목록과 CSV에는 포함되지 않습니다.'})+'<p class="wide help">등록할 부원의 학번과 연락처를 확인해 주세요. 등록 후에는 별도의 회비 납부 확인이 필요하지 않습니다.</p>',async f=>save(ctx,'saveMember',{...meta(r),name:val(f,'name'),studentId:val(f,'studentId'),phone:val(f,'phone'),college:val(f,'college'),department:val(f,'department'),grade:val(f,'grade'),gender:val(f,'gender'),note:val(f,'note'),semester:term}),{wide:true});
}
function editorSection(title,help,body){return '<section class="editor-section wide"><h3>'+esc(title)+'</h3><p class="help">'+esc(help)+'</p><div class="editor-fields">'+body+'</div></section>';}
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
 editorSection('4. 모집 상태 확인','초안으로 먼저 저장한 뒤 준비가 끝나면 모집 중으로 변경하세요.',field('memberVisible','부원 행사 목록에 공개',r?.memberVisible!==false,{type:'checkbox',wide:true,hint:'체크를 해제하면 부원 행사 목록에서만 숨깁니다. 링크를 받은 부원은 신청할 수 있고, 본인의 신청 내역은 계속 확인할 수 있습니다.'})+field('status','모집 상태',r?.status||'draft',{choices:r?.status==='cancelled'?['cancelled']:['draft','open','closed','completed','cancelled'],wide:true})+'<p class="wide help" data-event-status-help></p>'+field('confirmCancellation','행사와 모든 신청을 취소하며, 이 행사를 다시 열 수 없음을 확인했습니다',false,{type:'checkbox',wide:true})),
 async f=>{
  const starts=Date.parse(val(f,'startsAt')),ends=Date.parse(val(f,'endsAt')),opens=Date.parse(val(f,'opensAt')),closes=Date.parse(val(f,'closesAt')),cancel=Date.parse(val(f,'cancelUntil'));
  if(starts>=ends)throw Error('행사 종료는 시작 이후로 정해 주세요.');
  if(opens>=closes)throw Error('신청 마감은 신청 시작 이후로 정해 주세요.');
  if(closes>starts)throw Error('신청 마감은 행사 시작 이전으로 정해 주세요.');
  if(cancel>starts)throw Error('취소 마감은 행사 시작 이전으로 정해 주세요.');
  const questions=val(f,'questions').split('\n').map(v=>v.trim()).filter(Boolean);
  if(questions.length>3||questions.some(q=>q.length>200))throw Error('추가 질문은 최대 3개, 질문 하나당 200자까지 입력해 주세요.');
  if(r?.status!=='cancelled'&&val(f,'status')==='cancelled'&&!f.has('confirmCancellation'))throw Error('행사 취소의 영향을 확인해 주세요.');
  const result=await save(ctx,'saveEvent',{...meta(r),title:val(f,'title'),type:val(f,'type'),semester:val(f,'semester'),description:val(f,'description'),location:val(f,'location'),owner:val(f,'owner'),startsAt:toISO(val(f,'startsAt')),endsAt:toISO(val(f,'endsAt')),opensAt:toISO(val(f,'opensAt')),closesAt:toISO(val(f,'closesAt')),cancelUntil:toISO(val(f,'cancelUntil')),capacity:num(f,'capacity'),fee:num(f,'fee'),status:val(f,'status'),memberVisible:f.has('memberVisible'),waitlist:f.has('waitlist'),questions,policy:val(f,'policy'),accountNumber:val(f,'accountNumber'),bankName:val(f,'bankName'),accountHolder:val(f,'accountHolder')});
  if(result.linkKey)setTimeout(()=>share('행사 신청 링크',location.origin+shortLink('e',result.linkKey)),0);
 },{wide:true,submit:'행사 저장'});
 const updateStatus=()=>{const status=dialog.querySelector('[name=status]').value,confirmation=dialog.querySelector('[name=confirmCancellation]'),destructive=status==='cancelled'&&r?.status!=='cancelled';confirmation.closest('label').hidden=!destructive;confirmation.required=destructive;confirmation.disabled=!destructive;dialog.querySelector('[data-event-status-help]').textContent={draft:'초안은 신청을 받지 않습니다. 내용을 확인한 뒤 모집 중으로 변경하세요.',open:'신청 시작부터 마감까지, 활동 자격이 확인된 부원의 신청을 받습니다.',closed:'새 신청 접수를 중지합니다. 기존 신청은 유지됩니다.',completed:'행사 진행이 끝난 상태입니다. 출석과 정산 기록을 함께 확인하세요.',cancelled:r?.status==='cancelled'?'취소된 행사입니다. 새 모집이 필요하면 새 행사를 만들어 주세요.':'저장하면 등록·대기·승급 제안 중인 모든 신청도 취소됩니다. 이미 납부된 참가비는 환불을 별도로 처리해야 합니다.'}[status];const submit=dialog.querySelector('[type=submit]');submit.classList.toggle('danger',destructive);submit.textContent=destructive?'행사 취소 확정':'행사 저장';};
 dialog.querySelector('[name=status]').addEventListener('change',updateStatus);updateStatus();
 if(r?.sequence){const warn=()=>{dialog.querySelector('[data-existing-applications]').hidden=Number(dialog.querySelector('[name=fee]').value)===r.fee&&dialog.querySelector('[name=semester]').value.trim()===r.semester;};for(const name of ['fee','semester'])dialog.querySelector('[name='+name+']').addEventListener('input',warn);warn();}
}
async function stockRecord(ctx,id){
 const r=await record(ctx,'inventory',id);
 if(!r)throw Error('품목을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
 const choices=[['receive','입고'],['use','사용'],['count','실사']];
 if(r.unit==='bottle')choices.splice(2,0,['open','새 병 개봉'],['remaining','개봉 병 잔량 기록'],['adjustRemaining','개봉 병 잔량 실사 · 정정']);
 const requestId=uuid();
 const dialog=modal('재고 기록 · '+r.name,'<div class="wide stock-current">현재 <strong>'+total(r).toLocaleString()+' '+unit(r)+'</strong> · 미개봉/일반 수량 '+r.quantity+'</div>'+field('action','작업 종류','receive',{choices})+field('amount','입고 수량',0,{type:'number',min:1,max:100000,step:r.unit==='g'||r.unit==='ml'?'0.1':'1',required:true})+
 (r.unit==='bottle'?field('bottleId','개봉 병',Object.keys(r.bottles||{})[0]||'',{choices:[['','병 선택'],...Object.entries(r.bottles||{}).map(([id,p],index)=>[id,'개봉 병 '+(index+1)+' · 현재 '+p+'%'])]})+field('percent','사용 후 잔량 (%)',50,{choices:Array.from({length:11},(_,i)=>[i*10,i*10+'%'])}):'')+
 field('reason','사유', '',{required:true,wide:true,maxLength:500}),
 async f=>save(ctx,'stock',{id:r.id,revision:r.revision,requestId,action:val(f,'action'),amount:num(f,'amount'),...(val(f,'bottleId')?{bottleId:val(f,'bottleId')} : {}),...(r.unit==='bottle'?{percent:num(f,'percent')}:{}),reason:val(f,'reason')}),{wide:true});
 const update=()=>{const action=dialog.querySelector('[name=action]').value,amount=dialog.querySelector('[name=amount]'),quantityAction=['receive','use','count'].includes(action);amount.closest('label').hidden=!quantityAction;amount.required=quantityAction;amount.disabled=!quantityAction;amount.min=action==='count'?'0':amount.step;const title=amount.closest('label').querySelector('span');title.textContent={receive:'입고할 수량',use:'사용한 수량',count:'실사 후 남은 수량'}[action]||'수량';['bottleId','percent'].forEach(n=>{const el=dialog.querySelector('[name='+n+']');if(el){const visible=['remaining','adjustRemaining'].includes(action);el.closest('label').hidden=!visible;el.required=visible;el.disabled=!visible;}});};dialog.querySelector('[name=action]').onchange=update;update();
}
async function linkedRecords(ctx,kind,filter){
 const rows=[];let cursor;
 do{const page=await ctx.api('read',{kind,...filter,...(cursor?{cursor}:{})});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 ctx.state.data[kind]||={};rows.forEach(r=>ctx.state.data[kind][r.id]=r);return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
async function itemView(ctx,id){
 const r=await record(ctx,'inventory',id);
 if(!r)throw Error('품목을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
 const moves=await linkedRecords(ctx,'stockMoves',{itemId:id});
 modal(r.name,'<div class="wide detail-grid"><p>보유량<br><strong>'+total(r).toLocaleString()+' '+unit(r)+'</strong></p></div><div class="wide row-actions">'+button('품목 수정','item-edit',{id,class:'button secondary'})+button('카테고리 이동','inventory-move',{id,class:'button secondary',icon:'folder'})+button('입고 · 사용 · 실사','stock-record',{id})+'</div>'+(r.note?'<div class="wide"><h3>메모</h3>'+textBlock(r.note)+'</div>':'')+'<div class="wide"><h3>변경 이력</h3>'+ (moves.length?moves.map(m=>'<div class="history-entry"><strong>'+esc(m.reason)+'</strong><p>'+m.before+' → '+m.after+' · '+esc(m.actor)+' · '+date(m.createdAt,true)+'</p></div>').join(''):'<p class="help">기록 없음</p>')+'</div><div class="wide row-actions"><button type="button" class="button danger secondary" data-action="record-delete" data-kind="inventory" data-id="'+esc(id)+'">품목 삭제</button></div>',null,{wide:true});
}
async function applicationManage(ctx,id){
 const a=await record(ctx,'applications',id),e=await record(ctx,'events',a.eventId),contact=await ctx.api('participantContact',{id});
 const showFinance=hasPermission(ctx.state.profile,'finance'),canEvent=!a.anonymizedAt&&hasPermission(ctx.state.profile,'events'),canFinance=!a.anonymizedAt&&showFinance;
 modal(a.name+' · 신청 처리','<p class="wide help">'+esc(contact.department)+' · '+esc(contact.studentId)+' · '+esc(contact.phone||'연락처 없음')+'</p><div class="wide record-meta">'+badge(a.status)+(showFinance?badge(a.payment):'')+badge(a.attendance==='present'?'present':'absent')+'</div><div class="wide detail-grid"><p>참가비<br><strong>'+money(showFinance?billingFee(a):a.fee)+'</strong></p>'+(showFinance?'<p>납부 확인<br><strong>'+money(a.paidAmount)+'</strong></p><p>환불 확인<br><strong>'+money(a.refundAmount)+'</strong></p>':'')+'</div><div class="wide">'+a.answers.map((answer,i)=>'<h4>'+esc(e.questions[i]||'질문 '+(i+1))+'</h4>'+textBlock(answer)).join('')+'</div>'+
 (a.status==='offered'?'<p class="wide help">승급 응답 기한: '+date(a.offerExpiresAt,true)+'</p>':'')+
 (showFinance?'<div class="wide staff-pricing-choice">'+staffCheckbox(a,e,{detail:true})+'<p class="help">'+(hasStaffFee(e)?'관리인원 공통 금액 '+money(e.staffFee)+' · 체크하면 바로 저장됩니다.':'행사의 신청 · 출석 화면 위에서 관리인원 금액을 먼저 설정해 주세요.')+'</p></div>':'')+
 '<div class="wide action-grid">'+
 (canEvent?button('확인 링크 재발급','receipt-reissue',{id,class:'button secondary'}):'')+
 (canEvent&&e.status!=='cancelled'&&a.status==='registered'?button('출석','attendance-present',{id})+button('불참','attendance-absent',{id,class:'button secondary'}):'')+
 (canEvent&&a.status==='waiting'?button('대기 승급 제안','application-offer',{id}):'')+
 (canEvent&&a.status==='offered'?button('기한 지난 예약 해제','application-expire',{id,class:'button secondary'}):'')+
 (canEvent&&['registered','waiting','offered'].includes(a.status)?button('신청 취소 처리','application-cancel',{id,class:'button danger secondary'}):'')+
 (canFinance&&e.status!=='cancelled'&&a.status==='registered'&&billingFee(a)>a.paidAmount?button('입금 확인 기록','application-payment',{id,icon:'wallet'}):'')+
 (canFinance&&a.paidAmount>a.refundAmount?button('환불 기록','application-refund',{id,class:'button secondary'}):'')+'</div>',null,{wide:true});
}
async function applicationChange(ctx,id,action,attendance){
 const a=await record(ctx,'applications',id),copy=action==='attendance'?{title:'출석 상태 변경',submit:label(attendance)+' 기록',description:'출석 상태를 '+label(attendance)+'으로 변경합니다.'}:action==='offer'?{title:'대기자에게 참가 제안',submit:'승급 제안',description:'이 부원의 자리를 응답 기한까지 예약합니다. 개인 확인 링크에서 수락하도록 직접 안내해 주세요.'}:action==='expire'?{title:'기한 지난 예약 해제',submit:'예약 해제',description:'응답 기한이 지난 예약을 해제합니다. 빈자리는 다음 대기자에게 제안할 수 있습니다.'}:{title:'신청 취소 처리',submit:'신청 취소 확정',description:'신청을 취소하고 예약된 자리를 반환합니다. 이미 납부된 참가비는 별도로 환불을 기록해야 합니다.'};
 modal(copy.title,'<p class="wide prose"><strong>'+esc(a.name)+'</strong>님의 신청에 적용합니다. '+copy.description+'</p>'+field('reason','처리 사유','',{required:true,wide:true,maxLength:500})+
 (action==='offer'?field('offerExpiresAt','승급 응답 기한',localTime(new Date(Date.now()+6*3600000)),{type:'datetime-local',required:true,wide:true}):''),
 async f=>save(ctx,'applicationCommand',{id,action,reason:val(f,'reason'),...(attendance?{attendance}:{}),...(action==='offer'?{offerExpiresAt:toISO(val(f,'offerExpiresAt'))}:{})}),{submit:copy.submit,submitClass:action==='cancel'||action==='expire'?'button danger':'button'});
}
async function financeAdd(ctx,applicationId,refund=false){
 if(!hasPermission(ctx.state.profile,'finance'))throw Error('행사 참가비 관리 권한이 없습니다.');
 const a=await record(ctx,'applications',applicationId);
 if(!a)throw Error('참가 신청을 확인해 주세요.');
 const requestId=uuid(),kind=refund?'refund':'income',amount=refund?a.paidAmount-a.refundAmount:billingFee(a)-a.paidAmount;
 modal(refund?'환불 완료 기록':'참가비 입금 기록',field('kind','구분',kind,{choices:[[kind,refund?'참가비 환불':'참가비 입금']]})+field('amount','금액 (원)',amount,{type:'number',min:1,max:amount,required:true})+field('title','내용',a.eventTitle+' · '+a.name,{required:true,wide:true,maxLength:160})+field('eventId','연결 행사',a.eventId,{choices:[[a.eventId,a.eventTitle]]})+field('semester','학기',a.semester,{required:true,maxLength:30,readOnly:true})+field('note','메모','',{type:'textarea',wide:true,rows:2,maxLength:2000})+field('confirmed','실제 거래 내역을 확인했습니다',false,{type:'checkbox',required:true,wide:true})+'<p class="wide help">은행에서 처리한 참가비 입금·환불 내용을 기록합니다.</p>',async f=>save(ctx,'finance',{requestId,kind,amount:num(f,'amount'),title:val(f,'title'),eventId:a.eventId,applicationId:a.id,semester:a.semester,note:val(f,'note')}),{wide:true});
}
async function settingsEdit(ctx){
 const r=ctx.state.settings?.id?ctx.state.settings:null;
 modal('학기 · 운영 설정',field('semester','현재 학기',r?.semester||'2026-2',{required:true,hint:'명부와 행사 기록을 구분하는 학기입니다. 예: 2026-2'})+field('location','기본 활동 장소',r?.location||'동아리방',{required:true})+field('joinUrl','가입 오픈채팅 링크',openChatUrl(r?.joinUrl),{type:'url',inputmode:'url',spellcheck:false,wide:true,hint:'https://open.kakao.com/o/… 주소를 입력하세요. 비워두면 준비 중으로 표시합니다.'})+field('contact','동아리 문의 채널',r?.contact,{wide:true,maxLength:200,hint:'행사 문의를 받을 연락 방법입니다. 가입 오픈채팅을 그대로 사용하면 비워도 됩니다.'})+field('intro','동아리 소개',r?.intro||'칵테일을 배우고, 함께 만들고, 가까워지는 동아리 마티니.',{type:'textarea',wide:true,required:true,maxLength:2000,rows:3})+'<p class="wide help">가입 방법은 오픈채팅에서 안내합니다. 개인정보 처리방침은 <a href="/privacy" target="_blank" rel="noopener noreferrer">홈페이지에서 확인 (새 탭)</a>할 수 있습니다.</p>',async f=>{
  const joinUrl=val(f,'joinUrl');
  if(joinUrl&&!openChatUrl(joinUrl))throw Error('카카오톡 오픈채팅 주소를 확인해 주세요. https://open.kakao.com/o/… 형식으로 입력하세요.');
  return save(ctx,'saveSettings',{...meta(r),semester:val(f,'semester'),location:val(f,'location'),contact:val(f,'contact'),joinUrl:openChatUrl(joinUrl),intro:val(f,'intro')});
 },{wide:true});
}
async function roleEdit(ctx,id){
 if(!hasPermission(ctx.state.profile,'admins'))throw Error('역할 관리 권한이 없습니다.');
 const r=id?(await ctx.api('listRoles')).rows.find(role=>role.id===id):null;
 if(r?.id==='requestsViewer')throw Error('조회 전용 역할은 고정된 권한을 사용합니다.');
 if(r&&['owner','chair'].includes(r.id)){
  modal(r.name+' · 예산 업무 설정',field('permission-budget','예산 업무',r.permissions.includes('budget'),{type:'checkbox',wide:true})+'<p class="wide help">체크하면 독립 예산 페이지를 조회하고 수정할 수 있습니다. 기존 필수 관리 권한은 유지됩니다.</p>',async f=>save(ctx,'setRoleBudget',{id:r.id,revision:r.revision,enabled:f.has('permission-budget')}));return;
 }
 modal(r?'역할 수정':'역할 만들기',field('name','역할 이름',r?.name,{required:true,wide:true,maxLength:50})+'<fieldset class="wide role-permissions"><legend>사용할 수 있는 업무</legend>'+Object.entries(permissionLabels).filter(([key])=>!['meetings','decisions','content'].includes(key)).map(([key,title])=>field('permission-'+key,key==='finance'?'행사 참가비 관리':title,r?.permissions.includes(key)||false,{type:'checkbox'})).join('')+'</fieldset><p class="wide help">선택한 업무만 사용할 수 있습니다. 행사 참가비 관리는 납부·환불 확인 담당 역할에만 선택하세요.</p>',async f=>{
  const retired=['meetings','decisions','content'];
  const permissions=[...Object.keys(permissionLabels).filter(key=>!retired.includes(key)&&f.has('permission-'+key)),...(r?.permissions||[]).filter(key=>retired.includes(key))];
  if(!permissions.length)throw Error('업무 권한을 하나 이상 선택해 주세요.');
  return save(ctx,'saveRole',{...meta(r),name:val(f,'name'),permissions});
 },{wide:true});
}
async function roleDelete(ctx,id){
 const r=(await ctx.api('listRoles')).rows.find(role=>role.id===id);
 if(!r)throw Error('역할을 찾을 수 없습니다.');
 if(r.id==='requestsViewer')throw Error('조회 전용 역할은 삭제할 수 없습니다. 계정의 접근 허용을 해제해 주세요.');
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
 modal('임원 계정 권한',field('uid','Firebase Authentication UID',r?.id,{required:true,wide:true,maxLength:100,readOnly:!!r,autocomplete:'off',spellcheck:false})+field('displayName','표시 이름',r?.displayName,{required:true,maxLength:80})+field('role','부서 · 역할',r?.role||'execution',{choices:availableRoles.map(role=>[role.id,role.name])})+field('expiresAt','임기 종료',localTime(r?.expiresAt||new Date(Date.now()+120*86400000)),{type:'datetime-local',required:true})+field('active','관리자 접근 허용',r?.active??true,{type:'checkbox'})+'<p class="wide help">계정을 새로 만들거나 비밀번호를 변경하지 않습니다. 지정한 계정의 시스템 내 권한만 변경합니다. dot · 신청 조회 전용 역할은 신청·문의만 읽으며, 접근 허용 해제 시 기존 로그인도 해제됩니다.</p>',async f=>save(ctx,'saveAdmin',{uid:val(f,'uid'),displayName:val(f,'displayName'),role:val(f,'role'),expiresAt:toISO(val(f,'expiresAt')),active:f.has('active')}),{wide:true});
}
async function exportRecords(ctx,kind){
 const rows=ctx.state.pages[kind]?.rows||Object.values(ctx.state.data[kind]||{}),more=!!ctx.state.pages[kind]?.nextCursor;
 modal('자료 내보내기','<p class="wide prose">현재 불러온 기록 <strong>'+rows.length+'건</strong>을 CSV로 내려받습니다. 검색과 상태 필터는 내보내기에 적용되지 않습니다.'+(more?' 전체 기록이 필요하면 목록에서 기록을 더 불러온 뒤 다시 진행해 주세요.':'')+'</p>'+field('reason','사용 목적','',{required:true,wide:true,maxLength:200})+'<p class="wide help">명부 파일은 필요한 담당자에게만 전달하고 사용 후 정리해 주세요.</p>',async f=>{
  await ctx.api('recordExport',{kind,reason:val(f,'reason')});
  const columns=kind==='members'?['name','studentId','phone','college','department','grade','gender']:['title','status','semester','updatedAt'];
  downloadCSV('martini-'+kind+(kind==='members'?'-'+rosterSemester(ctx):'')+'.csv',[columns,...rows.map(r=>columns.map(k=>k==='phone'?String(r[k]??'').replace(/^(010)[ -]?(\d{4})[ -]?(\d{4})$/,'$1-$2-$3'):r[k]))]);
 });
}
export async function handleAdminAction(ctx,action,id,target){
 if(action==='record-delete'){
  const kind=target.dataset.kind,titles={events:'행사',applications:'참가 신청',inventory:'품목'};
  if(!titles[kind])throw Error('삭제할 항목을 확인해 주세요.');
  const r=(await read(ctx,kind,{recordId:id})).rows[0];
  if(!r)throw Error(titles[kind]+'을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  const effects={events:'행사 목록과 신청 링크에서 제외됩니다. 진행 중인 행사는 먼저 취소하거나 완료하고, 미납·대기·환불을 정리해 주세요. 연결된 신청·정산 이력은 보관됩니다.',applications:'취소·만료된 신청만 삭제할 수 있습니다. 환불이 남아 있으면 먼저 처리해 주세요. 개인 확인 링크는 사용할 수 없게 됩니다.'};
  const body=kind==='inventory'?'<div class="wide delete-impact"><p><strong>'+esc(r.name)+'</strong> 품목을 삭제할까요?</p><p>수량과 입출고 이력은 보관됩니다.</p></div>':'<div class="wide delete-impact"><strong>'+esc(r.title||r.name||titles[kind])+'</strong><p>'+effects[kind]+'</p></div><p class="wide help">삭제 이력과 원본은 정산·운영 기록을 위해 보관합니다. 개인정보 영구 정리는 학기말 정보 정리에서 진행합니다.</p>'+field('confirmed','삭제 대상과 영향을 확인했습니다',false,{type:'checkbox',required:true,wide:true});
  modal(titles[kind]+' 삭제',body,async()=>{
   await ctx.api('deleteRecord',{kind,id,updatedAt:r.updatedAt,...(r.revision!==undefined?{revision:r.revision}:{}),confirmed:true});
   if(kind==='inventory'){delete ctx.state.data.inventory;delete ctx.state.data.stockMoves;if(ctx.state.pages)delete ctx.state.pages.inventory;}
   else{ctx.state.data={};ctx.state.pages={};delete ctx.state.publicInfo;}
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
 if(action==='item-edit')return itemEdit(ctx,id,target?.dataset.category);
 if(action==='item-view')return itemView(ctx,id);
 if(action==='stock-record')return stockRecord(ctx,id);
 if(action==='event-link'){
  const e=await record(ctx,'events',id);
  modal('신청 링크 다시 만들기','<p class="wide prose">새 링크를 만들면 이전 행사 신청 링크는 사용할 수 없습니다. 기존 참가자의 개인 확인 링크는 유지됩니다.</p>',async()=>{const result=await save(ctx,'rotateEventLink',{id,revision:e.revision});setTimeout(()=>share('행사 신청 링크',location.origin+shortLink('e',result.linkKey)),0);},{submit:'이전 링크 만료 · 재발급',submitClass:'button danger'});return;
 }
 if(action==='copy-link'){const input=document.querySelector('[name=shareUrl]');try{await navigator.clipboard.writeText(input.value);ctx.toast('링크를 복사했습니다.');}catch{input.select();ctx.toast('선택된 링크를 복사해 주세요.');}return;}
 if(action==='event-staff-pricing'){
  if(!hasPermission(ctx.state.profile,'finance'))throw Error('행사 참가비 관리 권한이 없습니다.');
  const e=(await read(ctx,'events',{recordId:id})).rows[0];
  modal('관리인원 공통 금액 설정','<p class="wide"><strong>'+esc(e.title)+'</strong></p>'+field('staffFee','관리인원 참가비 (원)',hasStaffFee(e)?e.staffFee:'',{type:'number',min:0,max:1000000,required:true,wide:true,hint:'0원은 면제입니다. 이 행사의 관리인원 모두에게 적용합니다.'})+'<p class="wide help">이미 지정된 진행 중 관리인원의 금액도 함께 변경됩니다. 확인된 입금액보다 낮은 금액은 적용할 수 없습니다.</p>',async f=>save(ctx,'setEventStaffFee',{id,staffFee:num(f,'staffFee'),staffFeeRevision:e.staffFeeRevision||0}),{submit:'공통 금액 적용'});return;
 }
 if(action==='application-staff'){
  if(!hasPermission(ctx.state.profile,'finance'))throw Error('행사 참가비 관리 권한이 없습니다.');
  const control=target,previous=control.dataset.staffChecked==='true',dialog=control.closest('dialog');let saved=false;
  control.disabled=true;control.setAttribute('aria-busy','true');
  try{
   const result=await ctx.api('setApplicationStaff',{id,isStaff:control.checked,pricingRevision:Number(control.dataset.pricingRevision),staffFeeRevision:Number(control.dataset.staffFeeRevision)});saved=true;
   control.dataset.staffChecked=String(result.isStaff);control.dataset.pricingRevision=String(result.pricingRevision);
   if(ctx.state.data.applications?.[id])Object.assign(ctx.state.data.applications[id],result);
   ctx.toast(result.isStaff?'관리인원으로 지정하고 공통 금액을 적용했습니다.':'관리인원을 해제하고 원래 참가비를 적용했습니다.');
   await ctx.render();if(dialog?.isConnected&&dialog.open)await applicationManage(ctx,id);
  }catch(error){if(!saved)control.checked=previous;ctx.toast(saved?'저장했습니다. 화면을 새로고침해 주세요.':error.message||'관리인원을 저장하지 못했습니다.');}
  finally{control.disabled=false;control.removeAttribute('aria-busy');}return;
 }
 if(action==='receipt-reissue'){modal('개인 확인 링크 재발급',field('reason','본인 확인 및 재발급 사유','',{required:true,wide:true,maxLength:200})+'<p class="wide help">기존 확인 링크는 즉시 만료됩니다. 신원을 확인한 본인에게만 새 링크를 전달해 주세요.</p>',async f=>{const result=await save(ctx,'rotateReceipt',{id,reason:val(f,'reason')});setTimeout(()=>share('개인 신청 확인 링크',location.origin+shortLink('r',result.key)),0);});return;}
 if(action==='application-manage')return applicationManage(ctx,id);
 if(action.startsWith('attendance-'))return applicationChange(ctx,id,'attendance',action.replace('attendance-',''));
 if(action==='application-offer')return applicationChange(ctx,id,'offer');
 if(action==='application-expire')return applicationChange(ctx,id,'expire');
 if(action==='application-cancel')return applicationChange(ctx,id,'cancel');
 if(action==='application-payment')return financeAdd(ctx,id,false);
 if(action==='application-refund')return financeAdd(ctx,id,true);
 if(action==='settings-edit')return settingsEdit(ctx);
 if(action==='role-edit')return roleEdit(ctx,id);
 if(action==='role-delete')return roleDelete(ctx,id);
 if(action==='admin-edit')return adminEdit(ctx,id);
 if(action==='admin-delete')return adminDelete(ctx,id);
 if(action==='export')return exportRecords(ctx,id);
}
export async function handleAdminSubmit(){}
