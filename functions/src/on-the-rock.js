import { z } from 'zod';
import { fail, hash, idSchema, parse, requireRevision } from './domain.js';
import { semesterSchema } from './roster.js';
import { BINGO_MISSIONS, REPEAT_MISSIONS, SPECIAL_MISSIONS, calculateScore } from './on-the-rock-rules.js';

const kinds={bingo:BINGO_MISSIONS,repeat:REPEAT_MISSIONS,special:SPECIAL_MISSIONS};
const revision=z.number().int().min(1);
const location={semester:semesterSchema,groupId:idSchema};
const completion={participants:z.number().int().min(1).max(100).optional(),allParticipated:z.boolean(),completedAt:z.string().datetime({offset:true}).transform(value=>new Date(value).toISOString()),note:z.string().trim().max(1000).default('')};
const boardSchema=z.object({semester:semesterSchema.optional(),groupId:idSchema.optional()}).strict();
const groupSchema=z.object({id:idSchema.optional(),requestId:idSchema.optional(),revision:z.number().int().min(0).default(0),semester:semesterSchema,name:z.string().trim().min(1).max(60).transform(value=>value.normalize('NFC').replace(/\s+/g,' ')),memberCount:z.number().int().min(0).max(100).default(0)}).strict();
const createSchema=z.object({...location,...completion,requestId:idSchema,kind:z.enum(['bingo','repeat','special']),missionId:idSchema}).strict();
const updateSchema=z.object({...location,...completion,id:idSchema,revision}).strict();
const voidSchema=z.object({...location,id:idSchema,revision}).strict();
const value=doc=>doc.exists?{...doc.data(),id:doc.id}:null;
const recordsFrom=snap=>snap.docs.map(value);
const groupLabel=(group,records)=>({id:group.id,semester:group.semester,name:group.name,memberCount:group.memberCount,revision:group.revision,score:calculateScore(records)});
const recordLabel=record=>{
 const {id,kind,missionId,participants,allParticipated,completedAt,note,revision,actorName,memberCountSnapshot,voidedAt}=record;
 return {id,kind,missionId,participants,allParticipated,completedAt,note,revision,actorName,memberCountSnapshot,...(voidedAt?{voidedAt}:{})};
};

function validateCompletion(record){
 const mission=kinds[record.kind].find(m=>m.id===record.missionId);
 if(!mission)fail('invalid-argument','미션을 확인해 주세요.');
}

// Eligibility is staff judgement. Only prevent duplicate one-time entries.
function validateRecords(records){
 const active=records.filter(r=>!r.voidedAt);
 for(const kind of ['bingo','special']){
  const seen=new Set();
  for(const record of active.filter(r=>r.kind===kind)){
   if(seen.has(record.missionId))fail('already-exists','이미 완료한 미션입니다. 기존 기록을 수정해 주세요.');
   seen.add(record.missionId);
  }
 }
}

export function createOnTheRock({db,col,now,audit}){
 const groups=semester=>col('semesters').doc(semester).collection('onTheRockGroups');
 async function board(data){
  const input=parse(boardSchema,data);
  const semester=parse(semesterSchema,input.semester||(await col('settings').doc('club').get()).data()?.semester);
  return db.runTransaction(async tx=>{
   const all=await tx.get(groups(semester)),labels=[],byGroup=new Map();
   for(const doc of all.docs){
    const group={...doc.data(),id:doc.id,semester},records=recordsFrom(await tx.get(doc.ref.collection('records')));
    labels.push(groupLabel(group,records));byGroup.set(group.id,records);
   }
   labels.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
   const group=labels.find(g=>g.id===input.groupId)||null;
   if(input.groupId&&!group)fail('not-found','이 학기의 조를 찾을 수 없습니다.');
   const records=(byGroup.get(group?.id)||[]).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)||a.id.localeCompare(b.id)).map(recordLabel);
   return {semester,groups:labels,group,records,score:group?.score||null};
  },{readOnly:true});
 }
 async function saveGroup(data,who){
  const input=parse(groupSchema,data);
  if(!input.id&&!input.requestId)fail('invalid-argument','조 등록 요청 번호가 필요합니다.');
  if(input.id&&input.requestId)fail('invalid-argument','조 수정 요청을 확인해 주세요.');
  if(!input.id&&input.revision!==0)fail('invalid-argument','새 조의 버전을 확인해 주세요.');
  const ref=groups(input.semester).doc(input.id||input.requestId);
  const creationHash=hash(JSON.stringify({semester:input.semester,name:input.name,memberCount:input.memberCount}));
  return db.runTransaction(async tx=>{
   const old=value(await tx.get(ref)),records=old?recordsFrom(await tx.get(ref.collection('records'))):[];
   if(!input.id&&old){
    if(old.creationHash!==creationHash)fail('failed-precondition','조 목록을 새로고침한 뒤 다시 등록해 주세요.');
    return groupLabel(old,records);
   }
   if(input.id&&!old)fail('not-found','이 학기의 조를 찾을 수 없습니다.');
   requireRevision(old,input.revision);
   const at=now(),next={...old,id:ref.id,semester:input.semester,name:input.name,memberCount:input.memberCount,revision:(old?.revision||0)+1,creationHash:old?.creationHash||creationHash,createdAt:old?.createdAt||at,createdBy:old?.createdBy||who.uid,updatedAt:at,updatedBy:who.uid,recordsVersion:old?.recordsVersion||0};
   tx.set(ref,next);audit(tx,who,'onTheRockGroups',ref.id,'마티니 온더락 조 '+(old?'수정':'등록')+' · '+next.name,input.semester);
   return groupLabel(next,records);
  });
 }
 async function mission(op,data,who){
  const creating=op==='recordOnTheRockMission',voiding=op==='voidOnTheRockRecord';
  const input=parse(creating?createSchema:voiding?voidSchema:updateSchema,data),groupRef=groups(input.semester).doc(input.groupId),recordRef=groupRef.collection('records').doc(creating?input.requestId:input.id);
  // Persist the normalized original request so a network retry cannot duplicate points.
  const requestHash=creating?hash(JSON.stringify(input)):null;
  return db.runTransaction(async tx=>{
   const group=value(await tx.get(groupRef));if(!group)fail('not-found','이 학기의 조를 찾을 수 없습니다.');
   const records=recordsFrom(await tx.get(groupRef.collection('records'))),old=records.find(r=>r.id===recordRef.id);
   if(creating&&old){
    if(old.requestHash!==requestHash)fail('failed-precondition','기록 목록을 새로고침한 뒤 다시 등록해 주세요.');
    return recordLabel(old);
   }
   if(!creating&&!old)fail('not-found','이 조의 미션 기록을 찾을 수 없습니다.');
   if(!creating&&old.voidedAt){
    if(voiding)return recordLabel(old);
    fail('failed-precondition','취소한 미션은 새로 등록해 주세요.');
   }
   if(!creating)requireRevision(old,input.revision);
   const at=now();
   let next;
   if(voiding)next={...old,voidedAt:at,voidedBy:who.uid,revision:old.revision+1,updatedAt:at,updatedBy:who.uid};
   else{
    next={...old,id:recordRef.id,kind:creating?input.kind:old.kind,missionId:creating?input.missionId:old.missionId,participants:input.participants??null,allParticipated:input.allParticipated,completedAt:input.completedAt,note:input.note,memberCountSnapshot:old?.memberCountSnapshot??group.memberCount,revision:(old?.revision||0)+1,actorName:old?.actorName||who.displayName,createdAt:old?.createdAt||at,createdBy:old?.createdBy||who.uid,updatedAt:at,updatedBy:who.uid,requestHash:old?.requestHash||requestHash};
    validateCompletion(next);
   }
   validateRecords([...records.filter(r=>r.id!==next.id),next]);
   tx.set(recordRef,next);
   // The group write makes concurrent inserts conflict even when neither record existed.
   tx.update(groupRef,{recordsVersion:(group.recordsVersion||0)+1,updatedAt:at,updatedBy:who.uid});
   const missionTitle=kinds[next.kind].find(m=>m.id===next.missionId).title;
   audit(tx,who,'onTheRockRecords',recordRef.id,'마티니 온더락 '+group.name+' · '+missionTitle+' '+(creating?'등록':voiding?'취소':'수정'),input.semester);
   return recordLabel(next);
  });
 }
 return (op,data,who)=>op==='onTheRockBoard'?board(data):op==='saveOnTheRockGroup'?saveGroup(data,who):mission(op,data,who);
}
