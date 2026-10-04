import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { field } from '../web/src/ui.js';

// These tests exercise form callbacks, not browser layout. Dependencies are
// scoped to this import so --test-isolation=none leaves other test modules alone.
const bridgeKey=Symbol.for('martini.inventory-forms.tests');
const moduleUrl=new URL('../web/src/inventory-forms.js?inventory-forms-tests',import.meta.url).href;
const hook=registerHooks({
 resolve(specifier,context,nextResolve){
  if(context.parentURL===moduleUrl&&['./ui.js','./admin.js'].includes(specifier))return {url:'inventory-forms-test:'+specifier.slice(2),shortCircuit:true};
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  const bridge='globalThis[Symbol.for("martini.inventory-forms.tests")]';
  if(url==='inventory-forms-test:ui.js')return {format:'module',shortCircuit:true,source:['field','modal'].map(name=>'export const '+name+'=(...args)=>'+bridge+'.'+name+'(...args);').join('\n')};
  if(url==='inventory-forms-test:admin.js')return {format:'module',shortCircuit:true,source:'export const read=(...args)=>'+bridge+'.read(...args);'};
  return nextLoad(url,context);
 }
});
let itemEdit;
try{({itemEdit}=await import(moduleUrl));}
finally{hook.deregister();}

const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MwAAAABJRU5ErkJggg==';
const legacy={id:'gin',revision:4,name:'진',photo,category:'spirit',categoryId:'legacy-spirit',unit:'bottle',size:700,minimum:1400,location:'선반 A',note:'기존 메모',quantity:2,bottles:{opened:60}};
let harness;
function control(value=''){
 return {value:String(value??''),disabled:false,required:false,label:{hidden:false},listeners:new Map(),
  addEventListener(name,handler){this.listeners.set(name,handler);},
  async fire(name){return this.listeners.get(name)?.({target:this});},
  closest(selector){assert.equal(selector,'label');return this.label;}
 };
}
beforeEach(()=>{
 const fields=new Map();
 harness={fields,read:async()=>{throw Error('Unexpected inventory read');},
  field(name,title,value,options){fields.set(name,{title,value:value??'',options});return field(name,title,value,options);},
  modal(title,body,onSubmit,options){
   const controls=new Map([...fields].map(([name,definition])=>['[name='+name+']',control(definition.value)]));
   const dialog={querySelector:selector=>{assert.ok(controls.has(selector),'Unexpected selector '+selector);return controls.get(selector);}};
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
 for(const name of harness.fields.keys()){
  const input=get('[name='+name+']');
  if(!input.disabled)data.set(name,input.value);
 }
 for(const [name,value] of Object.entries(overrides))data.set(name,String(value));
 return data;
}

test('new form needs only a name, keeps stock settings collapsed and omits photo/location/category/stock fields',async()=>{
 const {ctx,calls,toasts,renders}=context();await itemEdit(ctx);
 assert.match(harness.body,/<details class="editor-options wide inventory-options">/);
 assert.match(harness.body,/<summary>수량 설정<\/summary>/);
 assert.doesNotMatch(harness.body,/<img|type="file"|보관|name="(?:photo|location|category|categoryId|quantity|bottles)"/);
 assert.equal(harness.fields.get('name').options.required,true);
 assert.equal(harness.fields.get('unit').value,'each');
 assert.equal(get('[name=size]').disabled,true);assert.equal(get('[name=size]').label.hidden,true);
 await harness.onSubmit(form({name:'  셰이커  '}));
 assert.deepEqual(calls,[{op:'saveItem',data:{revision:0,name:'셰이커',unit:'each',size:0,minimum:0,note:''}}]);
 assert.equal(toasts.length,1);assert.equal(renders(),1);
});

test('name edits omit location and preserve management values without mutating cached inventory',async()=>{
 const {ctx,calls}=context(legacy);const before=structuredClone(ctx.state.data.inventory.gin);
 await itemEdit(ctx,'gin','different-category');
 assert.doesNotMatch(harness.body,/<img|type="file"|보관|선반 A|name="(?:photo|location)"/);
 await harness.onSubmit(form({name:'이름만 변경'}));
 assert.deepEqual(calls[0],{op:'saveItem',data:{id:'gin',revision:4,name:'이름만 변경',unit:'bottle',size:700,minimum:1400,note:'기존 메모'}});
 for(const name of ['photo','location','quantity','bottles','category','categoryId'])assert.equal(Object.hasOwn(calls[0].data,name),false);
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
 assert.equal(Object.hasOwn(calls[0].data,'location'),false);assert.equal(calls[0].data.note,'새 메모');
 const second=context({...legacy,unit:'each',size:700});await itemEdit(second.ctx,'gin');
 assert.equal(get('[name=size]').disabled,true);await harness.onSubmit(form({name:'규격 유지'}));assert.equal(second.calls[0].data.size,700);
});

test('stock-related unit rejection propagates without announcing success or mutating cached inventory',async()=>{
 const {ctx,toasts,renders}=context(legacy),before=structuredClone(ctx.state.data.inventory.gin);
 ctx.api=async(op,data)=>{assert.equal(op,'saveItem');assert.equal(data.unit,'each');assert.equal(data.size,700);throw Error('재고가 있는 품목의 단위·규격은 변경할 수 없습니다.');};
 await itemEdit(ctx,'gin');get('[name=unit]').value='each';await get('[name=unit]').fire('change');
 await assert.rejects(harness.onSubmit(form()),/재고가 있는 품목/);
 assert.deepEqual(toasts,[]);assert.equal(renders(),0);assert.deepEqual(ctx.state.data.inventory.gin,before);
});
