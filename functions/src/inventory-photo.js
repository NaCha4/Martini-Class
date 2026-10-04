export const MAX_INVENTORY_PHOTO_LENGTH=160000;

// Store a bounded thumbnail, never an external URL or an executable SVG document.
export function validInventoryPhoto(value){
 if(value==='')return true;
 if(typeof value!=='string'||value.length>MAX_INVENTORY_PHOTO_LENGTH)return false;
 const match=/^data:image\/(jpeg|png|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(value);
 if(!match||!match[2])return false;
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.toString('base64')!==match[2])return false;
 if(match[1]==='jpeg')return bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
 if(match[1]==='png')return bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(bytes.length-12)===0&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND';
 return bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)===bytes.length-8&&bytes.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16));
}
