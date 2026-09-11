import test from 'node:test';import assert from 'node:assert/strict';
import { allocate,ensureScope,changeStock,stockTotal,validateEvent,identity,matches,hash,requireRevision } from '../functions/src/domain.js';
const now=Date.now(),future=ms=>new Date(now+ms).toISOString();
const event={status:'open',opensAt:future(-10000),closesAt:future(10000),startsAt:future(20000),endsAt:future(30000),cancelUntil:future(10000),capacity:2,registered:1,waiting:0,fee:0,waitlist:true};
test('seat allocation includes reservations, preserves queue priority and closing boundary',()=>{assert.equal(allocate(event,now),'registered');assert.equal(allocate({...event,registered:2},now),'waiting');assert.equal(allocate({...event,waiting:1},now),'waiting');assert.throws(()=>allocate({...event,closesAt:future(0)},now));assert.throws(()=>allocate({...event,registered:2,waitlist:false},now));});
test('only active unexpired designated staff receive the requested scope',()=>{const p={role:'inventory',active:true,expiresAt:future(99999)};assert.throws(()=>ensureScope(p,'members',now));assert.throws(()=>ensureScope({...p,role:'education'},'finance',now));assert.throws(()=>ensureScope({...p,role:'owner',expiresAt:future(-1)},'finance',now));assert.doesNotThrow(()=>ensureScope({...p,role:'finance'},'finance',now));});
test('bottle opening does not create volume and ten-percent use is exact',()=>{const item={unit:'bottle',size:700,quantity:2,bottles:{}};const opened=changeStock(item,{action:'open',requestId:'b1',amount:0});assert.equal(stockTotal(item),stockTotal(opened));const used=changeStock(opened,{action:'remaining',bottleId:'b1',percent:60,amount:0});assert.equal(stockTotal(used),1120);assert.throws(()=>changeStock(used,{action:'remaining',bottleId:'b1',percent:70,amount:0}));assert.throws(()=>changeStock(item,{action:'use',amount:3}));});
test('movement preserves volume, fractional count units are rejected',()=>{const item={unit:'each',quantity:4,bottles:{},location:'A'};assert.equal(stockTotal(changeStock(item,{action:'move',amount:0,location:'B'})),4);assert.throws(()=>changeStock(item,{action:'use',amount:.5}));});
test('event changes protect reserved seats and allow fees without legacy instructions',()=>{assert.throws(()=>validateEvent(event,3));assert.doesNotThrow(()=>validateEvent({...event,fee:10000},0));assert.doesNotThrow(()=>validateEvent(event,1));});
test('identity normalizes phone formatting but does not merge different members',()=>{assert.equal(identity('2026001','010-1234-5678'),identity('2026001','01012345678'));assert.notEqual(identity('2026001','01012345678'),identity('2026002','01012345678'));});
test('receipt capability and optimistic revision checks reject invalid access',()=>{assert.equal(matches('a'.repeat(64),hash('a'.repeat(64))),true);assert.equal(matches('b'.repeat(64),hash('a'.repeat(64))),false);assert.throws(()=>requireRevision({revision:2},1));});

test('malformed staff expiration fails closed',()=>{assert.throws(()=>ensureScope({role:'owner',active:true,expiresAt:'not-a-date'},'finance',now));});


test('joining links accept only HTTPS Kakao open-chat rooms',async()=>{
 const {openChatUrl}=await import('../functions/src/public-links.js');
 assert.equal(openChatUrl('https://open.kakao.com/o/testClub'),'https://open.kakao.com/o/testClub');
 assert.equal(openChatUrl('https://open.kakao.com/o/testClub/?from=site'),'https://open.kakao.com/o/testClub/?from=site');
 for(const value of ['',undefined,'http://open.kakao.com/o/testClub','javascript:alert(1)','https://open.kakao.com.evil.example/o/testClub','https://open.kakao.com@evil.example/o/testClub','https://evil.example@open.kakao.com/o/testClub','https://open.kakao.com:444/o/testClub','https://open.kakao.com/','https://example.com/form'])assert.equal(openChatUrl(value),'');
});
