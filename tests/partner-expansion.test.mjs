import test from 'node:test';
import assert from 'node:assert/strict';
import { animatePartnerPhoto, coverImageRect } from '../web/src/partner-expansion.js';

const closeTo=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} should be close to ${expected}`);

test('the opening photo starts with the exact visible card crop without stretching its artwork',()=>{
 const rect=coverImageRect({left:20,top:84,width:340,height:154},1672,941,'50% 48%');
 assert.ok(rect);
 closeTo(rect.left,20);closeTo(rect.top,66.0711961722488);
 closeTo(rect.width,340);closeTo(rect.height,191.35167464114832);
 closeTo(rect.scale,0.20334928229665072);
 closeTo(rect.width/rect.height,1672/941);
 assert.ok(rect.top<84&&rect.top+rect.height>84+154);
});

test('the expanded hero enlarges the same image uniformly and crops the sides to fill its taller frame',()=>{
 const rect=coverImageRect({left:0,top:64,width:390,height:330},1672,941,'50% 45%');
 assert.ok(rect);
 closeTo(rect.left,-98.17747077577047);closeTo(rect.top,64);
 closeTo(rect.width,586.354941551541);closeTo(rect.height,330);
 closeTo(rect.scale,0.35069075451647186);
 closeTo(rect.width/rect.height,1672/941);
 assert.ok(rect.left<0&&rect.left+rect.width>390);
});

test('default cover alignment remains centered when the image needs vertical cropping',()=>{
 const rect=coverImageRect({left:7,top:12,width:400,height:200},100,100);
 assert.deepEqual(rect,{left:7,top:-88,width:400,height:400,scale:4});
});

test('unloaded images and invalid layout measurements cannot produce an animation rectangle',()=>{
 const box={left:20,top:84,width:340,height:154};
 for(const size of [0,-1,NaN,Infinity]){
  assert.equal(coverImageRect(box,size,941),null);
  assert.equal(coverImageRect(box,1672,size),null);
 }
 for(const key of ['left','top','width','height'])for(const value of [NaN,Infinity])assert.equal(coverImageRect({...box,[key]:value},1672,941),null);
 for(const key of ['width','height'])for(const value of [0,-1])assert.equal(coverImageRect({...box,[key]:value},1672,941),null);
 assert.equal(coverImageRect(null,1672,941),null);
});

test('closing during expansion continues from the painted image and owns its layer until disposal',async()=>{
 const previousStyle=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle'),motions=[];
 class Element{
  constructor(){this.style={};this.children=[];this.listeners=new Map();this.computed={};const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};}
  setAttribute(){}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  remove(){this.removed=true;this.parent.children=this.parent.children.filter(child=>child!==this);}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  animate(keyframes,options){let resolve;const motion={element:this,keyframes,options,finished:new Promise(done=>{resolve=done;}),finish:()=>resolve(),cancel:()=>{motion.cancelled=true;resolve();}};motions.push(motion);return motion;}
 }
 const win=new Element(),doc={defaultView:win,createElement:()=>new Element()},dialog=new Element(),photo=new Element(),source=new Element(),hero=new Element(),target=new Element(),scroller=new Element(),copy=new Element();
 dialog.ownerDocument=doc;
 dialog.querySelector=selector=>({'.partner-hero':hero,'.dialog-scroll':scroller})[selector]||null;
 dialog.querySelectorAll=()=>[copy];
 photo.querySelector=()=>source;hero.querySelector=()=>target;
 photo.getBoundingClientRect=()=>({left:20,top:84,width:340,height:154});
 target.getBoundingClientRect=()=>({left:0,top:64,width:390,height:330});
 Object.assign(source,{complete:true,naturalWidth:1672,naturalHeight:941,currentSrc:'/assets/feelingfine-bar-hero.jpg',computed:{objectPosition:'50% 48%'}});
 target.computed={objectPosition:'50% 45%'};
 const view={dialog,origin:{querySelector:()=>photo}},frame={left:0,top:64,right:390,bottom:773,width:390,height:709},options={duration:360,easing:'linear'};
 Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:(element,pseudo)=>pseudo?{backgroundImage:'linear-gradient(transparent,black)'}:element.computed});
 try{
  const opening=animatePartnerPhoto(view,true,frame,options),oldLayer=dialog.children[0],oldViewport=oldLayer.children[0],[oldImage,...oldShades]=oldViewport.children;
  assert.ok(opening);assert.equal(dialog.classList.contains('is-image-expanding'),true);
  assert.equal(motions.find(motion=>motion.element===oldViewport).keyframes[0].clipPath,'inset(20px 30px 535px 20px)');
  assert.equal(oldImage.src,source.currentSrc);
  oldViewport.computed={clipPath:'inset(8px 12px 400px 8px)'};
  oldImage.computed={transform:'matrix(0.28, 0, 0, 0.28, -28, -10)'};
  oldShades.forEach((shade,index)=>{shade.computed={transform:'matrix(0.9, 0, 0, 0.8, 8, 8)',opacity:index?'0.6':'0.4'};});
  copy.computed={opacity:'0.6'};
  const openingMotionCount=motions.length;
  const closing=animatePartnerPhoto(view,false,frame,{...options,duration:240}),newLayer=dialog.children[0],newViewport=newLayer.children[0],newImage=newViewport.children[0];
  assert.ok(closing);assert.equal(oldLayer.removed,true);assert.equal(view.photoTransition,closing);
  assert.equal(motions.find(motion=>motion.element===newViewport).keyframes[0].clipPath,oldViewport.computed.clipPath);
  assert.equal(motions.find(motion=>motion.element===newImage).keyframes[0].transform,oldImage.computed.transform);
  assert.equal(motions.at(-1).keyframes[0].opacity,'0.6');
  await opening.finished;
  assert.deepEqual(dialog.children,[newLayer]);assert.equal(dialog.classList.contains('is-image-expanding'),true);
  for(const motion of motions.slice(openingMotionCount))motion.finish();
  await closing.finished;
  assert.deepEqual(dialog.children,[newLayer]);assert.equal(view.photoTransition,closing);
  closing.cancel();
  assert.equal(dialog.children.length,0);assert.equal(view.photoTransition,null);assert.equal(dialog.classList.contains('is-image-expanding'),false);
  assert.equal(scroller.listeners.get('scroll').size,0);assert.equal(win.listeners.get('resize').size,0);
 }finally{
  view.photoTransition?.cancel();
  if(previousStyle)Object.defineProperty(globalThis,'getComputedStyle',previousStyle);else delete globalThis.getComputedStyle;
 }
});
