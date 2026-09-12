import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureScope, fail, hash, idSchema, matches, normalizePhone, parse, publicEvent, requireRevision } from './domain.js';
import { semesterSchema } from './roster.js';

const key=z.string().regex(/^[a-f0-9]{64}$/);
const text=max=>z.string().trim().max(max);
const required=max=>text(max).min(1);
const applicant={name:required(40),studentId:required(30)};
// Accept and discard the retired field while cached clients finish upgrading.
const legacyPhone=text(30).optional();
const base={requestId:idSchema,receiptKey:key,consent:z.literal(true)};
const visit=z.object({...base,kind:z.literal('visit'),sessionKey:key,startsAt:z.string().datetime(),endsAt:z.string().datetime(),guestCount:z.number().int().min(1).max(20),guestNames:required(300),purpose:required(1000)}).strict();
const inquiry=z.object({...base,kind:z.literal('inquiry'),sessionKey:key.optional(),name:applicant.name.optional(),studentId:applicant.studentId.optional(),phone:legacyPhone,subject:required(120),message:required(3000)}).strict().superRefine((value,ctx)=>{
 if(value.sessionKey){if(value.name!==undefined||value.studentId!==undefined||value.phone!==undefined)ctx.addIssue({code:'custom',message:'부원 문의에는 인증된 명부 정보를 사용합니다.'});}
 else if(!value.name||!value.studentId)ctx.addIssue({code:'custom',message:'이름과 학번을 모두 입력해 주세요.'});
});
const schemas={visit,inquiry};
const receipt=z.object({id:idSchema,receiptKey:key}).strict();
const DAY=86400000;
const safeFields=['id','kind','status','revision','name','studentId','semester','department','grade','message','subject','startsAt','endsAt','guestCount','guestNames','purpose','response','createdAt','updatedAt','decidedAt','cancelledAt','retentionUntil'];
const safeRequest=record=>Object.fromEntries(safeFields.filter(field=>record[field]!==undefined).map(field=>[field,record[field]]));
const live=record=>record&&!record.deletedAt&&!record.removedAt&&!record.anonymizedAt&&record.active!==false&&(!record.status||record.status==='active');
const fingerprint=member=>hash(JSON.stringify([member.name,member.studentId,normalizePhone(member.phone)]));
const requestFingerprint=record=>record.memberIdentityHash||fingerprint(record);

export function createMemberPortal({db,col,clock,now,roster,throttle,audit}){
 const read=tx=>tx||{get:ref=>ref.get()};
 const scope=member=>hash(member.semester+':'+member.id);
 async function currentSemester(tx){
  const settings=(await read(tx).get(col('settings').doc('club'))).data();
  if(!semesterSchema.safeParse(settings?.semester).success)fail('failed-precondition','운영진이 현재 학기를 설정한 뒤 이용할 수 있습니다.');
  return settings.semester;
 }
 async function authenticate(sessionKey,tx){
  const session=(await read(tx).get(col('memberSessions').doc(hash(sessionKey)))).data();
  if(!session||!session.expiresAt?.toMillis||session.expiresAt.toMillis()<=clock())fail('unauthenticated','부원 인증이 만료되었습니다. 다시 인증해 주세요.');
  const semester=await currentSemester(tx);
  if(session.semester!==semester)fail('unauthenticated','학기가 변경되었습니다. 다시 부원 인증을 해 주세요.');
  const member=await roster.get(session.memberId,semester,tx);
  if(!live(member)||fingerprint(member)!==session.identityHash)fail('permission-denied','현재 명부에서 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
  return {member,expiresAt:session.expiresAt.toDate().toISOString()};
 }
 async function guard(ctx,bucket,subject,limit=30){
  await throttle(ctx,'club-'+bucket+'-ip',limit);
  if(subject)await throttle({ip:hash(subject)},'club-'+bucket+'-identity',bucket==='access'?8:20);
 }
 async function access(data,ctx){
  const input=parse(z.object({...applicant,phone:legacyPhone,sessionKey:key}).strict(),data);
  await guard(ctx,'access',input.studentId.toLowerCase(),60);
  return db.runTransaction(async tx=>{
   const semester=await currentSemester(tx),members=await roster.findStudent(input.studentId,semester,tx);
   const matched=members.filter(member=>live(member)&&member.name===input.name);
   if(matched.length!==1)fail('permission-denied','이름, 학번 또는 현재 활동 자격을 확인할 수 없습니다. 운영진에게 문의해 주세요.');
   const member=matched[0],ref=col('memberSessions').doc(hash(input.sessionKey)),prior=(await tx.get(ref)).data();
   if(prior&&(prior.memberId!==member.id||prior.semester!==semester||prior.identityHash!==fingerprint(member)))fail('already-exists','새 인증으로 다시 시도해 주세요.');
   if(prior&&prior.expiresAt.toMillis()<=clock())fail('unauthenticated','새 인증으로 다시 시도해 주세요.');
   const expiresAt=prior?.expiresAt||Timestamp.fromMillis(clock()+2*3600000);
   if(!prior)tx.create(ref,{memberId:member.id,semester,identityHash:fingerprint(member),createdAt:now(),expiresAt});
   return {member:{name:member.name,semester},expiresAt:expiresAt.toDate().toISOString()};
  });
 }
 async function portal(data,ctx){
  const input=parse(z.object({sessionKey:key}).strict(),data);
  await guard(ctx,'portal',input.sessionKey,120);
  return db.runTransaction(async tx=>{
   const {member,expiresAt}=await authenticate(input.sessionKey,tx);
   const events=await tx.get(col('events').where('semester','==',member.semester));
   const requests=await tx.get(col('clubRequests').where('memberScope','==',scope(member)).orderBy('createdAt','desc').limit(100));
   return {member:{name:member.name,semester:member.semester},expiresAt,
    events:events.docs.map(doc=>({...doc.data(),id:doc.id})).filter(event=>!event.deletedAt&&['open','closed'].includes(event.status)&&Date.parse(event.endsAt)>clock()).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(event=>({...publicEvent(event),eventId:event.id})),
    requests:requests.docs.filter(doc=>!doc.data().deletedAt&&!doc.data().anonymizedAt&&requestFingerprint(doc.data())===fingerprint(member)).map(doc=>safeRequest({...doc.data(),id:doc.id}))};
  },{readOnly:true});
 }
 async function verifyEvent(eventId,sessionKey,tx){
  const verified=await authenticate(sessionKey,tx),doc=await read(tx).get(col('events').doc(eventId));
  const event=doc.exists?{...doc.data(),id:doc.id}:null;
  if(!event||event.deletedAt||event.semester!==verified.member.semester||!['open','closed'].includes(event.status)||Date.parse(event.endsAt)<=clock())fail('not-found','현재 학기의 진행 중인 행사를 확인해 주세요.');
  return {...verified,event};
 }
 async function eventAccess(data,ctx){
  const input=parse(z.object({sessionKey:key,eventId:idSchema}).strict(),data);
  await guard(ctx,'member-event',input.sessionKey,120);
  return db.runTransaction(async tx=>publicEvent((await verifyEvent(input.eventId,input.sessionKey,tx)).event),{readOnly:true});
 }
 function validateVisit(input){
  const startsAt=Date.parse(input.startsAt),endsAt=Date.parse(input.endsAt);
  if(startsAt<=clock()||startsAt>clock()+90*DAY||endsAt<=startsAt||endsAt-startsAt>12*3600000)fail('invalid-argument','방문은 현재 이후 90일 이내, 종료는 시작 이후 12시간 이내로 신청해 주세요.');
 }
 async function submit(data,ctx){
  if(!schemas[data?.kind])fail('invalid-argument','신청 종류를 확인해 주세요.');
  const input=parse(schemas[data.kind],data);
  await guard(ctx,'submit',input.sessionKey||input.studentId.toLowerCase(),30);
  return db.runTransaction(async tx=>{
   const verified=input.sessionKey?await authenticate(input.sessionKey,tx):null;
   const semester=verified?.member.semester||await currentSemester(tx);
   const member=verified?.member;
   const {sessionKey,receiptKey,requestId,consent,phone,...fields}=input;
   const actor=member?{name:member.name,studentId:member.studentId}:{name:input.name,studentId:input.studentId};
   const payloadHash=hash(JSON.stringify({...fields,...actor,semester,memberScope:member?scope(member):null}));
   const ref=col('clubRequests').doc(requestId),prior=(await tx.get(ref)).data();
   if(prior){
    const legacyFields=Object.fromEntries(Object.entries(fields).flatMap(([field,value])=>field==='studentId'?[[field,value],['phone',prior.phone]]:[[field,value]]));
    const legacyPayloadHash=prior.phone===undefined?null:hash(JSON.stringify({...legacyFields,...actor,phone:prior.phone,semester,memberScope:member?scope(member):null}));
    if(!prior.deletedAt&&!prior.anonymizedAt&&matches(receiptKey,prior.receiptHash)&&(prior.payloadHash===payloadHash||prior.payloadHash===legacyPayloadHash))return {id:requestId,status:prior.status,request:safeRequest({...prior,id:requestId}),duplicate:true};
    fail('already-exists','신청 번호가 이미 사용되었습니다. 기존 확인 링크를 이용하거나 새 신청을 작성해 주세요.');
   }
   if(input.kind==='visit')validateVisit(input);
   const at=now(),record={...fields,...actor,id:requestId,semester,status:'pending',revision:1,response:'',receiptHash:hash(receiptKey),payloadHash,consentedAt:at,createdAt:at,updatedAt:at,retentionUntil:input.kind==='visit'?new Date(Date.parse(input.endsAt)+180*DAY).toISOString():null,...(member?{memberId:member.id,memberScope:scope(member)}:{})};
   if(member)record.memberIdentityHash=fingerprint(member);
   tx.create(ref,record);
   return {id:requestId,status:'pending',request:safeRequest(record)};
  });
 }
 async function authorizedRequest(input,tx){
  const record=(await read(tx).get(col('clubRequests').doc(input.id))).data();
  if(!record||record.deletedAt||record.anonymizedAt||!matches(input.receiptKey,record.receiptHash))fail('not-found','신청 확인 링크를 확인해 주세요.');
  return {...record,id:input.id};
 }
 async function getReceipt(data,ctx){
  const input=parse(receipt,data);await guard(ctx,'receipt',input.id,60);
  return {request:safeRequest(await authorizedRequest(input))};
 }
 async function cancel(data,ctx){
  const input=parse(receipt,data);await guard(ctx,'cancel',input.id,30);
  return db.runTransaction(async tx=>{
   const record=await authorizedRequest(input,tx);
   if(record.status==='cancelled')return {request:safeRequest(record),duplicate:true};
   if(record.kind==='visit'?!['pending','approved'].includes(record.status)||Date.parse(record.startsAt)<=clock():record.status!=='pending')fail('failed-precondition','취소할 수 없는 신청입니다. 운영진에게 문의해 주세요.');
   const patch={status:'cancelled',revision:record.revision+1,cancelledAt:now(),updatedAt:now(),retentionUntil:new Date(clock()+(record.kind==='join'?365:180)*DAY).toISOString()};
   tx.update(col('clubRequests').doc(record.id),patch);return {request:safeRequest({...record,...patch})};
  });
 }
 async function list(data,who){
  ensureScope(who,'members',clock());const input=parse(z.object({cursor:idSchema.optional()}).strict(),data);
  let query=col('clubRequests').orderBy('updatedAt','desc').limit(101);
  if(input.cursor){const cursor=await col('clubRequests').doc(input.cursor).get();if(!cursor.exists)fail('invalid-argument','목록을 새로고침해 주세요.');query=query.startAfter(cursor);}
  const result=await query.get(),docs=result.docs.slice(0,100);
  return {rows:docs.filter(doc=>!doc.data().deletedAt&&!doc.data().anonymizedAt).map(doc=>safeRequest({...doc.data(),id:doc.id})),nextCursor:result.size>100?docs.at(-1).id:null};
 }
 async function command(data,who){
  ensureScope(who,'members',clock());
  const input=parse(z.object({id:idSchema,revision:z.number().int().min(1),action:z.enum(['approve','reject','reply']),response:text(3000).default('')}).strict(),data);
  if(['reject','reply'].includes(input.action)&&!input.response)fail('invalid-argument','신청자에게 전달할 사유 또는 답변을 입력해 주세요.');
  return db.runTransaction(async tx=>{
   const ref=col('clubRequests').doc(input.id),record=(await tx.get(ref)).data();
   if(!record||record.deletedAt||record.anonymizedAt)fail('not-found','신청을 찾을 수 없습니다.');
   requireRevision(record,input.revision);
   if(record.status!=='pending')fail('failed-precondition','대기 중인 신청만 처리할 수 있습니다.');
   if(record.kind==='inquiry'?input.action!=='reply':!['approve','reject'].includes(input.action))fail('invalid-argument','신청 종류에 맞는 처리를 선택해 주세요.');
   if(record.kind==='visit'&&input.action==='approve'){
    if(Date.parse(record.startsAt)<=clock())fail('failed-precondition','방문 시작 시간이 지난 신청은 승인할 수 없습니다.');
    const member=await roster.get(record.memberId,record.semester,tx),semester=await currentSemester(tx);
    if(record.semester!==semester||!live(member)||fingerprint(member)!==requestFingerprint(record))fail('failed-precondition','신청자의 현재 활동 자격 또는 접수 당시 정보를 확인할 수 없습니다.');
   }
   const patch={status:{approve:'approved',reject:'rejected',reply:'answered'}[input.action],response:input.response,revision:record.revision+1,decidedAt:now(),decidedBy:who.uid,updatedAt:now(),retentionUntil:record.kind==='visit'?record.retentionUntil:new Date(clock()+(record.kind==='join'?365:180)*DAY).toISOString()};
   tx.update(ref,patch);audit(tx,who,'clubRequests',input.id,input.action,record.semester);
   return {saved:true,request:safeRequest({...record,...patch,id:input.id})};
  });
 }
 return {access,portal,eventAccess,verifyEvent,submit,getReceipt,cancel,list,command};
}
