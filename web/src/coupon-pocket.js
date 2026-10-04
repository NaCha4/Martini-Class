// The exposed coupon is the control; other areas retain normal page scrolling.
export function bindCouponReveal(card,onReveal){
 if(!card?.addEventListener)return ()=>{};
 const win=card.ownerDocument?.defaultView||globalThis.window,doc=card.ownerDocument||globalThis.document;
 const listeners=[];let pointer=null,disposed=false,suppressClick=false;
 const listen=(target,type,handler,options)=>{target?.addEventListener?.(type,handler,options);listeners.push(()=>target?.removeEventListener?.(type,handler,options));};
 const reset=()=>{
  const previous=pointer;pointer=null;card.classList.remove('is-pulling');card.style.setProperty('--coupon-pull','0px');
  if(previous&&card.hasPointerCapture?.(previous.id)){try{card.releasePointerCapture(previous.id);}catch{/* Capture may already have ended. */}}
 };
 const down=event=>{
  if(disposed||pointer||event.isPrimary===false||event.button!==0)return;
  suppressClick=false;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,pull:0,moved:false,cancelled:false};
  try{card.setPointerCapture(event.pointerId);}catch{/* Window listeners still finish the gesture. */}
 };
 const move=event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=8)pointer.moved=true;
  if(!pointer.moved)return;
  suppressClick=true;
  if(dy>8||Math.abs(dx)>Math.abs(dy)){pointer.cancelled=true;pointer.pull=0;card.style.setProperty('--coupon-pull','0px');return;}
  if(pointer.cancelled)return;
  if(event.cancelable)event.preventDefault();
  pointer.pull=Math.min(120,Math.max(0,-dy));card.classList.add('is-pulling');card.style.setProperty('--coupon-pull',pointer.pull+'px');
 };
 const up=event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const open=!pointer.cancelled&&pointer.pull>=40;
  suppressClick=pointer.moved;reset();if(open&&!disposed)onReveal(event);
 };
 const cancel=event=>{if(pointer&&(!event?.pointerId||event.pointerId===pointer.id)){suppressClick=true;reset();}};
 const click=event=>{if(disposed)return;if(suppressClick&&event.detail!==0){event.preventDefault();event.stopPropagation();return;}onReveal(event);};
 listen(card,'pointerdown',down);listen(win,'pointermove',move,{passive:false});listen(win,'pointerup',up);listen(win,'pointercancel',cancel);
 listen(card,'lostpointercapture',event=>{if(event.target===card)cancel(event);});listen(card,'click',click);
 listen(card,'blur',()=>cancel());listen(win,'blur',()=>cancel());listen(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});
 return ()=>{if(disposed)return;disposed=true;reset();listeners.splice(0).forEach(remove=>remove());};
}
