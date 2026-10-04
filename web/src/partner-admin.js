import { hasPermission } from '../../functions/src/permissions.js';
import { field, button, modal, empty } from './ui.js';

const allowed=ctx=>hasPermission(ctx.state.profile,'settings');
const onPage=()=>location.pathname.replace(/\/$/,'')==='/admin/partners';
const current=(ctx,view)=>allowed(ctx)&&onPage()&&ctx.state.partnerAdminView===view&&ctx.state.profile===view.profile&&ctx.state.user===view.user;

export async function renderPartnerAdmin(ctx){
 if(!allowed(ctx)){delete ctx.state.partnerAdminView;return empty('운영 설정 권한이 필요합니다','역할 관리에서 권한을 확인해 주세요.');}
 const view={profile:ctx.state.profile,user:ctx.state.user};ctx.state.partnerAdminView=view;
 const settings=await ctx.api('couponSettings',{});
 if(!current(ctx,view))return '';
 view.settings=settings;
 return '<div class="page-heading"><div><h1 id="page-title" tabindex="-1">제휴 관리</h1><p>필링파인 스탬프와 사장님 로그인을 설정합니다.</p></div>'+button('설정','partneradmin-edit',{icon:'settings-2'})+'</div><section class="panel padded"><h2>필링파인</h2><div class="detail-grid"><p>스탬프 적립<br><strong>'+(settings.enabled&&settings.configured?'사용 중':'사용 중지')+'</strong></p><p>사장님 로그인 코드<br><strong>'+(settings.configured?'설정됨':'미설정')+'</strong></p><p>로그인 유지<br><strong>1년</strong></p></div><p>부원라운지의 제휴 카드에서 스탬프를 확인하고 10초짜리 QR을 표시합니다. 사장님이 QR을 열어 확인하면 스탬프 1개가 적립됩니다.</p><p>로그인 코드는 저장 후 다시 표시하지 않습니다. 코드를 변경하거나 적립을 중지하면 기존 사장님 로그인이 해제됩니다.</p><a class="button secondary" href="/partners/feelingfine" target="_blank" rel="noopener noreferrer">사장님 화면 열기 (새 탭)</a></section>';
}

export async function partnerAdminAction(ctx,action){
 if(action==='partneradmin-refresh')return ctx.render();
 if(action!=='partneradmin-edit')return;
 const view=ctx.state.partnerAdminView;
 if(!view||!current(ctx,view)||!view.settings)throw new Error('제휴 관리 페이지를 다시 열어 주세요.');
 const settings=view.settings;
 const dialog=modal('필링파인 설정',
  field('enabled','스탬프 적립 사용',settings.enabled,{type:'checkbox',wide:true})+
  field('code',settings.configured?'새 로그인 코드':'사장님 로그인 코드','',{type:'password',required:!settings.configured,minLength:12,maxLength:128,autocomplete:'new-password',wide:true,hint:settings.configured?'변경할 때만 12자 이상 입력하세요. 비워 두면 기존 코드를 유지합니다.':'12자 이상으로 정하고 사장님에게 직접 전달해 주세요.'})+
  field('codeConfirmation','로그인 코드 다시 입력','',{type:'password',required:!settings.configured,minLength:12,maxLength:128,autocomplete:'new-password',wide:true})+
  '<p class="wide help">코드를 변경하거나 적립을 중지하면 사장님이 다시 로그인해야 합니다. 기존 스탬프는 유지됩니다.</p>',
  async(data,node)=>{
   if(!current(ctx,view))throw new Error('계정이나 권한이 변경되었습니다. 제휴 관리 페이지를 다시 열어 주세요.');
   const code=String(data.get('code')||'').trim(),confirmation=String(data.get('codeConfirmation')||'').trim();
   if((!settings.configured||code)&& (code.length<12||code.length>128))throw new Error('로그인 코드는 12자 이상 128자 이하로 입력해 주세요.');
   if(code!==confirmation)throw new Error('로그인 코드가 서로 다릅니다. 다시 확인해 주세요.');
   try{
    await ctx.api('saveCouponSettings',{revision:settings.revision,enabled:data.has('enabled'),...(code?{code}:{})});
   }catch(error){
    if(['functions/permission-denied','permission-denied','functions/unauthenticated','unauthenticated'].includes(error.code)){
     delete ctx.state.partnerAdminView;
     for(const input of node.querySelectorAll('[name=code],[name=codeConfirmation]'))input.value='';
     await dialog.requestClose(true);await ctx.render();return;
    }
    throw error;
   }
   for(const input of node.querySelectorAll('[name=code],[name=codeConfirmation]'))input.value='';
   if(!current(ctx,view))return;
   await ctx.render();
   if(allowed(ctx)&&onPage()&&ctx.state.user===view.user)ctx.toast('필링파인 설정을 저장했습니다.');
  },{submit:'설정 저장'});
 dialog.classList.add('partneradmin-dialog');
 return dialog;
}
