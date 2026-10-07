import test from 'node:test';
import assert from 'node:assert/strict';
import { bindEquipmentPullRefresh } from '../web/src/equipment-pull-refresh.js';

class Events{
 listeners=new Map();
 addEventListener(type,fn,options){const list=this.listeners.get(type)||[];list.push({fn,options});this.listeners.set(type,list);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item.fn!==fn));}
 emit(type,extra={}){const event={target:this,cancelable:true,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const {fn} of this.listeners.get(type)||[])fn(event);return event;}
 count(){return [...this.listeners.values()].reduce((count,list)=>count+list.length,0);}
}
const point=(y=100,x=100,id=1)=>({clientY:y,clientX:x,identifier:id});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(refresh=async()=>{}){
 const doc=new Events(),win=new Events(),surface=new Events(),states=[],errors=[];let allowed=true,calls=0;
 doc.defaultView=win;doc.hidden=false;doc.scrollingElement={scrollTop:0};win.scrollY=0;surface.ownerDocument=doc;surface.isConnected=true;surface.closest=()=>null;
 const controller=bindEquipmentPullRefresh(surface,async()=>{calls++;await refresh();},{enabled:()=>allowed,onState:state=>states.push(state),onError:error=>errors.push(error)});
 return {doc,win,surface,states,errors,controller,get calls(){return calls;},allow:value=>{allowed=value;},start:(extra={})=>surface.emit('touchstart',{touches:[point()],...extra}),move:(dy,dx=0,extra={})=>surface.emit('touchmove',{touches:[point(100+dy,100+dx)],...extra}),end:(extra={})=>surface.emit('touchend',{touches:[],changedTouches:[point()],...extra})};
}

test('a downward pull at the top refreshes on release once, including overlapping button refreshes',async()=>{
 let done;const f=fixture(()=>new Promise(resolve=>{done=resolve;}));
 f.start();assert.equal(f.move(5).defaultPrevented,false);assert.equal(f.move(90).defaultPrevented,true);assert.equal(f.calls,0);assert.equal(f.states.at(-1).phase,'ready');
 f.end();assert.equal(f.calls,1);assert.equal(f.states.at(-1).phase,'refreshing');
 f.start();f.move(120);f.end();assert.equal(await f.controller.refresh(),false);assert.equal(f.calls,1);
 done();await tick();assert.equal(f.states.at(-1).phase,'idle');f.controller.dispose();
});

test('short or reversed pulls do not refresh or accidentally open the card, while keyboard clicks still work',()=>{
 for(const distances of [[40],[100,20]]){
  const f=fixture();f.start();for(const distance of distances)f.move(distance);f.end();assert.equal(f.calls,0);
  assert.equal(f.surface.emit('click',{detail:0}).defaultPrevented,false);
  const click=f.surface.emit('click',{detail:1});assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);
  f.start();f.end();assert.equal(f.surface.emit('click',{detail:1}).defaultPrevented,false);f.controller.dispose();
 }
});

test('normal scrolling, sideways swipes, toolbar controls and noncancelable browser gestures stay native',()=>{
 for(const scenario of ['scrolled','up','side','control','browser']){
  const f=fixture();if(scenario==='scrolled')f.win.scrollY=200;
  f.start(scenario==='control'?{target:{closest:()=>({})}}:{});
  const event=f.move(scenario==='up'?-100:100,scenario==='side'?200:0,scenario==='browser'?{cancelable:false}:{});
  f.move(150);f.end();assert.equal(event.defaultPrevented,false,scenario);assert.equal(f.calls,0,scenario);f.controller.dispose();
 }
});

test('touch cancellation, multiple fingers, hidden pages and leaving the view cancel ready pulls',()=>{
 for(const cancel of [f=>f.surface.emit('touchcancel'),f=>f.move(100,0,{touches:[point(),point(100,100,2)]}),f=>{f.doc.hidden=true;f.doc.emit('visibilitychange');},f=>f.allow(false),f=>f.win.emit('blur'),f=>f.win.emit('pagehide')]){
  const f=fixture();f.start();f.move(100);cancel(f);f.end();assert.equal(f.calls,0);assert.equal(f.states.at(-1).phase,'idle');f.controller.dispose();
 }
 const f=fixture();f.start();f.move(100);f.end({changedTouches:[point(100,100,2)]});assert.equal(f.calls,0);f.controller.dispose();
});

test('a failed refresh releases loading state and allows a deliberate retry',async()=>{
 let fail=true;const f=fixture(async()=>{if(fail)throw Error('offline');});
 assert.equal(await f.controller.refresh(),false);assert.equal(f.errors.length,1);assert.equal(f.states.at(-1).phase,'idle');
 fail=false;assert.equal(await f.controller.refresh(),true);assert.equal(f.calls,2);assert.equal(f.states.at(-1).phase,'idle');f.controller.dispose();
});

test('disposing on navigation removes listeners and a late result cannot change the old view',async()=>{
 let done;const f=fixture(()=>new Promise(resolve=>{done=resolve;})),pending=f.controller.refresh();
 f.controller.dispose();f.controller.dispose();const count=f.states.length;
 for(const target of [f.surface,f.doc,f.win])assert.equal(target.count(),0);
 done();await pending;assert.equal(f.states.length,count);assert.equal(await f.controller.refresh(),false);
 bindEquipmentPullRefresh(null,()=>assert.fail('No surface')) .dispose();
});
