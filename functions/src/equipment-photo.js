import { validInventoryPhoto } from './inventory-photo.js';
export const MAX_EQUIPMENT_PHOTO_LENGTH=64000;
export function equipmentPhotoSource(value){return typeof value==='string'&&value.length<=MAX_EQUIPMENT_PHOTO_LENGTH&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';}
export function validEquipmentPhoto(value){return value===''||!!equipmentPhotoSource(value)&&validInventoryPhoto(value);}
