import { esc, field, icon, modal } from './ui.js';
import { read } from './admin.js';

const PHOTO_LIMIT=150000;
const PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);
export const inventoryPhoto=value=>typeof value==='string'&&value.length<=160000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';

export async function prepareInventoryPhoto(file){
 if(!PHOTO_TYPES.has(file.type))throw Error('JPG, PNG, WebP 사진을 선택해 주세요.');
 if(file.size>10*1024*1024)throw Error('10MB 이하의 사진을 선택해 주세요.');
 const source=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.'));image.src=source;});
  if(!image.naturalWidth||!image.naturalHeight)throw Error('사진 크기를 확인할 수 없습니다. 다른 사진을 선택해 주세요.');
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw Error('이 브라우저에서 사진을 준비하지 못했습니다. 다시 시도해 주세요.');
  const ratio=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight));
  let width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
  for(let attempt=0;attempt<6;attempt++){
   canvas.width=width;canvas.height=height;
   context.fillStyle='#ffffff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
   for(const quality of [.86,.72,.58,.44]){
    const photo=canvas.toDataURL('image/jpeg',quality);
    if(photo.length<=PHOTO_LIMIT&&inventoryPhoto(photo))return photo;
   }
   width=Math.max(1,Math.round(width*.75));height=Math.max(1,Math.round(height*.75));
  }
  throw Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
 }finally{image.onload=null;image.onerror=null;URL.revokeObjectURL(source);}
}

export async function itemEdit(ctx,id,categoryId){
 const r=id?(ctx.state.data.inventory?.[id]||(await read(ctx,'inventory',{recordId:id})).rows[0]):null;
 if(id&&!r)throw Error('품목을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
 const photo=inventoryPhoto(r?.photo),unit=r?.unit||'each';
 let processing=false,uploadVersion=0;
 const dialog=modal(r?'품목 정보 수정':'새 품목 등록',
  field('name','품목 이름',r?.name,{required:true,wide:true,maxLength:100,placeholder:'예: 봄베이 사파이어',autocomplete:'off'})+
  '<section class="wide inventory-photo-editor" aria-label="품목 사진"><div class="inventory-photo-preview" data-photo-preview>'+(photo?'<img src="'+esc(photo)+'" alt="등록한 품목 사진">':'<div class="inventory-photo-placeholder">'+icon('package')+'<span>사진을 추가하면 더 쉽게 찾을 수 있어요.</span></div>')+'</div><input type="hidden" name="photo" value="'+esc(photo)+'"><div class="inventory-photo-actions"><label class="button secondary inventory-photo-upload" for="inventory-photo-upload"><span data-photo-label>'+(photo?'사진 변경':'사진 추가')+'</span><input id="inventory-photo-upload" name="photoUpload" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="inventory-photo-help"></label><button type="button" class="button secondary" data-photo-remove'+(photo?'':' hidden')+'>사진 제거</button></div><p class="help" id="inventory-photo-help">사진은 선택 사항입니다. JPG, PNG, WebP · 최대 10MB</p><p class="inventory-photo-status help" role="status" aria-live="polite" data-photo-status></p></section>'+
  '<details class="editor-options wide inventory-options"><summary>수량 관리 설정 (선택)</summary><div class="editor-fields">'+
  field('unit','관리 단위',unit,{choices:[['each','개'],['bottle','병 (개봉 잔량 관리)'],['g','g'],['ml','mL'],['pack','팩']]})+
  field('size','한 병 용량 (mL)',r?.size??(unit==='bottle'?700:0),{type:'number',min:1,max:100000})+
  field('minimum','최소 보유량 (병 품목은 mL)',r?.minimum??0,{type:'number',min:0,max:100000})+
  field('location','보관 위치',r?.location??ctx.state.settings.location??'동아리방',{wide:true,maxLength:100})+
  field('note','메모',r?.note,{type:'textarea',wide:true,rows:2,maxLength:1000})+
  '<p class="wide help">'+(r?'보유 수량은 품목 상세의 수량 기록에서 관리할 수 있습니다.':'처음에는 0개로 등록됩니다. 필요할 때 품목 상세에서 수량을 기록할 수 있습니다.')+'</p></div></details>',
  async f=>{
   if(processing)throw Error('사진을 준비하고 있습니다. 잠시만 기다려 주세요.');
   const val=name=>String(f.get(name)||'').trim();
   const selectedUnit=val('unit');
   await ctx.api('saveItem',{
    ...(r?{id:r.id,revision:r.revision}:{revision:0,...(categoryId?{categoryId}:{})}),
    name:val('name'),photo:val('photo'),unit:selectedUnit,
    size:selectedUnit==='bottle'?Number(f.get('size')||700):(r?.size??0),
    minimum:Number(f.get('minimum')||0),location:val('location'),note:val('note')
   });
   ctx.toast('저장했습니다.');await ctx.render();
  },{wide:true,submit:r?'변경 저장':'품목 등록'});
 const upload=dialog.querySelector('[name=photoUpload]'),remove=dialog.querySelector('[data-photo-remove]'),hidden=dialog.querySelector('[name=photo]'),status=dialog.querySelector('[data-photo-status]'),submit=dialog.querySelector('[type=submit]');
 const showPhoto=value=>{
  hidden.value=value;
  const preview=dialog.querySelector('[data-photo-preview]');
  if(value){const image=document.createElement('img');image.src=value;image.alt='등록할 품목 사진';preview.replaceChildren(image);}
  else preview.innerHTML='<div class="inventory-photo-placeholder">'+icon('package')+'<span>사진을 추가하면 더 쉽게 찾을 수 있어요.</span></div>';
  remove.hidden=!value;dialog.querySelector('[data-photo-label]').textContent=value?'사진 변경':'사진 추가';
  hidden.dispatchEvent(new Event('input',{bubbles:true}));
 };
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];if(!file)return;
  const version=++uploadVersion;
  processing=true;submit.disabled=true;upload.disabled=true;remove.disabled=true;status.textContent='사진을 준비하고 있어요…';
  try{
   const prepared=await prepareInventoryPhoto(file);
   if(version!==uploadVersion||!dialog.isConnected)return;
   showPhoto(prepared);status.textContent='사진을 준비했습니다. 저장하면 적용됩니다.';
  }catch(error){if(version===uploadVersion&&dialog.isConnected)status.textContent=(error.message||'사진을 준비하지 못했습니다.')+' 현재 사진은 유지됩니다.';}
  finally{if(version===uploadVersion){processing=false;submit.disabled=false;upload.disabled=false;remove.disabled=false;upload.value='';}}
 });
 remove.addEventListener('click',()=>{showPhoto('');status.textContent='사진을 제거했습니다. 저장하면 적용됩니다.';upload.value='';});
 const unitControl=dialog.querySelector('[name=unit]'),size=dialog.querySelector('[name=size]');
 const updateUnit=()=>{const bottle=unitControl.value==='bottle';size.closest('label').hidden=!bottle;size.disabled=!bottle;size.required=bottle;if(bottle&&Number(size.value)<=0)size.value='700';};
 unitControl.addEventListener('change',updateUnit);updateUnit();
 dialog.addEventListener('close',()=>{uploadVersion++;},{once:true});
 return dialog;
}
