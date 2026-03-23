// 1. Firebase 설정 (복사하신 값 유지)
const firebaseConfig = {
  apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
  authDomain: "martini-class-d4d69.firebaseapp.com",
  projectId: "martini-class-d4d69",
  storageBucket: "martini-class-d4d69.firebasestorage.app",
  messagingSenderId: "994424737344",
  appId: "1:994424737344:web:555117a1674e6ba0ae59a5"
};

// 2. Firebase 초기화 (이 순서가 중요합니다)
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

// 3-1. 명단 렌더링 함수 수정
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
        
        // 이름과 X 버튼 추가 (onclick 이벤트 연결)
        item.innerHTML = `
            <span class="at-name">${name}</span>
            <button class="delete-btn" onclick="deleteMember('${name}')">×</button>
        `;
        
        attendeeListEl.appendChild(item);
        void item.offsetWidth;
        item.classList.add('show');
    });
}

// 3-2. 관리자 삭제 함수 추가
async function deleteMember(name) {
    // 1. 관리자 비밀번호 확인
    const pwInput = prompt(`비밀번호를 입력하세요:`);
    
    if (pwInput === null) return; // 취소 시 종료
    
    if (pwInput !== ADMIN_PASSWORD) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    // 2. Firestore에서 해당 이름 삭제
    try {
        const docRef = db.collection("votes").doc(currentSelectedDay);
        await docRef.update({
            members: firebase.firestore.FieldValue.arrayRemove(name)
        });
        alert(`${name} 님이 삭제되었습니다.`);
    } catch (error) {
        console.error("삭제 오류:", error);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

// 초기 실행
subscribeToDay(currentSelectedDay);

// 4. 신청 버튼 클릭 이벤트 (전체 요일 중복 체크 버전)
document.getElementById('submitBtn').addEventListener('click', async () => {
    const input = document.getElementById('userName');
    const name = input.value.trim();

    if (!name) return alert('이름을 입력해주세요!');

    // 1. 로딩 표시 (선택사항: 더블 클릭 방지)
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = "확인 중...";

    try {
        const days = ["화요일", "수요일", "목요일"];
        
        // 2. 모든 요일의 데이터를 동시에 가져옴
        const snapshots = await Promise.all(
            days.map(day => db.collection("votes").doc(day).get())
        );

        // 3. 전체 요일 중 어디라도 이름이 있는지 검사
        let isAlreadyRegistered = false;
        let registeredDay = "";

        snapshots.forEach((doc, index) => {
            if (doc.exists) {
                const members = doc.data().members || [];
                if (members.includes(name)) {
                    isAlreadyRegistered = true;
                    registeredDay = days[index];
                }
            }
        });

        // 4. 결과에 따른 처리
        if (isAlreadyRegistered) {
            alert(`이미 ${registeredDay}에 신청 내역이 있습니다.\n한 사람당 주 1회만 신청 가능합니다.`);
            btn.disabled = false;
            btn.textContent = "신청";
            return;
        }

        // 5. 인원 제한 체크 (현재 선택된 요일 기준)
        const currentDoc = snapshots[days.indexOf(currentSelectedDay)];
        const currentMembers = currentDoc.exists ? currentDoc.data().members : [];
        
        if (currentMembers.length >= 24) {
            alert('이미 해당 요일은 24명 정원이 모두 찼습니다.');
            btn.disabled = false;
            btn.textContent = "신청";
            return;
        }

        // 6. 이상 없으면 Firestore 배열에 이름 추가
        await db.collection("votes").doc(currentSelectedDay).set({
            members: firebase.firestore.FieldValue.arrayUnion(name)
        }, { merge: true });

        input.value = '';
        alert(`${currentSelectedDay} 교육 신청이 완료되었습니다!`);

    } catch (error) {
        console.error("Error: ", error);
        alert("신청 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
        // 버튼 복구
        btn.disabled = false;
        btn.textContent = "신청";
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

// 7. 데이터 초기화 기능 (이중 확인 및 비밀번호 로직)
document.getElementById('resetBtn').addEventListener('click', async () => {

    // 2차 확인: 관리자 비밀번호
    const pwInput = prompt("비밀번호를 입력하세요:");
    if (pwInput === null) return;

    if (pwInput !== ADMIN_PASSWORD) {
        alert("비밀번호가 틀렸습니다.");
        return;
    }
    const lastCheck = confirm("정말로 초기화하겠습니까?");
    if (!lastCheck) return;

    try {
        const days = ["화요일", "수요일", "목요일"];
        
        // 모든 요일 문서를 빈 배열로 초기화
        const batch = db.batch(); // 여러 작업을 한 번에 처리하는 batch 사용
        days.forEach(day => {
            const docRef = db.collection("votes").doc(day);
            batch.set(docRef, { members: [] });
        });

        await batch.commit();
        alert("모든 요일의 명단이 초기화되었습니다.");
        
    } catch (error) {
        console.error("초기화 중 오류 발생:", error);
        alert("초기화 실패: 관리자 권한을 확인하세요.");
    }
});