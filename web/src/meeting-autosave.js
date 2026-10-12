const signature=value=>JSON.stringify(value);
const copy=value=>structuredClone(value);
export function createMeetingAutosave({record,save,onChange=()=>{},delay=900,maxWait=10000,makeId=()=>crypto.randomUUID(),setTimer=setTimeout,clearTimer=clearTimeout}){
 let current=copy(record),draft={title:record.title,date:record.date,document:copy(record.document)},saved=signature(draft),pending=null,running=null,error=null,disposed=false,timer,limitTimer;
 const dirty=()=>signature(draft)!==saved||!!pending;
 const emit=()=>{if(!disposed)onChange(snapshot());};
 const snapshot=()=>({record:copy(current),draft:copy(draft),dirty:dirty(),saving:!!running,error});
 const cancel=()=>{clearTimer(timer);clearTimer(limitTimer);timer=limitTimer=undefined;};
 function schedule(){
  clearTimer(timer);timer=setTimer(()=>void flush(),delay);
  limitTimer??=setTimer(()=>void flush(),maxWait);
 }
 function update(value){if(disposed)return;draft=copy(value);if(!error)schedule();emit();}
 async function drain(){
  while(!disposed&&dirty()){
   pending||={id:current.id,revision:current.revision,requestId:makeId(),semester:current.semester,...copy(draft)};
   const request=pending;
   try{
    const result=await save(copy(request));
    if(disposed)return false;
    current=copy(result);saved=signature({title:request.title,date:request.date,document:request.document});pending=null;error=null;
   }catch(caught){if(!disposed)error=caught;return false;}
  }
  return !disposed;
 }
 function flush(){
  cancel();
  if(disposed)return Promise.resolve(false);
  if(running)return running;
  if(error?.code?.endsWith('aborted'))return Promise.resolve(false);
  if(!dirty()){error=null;emit();return Promise.resolve(true);}
  error=null;
  // Defer the first call so even a synchronously throwing transport sees running set.
  running=Promise.resolve().then(drain).finally(()=>{running=null;emit();});
  emit();return running;
 }
 return {update,flush,snapshot,dispose(){disposed=true;cancel();},discard(){pending=null;draft={title:current.title,date:current.date,document:copy(current.document)};saved=signature(draft);error=null;cancel();emit();}};
}
