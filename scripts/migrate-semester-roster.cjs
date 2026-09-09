// Uses the existing Firebase CLI session in memory. Never logs credential or member values.
const {logger}=require('firebase-tools/lib/logger');logger.silent=true;
const {getProjectDefaultAccount,getGlobalDefaultAccount,getAccessToken}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {OAuth2Client}=require('../functions/node_modules/google-auth-library');
const {Firestore}=require('../functions/node_modules/firebase-admin/lib/firestore/index.js');
let phase='auth';
(async()=>{
 const projectId='martini-class-d4d69';
 if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('UNEXPECTED_EMULATOR');
 const account=getProjectDefaultAccount(process.cwd())||getGlobalDefaultAccount();if(!account)throw Error('NO_CLI_ACCOUNT');
 await requireAuth({project:projectId,user:account.user,tokens:account.tokens,nonInteractive:true});
 const authClient=new OAuth2Client();authClient.refreshHandler=async()=>{const t=await getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);return {access_token:t.access_token,expiry_date:Date.now()+3500000};};authClient.setCredentials(await authClient.refreshHandler());
 phase='firestore';const db=new Firestore({projectId,authClient});
 phase='module';const {migrateRoster}=await import('./semester-roster-migration.mjs');
 phase='migration';console.log(JSON.stringify(await migrateRoster(db,{apply:process.argv.includes('--apply')})));
 await db.terminate();
})().catch(e=>{const safe=['TOO_MANY_LEDGER_MARKERS','INVALID_LEGACY_SEMESTER','UNEXPECTED_LEGACY_SUBCOLLECTION','LEGACY_CHANGED_RETRY','INVALID_LEDGER_SEMESTER','LEDGER_LINK_CONFLICT','NEW_ROSTER_OLDER_THAN_LEGACY','UNEXPECTED_EMULATOR','NO_CLI_ACCOUNT'];console.log(JSON.stringify({ok:false,phase,errorType:e.name,number:typeof e.code==='number'?e.code:undefined,code:safe.includes(e.message)?e.message:'MIGRATION_FAILED'}));process.exitCode=1;});
