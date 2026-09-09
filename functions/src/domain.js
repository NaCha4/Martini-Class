import { defaultRoles, hasPermission, permissionKeys } from './permissions.js';
import { openChatUrl } from './public-links.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export class Problem extends Error { constructor(code,message){super(message);this.code=code;} }
export const fail=(code,message)=>{throw new Problem(code,message);};
export const idSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text=(n=200)=>z.string().trim().max(n);
const required=(n=200)=>text(n).min(1);
const iso=z.string().datetime();
const meta={id:idSchema.optional(),revision:z.number().int().min(0).default(0)};
export const roles=['owner','chair','education','execution','finance','publicity'];
export const scopes={
 members:['owner','chair','execution','finance'],
 events:['owner','chair','education','execution'],
 finance:['owner','chair','finance'],
 inventory:['owner','chair','education','execution'],
 meetings:roles, decisions:roles,
 content:['owner','chair','publicity'], settings:['owner','chair'], admins:['owner'], audit:['owner','chair']
};
export const schemas={
 member:z.object({...meta,name:required(40),studentId:required(30),phone:required(30),college:text(80).default(''),department:text(80).default(''),grade:text(20).default(''),gender:z.enum(['','남성','여성']).default(''),semester:required(30),status:z.enum(['active','inactive','withdrawn','graduated']).optional(),duesPaid:z.boolean().optional()}).strict(),
 event:z.object({...meta,title:required(120),type:z.enum(['class','meeting','social','workshop','other']),description:text(8000),location:required(200),startsAt:iso,endsAt:iso,opensAt:iso,closesAt:iso,cancelUntil:iso,capacity:z.number().int().min(1).max(500),fee:z.number().int().min(0).max(1000000),waitlist:z.boolean(),status:z.enum(['draft','open','closed','completed','cancelled']),semester:required(30),questions:z.array(required(200)).max(3).default([]),policy:required(2000),paymentInstructions:text(1000).default(''),owner:text(80).default('')}).strict(),
 item:z.object({...meta,name:required(100),category:z.enum(['spirit','ingredient','supply','tool']),unit:z.enum(['bottle','each','g','ml','pack']),size:z.number().min(0).max(100000),location:required(100),minimum:z.number().min(0).max(100000),note:text(1000).default('')}).strict(),
 meeting:z.object({...meta,title:required(160),date:iso,location:text(200),attendees:z.array(text(80)).max(30),status:z.enum(['draft','in_progress','final']),semester:required(30),body:text(30000),agendas:z.array(z.object({id:idSchema,title:required(200),notes:text(10000),status:z.enum(['planned','discussed','deferred'])}).strict()).max(30)}).strict(),
 decision:z.object({...meta,title:required(160),body:text(10000),type:z.enum(['decision','action']),meetingId:idSchema.or(z.literal('')),agendaId:idSchema.or(z.literal('')).default(''),owner:text(80),dueAt:iso.or(z.literal('')),status:z.enum(['proposed','approved','in_progress','done','deferred']),semester:required(30)}).strict(),
 content:z.object({...meta,title:required(160),body:text(16000),type:z.enum(['notice','activity']),published:z.boolean(),semester:required(30)}).strict(),
 settings:z.object({...meta,semester:required(30),semesterEndsAt:iso.optional(),duesAmount:z.number().int().min(0).max(1000000).optional(),joinUrl:z.string().max(500).refine(value=>value===''||!!openChatUrl(value),{message:'카카오톡 오픈채팅 주소를 확인해 주세요.'}),contact:text(200),intro:required(2000),location:required(200),privacy:text(8000).optional(),bankInstructions:text(1500).optional()}).strict(),
 role:z.object({...meta,name:required(50),permissions:z.array(z.enum(permissionKeys)).max(permissionKeys.length).min(1)}).strict(),
 admin:z.object({uid:idSchema,displayName:required(80),role:idSchema,active:z.boolean(),expiresAt:iso}).strict(),
 transaction:z.object({requestId:idSchema,kind:z.enum(['income','expense','refund','dues']),amount:z.number().int().min(1).max(100000000),title:required(160),eventId:idSchema.or(z.literal('')).default(''),applicationId:idSchema.or(z.literal('')).default(''),memberId:idSchema.or(z.literal('')).default(''),note:text(2000).default(''),semester:required(30)}).strict(),
 stock:z.object({id:idSchema,revision:z.number().int().min(1),requestId:idSchema,action:z.enum(['receive','use','open','remaining','adjustRemaining','count','move']),amount:z.number().min(0).max(100000).default(0),bottleId:idSchema.optional(),percent:z.number().int().min(0).max(100).multipleOf(10).optional(),location:text(100).optional(),reason:required(500),eventId:idSchema.or(z.literal('')).default('')}).strict()
};
export function parse(schema,value){const result=schema.safeParse(value);if(!result.success)fail('invalid-argument',result.error.issues.map(i=>i.path.join('.')+': '+i.message).slice(0,3).join(' / '));return result.data;}
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export const secret=()=>randomBytes(32).toString('hex');
export function matches(value,digest){if(typeof value!=='string'||typeof digest!=='string'||digest.length!==64)return false;return timingSafeEqual(Buffer.from(hash(value),'hex'),Buffer.from(digest,'hex'));}
export const normalizePhone=value=>String(value).replace(/[^0-9]/g,'');
export const identity=(studentId,phone)=>hash(String(studentId).trim().toLowerCase()+':'+normalizePhone(phone));
export function ensureScope(admin,scope,now=Date.now()){
 if(!admin?.active||(!defaultRoles.some(r=>r.id===admin.role)&&!Array.isArray(admin.permissions))||!admin.expiresAt||!Number.isFinite(Date.parse(admin.expiresAt))||Date.parse(admin.expiresAt)<=now)fail('permission-denied','등록된 임원 계정이 아니거나 임기가 종료되었습니다.');
 if(!hasPermission(admin,scope))fail('permission-denied','이 업무를 처리할 권한이 없습니다.');
}
export function validateEvent(event,occupied=0){
 if(Date.parse(event.opensAt)>=Date.parse(event.closesAt)||Date.parse(event.closesAt)>Date.parse(event.startsAt)||Date.parse(event.startsAt)>=Date.parse(event.endsAt)||Date.parse(event.cancelUntil)>Date.parse(event.startsAt))fail('invalid-argument','신청 시작·마감·행사 시작·종료 시간을 확인해 주세요.');
 if(event.capacity<occupied)fail('failed-precondition','등록·좌석 예약 인원보다 정원을 줄일 수 없습니다.');
 if(event.fee>0&&!event.paymentInstructions)fail('invalid-argument','유료 행사의 납부 안내를 입력해 주세요.');
}
export function allocate(event,now){
 if(event.status!=='open'||Date.parse(event.opensAt)>now||Date.parse(event.closesAt)<=now)fail('failed-precondition','현재 신청 기간이 아닙니다.');
 if(event.registered<event.capacity && (event.waiting||0)===0)return 'registered';
 if(event.waitlist)return 'waiting';
 fail('resource-exhausted','신청 정원이 마감되었습니다.');
}
export const stockTotal=item=>item.unit==='bottle' ? item.quantity*item.size+Object.values(item.bottles||{}).reduce((sum,p)=>sum+item.size*p/100,0) : item.quantity;
export function changeStock(item,input){
 const next={...item,bottles:{...(item.bottles||{})}};
 const integerUnit=['bottle','each','pack'].includes(item.unit);
 if(integerUnit&&!Number.isInteger(input.amount))fail('invalid-argument','이 품목은 정수 수량으로 입력해 주세요.');
 if(input.action==='receive')next.quantity+=input.amount;
 if(input.action==='use')next.quantity-=input.amount;
 if(input.action==='count')next.quantity=input.amount;
 if(input.action==='open'){
  if(item.unit!=='bottle')fail('invalid-argument','병 단위 품목만 개봉할 수 있습니다.');
  if(Object.keys(next.bottles).length>=100)fail('resource-exhausted','개봉 병 기록을 정리한 뒤 추가해 주세요.');
  next.quantity--;next.bottles[input.requestId]=100;
 }
 if(['remaining','adjustRemaining'].includes(input.action)){
  if(!(input.bottleId in next.bottles)||input.percent===undefined)fail('invalid-argument','개봉 병과 10% 단위 잔량을 선택해 주세요.');
  if(input.action==='remaining'&&input.percent>next.bottles[input.bottleId])fail('invalid-argument','잔량을 늘릴 수 없습니다. 잘못된 기록은 별도 실사 정정으로 처리해 주세요.');
  if(input.percent===0)delete next.bottles[input.bottleId];else next.bottles[input.bottleId]=input.percent;
 }
 if(input.action==='move'){if(!input.location)fail('invalid-argument','옮길 장소를 입력해 주세요.');next.location=input.location;}
 if(next.quantity<0)fail('failed-precondition','보유 수량보다 많이 사용할 수 없습니다.');
 return next;
}
export function publicEvent(event){
 const keys=['id','title','type','description','location','startsAt','endsAt','opensAt','closesAt','cancelUntil','capacity','registered','waiting','fee','waitlist','status','questions','policy','paymentInstructions','semester'];
 return Object.fromEntries(keys.map(k=>[k,event[k]??null]));
}
export const occupied=status=>['registered','offered'].includes(status);
export function requireRevision(record,revision){if(record && record.revision!==revision)fail('aborted','다른 임원이 먼저 수정했습니다. 새로고침한 뒤 다시 확인해 주세요.');}
