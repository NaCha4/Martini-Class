export const MERCHANT_SESSION_COOKIE='__Host-martini-feelingfine-session';
export const MERCHANT_SESSION_CHANNEL='martini-feelingfine-session';
const TOKEN=/^[a-f0-9]{64}$/;
const YEAR=365*86400000;
function options(){
 if(typeof document==='undefined'||!('cookie' in document))return null;
 const local=location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 return {name:local?'martini-feelingfine-session-local':MERCHANT_SESSION_COOKIE,attributes:'; Path=/; SameSite=Lax'+(local?'':'; Secure')};
}
function readCookie(config){try{return document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(config.name+'='))?.slice(config.name.length+1)||'';}catch{return '';}}
function parse(raw){try{const value=JSON.parse(decodeURIComponent(raw));return TOKEN.test(value.sessionKey||'')&&Number.isFinite(Date.parse(value.expiresAt))?{sessionKey:value.sessionKey,expiresAt:value.expiresAt}:null;}catch{return null;}}
function state(ctx){
 const config=options(),raw=config?readCookie(config):'';
 const view=ctx.state.merchantAuth??={session:parse(raw),snapshot:raw,cookieUnavailable:!config};
 if(config&&raw!==view.snapshot){view.snapshot=raw;view.session=parse(raw);view.cookieUnavailable=false;}
 return view;
}
function write(ctx,session){
 const view=state(ctx),config=options();view.session=session;
 if(!config){view.cookieUnavailable=true;return;}
 const raw=session?encodeURIComponent(JSON.stringify(session)):'';
 const seconds=session?Math.max(0,Math.floor(Math.min(YEAR,Date.parse(session.expiresAt)-Date.now())/1000)):0;
 try{document.cookie=config.name+'='+raw+config.attributes+'; Max-Age='+seconds+'; Expires='+(session?new Date(session.expiresAt):new Date(0)).toUTCString();}catch{}
 view.snapshot=readCookie(config);view.cookieUnavailable=view.snapshot!==raw;
 try{if(globalThis.window?.BroadcastChannel){const channel=new window.BroadcastChannel(MERCHANT_SESSION_CHANNEL);channel.postMessage('changed');channel.close();}}catch{}
}
export function getMerchantSessionKey(ctx){
 const view=state(ctx);if(!view.session)return '';
 if(Date.parse(view.session.expiresAt)<=Date.now()){write(ctx,null);return '';}
 return view.session.sessionKey;
}
export function setMerchantSession(ctx,value){
 const expiresAt=Date.parse(value?.expiresAt);
 if(!TOKEN.test(value?.sessionKey||'')||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('매장 로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
 write(ctx,{sessionKey:value.sessionKey,expiresAt:new Date(Math.min(expiresAt,Date.now()+YEAR)).toISOString()});
}
export function clearMerchantSession(ctx){write(ctx,null);}
export function merchantCookieUnavailable(ctx){return state(ctx).cookieUnavailable;}
export const isMerchantAccessError=error=>['permission-denied','unauthenticated','functions/permission-denied','functions/unauthenticated'].includes(error?.code);
