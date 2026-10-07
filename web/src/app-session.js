import { closeModal } from './ui.js';
import { clearAdminData } from './admin-session.js';
import { isRequestViewer } from '../../functions/src/permissions.js';
import { isMemberRoute, getMemberSessionKey, memberStorage, MEMBER_SESSION_CHANNEL } from './member-session.js';
import { isAdminScreen, isMerchantScreen, clearScreen } from './screen-router.js';

export function createSessionLifecycle(ctx,app,runtime){
const {state,api}=ctx;
const render=options=>ctx.render(options);
let memberExpiryTimer;
let adminExpiryTimer,checkingAdmin=false;
function scheduleAdminExpiry(){
 clearTimeout(adminExpiryTimer);
 if(!isAdminScreen()||!isRequestViewer(state.profile))return;
 const remaining=Date.parse(state.profile.sessionExpiresAt)-Date.now();
 if(!Number.isFinite(remaining))return;
 adminExpiryTimer=setTimeout(refreshAdminSession,Math.max(1000,Math.min(remaining+20,60000)));
}
async function refreshAdminSession(){
 if(!isAdminScreen()||!isRequestViewer(state.profile)||checkingAdmin)return;
 checkingAdmin=true;const user=state.user;
 try{
  const profile=await api('profile');
  if(state.user!==user)return;
  if(profile.role!==state.profile?.role){clearAdminData(state);await closeModal({discard:true});await render();}
  else state.profile=profile;
 }catch{
  if(state.user!==user)return;
  clearAdminData(state);await closeModal({discard:true});await render();
 }finally{checkingAdmin=false;scheduleAdminExpiry();}
}
window.addEventListener('focus',refreshAdminSession);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshAdminSession();});
function expireMemberView(){
  if(!isMemberRoute())return;
  const session=getMemberSessionKey(ctx);
  if(session===runtime.renderedMemberSession&&(session||!app.querySelector('.member-shell,.member-retry-page')&&!document.querySelector('.member-dialog')))return;
  // A cookie changed in another tab. Remove the previous member's view immediately.
  void closeModal({discard:true});
  void render({focus:true});
}
function scheduleMemberExpiry(){
  clearTimeout(memberExpiryTimer);
  if(!isMemberRoute()||!getMemberSessionKey(ctx))return;
  const remaining=Date.parse(memberStorage(ctx).session.expiresAt)-Date.now();
  memberExpiryTimer=setTimeout(()=>{expireMemberView();scheduleMemberExpiry();},Math.max(0,Math.min(remaining+20,2147483647)));
}
window.addEventListener('focus',expireMemberView);
window.addEventListener('pageshow',expireMemberView);
window.addEventListener('pageshow',event=>{if(event.persisted&&(isMerchantScreen()||isMemberRoute()||isAdminScreen())){void closeModal({discard:true});void render({focus:true});}});
window.addEventListener('hashchange',()=>{if(isMerchantScreen())void render({focus:true});});
window.addEventListener('pagehide',()=>{clearScreen(ctx);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')expireMemberView();});
try{if(window.BroadcastChannel){const channel=new window.BroadcastChannel(MEMBER_SESSION_CHANNEL);channel.addEventListener('message',expireMemberView);}}catch{}

let authReady;
function ensureAdminAuth(){
 if(!isAdminScreen())return Promise.resolve();
 if(!authReady)authReady=import('./firebase.js').then(({auth,onAuthStateChanged})=>new Promise(resolve=>{
  let initialized=false;
  onAuthStateChanged(auth,user=>{
   clearTimeout(adminExpiryTimer);
   clearAdminData(state);state.authError='';
   if(isAdminScreen()){void closeModal({discard:true});app.replaceChildren();}
   state.user=user;state.authReady=true;
   if(!initialized){initialized=true;resolve();}
   else if(isAdminScreen())void render();
  });
 }));
 return authReady;
}
return {ensureAdminAuth,schedule(){scheduleMemberExpiry();scheduleAdminExpiry();}};
}
