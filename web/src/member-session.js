// Session capabilities stay in sessionStorage; verified names stay in memory.
// Retain the original storage key and request receipt shape for older tabs/links.
export const MEMBER_STORAGE_KEY='martini-member-lounge-v1';
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
export function memberStorage(ctx){
 const view=memberState(ctx);if(view.storage)return view.storage;
 let saved={};try{saved=JSON.parse(sessionStorage.getItem(MEMBER_STORAGE_KEY)||'{}')||{};}catch{view.storageUnavailable=true;}
 view.storage={session:TOKEN.test(saved.session?.sessionKey||'')&&Number.isFinite(Date.parse(saved.session.expiresAt))?{sessionKey:saved.session.sessionKey,expiresAt:saved.session.expiresAt}:null,receipts:Array.isArray(saved.receipts)?saved.receipts.filter(validMemberReceipt).slice(-20).map(({id,receiptKey})=>({id,receiptKey})):[],pending:{}};
 for(const kind of requestKinds){const pending=saved.pending?.[kind];if(pending&&REQUEST_ID.test(pending.requestId||'')&&TOKEN.test(pending.receiptKey||''))view.storage.pending[kind]={requestId:pending.requestId,receiptKey:pending.receiptKey};}
 return view.storage;
}
export function persistMemberStorage(ctx){try{sessionStorage.setItem(MEMBER_STORAGE_KEY,JSON.stringify(memberStorage(ctx)));}catch{memberState(ctx).storageUnavailable=true;}}
export function clearMemberIdentity(ctx){
 const view=memberState(ctx);memberStorage(ctx).session=null;view.member=null;view.events=[];view.requests=[];view.applications=[];view.coupons=null;view.receiptRows=[];view.loaded=false;
 delete ctx.state.currentEvent;delete ctx.state.currentReceipt;delete ctx.state.memberInlineDetail;delete ctx.state.memberRouteSource;delete ctx.state.memberScrollTarget;delete ctx.state.memberActiveSection;persistMemberStorage(ctx);
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
 const view=memberState(ctx);view.events=[];view.requests=[];view.applications=[];view.coupons=null;view.receiptRows=[];view.loaded=false;
 delete ctx.state.currentEvent;delete ctx.state.currentReceipt;delete ctx.state.memberInlineDetail;delete ctx.state.memberRouteSource;delete ctx.state.memberScrollTarget;delete ctx.state.memberActiveSection;
 view.member=member&&typeof member.name==='string'?{name:member.name,semester:member.semester||''}:null;
 persistMemberStorage(ctx);
}
export function refreshMemberSession(ctx,expiresAt){
 const session=memberStorage(ctx).session;
 if(session&&Number.isFinite(Date.parse(expiresAt))){session.expiresAt=expiresAt;persistMemberStorage(ctx);}
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
 try{
  const pendingKeys=[];for(let index=0;index<sessionStorage.length;index++){const key=sessionStorage.key(index);if(key?.startsWith('martini-pending-'))pendingKeys.push(key);}
  for(const key of pendingKeys)sessionStorage.removeItem(key);
  sessionStorage.removeItem(MEMBER_STORAGE_KEY);
 }catch{throw new Error('브라우저의 조회 정보를 지우지 못했습니다. 이 탭을 닫아 부원 확인을 종료해 주세요.');}
 for(const name of ['memberLounge','memberVerificationReturnTo','pendingApplications','currentEvent','currentReceipt','memberInlineDetail','memberRouteSource','memberScrollTarget','memberActiveSection'])delete ctx.state[name];
}
