import {test,expect} from '@playwright/test';

test('roster sorts every page by all four fields and preserves search and semester selection',async({page,baseURL})=>{
 if(baseURL!=='http://127.0.0.1:5173')throw Error('Local only');
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'마티니 운영실'})).toBeVisible();
 await page.evaluate(async()=>{
  const {ctx,state}=await import(document.querySelector('script[src*="/src/main.js"]').src);
  const profile={role:'owner',displayName:'로컬 정렬 검증'};
  const members=[
   {id:'a',name:'김가람',grade:'2',department:'전자',studentId:'10'},
   {id:'b',name:'가나',grade:'1',department:'기계',studentId:'2'},
   {id:'c',name:'나보라',grade:'10',department:'전자',studentId:'30'},
   {id:'d',name:'다하늘',grade:'3',department:'국어',studentId:'4'},
   {id:'e',name:'라온',grade:'',department:'',studentId:'5'},
   {id:'f',name:'마루',studentId:'6'},
  ].map(m=>({...m,phone:'정렬검증'}));
  window.rosterReads=[];
  state.profile=profile;
  ctx.api=async(op,data={})=>{
   if(op==='profile')return profile;
   if(op==='rosterTerms')return {rows:['2026-2','2027-1']};
   if(op==='read'&&data.kind==='settings')return {rows:[{semester:'2026-2'}]};
   if(op==='read'&&data.kind==='members'){
    window.rosterReads.push(data);
    if(data.semester==='2027-1')return {rows:[]};
    if(data.cursor)return {rows:structuredClone(members),nextCursor:null};
    return {rows:Array.from({length:100},(_,i)=>({id:'filler-'+i,name:'하부원'+i,studentId:String(100+i)})),nextCursor:'page2'};
   }
   throw Error('Unexpected API call: '+op);
  };
  await ctx.navigate('/admin/members?semester=2026-2');
 });
 const names=page.locator('tbody tr:visible [data-action="member-view"]');
 const ids=async()=>names.evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
 await expect(names).toHaveCount(106);
 expect(await names.first().getAttribute('data-id')).toBe('b');
 expect(await page.evaluate(()=>window.rosterReads)).toEqual([
  {kind:'members',semester:'2026-2',removed:false},
  {kind:'members',semester:'2026-2',removed:false,cursor:'page2'},
 ]);
 await page.getByRole('searchbox',{name:'부원 검색'}).fill('정렬검증');
 await expect(names).toHaveCount(6);
 const field=page.getByLabel('정렬 기준',{exact:true}),direction=page.getByLabel('정렬 방향',{exact:true});
 for(const [value,asc,desc] of [
  ['name',['b','a','c','d','e','f'],['f','e','d','c','a','b']],
  ['grade',['b','a','d','c','e','f'],['c','d','a','b','e','f']],
  ['department',['d','b','a','c','e','f'],['a','c','b','d','e','f']],
  ['studentId',['b','d','e','f','a','c'],['c','a','f','e','d','b']],
 ]){
  await field.selectOption(value);await direction.selectOption('asc');expect(await ids()).toEqual(asc);
  await direction.focus();await direction.selectOption('desc');expect(await ids()).toEqual(desc);
 }
 await expect(page.getByRole('searchbox',{name:'부원 검색'})).toHaveValue('정렬검증');
 await expect(direction).toBeFocused();
 await page.evaluate(async()=>{const {ctx}=await import(document.querySelector('script[src*="/src/main.js"]').src);await ctx.render();});
 await expect(field).toHaveValue('studentId');await expect(direction).toHaveValue('desc');
 expect(await ids()).toEqual(['c','a','f','e','d','b']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.local/screenshots/member-sorting-'+test.info().project.name+'.png'});
 await page.getByRole('navigation',{name:'명부 학기'}).getByRole('link',{name:'2027-1'}).click();
 await expect(page.getByRole('heading',{name:'명부가 아직 비어 있습니다'})).toBeVisible();
 await field.selectOption('grade');await direction.selectOption('asc');
 await page.getByRole('navigation',{name:'명부 학기'}).getByRole('link',{name:'2026-2'}).click();
 await expect(field).toHaveValue('grade');await expect(direction).toHaveValue('asc');
 await expect(names).toHaveCount(106);expect(await names.first().getAttribute('data-id')).toBe('b');
});
