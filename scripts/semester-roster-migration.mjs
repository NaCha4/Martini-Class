// Called by an explicit deployment operation; never by a public API request.
import { semesterSchema } from '../functions/src/roster.js';
export async function migrateRoster(db,{apply=false}={}){
 const source=db.collection('martini_v2_members'),terms=db.collection('martini_v2_semesters');
 const docs=await source.get(),summary={mode:apply?'apply':'dry-run',members:docs.size,bySemester:{},moved:0};
 for(const doc of docs.docs){
  const semester=doc.data().semester;
  if(!semesterSchema.safeParse(semester).success)throw Error('INVALID_LEGACY_SEMESTER');
  summary.bySemester[semester]=(summary.bySemester[semester]||0)+1;
  const children=await doc.ref.listCollections();
  if(children.some(c=>c.id!=='semesters'))throw Error('UNEXPECTED_LEGACY_SUBCOLLECTION');
  await db.runTransaction(async tx=>{
   const old=await tx.get(doc.ref);if(!old.exists)return;
   if(old.data().semester!==semester)throw Error('LEGACY_CHANGED_RETRY');
   const target=terms.doc(semester).collection('members').doc(doc.id),existing=await tx.get(target),oldTerms=await tx.get(doc.ref.collection('semesters'));
   const markers=[];
   for(const d of oldTerms.docs){
    if(!semesterSchema.safeParse(d.id).success)throw Error('INVALID_LEDGER_SEMESTER');
    const ref=terms.doc(d.id).collection('dues').doc(doc.id),current=await tx.get(ref);
    if(current.exists&&d.data().duesTransactionId&&current.data().duesTransactionId!==d.data().duesTransactionId)throw Error('LEDGER_LINK_CONFLICT');
    markers.push({source:d,ref,exists:current.exists});
   }
   if(oldTerms.size>100)throw Error('TOO_MANY_LEDGER_MARKERS');
   if(existing.exists&&(existing.data().revision||0)<(old.data().revision||0))throw Error('NEW_ROSTER_OLDER_THAN_LEGACY');
   if(!apply)return;
   if(!existing.exists){const {semester:unused,status,duesPaid,...data}=old.data();tx.create(target,data);}
   for(const marker of markers){
    if(marker.source.data().duesTransactionId&&!marker.exists){const {semester:unused,...data}=marker.source.data();tx.create(marker.ref,data);}
    tx.set(terms.doc(marker.source.id),{updatedAt:new Date().toISOString()},{merge:true});tx.delete(marker.source.ref);
   }
   tx.set(terms.doc(semester),{updatedAt:new Date().toISOString()},{merge:true});
   tx.delete(doc.ref);
  });
  if(apply)summary.moved++;
 }
 summary.remaining=(await source.count().get()).data().count;
 return summary;
}
