import test from 'node:test';
import assert from 'node:assert/strict';
import { read, readAll, loadMore } from '../web/src/admin-data.js';
import { clearAdminData } from '../web/src/admin-session.js';
import { renderHome } from '../web/src/home.js';
import { htmlTree, elements, attr, textContent } from './helpers/html.mjs';

async function at(path,run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:new URL(path,'https://martini.test')});
 try{return await run();}finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
}
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
const context=api=>({state:{user:{uid:'operator'},data:{},pages:{},settings:{semester:'2026-2'}},api});

test('homepage preserves landmark, activity destinations and join call to action',()=>at('/',()=>{
 const tree=htmlTree(renderHome());
 const main=elements(tree,node=>node.tagName==='main');assert.equal(main.length,1);
 const heading=elements(main[0],node=>node.tagName==='h1');assert.equal(heading.length,1);assert.equal(textContent(heading[0]),'Martini');
 assert.equal(elements(main[0],node=>node.tagName==='section').length,4);
 const activities=elements(main[0],node=>attr(node,'aria-label')==='주요 활동')[0];
 assert.deepEqual(elements(activities,node=>node.tagName==='a').map(node=>attr(node,'href')),['/activities','/activities','/notices']);
 assert.ok(elements(main[0],node=>attr(node,'href')==='/join'&&textContent(node).includes('가입 절차 확인')).length);
}));

test('pagination returns accumulated data without replacing the shared API',()=>at('/admin/audit',async()=>{
 const calls=[],api=async(op,data)=>{calls.push({op,data});return {rows:[{id:'second'}],nextCursor:null};};
 const ctx=context(api);ctx.state.pages.audit={rows:[{id:'first'}],nextCursor:'first'};
 const page=await loadMore(ctx,'audit');
 assert.equal(ctx.api,api);assert.equal(page.kind,'audit');assert.equal(page.added,1);
 assert.deepEqual(page.result.rows.map(row=>row.id),['first','second']);
 assert.deepEqual(calls,[{op:'read',data:{kind:'audit',cursor:'first'}}]);
 assert.equal(await loadMore(ctx,'audit'),null);assert.equal(calls.length,1);
}));

test('a pending admin read cannot repopulate records cleared on logout',()=>at('/admin/events',async()=>{
 const reply=deferred(),ctx=context(()=>reply.promise),loading=read(ctx,'events');
 clearAdminData(ctx.state);ctx.state.user=null;
 reply.resolve({rows:[{id:'private-event'}],nextCursor:null});await loading;
 assert.deepEqual(ctx.state.data,{});assert.deepEqual(ctx.state.pages,{});
}));

test('an old route cannot append a page to the current admin view',()=>at('/admin/audit',async()=>{
 const reply=deferred(),ctx=context(()=>reply.promise);ctx.state.pages.audit={rows:[{id:'first'}],nextCursor:'first'};
 const loading=loadMore(ctx,'audit');globalThis.location=new URL('https://martini.test/admin/members');
 reply.resolve({rows:[{id:'late'}],nextCursor:null});assert.equal(await loading,null);
 assert.deepEqual(ctx.state.pages.audit.rows,[{id:'first'}]);
}));

test('full member lists keep semester and removal filters across every page',()=>at('/admin/members?semester=2026-1',async()=>{
 const calls=[],ctx=context(async(op,data)=>{calls.push(data);return data.cursor?{rows:[{id:'second'}],nextCursor:null}:{rows:[{id:'first'}],nextCursor:'first'};});
 const result=await readAll(ctx,'members');
 assert.deepEqual(result.rows.map(row=>row.id),['first','second']);
 assert.ok(calls.every(call=>call.semester==='2026-1'&&call.removed===false));
 assert.equal(ctx.state.pages.members.nextCursor,null);
}));
