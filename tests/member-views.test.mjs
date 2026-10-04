import test,{beforeEach,describe} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setMemberSession,getMemberSessionKey,memberStorage,memberState,forgetMemberDevice,MEMBER_STORAGE_KEY } from '../web/src/member-session.js';

const cssHook=registerHooks({load(url,context,nextLoad){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};if(url.endsWith('.html?raw'))return {format:'module',source:'export default "";',shortCircuit:true};return nextLoad(url,context);}});
let renderMemberPortal,renderMemberEventChoices,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit,renderPublic,publicAction,publicSubmit,renderEventPage,renderApplicationPage,eventSubmit,eventAction,modal,mountMemberDetail;
try{
 ({renderMemberPortal,renderMemberEventChoices,renderMemberVerificationGate,memberPortalAction,memberPortalSubmit}=await import('../web/src/member-portal.js'));
 ({renderPublic,publicAction,publicSubmit}=await import('../web/src/public.js'));
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
function memberPanels(html,active='activity'){
 const entries=[...html.matchAll(/<section\b[^>]*data-member-panel="([^"]+)"[^>]*>/g)],panels={};
 assert.deepEqual(entries.map(match=>match[1]),['activity','events','visits','benefits']);
 for(const entry of entries){
  assert.equal(/\shidden(?:\s|=|>)/.test(entry[0]),entry[1]!==active,entry[1]);
  const tags=/<\/?section\b[^>]*>/g;tags.lastIndex=entry.index+entry[0].length;let depth=1,tag;
  while(depth&&(tag=tags.exec(html)))depth+=tag[0].startsWith('</')?-1:1;
  assert.equal(depth,0,entry[1]);panels[entry[1]]=html.slice(entry.index,tags.lastIndex);
 }
 const nav=html.match(/<nav\b[^>]*class="member-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);
 assert.deepEqual([...nav.matchAll(/data-action="member-tab" data-id="([^"]+)"/g)].map(match=>match[1]),Object.keys(panels));
 assert.equal((nav.match(/aria-current="page"/g)||[]).length,1);assert.match(nav,new RegExp('data-id="'+active+'"[^>]*aria-current="page"'));
 assert.doesNotMatch(html,/data-member-visit-actions|member-visit-create/);
 assert.equal((panels.visits.match(/data-action="member-visit"/g)||[]).length,1);
 assert.match(panels.visits,/data-action="member-request-back"/);
 assert.equal((html.match(/data-form="member-visit"/g)||[]).length,1);
 assert.match(panels.visits,/<form\b[^>]*data-form="member-visit"/);
 assert.doesNotMatch(panels.visits,/data-action="member-request"|member-request-row/);
 for(const id of ['activity','events','benefits'])assert.doesNotMatch(panels[id],/data-form="member-visit"/);
 return panels;
}
function requestViews(html,active='menu'){
 const entries=[...html.matchAll(/<div\b[^>]*data-member-request-view="([^"]+)"[^>]*>/g)];
 assert.deepEqual(entries.map(entry=>entry[1]),['menu','visit']);
 for(const entry of entries){assert.equal(/\shidden(?:\s|=|>)/.test(entry[0]),entry[1]!==active,entry[1]);assert.match(entry[0],/tabindex="-1"/);}
}
function route(path){const url=new URL(path,'https://martini.test');Object.assign(location,{pathname:url.pathname,search:url.search,hash:url.hash,href:url.href,origin:url.origin});}
function assertLoginGate(html){
 assert.match(html,/data-form="member-login"/);assert.match(html,/<input\b[^>]*name="name"/);assert.match(html,/<input\b[^>]*name="studentId"/);
 assert.doesNotMatch(html,/<nav\b|member-event-directory|member-coupon-slot|class="member-event"|data-action="member-(?:visit|inquiry|request)"|name="phone"/);
}
function sectionDocument(){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),scrolls=[],focuses=[];
 const sections=Object.fromEntries(['home','events','applications','coupons','more','detail'].map(id=>['member-'+id,{scrollIntoView:options=>scrolls.push({id,options}),focus:()=>focuses.push(id),setAttribute:()=>{},getAttribute:()=>'-1'}]));
 const panels=['activity','events','visits','benefits'].map(id=>({dataset:{memberPanel:id},hidden:id!=='activity',focus:()=>focuses.push(id)}));
 const buttons=panels.map(panel=>({dataset:{id:panel.dataset.memberPanel},classList:{toggle:()=>{}},setAttribute:()=>{},removeAttribute:()=>{}}));
 const draft={purpose:'작성 중인 방문 사유',date:'2026-10-07',time:'18:00',guests:2,consent:true};
 const requestPanels=['menu','visit'].map(view=>({dataset:{memberRequestView:view},hidden:view!=='menu',draft,focus:()=>focuses.push(view)}));
 const app={querySelector:selector=>requestPanels.find(view=>selector==='[data-member-request-view="'+view.dataset.memberRequestView+'"]')||null,querySelectorAll:selector=>selector==='[data-member-panel]'?panels:buttons};
 globalThis.document={getElementById:id=>sections[id]||null,querySelector:selector=>selector==='[data-member-app]'?app:selector.startsWith('#')?sections[selector.slice(1)]||null:null,querySelectorAll:()=>buttons,defaultView:{scrollY:0,scrollTo:options=>scrolls.push(options)}};
 return {scrolls,focuses,panels,requestPanels,draft,restore:()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}};
}
// Exercise the actual dialog listeners without a browser. This host models form
// values and close events; browser focus/layout and native dialog behavior are not tested.
async function withDialogs(run){
 const previous=new Map(['document','window','CSS','FormData'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),NativeFormData=globalThis.FormData,dialogs=[];
 let template=null;
 class Element{
  constructor(tag='div'){this.tag=tag;this.innerHTML='';this.textContent='';const styles=new Map();this.style={setProperty:(name,value)=>styles.set(name,value),getPropertyValue:name=>styles.get(name)||''};this.attrs=new Map();this.listeners=new Map();this.parts=new Map();this.dataset={};this.isConnected=true;this.entries=[];const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)||null;}
  removeAttribute(name){this.attrs.delete(name);}
  addEventListener(name,handler){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(handler);}
  removeEventListener(name,handler){this.listeners.set(name,(this.listeners.get(name)||[]).filter(listener=>listener!==handler));}
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

test('the member app mounts four management panels without a separate welcome or profile screen',async()=>{
 const events=[event('four',{startsAt:time(4000000)}),event('three',{startsAt:time(3000000)}),event('two',{startsAt:time(2000000)}),event('one',{startsAt:time(1000000)})];
 const requests=[{id:'visit-one',kind:'visit',purpose:'private visit purpose',guestNames:'private guest',status:'pending'}];
 const {html,ctx,calls}=await view('home',{events,requests,applications:[application('needs-payment'),application('offer','offered','none'),application('paid','registered','paid'),application('wait','waiting','none')]});
 const panels=memberPanels(html);assert.match(html,/<header\b[^>]*>[\s\S]*?테스트 부원[\s\S]*?data-action="member-forget"[\s\S]*?<\/header>/);
 for(const [id,panel] of Object.entries(panels))assert.equal((panel.match(/<h1\b/g)||[]).length,id==='visits'?2:1);
 requestViews(panels.visits);
 assert.equal((panels.events.match(/data-action="member-event-open"/g)||[]).length,4);
 assert.equal((panels.activity.match(/data-action="member-application-open"/g)||[]).length,4);
 const choices=panels.events;
 for(const id of ['one','two','three','four'])assert.match(choices,new RegExp('data-action="member-event-open"[^>]*data-id="'+id+'"'));
 assert.ok(choices.indexOf('data-id="one"')<choices.indexOf('data-id="two"'));
 assert.match(panels.visits,/출입 신청/);assert.doesNotMatch(panels.activity,/data-action="member-forget"/);
 assert.match(panels.benefits,/data-action="member-partners"[^>]*aria-haspopup="dialog"/);
 const records=panels.activity;
 assert.match(records,/data-action="member-request" data-id="visit-one"/);
 for(const status of ['action','current'])assert.match(records,new RegExp('data-member-status="'+status+'"'));
 assert.doesNotMatch(html,/등록된 제휴 정보/);
 assert.doesNotMatch(html,/<details\b|<summary\b|data-action="member-(?:section|inquiry)"|운영진에게 문의|member-home-notices|data-coupon-state|학기|href="\/notices"|private guest/);
 assert.doesNotMatch(html,/data-member-panel="home"|member-home-welcome|member-profile-card|member-home-hero|member-app-eyebrow|반가워요|마티니 홈페이지/);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);
});
test('the request tab starts with a menu button and opens the complete visit form without repeated history',async()=>{
 const {ctx}=context({requests:[{id:'existing-visit',kind:'visit',purpose:'기존 방문',status:'pending'}]});ctx.state.memberAppTab='visits';
 const html=await renderMemberPortal(ctx),panels=memberPanels(html,'visits'),form=panels.visits.match(/<form\b[^>]*data-form="member-visit"[^>]*>[\s\S]*?<\/form>/)?.[0];
 requestViews(panels.visits);assert.match(panels.visits,/<h1\b[^>]*>신청<\/h1>/);
 assert.match(panels.visits,/<button\b[^>]*data-action="member-visit"[^>]*>[\s\S]*?출입 신청[\s\S]*?<\/button>/);
 assert.ok(form);assert.equal((panels.visits.match(/<form\b/g)||[]).length,1);
 assert.match(form,/<input\b[^>]*type="hidden"[^>]*name="visitDate"/);assert.match(form,/data-visit-calendar/);
 for(const name of ['startTime','guestCount','guestNames','purpose','consent']){
  const field=form.match(new RegExp('<(?:input|textarea)\\b[^>]*name="'+name+'"[^>]*>'))?.[0];
  assert.ok(field,name);assert.match(field,/\srequired(?:\s|>|=)/,name);
 }
 const options=[...form.matchAll(/<input\b[^>]*name="guestCount"[^>]*value="([^"]+)"[^>]*>/g)];
 assert.deepEqual(options.map(option=>option[1]),['1','2','3']);assert.equal(options.filter(option=>/\schecked(?:\s|>|=)/.test(option[0])).length,1);
 assert.match(form,/<button\b[^>]*type="submit"[^>]*>출입 승인 요청<\/button>/);
 assert.match(form,/<p\b[^>]*role="alert"/);assert.match(form,/개인정보 수집·이용/);
 assert.doesNotMatch(form,/name="(?:name|studentId|phone|endsAt|endTime)"/);
 assert.match(panels.activity,/data-action="member-request" data-id="existing-visit"/);
 assert.doesNotMatch(panels.visits,/기존 방문|신청 현황|member-receipt-banner/);
 ctx.state.memberRequestView='visit';requestViews(memberPanels(await renderMemberPortal(ctx),'visits').visits,'visit');
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

test('activity groups applications and visits without secret links or retired inquiry history',async()=>{
 const requests=[{id:'visit-one',kind:'visit',purpose:'테스트 방문',startsAt:time(1000000),createdAt:time(-10000),guestCount:2,status:'pending'},{id:'inquiry-one',kind:'inquiry',subject:'테스트 문의',createdAt:time(-9000),status:'answered'}];
 const {html}=await view('applications',{requests,applications:[application('event-request')]});
 const panels=memberPanels(html,'activity'),records=panels.activity;assert.match(records,/data-action="member-application-open"[^>]*data-id="event-request"/);
 assert.match(records,/data-action="member-request" data-id="visit-one"/);assert.doesNotMatch(html,/inquiry-one|테스트 문의|출입 신청·문의/);
 for(const id of ['events','visits','benefits'])assert.doesNotMatch(panels[id],/member-application-row|member-request-row/);
 assert.doesNotMatch(html,new RegExp(sessionKey+'|'+receiptKey));assert.doesNotMatch(html,/href="\/members\/applications\/event-request"/);
});
test('empty member panels retain their actions and refresh reloads server status',async()=>{
 const {html,ctx,calls}=await view('applications',{events:[]});
 const panels=memberPanels(html,'activity');assert.match(panels.visits,/data-form="member-visit"/);assert.match(panels.events,/행사/);assert.match(panels.benefits,/data-action="member-partners"/);
 assert.doesNotMatch(html,/data-action="member-section"|data-action="member-application-open"|data-action="member-request"/);
 assert.doesNotMatch(panels.activity,/data-member-status=/);assert.match(panels.activity,/신청 내역이 없습니다/);
 let renders=0;ctx.render=async()=>{renders++;};
 await memberPortalAction(ctx,'member-refresh');assert.equal(renders,1);
 assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);
});

test('event and partner service buttons open dialogs without navigation or history rows and load partner stamps on demand',async()=>{
 const {ctx,calls,navigations}=await view('home',{applications:[application('one')],requests:[{id:'visit-one',kind:'visit',purpose:'내 방문',status:'pending'}]});
 const initialCalls=calls.length,leaveOptions=[];ctx.mayLeave=async options=>{leaveOptions.push(options);return true;};
 await withDialogs(async({dialogs})=>{
  await publicAction(ctx,'member-events');const events=dialogs.at(-1);
  assert.ok(events.open);assert.ok(events.classList.contains('member-events-dialog'));assert.match(events.innerHTML,/data-action="member-event-open"/);assert.doesNotMatch(events.innerHTML,/member-application-row|member-request-row/);
  await events.requestClose();assert.equal(events.open,false);
  await publicAction(ctx,'member-partners');const partners=dialogs.at(-1);
  assert.ok(partners.open);assert.ok(partners.classList.contains('partner-dialog'));assert.match(partners.innerHTML,/<section class="partner-feelingfine" aria-labelledby="modal-title">[\s\S]*?class="partner-intro"[\s\S]*?<h2 id="modal-title" tabindex="-1">필링파인<\/h2>[\s\S]*?class="partner-benefits-copy"[\s\S]*?<div class="partner-coupon-area"><div data-partner-body/);
  assert.match(partners.innerHTML,/data-coupon-reveal[^>]*aria-label="내 스탬프 쿠폰 열기"/);assert.match(partners.innerHTML,/FeelingFineCouponBack\.png/);assert.doesNotMatch(partners.innerHTML,/FeelingFineCoupon\.png|내 스탬프 보기|data-action="partner-qr"|partner-benefit-heading|partner-coupon-title|partner-information|안내 준비 중|member-application-row|member-request-row|data-action="member-event-open"/);
  assert.equal(calls.length,initialCalls);await publicAction(ctx,'partner-qr');assert.equal(calls.length,initialCalls);
  await publicAction(ctx,'partner-reveal');assert.match(partners.querySelector('[data-partner-body]').innerHTML,/data-action="partner-qr" aria-label="QR 표시"><i data-lucide="qr-code"/);
  assert.equal((partners.innerHTML.match(/<h2\b/g)||[]).length,1);const partnerHeader=partners.innerHTML.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];assert.ok(partnerHeader);assert.doesNotMatch(partnerHeader,/<h2\b/);
  await partners.requestClose();assert.equal(partners.open,false);
 });
 assert.deepEqual(leaveOptions,[undefined,undefined]);
 assert.equal(calls.length,initialCalls+1);assert.equal(calls.at(-1).op,'memberCoupons');assert.deepEqual(navigations,[]);assert.equal(location.pathname,'/members');
});

test('service popup switching respects an unsaved form and does not clear its selection when leaving is declined',async()=>{
 const {ctx,calls}=context(),selection={kind:'event',id:'one'};ctx.state.memberInlineDetail=selection;ctx.mayLeave=async()=>false;
 await withDialogs(async({dialogs})=>{
  for(const action of ['member-events','member-partners','member-visit','member-request-back'])await publicAction(ctx,action);
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

test('inline visit submission uses the existing payload and displays its result in activity',async()=>{
 const requests=[],{ctx,navigations}=context({requests}),response=deferred(),base=ctx.api,form=visitForm(),renders=[];let payload,rendered;
 ctx.state.memberAppTab='visits';ctx.state.memberRequestView='visit';
 ctx.api=async(op,data)=>{if(op==='submitClubRequest'){payload=data;return response.promise;}return base(op,data);};
 ctx.render=async options=>{renders.push(options);rendered=await renderMemberPortal(ctx);};
 const submission=publicSubmit(ctx,'member-visit',form);
 assert.equal(payload.kind,'visit');assert.equal(payload.guestCount,2);assert.equal(payload.sessionKey,sessionKey);assert.equal(payload.consent,true);
 assert.equal(payload.startsAt,new Date(form.get('visitDate')+'T18:00:00+09:00').toISOString());
 assert.equal(payload.guestNames,form.get('guestNames'));assert.equal(payload.purpose,form.get('purpose'));
 assert.equal(payload.endsAt,undefined);assert.equal(payload.name,undefined);assert.equal(payload.studentId,undefined);
 assert.match(payload.requestId,/^[a-zA-Z0-9_-]+$/);assert.match(payload.receiptKey,/^[a-f0-9]{64}$/);
 assert.deepEqual(renders,[]);assert.equal(ctx.state.memberAppTab,'visits');
 const request={id:payload.requestId,kind:'visit',purpose:payload.purpose,status:'pending',startsAt:payload.startsAt,guestCount:payload.guestCount};requests.push(request);
 response.resolve({id:request.id,request});await submission;
 assert.equal(memberState(ctx).lastReceiptId,request.id);assert.equal(memberStorage(ctx).receipts[0].id,request.id);assert.equal(memberStorage(ctx).pending.visit,undefined);
 assert.equal(ctx.state.memberAppTab,'activity');assert.equal(ctx.state.memberRequestView,undefined);assert.deepEqual(renders,[{focus:true,scroll:0}]);assert.deepEqual(navigations,[]);
 const panels=memberPanels(rendered,'activity');assert.match(panels.activity,/신청 완료/);assert.match(panels.activity,new RegExp('data-action="member-request" data-id="'+request.id+'"'));
 requestViews(panels.visits);
});

test('a failed inline visit request retains the form and reuses its request identity on retry',async()=>{
 const {ctx}=context(),form=visitForm(),original=[...form],calls=[],renders=[];let fail=true;
 ctx.state.memberAppTab='visits';ctx.state.memberRequestView='visit';ctx.render=async options=>{renders.push(options);};
 ctx.api=async(op,data)=>{assert.equal(op,'submitClubRequest');calls.push(data);if(fail)throw Object.assign(new Error('Temporary failure'),{code:'functions/unavailable'});return {id:data.requestId};};
 await assert.rejects(publicSubmit(ctx,'member-visit',form),/Temporary failure/);
 assert.deepEqual([...form],original);assert.deepEqual(renders,[]);assert.equal(ctx.state.memberAppTab,'visits');assert.equal(getMemberSessionKey(ctx),sessionKey);
 assert.equal(ctx.state.memberRequestView,'visit');
 assert.equal(memberStorage(ctx).pending.visit.requestId,calls[0].requestId);
 fail=false;await publicSubmit(ctx,'member-visit',form);
 assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.equal(memberStorage(ctx).pending.visit,undefined);
 assert.equal(ctx.state.memberAppTab,'activity');assert.equal(ctx.state.memberRequestView,undefined);assert.deepEqual(renders,[{focus:true,scroll:0}]);
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
test('visit form and logout remain directly available while the inquiry form and help section are removed',async()=>{
 const {html}=await view('more');
 memberPanels(html,'activity');assert.match(html,/data-form="member-visit"/);assert.match(html,/data-action="member-forget"/);
 assert.match(html,/테스트 부원/);
 assert.doesNotMatch(html,/href="\/(?:notices|members\/applications)"|data-action="member-(?:section|inquiry)"|운영진에게 문의|id="member-more"|로그인 중|학기/);
});
test('the old coupon URL requires login and selects benefits without eagerly fetching stamp data',async()=>{
 const anonymous=await view('coupons',{verified:false});assertLoginGate(anonymous.html);assert.deepEqual(anonymous.calls,[]);
 const verified=await view('coupons'),panels=memberPanels(verified.html,'benefits');assert.match(panels.benefits,/필링파인/);assert.match(panels.benefits,/data-action="member-partners"/);
 assert.doesNotMatch(verified.html,/data-coupon-state|data-action="(?:coupon|member-coupon)|\b0\s*\/\s*10\b|\bQR\b/);
 assert.deepEqual(verified.calls.map(call=>call.op),['memberPortal','memberApplications']);
});

test('legacy lounge routes select their relevant tab while mounting every panel and never loading notices',async()=>{
 for(const [path,active] of [['/members','activity'],['/members/events','events'],['/members/applications','activity'],['/members/coupons','benefits'],['/members/more','activity'],['/events','events']]){
  values.clear();route(path);const {ctx,calls}=context({applications:[application('one')],requests:[{id:'one',kind:'inquiry',subject:'문의 내역',status:'answered'}]});const html=await renderPublic(ctx);
  memberPanels(html,active);assert.equal(ctx.state.memberAppTab,active);assert.doesNotMatch(html,/문의 내역|data-action="member-inquiry"/);
  assert.deepEqual(calls.map(call=>call.op),['memberPortal','memberApplications']);assert.doesNotMatch(html,/href="\/notices"|member-home-notices|member-navigation|data-action="member-section"|class="[^\"]*member-header-link/);
  assert.equal(ctx.state.memberScrollTarget,undefined,path);assert.equal(ctx.state.memberActiveSection,undefined,path);
 }
});

test('events and activity panels retain current and past records in chronological groups',async()=>{
 const past=event('past-event',{startsAt:time(-7200000),endsAt:time(-3600000),status:'closed'});
 const pastApplication={...application('past-application','cancelled'),event:past};
 const requests=[{id:'pending-request',kind:'visit',purpose:'승인 대기 방문',startsAt:time(1000000),status:'pending',createdAt:time(-1000)},{id:'past-request',kind:'visit',purpose:'취소한 방문',status:'cancelled',createdAt:time(-2000)}];
 const {html,ctx}=await view('home',{events:[event('current-event'),past],applications:[application('current-application'),pastApplication],requests});
 const panels=memberPanels(html),choices=panels.events,records=panels.activity;
 for(const id of ['current-event','past-event'])assert.match(choices,new RegExp('data-action="member-event-open"[^>]*data-id="'+id+'"'));
 assert.doesNotMatch(panels.activity,/data-action="member-event-open"/);
 for(const id of ['current-application','past-application'])assert.match(records,new RegExp('data-action="member-application-open"[^>]*data-id="'+id+'"'));
 for(const id of ['pending-request','past-request'])assert.match(records,new RegExp('data-action="member-request"[^>]*data-id="'+id+'"'));
 assert.doesNotMatch(html,/<details\b|<summary\b|aria-hidden="true"[^>]*class="(?:member-section|member-event)|data-action="member-section"/);
 assert.ok(choices.indexOf('data-id="current-event"')<choices.indexOf('data-id="past-event"'));
 assert.ok(records.indexOf('data-id="current-application"')<records.indexOf('data-id="past-application"'));
 assert.ok(records.indexOf('data-id="pending-request"')<records.indexOf('data-id="past-request"'));
});

test('dashboard separates action, current and past records without duplicate rows',async()=>{
 const refundCancelled=application('refund-cancelled','cancelled','refund_pending');refundCancelled.event.status='cancelled';
 const refundPast=application('refund-past','cancelled','refund_pending');refundPast.event.endsAt=time(-3600000);
 const completed=application('completed','registered','paid');completed.event.status='completed';completed.event.endsAt=time(-3600000);
 const applications=[application('unpaid'),application('live-offer','offered','none'),application('waiting','waiting','none'),application('requested','registered','requested'),application('paid','registered','paid'),refundCancelled,refundPast,completed,application('cancelled','cancelled','refunded')];
 const requests=[{id:'approved-visit',kind:'visit',status:'approved',purpose:'방문',startsAt:time(3600000)},{id:'cancelled-visit',kind:'visit',status:'cancelled',purpose:'취소한 방문',startsAt:time(3600000)}];
 const {html}=await view('home',{applications,requests}),dashboard=memberPanels(html).activity;
 const entries=[...dashboard.matchAll(/<section\b[^>]*data-member-status="([^"]+)"[^>]*>/g)];
 assert.deepEqual(entries.map(entry=>entry[1]),['action','current','past']);
 const expected={action:['unpaid','live-offer'],current:['waiting','requested','paid','refund-cancelled','refund-past','approved-visit'],past:['completed','cancelled','cancelled-visit']};
 for(const [index,entry] of entries.entries()){
  const section=dashboard.slice(entry.index,entries[index+1]?.index??dashboard.length);
  assert.match(section,/<h2\b/);
  assert.match(section,new RegExp('class="member-section-count">'+expected[entry[1]].length+'<'));
  const rows=[...section.matchAll(/data-action="member-(?:application-open|request)"[^>]*data-id="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(rows.sort(),expected[entry[1]].toSorted(),entry[1]);
 }
 const ids=[...dashboard.matchAll(/data-action="member-(?:application-open|request)"[^>]*data-id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,11);assert.equal(new Set(ids).size,ids.length);
});

test('route initialization keeps the chosen tab during refresh and resets only on a real path change',async()=>{
 const {ctx}=context();route('/members/events');memberPanels(await renderPublic(ctx),'events');
 ctx.state.memberAppTab='visits';ctx.state.memberAppScroll={visits:60};ctx.state.memberRequestView='visit';
 requestViews(memberPanels(await renderPublic(ctx),'visits').visits,'visit');assert.deepEqual(ctx.state.memberAppScroll,{visits:60});
 route('/members/coupons');memberPanels(await renderPublic(ctx),'benefits');assert.equal(ctx.state.memberAppScroll,undefined);
 assert.equal(ctx.state.memberRequestView,undefined);
 assert.equal(ctx.state.memberRouteSource,'/members/coupons');
});

test('public tab actions preserve visit drafts while honoring modal and saving guards without refetching',async()=>{
 const {ctx,calls,navigations}=context(),dom=sectionDocument(),leaveOptions=[];let renders=0;ctx.render=async()=>{renders++;};route('/members#saved-position');
 try{
  const selected={kind:'event',id:'one'};ctx.state.memberInlineDetail=selected;
  ctx.mayLeave=async options=>{leaveOptions.push(options);return false;};assert.equal(await publicAction(ctx,'member-tab','events'),false);assert.equal(ctx.state.memberInlineDetail,selected);assert.equal(ctx.state.memberAppTab,undefined);
  ctx.mayLeave=async options=>{leaveOptions.push(options);return true;};assert.equal(await publicAction(ctx,'member-tab','events'),true);assert.equal(ctx.state.memberAppTab,'events');assert.equal(ctx.state.memberInlineDetail,undefined);
  assert.deepEqual(dom.panels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.memberPanel),['events']);
  assert.equal(location.href,'https://martini.test/members#saved-position');assert.deepEqual(calls,[]);assert.deepEqual(navigations,[]);assert.equal(renders,0);
  assert.equal(await publicAction(ctx,'member-tab','unknown'),false);assert.equal(ctx.state.memberAppTab,'events');
  assert.equal(await publicAction(ctx,'member-tab','visits'),true);assert.equal(ctx.state.memberRequestView,'menu');
  assert.deepEqual(dom.requestPanels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.memberRequestView),['menu']);
  assert.equal(await publicAction(ctx,'member-visit'),true);assert.equal(ctx.state.memberAppTab,'visits');assert.equal(ctx.state.memberRequestView,'visit');
  assert.deepEqual(dom.panels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.memberPanel),['visits']);
  assert.deepEqual(dom.requestPanels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.memberRequestView),['visit']);
  assert.equal(await publicAction(ctx,'member-request-back'),true);assert.equal(ctx.state.memberRequestView,'menu');
  assert.equal(await publicAction(ctx,'member-visit'),true);assert.equal(ctx.state.memberRequestView,'visit');
  assert.equal(dom.requestPanels[1].draft,dom.draft);assert.deepEqual(dom.draft,{purpose:'작성 중인 방문 사유',date:'2026-10-07',time:'18:00',guests:2,consent:true});
  assert.equal(await publicAction(ctx,'member-tab','activity'),true);
  assert.equal(await publicAction(ctx,'member-tab','visits'),true);assert.equal(ctx.state.memberRequestView,'menu');
  assert.deepEqual(leaveOptions,Array.from({length:8},()=>({preserveVisitDraft:true})));
  assert.deepEqual(calls,[]);assert.deepEqual(navigations,[]);assert.equal(renders,0);
 }finally{dom.restore();}
});

test('request subview actions leave the current view intact when saving or the route changes while closing a modal',async()=>{
 const {ctx,calls}=context(),dom=sectionDocument();let renders=0;ctx.render=async()=>{renders++;};
 try{
  ctx.mayLeave=async()=>true;await publicAction(ctx,'member-visit');
  ctx.mayLeave=async()=>false;assert.equal(await publicAction(ctx,'member-request-back'),false);
  assert.equal(ctx.state.memberRequestView,'visit');assert.equal(dom.requestPanels[1].hidden,false);
  ctx.mayLeave=async()=>{route('/notices');return true;};assert.equal(await publicAction(ctx,'member-request-back'),false);
  assert.equal(ctx.state.memberRequestView,'visit');assert.equal(dom.requestPanels[1].hidden,false);
  assert.deepEqual(calls,[]);assert.equal(renders,0);
 }finally{dom.restore();}
});

test('visit details and refresh request discard protection before opening a flow that can rerender',async()=>{
 const request={id:'existing-visit',kind:'visit',purpose:'기존 방문',status:'pending'},leaveOptions=[],{ctx}=context({requests:[request]});let renders=0;
 ctx.mayLeave=async options=>{leaveOptions.push(options);return true;};ctx.render=async()=>{renders++;};
 await withDialogs(async({dialogs})=>{
  await publicAction(ctx,'member-request',request.id);assert.ok(dialogs.at(-1).open);assert.equal(renders,0);
 });
 ctx.mayLeave=async options=>{leaveOptions.push(options);return false;};
 await publicAction(ctx,'member-refresh');assert.equal(renders,0);
 assert.deepEqual(leaveOptions,[undefined,undefined]);
});

test('changing tabs discards a pending visit detail response',async()=>{
 const {ctx}=context(),pending=deferred();ctx.api=async()=>pending.promise;
 await withDialogs(async({dialogs})=>{
  const opening=memberPortalAction(ctx,'member-request','pending-visit');
  ctx.state.memberAppGeneration=(ctx.state.memberAppGeneration||0)+1;
  pending.resolve({member,requests:[{id:'pending-visit',kind:'visit',purpose:'STALE VISIT',status:'approved'}],expiresAt:time(60000)});
  await opening;assert.deepEqual(dialogs,[]);assert.deepEqual(memberState(ctx).requests,[]);
 });
});

test('popup detail controls change only the selected record and respect unsaved form navigation checks',async()=>{
 const {ctx,calls,navigations}=context(),dom=sectionDocument(),leaveOptions=[];let renders=0;ctx.render=async()=>{renders++;};
 try{
  ctx.mayLeave=async options=>{leaveOptions.push(options);return false;};await publicAction(ctx,'member-event-open','event-one');assert.equal(ctx.state.memberInlineDetail,undefined);assert.equal(renders,0);
  ctx.mayLeave=async options=>{leaveOptions.push(options);return true;};await publicAction(ctx,'member-event-open','event-one');assert.deepEqual(ctx.state.memberInlineDetail,{kind:'event',id:'event-one'});
  await publicAction(ctx,'member-application-open','request-one');assert.deepEqual(ctx.state.memberInlineDetail,{kind:'application',id:'request-one'});
  await publicAction(ctx,'member-detail-close');assert.equal(ctx.state.memberInlineDetail,undefined);
  assert.equal(renders,3);assert.deepEqual(navigations,[]);assert.deepEqual(calls,[]);assert.equal(location.pathname,'/members');
  assert.deepEqual(leaveOptions,[undefined,undefined,undefined,undefined]);
 }finally{dom.restore();}
});

test('legacy detail URLs prepare one inert popup template and do not reopen it after closing',async()=>{
 for(const [path,kind,id,op] of [['/members/events/event-one','event','event-one','memberEventAccess'],['/members/applications/request-one','application','request-one','memberApplication']]){
  values.clear();route(path);const {ctx,calls}=context(),dom=sectionDocument();
  try{
   const html=await renderPublic(ctx);assert.deepEqual(ctx.state.memberInlineDetail,{kind,id});assert.ok(calls.findIndex(call=>call.op==='memberPortal')<calls.findIndex(call=>call.op===op));
   assert.match(html,/<template\b[^>]*id="member-detail-content"[^>]*>[\s\S]*<\/template>/);assert.doesNotMatch(html,/<section\b[^>]*class="member-inline-detail"/);assert.equal(ctx.state.memberScrollTarget,undefined);
   memberPanels(html,kind==='event'?'events':'activity');assert.equal((html.match(/\bdata-member-app(?:\s|>)/g)||[]).length,1);assert.doesNotMatch(html,/<!--member-inline-detail-->/);
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

test('declining the logout guard preserves the session and never revokes it',async()=>{
 const {ctx,calls,navigations}=context(),leaveOptions=[];memberState(ctx).requests=[{id:'private-request'}];ctx.state.memberAppTab='visits';
 ctx.mayLeave=async options=>{leaveOptions.push(options);return false;};
 await publicAction(ctx,'member-forget');
 assert.deepEqual(leaveOptions,[undefined]);assert.deepEqual(calls,[]);assert.deepEqual(navigations,[]);
 assert.equal(getMemberSessionKey(ctx),sessionKey);assert.equal(memberState(ctx).member.name,member.name);assert.deepEqual(memberState(ctx).requests,[{id:'private-request'}]);assert.equal(ctx.state.memberAppTab,'visits');
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
 const html=await renderMemberPortal(ctx,{section:'applications'});assert.match(html,/신청 내역을 불러왔습니다/);assert.match(html,/data-action="member-request" data-id="legacy-request"/);assert.doesNotMatch(html,/기존 문의|data-action="member-inquiry"/);assert.doesNotMatch(html,new RegExp(receiptKey));assert.deepEqual(memberStorage(ctx).receipts,[{id:'legacy-request',receiptKey}]);
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
