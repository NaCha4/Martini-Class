import { esc, icon, button, field, empty, modal } from './ui.js';
import { BINGO_MISSIONS, REPEAT_MISSIONS, SPECIAL_MISSIONS } from '../../functions/src/on-the-rock-rules.js';
import './on-the-rock.css';

const kinds={bingo:'빙고 미션',repeat:'반복 미션',special:'특별 미션'};
const missions={bingo:BINGO_MISSIONS,repeat:REPEAT_MISSIONS,special:SPECIAL_MISSIONS};
const points=value=>Number(value||0).toLocaleString('ko-KR');
const stampDate=value=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value));
const localDate=value=>new Date(new Date(value||Date.now()).getTime()+9*60*60*1000).toISOString().slice(0,16);
// Preserve this one-off event's existing records independently of the club's current term.
const eventStorage='2026-2';
const boardUrl=group=>'/admin/on-the-rock'+(group?'?'+new URLSearchParams({group}):'');
function groupSlots(groups){
 const slots=Array.from({length:5},(_,index)=>({number:index+1,name:(index+1)+'조',id:'ontherock-group-'+(index+1),group:null}));
 const used=new Set();
 for(const slot of slots){const group=groups.find(group=>group.id===slot.id);if(group){slot.group=group;used.add(group.id);}}
 for(const slot of slots.filter(slot=>!slot.group)){const group=groups.find(group=>!used.has(group.id)&&group.name.replace(/\s/g,'')===slot.name);if(group){slot.group=group;used.add(group.id);}}
 const remaining=groups.filter(group=>!used.has(group.id)).sort((a,b)=>a.id.localeCompare(b.id));
 for(const slot of slots.filter(slot=>!slot.group))slot.group=remaining.shift()||null;
 return slots;
}
const activeRecords=board=>(board.records||[]).filter(record=>!record.voidedAt);
const missionFor=record=>missions[record.kind]?.find(mission=>mission.id===record.missionId);
const stamp=(all=false,small=false)=>'<span class="ontherock-stamp'+(all?' is-all':'')+(small?' is-small':'')+'" aria-hidden="true">樂</span>';
const blankScore={bingoPoints:0,participationBonus:0,bingoLinePoints:0,repeatPoints:0,specialPoints:0,total:0,completedCells:[],completedLines:0};

function groupControls(board){
 return '<section class="ontherock-controls" aria-label="우리 조 선택"><div class="ontherock-group-heading"><h2>우리 조 선택</h2><p>조 버튼을 누르면 빙고와 수행 기록이 열려요.</p></div><div class="ontherock-group-buttons">'+groupSlots(board.groups).map(slot=>'<button type="button" class="ontherock-group-button" data-action="ontherock-select-group" data-id="'+slot.number+'" aria-pressed="'+(slot.group?.id===board.group?.id&&!!board.group)+'">'+slot.name+'</button>').join('')+'</div></section>';
}

function leaderboard(board){
 if(!board.groups.length)return '';
 const groups=[...board.groups].sort((a,b)=>Number(b.score?.total||0)-Number(a.score?.total||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
 let rank=0,previous=null;
 return '<section class="ontherock-leaderboard" aria-labelledby="ontherock-ranking"><div class="ontherock-section-heading"><h2 id="ontherock-ranking">우리들의 점수</h2><span>5개 조</span></div><ol>'+groups.map((group,index)=>{
  const total=Number(group.score?.total||0);if(total!==previous){rank=index+1;previous=total;}
  return '<li><a data-nav href="'+esc(boardUrl(group.id))+'"'+(group.id===board.group?.id?' aria-current="true"':'')+'><span class="ontherock-rank">'+rank+'<span class="sr-only">위</span></span><span class="ontherock-team-name">'+esc(group.name)+'<small>'+(group.memberCount?group.memberCount+'명 · ':'')+'빙고 '+points(group.score?.completedLines)+'줄</small></span><strong>'+points(total)+'<small>P</small></strong></a></li>';
 }).join('')+'</ol></section>';
}

function scoreSummary(board){
 const score=board.score||board.group.score||blankScore;
 return '<section class="ontherock-score" aria-label="'+esc(board.group.name)+' 점수 집계"><div class="ontherock-score-total"><div><span>함께 쌓은 점수</span><h2>'+esc(board.group.name)+'</h2></div><strong>'+points(score.total)+'<small>P</small></strong></div><dl>'+[
  ['빙고 미션',score.bingoPoints],['전원 참여 보너스',score.participationBonus],['빙고 '+points(score.completedLines)+'줄',score.bingoLinePoints],['반복 미션',score.repeatPoints],['특별 미션',score.specialPoints]
 ].map(([title,value])=>'<div><dt>'+title+'</dt><dd>'+points(value)+'<small>P</small></dd></div>').join('')+'</dl></section>';
}

function bingo(board){
 const records=activeRecords(board),score=board.score||board.group.score||blankScore;
 return '<section class="ontherock-bingo" aria-labelledby="ontherock-bingo-title"><div class="ontherock-bingo-heading"><div><span class="ontherock-eyebrow">MARTINI ON THE ROCK</span><h2 id="ontherock-bingo-title">빙고 채우기</h2></div><span class="ontherock-progress">'+(score.completedCells?.length||0)+'<small> / 16</small></span></div><p class="ontherock-bingo-rules">3명 이상 참여 · 전원 참여 +5P · 한 줄 완성 +30P</p><div class="ontherock-bingo-grid">'+BINGO_MISSIONS.map((mission,index)=>{
  const record=records.find(r=>r.kind==='bingo'&&r.missionId===mission.id),all=record?.allParticipated;
  const status=record?(all?'전원 참여 완료':'수행 완료'):'미완료';
  return '<button type="button" class="ontherock-cell'+(record?' is-complete':'')+(all?' is-all':'')+'" data-action="'+(record?'ontherock-edit':'ontherock-record')+'" data-id="'+esc(record?.id||'bingo:'+mission.id)+'" aria-label="'+esc((index+1)+'번 '+mission.title+' · '+mission.points+'점 · '+status+' · '+(record?'기록 수정':'수행 등록'))+'"><span class="ontherock-cell-title">'+esc(mission.title)+'</span><span class="ontherock-cell-mark">'+(record?stamp(all):'<span class="ontherock-cell-plus" aria-hidden="true">+</span>')+'</span><strong>'+mission.points+'<small>P</small>'+(all?'<span class="ontherock-bonus">+5</span>':'')+'</strong><span class="ontherock-cell-status">'+status+'</span></button>';
 }).join('')+'</div><div class="ontherock-legend"><span>'+stamp(false,true)+' 수행 완료</span><span>'+stamp(true,true)+' 전원 참여 완료</span></div><p class="ontherock-bingo-footnote">가로 · 세로 · 대각선, 완성한 줄마다 점수가 더해져요. 완료한 칸을 누르면 기록을 수정할 수 있어요.</p></section>';
}

function extraMissions(board,kind){
 const records=activeRecords(board),repeat=kind==='repeat';
 return '<section class="ontherock-extra" aria-labelledby="ontherock-'+kind+'-title"><div class="ontherock-section-heading"><h2 id="ontherock-'+kind+'-title">'+kinds[kind]+'</h2><span>'+(repeat?'각각 24시간 내 1회 기준':'각 미션 한 번씩')+'</span></div><div class="ontherock-mission-list">'+missions[kind].map(mission=>{
  const matching=records.filter(r=>r.missionId===mission.id),done=repeat?null:matching.find(r=>r.kind==='special');
  const repeatCount=matching.filter(r=>r.kind==='repeat').length;
  const hint=repeat?repeatCount+'회 기록':(done?'수행 완료':mission.detail||'');
  return '<article class="ontherock-mission"><div><h3>'+esc(mission.title)+'</h3><p>'+esc(hint)+'</p></div><span class="ontherock-mission-points">'+mission.points+'<small>P</small></span>'+button(done?'수정':'기록',done?'ontherock-edit':'ontherock-record',{id:done?.id||kind+':'+mission.id,class:'button small secondary'})+'</article>';
 }).join('')+'</div></section>';
}

function history(board){
 const records=[...(board.records||[])].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
 return '<section class="ontherock-history" aria-labelledby="ontherock-history-title"><div class="ontherock-section-heading"><h2 id="ontherock-history-title">수행 기록</h2><span>'+records.filter(r=>!r.voidedAt).length+'건</span></div>'+(records.length?'<ol>'+records.map(record=>{
  const mission=missionFor(record),bonus=record.kind==='bingo'&&record.allParticipated?5:0;
  return '<li class="ontherock-history-row'+(record.voidedAt?' is-void':'')+'"><div class="ontherock-history-mark">'+(record.voidedAt?icon('circle-x'):record.kind==='bingo'?stamp(record.allParticipated,true):icon(record.kind==='repeat'?'refresh-cw':'sparkles'))+'</div><div class="ontherock-history-main"><div class="ontherock-history-meta"><span>'+esc(kinds[record.kind])+'</span><time datetime="'+esc(record.completedAt)+'">'+stampDate(record.completedAt)+'</time>'+(record.voidedAt?'<span class="ontherock-void-label">취소됨</span>':'')+'</div><h3>'+esc(mission?.title||record.missionId)+'</h3><p>'+[record.participants?record.participants+'명 참여':'',record.allParticipated?'전원 참여':'',record.actorName?'기록 '+esc(record.actorName):''].filter(Boolean).join(' · ')+'</p>'+(record.note?'<p class="ontherock-history-note">'+esc(record.note)+'</p>':'')+'</div><div class="ontherock-history-actions"><strong>'+(record.voidedAt?'0':'+'+points((mission?.points||0)+bonus))+'<small>P</small></strong>'+(!record.voidedAt?button('수정','ontherock-edit',{id:record.id,class:'button small secondary'})+button('취소','ontherock-void',{id:record.id,class:'button small ghost'}):'')+'</div></li>';
 }).join('')+'</ol>':empty('첫 미션을 기록해 주세요','빙고에서 수행한 미션을 누르면 이곳에 기록이 쌓여요.'))+'<p class="ontherock-history-caption">수정·취소 시 점수를 다시 집계하며, 변경 내역은 기존 변경 이력에 남습니다.</p></section>';
}

export async function renderOnTheRock(ctx){
 const groupId=new URLSearchParams(location.search).get('group');
 const board=await ctx.api('onTheRockBoard',{semester:eventStorage,...(groupId?{groupId}:{})});
 ctx.state.onTheRock=board;
 return '<div class="ontherock-page"><div class="page-heading ontherock-heading"><div><span class="ontherock-eyebrow">우리 조의 친해지길 바래</span><h1 id="page-title" tabindex="-1">마티니 온더<span>樂</span></h1><p>함께한 미션을 기록하고, 우리 조의 빙고를 완성해요.</p></div>'+button('새로고침','ontherock-refresh',{class:'button secondary',icon:'refresh-cw'})+'</div>'+groupControls(board)+leaderboard(board)+(board.group?'<div class="ontherock-selected"><div>'+icon('users-round')+'<strong>'+esc(board.group.name)+'</strong>'+(board.group.memberCount?'<span>'+board.group.memberCount+'명</span>':'')+'</div></div><div class="ontherock-board-layout">'+bingo(board)+'<aside class="ontherock-sidebar">'+scoreSummary(board)+extraMissions(board,'repeat')+extraMissions(board,'special')+'</aside></div>'+history(board):'<section class="panel ontherock-empty">'+empty('우리 조를 선택해 주세요','위의 1조부터 5조 중 본인의 조를 누르면 바로 미션을 기록할 수 있어요.')+'</section>')+'</div>';
}

function recordDialog(ctx,kind,missionId,record){
 const board=ctx.state.onTheRock,group=board?.group,mission=missions[kind]?.find(m=>m.id===missionId);
 if(!group||!mission)return;
 const all=!!record?.allParticipated;
 const requestId=crypto.randomUUID();
 const dialog=modal((record?'기록 수정 · ':'미션 기록 · ')+mission.title,
  '<div class="wide ontherock-record-intro"><span>'+esc(group.name)+' · '+esc(kinds[kind])+'</span><strong>'+mission.points+'P'+(kind==='bingo'?' <small>전원 참여 시 +5P</small>':'')+'</strong>'+(mission.detail?'<p>'+esc(mission.detail)+'</p>':'')+'</div>'+
  field('completedAt','수행 일시 (한국 시간)',localDate(record?.completedAt),{type:'datetime-local',required:true,wide:true})+
  (kind==='bingo'?'<label class="field check-field wide ontherock-all-check"><span>조원 전원이 함께 참여했어요 <small>보라색 도장 · +5P</small></span><input type="checkbox" name="allParticipated"'+(all?' checked':'')+'></label>':'')+
  '<div class="wide ontherock-record-preview" data-ontherock-preview aria-live="polite"></div>'+
  field('note','메모',record?.note||'',{type:'textarea',maxLength:1000,rows:2,wide:true,placeholder:'함께한 장소나 기억할 내용을 적어 주세요. (선택)'}),async data=>{
   const completedAt=new Date(String(data.get('completedAt'))+':00+09:00');
   if(!Number.isFinite(completedAt.getTime()))throw new Error('수행 일시를 확인해 주세요.');
   const payload={groupId:group.id,semester:board.semester,...(record?.participants?{participants:record.participants}:{}),allParticipated:kind==='bingo'?data.get('allParticipated')==='on':!!record?.allParticipated,completedAt:completedAt.toISOString(),note:String(data.get('note')||'').trim()};
   await ctx.api(record?'updateOnTheRockRecord':'recordOnTheRockMission',{...payload,...(record?{id:record.id,revision:record.revision}:{requestId,kind,missionId})});
   await ctx.render();ctx.toast(record?'기록과 점수를 수정했습니다.':'미션을 기록하고 점수를 반영했습니다.');
  },{submit:record?'수정 저장':'미션 기록'});
 const allInput=dialog.querySelector('[name=allParticipated]'),preview=dialog.querySelector('[data-ontherock-preview]');
 const updatePreview=()=>{
  const isAll=!!allInput?.checked;
  preview.innerHTML=(kind==='bingo'?stamp(isAll,true):icon('check'))+'<span>'+(kind==='bingo'?(isAll?'전원 참여 도장 · ':'수행 완료 도장 · '):'기록 점수 · ')+'<strong>'+points(mission.points+(kind==='bingo'&&isAll?5:0))+'P</strong></span>';
 };
 allInput?.addEventListener('change',updatePreview);
 updatePreview();
}

export async function onTheRockAction(ctx,action,id){
 if(action==='ontherock-refresh')return ctx.render();
 if(action==='ontherock-select-group'){
  const slot=groupSlots(ctx.state.onTheRock?.groups||[]).find(slot=>String(slot.number)===String(id));
  if(!slot)return;
  const group=slot.group||await ctx.api('saveOnTheRockGroup',{requestId:slot.id,semester:eventStorage,name:slot.name,memberCount:0});
  return ctx.navigate(boardUrl(group.id));
 }

 if(action==='ontherock-record'){
  const [kind,missionId]=String(id||'').split(':');return recordDialog(ctx,kind,missionId);
 }
 const board=ctx.state.onTheRock,record=board?.records?.find(record=>record.id===id);
 if(!record||record.voidedAt)return;
 if(action==='ontherock-edit')return recordDialog(ctx,record.kind,record.missionId,record);
 if(action==='ontherock-void')return modal('수행 기록 취소','<div class="wide ontherock-void-confirm"><h3>'+esc(missionFor(record)?.title||record.missionId)+'</h3><p>'+stampDate(record.completedAt)+'</p><p>이 기록을 점수 집계에서 제외합니다. 취소한 기록과 변경 이력은 남아요.</p></div>',async()=>{
  await ctx.api('voidOnTheRockRecord',{id:record.id,groupId:board.group.id,semester:board.semester,revision:record.revision});
  await ctx.render();ctx.toast('수행 기록을 취소하고 점수를 다시 집계했습니다.');
 },{submit:'기록 취소',submitClass:'button danger'});
}
