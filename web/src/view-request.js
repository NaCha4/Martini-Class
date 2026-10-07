import { getMemberSessionKey } from './member-session.js';

export function routeSnapshot(){
 const route=globalThis.location;
 return route?[route.href,route.pathname,route.search,route.hash].join('|'):'';
}

// A response may update a view only while its route, identity and owner still match.
// `ownsView` keeps each feature's request generation or selected record check explicit.
export function memberRequestGuard(ctx,ownsView=()=>true){
 const route=routeSnapshot(),sessionKey=getMemberSessionKey(ctx);
 return ()=>routeSnapshot()===route&&getMemberSessionKey(ctx)===sessionKey&&ownsView();
}

export function adminRequestGuard(ctx){
 const route=routeSnapshot(),version=ctx.state.adminDataVersion,user=ctx.state.user;
 return ()=>routeSnapshot()===route&&ctx.state.adminDataVersion===version&&ctx.state.user===user;
}
