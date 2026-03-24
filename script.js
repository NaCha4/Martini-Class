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
let isRegistrationOpen = true; 
let openTime = null; 
let logoClickCount = 0;
let userIp = "unknown";
const allDayMembers = { "화요일": [], "수요일": [], "목요일": [] }; // 데이터 캐싱용

// [초기화] 페이지 로드 시 IP 미리 가져오기 (성능 최적화)
async function initIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        userIp = data.ip;
    } catch (e) { console.error("IP 로드 실패", e); }
}
initIp();

// [기능] 모든 요일 데이터 실시간 감시 (중복 체크 최적화)
function subscribeToAllDays() {
    ["화요일", "수요일", "목요일"].forEach(day => {
        db.collection("votes").doc(day).onSnapshot((doc) => {
            const data = doc.data() || { members: [] };
            allDayMembers[day] = data.members; // 로컬 캐시에 저장
            
            // 현재 보고 있는 요일이면 화면 갱신
            if (currentSelectedDay === day) {
                renderList(data.members);
            }
        });
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
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;

    if (!effectivelyOpen) {
        let message = "신청 마감됨";
        submitBtn.classList.remove('waiting');
        submitBtn.classList.add('closed');

        if (openTime && now < openTime) {
            const diff = openTime - now;
            const mins = Math.ceil(diff / 60000);
            message = `${mins}분 후 오픈`;
            submitBtn.classList.remove('closed');
            submitBtn.classList.add('waiting');
        }
        submitBtn.textContent = message;
        submitBtn.style.opacity = "0.5";
        submitBtn.style.cursor = "not-allowed";
    } else {
        submitBtn.textContent = "신청";
        submitBtn.classList.remove('waiting', 'closed');
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
        // 애니메이션 효과를 위해 지연 추가
        setTimeout(() => item.classList.add('show'), 10);
    });
}

// 초기 실행
setInterval(updateUIByStatus, 1000);
subscribeToAllDays();
subscribeToSettings();

// --- 이벤트 리스너 ---

// 관리자 모드 활성화 (로고 5번 클릭)
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
        // 이미 subscribeToAllDays에서 감시 중이므로 캐시된 데이터로 즉시 렌더링
        renderList(allDayMembers[currentSelectedDay]);
    });
});

// 신청 버튼 클릭 로직 (핵심 최적화)
submitBtn.addEventListener('click', async () => {
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;
    if (!effectivelyOpen) return alert("현재는 신청 기간이 아닙니다.");

    const nameEl = document.getElementById('userName');
    const name = nameEl.value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    submitBtn.disabled = true;

    try {
        // 1. 중복 신청 확인 (서버 요청 없이 캐시 데이터 활용 - 초고속)
        let registeredDay = "";
        for (const [day, members] of Object.entries(allDayMembers)) {
            if (members.includes(name)) {
                registeredDay = day;
                break;
            }
        }

        if (registeredDay) {
            alert(`이미 ${registeredDay}에 신청하셨습니다.`);
            submitBtn.disabled = false;
            return;
        }

        // 2. 정원 확인 (24명)
        if (allDayMembers[currentSelectedDay].length >= 24) {
            alert("정원이 가득 찼습니다.");
            submitBtn.disabled = false;
            return;
        }

        // 3. 데이터베이스 기록 (Batch 처리)
        const batch = db.batch();
        const voteRef = db.collection("votes").doc(currentSelectedDay);
        const logRef = db.collection("logs").doc();

        batch.set(voteRef, { 
            members: firebase.firestore.FieldValue.arrayUnion(name) 
        }, { merge: true });

        batch.set(logRef, { 
            name, 
            day: currentSelectedDay, 
            ip: userIp, 
            userAgent: navigator.userAgent, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        });

        await batch.commit();
        nameEl.value = '';
        alert(`${currentSelectedDay} 신청 완료!`);
    } catch (e) {
        console.error(e);
        alert("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
        submitBtn.disabled = false;
        updateUIByStatus();
    }
});

// --- 관리자 전용 함수 ---

async function deleteMember(name) {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");
    try {
        await db.collection("votes").doc(currentSelectedDay).update({ 
            members: firebase.firestore.FieldValue.arrayRemove(name) 
        });
    } catch (e) { alert("삭제 실패"); }
}

startBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    const timeStr = prompt("시작 시간을 입력하세요.\n(예: 2026-03-24 18:00)\n빈칸 입력 시 즉시 시작");
    if (timeStr === null) return;

    let targetDate = timeStr.trim() === "" ? new Date() : new Date(timeStr.replace(/-/g, "/"));
    if (isNaN(targetDate.getTime())) return alert("날짜 형식이 올바르지 않습니다.");

    const isNow = (targetDate <= new Date());
    if (!confirm(isNow ? "즉시 시작하시겠습니까?" : `${targetDate.toLocaleString()} 예약하시겠습니까?`)) return;

    await db.collection("settings").doc("status").set({ 
        isOpen: isNow, 
        openTime: firebase.firestore.Timestamp.fromDate(targetDate) 
    }, { merge: true });
    alert("설정 완료 🍸");
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
            const list = [...allDayMembers[d]].sort((a,b) => a.localeCompare(b));
            return list[i] || "";
        }).join(",") + "\n";
    }

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "마티니_신청명단.csv";
    a.click();
});

resetBtn.addEventListener('click', async () => {
    if (!confirm("정말로 모든 데이터를 초기화하시겠습니까?")) return;
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;

    const batch = db.batch();
    ["화요일", "수요일", "목요일"].forEach(d => {
        batch.set(db.collection("votes").doc(d), { members: [] });
    });
    await batch.commit();
    alert("초기화 완료");
});