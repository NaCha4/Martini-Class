import { adminRequestGuard } from './view-request.js';

export const rosterSemester=ctx=>/^20\d{2}-[12]$/.test(new URLSearchParams(location.search).get('semester')||'')&&location.pathname.replace(/\/$/,'')==='/admin/members'?new URLSearchParams(location.search).get('semester'):ctx.state.settings.semester;
export const total=item=>item.unit==='bottle'?item.quantity*item.size+Object.values(item.bottles||{}).reduce((sum,p)=>sum+item.size*p/100,0):item.quantity;
export const unit=item=>item.unit==='bottle'?'mL (추정)':({each:'개',g:'g',ml:'mL',pack:'팩'}[item.unit]||item.unit);

function memberParams(ctx,kind,params){
 if(kind!=='members')return params;
 const semester=params.semester||rosterSemester(ctx),removed=false;
 if(ctx.state.memberSemester!==semester||ctx.state.memberRemoved!==removed){
  ctx.state.data.members={};
  if(ctx.state.pages)delete ctx.state.pages.members;
  ctx.state.memberSemester=semester;ctx.state.memberRemoved=removed;
 }
 return {...params,semester,removed};
}
function remember(ctx,kind,result,params){
 ctx.state.data[kind]||={};
 result.rows.forEach(row=>ctx.state.data[kind][row.id]=row);
 ctx.state.pages||={};
 if(!params.recordId&&!params.eventId&&!params.revisions)ctx.state.pages[kind]=result;
 return result;
}
export async function read(ctx,kind,params={}){
 params=memberParams(ctx,kind,params);
 const current=adminRequestGuard(ctx);
 const result=await ctx.api('read',{kind,...params});
 if(current())remember(ctx,kind,result,params);
 return result;
}
export async function readAll(ctx,kind,params={}){
 params=memberParams(ctx,kind,params);
 const current=adminRequestGuard(ctx),rows=[];
 let cursor;
 do{
  const page=await ctx.api('read',{kind,...params,...(cursor?{cursor}:{})});
  if(!current())return {rows:[],nextCursor:null};
  rows.push(...page.rows);cursor=page.nextCursor;
 }while(cursor);
 return remember(ctx,kind,{rows,nextCursor:null},params);
}
export async function loadMore(ctx,kind){
 const params=memberParams(ctx,kind,{}),previous=ctx.state.pages?.[kind];
 if(!previous?.nextCursor)return null;
 const current=adminRequestGuard(ctx);
 const result=await ctx.api('read',{kind,cursor:previous.nextCursor,...params});
 if(!current())return null;
 const combined={rows:[...previous.rows,...result.rows],nextCursor:result.nextCursor};
 remember(ctx,kind,combined,params);
 return {kind,result:combined,added:result.rows.length};
}
