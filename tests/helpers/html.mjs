import parse5 from 'parse5';

export const htmlTree=html=>parse5.parseFragment(html);
export const attr=(node,name)=>node.attrs?.find(attribute=>attribute.name===name)?.value;
export function elements(node,predicate){
 const result=[];
 for(const child of node.childNodes||[]){
  if(child.tagName&&predicate(child))result.push(child);
  result.push(...elements(child,predicate));
 }
 return result;
}
export function textContent(node){
 return node.nodeName==='#text'?node.value:(node.childNodes||[]).map(textContent).join('');
}
