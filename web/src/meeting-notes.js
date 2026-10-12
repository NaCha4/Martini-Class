import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { hasPermission } from '../../functions/src/permissions.js';
import { validMeetingDocument,textDocument,meetingText,MEETING_TEXT_LIMIT } from '../../functions/src/meeting-document.js';
import { createMeetingAutosave } from './meeting-autosave.js';
import { adminRequestGuard } from './view-request.js';
import { esc,button,date,field,modal } from './ui.js';
import './meeting-notes.css';

const views=new WeakMap();
const localTime=value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const tools=[['bold','굵게','B'],['italic','기울임','I'],['underline','밑줄','U'],['strike','취소선','S'],['bulletList','글머리 목록','• 목록'],['orderedList','번호 목록','1. 목록'],['blockquote','인용','인용'],['left','왼쪽 정렬','왼쪽'],['center','가운데 정렬','가운데'],['right','오른쪽 정렬','오른쪽'],['undo','실행 취소','↶'],['redo','다시 실행','↷']];
const fileControl=()=>'<input type="file" data-meeting-file accept=".json,.txt,application/json,text/plain" hidden>';
const header=actions=>'<div class="page-heading"><div><h1 id="page-title" tabindex="-1">회의록</h1><p>회의 내용을 작성하고 저장한 문서를 다시 불러오세요.</p></div><div class="row-actions">'+actions+'</div></div>';
const active=(ctx,view)=>views.get(ctx)===view&&view.user===ctx.state.user?.uid&&view.version===(ctx.state.adminDataVersion||0)&&hasPermission(ctx.state.profile,'meetings');

function status(view){
 if(!view.node?.isConnected)return;
 const state=view.save.snapshot(),label=view.node.querySelector('[data-meeting-save-status]'),error=view.node.querySelector('[data-meeting-error]');
 label.textContent=view.readOnly?'확정된 회의록 · 읽기 전용':view.invalid?'입력 확인 필요':state.saving?'저장 중…':state.error?'저장하지 못함':state.dirty?'저장 대기 중…':'저장됨 · '+date(state.record.updatedAt,true);
 error.textContent=view.invalid||(state.error?.code?.endsWith('aborted')?'다른 사람이 먼저 수정했습니다. 작성 중인 내용을 파일로 내보낸 뒤 저장된 회의록을 다시 불러와 주세요.':state.error?'저장하지 못했습니다. 연결을 확인하고 저장 버튼으로 다시 시도해 주세요. 입력 내용은 이 화면에 남아 있습니다.':'');
 error.hidden=!error.textContent;
 view.node.querySelector('[data-meeting-reload]').hidden=!state.error?.code?.endsWith('aborted');
 view.node.querySelector('[data-meeting-count]').textContent=meetingText(view.editor&&!view.editor.isDestroyed?view.editor.getJSON():state.draft.document).length.toLocaleString('ko-KR')+' / '+MEETING_TEXT_LIMIT.toLocaleString('ko-KR')+'자';
}
function confirmDiscard(){
 return new Promise(resolve=>{
  let discard=false;
  const dialog=modal('저장되지 않은 내용이 있습니다','<p class="wide">저장에 실패했거나 입력을 확인해야 합니다. 계속 작성하거나 파일로 내보낸 뒤 다시 시도할 수 있습니다.</p>',async()=>{discard=true;},{submit:'저장하지 않고 이동',submitClass:'button danger'});
  dialog.addEventListener('close',()=>resolve(discard),{once:true});
 });
}
export function clearMeetingView(ctx){
 const view=views.get(ctx);if(!view)return;
 view.save.dispose();view.editor?.destroy();view.abort?.abort();views.delete(ctx);
 delete ctx.beforeLeaveEditor;delete ctx.hasUnsavedEditor;
}
function makeView(ctx,record){
 clearMeetingView(ctx);
 const view={record,user:ctx.state.user?.uid,version:ctx.state.adminDataVersion||0,readOnly:record.status==='final'&&!hasPermission(ctx.state.profile,'settings'),invalid:'',node:null};
 views.set(ctx,view);
 view.save=createMeetingAutosave({record,save:input=>{
  if(!active(ctx,view))throw Object.assign(Error('접근 권한을 다시 확인해 주세요.'),{code:'permission-denied'});
  return ctx.api('saveMeetingNote',input);
 },onChange:state=>{
  if(!active(ctx,view)){clearMeetingView(ctx);return;}
  if(state.error&&/permission-denied|unauthenticated/.test(state.error.code||'')){clearMeetingView(ctx);void ctx.render();return;}
  status(view);
 }});
 ctx.hasUnsavedEditor=()=>active(ctx,view)&&(!!view.invalid||view.save.snapshot().dirty||view.save.snapshot().saving);
 ctx.beforeLeaveEditor=async()=>{
  if(!active(ctx,view)){clearMeetingView(ctx);return true;}
  if(!ctx.hasUnsavedEditor())return true;
  if(!view.invalid&&await view.save.flush())return true;
  if(!active(ctx,view))return true;
  if(!await confirmDiscard())return false;
  view.save.discard();view.invalid='';return true;
 };
 return view;
}

export async function renderMeetingNotes(ctx){
 const id=location.pathname.split('/')[3];
 if(!id){
  clearMeetingView(ctx);
  const current=adminRequestGuard(ctx),result=await ctx.api('read',{kind:'meetings'});
  if(!current())return '';
  ctx.state.meetingList=result;
  return header(button('파일 불러오기','meeting-import',{class:'button secondary'})+button('새 회의록','meeting-new',{icon:'plus'}))+
   '<section class="minutes-library" data-meeting-library><label class="search-box">회의록 검색<input type="search" data-meeting-search placeholder="제목으로 검색" aria-label="회의록 검색"></label><div data-meeting-list>'+noteRows(result.rows)+'</div><p data-meeting-empty'+(result.rows.length?' hidden':'')+'>저장된 회의록이 없습니다. 새 회의록을 작성해 보세요.</p>'+button('더 불러오기','meeting-more',{class:'button secondary',disabled:!result.nextCursor})+fileControl()+'</section>';
 }
 let view=views.get(ctx);
 if(!view||!active(ctx,view)||view.record.id!==id){
  const current=adminRequestGuard(ctx),result=await ctx.api('read',{kind:'meetings',recordId:id});
  if(!current())return '';
  const record=result.rows[0];
  const document=record.document||textDocument(record.body||'');
  if(!validMeetingDocument(document))throw Error('지원하지 않는 회의록 서식입니다. 운영진에게 확인해 주세요.');
  view=makeView(ctx,{...record,document});
 }
 const state=view.save.snapshot();
 return header('<a class="button secondary" href="/admin/meetings" data-nav>불러오기 · 목록</a>'+button('파일 내보내기','meeting-export',{class:'button secondary'})+button('저장','meeting-save',{icon:'check',disabled:view.readOnly}))+
  '<section class="minutes-workspace" data-meeting-workspace><div class="minutes-meta">'+field('meetingTitle','회의록 제목',state.draft.title,{maxLength:160,readOnly:view.readOnly})+field('meetingDate','회의 일시',localTime(state.draft.date),{type:'datetime-local',readOnly:view.readOnly})+'</div><div class="minutes-save-line"><span role="status" aria-live="polite" data-meeting-save-status></span><span data-meeting-count></span></div><p role="alert" class="minutes-error" data-meeting-error hidden></p><button type="button" class="button secondary" data-meeting-reload hidden>저장된 회의록 다시 불러오기</button>'+
  '<div class="minutes-toolbar" role="toolbar" aria-label="회의록 서식"><label>문단<select aria-label="문단 서식" data-meeting-heading'+(view.readOnly?' disabled':'')+'><option value="0">본문</option><option value="1">큰 제목</option><option value="2">제목</option><option value="3">작은 제목</option></select></label>'+tools.map(([command,title,text])=>'<button type="button" data-meeting-format="'+command+'" aria-label="'+title+'" title="'+title+'"'+(view.readOnly?' disabled':'')+'>'+text+'</button>').join('')+'</div><div class="minutes-paper"><div data-meeting-editor></div></div><p class="help">입력을 잠시 멈추면 자동 저장됩니다. Ctrl+S로 바로 저장할 수 있습니다. 여러 사람이 수정하면 먼저 저장된 내용과 충돌할 수 있습니다.</p>'+fileControl()+'</section>';
}
function noteRows(rows){return rows.map(record=>'<a href="/admin/meetings/'+encodeURIComponent(record.id)+'" data-nav class="minutes-record" data-meeting-title="'+esc(record.title.toLocaleLowerCase('ko-KR'))+'"><div><strong>'+esc(record.title)+'</strong><span>'+date(record.date,true)+'</span></div><small>'+ (record.status==='final'?'확정 · ':'')+'수정 '+date(record.updatedAt,true)+'</small><span aria-hidden="true">→</span></a>').join('');}
function filterNotes(root){
 const query=root.querySelector('[data-meeting-search]').value.trim().toLocaleLowerCase('ko-KR');let found=0;
 for(const row of root.querySelectorAll('[data-meeting-title]')){row.hidden=!row.dataset.meetingTitle.includes(query);if(!row.hidden)found++;}
 const empty=root.querySelector('[data-meeting-empty]');empty.hidden=found>0;empty.textContent=query?'검색한 제목의 회의록이 없습니다.':'저장된 회의록이 없습니다. 새 회의록을 작성해 보세요.';
}
async function createNote(ctx,values={}){
 if(!hasPermission(ctx.state.profile,'meetings'))throw Error('회의록 작성 권한이 없습니다.');
 if(ctx.beforeLeaveEditor&&!await ctx.beforeLeaveEditor())return;
 const current=adminRequestGuard(ctx),key=JSON.stringify(values);
 if(ctx.state.meetingCreateRequest?.key!==key)ctx.state.meetingCreateRequest={key,input:{id:crypto.randomUUID(),revision:0,requestId:crypto.randomUUID(),title:'제목 없는 회의록',date:new Date().toISOString(),semester:ctx.state.settings.semester||'2026-2',document:textDocument(),...values}};
 const result=await ctx.api('saveMeetingNote',ctx.state.meetingCreateRequest.input);
 if(!current())return;
 delete ctx.state.meetingCreateRequest;
 await ctx.navigate('/admin/meetings/'+result.id);
}
function download(view){
 const draft=view.save.snapshot().draft;
 if(view.editor&&!view.editor.isDestroyed)draft.document=view.editor.getJSON();
 draft.title=view.node?.querySelector('[name=meetingTitle]')?.value.trim()||draft.title;
 const blob=new Blob([JSON.stringify({format:'martini-meeting-note',version:1,...draft},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=(draft.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'회의록')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function meetingAction(ctx,action){
 if(action==='meeting-new')return createNote(ctx);
 if(action==='meeting-import'){document.querySelector('[data-meeting-file]')?.click();return;}
 const view=views.get(ctx);
 if(action==='meeting-export'&&view&&active(ctx,view)){download(view);return;}
 if(action==='meeting-save'&&view&&active(ctx,view)){
  if(view.invalid){status(view);return;}
  if(await view.save.flush())ctx.toast('회의록을 저장했습니다.');return;
 }
 if(action==='meeting-more'){
  const current=adminRequestGuard(ctx),page=ctx.state.meetingList;if(!page?.nextCursor)return;
  const more=await ctx.api('read',{kind:'meetings',cursor:page.nextCursor});if(!current())return;
  const seen=new Set(page.rows.map(row=>row.id));page.rows.push(...more.rows.filter(row=>!seen.has(row.id)));page.nextCursor=more.nextCursor;
  const root=document.querySelector('[data-meeting-library]');if(!root)return;
  root.querySelector('[data-meeting-list]').innerHTML=noteRows(page.rows);root.querySelector('[data-action="meeting-more"]').disabled=!page.nextCursor;filterNotes(root);
 }
}

export function mountMeetingNotes(ctx,app){
 const library=app.querySelector('[data-meeting-library]'),root=app.querySelector('[data-meeting-workspace]');
 if(!library&&!root)return;
 const file=(library||root).querySelector('[data-meeting-file]');
 file.addEventListener('change',async()=>{
  const selected=file.files[0];if(!selected)return;
  const current=adminRequestGuard(ctx);
  try{
   if(selected.size>1000000)throw Error('1MB 이하의 회의록 파일을 선택해 주세요.');
   const source=await selected.text();if(!current())return;
   let values;
   if(/\.txt$/i.test(selected.name))values={title:selected.name.replace(/\.txt$/i,'').slice(0,160)||'불러온 회의록',document:textDocument(source)};
   else{const data=JSON.parse(source);if(data?.format!=='martini-meeting-note'||data.version!==1||typeof data.title!=='string'||!data.title.trim()||data.title.length>160||!Number.isFinite(Date.parse(data.date)))throw Error('이 화면에서 내보낸 회의록 JSON 또는 TXT 파일을 선택해 주세요.');values={title:data.title.trim(),date:new Date(data.date).toISOString(),document:data.document};}
   if(!validMeetingDocument(values.document))throw Error('30,000자 이내의 지원되는 회의록 파일을 선택해 주세요.');
   await createNote(ctx,values);
  }catch(error){if(current())ctx.toast(error instanceof SyntaxError?'회의록 파일 형식을 확인해 주세요.':error.message);}
  finally{file.value='';}
 });
 if(library){library.querySelector('[data-meeting-search]').addEventListener('input',()=>filterNotes(library));return;}
 const view=views.get(ctx);if(!view||!active(ctx,view))return;
 view.editor?.destroy();view.editor=null;view.abort?.abort();view.abort=new AbortController();view.node=root;
 const signal=view.abort.signal;
 const capture=()=>{
  if(!active(ctx,view)||view.readOnly||!view.editor)return;
  const instant=Date.parse(root.querySelector('[name=meetingDate]').value),document=view.editor.getJSON();
  view.invalid=!Number.isFinite(instant)?'회의 일시를 입력해 주세요.':!validMeetingDocument(document)?'회의록은 30,000자 이내로 작성해 주세요.':'';
  if(!view.invalid)view.save.update({title:root.querySelector('[name=meetingTitle]').value.trim()||'제목 없는 회의록',date:new Date(instant).toISOString(),document});
  status(view);
 };
 view.editor=new Editor({element:root.querySelector('[data-meeting-editor]'),extensions:[StarterKit.configure({heading:{levels:[1,2,3]},link:false,code:false,codeBlock:false}),TextAlign.configure({types:['heading','paragraph']})],content:view.save.snapshot().draft.document,editable:!view.readOnly,editorProps:{attributes:{role:'textbox','aria-label':'회의록 본문','aria-multiline':'true',spellcheck:'false'}},onUpdate:capture,onSelectionUpdate:()=>toolbar(view),onTransaction:()=>toolbar(view)});
 root.querySelectorAll('[name=meetingTitle],[name=meetingDate]').forEach(input=>input.addEventListener('input',capture,{signal}));
 root.querySelectorAll('[data-meeting-format]').forEach(control=>{
  control.addEventListener('mousedown',event=>event.preventDefault(),{signal});
  control.addEventListener('click',()=>{
   if(view.readOnly)return;const command=control.dataset.meetingFormat,chain=view.editor.chain().focus();
   if(['left','center','right'].includes(command))chain.setTextAlign(command).run();
   else if(['undo','redo'].includes(command))chain[command]().run();
   else chain['toggle'+command[0].toUpperCase()+command.slice(1)]().run();
   toolbar(view);
  },{signal});
 });
 root.querySelector('[data-meeting-heading]').addEventListener('change',event=>{const level=Number(event.target.value),chain=view.editor.chain().focus();if(level)chain.setHeading({level}).run();else chain.setParagraph().run();},{signal});
 root.querySelector('[data-meeting-reload]').addEventListener('click',async()=>{if(!await ctx.beforeLeaveEditor())return;clearMeetingView(ctx);await ctx.render();},{signal});
 document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&active(ctx,view)){event.preventDefault();if(!view.readOnly&&!view.invalid)void view.save.flush();}},{signal});
 window.addEventListener('online',()=>{if(active(ctx,view)&&!view.invalid)void view.save.flush();},{signal});
 status(view);toolbar(view);
}
function toolbar(view){
 if(!view.editor||view.editor.isDestroyed||!view.node?.isConnected)return;
 const editor=view.editor;
 for(const control of view.node.querySelectorAll('[data-meeting-format]')){
  const command=control.dataset.meetingFormat;
  if(['undo','redo'].includes(command)){control.disabled=view.readOnly||!editor.can()[command]();continue;}
  control.setAttribute('aria-pressed',String(['left','center','right'].includes(command)?editor.isActive({textAlign:command}):editor.isActive(command)));
 }
 view.node.querySelector('[data-meeting-heading]').value=editor.isActive('heading')?String(editor.getAttributes('heading').level):'0';
}
