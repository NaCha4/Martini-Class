// 1. Firebase 설정 (본인의 실제 값으로 교체하세요)
const firebaseConfig = {
    apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
    authDomain: "martini-class-d4d69.firebaseapp.com",
    projectId: "martini-class-d4d69",
    storageBucket: "martini-class-d4d69.firebasestorage.app",
    messagingSenderId: "994424737344",
    appId: "1:994424737344:web:555117a1674e6ba0ae59a5"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ADMIN_PASSWORD = "0305";

// DOM 요소들
const dayButtons = document.querySelectorAll('.day-btn');
const selectedDayNameEl = document.getElementById('selectedDayName');
const countEl = document.getElementById('count');
const attendeeListEl = document.getElementById('attendeeList');
const submitBtn = document.getElementById('submitBtn');
const logoImg = document.querySelector('.logo-image');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const adminControlGroup = document.getElementById('adminControlGroup');

let currentSelectedDay = "화요일";
let isRegistrationOpen = true; 
let logoClickCount = 0;

// [기능] 실시간 IP 주소 가져오기
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

// [기능] 실시간 신청 현황 감시
function subscribeToDay(day) {
    db.collection("votes").doc(day).onSnapshot((doc) => {
        const data = doc.data() || { members: [] };
        renderList(data.members);
    });
}

// [기능] 실시간 신청 시작/마감 상태 감시
function subscribeToSettings() {
    db.collection("settings").doc("status").onSnapshot((doc) => {
        if (doc.exists) {
            isRegistrationOpen = doc.data().isOpen;
            updateUIByStatus();
        }
    });
}

// [UI] 상태에 따른 버튼 디자인 변경
function updateUIByStatus() {
    if (!isRegistrationOpen) {
        submitBtn.textContent = "신청 마감됨";
        submitBtn.style.opacity = "0.5";
        submitBtn.style.cursor = "not-allowed";
    } else {
        submitBtn.textContent = "신청";
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
    }
}

// [UI] 명단 렌더링 (가나다 정렬)
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
        item.innerHTML = `
            <span class="at-name">${name}</span>
            <button class="delete-btn" onclick="deleteMember('${name}')">×</button>
        `;
        attendeeListEl.appendChild(item);
        void item.offsetWidth;
        item.classList.add('show');
    });
}

// 초기 실행
subscribeToDay(currentSelectedDay);
subscribeToSettings();

// [이벤트] 로고 5번 클릭 시 관리자 모드 활성화 (이스터 에그)
logoImg.addEventListener('click', () => {
    logoClickCount++;
    if (logoClickCount === 5) {
        exportBtn.style.display = 'block';
        resetBtn.style.display = 'block';
        adminControlGroup.style.display = 'flex';
        attendeeListEl.classList.add('admin-mode');
        alert("관리자 모드가 활성화되었습니다. 🍸");
    }
    setTimeout(() => { logoClickCount = 0; }, 3000);
});

// [이벤트] 요일 버튼 클릭
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        subscribeToDay(currentSelectedDay);
    });
});

// [핵심] 신청 버튼 클릭 로직
submitBtn.addEventListener('click', async () => {
    if (!isRegistrationOpen) return alert("현재는 신청 기간이 아닙니다.");

    const input = document.getElementById('userName');
    const name = input.value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    submitBtn.disabled = true;
    submitBtn.textContent = "처리 중...";

    try {
        const days = ["화요일", "수요일", "목요일"];
        const snapshots = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
        
        // 전체 요일 중복 체크
        let registeredDay = "";
        snapshots.forEach((doc, i) => {
            if (doc.exists && (doc.data().members || []).includes(name)) registeredDay = days[i];
        });

        if (registeredDay) {
            alert(`이미 ${registeredDay}에 신청 내역이 있습니다.\n주 1회만 신청 가능합니다.`);
            return;
        }

        // 정원 체크
        const curDoc = snapshots[days.indexOf(currentSelectedDay)];
        if (curDoc.exists && (curDoc.data().members || []).length >= 24) {
            alert("정원이 모두 찼습니다.");
            return;
        }

        // IP 및 기기정보 수집
        const userIp = await getUserIp();

        // Firestore 저장 (배치 처리)
        const batch = db.batch();
        const voteRef = db.collection("votes").doc(currentSelectedDay);
        const logRef = db.collection("logs").doc();

        batch.set(voteRef, {
            members: firebase.firestore.FieldValue.arrayUnion(name)
        }, { merge: true });

        batch.set(logRef, {
            name: name,
            day: currentSelectedDay,
            ip: userIp,
            userAgent: navigator.userAgent,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: "REGISTRATION"
        });

        await batch.commit();
        input.value = '';
        alert(`${currentSelectedDay} 교육 신청 완료!`);

    } catch (e) {
        console.error(e);
        alert("오류가 발생했습니다.");
    } finally {
        updateUIByStatus();
    }
});

// [관리자] 개별 삭제
async function deleteMember(name) {
    const pw = prompt(`'${name}' 님을 삭제하시겠습니까?\n비밀번호를 입력하세요:`);
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    await db.collection("votes").doc(currentSelectedDay).update({
        members: firebase.firestore.FieldValue.arrayRemove(name)
    });
}

// [관리자] 신청 시작 제어
document.getElementById('startBtn').addEventListener('click', async () => {
    // 1. 비밀번호 확인
    const pw = prompt("신청을 시작하시겠습니까?\n비밀번호를 입력하세요:");
    if (pw === null) return; // 취소 시 종료
    
    if (pw !== ADMIN_PASSWORD) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    try {
        await db.collection("settings").doc("status").set({ isOpen: true });
        
        // 시작 로그 기록 (선택 사항)
        const adminIp = await getUserIp();
        await db.collection("logs").add({
            action: "REGISTRATION_START",
            ip: adminIp,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            details: "관리자가 신청을 시작함"
        });
        
        alert("신청이 시작되었습니다.");
    } catch (e) {
        alert("상태 변경 중 오류 발생");
    }
});

// [관리자] 신청 마감 제어
document.getElementById('endBtn').addEventListener('click', async () => {
    // 1. 비밀번호 확인
    const pw = prompt("신청을 마감하시겠습니까?\n비밀번호를 입력하세요:");
    if (pw === null) return;
    
    if (pw !== ADMIN_PASSWORD) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    try {
        await db.collection("settings").doc("status").set({ isOpen: false });
        
        // 마감 로그 기록 (선택 사항)
        const adminIp = await getUserIp();
        await db.collection("logs").add({
            action: "REGISTRATION_END",
            ip: adminIp,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            details: "관리자가 신청을 마감함"
        });

        alert("신청이 마감되었습니다.");
    } catch (e) {
        alert("상태 변경 중 오류 발생");
    }
});

// [관리자] 명단 추출 (수직 정렬 CSV)
exportBtn.addEventListener('click', async () => {
    const pw = prompt("관리자 비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;

    const days = ["화요일", "수요일", "목요일"];
    const allDocs = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
    const lists = allDocs.map(doc => (doc.exists ? doc.data().members : []).sort((a,b)=>a.localeCompare(b)));

    const maxRows = Math.max(...lists.map(l => l.length));
    let csv = days.join(",") + "\n";

    for(let i=0; i<maxRows; i++) {
        csv += lists.map(l => l[i] || "").join(",") + "\n";
    }

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `마티니_명단_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
});

// [관리자] 전체 초기화 (로그 포함)
resetBtn.addEventListener('click', async () => {
    if (!confirm("모든 데이터를 초기화하시겠습니까?")) return;
    const pw = prompt("관리자 비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;

    try {
        const batch = db.batch();
        ["화요일", "수요일", "목요일"].forEach(day => {
            batch.set(db.collection("votes").doc(day), { members: [] });
        });

        // 초기화 로그 추가
        const adminIp = await getUserIp();
        batch.set(db.collection("logs").doc(), {
            action: "DATABASE_RESET",
            ip: adminIp,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        alert("초기화 완료");
    } catch (e) { alert("초기화 중 오류 발생"); }
});