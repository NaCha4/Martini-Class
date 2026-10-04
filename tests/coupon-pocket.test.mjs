import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCouponReveal } from '../web/src/coupon-pocket.js';

class Events{
 listeners=new Map();
 addEventListener(type,handler,options){const entries=this.listeners.get(type)||[];entries.push({handler,options});this.listeners.set(type,entries);}
 removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(entry=>entry.handler!==handler));}
 emit(type,properties={}){
  const event={type,target:this,currentTarget:this,cancelable:true,defaultPrevented:false,propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...properties};
  for(const {handler} of [...(this.listeners.get(type)||[])])handler(event);
  return event;
 }
 listenerCount(){return [...this.listeners.values()].reduce((total,entries)=>total+entries.length,0);}
}

function fixture(){
 const card=new Events(),win=new Events(),doc=new Events(),classes=new Set(),properties=new Map(),captures=new Set();
 const reveals=[];doc.defaultView=win;doc.hidden=false;
 Object.assign(card,{ownerDocument:doc,classes,properties,captures,captureCalls:[],releaseCalls:[],classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name))},style:{setProperty:(name,value)=>properties.set(name,value)},setPointerCapture(id){captures.add(id);card.captureCalls.push(id);},hasPointerCapture:id=>captures.has(id),releasePointerCapture(id){captures.delete(id);card.releaseCalls.push(id);card.emit('lostpointercapture',{pointerId:id});}});
 const cleanup=bindCouponReveal(card,()=>reveals.push({pull:properties.get('--coupon-pull'),pulling:classes.has('is-pulling'),captures:captures.size}));
 return {card,win,doc,reveals,cleanup,down(extra={}){return card.emit('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:100,...extra});},move(dx,dy,extra={}){return win.emit('pointermove',{pointerId:1,clientX:100+dx,clientY:100+dy,...extra});},up(extra={}){return win.emit('pointerup',{pointerId:1,...extra});},click(extra={}){return card.emit('click',{detail:1,button:0,...extra});}};
}

function atRest(f){assert.equal(f.card.classes.has('is-pulling'),false);assert.equal(f.card.properties.get('--coupon-pull'),'0px');assert.equal(f.card.captures.size,0);}

test('a coupon opens through a tap or a keyboard-generated click without needing a drag',()=>{
 const f=fixture();f.down();f.up();assert.equal(f.reveals.length,0);atRest(f);
 f.click();assert.equal(f.reveals.length,1);
 f.click({detail:0});assert.equal(f.reveals.length,2);f.cleanup();
});

test('an upward pull of 40 pixels opens once and consumes its synthetic click after resetting the card',()=>{
 const f=fixture();assert.equal(f.down().defaultPrevented,false);
 assert.equal(f.move(0,-7).defaultPrevented,false);assert.equal(f.card.classes.has('is-pulling'),false);
 assert.equal(f.move(0,-40).defaultPrevented,true);assert.equal(f.card.properties.get('--coupon-pull'),'40px');assert.equal(f.card.classes.has('is-pulling'),true);
 f.up();atRest(f);assert.deepEqual(f.reveals,[{pull:'0px',pulling:false,captures:0}]);assert.deepEqual(f.card.releaseCalls,[1]);
 const click=f.click();assert.equal(click.defaultPrevented,true);assert.equal(click.propagationStopped,true);assert.equal(f.reveals.length,1);
 f.down();f.up();f.click();assert.equal(f.reveals.length,2);f.cleanup();
});

test('short, sideways, and downward drags do not open, even if a cancelled gesture later turns upward',()=>{
 for(const moves of [[[0,-20]],[[45,-5]],[[0,30]],[[45,-5],[0,-80]],[[0,30],[0,-80]]]){
  const f=fixture();f.down();for(const [dx,dy] of moves)f.move(dx,dy);f.up();
  assert.equal(f.click().defaultPrevented,true);assert.equal(f.reveals.length,0);atRest(f);f.cleanup();
 }
});

test('cancellation, capture loss, focus loss, and a hidden page cancel a completed pull before release',()=>{
 for(const cancel of [f=>f.win.emit('pointercancel',{pointerId:1}),f=>f.card.emit('lostpointercapture',{pointerId:1}),f=>f.card.emit('blur'),f=>f.win.emit('blur'),f=>{f.doc.hidden=true;f.doc.emit('visibilitychange');}]){
  const f=fixture();f.down();f.move(0,-60);cancel(f);atRest(f);
  f.up();assert.equal(f.click().defaultPrevented,true);assert.equal(f.reveals.length,0);f.cleanup();
 }
});

test('nonprimary pointers and secondary buttons cannot pull, and unrelated pointers cannot finish a pull',()=>{
 const f=fixture();
 for(const extra of [{isPrimary:false},{button:1},{button:2}]){f.down(extra);assert.equal(f.move(0,-60).defaultPrevented,false);f.up();}
 assert.deepEqual(f.card.captureCalls,[]);assert.equal(f.reveals.length,0);
 f.down();f.move(0,-60);f.down({pointerId:2,isPrimary:false});f.move(0,60,{pointerId:2});f.up({pointerId:2});f.win.emit('pointercancel',{pointerId:2});
 assert.equal(f.card.properties.get('--coupon-pull'),'60px');assert.equal(f.reveals.length,0);assert.deepEqual(f.card.captureCalls,[1]);
 f.up();assert.equal(f.reveals.length,1);atRest(f);f.cleanup();
});

test('a child losing capture does not cancel the pull and unavailable capture still allows window release',()=>{
 const f=fixture();f.down();f.move(0,-40);f.card.emit('lostpointercapture',{pointerId:1,target:new Events()});
 f.up();assert.equal(f.reveals.length,1);atRest(f);f.cleanup();
 const fallback=fixture();fallback.card.setPointerCapture=()=>{throw new Error('capture unavailable');};
 fallback.down();fallback.move(0,-40);fallback.up();assert.equal(fallback.reveals.length,1);atRest(fallback);fallback.cleanup();
});

test('keyboard activation remains available after a cancelled or insufficient pull',()=>{
 for(const finish of [f=>f.up(),f=>f.win.emit('pointercancel',{pointerId:1})]){
  const f=fixture();f.down();f.move(0,-20);finish(f);atRest(f);
  assert.equal(f.reveals.length,0);f.click({detail:0});assert.equal(f.reveals.length,1);
  f.cleanup();
 }
});

test('cleanup releases capture, resets the visual pull, and removes every listener exactly once',()=>{
 const f=fixture();f.down();f.move(0,-60);f.cleanup();f.cleanup();atRest(f);
 assert.deepEqual(f.card.releaseCalls,[1]);for(const target of [f.card,f.win,f.doc])assert.equal(target.listenerCount(),0);
 f.down();f.move(0,-100);f.up();f.click();assert.equal(f.reveals.length,0);atRest(f);
 bindCouponReveal(null,()=>assert.fail('No card must not reveal'))();
});
