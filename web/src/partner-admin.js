import { hasPermission } from '../../functions/src/permissions.js';
import { esc, field, button, modal, empty, refreshIcons } from './ui.js';

const allowed=ctx=>hasPermission(ctx.state.profile,'settings');
const onPage=()=>location.pathname.replace(/\/$/,'')==='/admin/partners';
const current=(ctx,view)=>allowed(ctx)&&onPage()&&ctx.state.partnerAdminView===view&&ctx.state.profile===view.profile&&ctx.state.user===view.user;
const permissionError=error=>['functions/permission-denied','permission-denied','functions/unauthenticated','unauthenticated'].includes(error.code);
const historyDate=new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Seoul'});

async function openHistory(ctx,view){
 let rows=[],nextCursor=null,loading=false,loaded=false,errorMessage='',closed=false;
 const dialog=modal('필링파인 적립 기록',
  '<div class="partner-history-toolbar"><span>최신순</span><button type="button" class="button secondary" data-partner-history-refresh>새로고침</button></div><div data-partner-history-body></div>',
  null,{wide:true,contentOnly:true,onClose:()=>{
   closed=true;rows=[];nextCursor=null;
   dialog.querySelector('[data-partner-history-body]').innerHTML='';
   window.removeEventListener('pagehide',dismiss);
  }});
 dialog.classList.add('partneradmin-dialog','partner-history-dialog');
 const body=dialog.querySelector('[data-partner-history-body]'),refresh=dialog.querySelector('[data-partner-history-refresh]');
 const dismiss=()=>dialog.requestClose(true);
 window.addEventListener('pagehide',dismiss);
 const active=()=>!closed&&dialog.open&&dialog.isConnected&&current(ctx,view);
 function draw(){
  const moreFocused=document.activeElement===dialog.querySelector('[data-partner-history-more]');
  refresh.disabled=loading;body.setAttribute('aria-busy',String(loading));
  const table=rows.length?'<div class="table-wrap"><table><caption class="sr-only">필링파인 스탬프 적립 기록</caption><thead><tr><th scope="col">부원</th><th scope="col">적립 일시</th><th scope="col">적립</th><th scope="col">누적</th></tr></thead><tbody>'+rows.map(row=>'<tr><td data-label="부원"><strong>'+esc(row.memberName)+'</strong></td><td data-label="적립 일시"><time datetime="'+esc(row.at)+'">'+esc(historyDate.format(new Date(row.at)))+'</time></td><td data-label="적립">+1개</td><td data-label="누적">'+esc(row.stampCount)+'개</td></tr>').join('')+'</tbody></table></div>':loading?'<p class="partner-history-message" role="status">적립 기록을 불러오는 중…</p>':loaded&&!errorMessage?empty('적립 기록이 없습니다','스탬프를 적립하면 여기에 표시됩니다.') : '';
  body.innerHTML=table+(errorMessage?'<p class="partner-history-error" data-partner-history-error role="alert">'+esc(errorMessage)+'</p>':'')+(nextCursor?'<div class="partner-history-more"><button type="button" class="button secondary" data-partner-history-more'+(loading?' disabled':'')+'>'+(loading?'불러오는 중…':'더 보기')+'</button></div>':'');
  const status=dialog.querySelector('.dialog-status');
  status.textContent=loading&&rows.length?'적립 기록을 불러오는 중…':rows.length?rows.length+'건 표시':'';
  const more=dialog.querySelector('[data-partner-history-more]');
  if(more)more.onclick=()=>load(false);
  if(moreFocused){if(more&&!loading)more.focus({preventScroll:true});else{status.tabIndex=-1;status.focus({preventScroll:true});}}
  refreshIcons();
 }
 async function load(reset){
  if(!active()){await dismiss();return;}
  if(loading||(!reset&&!nextCursor))return;
  loading=true;errorMessage='';draw();
  try{
   const result=await ctx.api('couponHistory',reset?{}:{cursor:nextCursor});
   if(!active()){await dismiss();return;}
   rows=reset?result.items:[...rows,...result.items];nextCursor=result.nextCursor;loaded=true;
  }catch(error){
   if(!active()){await dismiss();return;}
   if(permissionError(error)){
    delete ctx.state.partnerAdminView;await dismiss();await ctx.render();return;
   }
   errorMessage='적립 기록을 불러오지 못했습니다. '+(reset?'새로고침으로 다시 시도해 주세요.':'더 보기를 눌러 다시 시도해 주세요.');
  }finally{loading=false;if(active())draw();}
 }
 refresh.onclick=()=>load(true);
 await load(true);
 return dialog;
}

export async function renderPartnerAdmin(ctx){
 if(!allowed(ctx)){delete ctx.state.partnerAdminView;return empty('운영 설정 권한이 필요합니다','역할 관리에서 권한을 확인해 주세요.');}
 const view={profile:ctx.state.profile,user:ctx.state.user};ctx.state.partnerAdminView=view;
 const settings=await ctx.api('couponSettings',{});
 if(!current(ctx,view))return '';
 view.settings=settings;
 return '<div class="page-heading"><h1 id="page-title" tabindex="-1">제휴 관리</h1></div><section class="panel partner-admin-card" aria-labelledby="partner-admin-title"><div class="partner-admin-summary"><h2 id="partner-admin-title">필링파인</h2><p>'+(settings.enabled&&settings.configured?'적립 사용 중':'적립 중지')+' · 코드 '+(settings.configured?'설정됨':'미설정')+'</p></div><div class="partner-admin-actions">'+button('적립 기록','partneradmin-history',{class:'button secondary',icon:'history'})+button('설정','partneradmin-edit',{icon:'settings-2'})+'</div></section>';
}

export async function partnerAdminAction(ctx,action){
 if(action==='partneradmin-refresh')return ctx.render();
 if(!['partneradmin-edit','partneradmin-history'].includes(action))return;
 const view=ctx.state.partnerAdminView;
 if(!view||!current(ctx,view)||!view.settings)throw new Error('제휴 관리 페이지를 다시 열어 주세요.');
 if(action==='partneradmin-history')return openHistory(ctx,view);
 const settings=view.settings;
 const dialog=modal('필링파인 설정',
  field('code',settings.configured?'새 로그인 코드':'사장님 로그인 코드','',{type:'password',required:!settings.configured,maxLength:null,autocomplete:'new-password',wide:true,hint:settings.configured?'변경할 때만 입력하세요. 비워 두면 기존 코드를 유지합니다.':'코드를 정하고 사장님에게 직접 전달해 주세요.'})+
  field('codeConfirmation','로그인 코드 다시 입력','',{type:'password',required:!settings.configured,maxLength:null,autocomplete:'new-password',wide:true})+
  '<p class="wide help">코드를 변경하면 사장님이 다시 로그인해야 합니다. 기존 스탬프는 유지됩니다.</p>',
  async(data,node)=>{
   if(!current(ctx,view))throw new Error('계정이나 권한이 변경되었습니다. 제휴 관리 페이지를 다시 열어 주세요.');
   const code=String(data.get('code')||'').trim(),confirmation=String(data.get('codeConfirmation')||'').trim();
   if(!settings.configured&&!code)throw new Error('사장님 로그인 코드를 입력해 주세요.');
   if(code!==confirmation)throw new Error('로그인 코드가 서로 다릅니다. 다시 확인해 주세요.');
   try{
    await ctx.api('saveCouponSettings',{revision:settings.revision,...(code?{code}:{})});
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
