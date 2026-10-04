const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const motionKeys=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter']);
const keyName=event=>event.key==='Spacebar'?' ':event.key;

function bindStage(stage,{onActivate,canInteract}={}){
 const doc=stage.ownerDocument,win=doc?.defaultView||globalThis.window;
 const listeners=[],keys=new Set(),activationKeys=new Set(),activates=typeof onActivate==='function';
 let pointer=null,frame=null,disposed=false,nextX=0,nextY=0,suppressClick=false;
 const listen=(target,type,handler,options)=>{
  if(!target?.addEventListener)return;
  target.addEventListener(type,handler,options);
  listeners.push(()=>target.removeEventListener(type,handler,options));
 };
 const paint=(x,y)=>{
  stage.style.setProperty('--coupon-rotate-x',(Math.round(x*100)/100)+'deg');
  stage.style.setProperty('--coupon-rotate-y',(Math.round(y*100)/100)+'deg');
 };
 const cancelFrame=()=>{if(frame!==null){win?.cancelAnimationFrame?.(frame);frame=null;}};
 const rotate=(x,y)=>{
  nextX=x;nextY=y;
  if(frame!==null)return;
  if(!win?.requestAnimationFrame){paint(x,y);return;}
  frame=win.requestAnimationFrame(()=>{frame=null;if(interactive())paint(nextX,nextY);});
 };
 const reset=()=>{
  const previous=pointer;
  pointer=null;keys.clear();activationKeys.clear();cancelFrame();nextX=0;nextY=0;
  stage.classList.remove('is-dragging');paint(0,0);
  // Clear state before release, which can synchronously emit lostpointercapture.
  if(previous&&(previous.captured||stage.hasPointerCapture?.(previous.id))){try{stage.releasePointerCapture(previous.id);}catch{/* The browser may already have released it. */}}
 };
 const interactive=()=>{
  if(disposed||doc?.hidden||typeof canInteract==='function'&&!canInteract()){reset();return false;}
  return true;
 };
 const engage=()=>{stage.classList.add('is-dragging','has-interacted');};
 const down=event=>{
  if(!interactive()||pointer||event.isPrimary===false||event.button!==0)return;
  reset();suppressClick=false;
  const rect=stage.getBoundingClientRect();
  pointer={id:event.pointerId,type:event.pointerType||'mouse',startX:event.clientX,startY:event.clientY,width:Math.max(1,rect.width||stage.clientWidth||1),height:Math.max(1,rect.height||stage.clientHeight||1),active:false,captured:false};
 };
 const move=event=>{
  if(!pointer||event.pointerId!==pointer.id||!interactive())return;
  const dx=event.clientX-pointer.startX,dy=event.clientY-pointer.startY;
  if(!pointer.active){
   if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
   // Pointer release also emits click after a drag; that is not a card tap.
   suppressClick=true;
   // A vertical touch gesture belongs to the page, even if it later turns sideways.
   if(pointer.type==='touch'&&Math.abs(dy)>=Math.abs(dx)){reset();return;}
   pointer.active=true;engage();
   try{stage.setPointerCapture(pointer.id);pointer.captured=true;}catch{/* Window listeners still complete the gesture if capture is unavailable. */}
  }
  if(event.cancelable)event.preventDefault();
  rotate(clamp(-dy/pointer.height*44,-22,22),clamp(dx/(pointer.width*.75)*180,-190,190));
 };
 const end=event=>{if(pointer&&event.pointerId===pointer.id)reset();};
 const keyboardRotation=()=>rotate((Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*22,((Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*(activates?22:180))||(!activates&&(keys.has(' ')||keys.has('Enter'))?180:0));
 const click=event=>{
  if(!interactive()||event.button!==undefined&&event.button!==0)return;
  if(suppressClick&&event.detail!==0||activationKeys.size&&!event.detail){suppressClick=false;event.preventDefault();return;}
  suppressClick=false;reset();onActivate(event,stage);
 };
 const keyDown=event=>{
  const key=keyName(event);
  if(key==='Escape'){if(pointer||keys.size||activationKeys.size){event.preventDefault();reset();}return;}
  if(disposed||!motionKeys.has(key)||event.altKey||event.ctrlKey||event.metaKey)return;
  event.preventDefault();
  if(!interactive())return;
  if(activates&&(key===' '||key==='Enter')){
   if(event.repeat||activationKeys.has(key))return;
   reset();activationKeys.add(key);onActivate(event,stage);return;
  }
  if(pointer)reset();
  keys.add(key);engage();keyboardRotation();
 };
 const keyUp=event=>{
  const key=keyName(event);
  if(activationKeys.has(key)){event.preventDefault();activationKeys.delete(key);interactive();return;}
  if(!interactive())return;
  if(!keys.has(key))return;
  event.preventDefault();keys.delete(key);
  if(keys.size)keyboardRotation();else reset();
 };
 listen(stage,'pointerdown',down);
 if(activates)listen(stage,'click',click);
 listen(win,'pointermove',move,{passive:false});
 listen(win,'pointerup',end);
 listen(win,'pointercancel',end);
 // Touch capture can move from a visual child to this stage. Its bubbled loss
 // belongs to that child, not to the stage that is now handling the drag.
 listen(stage,'lostpointercapture',event=>{if(event.target===stage)end(event);});
 listen(stage,'keydown',keyDown);
 listen(win,'keyup',keyUp);
 listen(stage,'blur',reset);
 listen(win,'blur',reset);
 listen(doc,'visibilitychange',()=>{if(doc.hidden)reset();});
 paint(0,0);
 return ()=>{if(disposed)return;disposed=true;reset();listeners.splice(0).forEach(remove=>remove());};
}

export function bindCouponMotion(root,options={}){
 const cleanups=Array.from(root?.querySelectorAll?.('[data-coupon-interactive]')||[],stage=>bindStage(stage,options));
 return ()=>cleanups.splice(0).forEach(cleanup=>cleanup());
}
