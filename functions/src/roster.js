import { z } from 'zod';
import { parse } from './domain.js';
export const semesterSchema=z.string().regex(/^20\d{2}-[12]$/);
export function createRoster(col){
 const collection=semester=>col('semesters').doc(parse(semesterSchema,semester)).collection('members');
 const reader=tx=>tx||{get:ref=>ref.get()};
 const value=(doc,semester)=>doc?.exists?{...doc.data(),id:doc.id,semester}:null;
 async function get(id,semester,tx){
  const doc=await reader(tx).get(collection(semester).doc(id));
  if(doc.exists)return value(doc,semester);
  const legacy=await reader(tx).get(col('members').doc(id));
  return legacy.exists&&legacy.data().semester===semester?value(legacy,semester):null;
 }
 async function documents(semester,tx){
  if(!tx)return col('semesters').firestore.runTransaction(t=>documents(semester,t),{readOnly:true});
  const r=reader(tx),nested=await r.get(collection(semester)),legacy=await r.get(col('members').where('semester','==',semester));
  const docs=new Map(legacy.docs.map(d=>[d.id,d]));nested.docs.forEach(d=>docs.set(d.id,d));return [...docs.values()];
 }
 async function find(key,semester,tx,field='identityHash'){
  const r=reader(tx),nested=await r.get(collection(semester).where(field,'==',key)),legacy=await r.get(col('members').where(field,'==',key));
  const docs=new Map(nested.docs.map(d=>[d.id,value(d,semester)]));
  for(const d of legacy.docs){if(d.data().semester!==semester||docs.has(d.id))continue;const current=await r.get(collection(semester).doc(d.id));if(!current.exists)docs.set(d.id,value(d,semester));}
  return [...docs.values()];
 }
 async function terms(){
  const [stored,legacy]=await Promise.all([col('semesters').get(),col('members').select('semester').get()]);
  return [...new Set([...stored.docs.map(d=>d.id),...legacy.docs.map(d=>d.data().semester)])].filter(s=>semesterSchema.safeParse(s).success).sort().reverse();
 }
 return {collection,get,documents,find,findStudent:(studentId,semester,tx)=>find(studentId,semester,tx,'studentId'),terms,value};
}
