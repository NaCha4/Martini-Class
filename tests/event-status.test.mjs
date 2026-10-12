import test from 'node:test';
import assert from 'node:assert/strict';
import { eventStatus } from '../functions/src/event-status.js';
import { allocate, publicEvent } from '../functions/src/domain.js';
import { createDashboard } from '../functions/src/dashboard.js';

const deadline=Date.parse('2026-10-12T18:00:00+09:00');
const event={status:'open',opensAt:'2026-10-01T00:00:00.000Z',closesAt:'2026-10-12T09:00:00.000Z',capacity:20,registered:0};
test('registration closes at the exact deadline in both status and admission',()=>{
 for(const offset of [-1,0,1]){
  const now=deadline+offset,expected=offset<0?'open':'closed';
  assert.equal(eventStatus(event,now),expected);
  assert.equal(publicEvent(event,now).status,expected);
  if(offset<0)assert.equal(allocate(event,now),'registered');
  else assert.throws(()=>allocate(event,now),error=>error.code==='failed-precondition');
 }
 assert.equal(event.status,'open','Reading must not mutate the stored record');
});
test('manual states and missing or invalid deadlines are preserved',()=>{
 for(const status of ['draft','closed','completed','cancelled'])for(const now of [deadline-1,deadline+1])assert.equal(eventStatus({...event,status},now),status);
 for(const closesAt of [undefined,'','invalid'])assert.equal(eventStatus({...event,closesAt},deadline),'open');
});

test('dashboard includes the deadline and reports closure using the server clock',async()=>{
 const stored={...event,title:'가상 교육',semester:'2026-2',startsAt:'2026-10-13T09:00:00.000Z',endsAt:'2026-10-13T11:00:00.000Z'};
 const col=name=>{
  assert.equal(name,'events');
  return {where:()=>({select:(...fields)=>({get:async()=>({docs:[{id:'test-event',data:()=>Object.fromEntries(fields.filter(key=>key in stored).map(key=>[key,stored[key]]))}]})})})};
 };
 for(const offset of [-1,0,1]){
  const dashboard=createDashboard({col,clock:()=>deadline+offset,settings:async()=>({semester:'2026-2'})});
  const result=await dashboard({},{role:'custom',permissions:['events']});
  assert.equal(result.counts.events,1);
  assert.equal(result.events[0].closesAt,event.closesAt);
  assert.equal(result.events[0].status,offset<0?'open':'closed');
 }
});
