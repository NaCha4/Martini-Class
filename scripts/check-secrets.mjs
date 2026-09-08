import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const roots=['web','functions/src','scripts','tests'];let hits=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else{const t=fs.readFileSync(p,'utf8');if(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)||/["']private_key["']\s*:\s*["']-----/.test(t)||/["']type["']\s*:\s*["']service_account/.test(t))hits.push(p);}}}
roots.forEach(scan);console.log(JSON.stringify({privateCredentialSignatures:hits,environmentFiles:['.env.local','serviceAccount.json','.secrets'].map(file=>({file,exists:fs.existsSync(file)}))}));if(hits.length)process.exitCode=1;
