import { createEventApplications } from './event-applications.js';
import { createRecords } from './records.js';
import { createDashboard } from './dashboard.js';
import { createStaffPricing } from './staff-pricing.js';
import { createRoster, semesterSchema } from './roster.js';
import { defaultRoles, hasPermission, isRequestViewer, REQUEST_VIEWER_ROLE } from './permissions.js';
import { requestViewerSessionExpiry } from './admin-session.js';
import { z } from 'zod';
import { createPrivacy } from './privacy.js';
import { createDeletion } from './deletion.js';
import { createDecisionCategories } from './decision-categories.js';
import { createInventoryBoard, inventoryCategoryId } from './inventory-board.js';
import { createMemberPortal } from './member-portal.js';
import { createEquipment } from './equipment.js';
import { createPartnerStamps } from './partner-stamps.js';
import { createOnTheRock } from './on-the-rock.js';
import { createBudgetPlanner } from './budget-planner.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { schemas, parse, fail, ensureScope, hash, secret, publicEvent, requireRevision, idSchema, roles } from './domain.js';
const PREFIX='martini_v2_';
const token=z.string().regex(/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/);
export function createService(db,clock=Date.now){
 const col=name=>db.collection(PREFIX+name);
 const now=()=>new Date(clock()).toISOString();
 const roster=createRoster(col);
 const snapshot=snap=>snap.exists&&!snap.data().deletedAt?{...snap.data(),id:snap.id}:null;
 const clean=record=>{const {linkHash,receiptHash,identityHash,memberIdentityHash,isStaff,staffFee,staffFeeRevision,pricingRevision,...safe}=record;return safe;};
 function protectedRole(builtin,stored){return {...builtin,permissions:[...builtin.permissions,...(!stored?.deletedAt&&Array.isArray(stored?.permissions)&&stored.permissions.includes('budget')?['budget']:[])],revision:stored?.revision||0};}
 async function roleDefinition(id,tx){
  const builtin=defaultRoles.find(r=>r.id===id);
  if(id===REQUEST_VIEWER_ROLE)return {...builtin,revision:0};
  const ref=col('roles').doc(id),doc=tx?await tx.get(ref):await ref.get();
  if(['owner','chair'].includes(id))return protectedRole(builtin,doc.data());
  return doc.exists?(doc.data().deletedAt?null:{...doc.data(),id,system:!!builtin}):builtin?{...builtin,revision:0}:null;
 }
 async function admin(ctx,assigned){
  if(!ctx.uid)fail('unauthenticated','임원 계정으로 로그인해 주세요.');
  const profile=assigned||snapshot(await col('admins').doc(ctx.uid).get());
  if(!profile?.active||!profile.expiresAt||!Number.isFinite(Date.parse(profile.expiresAt))||Date.parse(profile.expiresAt)<=clock())fail('permission-denied','등록된 임원 계정이 아니거나 임기가 종료되었습니다.');
  const role=await roleDefinition(profile.role);if(!role)fail('permission-denied','배정된 역할을 확인해 주세요.');
  let sessionExpiresAt;
  if(isRequestViewer(profile)){
   sessionExpiresAt=requestViewerSessionExpiry(profile,ctx.authTime,clock());
   if(typeof ctx.verifyAuthSession!=='function')fail('unauthenticated','인증 상태를 확인할 수 없습니다. 다시 로그인해 주세요.');
   await ctx.verifyAuthSession();
  }
  return {...profile,uid:ctx.uid,permissions:role.permissions,roleName:role.name,...(sessionExpiresAt?{sessionExpiresAt}:{})};
 }
 function visible(kind,record,who){
  const result=clean(record);
  if(kind==='applications'&&hasPermission(who,'finance'))Object.assign(result,{isStaff:!!record.isStaff,staffFee:record.staffFee??record.fee,pricingRevision:record.pricingRevision||0});
  if(kind==='events'&&hasPermission(who,'finance'))Object.assign(result,{staffFee:record.staffFee??null,staffFeeRevision:record.staffFeeRevision||0});
  if(kind==='members'){delete result.duesPaid;delete result.status;}
  if(kind==='inventory')result.categoryId=inventoryCategoryId(record);
  if(kind==='applications'&&!hasPermission(who,'finance'))for(const key of ['paidAmount','refundAmount','payment'])delete result[key];
  return result;
 }
 function audit(tx,who,kind,id,action,semester){tx.create(col('audit').doc(),{entityType:kind,entityId:id,action,actor:who.uid,actorName:who.displayName,at:now(),updatedAt:now(),...(semester?{semester}:{})});}
 const deleteRecord=createDeletion({db,col,clock,audit});
 const decisionCategories=createDecisionCategories({db,col,clock,now,audit});
 const inventoryBoard=createInventoryBoard({db,col,clock,now,audit});
 const staffPricing=createStaffPricing({db,col,clock,now,audit});
 const onTheRock=createOnTheRock({db,col,now,audit});
 const budgetPlanner=createBudgetPlanner({db,col,clock,now,audit});
 const privacy=createPrivacy({db,col,now,clock,audit,roster});
 async function throttle(ctx,bucket,limit=30){
  const minute=Math.floor(clock()/60000),ref=col('rateLimits').doc(hash(ctx.ip+':'+bucket+':'+minute));
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const count=snap.data()?.count||0;if(count>=limit)fail('resource-exhausted','요청이 많습니다. 잠시 후 다시 시도해 주세요.');tx.set(ref,{count:count+1,expiresAt:Timestamp.fromMillis(clock()+3600000)});});
 }
 async function settings(){return (await col('settings').doc('club').get()).data()||null;}
 const equipment=createEquipment({db,col,clock,now,audit,throttle,authenticate:(...args)=>memberPortal.authenticate(...args),identityFingerprint:member=>memberPortal.identityFingerprint(member)});
 const memberPortal=createMemberPortal({db,col,clock,now,roster,throttle,audit,equipment});
 const partnerStamps=createPartnerStamps({db,col,clock,now,roster,throttle,audit,authenticate:memberPortal.authenticate,authenticateSessionHash:memberPortal.authenticateSessionHash,identityFingerprint:memberPortal.identityFingerprint});
 const {verifyEvent,apply,receipt,memberApplications,memberApplication,applicationCommand}=createEventApplications({db,col,clock,now,snapshot,clean,audit,roster,throttle,memberPortal});
 const {save,read,stock,finance}=createRecords({db,col,clock,now,snapshot,visible,audit,roster,settings,inventoryBoard});
 const dashboard=createDashboard({col,clock,roster,settings});
 async function handle(payload,ctx={}){
  if(!payload||typeof payload.op!=='string')fail('invalid-argument','요청을 확인해 주세요.');
  const {op,...data}=payload;
  let who;
  if(ctx.uid){
   const assigned=snapshot(await col('admins').doc(ctx.uid).get());
   if(isRequestViewer(assigned)){
    who=await admin(ctx,assigned);
    // Enforce before public/capability routes too; signing in never grants a write path.
    if(!['profile','clubRequests','adminLogout'].includes(op))fail('permission-denied','신청 · 문의 조회만 허용된 계정입니다.');
   }
  }
  if(op==='publicRead'){
   await throttle(ctx,'public:'+parseInt(secret().slice(0,2),16)%16,100);
   const [config,content]=await Promise.all([settings(),col('content').where('published','==',true).limit(50).get()]);
   return {settings:config?{intro:config.intro,contact:config.contact,joinUrl:config.joinUrl,privacy:config.privacy,location:config.location,semester:config.semester}:null,content:content.docs.map(s=>clean({...s.data(),id:s.id})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
  }
  if(op==='resolveLink'){
   const input=parse(z.object({kind:z.enum(['e','r']),key:token}).strict(),data);
   await throttle(ctx,'resolve-link:'+input.kind+':'+(parseInt(secret().slice(0,4),16)%16),100);
   const rows=await col(input.kind==='e'?'events':'applications').where(input.kind==='e'?'linkHash':'receiptHash','==',hash(input.key)).limit(2).get();
   const record=rows.size===1?snapshot(rows.docs[0]):null;
   if(!record||record.anonymizedAt)fail('not-found','링크를 확인해 주세요.');
   return {id:rows.docs[0].id};
  }
  if(op==='eventAccess'){const input=parse(z.object({eventId:idSchema,key:token}).strict(),data);await throttle(ctx,'event:'+input.eventId+':'+(parseInt(secret().slice(0,4),16)%16),100);return publicEvent(await verifyEvent(input.eventId,input.key));}
  if(op==='apply')return apply(data,ctx);
  if(op==='receipt')return receipt(data,ctx);
  if(op==='memberAccess')return memberPortal.access(data,ctx);
  if(op==='memberLogout')return memberPortal.logout(data,ctx);
  if(op==='memberPortal')return memberPortal.portal(data,ctx);
  if(['memberEquipment','borrowEquipment','returnEquipment'].includes(op))return equipment[op](data,ctx);
  if(op==='memberEventAccess')return memberPortal.eventAccess(data,ctx);
  if(op==='memberApplications')return memberApplications(data,ctx);
  if(op==='memberApplication')return memberApplication(data,ctx);
  if(['memberCoupons','issueCouponQr','merchantLogin','merchantSession','merchantLogout','merchantCouponPreview','stampCoupon','merchantCouponHistory','adjustMerchantCoupon'].includes(op))return partnerStamps[op](data,ctx);
  if(op==='submitClubRequest')return memberPortal.submit(data,ctx);
  if(op==='clubRequestReceipt')return memberPortal.getReceipt(data,ctx);
  if(op==='cancelClubRequest')return memberPortal.cancel(data,ctx);
  who||=await admin(ctx);
  // Also blocks legacy operations available to every staff member.
  if(isRequestViewer(who)&&!['profile','clubRequests','adminLogout'].includes(op))fail('permission-denied','신청 · 문의 조회만 허용된 계정입니다.');
  if(op==='adminLogout'){
   if(!isRequestViewer(who))fail('permission-denied','조회 전용 계정의 세션 종료 기능입니다.');
   parse(z.object({}).strict(),data);
   await db.runTransaction(async tx=>{
    const ref=col('admins').doc(who.uid),current=(await tx.get(ref)).data();
    if(!current)return;
    tx.update(ref,{sessionsRevokedThrough:Math.max(current.sessionsRevokedThrough||0,ctx.authTime,Math.floor(clock()/1000))});
   });
   return {saved:true};
  }
  if(['couponSettings','couponHistory','saveCouponSettings','resetCouponData'].includes(op))return partnerStamps[op](data,who);
  if(op==='budgetPlanner')return budgetPlanner.read(data,who);
  if(op==='saveBudgetPlanner')return budgetPlanner.save(data,who);
  if(['onTheRockBoard','saveOnTheRockGroup','recordOnTheRockMission','updateOnTheRockRecord','voidOnTheRockRecord'].includes(op))return onTheRock(op,data,who);
  if(['equipmentCatalog','saveEquipmentItem','deleteEquipmentItem'].includes(op))return equipment[op](data,who);
  if(op==='clubRequests')return memberPortal.list(data,who);
  if(op==='clubRequestCommand')return memberPortal.command(data,who);
  if(op==='profile')return {uid:who.uid,displayName:who.displayName,role:who.role,roleName:who.roleName,permissions:who.permissions,expiresAt:who.expiresAt,...(who.sessionExpiresAt?{sessionExpiresAt:who.sessionExpiresAt}:{})};

  if(['decisionCategories','createDecisionCategory','deleteDecisionCategory'].includes(op))return decisionCategories(op,data,who);
  if(['listInventoryCategories','saveInventoryCategory','deleteInventoryCategory','moveInventoryItem'].includes(op))return inventoryBoard.handle(op,data,who);

  // Kept for already-open clients during server-first deployment.
  if(op==='decisionEvents'){
   ensureScope(who,'decisions',clock());
   const input=parse(z.object({cursor:idSchema.optional()}).strict(),data);
   let query=col('events').orderBy('__name__').select('title','semester','status','startsAt','deletedAt').limit(101);
   if(input.cursor)query=query.startAfter(input.cursor);
   const result=await query.get(),docs=result.docs.slice(0,100);
   // Decision staff need event labels, not participant, financial, or access-link data.
   return {rows:docs.map(d=>({id:d.id,title:d.data().title||'이름 없는 행사',semester:d.data().semester||'',status:d.data().status||'draft',startsAt:d.data().startsAt||'',archived:!!d.data().deletedAt})),nextCursor:result.size>100?docs.at(-1).id:null};
  }

  if(op==='listRoles'){
   ensureScope(who,'admins',clock());
   const stored=await col('roles').get(),assigned=await col('admins').get();
   const map=new Map(defaultRoles.map(r=>[r.id,{...r,revision:0}]));
   stored.docs.forEach(doc=>{if(['owner','chair'].includes(doc.id)){map.set(doc.id,protectedRole(defaultRoles.find(role=>role.id===doc.id),doc.data()));return;}if(doc.data().deletedAt)map.delete(doc.id);else map.set(doc.id,{...doc.data(),id:doc.id,system:defaultRoles.some(r=>r.id===doc.id)});});
   map.set(REQUEST_VIEWER_ROLE,{...defaultRoles.find(r=>r.id===REQUEST_VIEWER_ROLE),revision:0});
   return {rows:[...map.values()].map(r=>({...r,assigned:assigned.docs.filter(a=>a.data().role===r.id).length}))};
  }
  if(op==='setRoleBudget'){
   ensureScope(who,'admins',clock());
   const input=parse(z.object({id:z.enum(['owner','chair']),revision:z.number().int().min(0),enabled:z.boolean()}).strict(),data);
   return db.runTransaction(async tx=>{
    const old=await roleDefinition(input.id,tx);requireRevision(old,input.revision);
    const builtin=defaultRoles.find(role=>role.id===input.id);
    const next={id:input.id,name:builtin.name,permissions:[...builtin.permissions,...(input.enabled?['budget']:[])],revision:old.revision+1,updatedAt:now()};
    tx.set(col('roles').doc(input.id),next);audit(tx,who,'roles',input.id,'예산 업무 권한 '+(input.enabled?'허용':'해제'));return next;
   });
  }
  if(op==='saveRole'){
   ensureScope(who,'admins',clock());const input=parse(schemas.role,data),id=input.id||col('roles').doc().id;
   if(id===REQUEST_VIEWER_ROLE)fail('failed-precondition','조회 전용 역할의 권한은 변경할 수 없습니다.');
   if(['owner','chair'].includes(id))fail('failed-precondition','회장·부회장의 필수 관리 권한은 변경할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const old=await roleDefinition(id,tx);if(input.id&&!old)fail('not-found','역할을 찾을 수 없습니다.');
    requireRevision(old,input.revision);
    const all=await tx.get(col('roles')),names=new Map(defaultRoles.map(r=>[r.id,r.name]));all.docs.forEach(doc=>{if(doc.data().deletedAt)names.delete(doc.id);else names.set(doc.id,doc.data().name);});
    if([...names].some(([key,name])=>key!==id&&name===input.name))fail('already-exists','같은 이름의 역할이 있습니다. 다른 이름을 입력해 주세요.');
    const next={id,name:input.name,permissions:[...new Set(input.permissions)],revision:(old?.revision||0)+1,updatedAt:now()};
    tx.set(col('roles').doc(id),next);audit(tx,who,'roles',id,'역할 권한 설정');return next;
   });
  }
  if(op==='deleteRole'){
   ensureScope(who,'admins',clock());const input=parse(z.object({id:idSchema,revision:z.number().int().min(0)}).strict(),data);
   if(input.id===REQUEST_VIEWER_ROLE)fail('failed-precondition','조회 전용 역할은 삭제할 수 없습니다. 계정의 접근 허용을 해제해 주세요.');
   if(['owner','chair'].includes(input.id))fail('failed-precondition','회장·부회장 역할은 삭제할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const role=await roleDefinition(input.id,tx),assigned=await tx.get(col('admins').where('role','==',input.id));
    if(!role)fail('not-found','역할을 찾을 수 없습니다.');requireRevision(role,input.revision);
    if(!assigned.empty)fail('failed-precondition','이 역할을 배정받은 임원의 역할을 먼저 변경해 주세요.');
    if(defaultRoles.some(r=>r.id===input.id))tx.set(col('roles').doc(input.id),{id:input.id,deletedAt:now(),updatedAt:now(),revision:(role.revision||0)+1});else tx.delete(col('roles').doc(input.id));audit(tx,who,'roles',input.id,'역할 삭제');return {saved:true};
   });
  }

  if(op==='removeMember'||op==='restoreMember'){
   ensureScope(who,'members',clock());
   const input=parse(z.object({id:idSchema,semester:semesterSchema,revision:z.number().int().min(1)}).strict(),data),remove=op==='removeMember';
   return db.runTransaction(async tx=>{
    const nested=await tx.get(roster.collection(input.semester).doc(input.id));
    const doc=nested.exists?nested:await tx.get(col('members').doc(input.id));
    if(!doc.exists||(!nested.exists&&doc.data().semester!==input.semester))fail('not-found','이 학기의 부원을 찾을 수 없습니다.');
    const old=doc.data();
    if(!!old.removedAt===remove)return {saved:true,duplicate:true};
    requireRevision(old,input.revision);
    if(!remove&&old.anonymizedAt)fail('failed-precondition','개인정보가 정리된 부원은 복구할 수 없습니다.');
    await tx.get(col('semesters').doc(input.semester));
    tx.update(doc.ref,{removedAt:remove?now():FieldValue.delete(),removedBy:remove?who.uid:FieldValue.delete(),revision:old.revision+1,updatedAt:now(),updatedBy:who.uid});
    tx.set(col('semesters').doc(input.semester),{updatedAt:now()},{merge:true});
    audit(tx,who,'members',input.id,remove?'학기 명부에서 제거':'학기 명부에 복구',input.semester);
    return {saved:true};
   });
  }
  if(op==='rosterTerms'){ensureScope(who,'membersRead',clock());const current=(await settings())?.semester;return {rows:[...new Set([...(await roster.terms()),...(semesterSchema.safeParse(current).success?[current]:[])])].sort().reverse()};}
  if(op==='dashboard')return dashboard(data,who);
  if(op==='read')return read(data,who);
  if(op==='deleteRecord')return deleteRecord(data,who);
  if(op==='privacyCandidates')return privacy.candidates(data,who);
  if(op==='privacyReview')return privacy.review(data,who);
  if(op==='privacyAnonymize')return privacy.anonymize(data,who);
  const saves={
   saveMember:['members',schemas.member,'members'],saveEvent:['events',schemas.event,'events'],saveItem:['inventory',schemas.item,'inventory'],
   saveMeeting:['meetings',schemas.meeting,'meetings'],saveDecision:['decisions',schemas.decision,'decisions'],saveContent:['content',schemas.content,'content'],
   saveBudget:['budgets',schemas.budget,'finance'],saveSettings:['settings',schemas.settings,'settings']
  };
  if(saves[op]){const [kind,schema,scope]=saves[op];return save(kind,schema,data,who,scope);}
  if(op==='deleteBudget'||op==='executeBudget'){
   ensureScope(who,'finance',clock());
   const schema=op==='executeBudget'?z.object({id:idSchema,revision:z.number().int().min(1),amount:z.number().int().min(1).max(100000000),confirmed:z.literal(true)}).strict():z.object({id:idSchema,revision:z.number().int().min(1)}).strict();
   const input=parse(schema,data),ref=col('budgets').doc(input.id);
   return db.runTransaction(async tx=>{
    const doc=await tx.get(ref),plan=snapshot(doc);if(!plan)fail('not-found','지출 계획을 찾을 수 없습니다.');
    if(plan.status==='executed'){if(op==='executeBudget')return {saved:true,duplicate:true};fail('failed-precondition','집행 완료한 계획은 삭제할 수 없습니다.');}
    requireRevision(plan,input.revision);
    if(op==='deleteBudget'){tx.delete(ref);audit(tx,who,'budgets',input.id,'지출 계획 삭제',plan.semester);return {saved:true};}
    const entry=col('finance').doc(),at=now();
    tx.create(entry,{id:entry.id,requestId:entry.id,kind:'expense',amount:input.amount,title:plan.title,note:plan.note||'',semester:plan.semester,eventId:'',applicationId:'',memberId:'',budgetId:input.id,actor:who.displayName,createdAt:at,updatedAt:at});
    tx.update(ref,{status:'executed',actualAmount:input.amount,transactionId:entry.id,revision:plan.revision+1,updatedAt:at,updatedBy:who.uid});
    audit(tx,who,'budgets',input.id,'지출 계획 집행 완료',plan.semester);audit(tx,who,'finance',entry.id,'계획 지출 기록',plan.semester);return {saved:true};
   });
  }
  if(op==='stock')return stock(data,who);
  if(['setEventStaffFee','setApplicationStaff','setApplicationPricing'].includes(op))return staffPricing(op,data,who);
  if(op==='finance')return finance(data,who);
  if(op==='applicationCommand')return applicationCommand(data,who);
  if(op==='rotateEventLink'){
   ensureScope(who,'events',clock());const input=parse(z.object({id:idSchema,revision:z.number().int()}).strict(),data),key=secret(),ref=col('events').doc(input.id);
   await db.runTransaction(async tx=>{const old=snapshot(await tx.get(ref));if(!old)fail('not-found','행사를 찾을 수 없습니다.');requireRevision(old,input.revision);tx.update(ref,{linkHash:hash(key),revision:old.revision+1,updatedAt:now()});audit(tx,who,'events',input.id,'신청 링크 재발급');});return {linkKey:key};
  }
  if(op==='participantContact'){
   if(!hasPermission(who,'participants'))fail('permission-denied','행사 참가자 연락처 조회 권한이 없습니다.');
   const input=parse(z.object({id:idSchema}).strict(),data),a=snapshot(await col('applications').doc(input.id).get());
   if(!a)fail('not-found','신청을 찾을 수 없습니다.');
   if(a.anonymizedAt)return {name:'정보 정리 완료',phone:'',studentId:'',department:''};
   const m=await roster.get(a.memberId,a.semester);
   return {name:a.name,phone:m?.phone||'',studentId:m?.studentId||'',department:m?.department||''};
  }
  if(op==='rotateReceipt'){
   ensureScope(who,'events',clock());const input=parse(z.object({id:idSchema,reason:z.string().trim().min(1).max(200)}).strict(),data),key=secret(),ref=col('applications').doc(input.id);
   await db.runTransaction(async tx=>{const record=await tx.get(ref);if(!snapshot(record))fail('not-found','신청을 찾을 수 없습니다.');if(record.data().anonymizedAt)fail('failed-precondition','정보가 정리된 신청에는 확인 링크를 발급할 수 없습니다.');tx.update(ref,{receiptHash:hash(key),updatedAt:now()});audit(tx,who,'applications',input.id,'확인 링크 재발급: '+input.reason);});return {key};
  }
  if(op==='deleteAdmin'){
   ensureScope(who,'admins',clock());const input=parse(z.object({uid:idSchema,updatedAt:z.string().datetime()}).strict(),data);
   if(input.uid===who.uid)fail('failed-precondition','본인 계정은 임원 목록에서 삭제할 수 없습니다.');
   return db.runTransaction(async tx=>{
    const assigned=await tx.get(col('admins')),target=assigned.docs.find(d=>d.id===input.uid),actor=assigned.docs.find(d=>d.id===who.uid)?.data();
    if(!actor?.active||!['owner','chair'].includes(actor.role)||Date.parse(actor.expiresAt)<=clock()||!Number.isFinite(Date.parse(actor.expiresAt)))fail('permission-denied','현재 회장·부회장 권한을 확인해 주세요.');
    if(!target)fail('not-found','임원을 찾을 수 없습니다.');
    if(target.data().updatedAt!==input.updatedAt)fail('aborted','임원 정보가 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.');
    const otherOwners=assigned.docs.filter(d=>d.id!==input.uid&&['owner','chair'].includes(d.data().role)&&d.data().active&&Date.parse(d.data().expiresAt)>clock());
    if(['owner','chair'].includes(target.data().role)&&!otherOwners.length)fail('failed-precondition','마지막 회장·부회장 계정은 삭제할 수 없습니다.');
    tx.delete(target.ref);audit(tx,who,'admins',input.uid,'임원 삭제 · 관리자 접근 해제');return {saved:true};
   });
  }
  if(op==='saveAdmin'){

   ensureScope(who,'admins',clock());const input=parse(schemas.admin,data);
   if(input.uid===who.uid&&(!input.active||!['owner','chair'].includes(input.role)||Date.parse(input.expiresAt)<=clock()))fail('failed-precondition','본인의 최종 운영 권한을 제거할 수 없습니다.');
   const ref=col('admins').doc(input.uid);
   await db.runTransaction(async tx=>{const previous=(await tx.get(ref)).data();const role=await roleDefinition(input.role,tx);if(!role)fail('invalid-argument','존재하는 역할을 선택해 주세요.');const sessionsRevokedThrough=Math.max(previous?.sessionsRevokedThrough||0,input.active?0:Math.floor(clock()/1000));tx.set(ref,{...input,sessionsRevokedThrough,updatedAt:now(),updatedBy:who.uid});audit(tx,who,'admins',input.uid,'임원 권한 설정');});return {saved:true};
  }
  if(op==='recordExport'){
   const input=parse(z.object({kind:z.enum(['members','applications','finance','inventory','meetings','decisions']),reason:z.string().min(1).max(200)}).strict(),data);
   if(input.kind==='applications'){if(!hasPermission(who,'participants'))fail('permission-denied','내보내기 권한이 없습니다.');}else ensureScope(who,input.kind,clock());
   await col('audit').add({entityType:input.kind,entityId:'export',action:'자료 내보내기: '+input.reason,actor:who.uid,actorName:who.displayName,updatedAt:now(),at:now()});return {saved:true};
  }
  fail('not-found','지원하지 않는 요청입니다.');
 }
 return {handle};
}
