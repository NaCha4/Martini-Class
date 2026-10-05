const easing='cubic-bezier(.22,.8,.25,1)';
const stationary=()=>({finished:Promise.resolve(),cancel(){}});
const usableRect=rect=>rect&&[rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)&&rect.width>0&&rect.height>0;
function canAnimate(element){
 const doc=element?.ownerDocument||globalThis.document,win=doc?.defaultView||globalThis.window;
 return typeof element?.animate==='function'&&!doc?.hidden&&!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}
function motion(element,keyframes,duration,{retain=false}={}){
 let animation;
 try{animation=element.animate(keyframes,{duration,easing,fill:'both'});}catch{return stationary();}
 let cancelled=false;
 const cancel=()=>{if(cancelled)return;cancelled=true;animation.cancel();};
 // Cancelling a Web Animation rejects finished; lifecycle cleanup is not an error.
 const finished=Promise.resolve(animation.finished).catch(()=>{}).then(()=>{if(!retain)cancel();});
 return {finished,cancel};
}

export function liftCouponFromPocket(card){
 if(!canAnimate(card))return stationary();
 const rect=card.getBoundingClientRect?.();if(!usableRect(rect))return stationary();
 const win=card.ownerDocument?.defaultView||globalThis.window;
 const computed=win?.getComputedStyle?.(card)?.transform;
 const from=computed&&computed!=='none'?computed:'translate(-50%,0px) rotate(-2.5deg)';
 const distance=Math.max(90,rect.height*.75);
 // Keep the lifted paper visible even when the stamp read takes longer.
 return motion(card,[{transform:from},{transform:'translate(-50%,-'+distance+'px) rotate(-2.5deg)'}],300,{retain:true});
}

export function turnCouponIntoPlace(dialog,sourceRect){
 const floating=dialog?.querySelector?.('.partner-coupon-float');
 if(!canAnimate(floating)||!usableRect(sourceRect))return stationary();
 const destination=floating.getBoundingClientRect?.();if(!usableRect(destination))return stationary();
 const x=sourceRect.left+sourceRect.width/2-destination.left-destination.width/2;
 const y=sourceRect.top+sourceRect.height/2-destination.top-destination.height/2;
 const scale=sourceRect.width/destination.width;
 // The wrapper travels and turns; .partner-card remains free for the QR flip.
 return motion(floating,[
  {transform:'translate('+x+'px,'+y+'px) scale('+scale+') rotateZ(-2.5deg) rotateY(180deg)'},
  {transform:'translate(0px,0px) scale(1) rotateZ(-2deg) rotateY(360deg)'}
 ],560);
}
