import assert from 'node:assert/strict';
import { Timestamp } from '../../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createService } from '../../functions/src/service.js';
import { hash } from '../../functions/src/domain.js';
export const sessionKey='a'.repeat(64),otherSession='b'.repeat(64),owner={uid:'owner',ip:'test-owner'};
export function equipmentFixture(){
 let instant=Date.now(),next=0,tail=Promise.resolve(),rejectWrite;
 const records=new Map(),writes=[];
 const clone=value=>value?.toMillis?Timestamp.fromMillis(value.toMillis()):Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])):value;
 const snapshot=path=>({id:path.split('/').at(-1),ref:ref(path),exists:records.has(path),data:()=>clone(records.get(path))});
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path),collection:name=>collection(path+'/'+name)});
 function result(query){let docs=[...records.keys()].filter(p=>p.startsWith(query.path+'/')&&!p.slice(query.path.length+1).includes('/')).map(snapshot).filter(d=>query.filters.every(([field,value])=>d.data()[field]===value));for(const [field,dir] of [...query.orders].reverse())docs.sort((a,b)=>String(a.data()[field]||'').localeCompare(String(b.data()[field]||''))*(dir==='desc'?-1:1));if(query.maximum!==undefined)docs=docs.slice(0,query.maximum);return {docs,size:docs.length,empty:docs.length===0};}
 function collection(path,opts={}){const query={path,isQuery:true,filters:[],orders:[],...opts};return {...query,doc:id=>ref(path+'/'+(id||'generated-'+ ++next)),get:async()=>result(query),where:(field,operator,value)=>{assert.equal(operator,'==');return collection(path,{...query,filters:[...query.filters,[field,value]]});},orderBy:(field,dir='asc')=>collection(path,{...query,orders:[...query.orders,[field,dir]]}),limit:maximum=>collection(path,{...query,maximum})};}
 const db={collection,runTransaction(run){const task=tail.then(async()=>{const pending=[];const tx={get:async target=>{assert.equal(pending.length,0,'Transaction reads must precede writes');return target.isQuery?result(target):snapshot(target.path);},set:(r,value,options={})=>pending.push({path:r.path,value:clone(value),merge:options.merge}),create:(r,value)=>{assert.ok(!records.has(r.path));pending.push({path:r.path,value:clone(value)});},update:(r,value)=>pending.push({path:r.path,value:clone(value),merge:true})};const value=await run(tx);if(pending.some(w=>rejectWrite?.(w)))throw Error('Synthetic write failure');for(const w of pending){records.set(w.path,w.merge?{...records.get(w.path),...w.value}:w.value);writes.push(w);}return value;});tail=task.catch(()=>{});return task;}};
 records.set('martini_v2_settings/club',{semester:'2026-2'});
 for(const role of ['owner','education','publicity','requestsViewer'])records.set('martini_v2_admins/'+role,{role,active:true,displayName:'가상 운영진',expiresAt:new Date(instant+86400000).toISOString()});
 for(const [token,id,name,studentId] of [[sessionKey,'member-a','가상 부원','TEST100'],[otherSession,'member-b','다른 부원','TEST200']]){const member={id,name,studentId,phone:'01000000000',semester:'2026-2',status:'active'};records.set('martini_v2_semesters/2026-2/members/'+id,member);records.set('martini_v2_memberSessions/'+hash(token),{memberId:id,semester:member.semester,identityHash:hash(JSON.stringify([name,studentId,member.phone])),expiresAt:Timestamp.fromMillis(instant+7*86400000)});}
 const service=createService(db,()=>instant);
 return {records,writes,db,handle:(payload,ctx={ip:'test-member'})=>service.handle(payload,ctx),advance:ms=>{instant+=ms;},now:()=>instant,failWrites:fn=>{rejectWrite=fn;},item:id=>clone(records.get('martini_v2_equipmentItems/'+id)),loan:id=>clone(records.get('martini_v2_equipmentLoans/'+id))};
}
