import { z } from 'zod';
import { ensureScope, fail, hash, normalizePhone, parse } from './domain.js';
import { semesterSchema } from './roster.js';

const fingerprint=member=>hash(JSON.stringify([member.name,member.studentId,normalizePhone(member.phone)]));
const finished=(event,now)=>!event.deletedAt&&!['draft','cancelled'].includes(event.status)&&(event.status==='completed'||Date.parse(event.endsAt||event.startsAt)<=now);
const validDate=value=>Number.isFinite(Date.parse(value))?value:'';

// Count each registered person once per finished event; never infer identity from a name alone.
export function summarizeAbsences({events,applications,members,semester},now){
 const eligible=events.filter(event=>event.semester===semester&&finished(event,now));
 const eventMap=new Map(eligible.map(event=>[event.id,{id:event.id,title:event.title||'이름 없는 행사',type:event.type||'',startsAt:validDate(event.startsAt),endsAt:validDate(event.endsAt),registrations:0,absences:0,unchecked:0}]));
 const roster=new Map(members.map(member=>[member.id,member])),unique=new Map();
 for(const application of applications){
  if(application.semester!==semester||application.status!=='registered'||application.deletedAt||application.anonymizedAt||!eventMap.has(application.eventId))continue;
  const member=roster.get(application.memberId);
  const matched=!!member&&!member.deletedAt&&!member.anonymizedAt&&member.name===application.name&&(!application.memberIdentityHash||application.memberIdentityHash===fingerprint(member));
  const identity=application.memberIdentityHash||(matched?fingerprint(member):'');
  const id=hash(JSON.stringify(['absence',semester,identity||application.memberId||application.id]));
  const key=id+':'+application.eventId,prior=unique.get(key);
  const order=String(application.updatedAt||application.createdAt||'')+':'+application.id;
  if(!prior||order>prior.order)unique.set(key,{application,member,matched,id,order});
 }
 const people=new Map();
 for(const {application,member,matched,id} of unique.values()){
  const attendance=['absent','present'].includes(application.attendance)?application.attendance:'unchecked';
  const event=eventMap.get(application.eventId);event.registrations++;
  if(attendance==='absent')event.absences++;if(attendance==='unchecked')event.unchecked++;
  if(!people.has(id))people.set(id,{id,name:application.name||'이름 미확인',studentId:matched?member.studentId||'':'',department:matched?member.department||'':'',rosterMatched:matched,removed:matched&&!!member.removedAt,records:[]});
  people.get(id).records.push({eventId:event.id,applicationId:application.id,attendance});
 }
 const rows=[...people.values()].filter(person=>person.records.some(record=>record.attendance==='absent'));
 return {rows,events:[...eventMap.values()].sort((a,b)=>b.startsAt.localeCompare(a.startsAt)||a.id.localeCompare(b.id))};
}

export function createAbsenceReport({db,col,clock,roster}){
 return async(data,who)=>{
  ensureScope(who,'events',clock());
  const input=parse(z.object({semester:semesterSchema.optional()}).strict(),data);
  return db.runTransaction(async tx=>{
   const config=(await tx.get(col('settings').doc('club'))).data();
   const semester=parse(semesterSchema,input.semester||config?.semester);
   const eventDocs=await tx.get(col('events').limit(2001));
   if(eventDocs.size>2000)fail('resource-exhausted','행사 기록이 많아 집계를 완료하지 못했습니다. 운영자에게 문의해 주세요.');
   const events=eventDocs.docs.map(doc=>({...doc.data(),id:doc.id}));
   const applicationDocs=await tx.get(col('applications').where('semester','==',semester).limit(20001));
   if(applicationDocs.size>20000)fail('resource-exhausted','이 학기의 신청 기록이 많아 집계를 완료하지 못했습니다. 운영자에게 문의해 주세요.');
   const members=(await roster.documents(semester,tx)).map(doc=>({...doc.data(),id:doc.id}));
   const report=summarizeAbsences({events,applications:applicationDocs.docs.map(doc=>({...doc.data(),id:doc.id})),members,semester},clock());
   const semesters=[...new Set([semester,config?.semester,...events.filter(event=>!event.deletedAt).map(event=>event.semester)])].filter(value=>semesterSchema.safeParse(value).success).sort().reverse();
   return {semester,semesters,generatedAt:new Date(clock()).toISOString(),...report};
  },{readOnly:true});
 };
}
