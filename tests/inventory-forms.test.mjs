import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { field,esc,icon } from '../web/src/ui.js';

// These tests exercise form callbacks and upload state, not browser layout or
// native image decoding. Dependencies are scoped to this test import so a run
// with --test-isolation=none does not replace other tests' UI/admin modules.
const bridgeKey=Symbol.for('martini.inventory-forms.tests');
const moduleUrl=new URL('../web/src/inventory-forms.js?inventory-forms-tests',import.meta.url).href;
const hook=registerHooks({
 resolve(specifier,context,nextResolve){
  if(context.parentURL===moduleUrl&&['./ui.js','./admin.js'].includes(specifier))return {url:'inventory-forms-test:'+specifier.slice(2),shortCircuit:true};
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  const bridge='globalThis[Symbol.for("martini.inventory-forms.tests")]';
  if(url==='inventory-forms-test:ui.js')return {format:'module',shortCircuit:true,source:['esc','field','icon','modal'].map(name=>'export const '+name+'=(...args)=>'+bridge+'.'+name+'(...args);').join('\n')};
  if(url==='inventory-forms-test:admin.js')return {format:'module',shortCircuit:true,source:'export const read=(...args)=>'+bridge+'.read(...args);'};
  return nextLoad(url,context);
 }
});
let itemEdit,inventoryPhoto,prepareInventoryPhoto;
try{({itemEdit,inventoryPhoto,prepareInventoryPhoto}=await import(moduleUrl));}
finally{hook.deregister();}

const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MwAAAABJRU5ErkJggg==';
const legacy={id:'gin',revision:4,name:'진',photo,category:'spirit',categoryId:'legacy-spirit',unit:'bottle',size:700,minimum:1400,location:'선반 A',note:'기존 메모',quantity:2,bottles:{opened:60}};
let harness;
function control(value=''){
 return {value:String(value??''),disabled:false,hidden:false,required:false,files:[],events:[],label:{hidden:false},listeners:new Map(),
  addEventListener(name,handler){this.listeners.set(name,handler);},
  async fire(name){return this.listeners.get(name)?.({target:this});},
  dispatchEvent(event){this.events.push(event);return true;},
  closest(selector){assert.equal(selector,'label');return this.label;},
  replaceChildren(...children){this.children=children;}
 };
}
beforeEach(()=>{
 const fields=new Map();
 harness={fields,esc,icon,read:async()=>{throw Error('Unexpected inventory read');},
  field(name,title,value,options){fields.set(name,{title,value:value??'',options});return field(name,title,value,options);},
  modal(title,body,onSubmit,options){
   const controls=new Map([...fields].map(([name,definition])=>['[name='+name+']',control(definition.value)]));
   controls.set('[name=photo]',control(body.match(/type="hidden" name="photo" value="([^"]*)"/)?.[1]||''));
   for(const selector of ['[name=photoUpload]','[data-photo-remove]','[data-photo-status]','[type=submit]','[data-photo-preview]','[data-photo-label]'])controls.set(selector,control());
   const dialog={...control(),isConnected:true,querySelector:selector=>{assert.ok(controls.has(selector),'Unexpected selector '+selector);return controls.get(selector);}};
   Object.assign(harness,{title,body,onSubmit,options,controls,dialog});
   return dialog;
  }
 };
 globalThis[bridgeKey]=harness;
});
after(()=>{delete globalThis[bridgeKey];});

function context(item){
 const calls=[],toasts=[];let renders=0;
 const ctx={state:{data:{inventory:item?{[item.id]:structuredClone(item)}:{}},settings:{location:'동아리방'}},
  api:async(op,data)=>{calls.push({op,data});return data;},toast:message=>toasts.push(message),render:async()=>{renders++;}};
 return {ctx,calls,toasts,renders:()=>renders};
}
const get=selector=>harness.controls.get(selector);
function form(overrides={}){
 const data=new FormData();
 for(const name of [...harness.fields.keys(),'photo']){
  const input=get('[name='+name+']');
  if(!input.disabled)data.set(name,input.value);
 }
 for(const [name,value] of Object.entries(overrides))data.set(name,String(value));
 return data;
}
function replaceGlobal(t,name,value){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
 Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
}
function raster(t,{width=4000,height=3000,manual=false,decodeError=false,noContext=false,encode}={}){
 const images=[],urls=[],revoked=[],encodes=[],draws=[];
 t.mock.method(URL,'createObjectURL',file=>{const url='blob:inventory-photo-'+urls.length;urls.push({url,file});return url;});
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 class RasterImage{
  constructor(){this.naturalWidth=width;this.naturalHeight=height;images.push(this);}
  set src(value){this.source=value;if(!manual)queueMicrotask(()=>decodeError?this.onerror?.():this.onload?.());}
 }
 const canvas={width:0,height:0,getContext:()=>noContext?null:{fillRect(){},drawImage:(image,x,y,w,h)=>draws.push({image,width:w,height:h})},
  toDataURL(type,quality){const entry={type,quality,width:this.width,height:this.height};encodes.push(entry);return encode?encode(entry):'data:image/jpeg;base64,'+'A'.repeat(1000);}};
 replaceGlobal(t,'Image',RasterImage);
 replaceGlobal(t,'document',{createElement:tag=>{if(tag==='canvas')return canvas;assert.equal(tag,'img');return {};}});
 return {images,urls,revoked,encodes,draws};
}

test('new form needs only a name, keeps advanced settings collapsed and does not force a category',async()=>{
 const {ctx,calls,toasts,renders}=context();await itemEdit(ctx);
 assert.match(harness.body,/<details class="editor-options wide inventory-options">/);
 assert.match(harness.body,/수량 관리 설정 \(선택\)/);
 assert.doesNotMatch(harness.body,/name="(?:category|categoryId|quantity|bottles)"/);
 assert.equal(harness.fields.get('name').options.required,true);
 assert.equal(harness.fields.get('unit').value,'each');
 assert.equal(get('[name=size]').disabled,true);assert.equal(get('[name=size]').label.hidden,true);
 await harness.onSubmit(form({name:'  셰이커  '}));
 assert.deepEqual(calls,[{op:'saveItem',data:{revision:0,name:'셰이커',photo:'',unit:'each',size:0,minimum:0,location:'동아리방',note:''}}]);
 assert.equal(toasts.length,1);assert.equal(renders(),1);
});

test('name/photo edits preserve legacy units and management values, and omit category and stock mutations',async()=>{
 const {ctx,calls}=context(legacy);const before=structuredClone(ctx.state.data.inventory.gin);
 await itemEdit(ctx,'gin','different-category');
 assert.match(harness.body,/type="hidden" name="photo"/);assert.equal(get('[name=photo]').value,photo);
 await harness.onSubmit(form({name:'이름만 변경'}));
 assert.deepEqual(calls[0],{op:'saveItem',data:{id:'gin',revision:4,name:'이름만 변경',photo,unit:'bottle',size:700,minimum:1400,location:'선반 A',note:'기존 메모'}});
 for(const name of ['quantity','bottles','category','categoryId'])assert.equal(Object.hasOwn(calls[0].data,name),false);
 assert.deepEqual(ctx.state.data.inventory.gin,before);
});

test('new items receive the selected board category without exposing legacy enum fields',async()=>{
 const {ctx,calls}=context();await itemEdit(ctx,undefined,'party-tools');await harness.onSubmit(form({name:'바 스푼'}));
 assert.equal(calls[0].data.categoryId,'party-tools');assert.equal(Object.hasOwn(calls[0].data,'category'),false);
 assert.doesNotMatch(harness.body,/name="category"|value="spirit"|value="ingredient"/);
});

test('uncached edit fetches the requested item and missing items fail before opening a form',async()=>{
 const {ctx,calls}=context(),reads=[];
 harness.read=async(receivedCtx,kind,options)=>{assert.equal(receivedCtx,ctx);reads.push({kind,options});return {rows:[legacy]};};
 await itemEdit(ctx,'gin');await harness.onSubmit(form({name:'불러온 품목'}));
 assert.deepEqual(reads,[{kind:'inventory',options:{recordId:'gin'}}]);assert.equal(calls[0].data.revision,4);
 harness.read=async()=>({rows:[]});harness.dialog=undefined;
 await assert.rejects(itemEdit(ctx,'missing'),/품목을 찾을 수 없습니다/);assert.equal(harness.dialog,undefined);
});

test('advanced unit switching supplies a bottle size and preserves hidden legacy sizes on name edits',async()=>{
 const {ctx,calls}=context({...legacy,unit:'each',quantity:0,bottles:{},size:0});await itemEdit(ctx,'gin');
 get('[name=unit]').value='bottle';await get('[name=unit]').fire('change');
 assert.equal(get('[name=size]').value,'700');assert.equal(get('[name=size]').disabled,false);assert.equal(get('[name=size]').required,true);
 await harness.onSubmit(form({name:'병으로 관리',size:750,minimum:1500,location:'새 선반',note:'새 메모'}));
 assert.equal(calls[0].data.unit,'bottle');assert.equal(calls[0].data.size,750);assert.equal(calls[0].data.minimum,1500);
 const second=context({...legacy,unit:'each',size:700});await itemEdit(second.ctx,'gin');
 assert.equal(get('[name=size]').disabled,true);await harness.onSubmit(form({name:'규격 유지'}));assert.equal(second.calls[0].data.size,700);
});

test('stock-related unit rejection propagates without announcing success or mutating the cached inventory',async()=>{
 const {ctx,toasts,renders}=context(legacy),before=structuredClone(ctx.state.data.inventory.gin);
 ctx.api=async(op,data)=>{assert.equal(op,'saveItem');assert.equal(data.unit,'each');assert.equal(data.size,700);throw Error('재고가 있는 품목의 단위·규격은 변경할 수 없습니다.');};
 await itemEdit(ctx,'gin');get('[name=unit]').value='each';await get('[name=unit]').fire('change');
 await assert.rejects(harness.onSubmit(form()),/재고가 있는 품목/);
 assert.deepEqual(toasts,[]);assert.equal(renders(),0);assert.deepEqual(ctx.state.data.inventory.gin,before);assert.equal(get('[name=photo]').value,photo);
});

test('display photo filter excludes external URLs, SVG, markup and oversized data',()=>{
 assert.equal(inventoryPhoto(photo),photo);
 for(const value of [null,'https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,AAAA\" onerror=alert(1)',photo+'A'.repeat(160000)])assert.equal(inventoryPhoto(value),'');
});

test('upload rejects unsupported files and oversized sources before creating any object URL',async t=>{
 const env=raster(t);
 await assert.rejects(prepareInventoryPhoto({type:'image/svg+xml',size:100}),/JPG, PNG, WebP/);
 await assert.rejects(prepareInventoryPhoto({type:'image/png',size:10*1024*1024+1}),/10MB/);
 assert.equal(env.urls.length,0);
});

test('large source is scaled within 640px and reduced until the stored photo fits the byte-string budget',async t=>{
 const env=raster(t,{encode:({width,quality})=>'data:image/jpeg;base64,'+'A'.repeat(width===640||quality>.58?160000:100000)});
 const result=await prepareInventoryPhoto({type:'image/png',size:9*1024*1024});
 assert.ok(result.length<=150000);assert.match(result,/^data:image\/jpeg;base64,/);
 assert.deepEqual(env.draws.map(({width,height})=>[width,height]),[[640,480],[480,360]]);
 assert.deepEqual(env.encodes.map(({quality})=>quality),[.86,.72,.58,.44,.86,.72,.58]);
 assert.ok(env.encodes.every(({type,width,height})=>type==='image/jpeg'&&width<=640&&height<=640));
 assert.deepEqual(env.revoked,[env.urls[0].url]);
});

test('image decode, canvas and compression errors revoke temporary object URLs',async t=>{
 for(const options of [{decodeError:true},{noContext:true},{encode:()=>'data:image/jpeg;base64,'+'A'.repeat(160000)}]){
  await t.test(JSON.stringify(Object.keys(options)),async child=>{
   const env=raster(child,options);
   await assert.rejects(prepareInventoryPhoto({type:'image/jpeg',size:1000}),/사진|브라우저/);
   assert.deepEqual(env.revoked,[env.urls[0].url]);
  });
 }
});

test('pending photo upload blocks saves, then updates the hidden form value used for unsaved-change detection',async t=>{
 const env=raster(t,{manual:true}),{ctx,calls}=context(legacy);await itemEdit(ctx,'gin');
 const upload=get('[name=photoUpload]');upload.files=[{type:'image/png',size:1000}];const pending=upload.fire('change');
 assert.equal(get('[type=submit]').disabled,true);assert.equal(get('[data-photo-remove]').disabled,true);
 await assert.rejects(harness.onSubmit(form()),/사진을 준비/);assert.deepEqual(calls,[]);assert.equal(form().get('photo'),photo);
 env.images[0].onload();await pending;
 assert.equal(get('[type=submit]').disabled,false);assert.equal(upload.disabled,false);assert.equal(upload.value,'');
 assert.notEqual(form().get('photo'),photo);assert.equal(get('[name=photo]').events.at(-1).type,'input');assert.equal(get('[name=photo]').events.at(-1).bubbles,true);
 await harness.onSubmit(form());assert.equal(calls[0].data.photo,get('[name=photo]').value);
});

test('failed photo upload preserves the previous photo and removal becomes an explicit empty photo edit',async t=>{
 const env=raster(t,{manual:true}),{ctx,calls}=context(legacy);await itemEdit(ctx,'gin');
 const upload=get('[name=photoUpload]');upload.files=[{type:'image/png',size:1000}];const pending=upload.fire('change');
 env.images[0].onerror();await pending;
 assert.equal(get('[name=photo]').value,photo);assert.equal(get('[type=submit]').disabled,false);assert.match(get('[data-photo-status]').textContent,/현재 사진은 유지/);
 await get('[data-photo-remove]').fire('click');assert.equal(form().get('photo'),'');assert.equal(get('[data-photo-remove]').hidden,true);
 await harness.onSubmit(form());assert.equal(calls[0].data.photo,'');assert.deepEqual(env.revoked,[env.urls[0].url]);
});

test('a photo finishing after the editor is closed cannot overwrite its form',async t=>{
 const env=raster(t,{manual:true}),{ctx}=context(legacy);await itemEdit(ctx,'gin');
 get('[name=photoUpload]').files=[{type:'image/png',size:1000}];const pending=get('[name=photoUpload]').fire('change');
 harness.dialog.isConnected=false;await harness.dialog.fire('close');env.images[0].onload();await pending;
 assert.equal(get('[name=photo]').value,photo);assert.equal(get('[name=photo]').events.length,0);assert.deepEqual(env.revoked,[env.urls[0].url]);
});
