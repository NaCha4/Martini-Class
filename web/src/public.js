import { mountMemberDetail } from './member-detail.js';
import { bindVisitCalendar } from './visit-calendar.js';
import { mountPartnerViews, clearPartnerViews } from './partner-stamps.js';
import { mountMemberEquipmentRefresh, clearMemberEquipmentRefresh } from './equipment.js';
import { publicShell as shell } from './public-shell.js';
import { linkKey } from './share-links.js';
import { renderEventPage, renderApplicationPage, renderLinkError, eventSubmit, eventAction } from './event-pages.js';
import { renderMemberPortal, renderMemberVerificationGate, memberPortalAction, memberPortalSubmit } from './member-portal.js';
import { getMemberSessionKey, isMemberRoute } from './member-session.js';
import { MEMBER_TABS, memberTabForPath, activateMemberTab, activateMemberRequestView } from './member-navigation.js';
import { partnerAction } from './partner-stamps.js';
import { renderPublicInfo } from './public-info.js';
import { esc } from './ui.js';
export async function renderPublic(ctx){
 const path=location.pathname.replace(/\/+$/,'')||'/',parts=path.split('/').filter(Boolean);
 if(path==='/')return renderPublicInfo(ctx);
 if(isMemberRoute(path)&&!getMemberSessionKey(ctx))return shell(renderMemberVerificationGate(ctx,{returnTo:path}));
 const memberPaths=['/members','/events','/members/events','/members/applications','/members/coupons','/members/more'];
 const memberDetail=parts[0]==='members'&&['events','applications'].includes(parts[1])&&parts.length===3;
 if(memberPaths.includes(path)||memberDetail){
  if(ctx.state.memberRouteSource!==path){
   ctx.state.memberRouteSource=path;
   ctx.state.memberAppTab=memberTabForPath(path);
   delete ctx.state.memberAppScroll;
   delete ctx.state.memberRequestView;
   ctx.state.memberInlineDetail=memberDetail?{kind:parts[1]==='events'?'event':'application',id:parts[2]}:null;
   delete ctx.state.memberScrollTarget;
  }
  const selection=ctx.state.memberInlineDetail,marker='<!--member-inline-detail-->';
  let content=await renderMemberPortal(ctx);
  if(!content)return '';
  if(selection&&content.includes(marker)){
   const sessionKey=getMemberSessionKey(ctx);
   const detail=await (selection.kind==='event'?renderEventPage:renderApplicationPage)(ctx,selection.id,{member:true,embedded:true});
   if(!getMemberSessionKey(ctx))return shell(renderMemberVerificationGate(ctx,{returnTo:path}));
   if(ctx.state.memberInlineDetail!==selection||getMemberSessionKey(ctx)!==sessionKey)return '';
   if(!detail)return '';
   content=content.replace(marker,()=>'<template id="member-detail-content" data-kind="'+esc(selection.kind)+'" data-id="'+esc(selection.id)+'" data-title="'+(selection.kind==='event'?'행사 상세':'신청 상세')+'">'+detail+'</template>');
  }
  return shell(content.replace(marker,''));
 }
 if(['e','r'].includes(parts[0])&&parts.length===1){
  const resolvingUrl=location.href;
  try{const result=await ctx.api('resolveLink',{kind:parts[0],key:linkKey(location.hash)});if(location.href!==resolvingUrl)return '';return parts[0]==='e'?renderEventPage(ctx,result.id):renderApplicationPage(ctx,result.id);}catch(error){return renderLinkError(error,parts[0]==='e'?'event':'receipt');}
 }
 if(parts[0]==='e'&&parts.length===2)return renderEventPage(ctx,parts[1]);
 if(parts[0]==='r'&&parts.length===2)return renderApplicationPage(ctx,parts[1]);
 return renderPublicInfo(ctx);
}
export async function publicSubmit(ctx,form,data,node){
 if(form.startsWith('member-'))return memberPortalSubmit(ctx,form,data,node);
 return eventSubmit(ctx,form,data);
}
export async function publicAction(ctx,action,id,target){
 if(isMemberRoute()&&!getMemberSessionKey(ctx)&&!['member-verify','member-refresh','public-refresh'].includes(action))return ctx.render();
 if(['member-tab','member-visit','member-request-back'].includes(action)){
  if(action!=='member-tab')id='visits';
  if(!isMemberRoute()||!MEMBER_TABS.some(tab=>tab.id===id))return false;
  const sessionKey=getMemberSessionKey(ctx),path=location.pathname;
  if(!sessionKey)return ctx.render();
  if(ctx.mayLeave&&!await ctx.mayLeave({preserveVisitDraft:true}))return false;
  if(location.pathname!==path)return false;
  if(getMemberSessionKey(ctx)!==sessionKey)return ctx.render();
  const activated=id==='visits'?activateMemberRequestView(ctx,action==='member-visit'?'visit':'menu'):activateMemberTab(ctx,id);
  if(!activated)return false;
  delete ctx.state.memberInlineDetail;delete ctx.state.currentEvent;delete ctx.state.currentReceipt;delete ctx.state.memberScrollTarget;
  return true;
 }
 if(action.startsWith('member-equipment-')){
  const sessionKey=getMemberSessionKey(ctx),path=location.pathname;
  if(ctx.mayLeave&&!await ctx.mayLeave({preserveVisitDraft:true}))return false;
  if(location.pathname!==path||getMemberSessionKey(ctx)!==sessionKey)return false;
  return memberPortalAction(ctx,action,id,target);
 }
 if(action.startsWith('partner-'))return partnerAction(ctx,action,id,target);
 const refreshSelection=['member-refresh','public-refresh'].includes(action)?ctx.state.memberInlineDetail:null;
 if(isMemberRoute()&&['member-refresh','public-refresh','member-request','member-events','member-partners'].includes(action)&&ctx.mayLeave&&!await ctx.mayLeave())return;
 if(refreshSelection&&getMemberSessionKey(ctx))ctx.state.memberInlineDetail={...refreshSelection};
 if(['member-request','member-events','member-partners'].includes(action)){
  delete ctx.state.memberInlineDetail;delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
 }
 if(['member-event-open','member-application-open','member-detail-close'].includes(action)){
  if(ctx.mayLeave&&!await ctx.mayLeave())return;
  if(action==='member-detail-close')delete ctx.state.memberInlineDetail;
  else{
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id||''))throw new Error('상세 정보를 확인할 수 없습니다.');
   ctx.state.memberInlineDetail={kind:action==='member-event-open'?'event':'application',id};
  }
  delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
  delete ctx.state.memberScrollTarget;
  await ctx.render();return;
 }
 if(action.startsWith('member-'))return memberPortalAction(ctx,action,id,target);
 if(action==='public-refresh'){delete ctx.state.publicInfo;await ctx.render();return;}
 return eventAction(ctx,action,id,target);
}

export function mountPublicView(ctx,app){
 const panel=app.querySelector('[data-member-panel="visits"]');
 if(panel)bindVisitCalendar(panel);
 mountMemberDetail(ctx);mountPartnerViews(ctx);mountMemberEquipmentRefresh(ctx,app);
}
export function clearPublicView(ctx){clearPartnerViews(ctx);clearMemberEquipmentRefresh();}
export { clearMemberEquipmentRefresh as preparePublicView };
