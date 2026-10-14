import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const firebaseUrl=new URL('../web/src/firebase.js',import.meta.url).href;
const hook=registerHooks({load(url,context,next){
 if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
 if(url===firebaseUrl)return {format:'module',source:'export const auth={},local=false,signInAdmin=()=>{},signOut=()=>{},sendPasswordResetEmail=()=>{};',shortCircuit:true};
 return next(url,context);
}});
const {absenceRows,renderAbsenceReport}=await import('../web/src/absence-report.js');
const {renderAdmin}=await import('../web/src/admin.js');hook.deregister();
const report={semester:'2026-2',semesters:['2026-2','2026-1'],generatedAt:'2026-10-14T03:00:00Z',events:[{id:'one',title:'첫 교육',startsAt:'2026-09-01T03:00:00Z',unchecked:0},{id:'two',title:'둘째 교육',startsAt:'2026-10-01T03:00:00Z',unchecked:1}],rows:[{id:'a',name:'나부원',studentId:'TEST100',department:'테스트학과',records:[{eventId:'one',attendance:'absent'},{eventId:'two',attendance:'absent'}]},{id:'b',name:'가부원',studentId:'TEST200',department:'테스트학과',records:[{eventId:'one',attendance:'present'},{eventId:'two',attendance:'absent'}]}]};
const profile={uid:'admin',role:'education',displayName:'운영진',permissions:['events']};
function context(){
 globalThis.location={pathname:'/admin/absences',search:'',href:'https://martini.test/admin/absences'};
 const calls=[],ctx={state:{authReady:true,user:{uid:'admin'},profile,data:{},settings:{}},api:async(op,data)=>{calls.push({op,data});if(op==='profile')return profile;if(op==='absenceReport')return structuredClone(report);throw Error('Unexpected '+op);}};
 return {ctx,calls};
}

test('member search, event filtering, minimum absences and sorting use the displayed report only',()=>{
 assert.deepEqual(absenceRows(report).map(row=>[row.id,row.count,row.present]),[['a',2,0],['b',1,1]]);
 assert.deepEqual(absenceRows(report,{eventId:'one',minimum:1}).map(row=>row.id),['a']);
 assert.deepEqual(absenceRows(report,{search:'test200',minimum:1}).map(row=>row.id),['b']);
 assert.deepEqual(absenceRows(report,{minimum:2}).map(row=>row.id),['a']);
 assert.deepEqual(absenceRows(report,{sort:'name'}).map(row=>row.id),['b','a']);
 assert.deepEqual(absenceRows(report,{search:'없음'}),[]);
});

test('admin route uses the protected report API and provides a discoverable navigation entry',async()=>{
 const {ctx,calls}=context(),html=await renderAdmin(ctx);
 assert.match(html,/href="\/admin\/absences"[^>]*aria-current="page"/);
 assert.match(html,/결석자 관리|data-absence-page/);assert.match(html,/data-absence-semester/);assert.match(html,/data-action="absence-member"/);
 assert.deepEqual(calls.map(call=>call.op),['profile','absenceReport']);
 assert.match(html,/신청 시 기본 상태가 불참/);assert.match(html,/미확인 1건은 결석 횟수에서 제외/);
});

test('report escapes stored text and does not query or render for finance-only accounts',async()=>{
 const {ctx,calls}=context();ctx.api=async()=>({...report,rows:[{...report.rows[0],name:'<img src=x onerror=alert(1)>',department:'<script>private</script>'}]});
 const html=await renderAbsenceReport(ctx);assert.doesNotMatch(html,/<img src=x|<script>private/);assert.match(html,/&lt;img/);
 ctx.state.profile={permissions:['finance']};assert.doesNotMatch(await renderAbsenceReport(ctx),/data-action="absence-member"/);assert.deepEqual(calls,[]);
});

test('late report responses are discarded after navigation, logout or replacement by a newer request',async()=>{
 for(const change of [ctx=>{location.pathname='/admin';},ctx=>{ctx.state.user=null;},ctx=>{ctx.state.profile={permissions:[]};},ctx=>{ctx.state.absenceReportView={};}]){
  const {ctx}=context();let resolve;ctx.api=()=>new Promise(done=>resolve=done);
  const pending=renderAbsenceReport(ctx);change(ctx);resolve(report);assert.equal(await pending,'');
 }
});

test('semester input is passed to the server and a failed refresh never reuses a private old report',async()=>{
 const {ctx,calls}=context();location.search='?semester=2026-1';
 await renderAbsenceReport(ctx);assert.deepEqual(calls[0],{op:'absenceReport',data:{semester:'2026-1'}});
 ctx.api=async()=>{throw Error('offline');};await assert.rejects(renderAbsenceReport(ctx),/offline/);assert.equal(ctx.state.absenceReportView,undefined);
});
