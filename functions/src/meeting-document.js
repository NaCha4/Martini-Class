export const MEETING_TEXT_LIMIT=30000;
const blockTypes=['paragraph','heading','bulletList','orderedList','blockquote','horizontalRule'];
const ownKeys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

// Shared allowlist: never store HTML, URLs, images, arbitrary styles or executable attributes.
export function validMeetingDocument(document){
 let count=0,characters=0;
 function node(value,depth=0){
  if(depth>12||++count>5000||!object(value)||!ownKeys(value,['type','content','attrs','text','marks']))return false;
  const {type,content,attrs,marks,text}=value;
  if(type==='text'){
   if(attrs!==undefined||content!==undefined||typeof text!=='string'||!text.length)return false;
   characters+=text.length;
  }else if(text!==undefined)return false;
  if(marks!==undefined){
   if(!['text','hardBreak'].includes(type)||!Array.isArray(marks)||marks.length>4)return false;
   if(marks.some(mark=>!object(mark)||!ownKeys(mark,['type'])||!['bold','italic','underline','strike'].includes(mark.type)))return false;
  }
  if(attrs!==undefined){
   if(!object(attrs))return false;
   const allowed=type==='heading'?['level','textAlign']:type==='paragraph'?['textAlign']:type==='orderedList'?['start','type']:[];
   if(!ownKeys(attrs,allowed))return false;
   if('textAlign' in attrs&&attrs.textAlign!==null&&!['left','center','right','justify'].includes(attrs.textAlign))return false;
   if('level' in attrs&&![1,2,3].includes(attrs.level))return false;
   if('start' in attrs&&(!Number.isInteger(attrs.start)||attrs.start<1||attrs.start>1000000))return false;
   if('type' in attrs&&attrs.type!==null&&!['1','a','A','i','I'].includes(attrs.type))return false;
  }
  if(type==='heading'&&![1,2,3].includes(attrs?.level))return false;
  if(['text','hardBreak','horizontalRule'].includes(type))return content===undefined&&characters<=MEETING_TEXT_LIMIT;
  if(content!==undefined&&(!Array.isArray(content)||content.some(child=>!node(child,depth+1))))return false;
  const children=content||[];
  if(type==='paragraph'||type==='heading')return children.every(child=>['text','hardBreak'].includes(child.type));
  if(type==='doc'||type==='blockquote')return (type!=='doc'||depth===0)&&children.length>0&&children.every(child=>blockTypes.includes(child.type));
  if(type==='bulletList'||type==='orderedList')return children.length>0&&children.every(child=>child.type==='listItem');
  if(type==='listItem')return children[0]?.type==='paragraph'&&children.every(child=>blockTypes.includes(child.type));
  return false;
 }
 try{return document?.type==='doc'&&node(document)&&characters<=MEETING_TEXT_LIMIT&&JSON.stringify(document).length<=250000&&meetingText(document).length<=MEETING_TEXT_LIMIT;}catch{return false;}
}
export function textDocument(text=''){
 return {type:'doc',content:String(text).split(/\r?\n/).map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))};
}
export function meetingText(document){
 function text(node){
  if(node.type==='text')return node.text;
  if(node.type==='hardBreak')return '\n';
  return (node.content||[]).map(text).join(['paragraph','heading'].includes(node.type)?'':'\n');
 }
 return text(document);
}
