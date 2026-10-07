import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { memberState,setMemberSession,clearMemberIdentity } from '../web/src/member-session.js';
const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const {renderEquipmentMember,renderEquipmentAdmin,equipmentLoanRow,loadMemberEquipment,equipmentAdminAction}=await import('../web/src/equipment.js');hook.deregister();
const item={id:'item-a',name:'비품 <script>',description:'자세한 설명',location:'수납장',precautions:'주의 <img src=x>',details:[{label:'구성품 <b>',value:'본체와 뚜껑'}],quantity:2,borrowed:1,available:1,enabled:true,revision:2};
const loan={id:'loan-a',itemId:item.id,item,quantity:1,status:'borrowed',borrowedAt:new Date().toISOString(),dueDate:'',note:''};
test('member equipment cards open details without status, location or nested controls',()=>{
 const ctx={state:{}};memberState(ctx).equipment={items:[item,{...item,id:'paused',enabled:false}],loans:[loan,{...loan,id:'returned',status:'returned'}]};
 const html=renderEquipmentMember(ctx);
 assert.match(html,/data-action="member-equipment-detail" data-id="item-a"/);
 assert.match(html,/aria-haspopup="dialog"/);assert.match(html,/자세한 설명/);
 assert.equal((html.match(/<button /g)||[]).length,1);
 assert.doesNotMatch(html,/data-id="paused"|대여 가능|대여 중|반납하기|수납장|equipment-card-status|equipment-location|equipment-card-actions|member-record-list/);
 assert.doesNotMatch(html,/<script>|<h1/);assert.match(html,/&lt;script&gt;/);
 assert.match(equipmentLoanRow({...loan,dueDate:'2000-01-01'}),/반납 예정일 지남/);
 const single={...item,quantity:1,borrowed:1,available:0};
 memberState(ctx).equipment={items:[single],loans:[loan]};
 assert.doesNotMatch(renderEquipmentMember(ctx),/1개/);
 assert.doesNotMatch(equipmentLoanRow(loan,single),/ · 1개/);
 assert.match(equipmentLoanRow(loan,item),/ · 1개/);
 assert.match(equipmentLoanRow({...loan,quantity:2},single),/ · 2개/);
});
test('paused borrowed items and unavailable items retain one clickable detail card',()=>{
 const ctx={state:{}};
 memberState(ctx).equipment={items:[{...item,enabled:false,borrowed:2,available:0}],loans:[loan,{...loan,id:'loan-b'}, {...loan,id:'returned',status:'returned'}]};
 const html=renderEquipmentMember(ctx);
 assert.equal((html.match(/<button /g)||[]).length,1);
 assert.match(html,/data-action="member-equipment-detail" data-id="item-a"/);
 assert.doesNotMatch(html,/data-action="member-equipment-borrow"|data-action="member-equipment-returns"|returned/);
 memberState(ctx).equipment={items:[{...item,borrowed:2,available:0}],loans:[]};
 assert.match(renderEquipmentMember(ctx),/data-action="member-equipment-detail"/);
 memberState(ctx).equipment={items:[],loans:[]};assert.match(renderEquipmentMember(ctx),/현재 대여 가능한 비품이 없습니다/);
});
test('catalog administration uses inventory permission and offers configurable data without approval controls',async()=>{
 const calls=[],ctx={state:{user:{uid:'admin'},profile:{permissions:['inventory']}},api:async(op)=>{calls.push(op);return {items:[item]};}};
 const html=await renderEquipmentAdmin(ctx);assert.deepEqual(calls,['equipmentCatalog']);for(const text of ['비품 추가','보관 위치','상세 정보','정보 수정','대여 중','admin-catalog-grid'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/구성품 &lt;b&gt;|주의 &lt;img/);assert.match(html,/data-action="equipment-detail" data-id="item-a"/);assert.doesNotMatch(html,/<img src=x>|승인|반려/);
 ctx.state.profile={permissions:[]};calls.length=0;assert.match(await renderEquipmentAdmin(ctx),/접근 권한/);assert.deepEqual(calls,[]);await assert.rejects(equipmentAdminAction(ctx,'equipment-edit'),/재고 관리 권한/);
});
test('a late catalog response cannot repopulate private equipment state after logout',async()=>{
 globalThis.location={pathname:'/members',href:'https://martini.test/members'};globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){},length:0};
 const ctx={state:{},render:async()=>{}},key='a'.repeat(64);setMemberSession(ctx,{sessionKey:key,member:{name:'부원'},expiresAt:new Date(Date.now()+60000).toISOString()});
 let release;ctx.api=()=>new Promise(resolve=>{release=resolve;});const pending=loadMemberEquipment(ctx);clearMemberIdentity(ctx);release({items:[item],loans:[loan]});assert.equal(await pending,false);assert.equal(memberState(ctx).equipment,undefined);assert.deepEqual(memberState(ctx).equipmentLoans,[]);
});
