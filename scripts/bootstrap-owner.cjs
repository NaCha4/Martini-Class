// Approval required: creates the first app owner and requests a password-reset email.
const crypto=require('node:crypto');
const {logger}=require('firebase-tools/lib/logger');logger.silent=true;
const {getProjectDefaultAccount,getGlobalDefaultAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {getAppConfig}=require('firebase-tools/lib/management/apps');
const {Client}=require('firebase-tools/lib/apiv2');
const project='martini-class-d4d69',appId='1:994424737344:web:555117a1674e6ba0ae59a5';
const quiet={skipLog:{body:true,resBody:true,queryParams:true},retries:0};
let phase='preflight';const result={authCreated:false,ownerCreated:false,passwordEmailRequested:false};
function fail(code){const e=new Error(code);e.safeCode=code;throw e;}
(async()=>{
 if(!process.argv.includes('--apply')){process.stdout.write('Dry run: --apply creates the first app owner using the current Firebase CLI email and requests a password-reset email. Explicit authorization is required.\n');return;}
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)fail('EMULATOR_ENV_PRESENT');
 const account=getProjectDefaultAccount(process.cwd())||getGlobalDefaultAccount();if(!account?.user?.email)fail('NO_CLI_ACCOUNT');
 const email=account.user.email;
 await requireAuth({project,user:account.user,tokens:account.tokens,nonInteractive:true});
 const config=await getAppConfig(appId,'WEB');if(config.projectId!==project||!config.apiKey)fail('PUBLIC_CONFIG_MISMATCH');
 const auth=new Client({urlPrefix:'https://identitytoolkit.googleapis.com'}),db=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
 const documents='projects/'+project+'/databases/(default)/documents';
 const admins=await db.get('/'+documents+'/martini_v2_admins',{...quiet,queryParams:{pageSize:1}});
 if(admins.body.documents?.length)fail('OWNER_ALREADY_INITIALIZED');
 const lookup=await auth.post('/v1/projects/'+project+'/accounts:lookup',{email:[email]},quiet),existing=lookup.body.users||[];
 if(existing.length>1)fail('AMBIGUOUS_AUTH_ACCOUNT');if(existing[0]?.disabled)fail('EXISTING_AUTH_ACCOUNT_DISABLED');
 let uid=existing[0]?.localId;
 phase='create-auth';
 if(!uid){let password=crypto.randomBytes(48).toString('base64url')+'!aA1';try{const created=await auth.post('/v1/projects/'+project+'/accounts',{email,password,displayName:'운영 책임자',emailVerified:false,disabled:false},quiet);uid=created.body.localId;result.authCreated=true;}finally{password=undefined;}}
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(uid||''))fail('INVALID_AUTH_UID');
 phase='create-owner';const at=new Date().toISOString(),str=v=>({stringValue:v});
 await db.post('/'+documents+':commit',{writes:[{update:{name:documents+'/martini_v2_admins/'+uid,fields:{uid:str(uid),displayName:str('운영 책임자'),role:str('owner'),active:{booleanValue:true},expiresAt:str('2027-02-28T14:59:59.000Z'),createdAt:str(at),updatedAt:str(at),createdBy:str(uid),updatedBy:str(uid)}},currentDocument:{exists:false}}]},quiet);
 result.ownerCreated=true;
 phase='send-password-email';
 await auth.post('/v1/projects/'+project+'/accounts:sendOobCode',{requestType:'PASSWORD_RESET',email},{...quiet,headers:{'X-Firebase-Locale':'ko'}});
 result.passwordEmailRequested=true;
 process.stdout.write(JSON.stringify({ok:true,...result})+'\n');
})().catch(error=>{const allowed=['EMAIL_EXISTS','EMAIL_NOT_FOUND','INVALID_EMAIL','WEAK_PASSWORD','INVALID_PASSWORD','OPERATION_NOT_ALLOWED','TOO_MANY_ATTEMPTS_TRY_LATER','PERMISSION_DENIED'];const message=error.context?.body?.error?.message||'',code=allowed.find(c=>message===c||message.startsWith(c+' :'));const fields=(error.context?.body?.error?.details||[]).flatMap(d=>d.fieldViolations||[]).map(v=>v.field).filter(v=>typeof v==='string'&&/^[A-Za-z0-9_.\[\]]{1,100}$/.test(v));const unknownFields=[...message.matchAll(/Unknown name "([A-Za-z0-9_]+)"/g)].map(m=>m[1]);process.stdout.write(JSON.stringify({ok:false,phase,...result,fields,unknownFields,code:error.safeCode||code||error.context?.body?.error?.status||'REQUEST_FAILED'})+'\n');process.exitCode=1;});
