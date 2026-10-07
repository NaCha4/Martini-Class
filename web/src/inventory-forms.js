import { field, modal } from './ui.js';
import { read } from './admin-data.js';

const units={each:'개',bottle:'병',g:'g',ml:'mL',pack:'팩'};
const integerUnit=unit=>['each','bottle','pack'].includes(unit);
const quantityTitle=unit=>unit==='bottle'?'미개봉 수량 (병)':'현재 수량 ('+units[unit]+')';
const minimumTitle=unit=>'부족 알림 기준 ('+(unit==='bottle'?'mL':units[unit])+')';

export async function itemEdit(ctx,id,categoryId){
 const r=id?(ctx.state.data.inventory?.[id]||(await read(ctx,'inventory',{recordId:id})).rows[0]):null;
 if(id&&!r)throw Error('품목을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
 const unit=r?.unit||'each';
 const dialog=modal(r?'품목 수정':'품목 추가',
  field('name','이름',r?.name,{required:true,wide:true,maxLength:100,autocomplete:'off'})+
  field('unit','관리 단위',unit,{choices:[['each','개'],['bottle','병'],['g','g'],['ml','mL'],['pack','팩']]})+
  field('quantity',quantityTitle(unit),r?.quantity??0,{type:'number',required:true,min:0,max:100000,step:integerUnit(unit)?1:0.1,inputMode:integerUnit(unit)?'numeric':'decimal'})+
  field('size','한 병 용량 (mL)',r?.size??(unit==='bottle'?700:0),{type:'number',min:1,max:100000})+
  '<details class="editor-options wide inventory-options"><summary>추가 설정</summary><div class="editor-fields">'+
  field('minimum',minimumTitle(unit),r?.minimum??0,{type:'number',min:0,max:100000,step:integerUnit(unit)&&unit!=='bottle'?1:0.1})+
  field('note','메모',r?.note,{type:'textarea',wide:true,rows:2,maxLength:1000})+
  '</div></details>',
  async f=>{
   const val=name=>String(f.get(name)||'').trim();
   const selectedUnit=val('unit');
   const enteredQuantity=val('quantity'),quantity=Number(enteredQuantity);
   if(!enteredQuantity||!Number.isFinite(quantity)||quantity<0||quantity>100000)throw Error('현재 수량은 0 이상 100,000 이하로 입력해 주세요.');
   if(integerUnit(selectedUnit)&&!Number.isInteger(quantity))throw Error('이 품목은 정수 수량으로 입력해 주세요.');
   await ctx.api('saveItem',{
    ...(r?{id:r.id,revision:r.revision}:{revision:0,...(categoryId?{categoryId}:{})}),
    name:val('name'),unit:selectedUnit,quantity,
    size:selectedUnit==='bottle'?Number(f.get('size')||700):(r?.size??0),
    minimum:Number(f.get('minimum')||0),note:val('note')
   });
   ctx.toast('저장했습니다.');await ctx.render();
  },{wide:true,submit:r?'저장':'추가'});
 const unitControl=dialog.querySelector('[name=unit]'),size=dialog.querySelector('[name=size]'),quantity=dialog.querySelector('[name=quantity]'),minimum=dialog.querySelector('[name=minimum]');
 const updateUnit=()=>{
  const selectedUnit=unitControl.value,bottle=selectedUnit==='bottle';
  quantity.closest('label').querySelector('span').firstChild.textContent=quantityTitle(selectedUnit)+' ';
  quantity.step=integerUnit(selectedUnit)?'1':'0.1';quantity.inputMode=integerUnit(selectedUnit)?'numeric':'decimal';
  minimum.closest('label').querySelector('span').textContent=minimumTitle(selectedUnit);minimum.step=integerUnit(selectedUnit)&&!bottle?'1':'0.1';
  size.closest('label').hidden=!bottle;size.disabled=!bottle;size.required=bottle;if(bottle&&Number(size.value)<=0)size.value='700';
 };
 unitControl.addEventListener('change',updateUnit);updateUnit();
 return dialog;
}
