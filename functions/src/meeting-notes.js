import { z } from 'zod';
import { ensureScope,fail,hash,idSchema,parse,requireRevision } from './domain.js';
import { hasPermission } from './permissions.js';
import { validMeetingDocument,meetingText } from './meeting-document.js';
const schema=z.object({id:idSchema,revision:z.number().int().min(0),requestId:idSchema,title:z.string().trim().min(1).max(160),date:z.string().datetime(),semester:z.string().regex(/^20\d{2}-[12]$/),document:z.unknown().refine(validMeetingDocument,{message:'회의록은 30,000자 이내의 지원되는 서식으로 작성해 주세요.'})}).strict();

export function createMeetingNotes({db,col,clock,now,audit,visible}){
 return async function saveMeetingNote(data,who){
  ensureScope(who,'meetings',clock());
  const input=parse(schema,data),digest=hash(JSON.stringify(input)),ref=col('meetings').doc(input.id);
  return db.runTransaction(async tx=>{
   const doc=await tx.get(ref),old=doc.exists?doc.data():null;
   if(old?.deletedAt)fail('not-found','삭제된 회의록입니다.');
   if(old?.status==='final'&&!hasPermission(who,'settings'))fail('permission-denied','확정된 회의록은 회장단이 정정할 수 있습니다.');
   if(old?.meetingSaveRequestId===input.requestId){
    if(old.meetingSaveHash!==digest)fail('invalid-argument','저장 요청이 변경되었습니다. 다시 저장해 주세요.');
    return visible('meetings',{...old,id:input.id},who);
   }
   if(!old&&input.revision!==0)fail('not-found','회의록을 찾을 수 없습니다.');
   requireRevision(old,input.revision);
   const next={...(old||{location:'',attendees:[],status:'draft',agendas:[],semester:input.semester}),id:input.id,title:input.title,date:input.date,body:meetingText(input.document),document:input.document,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),createdBy:old?.createdBy||who.uid,updatedAt:now(),updatedBy:who.uid,meetingSaveRequestId:input.requestId,meetingSaveHash:digest};
   tx.set(ref,next);
   const safe=visible('meetings',next,who);
   tx.create(ref.collection('revisions').doc(String(next.revision).padStart(6,'0')),{...safe,revisionActor:who.displayName});
   audit(tx,who,'meetings',input.id,old?'회의록 저장':'회의록 작성');
   return safe;
  });
 };
}
