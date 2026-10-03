import test from 'node:test';
import assert from 'node:assert/strict';
import { COUPON_CAPACITY, planCouponStamp, validateCouponStampCount } from '../functions/src/coupons.js';

test('one coupon accepts integer stamp counts from zero through ten',()=>{
 assert.equal(COUPON_CAPACITY,10);
 for(const count of [0,1,9,10])assert.equal(validateCouponStampCount(count),count);
 for(const count of [-1,11,1.5,'10',NaN,Infinity])assert.throws(()=>validateCouponStampCount(count),e=>e.code==='invalid-argument');
});

test('stamp planning caps at ten and never resets or creates an unspecified reward',()=>{
 const state={stampCount:8,revision:3},command={requestId:'stamp-one',expectedRevision:3,amount:2};
 const planned=planCouponStamp(state,command);
 assert.deepEqual(planned,{state:{stampCount:10,revision:4},command,duplicate:false});
 assert.deepEqual(state,{stampCount:8,revision:3});
 assert.equal(planned.reward,undefined);assert.equal(planned.redeemed,undefined);
 assert.throws(()=>planCouponStamp(planned.state,{requestId:'stamp-overflow',expectedRevision:4,amount:1}),e=>e.code==='failed-precondition');
 assert.throws(()=>planCouponStamp(planned.state,{requestId:'stamp-zero',expectedRevision:4,amount:0}),e=>e.code==='invalid-argument');
});

test('exact command retries do not add stamps and a changed reused request is rejected',()=>{
 const command={requestId:'stamp-retry',expectedRevision:1,amount:3};
 const planned=planCouponStamp({stampCount:0,revision:1},command);
 const replay=planCouponStamp(planned.state,command,planned.command);
 assert.equal(replay.duplicate,true);assert.deepEqual(replay.state,planned.state);
 assert.throws(()=>planCouponStamp(planned.state,{...command,amount:4},planned.command),e=>e.code==='already-exists');
 assert.throws(()=>planCouponStamp(planned.state,{...command,expectedRevision:2},planned.command),e=>e.code==='already-exists');
});

test('a concurrent command with a stale revision must retry against the new state',()=>{
 const first=planCouponStamp({stampCount:7,revision:1},{requestId:'stamp-first',expectedRevision:1,amount:2});
 assert.throws(()=>planCouponStamp(first.state,{requestId:'stamp-second',expectedRevision:1,amount:2}),e=>e.code==='aborted');
 assert.throws(()=>planCouponStamp(first.state,{requestId:'stamp-second',expectedRevision:2,amount:2}),e=>e.code==='failed-precondition');
 assert.deepEqual(first.state,{stampCount:9,revision:2});
});

test('inactive command preparation validates input without accepting extra operations',()=>{
 const state={stampCount:0,revision:1},command={requestId:'stamp-validation',expectedRevision:1,amount:1};
 for(const extra of [{amount:0},{amount:-1},{amount:11},{amount:1.5},{expectedRevision:0},{requestId:''},{action:'redeem'}])assert.throws(()=>planCouponStamp(state,{...command,...extra}),e=>e.code==='invalid-argument');
 for(const extra of [{stampCount:11},{stampCount:-1},{revision:0},{reward:'free-drink'}])assert.throws(()=>planCouponStamp({...state,...extra},command),e=>e.code==='invalid-argument');
});
