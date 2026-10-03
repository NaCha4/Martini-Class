import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const files=[];
function visit(directory){
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,item.name);
  if(item.isDirectory())visit(file);
  else if(/\.(?:js|mjs)$/.test(file))files.push(file);
 }
}
for(const directory of ['web/src','functions/src','scripts','tests'])visit(directory);
for(const file of files){
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(result.status!==0){console.error(file+'\n'+(result.stderr||result.error?.message||'Syntax check failed'));process.exitCode=1;}
}
if(!process.exitCode)console.log('JavaScript syntax: '+files.length+' files passed.');
