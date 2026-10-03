import { getMemberSessionKey } from './member-session.js';
import { modal } from './ui.js';

// Keep application forms in the dialog itself, outside any wrapper form.
export function mountMemberDetail(ctx) {
 const template=document.querySelector('#member-detail-content');
 if(!template)return;
 const selection=ctx.state.memberInlineDetail,sessionKey=getMemberSessionKey(ctx);
 if(!selection||!sessionKey||template.dataset.kind!==selection.kind||template.dataset.id!==selection.id){template.remove();return;}
 const body=template.innerHTML,title=template.dataset.title;
 template.remove();
 const dialog=modal(title,body,null,{wide:true,contentOnly:true,onClose:({replaced})=>{
  if(replaced||ctx.state.memberInlineDetail!==selection)return;
  delete ctx.state.memberInlineDetail;
  delete ctx.state.currentEvent;delete ctx.state.currentReceipt;
 }});
 dialog.classList.add('member-dialog','member-detail-dialog');
 return dialog;
}
