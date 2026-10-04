import { field, modal } from './ui.js';
import { read } from './admin.js';

export async function itemEdit(ctx,id,categoryId){
 const r=id?(ctx.state.data.inventory?.[id]||(await read(ctx,'inventory',{recordId:id})).rows[0]):null;
 if(id&&!r)throw Error('품목을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
 const unit=r?.unit||'each';
 const dialog=modal(r?'품목 수정':'품목 추가',
  field('name','이름',r?.name,{required:true,wide:true,maxLength:100,autocomplete:'off'})+
  '<details class="editor-options wide inventory-options"><summary>수량 · 보관 설정</summary><div class="editor-fields">'+
  field('unit','관리 단위',unit,{choices:[['each','개'],['bottle','병'],['g','g'],['ml','mL'],['pack','팩']]})+
  field('size','한 병 용량 (mL)',r?.size??(unit==='bottle'?700:0),{type:'number',min:1,max:100000})+
  field('minimum','최소 보유량 (병 품목은 mL)',r?.minimum??0,{type:'number',min:0,max:100000})+
  field('location','보관 위치',r?.location??ctx.state.settings.location??'동아리방',{wide:true,maxLength:100})+
  field('note','메모',r?.note,{type:'textarea',wide:true,rows:2,maxLength:1000})+
  '</div></details>',
  async f=>{
   const val=name=>String(f.get(name)||'').trim();
   const selectedUnit=val('unit');
   await ctx.api('saveItem',{
    ...(r?{id:r.id,revision:r.revision}:{revision:0,...(categoryId?{categoryId}:{})}),
    name:val('name'),unit:selectedUnit,
    size:selectedUnit==='bottle'?Number(f.get('size')||700):(r?.size??0),
    minimum:Number(f.get('minimum')||0),location:val('location'),note:val('note')
   });
   ctx.toast('저장했습니다.');await ctx.render();
  },{wide:true,submit:r?'저장':'추가'});
 const unitControl=dialog.querySelector('[name=unit]'),size=dialog.querySelector('[name=size]');
 const updateUnit=()=>{const bottle=unitControl.value==='bottle';size.closest('label').hidden=!bottle;size.disabled=!bottle;size.required=bottle;if(bottle&&Number(size.value)<=0)size.value='700';};
 unitControl.addEventListener('change',updateUnit);updateUnit();
 return dialog;
}
