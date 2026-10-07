import { toast, modal, closeModal, formSignature } from './ui.js';
import { clearScreen } from './screen-router.js';

export function createNavigation(ctx,runtime){
const {state}=ctx;
let navigating=false;
const render=options=>ctx.render(options);
let currentIndex=Number(history.state?.martiniIndex||0),currentUrl=location.pathname+location.search+location.hash,restoringHistory=false;
const positions=new Map();
history.replaceState({...history.state,martiniIndex:currentIndex},'');
history.scrollRestoration='manual';
function rememberPosition(){positions.set(currentIndex,{scroll:scrollY,search:state.search,filter:state.filter,eventType:state.eventType});}
function dirtyApplication(){return runtime.trackedForm?.node.isConnected&&formSignature(runtime.trackedForm.node)!==runtime.trackedForm.signature;}
async function mayLeave({preserveVisitDraft=false}={}) {
  if(document.querySelector('form[data-form][aria-busy=true]')){toast('요청을 처리하고 있습니다. 완료될 때까지 기다려 주세요.');return false;}
  if(!await closeModal())return false;
  if(preserveVisitDraft&&runtime.trackedForm?.node.matches('form[data-form="member-visit"]'))return true;
  if(!dirtyApplication())return true;
  return new Promise(resolve=>{
    let accepted=false;
    const dialog=modal('신청서 작성을 그만둘까요?','<p class="wide">아직 신청이 완료되지 않았습니다. 이동하면 입력한 내용이 사라집니다.</p>',async()=>{accepted=true;},{submit:'작성 내용 버리고 이동',submitClass:'button danger',busyText:'이동 중…'});
    dialog.addEventListener('close',()=>resolve(accepted),{once:true});
  });
}
async function navigate(path,{discard=false,replace=false}={}) {
  if(navigating&&!discard)return false;
  navigating=true;
  try {
    if(!discard&&!await mayLeave())return false;
    if(discard)await closeModal({discard:true});
    clearScreen(ctx);
    rememberPosition();
    if(!replace)currentIndex++;
    history[replace?'replaceState':'pushState']({martiniIndex:currentIndex},'',path);
    currentUrl=location.pathname+location.search+location.hash;
    state.search='';state.filter='all';state.eventType='all';
    await render({focus:true,scroll:0});
    return true;
  } finally {navigating=false;}
}
window.addEventListener('popstate',async event=>{
  if(restoringHistory){restoringHistory=false;return;}
  const destination=Number(event.state?.martiniIndex??currentIndex),destinationUrl=location.pathname+location.search+location.hash;
  rememberPosition();
  if(!await mayLeave()){
    const delta=currentIndex-destination;
    if(delta){restoringHistory=true;history.go(delta);}else history.replaceState({martiniIndex:currentIndex},'',currentUrl);
    return;
  }
  currentIndex=destination;currentUrl=destinationUrl;
  clearScreen(ctx);
  const remembered=positions.get(currentIndex);
  state.search=remembered?.search||'';state.filter=remembered?.filter||'all';state.eventType=remembered?.eventType||'all';
  await render({focus:true,scroll:remembered?.scroll||0});
});
window.addEventListener('beforeunload',event=>{
  const dialog=document.querySelector('#modal[open]');
  if(dialog?.isDirty()||dialog?.isSaving()||dirtyApplication()||document.querySelector('form[aria-busy=true]')){event.preventDefault();event.returnValue='';}
});
return {navigate,mayLeave,syncUrl(){currentUrl=location.pathname+location.search+location.hash;}};
}
