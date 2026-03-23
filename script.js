// 1. Firebase 설정 (본인 정보로 교체 확인)
const firebaseConfig = {
  apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
  authDomain: "martini-class-d4d69.firebaseapp.com",
  projectId: "martini-class-d4d69",
  storageBucket: "martini-class-d4d69.firebasestorage.app",
  messagingSenderId: "994424737344",
  appId: "1:994424737344:web:555117a1674e6ba0ae59a5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ADMIN_PASSWORD = "0305";

const dayButtons = document.querySelectorAll('.day-btn');
const selectedDayNameEl = document.getElementById('selectedDayName');
const countEl = document.getElementById('count');
const attendeeListEl = document.getElementById('attendeeList');
let currentSelectedDay = "화요일";

let logoClickCount = 0;
let isAdmin = false; // 관리자 모드 상태 변수 추가

const logoImg = document.querySelector('.logo-image');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');

// 로고 5번 클릭 시 관리자 모드 활성화
logoImg.addEventListener('click', () => {
    logoClickCount++;
    if (logoClickCount === 5) {
        isAdmin = true; // 관리자 상태 변경
        
        // 1. 하단 관리 버튼 표시
        exportBtn.style.display = 'block';
        resetBtn.style.display = 'block';
        
        // 2. 명단 리스트에 관리자 클래스 추가 (X 버튼 보이게 함)
        attendeeListEl.classList.add('admin-mode');
        
        alert("관리자 모드가 활성화되었습니다.");
    }
    setTimeout(() => { logoClickCount = 0; }, 3000);
});

// [추가] 사용자의 공인 IP를 가져오는 함수
async function getUserIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) {
        console.error("IP 취득 실패:", e);
        return "unknown";
    }
}

function subscribeToDay(day) {
    db.collection("votes").doc(day).onSnapshot((doc) => {
        const data = doc.data() || { members: [] };
        renderList(data.members);
    });
}

function renderList(members) {
    attendeeListEl.innerHTML = '';
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    countEl.textContent = members.length;
    if (sortedMembers.length === 0) {
        attendeeListEl.innerHTML = '<p style="text-align:center;color:#64748b;padding-top:20px;">아직 신청자가 없습니다.</p>';
        return;
    }
    sortedMembers.forEach((name, index) => {
        const item = document.createElement('div');
        item.classList.add('attendee-item');
        item.style.animationDelay = `${index * 0.05}s`;
        item.innerHTML = `<span class="at-name">${name}</span><button class="delete-btn" onclick="deleteMember('${name}')">×</button>`;
        attendeeListEl.appendChild(item);
        void item.offsetWidth;
        item.classList.add('show');
    });
}

subscribeToDay(currentSelectedDay);

// 신청 로직 (IP 수집 포함)
document.getElementById('submitBtn').addEventListener('click', async () => {
    const input = document.getElementById('userName');
    const name = input.value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = "처리 중...";

    try {
        const days = ["화요일", "수요일", "목요일"];
        const snapshots = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
        
        // 중복 및 정원 체크
        let registeredDay = "";
        snapshots.forEach((doc, i) => { if(doc.exists && doc.data().members.includes(name)) registeredDay = days[i]; });
        if (registeredDay) { alert(`이미 ${registeredDay}에 신청하셨습니다.`); return; }
        
        const curIdx = days.indexOf(currentSelectedDay);
        if (snapshots[curIdx].exists && snapshots[curIdx].data().members.length >= 24) { alert("정원 초과입니다."); return; }

        // IP 주소 가져오기
        const userIp = await getUserIp();

        // 1. 투표 데이터 업데이트
        await db.collection("votes").doc(currentSelectedDay).set({
            members: firebase.firestore.FieldValue.arrayUnion(name)
        }, { merge: true });

        // 2. 로그 데이터 저장 (누가, 언제, 어떤 IP로 신청했는지 기록)
        await db.collection("logs").add({
            name: name,
            day: currentSelectedDay,
            ip: userIp,
            userAgent: navigator.userAgent, // 기기 정보 추가
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        input.value = '';
        alert(`${currentSelectedDay} 신청 완료!`);
    } catch (e) { alert("오류 발생"); } 
    finally { btn.disabled = false; btn.textContent = "신청"; }
});

dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        subscribeToDay(currentSelectedDay);
    });
});

async function deleteMember(name) {
    const pw = prompt("관리자 비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");
    await db.collection("votes").doc(currentSelectedDay).update({
        members: firebase.firestore.FieldValue.arrayRemove(name)
    });
}

document.getElementById('exportBtn').addEventListener('click', async () => {
    const pw = prompt("관리자 비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;
    const days = ["화요일", "수요일", "목요일"];
    const docs = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
    const lists = docs.map(d => (d.exists ? d.data().members : []).sort((a,b)=>a.localeCompare(b)));
    const max = Math.max(...lists.map(l => l.length));
    let csv = days.join(",") + "\n";
    for(let i=0; i<max; i++) { csv += lists.map(l => l[i] || "").join(",") + "\n"; }
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `마티니_명단_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
});

// 7. 데이터 초기화 기능 (초기화 활동 로그 수집 포함)
document.getElementById('resetBtn').addEventListener('click', async () => {

    const pwInput = prompt("비밀번호를 입력하세요:");
    if (pwInput === null) return;

    if (pwInput !== ADMIN_PASSWORD) {
        alert("비밀번호가 틀렸습니다.");
        return;
    }

    if (!confirm("진짜로 모든 데이터를 삭제하겠습니까?")) return;

    try {
        const batch = db.batch();
        const days = ["화요일", "수요일", "목요일"];
        
        // 1. 모든 요일 명단 비우기
        days.forEach(day => {
            const docRef = db.collection("votes").doc(day);
            batch.set(docRef, { members: [] });
        });

        // 2. 초기화 수행 로그 생성
        const adminIp = await getUserIp(); // 기존에 만든 IP 가져오기 함수 활용
        const logRef = db.collection("logs").doc(); // 새로운 로그 문서 ID 생성
        
        batch.set(logRef, {
            name: "SYSTEM_ADMIN",
            action: "DATABASE_RESET", // 어떤 행동인지 명시
            ip: adminIp,
            userAgent: navigator.userAgent,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            details: "관리자에 의한 전체 명단 초기화 수행"
        });

        await batch.commit();
        alert("명단이 초기화되었으며, 관리자 활동 로그가 기록되었습니다.");
        
    } catch (error) {
        console.error("초기화 실패:", error);
        alert("초기화 중 오류가 발생했습니다.");
    }
});