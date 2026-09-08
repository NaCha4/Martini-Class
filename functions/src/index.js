import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { createService } from './service.js';
import { Problem } from './domain.js';
initializeApp();
// One instance admits the club's 100-member burst; Firestore remains the cross-instance consistency guard.
setGlobalOptions({region:'asia-northeast3',cpu:1,memory:'512MiB',minInstances:0,maxInstances:1,concurrency:100,timeoutSeconds:60});
const service=createService(getFirestore());
export const martiniApi=onCall({enforceAppCheck:false},async request=>{
 try{return await service.handle(request.data,{uid:request.auth?.uid,ip:request.rawRequest.ip||'unknown'});}
 catch(error){if(error instanceof Problem)throw new HttpsError(error.code,error.message);console.error('martiniApi failure',error.code||error.name);throw new HttpsError('internal','요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
});
