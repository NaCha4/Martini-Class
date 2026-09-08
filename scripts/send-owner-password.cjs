const {logger}=require('firebase-tools/lib/logger');logger.silent=true;
const {getProjectDefaultAccount,getGlobalDefaultAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
const quiet={skipLog:{body:true,resBody:true,queryParams:true},retries:0};
(async()=>{
 if(!process.argv.includes('--send')){process.stdout.write('Dry run: --send requests a password-reset email for the current Firebase CLI email. Explicit approval is required.\n');return;}
 const project='martini-class-d4d69',account=getProjectDefaultAccount(process.cwd())||getGlobalDefaultAccount();
 if(!account?.user?.email)throw Error('NO_CLI_ACCOUNT');
 await requireAuth({project,user:account.user,tokens:account.tokens,nonInteractive:true});
 const auth=new Client({urlPrefix:'https://identitytoolkit.googleapis.com'});
 await auth.post('/v1/projects/'+project+'/accounts:sendOobCode',{requestType:'PASSWORD_RESET',email:account.user.email},{...quiet,headers:{'X-Firebase-Locale':'ko'}});
 process.stdout.write('{"emailRequested":true}\n');
})().catch(error=>{const body=error.context?.body?.error||{};process.stdout.write(JSON.stringify({emailRequested:false,status:body.status||'FAILED',errorTag:body.message?.match(/^[A-Z_]{2,}/)?.[0]||null})+'\n');process.exitCode=1;});
