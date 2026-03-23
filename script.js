// 1. Firebase 설정
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

// DOM 요소
const dayButtons = document.querySelectorAll('.day-btn');
const selectedDayNameEl = document.getElementById('selectedDayName');
const countEl = document.getElementById('count');
const attendeeListEl = document.getElementById('attendeeList');
const submitBtn = document.getElementById('submitBtn');
const logoImg = document.querySelector('.logo-image');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const adminControlGroup = document.getElementById('adminControlGroup');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');

let currentSelectedDay = "화요일";
let isRegistrationOpen = true; 
let openTime = null; 
let logoClickCount = 0;

// [기능] IP 주소 가져오기
async function getUserIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) { return "unknown"; }
}

// [기능] 실시간 데이터 감시
function subscribeToDay(day) {
    db.collection("votes").doc(day).onSnapshot((doc) => {
        const data = doc.data() || { members: [] };
        renderList(data.members);
    });
}

function subscribeToSettings() {
    db.collection("settings").doc("status").onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            isRegistrationOpen = data.isOpen;
            openTime = data.openTime ? data.openTime.toDate() : null;
            updateUIByStatus();
        }
    });
}

// [UI] 버튼 상태 업데이트 (1초마다 실행)
function updateUIByStatus() {
    const submitBtn = document.getElementById('submitBtn');
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;

    if (!effectivelyOpen) {
        let message = "신청 마감됨";
        submitBtn.classList.remove('waiting');
        submitBtn.classList.add('closed'); // 마감 클래스 추가

        if (openTime && now < openTime) {
            const diff = openTime - now;
            const mins = Math.ceil(diff / 60000);
            message = `${mins}분 후 오픈`;
            submitBtn.classList.remove('closed');
            submitBtn.classList.add('waiting'); // 대기 클래스 추가
        }
        submitBtn.textContent = message;
        submitBtn.style.opacity = "0.5";
        submitBtn.style.cursor = "not-allowed";
    } else {
        submitBtn.textContent = "신청";
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
    }
}

// [UI] 명단 출력
function renderList(members) {
    attendeeListEl.innerHTML = '';
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    countEl.textContent = members.length;
    if (sortedMembers.length === 0) {
        attendeeListEl.innerHTML = '<p style="text-align:center;color:#64748b;padding-top:20px;">아직 신청자가 없습니다.</p>';
        return;
    }
    sortedMembers.forEach((name) => {
        const item = document.createElement('div');
        item.classList.add('attendee-item');
        item.innerHTML = `<span class="at-name">${name}</span><button class="delete-btn" onclick="deleteMember('${name}')">×</button>`;
        attendeeListEl.appendChild(item);
        item.classList.add('show');
    });
}

setInterval(updateUIByStatus, 1000);
subscribeToDay(currentSelectedDay);
subscribeToSettings();

// --- 관리자 모드 활성화 ---
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

// 요일 선택
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        subscribeToDay(currentSelectedDay);
    });
});

// 신청 버튼 클릭
submitBtn.addEventListener('click', async () => {
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;
    if (!effectivelyOpen) return alert("현재는 신청 기간이 아닙니다.");

    const name = document.getElementById('userName').value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    submitBtn.disabled = true;
    try {
        const days = ["화요일", "수요일", "목요일"];
        const snapshots = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
        
        let registeredDay = "";
        snapshots.forEach((doc, i) => { if (doc.exists && (doc.data().members || []).includes(name)) registeredDay = days[i]; });
        if (registeredDay) { alert(`이미 ${registeredDay}에 신청하셨습니다.`); return; }

        if (snapshots[days.indexOf(currentSelectedDay)].exists && 
            (snapshots[days.indexOf(currentSelectedDay)].data().members || []).length >= 24) {
            return alert("정원이 가득 찼습니다.");
        }

        const userIp = await getUserIp();
        const batch = db.batch();
        batch.set(db.collection("votes").doc(currentSelectedDay), { members: firebase.firestore.FieldValue.arrayUnion(name) }, { merge: true });
        batch.set(db.collection("logs").doc(), { 
            name, day: currentSelectedDay, ip: userIp, 
            userAgent: navigator.userAgent, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        });
        await batch.commit();
        document.getElementById('userName').value = '';
        alert(`${currentSelectedDay} 신청 완료!`);
    } catch (e) { alert("오류 발생"); }
    finally { submitBtn.disabled = false; updateUIByStatus(); }
});

// --- 관리자 기능 ---

async function deleteMember(name) {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");
    await db.collection("votes").doc(currentSelectedDay).update({ members: firebase.firestore.FieldValue.arrayRemove(name) });
}

// [수정] 직접 시간 입력 방식 (오류 없음)
startBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    const timeStr = prompt("시작 시간을 입력하세요.\n(형식: 2026-03-24 18:00)\n빈칸이면 즉시 시작됩니다.");
    if (timeStr === null) return;

    let targetDate;
    if (timeStr.trim() === "") {
        targetDate = new Date();
    } else {
        targetDate = new Date(timeStr.replace(/-/g, "/")); // 브라우저 호환성을 위해 -를 /로 교체
        if (isNaN(targetDate.getTime())) return alert("날짜 형식이 올바르지 않습니다.");
    }

    const isNow = (targetDate <= new Date());
    if (!confirm(isNow ? "즉시 시작하시겠습니까?" : `${targetDate.toLocaleString()} 에 예약하시겠습니까?`)) return;

    try {
        await db.collection("settings").doc("status").set({ 
            isOpen: isNow, 
            openTime: firebase.firestore.Timestamp.fromDate(targetDate) 
        }, { merge: true });
        alert("설정 완료 🍸");
    } catch (e) { alert("오류 발생"); }
});

endBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");
    await db.collection("settings").doc("status").set({ isOpen: false, openTime: null }, { merge: true });
    alert("마감되었습니다.");
});

exportBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;
    const days = ["화요일", "수요일", "목요일"];
    const docs = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
    const lists = docs.map(d => (d.exists ? d.data().members : []).sort((a,b)=>a.localeCompare(b)));
    let csv = days.join(",") + "\n";
    const max = Math.max(...lists.map(l => l.length));
    for(let i=0; i<max; i++) { csv += lists.map(l => l[i] || "").join(",") + "\n"; }
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "마티니_명단.csv";
    a.click();
});

resetBtn.addEventListener('click', async () => {
    if (!confirm("모든 데이터를 초기화하시겠습니까?")) return;
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;
    const batch = db.batch();
    ["화요일", "수요일", "목요일"].forEach(d => batch.set(db.collection("votes").doc(d), {members:[]}));
    await batch.commit();
    alert("초기화 완료");
});