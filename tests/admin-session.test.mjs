import test from 'node:test';
import assert from 'node:assert/strict';
import { requestViewerSessionExpiry, REQUEST_VIEWER_SESSION_MS } from '../functions/src/admin-session.js';
import { hasPermission, defaultRoles } from '../functions/src/permissions.js';
import { clearAdminData } from '../web/src/admin-session.js';

test('viewer permissions stay read only even with forged or stored extra permissions',()=>{
 const viewer={role:'requestsViewer',permissions:['members','admins','settings','events']};
 assert.equal(hasPermission(viewer,'requestsRead'),true);
 for(const scope of ['members','membersRead','events','eventRead','participants','finance','settings','audit','admins','onTheRock'])assert.equal(hasPermission(viewer,scope),false,scope);
 for(const role of defaultRoles.filter(r=>r.id!=='requestsViewer'))assert.equal(hasPermission({role:role.id},'requestsRead'),role.permissions.includes('members'));
});
test('absolute expiry uses original auth time and the earlier assignment deadline',()=>{
 const authTime=1700000000,now=authTime*1000,profile={expiresAt:new Date(now+2*REQUEST_VIEWER_SESSION_MS).toISOString()};
 assert.equal(Date.parse(requestViewerSessionExpiry(profile,authTime,now)),now+REQUEST_VIEWER_SESSION_MS);
 assert.equal(requestViewerSessionExpiry(profile,authTime,now+100000),requestViewerSessionExpiry(profile,authTime,now));
 assert.throws(()=>requestViewerSessionExpiry(profile,authTime,now+REQUEST_VIEWER_SESSION_MS),e=>e.code==='unauthenticated');
 const early={expiresAt:new Date(now+1000).toISOString()};
 assert.equal(requestViewerSessionExpiry(early,authTime,now),early.expiresAt);
 for(const value of [undefined,0,'1700000000',NaN,authTime+100])assert.throws(()=>requestViewerSessionExpiry(profile,value,now),e=>e.code==='unauthenticated');
 for(const cutoff of [authTime,authTime+1])assert.throws(()=>requestViewerSessionExpiry({...profile,sessionsRevokedThrough:cutoff},authTime,now),e=>e.code==='unauthenticated');
});
test('clearing administrator state removes request pages and other private caches',()=>{
 const state={user:{uid:'example'},profile:{role:'requestsViewer'},data:{members:{}},pages:{},settings:{},clubRequestPage:{rows:[{name:'private'}]},requestPageReuse:{},roles:[],budgetPlannerView:{},partnerAdminView:{}};
 clearAdminData(state);
 assert.equal(state.profile,null);assert.deepEqual(state.data,{});assert.deepEqual(state.settings,{});
 for(const key of ['clubRequestPage','requestPageReuse','roles','budgetPlannerView','partnerAdminView'])assert.equal(key in state,false);
 assert.equal(state.user.uid,'example');
});
