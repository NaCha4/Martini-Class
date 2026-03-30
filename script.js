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
const ADMIN_EMAIL = "admin@martini.com";

const auth = firebase.auth();

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
let isRegistrationOpen = false; 
let openTime = null; 
let isDataLoaded = false; 
let logoClickCount = 0;
let userIp = "unknown";
const allDayMembers = { "화요일": [], "수요일": [], "목요일": [] };

async function initIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        userIp = data.ip;
    } catch (e) { console.warn("IP 로드 실패"); }
}
initIp();

function subscribeToAllDays() {
    ["화요일", "수요일", "목요일"].forEach(day => {
        db.collection("votes").doc(day).onSnapshot((doc) => {
            allDayMembers[day] = doc.data()?.members || [];
            if (currentSelectedDay === day) renderList(allDayMembers[day]);
        });
    });
}

function subscribeToSettings() {
    db.collection("settings").doc("status").onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            isRegistrationOpen = data.isOpen;
            openTime = data.openTime ? data.openTime.toDate() : null;
            isDataLoaded = true;
            updateUIByStatus();
        }
    });
}

function updateUIByStatus() {
    if (!isDataLoaded) {
        submitBtn.textContent = "로딩 중...";
        submitBtn.disabled = true;
        return;
    }
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;

    if (!effectivelyOpen) {
        submitBtn.disabled = true;
        if (openTime && now < openTime) {
            submitBtn.textContent = `${Math.ceil((openTime - now) / 60000)}분 후 오픈`;
        } else {
            submitBtn.textContent = "신청 마감됨";
        }
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "신청";
    }
}

function renderList(members) {
    attendeeListEl.innerHTML = '';
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    countEl.textContent = members.length;
    if (sortedMembers.length === 0) {
        attendeeListEl.innerHTML = '<p style="text-align:center;color:#999;padding-top:20px;">신청자가 없습니다.</p>';
        return;
    }
    sortedMembers.forEach((name) => {
        const item = document.createElement('div');
        item.className = 'attendee-item show';
        item.innerHTML = `<span>${name}</span><button class="delete-btn" onclick="deleteMember('${name}')">×</button>`;
        attendeeListEl.appendChild(item);
    });
}

setInterval(updateUIByStatus, 1000);
subscribeToAllDays();
subscribeToSettings();

logoImg.addEventListener('click', async () => {
    logoClickCount++;
    if (logoClickCount === 5) {
        logoClickCount = 0; // 초기화
        
        const pw = prompt("관리자 비밀번호를 입력하세요:");
        if (!pw) return;

        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
            
            await auth.signInWithEmailAndPassword(ADMIN_EMAIL, pw);

            exportBtn.style.display = 'block';
            resetBtn.style.display = 'block';
            adminControlGroup.style.display = 'flex'; 
            attendeeListEl.classList.add('admin-mode');
            alert("서버 인증 완료: 관리자 모드 활성화 🍸");
            
        } catch (error) {
            console.error(error);
            alert("비밀번호가 틀렸거나 권한이 없습니다.");
        }
    }
});
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        renderList(allDayMembers[currentSelectedDay]);
    });
});

submitBtn.addEventListener('click', async () => {
    const now = new Date();
    let effectivelyOpen = isRegistrationOpen;
    if (!effectivelyOpen && openTime && now >= openTime) effectivelyOpen = true;
    if (!effectivelyOpen || !isDataLoaded) return;

    const name = document.getElementById('userName').value.trim();
    if (!name) return alert('이름을 입력하세요!');

    submitBtn.disabled = true;
    try {
        if (Object.values(allDayMembers).some(m => m.includes(name))) return alert("이미 신청 내역이 있습니다.");
        if (allDayMembers[currentSelectedDay].length >= 24) return alert("정원 초과");

        const batch = db.batch();
        batch.set(db.collection("votes").doc(currentSelectedDay), { members: firebase.firestore.FieldValue.arrayUnion(name) }, { merge: true });
        batch.set(db.collection("logs").doc(), { name, day: currentSelectedDay, ip: userIp, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        document.getElementById('userName').value = '';
        alert("신청 완료!");
    } catch (e) { alert("오류 발생"); }
    finally { submitBtn.disabled = false; }
});

async function deleteMember(name) {
    if (!confirm(`'${name}' 님을 삭제하시겠습니까?`)) return;
    await db.collection("votes").doc(currentSelectedDay).update({ members: firebase.firestore.FieldValue.arrayRemove(name) });
}

startBtn.addEventListener('click', async () => {
    const timeStr = prompt("시작 시간(예: 2026-03-24 18:00) / 빈칸은 즉시 시작");
    if (timeStr === null) return;
    let targetDate = timeStr.trim() === "" ? new Date() : new Date(timeStr.replace(/-/g, "/"));
    await db.collection("settings").doc("status").set({ isOpen: (targetDate <= new Date()), openTime: firebase.firestore.Timestamp.fromDate(targetDate) }, { merge: true });
    alert("설정이 완료되었습니다.");
});

endBtn.addEventListener('click', async () => {
    await db.collection("settings").doc("status").set({ isOpen: false, openTime: null }, { merge: true });
    alert("마감되었습니다.");
});

exportBtn.addEventListener('click', () => {
    const days = ["화요일", "수요일", "목요일"];
    let csv = days.join(",") + "\n";
    const max = Math.max(...days.map(d => allDayMembers[d].length));
    for(let i=0; i<max; i++) {
        csv += days.map(d => [...allDayMembers[d]].sort((a,b)=>a.localeCompare(b))[i] || "").join(",") + "\n";
    }
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "마티니_명단.csv";
    a.click();
});

resetBtn.addEventListener('click', async () => {
    if (!confirm("정말로 모든 요일의 명단을 초기화하시겠습니까? (복구 불가)")) return;
    const batch = db.batch();
    ["화요일", "수요일", "목요일"].forEach(d => batch.set(db.collection("votes").doc(d), {members:[]}));
    await batch.commit();
    alert("초기화가 완료되었습니다.");
});