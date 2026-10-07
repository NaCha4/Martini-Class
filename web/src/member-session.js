// Only the opaque session and its fixed server expiry persist in a cookie.
// Receipt capabilities remain tab-local; verified identities stay in memory.
export const MEMBER_STORAGE_KEY='martini-member-lounge-v1';
export const MEMBER_SESSION_COOKIE='__Host-martini-member-session';
export const MEMBER_SESSION_CHANNEL='martini-member-session';
const TOKEN=/^[a-f0-9]{64}$/;
const REQUEST_ID=/^[a-zA-Z0-9_-]{1,128}$/;
const requestKinds=['visit','join','inquiry'];
export const isMemberRoute=(path=globalThis.location?.pathname||'')=>{
 const pathname=path.split(/[?#]/,1)[0].replace(/\/+$/,'')||'/';
 return pathname==='/events'||/^\/members(?:\/|$)/.test(pathname);
};

export function memberState(ctx){
 const view=ctx.state.memberLounge??={};
 const defaults={loaded:false,storage:null,member:null,events:[],requests:[],applications:[],receiptRows:[],receiptErrors:0,error:'',applicationsError:'',couponsError:'',coupons:null,storageUnavailable:false};
 for(const [name,value] of Object.entries(defaults))if(view[name]===undefined)view[name]=value;
 return view;
}
export const validMemberReceipt=value=>!!value&&REQUEST_ID.test(value.id||'')&&TOKEN.test(value.receiptKey||'');
function validSession(value){return value&&TOKEN.test(value.sessionKey||'')&&Number.isFinite(Date.parse(value.expiresAt))?{sessionKey:value.sessionKey,expiresAt:value.expiresAt}:null;}
function cookieOptions(){
 if(typeof document==='undefined'||!('cookie' in document))return null;
 const url=globalThis.location;
 if(url?.protocol==='https:')return {name:MEMBER_SESSION_COOKIE,attributes:'; Path=/; Secure; SameSite=Lax'};
 if(url?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))return {name:'martini-member-session-local',attributes:'; Path=/; SameSite=Lax'};
 return {name:MEMBER_SESSION_COOKIE,attributes:'; Path=/; Secure; SameSite=Lax'};
}
function readCookie(options){
 try{return document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(options.name+'='))?.slice(options.name.length+1)||'';}catch{return '';}
}
function cookieSession(raw){try{return validSession(JSON.parse(decodeURIComponent(raw)));}catch{return null;}}
function sessionOwner(session){
 // A non-authenticating cache tag detects account changes without copying the
 // bearer capability into tab storage. Authorization always happens on the server.
 if(!session)return '';
 let tag=14695981039346656037n;
 for(const char of session.sessionKey)tag=BigInt.asUintN(64,(tag^BigInt(char.charCodeAt(0)))*1099511628211n);
 return tag.toString(16);
}
function clearPendingEventStorage(ctx){
 delete ctx.state.pendingApplications;
 try{
  const keys=[];for(let index=0;index<sessionStorage.length;index++){const name=sessionStorage.key(index);if(name?.startsWith('martini-pending-'))keys.push(name);}
  for(const name of keys)sessionStorage.removeItem(name);
 }catch{memberState(ctx).storageUnavailable=true;}
}
function announceSessionChange(){
 // No credentials or identity are sent between tabs.
 try{if(globalThis.window?.BroadcastChannel){const channel=new window.BroadcastChannel(MEMBER_SESSION_CHANNEL);channel.postMessage('changed');channel.close();}}catch{}
}
function resetPrivateView(ctx){
 const view=memberState(ctx);view.member=null;view.events=[];view.requests=[];view.applications=[];view.coupons=null;view.receiptRows=[];view.loaded=false;view.equipmentLoans=[];delete view.equipment;delete view.equipmentPending;view.equipmentLoad=(view.equipmentLoad||0)+1;
 delete ctx.state.currentEvent;delete ctx.state.currentReceipt;delete ctx.state.memberInlineDetail;delete ctx.state.memberRouteSource;delete ctx.state.memberScrollTarget;delete ctx.state.memberActiveSection;
}
function writeSessionCookie(ctx,session){
 const view=memberState(ctx),options=cookieOptions();if(!options)return;
 const raw=session?encodeURIComponent(JSON.stringify(session)):'';
 const seconds=session?Math.max(0,Math.floor((Date.parse(session.expiresAt)-Date.now())/1000)):0;
 try{document.cookie=options.name+'='+raw+options.attributes+'; Max-Age='+seconds+'; Expires='+(session?new Date(session.expiresAt):new Date(0)).toUTCString();}catch{}
 view.cookieSnapshot=readCookie(options);view.cookieUnavailable=view.cookieSnapshot!==raw;
 announceSessionChange();
}
function saveTabStorage(ctx){
 const view=memberState(ctx),saved=view.storage;
 // The marker prevents an old tab-local token from restoring a removed cookie.
 const value=cookieOptions()?{sessionMigrated:true,sessionOwner:sessionOwner(saved.session),receipts:saved.receipts,pending:saved.pending}:saved;
 try{sessionStorage.setItem(MEMBER_STORAGE_KEY,JSON.stringify(value));}catch{view.storageUnavailable=true;}
}
export function memberStorage(ctx){
 const view=memberState(ctx),options=cookieOptions();
 if(view.storage){
  if(options){
   const raw=readCookie(options);
   if(raw!==view.cookieSnapshot){
    const previous=view.storage.session?.sessionKey,next=cookieSession(raw);
    view.cookieSnapshot=raw;view.storage.session=next;view.cookieUnavailable=false;
    if(previous!==next?.sessionKey){
     resetPrivateView(ctx);view.storage.receipts=[];view.storage.pending={};clearPendingEventStorage(ctx);saveTabStorage(ctx);
    }
   }
  }
  return view.storage;
 }
 let saved={};try{saved=JSON.parse(sessionStorage.getItem(MEMBER_STORAGE_KEY)||'{}')||{};}catch{view.storageUnavailable=true;}
 const legacy=validSession(saved.session);
 view.cookieSnapshot=options?readCookie(options):'';
 view.storage={session:options?cookieSession(view.cookieSnapshot):legacy,receipts:Array.isArray(saved.receipts)?saved.receipts.filter(validMemberReceipt).slice(-20).map(({id,receiptKey})=>({id,receiptKey})):[],pending:{}};
 for(const kind of requestKinds){const pending=saved.pending?.[kind];if(pending&&REQUEST_ID.test(pending.requestId||'')&&TOKEN.test(pending.receiptKey||''))view.storage.pending[kind]={requestId:pending.requestId,receiptKey:pending.receiptKey};}
 if(options){
  if(!view.cookieSnapshot&&!saved.sessionMigrated&&legacy&&Date.parse(legacy.expiresAt)>Date.now()){view.storage.session=legacy;writeSessionCookie(ctx,legacy);}
  const owner=saved.sessionOwner??(saved.sessionMigrated?null:sessionOwner(legacy));
  if(owner!==sessionOwner(view.storage.session)){view.storage.receipts=[];view.storage.pending={};clearPendingEventStorage(ctx);}
  saveTabStorage(ctx);
 }
 return view.storage;
}
export function persistMemberStorage(ctx){memberStorage(ctx);saveTabStorage(ctx);}
export function clearMemberIdentity(ctx){
 memberStorage(ctx).session=null;resetPrivateView(ctx);writeSessionCookie(ctx,null);saveTabStorage(ctx);
}
export function getMemberSessionKey(ctx){
 const session=memberStorage(ctx).session;if(!session)return '';
 if(Date.parse(session.expiresAt)<=Date.now()){clearMemberIdentity(ctx);return '';}
 return session.sessionKey;
}
export function getVerifiedMember(ctx){return getMemberSessionKey(ctx)?memberState(ctx).member:null;}
export function setMemberSession(ctx,{sessionKey,expiresAt,member}){
 if(!TOKEN.test(sessionKey||'')||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw new Error('부원 확인 정보가 올바르지 않습니다. 다시 확인해 주세요.');
 memberStorage(ctx).session={sessionKey,expiresAt};
 resetPrivateView(ctx);const view=memberState(ctx);
 view.member=member&&typeof member.name==='string'?{name:member.name,semester:member.semester||''}:null;
 writeSessionCookie(ctx,view.storage.session);saveTabStorage(ctx);
}
export function refreshMemberSession(ctx,expiresAt){
 const session=memberStorage(ctx).session;
 if(session&&Number.isFinite(Date.parse(expiresAt))&&session.expiresAt!==expiresAt){session.expiresAt=expiresAt;writeSessionCookie(ctx,session);saveTabStorage(ctx);}
}
// Missing event/application IDs are not expired sessions.
export const isMemberAccessError=error=>['permission-denied','unauthenticated','functions/permission-denied','functions/unauthenticated'].includes(error?.code);
export function safeMemberReturnTarget(target,fallback='/members'){
 const value=typeof target==='string'?target.trim():'';
 if(!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f]/.test(value))return fallback;
 const path=value.split(/[?#]/,1)[0].replace(/\/$/,'');
 if(path==='/events'||/^\/members(?:\/(?:events|applications)(?:\/[a-zA-Z0-9_-]{1,128})?|\/(?:coupons|more))?$/.test(path))return path;
 return fallback;
}
export function forgetMemberDevice(ctx){
 clearMemberIdentity(ctx);let failed=memberState(ctx).cookieUnavailable;
 try{
  const pendingKeys=[];for(let index=0;index<sessionStorage.length;index++){const key=sessionStorage.key(index);if(key?.startsWith('martini-pending-'))pendingKeys.push(key);}
  for(const key of pendingKeys)sessionStorage.removeItem(key);
  sessionStorage.removeItem(MEMBER_STORAGE_KEY);
 }catch{failed=true;}
 for(const name of ['memberLounge','memberVerificationReturnTo','pendingApplications','currentEvent','currentReceipt','memberInlineDetail','memberRouteSource','memberScrollTarget','memberActiveSection'])delete ctx.state[name];
 if(failed)throw new Error('브라우저의 로그인 정보를 지우지 못했습니다. 브라우저 설정에서 이 사이트의 쿠키와 데이터를 지워 주세요.');
}
