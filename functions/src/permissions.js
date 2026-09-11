export const permissionLabels={members:'부원 명부 등록·수정',events:'행사·참가자·출석 관리',finance:'회비·정산 관리',inventory:'재고 관리',meetings:'회의록',decisions:'결정·할 일',content:'공지·활동 게시',settings:'운영 설정',audit:'변경 이력 조회'};
export const permissionKeys=Object.keys(permissionLabels);
export const defaultRoles=[
 {id:'owner',name:'회장',permissions:[...permissionKeys,'admins'],system:true},
 {id:'chair',name:'부회장',permissions:[...permissionKeys,'admins'],system:true},
 {id:'finance',name:'재무부',permissions:['members','finance','meetings','decisions'],system:true},
 {id:'education',name:'교육부',permissions:['events','inventory','meetings','decisions'],system:true},
 {id:'execution',name:'집행부',permissions:['members','events','inventory','meetings','decisions'],system:true},
 {id:'publicity',name:'홍보부',permissions:['meetings','decisions','content'],system:true}
];
export function hasPermission(profile,key){
 const permissions=profile?.permissions??defaultRoles.find(r=>r.id===profile?.role)?.permissions??[];
 if(key==='eventRead'||key==='participants')return permissions.includes('events')||permissions.includes('finance');
 if(key==='membersRead')return permissions.includes('members')||permissions.includes('finance');
 return permissions.includes(key);
}
