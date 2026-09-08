import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:start','--project','demo-martini','--only','auth,firestore,functions'],{stdio:'inherit',env:{...process.env,FUNCTIONS_DISCOVERY_TIMEOUT:process.env.FUNCTIONS_DISCOVERY_TIMEOUT||'60',FUNCTIONS_EMULATOR_PARALLEL:process.env.FUNCTIONS_EMULATOR_PARALLEL||'1'}});
child.on('exit',code=>{process.exitCode=code||0;});
