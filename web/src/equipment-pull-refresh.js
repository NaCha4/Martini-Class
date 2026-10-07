// Touch events let downward pulls be claimed without blocking ordinary scrolling.
export function bindEquipmentPullRefresh(surface,onRefresh,{enabled=()=>true,onState=()=>{},onError=()=>{}}={}){
 if(!surface)return {refresh:async()=>false,dispose(){}};
 const doc=surface.ownerDocument,win=doc.defaultView,bindings=[];
 let gesture=null,busy=false,disposed=false,suppressClickUntil=0;
 const atTop=()=>Math.max(win.scrollY||0,doc.scrollingElement?.scrollTop||0)<=1;
 const active=()=>!disposed&&!doc.hidden&&surface.isConnected&&enabled();
 const notify=(phase,distance=0)=>{if(!disposed)onState({phase,distance});};
 const cancel=()=>{gesture=null;if(!busy)notify('idle');};
 async function refresh(){
  if(busy||!active())return false;
  gesture=null;busy=true;notify('refreshing');
  try{await onRefresh();return true;}
  catch(error){if(active())onError(error);return false;}
  finally{busy=false;notify('idle');}
 }
 function start(event){
  suppressClickUntil=0;cancel();
  if(busy||!active()||!atTop()||event.touches.length!==1||event.target.closest?.('[data-equipment-toolbar],input,textarea,select,[contenteditable]'))return;
  const touch=event.touches[0];gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,distance:0,claimed:false};
 }
 function move(event){
  if(!gesture)return;
  if(!active()||!atTop()||event.touches.length!==1||!event.cancelable){cancel();return;}
  const touch=Array.from(event.touches).find(point=>point.identifier===gesture.id);
  if(!touch){cancel();return;}
  const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;
  if(!gesture.claimed){
   if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
   if(dy<=0||dy<=Math.abs(dx)*1.2){cancel();return;}
   gesture.claimed=true;
  }
  event.preventDefault();suppressClickUntil=Date.now()+800;
  gesture.distance=Math.max(0,dy);
  notify(dy>=80?'ready':'pulling',Math.min(72,gesture.distance*.5));
 }
 function end(event){
  if(!gesture)return;
  const finished=gesture;
  const released=Array.from(event.changedTouches||[]).some(point=>point.identifier===finished.id);
  if(!released)return;
  gesture=null;
  if(finished.claimed)suppressClickUntil=Date.now()+800;
  if(finished.claimed&&finished.distance>=80&&!event.touches.length&&active()&&atTop())void refresh();
  else if(!busy)notify('idle');
 }
 function click(event){
  if(event.detail!==0&&Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0;}
 }
 function listen(target,type,handler,options){target.addEventListener(type,handler,options);bindings.push(()=>target.removeEventListener(type,handler,options));}
 listen(surface,'touchstart',start,{passive:true});
 listen(surface,'touchmove',move,{passive:false});
 listen(surface,'touchend',end,{passive:true});
 listen(surface,'touchcancel',cancel,{passive:true});
 listen(surface,'click',click,true);
 listen(doc,'visibilitychange',cancel);
 listen(win,'pagehide',cancel);
 listen(win,'blur',cancel);
 return {refresh,dispose(){if(disposed)return;gesture=null;onState({phase:'idle',distance:0});disposed=true;bindings.splice(0).forEach(remove=>remove());}};
}
