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
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');

let currentSelectedDay = "화요일";
let isRegistrationOpen = true; 
let openTime = null; 
let logoClickCount = 0;
let isAdminMode = false;

// --- [기능] 실시간 IP 주소 가져오기 ---
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

// --- [기능] 실시간 데이터 감시 ---
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

function updateUIByStatus() {
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;

    // 수정: openTime이 명확히 존재하고, 현재 시간이 그 시간을 지났을 때만 자동 오픈
    if (!effectivelyOpen && openTime && now >= openTime) {
        effectivelyOpen = true;
    }

    if (!effectivelyOpen) {
        let message = "신청 마감됨";
        // 아직 오픈 전인 예약 상태일 때만 대기 문구 표시
        if (openTime && now < openTime) {
            const diff = openTime - now;
            const mins = Math.ceil(diff / 60000);
            message = `신청 대기 중 (${mins}분 후 오픈)`;
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

// 1초마다 자동 시간 체크
setInterval(updateUIByStatus, 1000);

// 초기 실행
subscribeToDay(currentSelectedDay);
subscribeToSettings();

// --- [이벤트] 관리자 모드 활성화 (로고 5번 클릭) ---
logoImg.addEventListener('click', () => {
    logoClickCount++;
    if (logoClickCount === 5) {
        isAdminMode = true;
        exportBtn.style.display = 'block';
        resetBtn.style.display = 'block';
        adminControlGroup.style.display = 'flex';
        attendeeListEl.classList.add('admin-mode');
        alert("관리자 모드가 활성화되었습니다. 🍸");
    }
    setTimeout(() => { logoClickCount = 0; }, 3000);
});

// --- [이벤트] 요일 버튼 클릭 ---
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        subscribeToDay(currentSelectedDay);
    });
});

// --- [이벤트] 신청 버튼 클릭 (핵심 로직) ---
submitBtn.addEventListener('click', async () => {
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;

    if (!effectivelyOpen) return alert("현재는 신청 기간이 아닙니다.");

    const input = document.getElementById('userName');
    const name = input.value.trim();
    if (!name) return alert('이름을 입력해주세요!');

    submitBtn.disabled = true;
    submitBtn.textContent = "처리 중...";

    try {
        const days = ["화요일", "수요일", "목요일"];
        const snapshots = await Promise.all(days.map(d => db.collection("votes").doc(d).get()));
        
        // 중복 체크
        let registeredDay = "";
        snapshots.forEach((doc, i) => {
            if (doc.exists && (doc.data().members || []).includes(name)) registeredDay = days[i];
        });

        if (registeredDay) {
            alert(`이미 ${registeredDay}에 신청 내역이 있습니다.`);
            return;
        }

        // 정원 체크
        const curDoc = snapshots[days.indexOf(currentSelectedDay)];
        if (curDoc.exists && (curDoc.data().members || []).length >= 24) {
            alert("정원이 모두 찼습니다.");
            return;
        }

        const userIp = await getUserIp();
        const batch = db.batch();
        batch.set(db.collection("votes").doc(currentSelectedDay), {
            members: firebase.firestore.FieldValue.arrayUnion(name)
        }, { merge: true });

        batch.set(db.collection("logs").doc(), {
            name: name, day: currentSelectedDay, ip: userIp,
            userAgent: navigator.userAgent, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: "REGISTRATION"
        });

        await batch.commit();
        input.value = '';
        alert(`${currentSelectedDay} 신청 완료!`);
    } catch (e) { alert("오류 발생"); }
    finally { submitBtn.disabled = false; updateUIByStatus(); }
});

// --- [관리자 전용 함수들] ---

// 1. 개별 삭제
async function deleteMember(name) {
    const pw = prompt(`'${name}' 님을 삭제하시겠습니까?\n비밀번호를 입력하세요:`);
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    await db.collection("votes").doc(currentSelectedDay).update({
        members: firebase.firestore.FieldValue.arrayRemove(name)
    });
}

// 2. 신청 시작 및 예약 (통합)
startBtn.addEventListener('click', async () => {
    const pw = prompt("[관리자] 신청을 시작하거나 예약하시겠습니까?\n비밀번호를 입력하세요:");
    if (pw === null || pw !== ADMIN_PASSWORD) return alert("비밀번호가 일치하지 않습니다.");

    const timeInput = prompt("시작 시간을 입력하세요 (예: 2026-03-05 18:00)\n빈 칸으로 두면 즉시 시작됩니다.");
    if (timeInput === null) return;

    try {
        let targetDate = new Date();
        let isNow = true;

        if (timeInput.trim() !== "") {
            targetDate = new Date(timeInput);
            if (isNaN(targetDate)) return alert("날짜 형식이 올바르지 않습니다.");
            isNow = (targetDate <= new Date());
        }

        await db.collection("settings").doc("status").set({
            isOpen: isNow,
            openTime: firebase.firestore.Timestamp.fromDate(targetDate)
        }, { merge: true });

        const adminIp = await getUserIp();
        await db.collection("logs").add({
            action: isNow ? "REGISTRATION_START" : "REGISTRATION_SCHEDULED",
            ip: adminIp, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            details: isNow ? "즉시 시작" : `${targetDate.toLocaleString()} 예약`
        });

        alert(isNow ? "신청이 즉시 시작되었습니다." : `${targetDate.toLocaleString()} 예약 완료`);
    } catch (e) { alert("상태 변경 오류"); }
});

// 3. 신청 마감
// [관리자] 신청 마감 제어 수정
endBtn.addEventListener('click', async () => {
    const pw = prompt("신청을 마감하시겠습니까?\n비밀번호를 입력하세요:");
    if (pw !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    try {
        await db.collection("settings").doc("status").set({ 
            isOpen: false, 
            openTime: null // 마감 시 예약 시간도 초기화하여 자동 오픈 방지
        }, { merge: true });

        const adminIp = await getUserIp();
        await db.collection("logs").add({
            action: "REGISTRATION_END", 
            ip: adminIp,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("신청이 마감되었습니다. 🔒");
    } catch (e) { 
        console.error(e);
        alert("오류 발생"); 
    }
});

// 4. 명단 추출
exportBtn.addEventListener('click', async () => {
    const pw = prompt("비밀번호:");
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

// 5. 초기화
resetBtn.addEventListener('click', async () => {
    if (!confirm("모든 데이터를 초기화하시겠습니까?")) return;
    const pw = prompt("비밀번호:");
    if (pw !== ADMIN_PASSWORD) return;
    try {
        const batch = db.batch();
        ["화요일", "수요일", "목요일"].forEach(d => batch.set(db.collection("votes").doc(d), {members:[]}));
        const adminIp = await getUserIp();
        batch.set(db.collection("logs").doc(), { action: "DATABASE_RESET", ip: adminIp, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        alert("초기화 완료");
    } catch (e) { alert("오류 발생"); }
});