// Shared, dependency-free validation for the public joining link.
export function openChatUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&url.hostname==='open.kakao.com'&&!url.port&&!url.username&&!url.password&&/^\/o\/[a-zA-Z0-9]+\/?$/.test(url.pathname)?url.href:'';
 }catch{return '';}
}
