import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
process.chdir(root);
await build();
const output=path.join(root,'dist');
const routes=['e','r','about','activities','join','notices','privacy','events','admin','admin/events','admin/members','admin/inventory','admin/finance','admin/meetings','admin/decisions','admin/content','admin/settings','admin/admins','admin/roles','admin/privacy','admin/audit'];
const html=await fs.readFile(path.join(output,'index.html'),'utf8');
await fs.writeFile(path.join(output,'404.html'),html);
for(const route of routes){await fs.mkdir(path.join(output,route),{recursive:true});await fs.writeFile(path.join(output,route,'index.html'),html);}
await fs.writeFile(path.join(output,'.nojekyll'),'');
await fs.writeFile(path.join(output,'CNAME'),'hyu-martini.site\n');
if(process.argv.includes('--stage-pages')){
 const manifest=path.join(root,'.pages-assets.json');
 let old=[];try{old=JSON.parse(await fs.readFile(manifest,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const allowed=name=>name==='index.html'||name==='404.html'||name==='.nojekyll'||name==='CNAME'||/^assets\/[\w./-]+$/.test(name)||routes.some(route=>name===route+'/index.html');
 const safe=name=>{if(!allowed(name)||name.includes('..'))throw Error('Unsafe generated path');const p=path.resolve(root,name);if(!p.startsWith(root+path.sep))throw Error('Outside workspace');return p;};
 async function walk(dir,prefix=''){const files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())files.push(...await walk(path.join(dir,entry.name),name+'/'));else files.push(name);}return files;}
 const files=await walk(output);
 for(const name of files){const destination=safe(name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(output,name),destination);}
 for(const name of old){if(!files.includes(name))await fs.rm(safe(name),{force:true});}
 await fs.writeFile(manifest,JSON.stringify(files.sort(),null,2)+'\n');
 console.log('Prepared '+files.length+' files for the existing GitHub Pages main/root deployment.');
}
