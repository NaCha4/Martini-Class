import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, schemas } from '../functions/src/domain.js';
import { inventoryCategoryId } from '../functions/src/inventory-board.js';
import { MAX_INVENTORY_PHOTO_LENGTH, validInventoryPhoto } from '../functions/src/inventory-photo.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MwAAAABJRU5ErkJggg==';
const webp='data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

test('simple inventory input needs only a name and preserves omitted optional fields',()=>{
 assert.deepEqual(parse(schemas.item,{name:'  셰이커  '}),{name:'셰이커',revision:0});
 assert.equal(parse(schemas.item,{name:'셰이커',photo:png}).photo,png);
 for(const name of ['','  ','a'.repeat(101)])assert.throws(()=>parse(schemas.item,{name}),e=>e.code==='invalid-argument');
 for(const extra of [{bottles:{}},{categoryId:'invalid/path'},{category:'custom'},{unit:'unknown'},{minimum:-1},{photo:null}])assert.throws(()=>parse(schemas.item,{name:'test',...extra}),e=>e.code==='invalid-argument');
});

test('explicit inventory quantities accept bounded numbers and keep omission distinct from zero',()=>{
 for(const quantity of [0,.5,750,100000])assert.equal(parse(schemas.item,{name:'수량',quantity}).quantity,quantity);
 assert.equal(Object.hasOwn(parse(schemas.item,{name:'생략'}),'quantity'),false);
 for(const quantity of [-1,100001,NaN,Infinity,-Infinity,'750',null])assert.throws(()=>parse(schemas.item,{name:'잘못된 수량',quantity}),e=>e.code==='invalid-argument');
});

test('photo validation allows bounded raster data URLs and rejects scripts, URLs and malformed data',()=>{
 for(const value of ['',png,webp])assert.equal(validInventoryPhoto(value),true);
 const invalid=['https://example.com/photo.jpg','data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64'),png.replace('image/png','image/jpeg'),png.replace('base64,','base64,\n'),png.slice(0,-1),png+'=',png.replace('iVBOR','aVBOR'),'data:image/png;base64,AAAA','data:image/png;base64,AB==','data:image/webp;base64,'+Buffer.from('RIFFwrongsizeWEBPVP8 ').toString('base64'),'data:image/jpeg;base64,'+Buffer.from('<script>alert(1)</script>').toString('base64')];
 for(const value of invalid)assert.equal(validInventoryPhoto(value),false);
 assert.equal(validInventoryPhoto(png+'A'.repeat(MAX_INVENTORY_PHOTO_LENGTH)),false);
 assert.throws(()=>parse(schemas.item,{name:'test',photo:png+'A'.repeat(MAX_INVENTORY_PHOTO_LENGTH)}),e=>e.code==='invalid-argument');
});

test('legacy categories are virtual until an explicit board category is assigned',()=>{
 for(const category of ['spirit','ingredient','supply','tool'])assert.equal(inventoryCategoryId({category}),'legacy-'+category);
 assert.equal(inventoryCategoryId({category:'spirit',categoryId:''}),'');
 assert.equal(inventoryCategoryId({category:'spirit',categoryId:'custom'}),'custom');
 assert.equal(inventoryCategoryId({category:'unknown'}),'');
});
