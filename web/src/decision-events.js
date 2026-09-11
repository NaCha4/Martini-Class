export const decisionBoardUrl=eventId=>'/admin/decisions'+(eventId?'?event='+encodeURIComponent(eventId):'');
export function decisionEventId(pathname=location.pathname,search=location.search){
 return pathname.replace(/\/$/,'')==='/admin/decisions'?new URLSearchParams(search).get('event')||'':'';
}
export async function readDecisionEvents(ctx){
 const rows=[];let cursor;
 do{const page=await ctx.api('decisionEvents',cursor?{cursor}:{});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 ctx.state.decisionEvents=rows;return rows;
}
export function decisionEventOptions(events,records,selected=''){
 const counts=new Map();for(const d of records)counts.set(d.eventId||'',(counts.get(d.eventId||'')||0)+1);
 const visible=events.filter(e=>!e.archived||counts.has(e.id)||e.id===selected).sort((a,b)=>Number(a.archived)-Number(b.archived)||b.semester.localeCompare(a.semester)||b.startsAt.localeCompare(a.startsAt)||a.title.localeCompare(b.title,'ko'));
 return {counts,events:visible,rows:records.filter(d=>(d.eventId||'')===selected),event:events.find(e=>e.id===selected)};
}
