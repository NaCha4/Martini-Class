import { isMemberRoute } from './member-session.js';
import { renderPublicInfo } from './public-info.js';

export const isAdminScreen=(path=location.pathname)=>path==='/admin'||path.startsWith('/admin/');
export const isMerchantScreen=(path=location.pathname)=>path.replace(/\/+$/,'')==='/partners/feelingfine';
const kind=(path=location.pathname)=>isAdminScreen(path)?'admin':isMerchantScreen(path)?'merchant':isMemberRoute(path)||/^\/(e|r)(\/|$)/.test(path)?'member':'public';
const loaders={admin:()=>import('./admin.js'),merchant:()=>import('./partner-stamps.js'),member:()=>import('./public.js')};
const loaded={},pending={};
async function load(key){
 if(!pending[key])pending[key]=loaders[key]().then(module=>loaded[key]=module).catch(error=>{delete pending[key];throw error;});
 return pending[key];
}
export async function renderScreen(ctx,options){
 const path=location.pathname,key=kind(path);
 if(key==='public')return renderPublicInfo(ctx);
 const module=await load(key);
 if(location.pathname!==path)return '';
 return module[key==='admin'?'renderAdmin':key==='merchant'?'renderMerchant':'renderPublic'](ctx,options);
}
export async function screenAction(ctx,...args){
 const path=location.pathname,key=kind(path);
 if(key==='public'){if(args[0]==='public-refresh'){delete ctx.state.publicInfo;return ctx.render();}return;}
 const module=await load(key);
 if(location.pathname!==path)return;
 return module[key==='admin'?'adminAction':key==='merchant'?'merchantAction':'publicAction'](ctx,...args);
}
export async function screenSubmit(ctx,...args){
 const path=location.pathname,key=kind(path);
 if(key==='public')return;
 const module=await load(key);
 if(location.pathname!==path)return;
 return module[key==='admin'?'adminSubmit':key==='merchant'?'merchantSubmit':'publicSubmit'](ctx,...args);
}
export function screenChange(ctx,target){return loaded.admin?.sortMemberRows(ctx,target);}
export function mountScreen(ctx,app){
 const key=kind();
 if(key==='admin')loaded.admin?.mountAdminView(ctx,app);
 else if(key==='member')loaded.member?.mountPublicView(ctx,app);
 else if(key==='merchant')loaded.merchant?.mountPartnerViews(ctx);
}
export function prepareScreenRender(){loaded.member?.preparePublicView();}
export function clearScreen(ctx){loaded.member?.clearPublicView(ctx);loaded.merchant?.clearPartnerViews(ctx);}
