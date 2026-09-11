import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {shortLink,linkKey} from '../web/src/share-links.js';
test('short links preserve all key bits and old fragments remain compatible',()=>{
 for(let i=0;i<100;i++){const bytes=i%2?12:32;const key=randomBytes(bytes).toString('hex');for(const kind of ['e','r']){const link=shortLink(kind,key);assert.equal(link.length,bytes===12?20:47);assert.equal(linkKey(link.split('#')[1]),key);assert.equal(linkKey('#key='+key),key);assert.equal(new URL(link,'https://hyu-martini.site').pathname,'/'+kind+'/');}}
});
test('malformed and noncanonical short fragments are rejected',()=>{for(const value of ['','abc','%','a'.repeat(44),'A'.repeat(42)+'B'])assert.equal(linkKey(value),'');assert.throws(()=>shortLink('r','abc'));assert.throws(()=>shortLink('x','a'.repeat(64)));});
