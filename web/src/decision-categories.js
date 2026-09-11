export const decisionBoardUrl=categoryId=>'/admin/decisions'+(categoryId?'?category='+encodeURIComponent(categoryId):'');
export function decisionCategoryId(pathname=location.pathname,search=location.search){
 return pathname.replace(/\/$/,'')==='/admin/decisions'?new URLSearchParams(search).get('category')||'':'';
}
export async function readDecisionCategories(ctx){
 const rows=[];let cursor;
 do{const page=await ctx.api('decisionCategories',cursor?{cursor}:{});rows.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 ctx.state.decisionCategories=rows;return rows;
}
export function decisionCategoryOptions(categories,records,selected=''){
 const visible=categories.filter(c=>!c.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const ids=new Set(visible.map(c=>c.id)),categoryOf=d=>ids.has(d.categoryId)?d.categoryId:'';
 const counts=new Map();for(const d of records){const id=categoryOf(d);counts.set(id,(counts.get(id)||0)+1);}
 return {counts,categories:visible,rows:records.filter(d=>categoryOf(d)===selected),category:visible.find(c=>c.id===selected)};
}
