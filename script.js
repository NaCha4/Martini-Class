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

// 전역 상태 관리
let currentSelectedDay = "화요일";
let isRegistrationOpen = false; // 기본값 false (데이터 수신 전 신청 방지)
let openTime = null; 
let isDataLoaded = false; // Firebase 데이터 수신 확인 플래그
let logoClickCount = 0;
let userIp = "unknown";
const allDayMembers = { "화요일": [], "수요일": [], "목요일": [] };

// [초기화] IP 미리 가져오기
async function initIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        userIp = data.ip;
    } catch (e) { console.warn("IP 로드 실패"); }
}
initIp();

// [기능] 모든 요일 데이터 실시간 감시 (캐싱)
function subscribeToAllDays() {
    ["화요일", "수요일", "목요일"].forEach(day => {
        db.collection("votes").doc(day).onSnapshot((doc) => {
            allDayMembers[day] = doc.data()?.members || [];
            if (currentSelectedDay === day) renderList(allDayMembers[day]);
        }, (err) => console.error(`${day} 감시 오류:`, err));
    });
}

// [기능] 서버 설정 실시간 감시
function subscribeToSettings() {
    db.collection("settings").doc("status").onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            isRegistrationOpen = data.isOpen;
            openTime = data.openTime ? data.openTime.toDate() : null;
            isDataLoaded = true; // 최초 데이터 로드 완료
            updateUIByStatus();
        }
    }, (err) => console.error("설정 감시 오류:", err));
}

// [UI] 버튼 상태 실시간 업데이트 (1초 주기로 실행)
function updateUIByStatus() {
    if (!isDataLoaded) {
        submitBtn.textContent = "로딩 중...";
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.5";
        return;
    }

    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    
    // 클라이언트 사이드 예약 시간 체크 (서버 지연 극복 핵심 로직)
    if (!effectivelyOpen && openTime && now >= openTime) {
        effectivelyOpen = true;
    }

    if (!effectivelyOpen) {
        submitBtn.disabled = true;
        submitBtn.style.cursor = "not-allowed";
        submitBtn.style.opacity = "0.6";

        if (openTime && now < openTime) {
            const diff = openTime - now;
            const mins = Math.ceil(diff / 60000);
            submitBtn.textContent = `${mins}분 후 오픈`;
            submitBtn.classList.add('waiting');
            submitBtn.classList.remove('closed');
        } else {
            submitBtn.textContent = "신청 마감됨";
            submitBtn.classList.add('closed');
            submitBtn.classList.remove('waiting');
        }
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "신청";
        submitBtn.style.cursor = "pointer";
        submitBtn.style.opacity = "1";
        submitBtn.classList.remove('waiting', 'closed');
    }
}

// [UI] 명단 렌더링
function renderList(members) {
    attendeeListEl.innerHTML = '';
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    countEl.textContent = members.length;

    if (sortedMembers.length === 0) {
        attendeeListEl.innerHTML = '<p style="text-align:center;color:var(--text-color-sub);padding-top:20px;">아직 신청자가 없습니다.</p>';
        return;
    }

    sortedMembers.forEach((name) => {
        const item = document.createElement('div');
        item.classList.add('attendee-item');
        item.innerHTML = `
            <span class="at-name">${name}</span>
            <button class="delete-btn" onclick="deleteMember('${name}')">×</button>
        `;
        attendeeListEl.appendChild(item);
        setTimeout(() => item.classList.add('show'), 10);
    });
}

// 1초마다 UI 상태 체크 실행
setInterval(updateUIByStatus, 1000);
subscribeToAllDays();
subscribeToSettings();

// --- 이벤트 리스너 ---

// 로고 5번 클릭 시 관리자 모드
logoImg.addEventListener('click', () => {
    logoClickCount++;
    if (logoClickCount === 5) {
        exportBtn.style.display = 'block';
        resetBtn.style.display = 'block';
        adminControlGroup.style.display = 'flex';
        attendeeListEl.classList.add('admin-mode');
        alert("관리자 모드 활성화 🍸");
    }
    setTimeout(() => { logoClickCount = 0; }, 3000);
});

// 요일 선택 버튼
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        renderList(allDayMembers[currentSelectedDay]);
    });
});

// 신청 버튼 로직
submitBtn.addEventListener('click', async () => {
    // 클릭 시점에 다시 한 번 시간 체크 (보안)
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;
    
    if (!effectivelyOpen || !isDataLoaded) return alert("현재는 신청 기간이 아닙니다.");

    const nameEl = document.getElementById('userName');
    const name = nameEl.value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    submitBtn.disabled = true;
    submitBtn.textContent = "처리 중...";

    try {
        // 1. 중복 신청 확인 (캐싱된 데이터 활용)
        const isAlreadyRegistered = Object.values(allDayMembers).some(m => m.includes(name));
        if (isAlreadyRegistered) {
            alert("이미 다른 요일 혹은 현재 요일에 신청하셨습니다.");
            return;
        }

        // 2. 정원 확인 (24명)
        if (allDayMembers[currentSelectedDay].length >= 24) {
            alert("정원이 가득 찼습니다.");
            return;
        }

        const batch = db.batch();
        batch.set(db.collection("votes").doc(currentSelectedDay), { 
            members: firebase.firestore.FieldValue.arrayUnion(name) 
        }, { merge: true });

        batch.set(db.collection("logs").doc(), { 
            name, day: currentSelectedDay, ip: userIp, 
            userAgent: navigator.userAgent, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        });

        await batch.commit();
        nameEl.value = '';
        alert(`${currentSelectedDay} 신청 완료!`);
    } catch (e) {
        alert("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
        submitBtn.disabled = false;
        updateUIByStatus();
    }
});

// --- 관리자 기능 ---

async function deleteMember(name) {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");
    await db.collection("votes").doc(currentSelectedDay).update({ 
        members: firebase.firestore.FieldValue.arrayRemove(name) 
    });
}

startBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    const timeStr = prompt("시작 시간을 입력하세요.\n(예: 2026-03-24 18:00)\n빈칸 시 즉시 시작");
    if (timeStr === null) return;

    let targetDate = timeStr.trim() === "" ? new Date() : new Date(timeStr.replace(/-/g, "/"));
    if (isNaN(targetDate.getTime())) return alert("날짜 형식이 올바르지 않습니다.");

    const isNow = (targetDate <= new Date());
    await db.collection("settings").doc("status").set({ 
        isOpen: isNow, 
        openTime: firebase.firestore.Timestamp.fromDate(targetDate) 
    }, { merge: true });
    
    alert(isNow ? "즉시 시작되었습니다." : `${targetDate.toLocaleString()} 예약 완료!`);
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
    let csv = days.join(",") + "\n";
    const max = Math.max(...days.map(d => allDayMembers[d].length));
    for(let i=0; i<max; i++) {
        csv += days.map(d => {
            const list = [...allDayMembers[d]].sort((a,b)=>a.localeCompare(b));
            return list[i] || "";
        }).join(",") + "\n";
    }
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