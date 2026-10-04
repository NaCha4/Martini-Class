import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCouponMotion } from '../web/src/coupon-motion.js';

class Events{
 listeners=new Map();
 addEventListener(type,handler,options){const listeners=this.listeners.get(type)||[];listeners.push({handler,options});this.listeners.set(type,listeners);}
 removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item.handler!==handler));}
 emit(type,properties={}){const event={type,target:this,currentTarget:this,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...properties};for(const {handler} of [...(this.listeners.get(type)||[])])handler(event);return event;}
 listenerCount(){return [...this.listeners.values()].reduce((count,listeners)=>count+listeners.length,0);}
}
function fixture(count=1,options={}){
 const win=new Events(),doc=new Events(),frames=new Map();let frameId=0;
 doc.defaultView=win;doc.hidden=false;
 win.requestAnimationFrame=callback=>{const id=++frameId;frames.set(id,callback);return id;};
 win.cancelAnimationFrame=id=>frames.delete(id);
 const stages=Array.from({length:count},()=>{
  const stage=new Events(),properties=new Map(),classes=new Set(),captures=new Set();
  Object.assign(stage,{ownerDocument:doc,properties,classes,captures,captureCalls:[],releaseCalls:[],attributes:{'aria-label':'쿠폰 돌려보기',tabindex:'0',role:'button'},style:{setProperty:(name,value)=>properties.set(name,value)},classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name))},getBoundingClientRect:()=>({width:400,height:220}),setPointerCapture(id){captures.add(id);stage.captureCalls.push(id);},releasePointerCapture(id){captures.delete(id);stage.releaseCalls.push(id);stage.emit('lostpointercapture',{pointerId:id});}});
  return stage;
 });
 const root={querySelectorAll:selector=>{assert.equal(selector,'[data-coupon-interactive]');return stages;}};
 const cleanup=bindCouponMotion(root,options),stage=stages[0];
 return {win,doc,stage,stages,frames,cleanup,flush(){for(const [id,callback] of [...frames]){frames.delete(id);callback();}},down(extra={}){return stage.emit('pointerdown',{pointerId:1,pointerType:'mouse',button:0,isPrimary:true,clientX:100,clientY:100,...extra});},move(dx,dy=0,extra={}){return win.emit('pointermove',{pointerId:1,clientX:100+dx,clientY:100+dy,...extra});},up(extra={}){return win.emit('pointerup',{pointerId:1,...extra});}};
}
function rotation(stage){return [stage.properties.get('--coupon-rotate-x'),stage.properties.get('--coupon-rotate-y')];}
function front(f){assert.deepEqual(rotation(f.stage),['0deg','0deg']);assert.equal(f.stage.classes.has('is-dragging'),false);assert.equal(f.frames.size,0);assert.equal(f.stage.captures.size,0);}

test('horizontal drag reveals the back using untransformed stage width and returns to the front on release',()=>{
 const f=fixture();f.down();assert.deepEqual(f.stage.captureCalls,[]);
 const event=f.move(300);assert.equal(event.defaultPrevented,true);assert.deepEqual(f.stage.captureCalls,[1]);
 assert.equal(f.stage.classes.has('is-dragging'),true);assert.equal(f.stage.classes.has('has-interacted'),true);
 f.flush();assert.deepEqual(rotation(f.stage),['0deg','180deg']);
 f.up();front(f);assert.deepEqual(f.stage.releaseCalls,[1]);assert.equal(f.stage.classes.has('has-interacted'),true);
 assert.deepEqual(f.stage.attributes,{'aria-label':'쿠폰 돌려보기',tabindex:'0',role:'button'});f.cleanup();
});

test('drag frames coalesce the latest position, clamp both axes, and cannot revive after release',()=>{
 const f=fixture();f.down();f.move(30);f.move(-1000,1000);
 assert.equal(f.frames.size,1);f.flush();assert.deepEqual(rotation(f.stage),['-22deg','-190deg']);
 f.move(1000,-1000);assert.equal(f.frames.size,1);f.flush();assert.deepEqual(rotation(f.stage),['22deg','190deg']);
 f.move(100);const late=[...f.frames.values()][0];f.up();front(f);late();front(f);f.cleanup();
});

test('vertical touch panning is never prevented or captured, including subsequent sideways movement',()=>{
 const f=fixture();const down=f.down({pointerType:'touch'});assert.equal(down.defaultPrevented,false);
 assert.equal(f.move(2,4).defaultPrevented,false);assert.deepEqual(f.stage.captureCalls,[]);
 assert.equal(f.move(4,12).defaultPrevented,false);assert.equal(f.move(300,15).defaultPrevented,false);f.flush();front(f);
 assert.deepEqual(f.stage.captureCalls,[]);assert.equal(f.stage.classes.has('has-interacted'),false);f.cleanup();
});

test('horizontal touch intention captures only after the threshold, while pen supports a vertical tilt',()=>{
 const f=fixture();f.down({pointerType:'touch'});assert.equal(f.move(5,1).defaultPrevented,false);
 assert.deepEqual(f.stage.captureCalls,[]);assert.equal(f.move(7,2).defaultPrevented,true);f.flush();assert.notEqual(rotation(f.stage)[1],'0deg');f.up();front(f);
 f.down({pointerType:'pen'});assert.equal(f.move(0,110).defaultPrevented,true);f.flush();assert.deepEqual(rotation(f.stage),['-22deg','0deg']);f.cleanup();front(f);
});

test('transferring implicit touch capture from a coupon face to its stage does not end the drag',()=>{
 const f=fixture(),face=new Events();
 f.down({pointerType:'touch',target:face});f.move(30,2);
 assert.deepEqual(f.stage.captureCalls,[1]);
 // Mobile browsers release the originally touched face when its parent captures.
 // That child's lostpointercapture bubbles through the stage before the next move.
 f.stage.emit('lostpointercapture',{pointerId:1,target:face});
 assert.equal(f.stage.classes.has('is-dragging'),true);
 assert.equal(f.move(300).defaultPrevented,true);f.flush();
 assert.deepEqual(rotation(f.stage),['0deg','180deg']);
 f.up();front(f);assert.deepEqual(f.stage.releaseCalls,[1]);f.cleanup();
});

test('abandoned touch scrolling also releases browser-provided implicit capture',()=>{
 const f=fixture();f.stage.hasPointerCapture=id=>f.stage.captures.has(id);
 f.down({pointerType:'touch'});f.stage.captures.add(1);
 assert.equal(f.move(2,20).defaultPrevented,false);front(f);assert.deepEqual(f.stage.releaseCalls,[1]);f.cleanup();
});

test('window events still complete the gesture when explicit capture is unavailable',()=>{
 const f=fixture();f.stage.setPointerCapture=()=>{throw new Error('capture unavailable');};
 f.down();f.move(300);f.flush();assert.deepEqual(rotation(f.stage),['0deg','180deg']);f.up();front(f);f.cleanup();
});

test('nonprimary pointers, secondary mouse buttons, and other pointers cannot start or end a gesture',()=>{
 const f=fixture();
 for(const extra of [{isPrimary:false},{button:1},{button:2}]){f.down(extra);f.move(300);f.flush();front(f);}
 assert.deepEqual(f.stage.captureCalls,[]);
 f.down({pointerType:'touch'});f.move(300);f.flush();
 f.down({pointerId:2,isPrimary:false});assert.equal(f.move(-300,0,{pointerId:2}).defaultPrevented,false);f.up({pointerId:2});f.flush();
 assert.deepEqual(rotation(f.stage),['0deg','180deg']);assert.deepEqual(f.stage.captureCalls,[1]);f.up();front(f);f.cleanup();
});

test('pointer cancellation, capture loss, focus loss, and hidden documents all restore the front',()=>{
 for(const cancel of [f=>f.win.emit('pointercancel',{pointerId:1}),f=>f.stage.emit('lostpointercapture',{pointerId:1}),f=>f.win.emit('blur'),f=>f.stage.emit('blur'),f=>{f.doc.hidden=true;f.doc.emit('visibilitychange');}]){
  const f=fixture();f.down();f.move(300);f.flush();f.move(-300);cancel(f);front(f);f.flush();front(f);f.cleanup();
 }
});

test('held keyboard controls rotate accessibly and release or Escape returns the front',()=>{
 const f=fixture();
 for(const [key,expected] of [['ArrowLeft',['0deg','-180deg']],['ArrowRight',['0deg','180deg']],['ArrowUp',['22deg','0deg']],['ArrowDown',['-22deg','0deg']],[' ',['0deg','180deg']],['Enter',['0deg','180deg']]]){
  assert.equal(f.stage.emit('keydown',{key}).defaultPrevented,true);f.flush();assert.deepEqual(rotation(f.stage),expected);
  assert.equal(f.win.emit('keyup',{key}).defaultPrevented,true);front(f);
 }
 f.stage.emit('keydown',{key:'ArrowRight'});f.stage.emit('keydown',{key:'ArrowUp'});f.flush();assert.deepEqual(rotation(f.stage),['22deg','180deg']);
 f.win.emit('keyup',{key:'ArrowUp'});f.flush();assert.deepEqual(rotation(f.stage),['0deg','180deg']);
 assert.equal(f.stage.emit('keydown',{key:'Escape'}).defaultPrevented,true);front(f);
 assert.equal(f.stage.emit('keydown',{key:'Escape'}).defaultPrevented,false);
 assert.equal(f.stage.emit('keydown',{key:'ArrowLeft',ctrlKey:true}).defaultPrevented,false);assert.equal(f.stage.emit('keydown',{key:'Tab'}).defaultPrevented,false);front(f);f.cleanup();
});

test('cleanup releases capture, cancels pending frames, removes every listener, and is idempotent',()=>{
 const f=fixture(2);f.down();f.move(300);const late=[...f.frames.values()][0];
 f.cleanup();front(f);f.cleanup();late();front(f);
 for(const target of [f.win,f.doc,...f.stages])assert.equal(target.listenerCount(),0);
 assert.deepEqual(f.stage.releaseCalls,[1]);f.down();f.move(300);f.stage.emit('keydown',{key:'Enter'});f.flush();front(f);
});

test('a root without interactive coupons is a no-op and requires no browser globals',()=>{
 const cleanup=bindCouponMotion({querySelectorAll:()=>[]});assert.equal(typeof cleanup,'function');cleanup();cleanup();
 bindCouponMotion(null)();
});

test('a member card tap activates once on click, including a small amount of touch movement',()=>{
 const activations=[],f=fixture(1,{onActivate:(event,stage)=>activations.push({event,stage})});
 f.down({pointerType:'touch'});f.move(3,2);f.up();
 assert.equal(activations.length,0);
 const click=f.stage.emit('click',{button:0,detail:1});
 assert.equal(activations.length,1);assert.equal(activations[0].event,click);assert.equal(activations[0].stage,f.stage);front(f);
 f.stage.emit('click',{button:2,detail:1});assert.equal(activations.length,1);
 // Assistive technology can invoke the accessible card without pointer events.
 f.stage.emit('click',{detail:0});assert.equal(activations.length,2);front(f);f.cleanup();
});

test('a member drag or page scroll suppresses its following click, while the next tap still works',()=>{
 for(const [dx,dy,pointerType] of [[6,0,'mouse'],[0,12,'touch']]){
  let activations=0;const f=fixture(1,{onActivate:()=>activations++});
  f.down({pointerType});f.move(dx,dy);f.flush();f.up();
  assert.equal(f.stage.emit('click',{button:0,detail:1}).defaultPrevented,true);assert.equal(activations,0);front(f);
  f.down({pointerType});f.up();f.stage.emit('click',{button:0,detail:1});assert.equal(activations,1);front(f);f.cleanup();
 }
});

test('member Enter and Space activate once per press without scrolling, while arrow keys tilt',()=>{
 let activations=0;const f=fixture(1,{onActivate:()=>activations++});
 f.stage.emit('keydown',{key:'ArrowRight'});f.flush();assert.deepEqual(rotation(f.stage),['0deg','22deg']);
 for(const key of ['Enter',' ','Spacebar']){
  const before=activations;
  assert.equal(f.stage.emit('keydown',{key}).defaultPrevented,true);assert.equal(activations,before+1);front(f);
  assert.equal(f.stage.emit('keydown',{key,repeat:true}).defaultPrevented,true);
  f.stage.emit('keydown',{key});assert.equal(activations,before+1);
  assert.equal(f.stage.emit('click',{detail:0}).defaultPrevented,true);assert.equal(activations,before+1);
  assert.equal(f.win.emit('keyup',{key}).defaultPrevented,true);front(f);
 }
 assert.equal(f.stage.emit('keydown',{key:'Enter',ctrlKey:true}).defaultPrevented,false);assert.equal(activations,3);f.cleanup();
});

test('an assistive click still activates after a member drag that did not emit a pointer click',()=>{
 let activations=0;const f=fixture(1,{onActivate:()=>activations++});
 f.down();f.move(20);f.up();f.stage.emit('click',{detail:0});assert.equal(activations,1);front(f);
 f.down();f.move(20);f.up();f.stage.emit('keydown',{key:'Enter'});assert.equal(activations,2);
 assert.equal(f.stage.emit('click',{detail:0}).defaultPrevented,true);assert.equal(activations,2);
 f.win.emit('keyup',{key:'Enter'});front(f);f.cleanup();
});

test('a locked member card cancels queued movement and ignores pointer, keyboard, and activation inputs',()=>{
 let allowed=true,activations=0;const f=fixture(1,{canInteract:()=>allowed,onActivate:()=>activations++});
 f.down();f.move(100);assert.equal(f.frames.size,1);
 allowed=false;f.flush();front(f);assert.deepEqual(f.stage.releaseCalls,[1]);
 f.up();f.stage.emit('click',{detail:1});
 f.down();assert.equal(f.move(300).defaultPrevented,false);
 for(const key of ['ArrowRight','Enter',' ']){
  assert.equal(f.stage.emit('keydown',{key}).defaultPrevented,true);f.win.emit('keyup',{key});
 }
 f.flush();front(f);assert.equal(activations,0);
 allowed=true;f.stage.emit('keydown',{key:'ArrowLeft'});f.flush();assert.deepEqual(rotation(f.stage),['0deg','-22deg']);
 allowed=false;f.win.emit('keyup',{key:'ArrowLeft'});front(f);
 allowed=true;f.down();f.up();f.stage.emit('click',{detail:1});assert.equal(activations,1);front(f);f.cleanup();
});

test('starting QR issuance resets a tilted member card before the callback locks it',()=>{
 let pending=false,activations=0;const f=fixture(1,{canInteract:()=>!pending,onActivate:()=>{front(f);pending=true;activations++;}});
 f.stage.emit('keydown',{key:'ArrowUp'});f.flush();assert.deepEqual(rotation(f.stage),['22deg','0deg']);
 f.stage.emit('keydown',{key:'Enter'});assert.equal(activations,1);front(f);
 f.stage.emit('click',{detail:1});f.stage.emit('keydown',{key:'Enter',repeat:true});f.flush();front(f);assert.equal(activations,1);
 f.cleanup();
});

test('member motion cleanup removes activation handlers and makes a late drag frame harmless',()=>{
 let activations=0;const f=fixture(1,{onActivate:()=>activations++});
 f.down();f.move(100);const late=[...f.frames.values()][0];f.cleanup();late();front(f);
 for(const target of [f.win,f.doc,f.stage])assert.equal(target.listenerCount(),0);
 f.stage.emit('click',{detail:1});f.stage.emit('keydown',{key:'Enter'});assert.equal(activations,0);f.cleanup();
});
