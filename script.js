


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
  authDomain: "martini-class-d4d69.firebaseapp.com",
  projectId: "martini-class-d4d69",
  storageBucket: "martini-class-d4d69.firebasestorage.app",
  messagingSenderId: "994424737344",
  appId: "1:994424737344:web:555117a1674e6ba0ae59a5"
};

// 2. Firebase 초기화 및 DB 객체 생성
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ADMIN_PASSWORD = "0305";

// DOM 요소들
const dayButtons = document.querySelectorAll('.day-btn');
const selectedDayNameEl = document.getElementById('selectedDayName');
const countEl = document.getElementById('count');
const attendeeListEl = document.getElementById('attendeeList');
let currentSelectedDay = "화요일";

// 3. 실시간 리스트 업데이트 함수
function subscribeToDay(day) {
    // 요일이 바뀔 때마다 실시간 감시(onSnapshot)를 새로 시작합니다.
    db.collection("votes").doc(day).onSnapshot((doc) => {
        const data = doc.data() || { members: [] };
        const members = data.members;
        
        // 화면 업데이트 로직 (가나다 정렬 포함)
        renderList(members);
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
        item.innerHTML = `<span class="at-name">${name}</span>`;
        attendeeListEl.appendChild(item);
        void item.offsetWidth;
        item.classList.add('show');
    });
}

// 초기 실행
subscribeToDay(currentSelectedDay);

// 4. 신청 버튼 클릭 이벤트
document.getElementById('submitBtn').addEventListener('click', async () => {
    const input = document.getElementById('userName');
    const name = input.value.trim();

    if (!name) return alert('이름을 입력해주세요!');

    const docRef = db.collection("votes").doc(currentSelectedDay);
    
    try {
        const doc = await docRef.get();
        let members = [];
        if (doc.exists) members = doc.data().members;

        // 중복 체크 및 인원 제한
        if (members.includes(name)) return alert('이미 신청하셨습니다.');
        if (members.length >= 24) return alert('이미 마감되었습니다.');

        // Firestore 배열에 이름 추가 (원자적 업데이트)
        await docRef.set({
            members: firebase.firestore.FieldValue.arrayUnion(name)
        }, { merge: true });

        input.value = '';
        alert(`${currentSelectedDay} 교육 신청 완료!`);
    } catch (error) {
        console.error("Error: ", error);
        alert("신청 중 오류가 발생했습니다.");
    }
});

// 요일 버튼 클릭 시 구독 변경
dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dayButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedDay = e.target.getAttribute('data-day');
        selectedDayNameEl.textContent = currentSelectedDay;
        
        // 해당 요일 데이터 실시간 감시 시작
        subscribeToDay(currentSelectedDay);
    });
});

document.getElementById('exportBtn').addEventListener('click', async () => {
    const pwInput = prompt("관리자 비밀번호를 입력하세요:");
    if (pwInput !== ADMIN_PASSWORD) return alert("비밀번호 불일치");

    const days = ["화요일", "수요일", "목요일"];
    const allData = await Promise.all(days.map(day => db.collection("votes").doc(day).get()));
    
    const sortedLists = allData.map(doc => {
        const members = (doc.exists ? doc.data().members : []) || [];
        return members.sort((a, b) => a.localeCompare(b));
    });

    const maxRows = Math.max(...sortedLists.map(list => list.length));
    let csvContent = days.join(",") + "\n";

    for (let i = 0; i < maxRows; i++) {
        let row = sortedLists.map(list => list[i] || "");
        csvContent += row.join(",") + "\n";
    }

    // 파일 다운로드 로직 (이전과 동일)
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `마티니_명단_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
});