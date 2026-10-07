import { z } from 'zod';
import { parse, fail, stockTotal } from './domain.js';
import { hasPermission, isRequestViewer } from './permissions.js';
import { semesterSchema } from './roster.js';

// Return only counts and the small lists shown on the operations home.
// Projection preserves legacy rows without requiring a migration or new indexes.
export function createDashboard({col,clock,roster,settings}){
 return async function dashboard(data,who){
  parse(z.object({}).strict(),data);
  if(isRequestViewer(who))fail('permission-denied','신청 · 문의 조회만 허용된 계정입니다.');
  const config=await settings(),semester=parse(semesterSchema,config?.semester||'2026-2');
  const result={counts:{},events:[],inventory:[]};
  const tasks=[];
  if(hasPermission(who,'eventRead'))tasks.push((async()=>{
   const snapshot=await col('events').where('semester','==',semester).select('title','startsAt','endsAt','location','status','deletedAt').get();
   const events=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(event=>!event.deletedAt&&!['cancelled','completed','draft'].includes(event.status)&&Date.parse(event.endsAt)>=clock());
   events.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
   result.counts.events=events.length;
   result.events=events.slice(0,4).map(({deletedAt,...event})=>event);
  })());
  if(hasPermission(who,'members'))tasks.push((async()=>{
   result.counts.members=await roster.countActive(semester);
  })());
  if(hasPermission(who,'inventory'))tasks.push((async()=>{
   const snapshot=await col('inventory').select('name','quantity','unit','size','bottles','minimum','updatedAt','deletedAt').get();
   const items=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>!item.deletedAt&&stockTotal(item)<item.minimum);
   items.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')||a.id.localeCompare(b.id));
   result.counts.inventory=items.length;
   result.inventory=items.slice(0,5).map(({deletedAt,...item})=>item);
  })());
  await Promise.all(tasks);
  return result;
 };
}
