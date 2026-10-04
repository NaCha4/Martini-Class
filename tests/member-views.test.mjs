import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setMemberSession,getMemberSessionKey,memberStorage,memberState,forgetMemberDevice,MEMBER_STORAGE_KEY } from '../web/src/member-session.js';

const cssHook=registerHooks({load(url,context,nextLoad){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};if(url.endsWith('.html?raw'))return {format:'module',source:'export default "";',shortCircuit:true};return nextLoad(url,context);}});
let renderMemberPortal,renderMemberEventChoices,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit,renderPublic,publicAction,renderEventPage,renderApplicationPage,eventSubmit,eventAction,modal,mountMemberDetail;
try{
 ({renderMemberPortal,renderMemberEventChoices,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit}=await import('../web/src/member-portal.js'));
 ({renderPublic,publicAction}=await import('../web/src/public.js'));
 ({renderEventPage,renderApplicationPage,eventSubmit,eventAction}=await import('../web/src/event-pages.js'));
 ({modal}=await import('../web/src/ui.js'));
 ({mountMemberDetail}=await import('../web/src/member-detail.js'));
}finally{cssHook.deregister();}

const sessionKey='a'.repeat(64),receiptKey='b'.repeat(64),member={name:'테스트 부원',semester:'2026-2'};
const time=offset=>new Date(Date.now()+offset).toISOString();
const event=(id,extra={})=>({eventId:id,id,title:'행사 '+id,type:'class',location:'동아리방',startsAt:time(3600000),endsAt:time(7200000),opensAt:time(-10000),closesAt:time(1800000),cancelUntil:time(1800000),status:'open',fee:5000,capacity:20,registered:1,waiting:0,waitlist:true,questions:[],policy:'신청 안내',...extra});
const application=(id,status='registered',payment='unpaid')=>({application:{id,eventId:'event-'+id,name:'테스트 부원',status,payment,createdAt:time(-5000),offerExpiresAt:time(600000),paidAmount:0,refundAmount:0,fee:5000},event:event('event-'+id)});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const visitForm=()=>{const data=new FormData();for(const [key,value] of Object.entries({visitDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+2*86400000)),startTime:'18:00',guestCount:'2',guestNames:'PRIVATE OLD GUESTS',purpose:'PRIVATE OLD PURPOSE',consent:'on'}))data.set(key,value);return data;};
function serviceCards(html){
 const entries=[...html.matchAll(/<button\b[^>]*data-member-service="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
 assert.deepEqual(entries.map(match=>match[1]),['visits','events','partners']);
 const cards={};for(const match of entries){cards[match[1]]=match[0];assert.match(match[0],/aria-haspopup="dialog"/);assert.doesNotMatch(match[2],/<(?:button|a|input|select|details|summary)\b|member-(?:request|application)-row|data-action=/);}
 return cards;
}
function route(path){const url=new URL(path,'https://martini.test');Object.assign(location,{pathname:url.pathname,search:url.search,hash:url.hash,href:url.href,origin:url.origin});}
function assertLoginGate(html){
 assert.match(html,/data-form="member-login"/);assert.match(html,/<input\b[^>]*name="name"/);assert.match(html,/<input\b[^>]*name="studentId"/);
 assert.doesNotMatch(html,/<nav\b|member-event-directory|member-coupon-slot|class="member-event"|data-action="member-(?:visit|inquiry|request)"|name="phone"/);
}
function sectionDocument(){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),scrolls=[],focuses=[];
 const sections=Object.fromEntries(['home','events','applications','coupons','more','detail'].map(id=>['member-'+id,{scrollIntoView:options=>scrolls.push({id,options}),focus:()=>focuses.push(id),setAttribute:()=>{},getAttribute:()=>'-1'}]));
 const buttons=['home','events','applications','coupons','more'].map(id=>({dataset:{id},classList:{toggle:()=>{}},setAttribute:()=>{},removeAttribute:()=>{}}));
 globalThis.document={getElementById:id=>sections[id]||null,querySelector:selector=>selector.startsWith('#')?sections[selector.slice(1)]||null:null,querySelectorAll:()=>buttons};
 return {scrolls,focuses,restore:()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}};
}
// Exercise the actual dialog listeners without a browser. This host models form
// values and close events; browser focus/layout and native dialog behavior are not tested.
async function withDialogs(run){
 const previous=new Map(['document','window','CSS','FormData'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),NativeFormData=globalThis.FormData,dialogs=[];
 let template=null;
 class Element{
  constructor(tag='div'){this.tag=tag;this.innerHTML='';this.textContent='';this.style={};this.attrs=new Map();this.listeners=new Map();this.parts=new Map();this.dataset={};this.isConnected=true;this.entries=[];const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)||null;}
  removeAttribute(name){this.attrs.delete(name);}
  addEventListener(name,handler){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(handler);}
  fire(name,event={}){return Promise.all((this.listeners.get(name)||[]).map(handler=>handler({preventDefault(){},...event})));}
  focus(){document.activeElement=this;}
  matches(){return this.tag==='button';}
  closest(){return null;}
  getClientRects(){return [1];}
  getBoundingClientRect(){return {width:100};}
  scrollIntoView(){}
  after(node){this.parent.notice=node;node.parent=this.parent;}
  remove(){this.isConnected=false;if(this===template)template=null;if(this.parent?.notice===this)this.parent.notice=null;}
  showModal(){this.open=true;}
  close(){if(!this.open)return;this.open=false;this.fire('close');}
  querySelector(selector){
   if(selector==='form'&&!/<form\b/.test(this.innerHTML))return null;
   if(selector==='form[aria-busy=true]'){const form=this.querySelector('form');return form?.getAttribute('aria-busy')==='true'?form:null;}
   if(selector==='#discard-changes')return this.notice||null;
   if(!this.parts.has(selector)){const part=new Element(selector==='form'?'form':selector.includes('button')||selector==='[type=submit]'?'button':'div');part.parent=this;this.parts.set(selector,part);}
   return this.parts.get(selector);
  }
  querySelectorAll(selector){return selector==='[data-close]'?[this.querySelector('button.header-close'),this.querySelector('button.footer-close')]:[];}
 }
 const document={activeElement:null,body:new Element('body'),documentElement:new Element('html'),addEventListener(){},removeEventListener(){},querySelector(selector){
  if(selector==='#member-detail-content')return template;
  if(selector==='#modal')return dialogs.findLast(dialog=>dialog.isConnected)||null;
  if(['#modal[open]','dialog[open]'].includes(selector))return dialogs.findLast(dialog=>dialog.isConnected&&dialog.open)||null;
  return null;
 },querySelectorAll:()=>[],createElement:tag=>new Element(tag)};
 document.body.append=dialog=>dialogs.push(dialog);document.activeElement=document.body;
 class DialogFormData extends NativeFormData{constructor(form){super();for(const [key,value] of form?.entries||[])this.append(key,value);}}
 for(const [key,value] of Object.entries({document,window:{addEventListener(){},removeEventListener(){}},CSS:{supports:()=>true},FormData:DialogFormData}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const host={dialogs,document,setTemplate({kind,id,title='상세',body='<form data-form="apply"></form>'}){template=new Element('template');template.innerHTML=body;template.dataset={kind,id,title};return template;}};
 try{return await run(host);}
 finally{await Promise.resolve();for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
describe('member route views',{timeout:10000},()=>{
let values;
beforeEach(()=>{
 values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),get length(){return values.size;},key:index=>[...values.keys()][index]??null};
 globalThis.location={pathname:'/members',search:'',hash:'',href:'https://martini.test/members',origin:'https://martini.test'};
});
function context({events=[event('one')],requests=[],applications=[],verified=true,fail={}}={}){
 const calls=[],navigations=[],ctx={state:{},toast:()=>{},render:async()=>{},navigate:async(path)=>{navigations.push(path);route(path);return true;},api:async(op,data)=>{
  calls.push({op,data});if(fail[op])throw fail[op];
  if(op==='publicRead')return {content:[]};
  if(op==='memberPortal')return {member,events,requests,expiresAt:time(60000)};
  if(op==='memberApplications')return {applications,legacyAccessRequiresReceipt:true,expiresAt:time(60000)};
  if(op==='memberCoupons')return {available:true,stampCount:3,capacity:10,revision:1,expiresAt:time(60000)};
  if(op==='memberEventAccess'||op==='eventAccess')return event(data.eventId);
  if(op==='memberApplication'||op==='receipt')return application(data.id);
  if(op==='resolveLink')return {id:data.kind==='e'?'event-one':'request-one'};
  if(op==='memberAccess')return {member,expiresAt:time(60000)};
  if(op==='memberLogout')return {ok:true};
  throw Error('Unexpected API '+op);
 }};
 if(verified)setMemberSession(ctx,{sessionKey,member,expiresAt:time(60000)});
 return {ctx,calls,navigations};
}
async function view(section,options){
 const path=section==='home'?'/members':'/members/'+section;Object.assign(location,{pathname:path,href:location.origin+path});
 const data=context(options);return {...data,html:await renderMemberPortal(data.ctx,{section})};
}

test('the lounge renders exactly three popup card buttons with every application record below the grid',async()=>{
 const events=[event('four',{startsAt:time(4000000)}),event('three',{startsAt:time(3000000)}),event('two',{startsAt:time(2000000)}),event('one',{startsAt:time(1000000)})];
 const requests=[{id:'visit-one',kind:'visit',purpose:'private visit purpose',guestNames:'private guest',status:'pending'}];
 const {html,ctx,calls}=await view('home',{events,requests,applications:[application('needs-payment'),application('offer','offered','none'),application('paid','registered','paid'),application('wait','waiting','none')]});
 assert.match(html,/테스트 부원/);assert.equal((html.match(/<h1\b/g)||[]).length,1);
 const cards=serviceCards(html);
 for(const section of ['visits','events','partners','records','history','applications'])assert.equal((html.match(new RegExp('id="member-'+section+'"','g'))||[]).length,1,section);
 for(const [id,title] of [['visits','외부인 출입신청'],['events','행사'],['partners','제휴']])assert.match(cards[id],new RegExp(title));
 assert.equal((html.match(/data-action="member-event-open"/g)||[]).length,0);
 assert.equal((html.match(/data-action="member-application-open"/g)||[]).length,4);
 const choices=renderMemberEventChoices(ctx);
 for(const id of ['one','two','three','four'])assert.match(choices,new RegExp('data-action="member-event-open"[^>]*data-id="'+id+'"'));
 assert.ok(choices.indexOf('data-id="one"')<choices.indexOf('data-id="two"'));
 for(const name of ['visit','forget'])assert.match(html,new RegExp('data-action="member-'+name+'"'));
 for(const [id,action] of [['visits','visit'],['events','events'],['partners','partners']])assert.match(cards[id],new RegExp('data-action="member-'+action+'"'));
 const records=html.slice(html.indexOf('id="member-records"'));
 assert.ok(html.indexOf('id="member-records"')>html.indexOf(cards.partners)+cards.partners.length);
 assert.match(records,/data-action="member-request" data-id="visit-one"/);assert.match(records,/id="member-applications"/);assert.match(records,/<h3[^>]*>내 행사 신청<\/h3>/);
 assert.doesNotMatch(html,/등록된 제휴 정보/);
 assert.doesNotMatch(html,/<nav\b|<details\b|<summary\b|data-action="member-(?:section|inquiry)"|운영진에게 문의|member-home-grid|member-home-notices|member-home-coupon|member-coupons|data-coupon-state|준비 중|학기|지금 확인할 신청|다음 행사|href="\/notices"|private guest/);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);
});
test('private events stay out of the event popup and application history while legacy public events remain visible',async()=>{
 const privateApplication=application('private-request');privateApplication.event.memberVisible=false;
 const {html,ctx}=await view('home',{events:[event('legacy'),event('public',{memberVisible:true}),event('private',{memberVisible:false})],applications:[application('legacy-request'),privateApplication]});
 const choices=renderMemberEventChoices(ctx);
 for(const id of ['legacy','public'])assert.match(choices,new RegExp('data-action="member-event-open"[^>]*data-id="'+id+'"'));
 assert.doesNotMatch(choices,/data-id="private"|행사 private/);
 assert.match(html,/data-action="member-application-open"[^>]*data-id="legacy-request"/);
 assert.doesNotMatch(html,/private-request/);
 assert.deepEqual(memberState(ctx).events.map(row=>row.id),['legacy','public']);
 assert.deepEqual(memberState(ctx).applications.map(row=>row.application.id),['legacy-request']);
});

test('event applications and visit requests stay below all service cards without secret links or retired inquiry history',async()=>{
 const requests=[{id:'visit-one',kind:'visit',purpose:'테스트 방문',startsAt:time(1000000),createdAt:time(-10000),guestCount:2,status:'pending'},{id:'inquiry-one',kind:'inquiry',subject:'테스트 문의',createdAt:time(-9000),status:'answered'}];
 const {html}=await view('applications',{requests,applications:[application('event-request')]});
 const cards=serviceCards(html),records=html.slice(html.indexOf('id="member-records"'));assert.match(records,/id="member-applications"/);assert.match(records,/data-action="member-application-open"[^>]*data-id="event-request"/);
 assert.ok(html.indexOf('id="member-records"')>html.indexOf(cards.partners)+cards.partners.length);assert.match(records,/data-action="member-request" data-id="visit-one"/);assert.doesNotMatch(html,/inquiry-one|테스트 문의|출입 신청·문의/);
 assert.doesNotMatch(html,new RegExp(sessionKey+'|'+receiptKey));assert.doesNotMatch(html,/href="\/members\/applications\/event-request"/);
});
test('all three service cards remain visible when empty and refresh reloads their server status',async()=>{
 const {html,ctx,calls}=await view('applications',{events:[]});
 const cards=serviceCards(html);assert.match(cards.visits,/data-action="member-visit"/);assert.match(cards.events,/행사/);assert.match(cards.partners,/제휴/);
 assert.doesNotMatch(html,/data-action="member-section"|id="member-applications"|id="member-history"|진행 중인 행사 신청이 없어요/);
 assert.match(html,/id="member-records"/);assert.match(html,/신청 내역이 없습니다/);
 let renders=0;ctx.render=async()=>{renders++;};
 await memberPortalAction(ctx,'member-refresh');assert.equal(renders,1);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);
});

test('event and partner service buttons open dialogs without navigation or history rows and load partner stamps on demand',async()=>{
 const {ctx,calls,navigations}=await view('home',{applications:[application('one')],requests:[{id:'visit-one',kind:'visit',purpose:'내 방문',status:'pending'}]});
 const initialCalls=calls.length;
 await withDialogs(async({dialogs})=>{
  await publicAction(ctx,'member-events');const events=dialogs.at(-1);
  assert.ok(events.open);assert.ok(events.classList.contains('member-events-dialog'));assert.match(events.innerHTML,/data-action="member-event-open"/);assert.doesNotMatch(events.innerHTML,/member-application-row|member-request-row/);
  await events.requestClose();assert.equal(events.open,false);
  await publicAction(ctx,'member-partners');const partners=dialogs.at(-1);
  assert.ok(partners.open);assert.ok(partners.classList.contains('partner-dialog'));assert.match(partners.innerHTML,/<section class="partner-feelingfine" aria-labelledby="modal-title">[\s\S]*?class="partner-intro"[\s\S]*?<h2 id="modal-title" tabindex="-1">필링파인<\/h2>[\s\S]*?class="partner-benefits-copy"[\s\S]*?<div class="partner-coupon-area"><div data-partner-body/);
  assert.match(partners.innerHTML,/data-action="partner-reveal"[^>]*>[\s\S]*내 스탬프 보기/);assert.doesNotMatch(partners.innerHTML,/FeelingFineCoupon|data-action="partner-qr"|partner-benefit-heading|partner-coupon-title|partner-information|안내 준비 중|member-application-row|member-request-row|data-action="member-event-open"/);
  assert.equal(calls.length,initialCalls);await publicAction(ctx,'partner-qr');assert.equal(calls.length,initialCalls);
  await publicAction(ctx,'partner-reveal');assert.match(partners.querySelector('[data-partner-body]').innerHTML,/data-action="partner-qr" aria-label="QR 표시"><i data-lucide="qr-code"/);
  assert.equal((partners.innerHTML.match(/<h2\b/g)||[]).length,1);const partnerHeader=partners.innerHTML.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];assert.ok(partnerHeader);assert.doesNotMatch(partnerHeader,/<h2\b/);
  await partners.requestClose();assert.equal(partners.open,false);
 });
 assert.equal(calls.length,initialCalls+1);assert.equal(calls.at(-1).op,'memberCoupons');assert.deepEqual(navigations,[]);assert.equal(location.pathname,'/members');
});

test('service popup switching respects an unsaved form and does not clear its selection when leaving is declined',async()=>{
 const {ctx,calls}=context(),selection={kind:'event',id:'one'};ctx.state.memberInlineDetail=selection;ctx.mayLeave=async()=>false;
 await withDialogs(async({dialogs})=>{
  for(const action of ['member-events','member-partners','member-visit'])await publicAction(ctx,action);
  assert.deepEqual(dialogs,[]);assert.equal(ctx.state.memberInlineDetail,selection);assert.deepEqual(calls,[]);
 });
});

test('a popup containing an application form preserves dirty input and cannot close while saving',async()=>{
 await withDialogs(async()=>{
  const dialog=modal('행사 상세','<form data-form="apply"><input name="answer"></form>',null,{contentOnly:true});
  await Promise.resolve();const form=dialog.querySelector('form');
  assert.equal((dialog.innerHTML.match(/<form\b/g)||[]).length,1);assert.doesNotMatch(dialog.innerHTML,/id="modal-form"/);assert.equal(form.listeners.has('submit'),false);
  form.entries=[['answer','작성 중']];assert.equal(dialog.isDirty(),true);
  let closing=dialog.requestClose();assert.ok(dialog.open);assert.equal(dialog.querySelector('.dialog-scroll').inert,true);
  dialog.querySelector('#discard-changes').querySelector('[data-keep-editing]').onclick();assert.equal(await closing,false);assert.ok(dialog.open);assert.equal(dialog.querySelector('.dialog-scroll').inert,false);assert.deepEqual(form.entries,[['answer','작성 중']]);
  form.setAttribute('aria-busy','true');assert.equal(dialog.isSaving(),true);assert.equal(await dialog.requestClose(),false);assert.equal(dialog.querySelector('#discard-changes'),null);assert.match(dialog.querySelector('.dialog-status').textContent,/처리 중/);
  form.removeAttribute('aria-busy');closing=dialog.requestClose();dialog.querySelector('#discard-changes').querySelector('[data-discard-editing]').onclick();assert.equal(await closing,true);assert.equal(dialog.open,false);
 });
});

test('wrapped visit forms retain submit handling and reject dismissal until the request completes',async()=>{
 const {ctx}=context(),response=deferred();let payload;
 ctx.api=async(op,data)=>{assert.equal(op,'submitClubRequest');payload=data;return response.promise;};
 await withDialogs(async()=>{
  const dialog=modal('외부인 출입 신청','<input name="purpose">',(data,node)=>memberPortalSubmit(ctx,'member-visit',data,node));
  await Promise.resolve();const form=dialog.querySelector('form');form.entries=[...visitForm()];
  const submission=form.fire('submit');assert.equal(payload.kind,'visit');assert.equal(payload.guestCount,2);assert.equal(dialog.isSaving(),true);assert.equal(await dialog.requestClose(),false);assert.ok(dialog.open);
  response.resolve({id:'visit-created',request:{id:'visit-created',kind:'visit',purpose:'방문'}});await submission;
  assert.equal(dialog.open,false);assert.equal(memberState(ctx).lastReceiptId,'visit-created');assert.equal(memberStorage(ctx).receipts[0].id,'visit-created');
 });
});

test('popup template mounting consumes the template and clears only the explicitly closed selection',async()=>{
 const {ctx}=context(),selection={kind:'event',id:'one'};ctx.state.memberInlineDetail=selection;ctx.state.currentEvent=event('one');
 await withDialogs(async host=>{
  host.setTemplate({kind:'event',id:'one'});const first=mountMemberDetail(ctx);
  assert.ok(first.open);assert.ok(first.classList.contains('member-detail-dialog'));assert.equal(host.document.querySelector('#member-detail-content'),null);assert.equal(ctx.state.memberInlineDetail,selection);
  const replacement=modal('확인','<p>신청 내용을 확인하세요.</p>',null);assert.equal(first.replaced,true);assert.equal(ctx.state.memberInlineDetail,selection);await replacement.requestClose();
  host.setTemplate({kind:'event',id:'one'});const reopened=mountMemberDetail(ctx);await reopened.requestClose();assert.equal(ctx.state.memberInlineDetail,undefined);assert.equal(ctx.state.currentEvent,undefined);
  ctx.state.memberInlineDetail=selection;host.setTemplate({kind:'event',id:'one'});const old=mountMemberDetail(ctx);ctx.state.memberInlineDetail={kind:'application',id:'new-result'};await old.requestClose();assert.deepEqual(ctx.state.memberInlineDetail,{kind:'application',id:'new-result'});
 });
});

test('stale or logged-out popup templates never mount a dialog',async()=>{
 for(const change of ['different-selection','logout']){
  const {ctx}=context();ctx.state.memberInlineDetail={kind:'event',id:'new'};
  if(change==='logout')forgetMemberDevice(ctx);
  await withDialogs(async host=>{host.setTemplate({kind:'event',id:'old'});assert.equal(mountMemberDetail(ctx),undefined);assert.deepEqual(host.dialogs,[]);assert.equal(host.document.querySelector('#member-detail-content'),null);});
 }
});

test('a direct receipt command blocks popup dismissal until its API request finishes or fails',async()=>{
 for(const failure of [false,true]){
  const {ctx}=context(),selection={kind:'application',id:'request-one'},response=deferred();ctx.state.memberInlineDetail=selection;
  const body=await renderApplicationPage(ctx,'request-one',{member:true,embedded:true});let renders=0;ctx.render=async()=>{renders++;};
  await withDialogs(async host=>{
   host.setTemplate({...selection,body});const dialog=mountMemberDetail(ctx);
   ctx.api=async(op,data)=>{assert.equal(op,'memberApplication');assert.equal(data.action,'accept');return response.promise;};
   const command=eventAction(ctx,'receipt-accept');assert.equal(dialog.isSaving(),true);assert.equal(await dialog.requestClose(),false);assert.ok(dialog.open);assert.equal(ctx.state.memberInlineDetail,selection);
   if(failure){const rejected=assert.rejects(command,/Temporary failure/);response.reject(new Error('Temporary failure'));await rejected;}else{response.resolve({});await command;}
   assert.equal(dialog.isSaving(),false);assert.equal(dialog.pendingRequest,false);assert.equal(renders,failure?0:1);await dialog.requestClose();assert.equal(dialog.open,false);
  });
 }
});

test('closing a receipt confirmation restores its detail popup without losing the selected application',async()=>{
 const {ctx}=context(),selection={kind:'application',id:'request-one'};ctx.state.memberInlineDetail=selection;
 const body=await renderApplicationPage(ctx,'request-one',{member:true,embedded:true});let renders=0;
 await withDialogs(async host=>{
  host.setTemplate({...selection,body});const detail=mountMemberDetail(ctx);
  ctx.render=async()=>{renders++;host.setTemplate({...selection,body});mountMemberDetail(ctx);};
  const confirmation=await eventAction(ctx,'receipt-payment');assert.equal(detail.replaced,true);assert.equal(ctx.state.memberInlineDetail,selection);assert.ok(confirmation.open);
  await confirmation.requestClose();assert.equal(renders,1);const restored=host.dialogs.at(-1);assert.ok(restored.classList.contains('member-detail-dialog'));assert.ok(restored.open);assert.equal(ctx.state.memberInlineDetail,selection);
  await restored.requestClose();assert.equal(ctx.state.memberInlineDetail,undefined);
 });
});
test('visit and logout remain directly available while the inquiry form and help section are removed',async()=>{
 const {html}=await view('more');
 for(const name of ['visit','forget'])assert.match(html,new RegExp('data-action="member-'+name+'"'));
 assert.equal((html.match(/테스트 부원/g)||[]).length,1);
 assert.doesNotMatch(html,/href="\/(?:notices|members\/applications)"|data-action="member-(?:section|inquiry)"|운영진에게 문의|id="member-more"|마티니 홈페이지|로그인 중|학기/);
});
test('the retired coupon URL still requires login and shows useful lounge content without a coupon placeholder or fetch',async()=>{
 const anonymous=await view('coupons',{verified:false});assertLoginGate(anonymous.html);assert.deepEqual(anonymous.calls,[]);
 const verified=await view('coupons');assert.match(verified.html,/id="member-events"/);assert.match(verified.html,/data-action="member-visit"/);
 assert.doesNotMatch(verified.html,/쿠폰|준비 중|data-coupon-state|data-action="(?:coupon|member-coupon)|\b0\s*\/\s*10\b|\bQR\b/);
 assert.deepEqual(verified.calls.map(call=>call.op),['memberPortal','memberApplications']);
});

test('all supported lounge aliases return the same complete sections and never load public notices',async()=>{
 for(const path of ['/members','/members/events','/members/applications','/members/coupons','/members/more','/events']){
  values.clear();route(path);const {ctx,calls}=context({applications:[application('one')],requests:[{id:'one',kind:'inquiry',subject:'문의 내역',status:'answered'}]});const html=await renderPublic(ctx);
  for(const section of ['visits','events','partners','applications'])assert.equal((html.match(new RegExp('id="member-'+section+'"','g'))||[]).length,1,path+' '+section);
  serviceCards(html);assert.doesNotMatch(html,/문의 내역|data-action="member-inquiry"/);
  assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);assert.doesNotMatch(html,/href="\/notices"|member-home-notices|member-navigation|data-action="member-section"|class="[^\"]*member-header-link/);
  assert.equal(ctx.state.memberScrollTarget,undefined,path);assert.equal(ctx.state.memberActiveSection,undefined,path);
 }
});

test('current and past application records are visible below the cards while all event choices belong to the popup',async()=>{
 const past=event('past-event',{startsAt:time(-7200000),endsAt:time(-3600000),status:'closed'});
 const pastApplication={...application('past-application','cancelled'),event:past};
 const requests=[{id:'pending-request',kind:'visit',purpose:'승인 대기 방문',startsAt:time(1000000),status:'pending',createdAt:time(-1000)},{id:'past-request',kind:'visit',purpose:'취소한 방문',status:'cancelled',createdAt:time(-2000)}];
 const {html,ctx}=await view('home',{events:[event('current-event'),past],applications:[application('current-application'),pastApplication],requests});
 const choices=renderMemberEventChoices(ctx);
 for(const id of ['current-event','past-event'])assert.match(choices,new RegExp('data-action="member-event-open"[^>]*data-id="'+id+'"'));
 assert.doesNotMatch(html,/data-action="member-event-open"/);
 for(const id of ['current-application','past-application'])assert.match(html,new RegExp('data-action="member-application-open"[^>]*data-id="'+id+'"'));
 for(const id of ['pending-request','past-request'])assert.match(html,new RegExp('data-action="member-request"[^>]*data-id="'+id+'"'));
 assert.doesNotMatch(html,/<details\b|<summary\b|\shidden(?:\s|=|>)|aria-hidden="true"[^>]*class="(?:member-section|member-event)|data-action="member-section"/);
 assert.ok(choices.indexOf('data-id="current-event"')<choices.indexOf('data-id="past-event"'));
 assert.ok(html.indexOf('data-id="current-application"')<html.indexOf('data-id="past-application"'));
 assert.ok(html.indexOf('data-id="pending-request"')<html.indexOf('data-id="past-request"'));
});

test('popup detail controls change only the selected record and respect unsaved form navigation checks',async()=>{
 const {ctx,calls,navigations}=context(),dom=sectionDocument();let renders=0;ctx.render=async()=>{renders++;};
 try{
  ctx.mayLeave=async()=>false;await publicAction(ctx,'member-event-open','event-one');assert.equal(ctx.state.memberInlineDetail,undefined);assert.equal(renders,0);
  ctx.mayLeave=async()=>true;await publicAction(ctx,'member-event-open','event-one');assert.deepEqual(ctx.state.memberInlineDetail,{kind:'event',id:'event-one'});
  await publicAction(ctx,'member-application-open','request-one');assert.deepEqual(ctx.state.memberInlineDetail,{kind:'application',id:'request-one'});
  await publicAction(ctx,'member-detail-close');assert.equal(ctx.state.memberInlineDetail,undefined);
  assert.equal(renders,3);assert.deepEqual(navigations,[]);assert.deepEqual(calls,[]);assert.equal(location.pathname,'/members');
 }finally{dom.restore();}
});

test('legacy detail URLs prepare one inert popup template and do not reopen it after closing',async()=>{
 for(const [path,kind,id,op] of [['/members/events/event-one','event','event-one','memberEventAccess'],['/members/applications/request-one','application','request-one','memberApplication']]){
  values.clear();route(path);const {ctx,calls}=context(),dom=sectionDocument();
  try{
   const html=await renderPublic(ctx);assert.deepEqual(ctx.state.memberInlineDetail,{kind,id});assert.ok(calls.findIndex(call=>call.op==='memberPortal')<calls.findIndex(call=>call.op===op));
   assert.match(html,/<template\b[^>]*id="member-detail-content"[^>]*>[\s\S]*<\/template>/);assert.doesNotMatch(html,/<section\b[^>]*class="member-inline-detail"/);assert.equal(ctx.state.memberScrollTarget,undefined);
   assert.equal((html.match(/class="member-shell"/g)||[]).length,1);assert.doesNotMatch(html,/aria-label="부원 메뉴"|<!--member-inline-detail-->/);
   await publicAction(ctx,'member-detail-close');calls.length=0;await renderPublic(ctx);assert.equal(ctx.state.memberInlineDetail,undefined);assert.equal(calls.some(call=>call.op===op),false);
  }finally{dom.restore();}
 }
});
test('transient member API failure offers retry while retaining the verified session',async()=>{
 const unavailable={code:'functions/unavailable',message:'transient'};
 const {html,ctx}=await view('applications',{fail:{memberPortal:unavailable,memberApplications:unavailable,memberCoupons:unavailable}});
 assert.match(html,/다시 (?:불러오기|시도)/);assert.match(html,/잠시 후 다시 시도/);assert.equal(getMemberSessionKey(ctx),sessionKey);assert.doesNotMatch(html,/<nav\b|data-action="member-verify"|확인이 만료|class="member-event"/);
});
test('server session rejection clears member identity and offers verification on the same route',async()=>{
 const {html,ctx}=await view('events',{fail:{memberPortal:{code:'functions/unauthenticated'}}});
 assert.equal(getMemberSessionKey(ctx),'');assert.equal(memberState(ctx).member,null);assert.match(html,/만료|변경/);assertLoginGate(html);assert.equal(ctx.state.memberVerificationReturnTo,'/members/events');
});
test('verification gate retains a safe event deep link and does not expose capability fragments',()=>{
 const {ctx}=context({verified:false});const html=renderMemberVerificationGate(ctx,{returnTo:'/members/events/event-one#private',title:'부원 확인이 필요합니다'});
 assert.equal(ctx.state.memberVerificationReturnTo,'/members/events/event-one');assertLoginGate(html);assert.doesNotMatch(html,/#private/);
 renderMemberVerificationGate(ctx,{returnTo:'https://example.com'});assert.equal(ctx.state.memberVerificationReturnTo,'/members');
});
test('legacy lounge receipt fragments cannot bypass login or trigger a private API request',async()=>{
 const {ctx}=context({verified:false});Object.assign(location,{hash:'#request=legacy-join&key='+receiptKey,href:location.href+'#request=legacy-join&key='+receiptKey});
 const original=ctx.api;
 let receiptReads=0;ctx.api=async(op,data)=>{if(op==='clubRequestReceipt')receiptReads++;return original(op,data);};
 const html=await renderMemberPortal(ctx);assertLoginGate(html);assert.equal(receiptReads,0);assert.deepEqual(memberStorage(ctx).receipts,[]);assert.doesNotMatch(html,new RegExp(receiptKey));assert.doesNotMatch(html,/legacy private message/);
});
test('session-only request opening revalidates membership and never opens stale cached records',async()=>{
 const {ctx,calls}=context({requests:[]});memberState(ctx).requests=[{id:'stale-request',kind:'inquiry',subject:'private cached subject',status:'pending'}];
 await assert.rejects(memberPortalAction(ctx,'member-request','stale-request'),/신청 내역을 찾을 수 없습니다/);assert.ok(calls.some(call=>call.op==='memberPortal'));assert.deepEqual(memberState(ctx).requests,[]);
});
test('late request validation cannot open a detail or verification dialog on another route',async()=>{
 const {ctx}=context();ctx.api=async()=>{Object.assign(location,{pathname:'/notices',href:location.origin+'/notices'});return {member,requests:[{id:'late-request',kind:'inquiry',subject:'late private data'}],expiresAt:time(60000)};};
 assert.equal(await memberPortalAction(ctx,'member-request','late-request'),undefined);assert.deepEqual(memberState(ctx).requests,[]);
 Object.assign(location,{pathname:'/members/applications',href:location.origin+'/members/applications'});
 ctx.api=async()=>{Object.assign(location,{pathname:'/notices',href:location.origin+'/notices'});throw {code:'functions/unauthenticated'};};
 assert.equal(await memberPortalAction(ctx,'member-request','late-request'),undefined);assert.equal(getMemberSessionKey(ctx),sessionKey);
});

test('every lounge route and the events alias are a direct login gate with zero API calls before login',async()=>{
 for(const path of ['/members','/members/','/members/events','/members/applications','/members/coupons','/members/more','/members/events/event-one','/members/applications/request-one','/members/unknown/child','/events','/events/']){
  values.clear();route(path+'#request=legacy-request&key='+receiptKey);
  const {ctx,calls}=context({verified:false});
  memberStorage(ctx).receipts=[{id:'legacy-request',receiptKey}];memberStorage(ctx).pending={visit:{requestId:'pending-visit',receiptKey}};
  Object.assign(memberState(ctx),{member:{name:'OLD PRIVATE NAME'},events:[event('old')],requests:[{id:'old',subject:'OLD PRIVATE REQUEST'}],receiptRows:[{id:'legacy-request',subject:'OLD PRIVATE RECEIPT'}]});
  const html=await renderPublic(ctx);assertLoginGate(html);assert.deepEqual(calls,[],path);
  assert.doesNotMatch(html,/OLD PRIVATE|행사 old/);assert.doesNotMatch(html,new RegExp(receiptKey));
 }
});

test('a locally stored unexpired token must pass server validation before any secondary or receipt query',async()=>{
 const barrier=deferred(),{ctx,calls}=context(),base=ctx.api;route('/members/applications');
 const view=memberState(ctx);Object.assign(view,{requests:[{id:'old',subject:'OLD PRIVATE REQUEST'}],receiptRows:[{id:'old-receipt',subject:'OLD PRIVATE RECEIPT'}]});
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 ctx.api=async(op,data)=>{if(op==='memberPortal'){calls.push({op,data});return barrier.promise;}return base(op,data);};
 const pending=renderMemberPortal(ctx,{section:'applications'});
 assert.deepEqual(calls.map(call=>call.op),['memberPortal']);
 barrier.reject({code:'functions/permission-denied'});
 const html=await pending;assertLoginGate(html);assert.deepEqual(calls.map(call=>call.op),['memberPortal']);
 assert.equal(getMemberSessionKey(ctx),'');assert.deepEqual(view.receiptRows,[]);assert.doesNotMatch(html,/OLD PRIVATE/);
});

test('transient primary validation failures reveal no cached member content and never fetch receipts',async()=>{
 const {ctx,calls}=context({fail:{memberPortal:{code:'functions/unavailable'}}});route('/members/applications');
 Object.assign(memberState(ctx),{events:[event('PRIVATE')],requests:[{id:'old',subject:'PRIVATE REQUEST'}],applications:[application('PRIVATE')],receiptRows:[{id:'old-receipt',subject:'PRIVATE RECEIPT'}]});
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 const html=await renderMemberPortal(ctx,{section:'applications'});
 assert.match(html,/다시 (?:불러오기|시도)/);assert.doesNotMatch(html,/<nav\b|PRIVATE|테스트 부원|class="member-event"/);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal']);assert.equal(getMemberSessionKey(ctx),sessionKey);
});

test('login requests a remembered session with name and student ID and waits for the verified server response',async()=>{
 route('/members/events/event-one');const {ctx,calls,navigations}=context({verified:false}),barrier=deferred();
 renderMemberVerificationGate(ctx,{returnTo:location.pathname});
 ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};
 const form=new FormData();form.set('name','  테스트 부원  ');form.set('studentId','  2026001  ');
 const pending=memberPortalSubmit(ctx,'member-login',form);
 assert.equal(calls.length,1);assert.equal(calls[0].op,'memberAccess');
 assert.deepEqual(Object.keys(calls[0].data).sort(),['name','remember','sessionKey','studentId']);assert.equal(calls[0].data.name,'테스트 부원');assert.equal(calls[0].data.studentId,'2026001');assert.equal(calls[0].data.remember,true);
 assert.equal(getMemberSessionKey(ctx),'');assert.match(calls[0].data.sessionKey,/^[a-f0-9]{64}$/);
 barrier.resolve({member,expiresAt:time(60000)});await pending;
 assert.equal(getMemberSessionKey(ctx),calls[0].data.sessionKey);assert.equal(memberState(ctx).member.name,member.name);
 assert.ok(navigations.length===0||navigations.every(path=>path==='/members/events/event-one'));
 const stored=values.get(MEMBER_STORAGE_KEY);assert.doesNotMatch(stored,/테스트 부원|2026001/);
});

test('logout revokes only the current capability and clears local identity even if server revocation fails',async()=>{
 for(const failure of [false,true]){
  const {ctx,calls,navigations}=context({fail:failure?{memberLogout:{code:'functions/unavailable'}}:{}});memberState(ctx).requests=[{id:'private-request'}];ctx.state.currentEvent={id:'private-event'};
  await memberPortalAction(ctx,'member-forget');
  assert.deepEqual(calls,[{op:'memberLogout',data:{sessionKey}}]);assert.equal(getMemberSessionKey(ctx),'');assert.equal(memberState(ctx).member,null);assert.deepEqual(memberState(ctx).requests,[]);assert.equal(ctx.state.currentEvent,undefined);assert.deepEqual(navigations,['/members']);
 }
});

test('a rejected login cannot establish a client session or expose previous cached content',async()=>{
 const {ctx,calls}=context({verified:false,fail:{memberAccess:{code:'functions/permission-denied'}}});
 const form=new FormData();form.set('name','존재하지 않는 부원');form.set('studentId','wrong');
 await assert.rejects(memberPortalSubmit(ctx,'member-login',form),/부원|이름|학번/);
 assert.equal(getMemberSessionKey(ctx),'');assert.deepEqual(calls.map(call=>call.op),['memberAccess']);
 assertLoginGate(await renderMemberPortal(ctx));
});

test('successful login retains a legacy inquiry receipt recovery banner without listing retired inquiry history',async()=>{
 route('/members#request=legacy-request&key='+receiptKey);const {ctx,calls,navigations}=context({verified:false}),base=ctx.api;
 ctx.api=async(op,data)=>{if(op==='clubRequestReceipt'){calls.push({op,data});return {request:{id:'legacy-request',kind:'inquiry',subject:'기존 문의',status:'answered',createdAt:time(-10000)}};}return base(op,data);};
 assertLoginGate(await renderMemberPortal(ctx));assert.deepEqual(calls,[]);
 const form=new FormData();form.set('name','테스트 부원');form.set('studentId','2026001');await memberPortalSubmit(ctx,'member-login',form);
 assert.deepEqual(navigations,[]);assert.equal(location.pathname,'/members');
 const html=await renderMemberPortal(ctx,{section:'applications'});assert.match(html,/개인 확인 링크의 신청을 불러왔습니다/);assert.match(html,/data-action="member-request" data-id="legacy-request"/);assert.doesNotMatch(html,/기존 문의|data-action="member-inquiry"/);assert.doesNotMatch(html,new RegExp(receiptKey));assert.deepEqual(memberStorage(ctx).receipts,[{id:'legacy-request',receiptKey}]);
 assert.equal(memberState(ctx).receiptRows[0]?.subject,'기존 문의');
 assert.ok(calls.findIndex(call=>call.op==='memberPortal')<calls.findIndex(call=>call.op==='clubRequestReceipt'));
});

test('anonymous lounge actions and visit submission cannot bypass the page login gate',async()=>{
 const {ctx,calls}=context({verified:false});memberStorage(ctx).receipts=[{id:'legacy-request',receiptKey}];
 for(const action of ['member-inquiry','member-visit','member-events','member-partners','member-request'])await memberPortalAction(ctx,action,'legacy-request');
 await assert.rejects(memberPortalSubmit(ctx,'member-visit',visitForm()),/로그인/);assert.deepEqual(calls,[]);
});

test('retired inquiry actions and submissions are inert even for a verified member',async()=>{
 for(const verified of [false,true]){
  const {ctx,calls}=context({verified});let renders=0;ctx.render=async()=>{renders++;};
  const form=new FormData();form.set('subject','inquiry title');form.set('message','inquiry body');form.set('consent','on');
  await memberPortalAction(ctx,'member-inquiry');await memberPortalSubmit(ctx,'member-inquiry',form);
  assert.deepEqual(calls,[]);assert.equal(memberStorage(ctx).pending.inquiry,undefined);assert.deepEqual(memberState(ctx).receiptRows,[]);
  if(verified)assert.equal(renders,0);
 }
});

test('late login results cannot establish a session after leaving the login page or logging out',async()=>{
 for(const change of ['route','logout']){
  values.clear();route('/members');const {ctx,calls}=context({verified:false}),barrier=deferred();
  ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};const form=new FormData();form.set('name','테스트 부원');form.set('studentId','2026001');
  const pending=memberPortalSubmit(ctx,'member-login',form);
  assert.equal(calls[0]?.op,'memberAccess');
  if(change==='route')route('/notices');else forgetMemberDevice(ctx);
  barrier.resolve({member,expiresAt:time(60000)});await pending;assert.equal(getMemberSessionKey(ctx),'',change);
 }
});

test('late lounge validation results are discarded when a different member logs in or exits',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members');const {ctx}=context(),barrier=deferred(),base=ctx.api;
  ctx.api=(op,data)=>op==='memberPortal'?barrier.promise:base(op,data);
  const pending=renderMemberPortal(ctx);
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({member:{name:'OLD PRIVATE NAME'},events:[event('OLD-PRIVATE')],requests:[],expiresAt:time(60000)});
  const html=await pending;assert.doesNotMatch(html,/OLD PRIVATE|OLD-PRIVATE/);assert.deepEqual(memberState(ctx).events,[]);
  assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
 }
});

test('late legacy receipt responses cannot enter a replacement member session',async()=>{
 route('/members/applications');const {ctx}=context(),barrier=deferred(),started=deferred(),base=ctx.api;
 memberStorage(ctx).receipts=[{id:'old-receipt',receiptKey}];
 ctx.api=(op,data)=>{if(op==='clubRequestReceipt'){started.resolve();return barrier.promise;}return base(op,data);};
 const pending=renderMemberPortal(ctx,{section:'applications'});await started.promise;
 setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});
 barrier.resolve({request:{id:'old-receipt',kind:'inquiry',subject:'OLD PRIVATE RECEIPT',createdAt:time(-10000),status:'answered'}});
 const html=await pending;assert.doesNotMatch(html,/OLD PRIVATE/);assert.deepEqual(memberState(ctx).receiptRows,[]);assert.equal(getMemberSessionKey(ctx),'c'.repeat(64));
});

test('member detail pages gate without API access and clear rejected sessions without fetching public capabilities',async()=>{
 for(const [renderer,path,id] of [[renderEventPage,'/members/events/event-one','event-one'],[renderApplicationPage,'/members/applications/request-one','request-one']]){
  values.clear();route(path);let current=context({verified:false});assertLoginGate(await renderer(current.ctx,id,{member:true}));assert.deepEqual(current.calls,[]);
  current=context({fail:{memberEventAccess:{code:'functions/permission-denied'},memberApplication:{code:'functions/unauthenticated'}}});
  assertLoginGate(await renderer(current.ctx,id,{member:true}));assert.equal(getMemberSessionKey(current.ctx),'');assert.equal(current.calls.length,1);assert.ok(current.calls[0].op.startsWith('member'));
 }
});

test('member detail validation outages show retry without revealing the lounge navigation or cached details',async()=>{
 for(const [renderer,path,id] of [[renderEventPage,'/members/events/event-one','event-one'],[renderApplicationPage,'/members/applications/request-one','request-one']]){
  values.clear();route(path);const {ctx,calls}=context({fail:{memberEventAccess:{code:'functions/unavailable'},memberApplication:{code:'functions/unavailable'}}});
  Object.assign(ctx.state,{currentEvent:{title:'OLD PRIVATE EVENT'},currentReceipt:{application:{name:'OLD PRIVATE MEMBER'}}});
  const html=await renderer(ctx,id,{member:true});assert.match(html,/다시 불러오기/);assert.doesNotMatch(html,/<nav\b|OLD PRIVATE|data-form="apply"|class="receipt-card"/);
  assert.equal(calls.length,1);assert.equal(getMemberSessionKey(ctx),sessionKey);
 }
});

test('embedded event and application details contain only their panel content without duplicate page navigation',async()=>{
 for(const [renderer,kind,id] of [[renderEventPage,'event','event-one'],[renderApplicationPage,'application','request-one']]){
  values.clear();route('/members');const {ctx}=context();ctx.state.memberInlineDetail={kind,id};
  const html=await renderer(ctx,id,{member:true,embedded:true});
  assert.doesNotMatch(html,/class="member-shell"|aria-label="부원 메뉴"|public-header|public-footer|<main\b/);assert.match(html,new RegExp(kind==='event'?'data-form="apply"':'class="receipt-card"'));
 }
});

test('closing or switching a popup discards its late detail response without clearing the current login',async()=>{
 for(const [renderer,kind,id,stateKey,result] of [[renderEventPage,'event','event-one','currentEvent',event('event-one')],[renderApplicationPage,'application','request-one','currentReceipt',application('request-one')]]){
  for(const change of ['close','switch'])for(const rejected of [false,true]){
   values.clear();route('/members');const {ctx}=context(),barrier=deferred();ctx.state.memberInlineDetail={kind,id};ctx.api=async()=>barrier.promise;
   const pending=renderer(ctx,id,{member:true,embedded:true});
   if(change==='close')delete ctx.state.memberInlineDetail;else ctx.state.memberInlineDetail={kind,id:'other-record'};
   if(rejected)barrier.reject({code:'functions/unauthenticated'});else barrier.resolve(result);
   assert.equal(await pending,'');assert.equal(ctx.state[stateKey],undefined);assert.equal(getMemberSessionKey(ctx),sessionKey);
  }
 }
});

test('late member detail successes and rejections cannot restore or clear a different session',async()=>{
 for(const [renderer,path,id,stateKey,response] of [[renderEventPage,'/members/events/event-one','event-one','currentEvent',event('event-one')],[renderApplicationPage,'/members/applications/request-one','request-one','currentReceipt',application('request-one')]]){
  for(const change of ['replacement','logout'])for(const rejected of [false,true]){
   values.clear();route(path);const {ctx}=context(),barrier=deferred();ctx.api=async()=>barrier.promise;
   const pending=renderer(ctx,id,{member:true});
   if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
   if(rejected)barrier.reject({code:'functions/unauthenticated'});else barrier.resolve(response);
   assert.equal(await pending,'');assert.equal(ctx.state[stateKey],undefined);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
  }
 }
});

test('independent e and r share links retain capability access without a member session',async()=>{
 for(const path of ['/e/event-one#'+receiptKey,'/r/request-one#'+receiptKey,'/e#'+receiptKey,'/r#'+receiptKey]){
  values.clear();route(path);const {ctx,calls}=context({verified:false});const html=await renderPublic(ctx);
  assert.doesNotMatch(html,/data-form="member-login"/);assert.equal(calls.some(call=>call.op.startsWith('member')),false);assert.ok(calls.some(call=>['eventAccess','receipt'].includes(call.op)));
 }
});

test('late visit submissions do not insert old private records or rerender after identity changes',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members/more');const {ctx,calls}=context(),barrier=deferred();let renders=0;
  ctx.render=async()=>{renders++;};ctx.api=async(op,data)=>{calls.push({op,data});return barrier.promise;};
  const pending=memberPortalSubmit(ctx,'member-visit',visitForm());assert.equal(calls[0]?.op,'submitClubRequest');assert.equal(calls[0].data.kind,'visit');assert.equal(calls[0].data.sessionKey,sessionKey);
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({id:'old-request',request:{id:'old-request',kind:'visit',guestNames:'PRIVATE OLD GUESTS',purpose:'PRIVATE OLD PURPOSE'}});
  await pending;assert.deepEqual(memberState(ctx).receiptRows,[]);assert.equal(renders,0);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
  if(change==='logout')assert.deepEqual(memberStorage(ctx).receipts,[]);
 }
});

test('late event submissions do not navigate or recreate private state after identity changes',async()=>{
 for(const change of ['replacement','logout']){
  values.clear();route('/members/events/event-one');const {ctx,navigations}=context(),barrier=deferred(),started=deferred();
  ctx.state.currentEvent={...event('event-one'),memberAccess:true,accessUrl:location.href};
  ctx.api=async(op)=>{assert.equal(op,'apply');started.resolve();return barrier.promise;};
  const form=new FormData();form.set('consent','on');const pending=eventSubmit(ctx,'apply',form);await started.promise;
  if(change==='replacement')setMemberSession(ctx,{sessionKey:'c'.repeat(64),member:{name:'NEXT MEMBER'},expiresAt:time(60000)});else forgetMemberDevice(ctx);
  barrier.resolve({id:'old-private-application'});await pending;
  assert.deepEqual(navigations,[]);assert.equal(ctx.state.currentEvent,undefined);assert.equal(ctx.state.currentReceipt,undefined);assert.equal(getMemberSessionKey(ctx),change==='replacement'?'c'.repeat(64):'');
 }
});

test('an event application opens its result popup on the same page without route navigation',async()=>{
 route('/members');const {ctx,navigations}=context();ctx.state.memberInlineDetail={kind:'event',id:'event-one'};
 await renderEventPage(ctx,'event-one',{member:true,embedded:true});let renders=0;
 ctx.render=async()=>{renders++;};ctx.api=async(op,data)=>{assert.equal(op,'apply');assert.equal(data.sessionKey,sessionKey);return {id:'created-application'};};
 const form=new FormData();form.set('consent','on');await eventSubmit(ctx,'apply',form);
 assert.deepEqual(ctx.state.memberInlineDetail,{kind:'application',id:'created-application'});assert.equal(renders,1);assert.deepEqual(navigations,[]);assert.equal(location.pathname,'/members');
});

test('late receipt commands do not refresh or announce an earlier session result',async()=>{
 route('/members/applications/request-one');const {ctx}=context(),barrier=deferred();let renders=0,toasts=0;
 ctx.state.currentReceipt={...application('request-one','offered','none'),id:'request-one',memberAccess:true,accessUrl:location.href};
 ctx.api=async()=>barrier.promise;ctx.render=async()=>{renders++;};ctx.toast=()=>{toasts++;};
 const pending=eventAction(ctx,'receipt-accept');forgetMemberDevice(ctx);barrier.resolve({});await pending;
 assert.equal(renders,0);assert.equal(toasts,0);assert.equal(getMemberSessionKey(ctx),'');
});

test('member application recovery links are collapsed after the main status actions',async()=>{
 route('/members/applications/request-one');const {ctx}=context();const html=await renderApplicationPage(ctx,'request-one',{member:true});
 assert.match(html,/<details\b[^>]*class="[^"]*member-receipt-recovery[^"]*"[^>]*>/);
 assert.doesNotMatch(html,/<details\b[^>]*class="[^"]*member-receipt-recovery[^"]*"[^>]*\bopen\b/);
 assert.ok(html.indexOf('class="receipt-actions"')<html.indexOf('member-receipt-recovery'));assert.doesNotMatch(html,/class="receipt-link-save"/);
});
});
