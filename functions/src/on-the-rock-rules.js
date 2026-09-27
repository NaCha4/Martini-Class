// Shared by the staff page and the service; points are never supplied by clients.
export const BINGO_MISSIONS = [
 {id:'martini-follow',title:'마티니 인스타 팔로우',points:10,detail:'조원 전원 참여',requiresAll:true},
 {id:'bowling',title:'볼링치기',points:40},
 {id:'movie',title:'영화보기',points:40},
 {id:'mutual-follow',title:'서로 인스타 팔로우',points:10,detail:'조원 전원 참여',requiresAll:true},
 {id:'staff-photo',title:'운영진과 사진찍기',points:20},
 {id:'photo-booth',title:'인생네컷 찍기',points:20},
 {id:'regular-class',title:'정기교육 참여',points:30},
 {id:'lake-drink',title:'호수공원에서 맥주 한 잔',points:30,detail:'술이 아니어도 가능'},
 {id:'cafe',title:'카페 가기',points:10},
 {id:'feeling-fine',title:'필링파인 방문',points:40},
 {id:'clubroom-drink',title:'동방에서 술 마시기',points:30},
 {id:'meal',title:'밥 먹기',points:10},
 {id:'bar',title:'술집 가기',points:20},
 {id:'lion-photo',title:'사자상 앞에서 단체 사진 찍기',points:20},
 {id:'karaoke',title:'노래방 가기',points:10},
 {id:'trip',title:'안산 외 지역 놀러가기',points:60}
];
export const REPEAT_MISSIONS = ['meal','cafe','karaoke','bar'].map(id=>{
 const mission=BINGO_MISSIONS.find(m=>m.id===id);
 return {...mission,detail:'같은 미션은 24시간마다 1회'};
});
export const SPECIAL_MISSIONS = [
 {id:'event-class',title:'이벤트 클래스 참여',points:50},
 {id:'liquor-expo',title:'주류박람회 방문',points:70}
];
export const REPEAT_INTERVAL_MS=24*60*60*1000;
export const BINGO_LINES = [
 ...Array.from({length:4},(_,row)=>Array.from({length:4},(_,col)=>row*4+col)),
 ...Array.from({length:4},(_,col)=>Array.from({length:4},(_,row)=>row*4+col)),
 [0,5,10,15],[3,6,9,12]
].map(line=>line.map(index=>BINGO_MISSIONS[index].id));

export function calculateScore(records=[]){
 const active=records.filter(record=>!record.voidedAt),bingo=new Map(),special=new Set();
 let bingoPoints=0,participationBonus=0,repeatPoints=0,specialPoints=0;
 for(const record of active){
  if(record.kind==='bingo'){
   const mission=BINGO_MISSIONS.find(m=>m.id===record.missionId);
   if(!mission||bingo.has(mission.id))continue;
   bingo.set(mission.id,record);bingoPoints+=mission.points;
   if(record.allParticipated)participationBonus+=5;
  }else if(record.kind==='repeat'){
   repeatPoints+=REPEAT_MISSIONS.find(m=>m.id===record.missionId)?.points||0;
  }else if(record.kind==='special'){
   const mission=SPECIAL_MISSIONS.find(m=>m.id===record.missionId);
   if(!mission||special.has(mission.id))continue;
   special.add(mission.id);specialPoints+=mission.points;
  }
 }
 const completedCells=BINGO_MISSIONS.filter(m=>bingo.has(m.id)).map(m=>m.id);
 const completedLines=BINGO_LINES.filter(line=>line.every(id=>bingo.has(id))).length,bingoLinePoints=completedLines*30;
 return {bingoPoints,participationBonus,bingoLinePoints,repeatPoints,specialPoints,total:bingoPoints+participationBonus+bingoLinePoints+repeatPoints+specialPoints,completedCells,completedLines};
}
