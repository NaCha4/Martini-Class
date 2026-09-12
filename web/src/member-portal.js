import './member-portal.css';
import { visitCalendar, bindVisitCalendar, visitSchedule } from './visit-calendar.js';
import { esc, icon, field, button, date, label, money, textBlock, empty, modal } from './ui.js';

const STORAGE='martini-member-lounge-v1';
const TOKEN=/^[a-f0-9]{64}$/;
const REQUEST_ID=/^[a-zA-Z0-9_-]{1,128}$/;
// Keep labels and receipt recovery for requests submitted before online joining closed.
const kinds={visit:'외부인 출입',join:'이전 가입 신청',inquiry:'문의'};
const activeKinds=['visit','inquiry'];
const statuses={pending:'검토 대기',approved:'승인',rejected:'반려',answered:'답변 완료',cancelled:'취소'};
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
const input=(name,title,value='',options={})=>field(name,title,value,{id:'member-'+name,...options});
const stamp=value=>value&&!Number.isNaN(Date.parse(value))?date(value,true)+' (KST)':'일정 미정';
const state=ctx=>ctx.state.memberLounge??=( {loaded:false,storage:null,member:null,events:[],requests:[],receiptRows:[],receiptErrors:0,error:'',storageUnavailable:false} );
const validReceipt=value=>value&&REQUEST_ID.test(value.id||'')&&TOKEN.test(value.receiptKey||'');
function storage(ctx){
 const view=state(ctx);if(view.storage)return view.storage;
 let saved={};try{saved=JSON.parse(sessionStorage.getItem(STORAGE)||'{}')||{};}catch{view.storageUnavailable=true;}
 view.storage={session:TOKEN.test(saved.session?.sessionKey||'')&&Number.isFinite(Date.parse(saved.session.expiresAt))?{sessionKey:saved.session.sessionKey,expiresAt:saved.session.expiresAt}:null,receipts:Array.isArray(saved.receipts)?saved.receipts.filter(validReceipt).slice(-20).map(({id,receiptKey})=>({id,receiptKey})):[],pending:{}};
 for(const kind of Object.keys(kinds)){const pending=saved.pending?.[kind];if(pending&&REQUEST_ID.test(pending.requestId||'')&&TOKEN.test(pending.receiptKey||''))view.storage.pending[kind]={requestId:pending.requestId,receiptKey:pending.receiptKey};}
 return view.storage;
}
function persist(ctx){try{sessionStorage.setItem(STORAGE,JSON.stringify(storage(ctx)));}catch{state(ctx).storageUnavailable=true;}}
function clearIdentity(ctx){const view=state(ctx);storage(ctx).session=null;view.member=null;view.events=[];view.requests=[];persist(ctx);}
export function getMemberSessionKey(ctx){
 const session=storage(ctx).session;
 if(!session)return '';
 if(Date.parse(session.expiresAt)<=Date.now()){clearIdentity(ctx);return '';}
 return session.sessionKey;
}
function requestStatus(request){const title=request.status==='pending'?(request.kind==='inquiry'?'답변 대기':'승인 대기'):statuses[request.status]||'상태 확인 중';return '<span class="member-status '+esc(request.status)+'">'+esc(title)+'</span>';}
function requestTitle(request){return request.kind==='visit'?request.purpose:request.kind==='inquiry'?request.subject:'동아리 가입 신청';}
function requestSummary(request){return request.kind==='visit'?stamp(request.startsAt)+' · 외부인 '+Number(request.guestCount||0)+'명':stamp(request.createdAt)+' 접수';}
function allRequests(ctx){const view=state(ctx),rows=new Map();for(const row of [...view.receiptRows,...view.requests])if(row?.id)rows.set(row.id,row);return [...rows.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
function findRequest(ctx,id){return allRequests(ctx).find(row=>row.id===id);}
function receiptFor(ctx,id){return storage(ctx).receipts.find(item=>item.id===id);}
function identityFields(){return input('name','이름','',{required:true,maxLength:40,autocomplete:'name'})+input('studentId','학번','',{required:true,maxLength:30,inputMode:'numeric',autocomplete:'off',spellcheck:false});}
function consent(kind){
 const description=kind==='visit'?'이름·학번, 방문 일정·목적과 외부인 이름을 출입 승인 및 안전한 공간 운영을 위해 수집합니다. 외부인의 연락처나 신분증 정보는 적지 마세요.':'이름·학번와 문의 내용을 문의 확인 및 답변을 위해 수집합니다. 비밀번호, 주민등록번호 등 민감한 정보는 적지 마세요.';
 return '<div class="member-consent-note wide"><h3>개인정보 수집·이용 안내</h3><p>'+description+' 동의하지 않으면 이 신청을 접수할 수 없습니다. 보관 기간과 삭제 요청 방법은 개인정보 안내에서 확인할 수 있습니다.</p><a href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 안내 보기 (새 탭) '+icon('arrow-up-right')+'</a></div>'+input('consent','개인정보 수집·이용에 동의합니다',false,{required:true,type:'checkbox',wide:true});
}
function verifiedNote(ctx){const member=state(ctx).member;return member?'<div class="member-form-identity wide">'+icon('shield-check')+'<span><strong>'+esc(member.name)+'</strong> 님의 부원 정보로 접수합니다.</span></div>':'';}
function visitBody(ctx){
 return '<p class="member-form-intro wide">날짜를 고르고, 인원과 방문 사유를 알려 주세요.</p><div class="visit-layout wide">'+visitCalendar()+'<section class="visit-details" aria-labelledby="visit-details-title"><span class="member-section-kicker">STEP 02</span><h3 id="visit-details-title">방문 내용을 입력해 주세요</h3>'+verifiedNote(ctx)+'<div class="visit-time-fields">'+input('startTime','시작 시간','',{required:true,type:'time'})+'</div>'+input('guestCount','외부인 인원','1',{required:true,type:'number',min:1,max:3,step:1,hint:'신청한 부원 제외 · 최대 3명'})+input('purpose','방문 사유','',{required:true,type:'textarea',rows:3,maxLength:1000,placeholder:'예: 친구와 함께 칵테일 연습을 하려고 합니다.'})+input('guestNames','외부인 이름','',{required:true,type:'textarea',rows:2,maxLength:300,placeholder:'방문자 전원의 이름을 쉼표로 구분해 주세요.'})+'</section></div>'+consent('visit');
}
function inquiryBody(ctx){return '<p class="member-form-intro wide">활동, 가입, 공간 이용 등 궁금한 점을 남겨 주세요. 운영진 답변은 내 신청 내역에서 확인할 수 있습니다.</p>'+(getMemberSessionKey(ctx)?verifiedNote(ctx):identityFields())+input('subject','문의 제목','',{required:true,maxLength:120,wide:true})+input('message','문의 내용','',{required:true,type:'textarea',maxLength:3000,rows:5,wide:true})+consent('inquiry');}
function openForm(ctx,kind){
 const titles={visit:'외부인 출입 신청',inquiry:'문의하기'};
 const submits={visit:'출입 승인 요청',inquiry:'문의 보내기'};
 const body=kind==='visit'?visitBody(ctx):inquiryBody(ctx);
 const dialog=modal(titles[kind],body,(data,node)=>memberPortalSubmit(ctx,'member-'+kind,data,node),{wide:kind==='visit',submit:submits[kind],busyText:'접수 중…'});
 dialog.classList.add('member-dialog');if(kind==='visit'){dialog.classList.add('member-visit-dialog');bindVisitCalendar(dialog);}return dialog;
}
function openVerification(ctx,continueToVisit=false){
 const dialog=modal('부원 확인','<p class="member-form-intro wide">부원 명단에 등록된 이름과 학번로 확인합니다. 진행 중인 행사와 내 신청 내역을 볼 수 있어요.</p>'+identityFields()+'<p class="member-form-note wide">공용 기기에서는 이용 후 ‘이 기기에서 나가기’를 눌러 주세요. 입력한 신원 정보는 이 브라우저에 저장하지 않습니다.</p>',async(data,node)=>{
  await memberPortalSubmit(ctx,'member-verify',data,node);
  if(continueToVisit)dialog.addEventListener('close',()=>setTimeout(()=>openForm(ctx,'visit'),0),{once:true});
 },{submit:'부원 확인하기',busyText:'확인 중…'});
 dialog.classList.add('member-dialog');return dialog;
}
async function loadPortal(ctx){
 const view=state(ctx),sessionKey=getMemberSessionKey(ctx);view.error='';view.receiptErrors=0;view.linkError='';view.linkedId='';
 const infoPromise=ctx.state.publicInfo?Promise.resolve(ctx.state.publicInfo):ctx.api('publicRead').then(info=>(ctx.state.publicInfo=info)).catch(()=>({content:[],settings:null,unavailable:true}));
 if(sessionKey){
  try{const result=await ctx.api('memberPortal',{sessionKey});if(getMemberSessionKey(ctx)!==sessionKey)return await infoPromise;view.member=result.member;view.events=result.events||[];view.requests=result.requests||[];if(result.expiresAt){storage(ctx).session.expiresAt=result.expiresAt;persist(ctx);}}
  catch(error){view.member=null;view.events=[];view.requests=[];if(['functions/permission-denied','functions/unauthenticated','functions/not-found'].includes(error.code)){clearIdentity(ctx);view.error='부원 확인이 만료되었거나 등록 정보가 변경되었습니다. 다시 확인해 주세요.';}else view.error=error.message||'부원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';}
 }else{view.member=null;view.events=[];view.requests=[];}
 const pendingEntries=Object.entries(storage(ctx).pending),recoveredRows=[];
 const recovered=await Promise.allSettled(pendingEntries.map(([,pending])=>ctx.api('clubRequestReceipt',{id:pending.requestId,receiptKey:pending.receiptKey})));
 if(state(ctx)!==view)return await infoPromise;
 recovered.forEach((result,index)=>{
  const [kind,pending]=pendingEntries[index];
  if(result.status==='fulfilled'&&result.value.request){
   const saved=storage(ctx);saved.receipts=saved.receipts.filter(item=>item.id!==pending.requestId).concat({id:pending.requestId,receiptKey:pending.receiptKey}).slice(-20);delete saved.pending[kind];recoveredRows.push(result.value.request);view.lastReceiptId=pending.requestId;persist(ctx);
  }else if(result.status==='rejected'&&!['functions/not-found','functions/invalid-argument'].includes(result.reason?.code))view.receiptErrors++;
 });
 const fragment=new URLSearchParams(location.hash.slice(1));let linkedRequest=null;
 if(fragment.has('request')||fragment.has('key')){
  const linked={id:fragment.get('request'),receiptKey:fragment.get('key')};
  if(!validReceipt(linked))view.linkError='개인 확인 링크가 올바르지 않습니다. 전달받은 링크 전체를 다시 열어 주세요.';
  else try{const result=await ctx.api('clubRequestReceipt',linked);if(state(ctx)!==view)return await infoPromise;linkedRequest=result.request;view.linkedId=linked.id;const saved=storage(ctx);saved.receipts=saved.receipts.filter(item=>item.id!==linked.id).concat(linked).slice(-20);persist(ctx);}catch(error){view.linkError=['functions/not-found','functions/invalid-argument'].includes(error.code)?'신청 내역을 확인할 수 없습니다. 저장한 개인 확인 링크 전체를 다시 확인해 주세요.':error.message||'신청 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';}
 }
 const known=new Set([...view.requests.map(row=>row.id),...recoveredRows.map(row=>row.id),...(linkedRequest?[linkedRequest.id]:[])]),receipts=storage(ctx).receipts.filter(item=>!known.has(item.id));
 const fetched=await Promise.allSettled(receipts.map(item=>ctx.api('clubRequestReceipt',item)));
 view.receiptRows=linkedRequest?[...recoveredRows,linkedRequest]:recoveredRows;fetched.forEach(result=>{if(result.status==='fulfilled'&&result.value.request)view.receiptRows.push(result.value.request);else view.receiptErrors++;});
 view.loaded=true;return await infoPromise;
}
function eventCards(ctx){
 const view=state(ctx);
 if(!view.member)return '<div class="member-locked"><span class="member-round-icon">'+icon('calendar-days')+'</span><h3>다음 만남을 확인해 보세요</h3><p>부원 확인을 마치면 진행 중인 행사와<br> 신청 가능한 일정을 볼 수 있어요.</p>'+button('부원 확인','member-verify',{class:'button secondary',icon:'arrow-right'})+'</div>';
 const events=view.events.filter(event=>!['draft','cancelled','completed'].includes(event.status)&&(!event.endsAt||Date.parse(event.endsAt)>=Date.now())).sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
 if(!events.length)return empty('새로운 행사를 준비하고 있어요','일정이 공개되면 이곳에서 바로 확인하고 신청할 수 있습니다.');
 return '<div class="member-events">'+events.map(event=>{
  const when=event.startsAt&&!Number.isNaN(Date.parse(event.startsAt))?new Date(event.startsAt):null;
  const month=when?new Intl.DateTimeFormat('ko-KR',{month:'short',timeZone:'Asia/Seoul'}).format(when):'예정',day=when?new Intl.DateTimeFormat('ko-KR',{day:'numeric',timeZone:'Asia/Seoul'}).format(when).replace('일',''):'—';
  const closed=event.status==='closed'||Date.parse(event.closesAt)<=Date.now(),upcoming=Date.parse(event.opensAt)>Date.now();
  return '<a class="member-event" href="/members/events/'+encodeURIComponent(event.id||event.eventId)+'" data-nav><div class="member-event-date"><span>'+esc(month)+'</span><strong>'+esc(day)+'</strong></div><div class="member-event-copy"><div class="member-event-meta"><span>'+esc(label(event.type))+'</span><span class="member-status '+(closed?'cancelled':upcoming?'pending':'approved')+'">'+(closed?'모집 마감':upcoming?'신청 예정':'신청 가능')+'</span></div><h3>'+esc(event.title)+'</h3><p>'+esc(stamp(event.startsAt))+' · '+esc(event.location||'장소 추후 안내')+'</p><small>'+(event.fee?money(event.fee):'참가비 없음')+'</small></div>'+icon('arrow-up-right')+'</a>';
 }).join('')+'</div>';
}
function notices(info){
 const items=(info.content||[]).filter(item=>item.type==='notice').slice(0,4);
 if(info.unavailable)return '<div class="member-inline-message" role="status"><p>공지를 불러오지 못했습니다.</p>'+button('다시 불러오기','member-refresh',{class:'button secondary small'})+'</div>';
 if(!items.length)return '<div class="member-quiet-empty">'+icon('megaphone')+'<p>새로운 공지가 올라오면<br> 여기에서 알려드릴게요.</p></div>';
 return '<div class="member-notices">'+items.map(item=>'<details><summary><span>'+esc(item.title)+'</span><small>'+esc(item.updatedAt?date(item.updatedAt):'공지')+'</small>'+icon('plus')+'</summary>'+textBlock(item.body||'')+'</details>').join('')+'</div>';
}
function requestHistory(ctx){
 const view=state(ctx),requests=allRequests(ctx);
 if(!requests.length)return empty('아직 신청 내역이 없어요',view.member?'출입 신청이나 문의를 보내면 진행 상황을 확인할 수 있습니다.':'이 탭에서 보낸 신청 또는 저장한 개인 확인 링크로 내역을 볼 수 있습니다. 기존 부원은 부원 확인 후 내역을 조회해 주세요.');
 return '<div class="member-request-list">'+requests.map(request=>'<button type="button" class="member-request-row" data-action="member-request" data-id="'+esc(request.id)+'"><span class="member-request-icon">'+icon(request.kind==='visit'?'users-round':request.kind==='join'?'user-plus':'notebook-pen')+'</span><span class="member-request-content"><span class="member-request-kind">'+esc(kinds[request.kind]||'신청')+'</span><strong>'+esc(requestTitle(request)||kinds[request.kind])+'</strong><small>'+esc(requestSummary(request))+'</small></span>'+requestStatus(request)+icon('arrow-right')+'</button>').join('')+'</div>';
}
export async function renderMemberPortal(ctx){
 const info=await loadPortal(ctx),view=state(ctx),member=view.member,requests=allRequests(ctx),pending=requests.filter(row=>row.status==='pending').length;
 let error=view.error?'<div class="member-connection-note" role="alert">'+icon('circle-x')+'<p>'+esc(view.error)+'</p>'+button('다시 불러오기','member-refresh',{class:'button secondary small'})+'</div>':'';
 const linked=view.linkError?'<div class="member-connection-note" role="alert">'+icon('circle-x')+'<p>'+esc(view.linkError)+'</p>'+button('다시 불러오기','member-refresh',{class:'button secondary small'})+'</div>':view.linkedId?'<div class="member-receipt-banner" role="status">'+icon('shield-check')+'<p>개인 확인 링크의 신청을 불러왔습니다.</p>'+button('신청 내역 보기','member-request',{id:view.linkedId,class:'button secondary small'})+'</div>':'';
 error+=linked;
 if(view.lastReceiptId&&receiptFor(ctx,view.lastReceiptId)&&view.lastReceiptId!==view.linkedId)error+='<div class="member-receipt-banner" role="status">'+icon('check')+'<p>신청을 접수했습니다. 다음에 결과를 볼 수 있도록 개인 확인 링크를 보관해 주세요.</p>'+button('확인 링크 복사','member-receipt-copy',{id:view.lastReceiptId,class:'button secondary small',icon:'copy'})+'</div>';
 const identity=member?'<div class="member-identity"><span class="member-avatar">'+esc(member.name.slice(0,1))+'</span><div><strong>'+esc(member.name)+' 님</strong><small>'+esc(member.semester||'마티니')+' · 부원 확인 완료</small></div>'+button('이 기기에서 나가기','member-forget',{class:'button ghost small'})+'</div>':'<div class="member-welcome-note"><span>'+icon('shield-check')+'<span>부원 확인으로 내 활동을 한눈에</span></span>'+button('부원 확인','member-verify',{class:'button secondary',icon:'arrow-right'})+'</div>';
 return '<div class="member-lounge"><section class="member-heading"><div><span class="eyebrow">MARTINI MEMBERS</span><h1>부원 라운지<span>.</span></h1><p>우리의 다음 만남부터 동아리방 방문까지.<br> 마티니의 소식과 필요한 신청을 한곳에서.</p></div><div class="member-heading-mark" aria-hidden="true">'+icon('martini')+'<span>MAKE. MIX. MEET.</span></div></section>'+error+identity+'<section class="member-shortcuts" aria-label="신청 바로가기"><button type="button" class="member-shortcut member-visit-card" data-action="member-visit"><div class="member-shortcut-top">'+icon('users-round')+'<span>간부 승인 필요</span></div><div><h2>외부인 출입 신청</h2><p>함께 방문할 손님이 있나요?<br> 달력에서 날짜를 골라 신청해 주세요.</p></div><span class="member-shortcut-bottom">달력에서 날짜 선택 '+icon('arrow-up-right')+'</span></button><button type="button" class="member-shortcut" data-action="member-inquiry"><div class="member-shortcut-top">'+icon('notebook-pen')+'<span>운영진에게</span></div><div><h2>문의하기</h2><p>활동부터 공간 이용까지<br> 궁금한 점을 편하게 남겨 주세요.</p></div><span class="member-shortcut-bottom">문의 남기기 '+icon('arrow-up-right')+'</span></button></section><div class="member-content-grid"><section class="member-section member-event-section" aria-labelledby="member-events-title"><div class="member-section-heading"><div><span class="member-section-kicker">TOGETHER</span><h2 id="member-events-title">진행 중인 행사</h2></div>'+icon('calendar-days')+'</div>'+eventCards(ctx)+'</section><section class="member-section member-notice-section" aria-labelledby="member-notices-title"><div class="member-section-heading"><div><span class="member-section-kicker">NOTICE</span><h2 id="member-notices-title">새로운 소식</h2></div><a href="/notices" data-nav class="member-text-link">전체 보기 '+icon('arrow-up-right')+'</a></div>'+notices(info)+'</section></div><section class="member-section member-history" id="member-history" aria-labelledby="member-history-title"><div class="member-section-heading"><div><span class="member-section-kicker">MY REQUESTS</span><h2 id="member-history-title">내 신청 내역'+(pending?'<span class="member-count">검토 대기 '+pending+'</span>':'')+'</h2></div>'+button('새로고침','member-refresh',{class:'button ghost small',icon:'history'})+'</div>'+(view.receiptErrors?'<p class="member-history-warning" role="status">일부 신청 내역을 불러오지 못했습니다. 새로고침해 다시 확인해 주세요.</p>':'')+requestHistory(ctx)+'<div class="member-history-footnote"><p>'+icon('shield-check')+'<span>신청 내역에서 개인 확인 링크를 복사해 보관해 주세요. 탭을 닫은 뒤에도 링크로 결과를 확인할 수 있습니다. 부원 신청은 다시 부원 확인 후에도 조회할 수 있어요.</span></p>'+(!member&&storage(ctx).receipts.length?button('이 기기 기록 지우기','member-forget',{class:'button ghost small'}):'')+'</div></section>'+(view.storageUnavailable?'<p class="member-history-warning" role="status">브라우저 저장 공간을 사용할 수 없습니다. 새로고침하거나 창을 닫으면 현재 접수 내역의 조회 권한이 사라질 수 있습니다.</p>':'')+'<aside class="member-room-note"><span>'+icon('map-pin')+'<strong>우리의 공간, 함께 지켜요.</strong></span><p>외부인 방문은 승인된 일정에 부원과 동행해 주세요.<br> 사용한 자리와 도구는 다음 사람을 위해 정리해 주세요.</p></aside></div>';
}
function requestDetail(ctx,request){
 let body='<div class="member-detail-heading wide"><span>'+esc(kinds[request.kind]||'신청')+'</span>'+requestStatus(request)+'</div>';
 if(receiptFor(ctx,request.id))body+='<section class="member-save-receipt wide"><h3>개인 확인 링크를 보관해 주세요</h3><p>다음에 이 링크를 열면 처리 결과와 답변을 확인할 수 있습니다. 신청 정보에 접근할 수 있는 링크이므로 다른 사람에게 공유하지 마세요.</p>'+button('개인 확인 링크 복사','member-receipt-copy',{id:request.id,class:'button secondary full',icon:'copy'})+'</section>';
 if(request.kind==='visit')body+='<dl class="member-detail-facts wide"><div><dt>방문 시작</dt><dd>'+esc(stamp(request.startsAt))+'</dd></div>'+(request.endsAt?'<div><dt>방문 종료</dt><dd>'+esc(stamp(request.endsAt))+'</dd></div>':'')+'<div><dt>외부인</dt><dd>'+Number(request.guestCount||0)+'명 · '+esc(request.guestNames)+'</dd></div></dl><div class="member-detail-section wide"><h3>방문 목적</h3>'+textBlock(request.purpose)+'</div>';
 else if(request.kind==='inquiry')body+='<div class="member-detail-section wide"><h3>'+esc(request.subject)+'</h3>'+textBlock(request.message)+'</div>';
 else body+='<div class="member-detail-section wide"><h3>가입 신청 내용</h3><p>'+esc(request.department||'')+' · '+esc(request.grade||'')+'</p>'+textBlock(request.message)+'</div>';
 if(request.status==='approved')body+='<div class="member-visit-guidance wide"><strong>'+(request.kind==='visit'?'방문이 승인되었습니다.':'가입 신청이 승인되었습니다.')+'</strong><p>'+(request.kind==='visit'?'승인된 날짜와 시간에만 신청한 부원이 외부인과 동행해 주세요. 일정이나 인원이 달라지면 운영진에게 문의해 주세요.':'최종 부원 등록과 회비 등 후속 절차는 운영진 안내를 따라 주세요.')+'</p></div>';
 body+='<div class="member-response wide"><h3>운영진 답변</h3>'+(request.response?textBlock(request.response):'<p>'+(request.status==='pending'?'운영진이 내용을 검토하고 있습니다. 답변이 등록되면 여기에서 확인할 수 있어요.':request.status==='cancelled'?'취소된 신청입니다.':'등록된 답변이 없습니다.')+'</p>')+'</div><p class="member-form-note wide">접수 '+esc(stamp(request.createdAt))+'<br> 접수 번호 '+esc(request.id)+'</p>';
 const cancellable=request.kind==='visit'?['pending','approved'].includes(request.status)&&Date.parse(request.startsAt)>Date.now():request.status==='pending';
 if(cancellable&&receiptFor(ctx,request.id))body+='<div class="wide">'+button('신청 취소','member-cancel',{class:'button secondary',id:request.id})+'</div>';
 else if(cancellable)body+='<p class="member-form-note wide">이 탭에 접수 확인 정보가 없어 상태만 조회할 수 있습니다. 취소가 필요하면 운영진에게 문의해 주세요.</p>';
 const dialog=modal(kinds[request.kind]+' 내역',body,null);dialog.classList.add('member-dialog');return dialog;
}
export async function memberPortalAction(ctx,action,id){
 if(action==='member-verify')return openVerification(ctx);
 if(action==='member-visit')return getMemberSessionKey(ctx)&&state(ctx).member?openForm(ctx,'visit'):openVerification(ctx,true);
 if(action==='member-inquiry')return openForm(ctx,'inquiry');
 if(action==='member-refresh'){delete ctx.state.publicInfo;await ctx.render();return;}
 if(action==='member-forget')return modal('이 기기에서 나갈까요?','<p class="member-form-intro wide">부원 확인과 이 탭의 신청 조회 정보를 지웁니다. 접수한 신청은 취소되지 않습니다. 부원 확인 없이 보낸 신청·문의는 저장한 개인 확인 링크가 있어야 다시 조회할 수 있습니다.</p>',async()=>{try{sessionStorage.removeItem(STORAGE);}catch{throw new Error('브라우저의 조회 정보를 지우지 못했습니다. 이 탭을 닫아 부원 확인을 종료해 주세요.');}delete ctx.state.memberLounge;await ctx.navigate('/members',{replace:true,discard:true});ctx.toast('이 기기의 부원 확인과 신청 조회 정보를 지웠습니다.');},{submit:'이 기기에서 나가기',busyText:'정리 중…'});
 if(action==='member-receipt-copy'){
  const receipt=receiptFor(ctx,id);if(!receipt)throw new Error('이 탭의 접수 확인 정보가 없습니다.');
  const url=location.origin+'/members#request='+encodeURIComponent(receipt.id)+'&key='+encodeURIComponent(receipt.receiptKey);
  try{await navigator.clipboard.writeText(url);ctx.toast('개인 확인 링크를 복사했습니다. 나만 볼 수 있는 곳에 보관해 주세요.');}
  catch{const dialog=modal('개인 확인 링크',input('receiptLink','복사해서 보관할 링크',url,{readOnly:true,wide:true,spellcheck:false,hint:'주소 전체를 선택해 직접 복사해 주세요. 다른 사람에게 공유하지 마세요.'}),null);const node=dialog.querySelector('[name=receiptLink]');node.focus();node.select();}
  return;
 }
 if(action==='member-request'){
  const view=state(ctx),openedUrl=location.href,stored=receiptFor(ctx,id);let request=findRequest(ctx,id);
  if(stored){const result=await ctx.api('clubRequestReceipt',stored);request=result.request;}
  if(state(ctx)!==view||location.href!==openedUrl)return;
  if(!request)throw new Error('신청 내역을 찾을 수 없습니다. 새로고침 후 다시 확인해 주세요.');
  return requestDetail(ctx,request);
 }
 if(action==='member-cancel'){
  const receipt=receiptFor(ctx,id),request=findRequest(ctx,id);if(!receipt||!request)throw new Error('이 탭의 접수 확인 정보가 없습니다. 운영진에게 취소를 문의해 주세요.');
  return modal('신청을 취소할까요?','<p class="member-form-intro wide"><strong>'+esc(requestTitle(request)||kinds[request.kind])+'</strong><br> 취소한 신청은 되돌릴 수 없습니다. 다시 신청하려면 새 신청서를 작성해 주세요.</p>',async()=>{await ctx.api('cancelClubRequest',receipt);await ctx.render();ctx.toast('신청을 취소했습니다.');},{submit:'신청 취소',submitClass:'button danger',busyText:'취소 중…'});
 }
}
function required(data,name,title,max){const value=String(data.get(name)||'').trim();if(!value)throw new Error(title+'을(를) 입력해 주세요.');if(value.length>max)throw new Error(title+'은(는) '+max+'자 이하로 입력해 주세요.');return value;}
function identity(data){return {name:required(data,'name','이름',40),studentId:required(data,'studentId','학번',30)};}
function koreaISO(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('방문 날짜와 시간을 정확히 입력해 주세요.');const result=new Date(value+':00+09:00');if(Number.isNaN(result.getTime()))throw new Error('유효한 방문 날짜와 시간을 입력해 주세요.');return result.toISOString();}
export async function memberPortalSubmit(ctx,form,data){
 if(form==='member-verify'){
  const sessionKey=secret();let result;
  try{result=await ctx.api('memberAccess',{...identity(data),sessionKey});}catch(error){if(['functions/permission-denied','functions/not-found','functions/unauthenticated'].includes(error.code))throw new Error('부원 정보를 확인할 수 없습니다. 명단에 등록된 이름·학번를 확인해 주세요. 계속 확인되지 않으면 운영진에게 문의해 주세요.');throw error;}
  storage(ctx).session={sessionKey,expiresAt:result.expiresAt};state(ctx).member=result.member;persist(ctx);await ctx.render();ctx.toast('부원 확인을 마쳤습니다.');return;
 }
 const kind=form.replace(/^member-/,'');if(!activeKinds.includes(kind))return;
 if(!data.has('consent'))throw new Error('개인정보 수집·이용 동의를 확인해 주세요.');
 const payload={kind,consent:true},sessionKey=getMemberSessionKey(ctx);
 if(kind==='visit'){
  if(!sessionKey)throw new Error('부원 확인이 만료되었습니다. 신청 내용을 보관한 뒤 다시 부원 확인을 진행해 주세요.');
  const schedule=visitSchedule(data);
  payload.sessionKey=sessionKey;payload.startsAt=koreaISO(schedule.startsAt);
  if(Date.parse(payload.startsAt)<=Date.now())throw new Error('방문 시작은 현재 시간 이후로 입력해 주세요.');
  if(Date.parse(payload.startsAt)>Date.now()+90*86400000)throw new Error('방문은 현재 이후 90일 이내로 신청해 주세요.');
  payload.guestCount=Number(data.get('guestCount'));if(!Number.isInteger(payload.guestCount)||payload.guestCount<1||payload.guestCount>3)throw new Error('외부인 인원은 1명부터 3명까지 입력해 주세요.');
  payload.guestNames=required(data,'guestNames','외부인 이름',300);payload.purpose=required(data,'purpose','방문 목적',1000);
 }else{Object.assign(payload,sessionKey?{sessionKey}:identity(data),{subject:required(data,'subject','문의 제목',120),message:required(data,'message','문의 내용',3000)});}
 const saved=storage(ctx);saved.pending[kind]??={requestId:crypto.randomUUID(),receiptKey:secret()};persist(ctx);
 const pending=saved.pending[kind];let result,recovered=false;
 try{result=await ctx.api('submitClubRequest',{...payload,...pending});}
 catch(error){
  if(error.code!=='functions/already-exists')throw error;
  try{const receipt=await ctx.api('clubRequestReceipt',{id:pending.requestId,receiptKey:pending.receiptKey});result={id:pending.requestId,request:receipt.request};recovered=true;}catch{throw error;}
 }
 if(!result.id)throw new Error('접수 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 요청해 주세요.');
 saved.receipts=saved.receipts.filter(item=>item.id!==result.id).concat({id:result.id,receiptKey:pending.receiptKey}).slice(-20);delete saved.pending[kind];persist(ctx);
 state(ctx).lastReceiptId=result.id;
 if(result.request)state(ctx).receiptRows.push(result.request);
 await ctx.render();ctx.toast(recovered?'이전에 접수된 신청을 확인했습니다. 내 신청 내역에서 접수 내용을 확인해 주세요.':kind==='visit'?'출입 승인 요청을 보냈습니다. 승인 결과를 확인한 뒤 방문해 주세요.':'문의를 보냈습니다. 내 신청 내역에서 답변을 확인해 주세요.');
}
