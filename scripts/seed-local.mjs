import { initializeApp } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { getAuth } from '../functions/node_modules/firebase-admin/lib/auth/index.js';
import { identity, hash } from '../functions/src/domain.js';
if(process.env.GOOGLE_CLOUD_PROJECT && !process.env.GOOGLE_CLOUD_PROJECT.startsWith('demo-'))throw Error('Emulator-only script');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const app=initializeApp({projectId:'demo-martini'}),db=getFirestore(app),auth=getAuth(app);
const at=new Date().toISOString(),future=days=>new Date(Date.now()+days*86400000).toISOString();
try{await auth.getUser('local-owner');}catch{await auth.createUser({uid:'local-owner',email:'admin@martini.local',password:'Martini-Local-2026!',displayName:'로컬 운영 책임자'});}
if((await db.doc('martini_v2_settings/club').get()).exists){console.log('Local data already exists; kept existing records.');process.exit(0);}
const meta={revision:1,createdAt:at,updatedAt:at,createdBy:'local-owner',updatedBy:'local-owner'};
const batch=db.batch();
batch.set(db.doc('martini_v2_admins/local-owner'),{displayName:'로컬 운영 책임자',role:'owner',active:true,expiresAt:future(365),updatedAt:at});
batch.set(db.doc('martini_v2_settings/club'),{...meta,id:'club',semester:'2026-2',semesterEndsAt:future(120),duesAmount:30000,joinUrl:'',contact:'로컬 검증용 문의처',intro:'칵테일을 배우고, 함께 만들고, 가까워지는 동아리 마티니.',location:'동아리방',privacy:'로컬 검증용 안내입니다. 이 환경에는 가상 데이터만 입력해 주세요. 실제 서비스에서는 학기 단위 보존과 처리 담당자를 안내합니다.',bankInstructions:'로컬 테스트: 실제 입금하지 마세요.'});
for(const [id,name,studentId,phone,paid] of [['demo-member-1','가상부원 가','202600001','01000000001',true],['demo-member-2','가상부원 나','202600002','01000000002',true],['demo-member-3','가상부원 다','202600003','01000000003',false]]){
 batch.set(db.doc('martini_v2_members/'+id),{...meta,id,name,studentId,phone,college:'예시 단과대학',department:'예시학과',grade:'2',gender:'미기재',semester:'2026-2',status:'active',duesPaid:paid,identityHash:identity(studentId,phone)});
}
for(const [id,title,type,fee,capacity] of [['demo-opening','우리의 첫 잔, 개강총회','meeting',0,50],['demo-class','처음 만나는 칵테일 도구','class',10000,20]]){
 batch.set(db.doc('martini_v2_events/'+id),{...meta,id,title,type,description:'로컬 검증용 가상 행사입니다. 함께 알아가고 이야기하는 시간을 준비합니다.',location:'동아리방',startsAt:future(7),endsAt:new Date(Date.now()+7*86400000+7200000).toISOString(),opensAt:at,closesAt:future(6),cancelUntil:future(6),capacity,fee,waitlist:true,status:'open',semester:'2026-2',questions:[],policy:'로컬 검증용 정책: 취소 마감 전 취소할 수 있습니다.',paymentInstructions:'로컬 검증용입니다. 실제 입금하지 마세요.',registered:0,waiting:0,sequence:0,linkHash:hash('a'.repeat(64)),owner:'교육부'});
}
batch.set(db.doc('martini_v2_inventory/demo-gin'),{...meta,id:'demo-gin',name:'예시 런던 드라이 진',category:'spirit',unit:'bottle',size:700,location:'동아리방 · 주류 선반',minimum:1400,note:'가상 재고',quantity:2,bottles:{'demo-bottle':60}});
batch.set(db.doc('martini_v2_inventory/demo-shaker'),{...meta,id:'demo-shaker',name:'예시 셰이커',category:'tool',unit:'each',size:0,location:'동아리방 · 도구장',minimum:5,note:'가상 도구',quantity:4,bottles:{}});
const meeting={...meta,id:'demo-meeting',title:'2학기 운영 준비 회의',date:at,location:'동아리방',attendees:['회장단','교육부','집행부','총무부','홍보부'],status:'in_progress',semester:'2026-2',body:'로컬 검증용 회의록입니다. 실제 결정 사항이 아닙니다.',agendas:[{id:'agenda-one',title:'개강총회 준비',notes:'장소와 준비 역할을 나누고 참가 신청 일정을 검토합니다.',status:'planned'}]};
batch.set(db.doc('martini_v2_meetings/demo-meeting'),meeting);
batch.set(db.doc('martini_v2_meetings/demo-meeting/revisions/000001'),{...meeting,revisionActor:'로컬 운영 책임자'});
batch.set(db.doc('martini_v2_decisions/demo-decision'),{...meta,id:'demo-decision',title:'총회 준비물 목록 정리',body:'필요한 재료와 도구를 확인합니다. 가상 업무입니다.',type:'action',meetingId:'demo-meeting',agendaId:'agenda-one',owner:'집행부',dueAt:future(3),status:'in_progress',semester:'2026-2'});
await batch.commit();console.log('Created fictional local data in demo-martini only.');
