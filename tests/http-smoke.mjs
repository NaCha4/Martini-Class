import assert from 'node:assert/strict';
const endpoint='http://127.0.0.1:5001/demo-martini/asia-northeast3/martiniApi';
const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@martini.local',password:'Martini-Local-2026!',returnSecureToken:true})});
const account=await login.json();assert.equal(login.ok,true);
async function call(data,authenticated=true){
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(authenticated?{Authorization:'Bearer '+account.idToken}:{})},body:JSON.stringify({data})});
 const body=await response.json();assert.equal(response.ok,true,JSON.stringify(body.error));return body.result;
}
const profile=await call({op:'profile'});assert.equal(profile.role,'owner');
const data=await call({op:'read',kind:'members'});assert.ok(data.rows.length>=3);
const meetings=await call({op:'read',kind:'meetings'});assert.ok(meetings.rows.length>=1);
const settings=await call({op:'publicRead'},false);assert.ok(settings.settings);
const event=await call({op:'eventAccess',eventId:'demo-opening',key:'a'.repeat(64)},false);assert.equal(event.id,'demo-opening');
const denied=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:{op:'read',kind:'members'}})});
assert.equal(denied.status,401);
console.log('Callable HTTP smoke: admin login/profile/list, public content/event access, unauthenticated denial passed.');
