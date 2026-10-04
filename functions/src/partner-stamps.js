import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ensureScope, fail, hash, idSchema, parse } from './domain.js';
import { COUPON_CAPACITY } from './coupons.js';
import { semesterSchema } from './roster.js';

const derive=promisify(scrypt),PARTNER='feelingfine',PARTNER_NAME='필링파인';
const QR_LIFETIME=30000,MERCHANT_LIFETIME=365*86400000;
const token=z.string().regex(/^[a-f0-9]{64}$/);
const sessionSchema=z.object({sessionKey:token}).strict();
const qrSchema=z.object({sessionKey:token,token}).strict();
const codeSchema=z.string().trim().min(1);
const settingsSchema=z.object({revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),enabled:z.boolean().default(true),code:codeSchema.optional()}).strict();
const historySchema=z.object({cursor:z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
const historyPosition=z.object({at:z.string().datetime({precision:3}),id:token}).strict();
const historyEntry=z.object({partner:z.literal(PARTNER),consumedAt:z.string().datetime({precision:3}),stampCount:z.number().int().min(1).max(COUPON_CAPACITY)});
const HISTORY_PAGE_SIZE=30;
const configured=config=>!!config&&typeof config.codeSalt==='string'&&/^[a-f0-9]{64}$/.test(config.codeSalt)&&typeof config.codeHash==='string'&&/^[a-f0-9]{128}$/.test(config.codeHash);
const settingsView=config=>({revision:config?.revision||0,configured:configured(config),enabled:!!config?.enabled,...(config?.updatedAt?{updatedAt:config.updatedAt}:{})});
const couponId=member=>hash(PARTNER+':student:'+member.studentId.trim().toLowerCase());
const countSchema=z.object({stampCount:z.number().int().min(0).max(COUPON_CAPACITY),revision:z.number().int().min(0)});
const couponValue=record=>record?parse(countSchema,record):{stampCount:0,revision:0};
const millis=value=>value?.toMillis?.()??NaN;
const asIso=value=>new Date(value).toISOString();
const newToken=()=>randomBytes(32).toString('hex');
const hashCode=(code,salt)=>derive(code,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});

export function createPartnerStamps({db,col,clock,now,roster,throttle,audit,authenticate,authenticateSessionHash,identityFingerprint}){
 const configRef=()=>col('partnerStampSettings').doc(PARTNER);
 const merchantRef=key=>col('partnerMerchantSessions').doc(hash(key));
 const couponRef=member=>col('partnerCoupons').doc(couponId(member));
 const qrRef=key=>col('partnerCouponQrs').doc(hash(key));
 const read=tx=>tx||{get:ref=>ref.get()};
 async function guard(ctx,bucket,key,ipLimit=120,keyLimit=60){
  await throttle(ctx,'partner-'+bucket+'-ip',ipLimit);
  if(key)await throttle({ip:hash(key)},'partner-'+bucket+'-key',keyLimit);
 }
 function merchantLive(session,config,at=clock()){
  if(!session||session.partner!==PARTNER||session.revokedAt||!configured(config)||!config.enabled||session.credentialVersion!==config.credentialVersion||!(millis(session.expiresAt)>at))fail('unauthenticated','제휴처 로그인이 만료되었습니다. 다시 로그인해 주세요.');
 }
 async function merchant(sessionKey,tx){
  const config=(await read(tx).get(configRef())).data(),session=(await read(tx).get(merchantRef(sessionKey))).data();
  merchantLive(session,config);
  return {config,session,sessionHash:hash(sessionKey)};
 }
 async function couponSettings(data,who){
  ensureScope(who,'settings',clock());parse(z.object({}).strict(),data);
  return settingsView((await configRef().get()).data());
 }
 async function couponHistory(data,who){
  ensureScope(who,'settings',clock());const input=parse(historySchema,data);
  let position;
  if(input.cursor){
   try{
    const decoded=Buffer.from(input.cursor,'base64url');
    if(decoded.toString('base64url')!==input.cursor)throw new Error('Noncanonical cursor');
    position=historyPosition.parse(JSON.parse(decoded.toString('utf8')));
   }catch{fail('invalid-argument','적립 기록을 새로고침해 주세요.');}
  }
  // The existing consumed QR is the atomic accrual receipt. Ordering by the
  // single field and its default document-ID tie-break needs no new index.
  return db.runTransaction(async tx=>{
   let query=col('partnerCouponQrs').orderBy('consumedAt','desc').orderBy('__name__','desc').limit(HISTORY_PAGE_SIZE+1);
   if(position)query=query.startAfter(position.at,position.id);
   const result=await tx.get(query),docs=result.docs.slice(0,HISTORY_PAGE_SIZE),members=new Map(),items=[];
   for(const doc of docs){
    const receipt=doc.data();if(!historyEntry.safeParse(receipt).success||receipt.deletedAt||receipt.anonymizedAt)continue;
    let memberName='삭제된 부원';
    if(idSchema.safeParse(receipt.memberId).success&&semesterSchema.safeParse(receipt.semester).success){
     const key=receipt.semester+'/'+receipt.memberId;
     if(!members.has(key))members.set(key,await roster.get(receipt.memberId,receipt.semester,tx));
     const member=members.get(key);
     if(member&&!member.deletedAt&&!member.anonymizedAt&&!member.removedAt&&typeof member.name==='string'&&member.name.trim())memberName=member.name.trim().slice(0,40);
    }
    // Never spread a receipt or roster record into this administrator response.
    items.push({memberName,at:receipt.consumedAt,stampCount:receipt.stampCount});
   }
   const last=docs.at(-1),next=last&&historyPosition.safeParse({at:last.data().consumedAt,id:last.id});
   return {items,nextCursor:result.size>HISTORY_PAGE_SIZE&&next?.success?Buffer.from(JSON.stringify(next.data)).toString('base64url'):null};
  },{readOnly:true});
 }
 async function saveCouponSettings(data,who){
  ensureScope(who,'settings',clock());const input=parse(settingsSchema,data);
  const codeSalt=input.code===undefined?null:newToken();
  const codeHash=codeSalt?(await hashCode(input.code,codeSalt)).toString('hex'):null;
  return db.runTransaction(async tx=>{
   const ref=configRef(),old=(await tx.get(ref)).data();
   if(input.revision!==(old?.revision||0))fail('aborted','제휴 설정이 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.');
   if(input.enabled&&!codeHash&&!configured(old))fail('failed-precondition','제휴처 로그인 코드를 먼저 설정해 주세요.');
   const at=now(),credentialsChanged=!!codeHash||!old||old.enabled!==input.enabled;
   const next={partner:PARTNER,enabled:input.enabled,revision:input.revision+1,credentialVersion:(old?.credentialVersion||0)+(credentialsChanged?1:0),createdAt:old?.createdAt||at,updatedAt:at,updatedBy:who.uid,...(configured(old)?{codeSalt:old.codeSalt,codeHash:old.codeHash}:{}),...(codeHash?{codeSalt,codeHash}:{})};
   tx.set(ref,next);audit(tx,who,'partnerStampSettings',PARTNER,'필링파인 제휴 설정 변경');return settingsView(next);
  });
 }
 async function memberCoupons(data,ctx){
  const input=parse(sessionSchema,data);await guard(ctx,'coupons',input.sessionKey,200,60);
  return db.runTransaction(async tx=>{
   const {member,expiresAt}=await authenticate(input.sessionKey,tx),config=(await tx.get(configRef())).data();
   const coupon=couponValue((await tx.get(couponRef(member))).data());
   return {available:configured(config)&&!!config.enabled,capacity:COUPON_CAPACITY,...coupon,expiresAt};
  },{readOnly:true});
 }
 async function issueCouponQr(data,ctx){
  const input=parse(sessionSchema,data);await guard(ctx,'qr-issue',input.sessionKey,200,30);
  const verified=await authenticate(input.sessionKey);
  await throttle({ip:couponId(verified.member)},'partner-qr-member',30);
  const rawToken=newToken(),tokenHash=hash(rawToken);
  return db.runTransaction(async tx=>{
   const {member,expiresAt:memberExpiresAt}=await authenticate(input.sessionKey,tx),config=(await tx.get(configRef())).data();
   if(!configured(config)||!config.enabled)fail('failed-precondition','현재 제휴처 스탬프 적립을 이용할 수 없습니다.');
   const ref=couponRef(member),stored=(await tx.get(ref)).data(),coupon=couponValue(stored);
   if(coupon.stampCount>=COUPON_CAPACITY)fail('failed-precondition','스탬프 10개를 모두 모았습니다. 추가 적립은 할 수 없습니다.');
   const issuedAt=clock();if(Date.parse(memberExpiresAt)<=issuedAt)fail('unauthenticated','부원 로그인이 만료되었습니다. 다시 로그인해 주세요.');
   const at=asIso(issuedAt),expiresAt=issuedAt+QR_LIFETIME;
   tx.create(qrRef(rawToken),{partner:PARTNER,couponId:ref.id,memberId:member.id,semester:member.semester,identityHash:identityFingerprint(member),memberSessionHash:hash(input.sessionKey),credentialVersion:config.credentialVersion,createdAt:at,expiresAt:Timestamp.fromMillis(expiresAt)});
   // One pointer invalidates every previously issued QR, including other devices.
   tx.set(ref,{...coupon,activeQrHash:tokenHash,createdAt:stored?.createdAt||at,updatedAt:at});
   return {token:rawToken,expiresAt:asIso(expiresAt),serverNow:at};
  });
 }
 async function merchantLogin(data,ctx){
  const input=parse(z.object({code:codeSchema}).strict(),data);
  // Both limits run before scrypt so untrusted login attempts have bounded cost.
  await throttle(ctx,'partner-login-ip',8);
  await throttle({ip:'feelingfine-global'},'partner-login-global',40);
  const config=(await configRef().get()).data();
  if(!configured(config)||!config.enabled)fail('unauthenticated','제휴처 로그인 코드를 확인해 주세요.');
  const derived=await hashCode(input.code,config.codeSalt);
  if(!timingSafeEqual(derived,Buffer.from(config.codeHash,'hex')))fail('unauthenticated','제휴처 로그인 코드를 확인해 주세요.');
  const sessionKey=newToken();
  return db.runTransaction(async tx=>{
   const current=(await tx.get(configRef())).data();
   if(!configured(current)||!current.enabled||current.credentialVersion!==config.credentialVersion||current.codeHash!==config.codeHash)fail('unauthenticated','제휴 설정이 변경되었습니다. 다시 로그인해 주세요.');
   const issuedAt=clock(),expiresAt=issuedAt+MERCHANT_LIFETIME;
   tx.create(merchantRef(sessionKey),{partner:PARTNER,credentialVersion:current.credentialVersion,createdAt:asIso(issuedAt),expiresAt:Timestamp.fromMillis(expiresAt)});
   return {sessionKey,expiresAt:asIso(expiresAt)};
  });
 }
 async function merchantSession(data,ctx){
  const input=parse(sessionSchema,data);await guard(ctx,'session',input.sessionKey);
  return db.runTransaction(async tx=>{
   const {session}=await merchant(input.sessionKey,tx);
   return {expiresAt:asIso(millis(session.expiresAt)),partnerName:PARTNER_NAME};
  },{readOnly:true});
 }
 async function merchantLogout(data,ctx){
  const input=parse(sessionSchema,data);await guard(ctx,'logout',input.sessionKey);
  return db.runTransaction(async tx=>{
   const ref=merchantRef(input.sessionKey),session=(await tx.get(ref)).data();
   // A holder may revoke their token even after its code or account has expired.
   if(session&&!session.revokedAt)tx.update(ref,{revokedAt:now()});
   return {ok:true};
  });
 }
 async function verifyQr(input,tx){
  const authorized=await merchant(input.sessionKey,tx),ref=qrRef(input.token),qr=(await tx.get(ref)).data();
  if(!qr||qr.partner!==PARTNER||!token.safeParse(qr.memberSessionHash).success)fail('not-found','스탬프 QR을 확인해 주세요.');
  let verified;
  try{verified=await authenticateSessionHash(qr.memberSessionHash,tx);}
  catch(error){
   // Only the merchant's own session may produce a merchant login error.
   if(['unauthenticated','permission-denied'].includes(error.code))fail('failed-precondition','부원 인증이 만료되거나 변경되었습니다. 새 QR을 요청해 주세요.');
   throw error;
  }
  const member=verified.member;
  if(qr.memberId!==member.id||qr.semester!==member.semester||qr.identityHash!==identityFingerprint(member)||qr.couponId!==couponId(member))fail('failed-precondition','부원 정보가 변경되었습니다. 새 QR을 요청해 주세요.');
  const ledgerRef=couponRef(member),ledger=(await tx.get(ledgerRef)).data(),coupon=couponValue(ledger),at=clock();
  merchantLive(authorized.session,authorized.config,at);
  if(Date.parse(verified.expiresAt)<=at)fail('failed-precondition','부원 인증이 만료되거나 변경되었습니다. 새 QR을 요청해 주세요.');
  // expiresAt controls the member's QR display; merchants may finish later.
  if(qr.credentialVersion!==authorized.config.credentialVersion||ledger?.activeQrHash!==hash(input.token))fail('failed-precondition','새 QR이 발급되었거나 제휴 설정이 변경되었습니다. 새 QR을 확인해 주세요.');
  return {...authorized,ref,qr,member,ledgerRef,ledger,coupon,at};
 }
 async function merchantCouponPreview(data,ctx){
  const input=parse(qrSchema,data);await guard(ctx,'preview',input.sessionKey,200,120);
  return db.runTransaction(async tx=>{
   const {qr,member,coupon,at}=await verifyQr(input,tx);
   if(qr.consumedAt)fail('already-exists','이미 적립한 QR입니다.');
   return {memberName:member.name,stampCount:coupon.stampCount,capacity:COUPON_CAPACITY,expiresAt:asIso(millis(qr.expiresAt)),serverNow:asIso(at)};
  },{readOnly:true});
 }
 async function stampCoupon(data,ctx){
  const input=parse(qrSchema,data);await guard(ctx,'stamp',input.sessionKey,200,120);
  return db.runTransaction(async tx=>{
   const {ref,qr,member,ledgerRef,ledger,coupon,sessionHash,at}=await verifyQr(input,tx);
   if(qr.consumedAt){
    if(qr.consumedBy!==sessionHash)fail('already-exists','이미 적립한 QR입니다.');
    return {stampCount:coupon.stampCount,capacity:COUPON_CAPACITY,memberName:member.name,duplicate:true};
   }
   if(coupon.stampCount>=COUPON_CAPACITY)fail('failed-precondition','스탬프는 10개까지 적립할 수 있습니다.');
   const next={...coupon,stampCount:coupon.stampCount+1,revision:coupon.revision+1},timestamp=asIso(at);
   tx.update(ref,{consumedAt:timestamp,consumedBy:sessionHash,stampCount:next.stampCount});
   tx.set(ledgerRef,{...next,activeQrHash:hash(input.token),createdAt:ledger?.createdAt||timestamp,updatedAt:timestamp});
   audit(tx,{uid:'merchant:'+PARTNER,displayName:PARTNER_NAME+' 제휴처'},'partnerCoupons',ledgerRef.id,'필링파인 스탬프 1개 적립');
   return {stampCount:next.stampCount,capacity:COUPON_CAPACITY,memberName:member.name};
  });
 }
 return {couponSettings,couponHistory,saveCouponSettings,memberCoupons,issueCouponQr,merchantLogin,merchantSession,merchantLogout,merchantCouponPreview,stampCoupon};
}
