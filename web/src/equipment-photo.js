import { esc,icon,refreshIcons } from './ui.js';
import { MAX_EQUIPMENT_PHOTO_LENGTH,equipmentPhotoSource } from '../../functions/src/equipment-photo.js';

// Capturing listeners also cover images inserted by refreshes and editor previews.
if(typeof document!=='undefined'){
 document.addEventListener('load',event=>{if(event.target.matches?.('[data-equipment-photo]'))event.target.parentElement.classList.toggle('has-photo',event.target.naturalWidth>0);},true);
 document.addEventListener('error',event=>{if(event.target.matches?.('[data-equipment-photo]'))event.target.parentElement.classList.remove('has-photo');},true);
}
export function equipmentPhoto(photo,extraClass=''){
 const source=equipmentPhotoSource(photo);
 return '<span class="equipment-media '+extraClass+'" aria-hidden="true"><span class="equipment-photo-placeholder">'+icon('package')+'</span>'+(source?'<img data-equipment-photo src="'+esc(source)+'" alt="" loading="lazy" decoding="async" draggable="false">':'')+'</span>';
}
export function equipmentPhotoField(photo=''){
 return '<section class="wide equipment-photo-editor"><h3>대표 사진</h3><div data-equipment-preview>'+equipmentPhoto(photo,'equipment-editor-preview')+'</div><input type="hidden" name="photo" value="'+esc(equipmentPhotoSource(photo))+'"><label class="field"><span>사진 등록·교체</span><input type="file" data-equipment-photo-file accept="image/jpeg,image/png,image/webp"><small>JPG, PNG, WebP · 최대 10MB. 사진은 자동으로 축소됩니다.</small></label><button type="button" class="button secondary small" data-equipment-photo-remove'+(!photo?' disabled':'')+'>사진 삭제</button><p class="help">사진이 없으면 기본 아이콘이 표시됩니다. 비품 저장을 누르면 변경사항이 반영됩니다.</p><p class="help equipment-photo-status" data-equipment-photo-status role="status" aria-live="polite"></p></section>';
}
export async function prepareEquipmentPhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG, WebP 사진을 선택해 주세요.');
 if(!file.size||file.size>10*1024*1024)throw Error('사진은 10MB 이하로 선택해 주세요.');
 let bitmap;
 try{bitmap=await createImageBitmap(file);}catch{throw Error('사진을 읽을 수 없습니다. 다른 파일을 선택해 주세요.');}
 try{
  if(!bitmap.width||!bitmap.height)throw Error('사진 크기를 확인할 수 없습니다.');
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw Error('사진을 처리할 수 없습니다. 다시 시도해 주세요.');
  for(const edge of [640,480,320,240]){
   const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.85,.7,.55,.4]){
    const photo=canvas.toDataURL('image/webp',quality);
    if(photo.length<=MAX_EQUIPMENT_PHOTO_LENGTH&&equipmentPhotoSource(photo))return photo;
   }
  }
  throw Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
 }finally{bitmap.close();}
}
export function bindEquipmentPhotoEditor(dialog,current){
 const input=dialog.querySelector('[data-equipment-photo-file]'),value=dialog.querySelector('[name=photo]'),preview=dialog.querySelector('[data-equipment-preview]'),remove=dialog.querySelector('[data-equipment-photo-remove]'),status=dialog.querySelector('[data-equipment-photo-status]'),submit=dialog.querySelector('[type=submit]');
 let sequence=0;
 const live=()=>dialog.open&&dialog.isConnected&&current();
 const show=photo=>{value.value=photo;preview.innerHTML=equipmentPhoto(photo,'equipment-editor-preview');remove.disabled=!photo;refreshIcons();};
 const busy=active=>{dialog.equipmentPhotoBusy=active;submit.disabled=active;input.setAttribute('aria-busy',String(active));};
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file)return;const request=++sequence;
  busy(true);delete status.dataset.error;status.textContent='사진을 준비하고 있습니다…';
  try{const photo=await prepareEquipmentPhoto(file);if(request!==sequence||!live())return;show(photo);status.textContent='사진을 준비했습니다. 비품 저장을 누르면 반영됩니다.';}
  catch(error){if(request===sequence&&live()){status.dataset.error='true';status.textContent=error.message;}}
  finally{if(request===sequence){busy(false);input.value='';}}
 });
 remove.addEventListener('click',()=>{if(!live())return;++sequence;busy(false);input.value='';show('');delete status.dataset.error;status.textContent='비품 저장을 누르면 사진이 삭제됩니다.';});
}
