import test from 'node:test';
import assert from 'node:assert/strict';
import { liftCouponFromPocket,turnCouponIntoPlace } from '../web/src/coupon-reveal.js';

function fixture({reduced=false,hidden=false}={}){
 const animations=[],doc={hidden,defaultView:{matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({transform:'matrix(1,0,0,1,-150,-38)'})}};
 const element=rect=>({ownerDocument:doc,getBoundingClientRect:()=>rect,animate(keyframes,options){
  let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const animation={keyframes,options,finished,cancelled:0,finish:resolve,cancel(){this.cancelled++;reject(new Error('Animation cancelled'));}};
  animations.push(animation);return animation;
 }});
 const card=element({left:30,top:350,width:300,height:165}),floating=element({left:10,top:140,width:400,height:220});
 const dialog={querySelector:selector=>{assert.equal(selector,'.partner-coupon-float');return floating;}};
 return {animations,card,floating,dialog};
}

test('the paper lifts from its current transform, then its back turns into the front at the final card position',async()=>{
 const f=fixture(),lift=liftCouponFromPocket(f.card),lifting=f.animations[0];
 assert.equal(lifting.keyframes[0].transform,'matrix(1,0,0,1,-150,-38)');
 assert.equal(lifting.keyframes[1].transform,'translate(-50%,-123.75px) rotate(-2.5deg)');
 assert.equal(lifting.options.fill,'both');lifting.finish();await lift.finished;
 assert.equal(lifting.cancelled,0,'The lifted paper stays visible while the read is pending.');
 const turn=turnCouponIntoPlace(f.dialog,{left:30,top:226.25,width:300,height:165}),turning=f.animations[1];
 assert.equal(turning.keyframes[0].transform,'translate(-30px,58.75px) scale(0.75) rotateZ(-2.5deg) rotateY(180deg)');
 assert.equal(turning.keyframes.at(-1).transform,'translate(0px,0px) scale(1) rotateZ(-2deg) rotateY(360deg)');
 turning.finish();await turn.finished;assert.equal(turning.cancelled,1,'The wrapper returns to its natural CSS rotation.');
 lift.cancel();assert.equal(lifting.cancelled,1);
});

test('reduced motion and a hidden document skip both phases without delaying readiness',async()=>{
 for(const options of [{reduced:true},{hidden:true}]){
  const f=fixture(options),lift=liftCouponFromPocket(f.card),turn=turnCouponIntoPlace(f.dialog,{left:30,top:226.25,width:300,height:165});
  await Promise.all([lift.finished,turn.finished]);lift.cancel();turn.cancel();assert.deepEqual(f.animations,[]);
 }
});

test('closing during either phase cancels once and resolves its finished promise',async()=>{
 const f=fixture(),lift=liftCouponFromPocket(f.card),turn=turnCouponIntoPlace(f.dialog,{left:30,top:226.25,width:300,height:165});
 lift.cancel();lift.cancel();turn.cancel();turn.cancel();
 await Promise.all([lift.finished,turn.finished]);
 assert.deepEqual(f.animations.map(animation=>animation.cancelled),[1,1]);
 const fallback=turnCouponIntoPlace(f.dialog,{left:NaN,top:0,width:0,height:0});await fallback.finished;fallback.cancel();
 assert.equal(f.animations.length,2);
});
