// Keep the random capability in the URL fragment, out of HTTP request paths.
export function shortLink(kind,key){
 if(!['e','r'].includes(kind)||!/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(key))throw Error('링크를 확인해 주세요.');
 const bytes=key.match(/../g).map(v=>String.fromCharCode(parseInt(v,16))).join('');
 return '/'+kind+'/#'+btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function linkKey(fragment){
 const value=fragment.replace(/^#/,'');
 if(value.startsWith('key='))return new URLSearchParams(value).get('key')||'';
 if(!/^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{43})$/.test(value))return '';
 try{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));const key=Array.from(raw,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');return shortLink('e',key).split('#')[1]===value?key:'';}catch{return '';}
}
