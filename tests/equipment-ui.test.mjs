import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { memberState,setMemberSession,clearMemberIdentity } from '../web/src/member-session.js';
const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const {renderEquipmentMember,renderEquipmentAdmin,equipmentLoanRow,loadMemberEquipment,equipmentAdminAction}=await import('../web/src/equipment.js');hook.deregister();
const item={id:'item-a',name:'비품 <script>',description:'자세한 설명',location:'수납장',precautions:'주의 <img src=x>',details:[{label:'구성품 <b>',value:'본체와 뚜껑'}],quantity:2,borrowed:1,available:1,enabled:true,revision:2};
const loan={id:'loan-a',itemId:item.id,item,quantity:1,status:'borrowed',borrowedAt:new Date().toISOString(),dueDate:'',note:''};
test('member equipment cards show availability and personal records with escaped text',()=>{
 const ctx={state:{}};memberState(ctx).equipment={items:[item,{...item,id:'paused',enabled:false}],loans:[loan,{...loan,id:'returned',status:'returned',returnedAt:new Date().toISOString()}]};
 const html=renderEquipmentMember(ctx);assert.match(html,/비품 신청|대여 가능 1개/);assert.match(html,/data-action="member-equipment-borrow" data-id="item-a"/);assert.doesNotMatch(html,/data-action="member-equipment-borrow" data-id="paused"/);assert.match(html,/내가 대여 중인 비품/);assert.match(html,/최근 반납 내역/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/승인 요청|운영진 승인/);
 assert.match(equipmentLoanRow({...loan,dueDate:'2000-01-01'}),/반납 예정일 지남/);
});
test('catalog administration uses inventory permission and offers configurable data without approval controls',async()=>{
 const calls=[],ctx={state:{user:{uid:'admin'},profile:{permissions:['inventory']}},api:async(op)=>{calls.push(op);return {items:[item]};}};
 const html=await renderEquipmentAdmin(ctx);assert.deepEqual(calls,['equipmentCatalog']);for(const text of ['비품 추가','보관 위치','주의사항','구성품 &lt;b&gt;','정보 수정','전체 2개 · 대여 중 1개'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/<img src=x>|승인|반려/);
 ctx.state.profile={permissions:[]};calls.length=0;assert.match(await renderEquipmentAdmin(ctx),/접근 권한/);assert.deepEqual(calls,[]);await assert.rejects(equipmentAdminAction(ctx,'equipment-edit'),/재고 관리 권한/);
});
test('a late catalog response cannot repopulate private equipment state after logout',async()=>{
 globalThis.location={pathname:'/members',href:'https://martini.test/members'};globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){},length:0};
 const ctx={state:{},render:async()=>{}},key='a'.repeat(64);setMemberSession(ctx,{sessionKey:key,member:{name:'부원'},expiresAt:new Date(Date.now()+60000).toISOString()});
 let release;ctx.api=()=>new Promise(resolve=>{release=resolve;});const pending=loadMemberEquipment(ctx);clearMemberIdentity(ctx);release({items:[item],loans:[loan]});assert.equal(await pending,false);assert.equal(memberState(ctx).equipment,undefined);assert.deepEqual(memberState(ctx).equipmentLoans,[]);
});
