import { initializeApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { identity,hash } from '../functions/src/domain.js';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const db=getFirestore(initializeApp({projectId:'demo-martini'},'http-load'));
const stamp=new Date().toISOString(),id='load-'+Date.now(),key=hash(id),future=ms=>new Date(Date.now()+ms).toISOString(),batch=db.batch();
const meta={revision:1,createdAt:stamp,updatedAt:stamp,createdBy:'local-test',updatedBy:'local-test'};
batch.set(db.doc('martini_v2_events/'+id),{...meta,id,title:'가상 HTTP 부하 검증',type:'class',description:'가상 검증',location:'로컬',startsAt:future(86400000),endsAt:future(90000000),opensAt:stamp,closesAt:future(80000000),cancelUntil:future(80000000),capacity:25,fee:0,waitlist:true,status:'open',semester:'2026-2',questions:[],policy:'가상 정책',paymentInstructions:'',registered:0,waiting:0,sequence:0,linkHash:hash(key),owner:'가상'});
const requests=[];
for(let i=0;i<100;i++){const name='HTTP 가상 '+i,studentId=id+'-'+i,phone='01077'+String(i).padStart(6,'0'),memberId=id+'-member-'+i;
 batch.set(db.doc('martini_v2_members/'+memberId),{...meta,id:memberId,name,studentId,phone,identityHash:identity(studentId,phone),semester:'2026-2',status:'active',duesPaid:true,college:'',department:'',grade:'',gender:''});
 requests.push({op:'apply',eventId:id,key,name,studentId,phone,answers:[],consent:true,requestId:'request-'+i,receiptKey:hash(id+':receipt:'+i)});
}
await batch.commit();const started=Date.now();
const responses=await Promise.all(requests.map(async data=>{
 const response=await fetch('http://127.0.0.1:5001/demo-martini/asia-northeast3/martiniApi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data}),signal:AbortSignal.timeout(55000)});
 const body=await response.json();return {status:response.status,result:body.result,error:body.error?.status};
}));
const counts={registered:responses.filter(r=>r.result?.status==='registered').length,waiting:responses.filter(r=>r.result?.status==='waiting').length,failed:responses.filter(r=>r.status!==200).length};
console.log(JSON.stringify({milliseconds:Date.now()-started,...counts,errors:[...new Set(responses.filter(r=>r.error).map(r=>r.error))]}));
assert.deepEqual(counts,{registered:25,waiting:75,failed:0});await db.terminate();
