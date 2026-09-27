import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real HTML renderer without launching a browser. Vite handles this
// stylesheet in the app; Node only needs the JavaScript for these assertions.
const cssHook=registerHooks({load(url,context,nextLoad){
 if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
 return nextLoad(url,context);
}});
let renderOnTheRock;
try{({renderOnTheRock}=await import('../web/src/on-the-rock.js'));}
finally{cssHook.deregister();}

const zero={bingoPoints:0,participationBonus:0,bingoLinePoints:0,repeatPoints:0,specialPoints:0,total:0,completedCells:[],completedLines:0};
const group=(extra={})=>({id:'group-a',name:'1조',memberCount:5,revision:1,semester:'2026-2',score:{...zero},...extra});
const record=(extra={})=>({id:'record-a',kind:'bingo',missionId:'meal',allParticipated:false,completedAt:'2026-09-28T10:00:00.000Z',note:'',revision:1,actorName:'운영진',...extra});
const board=(extra={})=>{const selected=group();return {semester:'2026-2',groups:[selected],group:selected,records:[],score:{...zero},...extra};};

async function render(value,search='?semester=2026-2&group=group-a'){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location'),calls=[];
 Object.defineProperty(globalThis,'location',{configurable:true,value:{search}});
 const ctx={state:{settings:{semester:'2026-2'}},api:async(op,data)=>{calls.push({op,data});return value;}};
 try{return {html:await renderOnTheRock(ctx),calls,state:ctx.state};}
 finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
}
const cells=html=>[...html.matchAll(/<button\b[^>]*class="ontherock-cell(?: [^"]*)?"[^>]*>[\s\S]*?<\/button>/g)].map(match=>match[0]);
const section=(html,id)=>{const start=html.indexOf('aria-labelledby="'+id+'"');assert.ok(start>=0,'Expected section '+id);return html.slice(start,html.indexOf('</section>',start));};

test('empty and unselected boards offer group setup or selection without recording into a default group',async()=>{
 const empty=await render(board({groups:[],group:null,score:null}), '');
 assert.deepEqual(empty.calls,[{op:'onTheRockBoard',data:{semester:'2026-2'}}]);
 assert.match(empty.html,/첫 번째 조를 만들어 주세요/);
 assert.match(empty.html,/data-action="ontherock-group-add"/);
 assert.equal(cells(empty.html).length,0);
 const unselected=await render(board({group:null,score:null}), '?semester=2026-2');
 assert.match(unselected.html,/우리 조를 선택해 주세요/);
 assert.match(unselected.html,/data-ontherock-group/);
 assert.match(unselected.html,/<option value="group-a"/);
 assert.equal(cells(unselected.html).length,0);
});

test('selected board renders all 16 missions with distinct normal and full-team stamps and accessible statuses',async()=>{
 const value=board({records:[record(),record({id:'record-b',missionId:'staff-photo',allParticipated:true})],score:{...zero,bingoPoints:30,participationBonus:5,total:35,completedCells:['meal','staff-photo']}});
 const {html,calls,state}=await render(value);
 assert.deepEqual(calls,[{op:'onTheRockBoard',data:{semester:'2026-2',groupId:'group-a'}}]);
 assert.equal(state.onTheRock,value);
 const entries=cells(html);assert.equal(entries.length,16);
 const normal=entries.find(cell=>cell.includes('data-id="record-a"'));
 const full=entries.find(cell=>cell.includes('data-id="record-b"'));
 assert.ok(normal);assert.ok(full);
 assert.match(normal,/class="ontherock-stamp" aria-hidden="true">樂/);
 assert.match(normal,/aria-label="[^"]*수행 완료[^"]*기록 수정"/);
 assert.doesNotMatch(normal,/ontherock-stamp is-all/);
 assert.match(full,/class="ontherock-stamp is-all" aria-hidden="true">樂/);
 assert.match(full,/aria-label="[^"]*전원 참여 완료[^"]*기록 수정"/);
 assert.match(full,/class="ontherock-bonus">\+5/);
 assert.equal(entries.filter(cell=>cell.includes('data-action="ontherock-record"')).length,14);
});

test('score breakdown reports server totals including completed lines, repeat missions, and special missions',async()=>{
 const score={bingoPoints:100,participationBonus:10,bingoLinePoints:30,repeatPoints:20,specialPoints:50,total:210,completedCells:['martini-follow','bowling','movie','mutual-follow'],completedLines:1};
 const selected=group({score});
 const {html}=await render(board({groups:[selected],group:selected,score}));
 assert.match(html,/<strong>210<small>P<\/small><\/strong>/);
 for(const [label,value] of [['빙고 미션',100],['전원 참여 보너스',10],['빙고 1줄',30],['반복 미션',20],['특별 미션',50]]){
  assert.ok(html.includes('<dt>'+label+'</dt><dd>'+value+'<small>P</small>'),label+' score is visible');
 }
});

test('repeat recording stays available before bingo completion and immediately after another repeat',async()=>{
 for(const records of [[],[record({kind:'repeat',missionId:'meal',completedAt:new Date().toISOString()})]]){
  const {html}=await render(board({records}));
  const repeat=section(html,'ontherock-repeat-title');
  for(const id of ['meal','cafe','karaoke','bar']){
   const control=repeat.match(new RegExp('<button\\b[^>]*data-id="repeat:'+id+'"[^>]*>'))?.[0];
   assert.ok(control,'Record button for '+id);
   assert.doesNotMatch(control,/\bdisabled\b/);
  }
  assert.doesNotMatch(repeat,/빙고에서 먼저 수행|다음 가능|대기 시간|남은 시간/);
 }
});

test('group names, operator names and notes are escaped; cancelled records stay visible without edit controls',async()=>{
 const name='우리 <svg onload="alert(1)">조',note='<img src=x onerror="alert(1)"> & 메모',actorName='담당 <script>alert(1)</script>';
 const selected=group({name,memberCount:0});
 const {html}=await render(board({groups:[selected],group:selected,records:[record({note,actorName,voidedAt:'2026-09-28T11:00:00.000Z'})]}));
 assert.ok(html.includes('우리 &lt;svg onload=&quot;alert(1)&quot;&gt;조'));
 assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; 메모'));
 assert.ok(html.includes('담당 &lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.equal(/<(?:svg|script|img)\b/.test(html),false,'User text must not become executable markup');
 const history=section(html,'ontherock-history-title');
 assert.match(history,/취소됨/);
 assert.doesNotMatch(history,/data-action="ontherock-(?:edit|void)"/);
 assert.equal(/(?:undefined|null)명/.test(html),false,'Optional participant counts must not print missing values');
 assert.equal(/type="file"|name="(?:evidence|proof|participants)"/.test(html),false,'Recording does not require qualification or proof inputs');
});
