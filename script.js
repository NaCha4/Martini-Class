// ========================================
// 1. Firebase 초기화
// ========================================
// Firebase 프로젝트 설정값 (Firebase Console > 프로젝트 설정에서 확인)
// ⚠️ API 키는 클라이언트에 노출되지만, Firestore 보안 규칙으로 접근을 제어합니다.
const firebaseConfig = {
    apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
    authDomain: "martini-class-d4d69.firebaseapp.com",
    projectId: "martini-class-d4d69",
    storageBucket: "martini-class-d4d69.firebasestorage.app",
    messagingSenderId: "994424737344",
    appId: "1:994424737344:web:555117a1674e6ba0ae59a5"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore(); // Firestore 데이터베이스 인스턴스
const auth = firebase.auth();      // Firebase 인증 인스턴스


// ========================================
// 2. 상수
// ========================================
// 값을 상수로 선언하면 수정이 쉽고, 오타로 인한 버그를 방지합니다.

const DAYS             = ["화요일", "수요일", "목요일"]; // 신청 가능한 요일 목록
const MAX_MEMBERS      = 24;                            // 요일당 최대 신청 인원
const ADMIN_EMAIL      = "admin@martini.com";           // 관리자 Firebase 계정 이메일
const LOGO_CLICK_COUNT = 5;                             // 관리자 모드 진입 클릭 횟수
const NAME_MAX_LENGTH  = 20;                            // 이름 최대 글자 수


// ========================================
// 3. DOM 요소 참조
// ========================================
// 한 곳에 모아두면 요소를 찾기 쉽고,
// 반복 querySelector 호출을 피해 성능이 좋아집니다.

const el = {
    dayButtons:        document.querySelectorAll('.day-btn'),     // 요일 버튼들 (화/수/목)
    selectedDayName:   document.getElementById('selectedDayName'),// 목록 헤더의 현재 요일 텍스트
    count:             document.getElementById('count'),          // 신청자 수
    attendeeList:      document.getElementById('attendeeList'),   // 신청자 목록 컨테이너
    userNameInput:     document.getElementById('userName'),       // 이름 입력 필드
    submitBtn:         document.getElementById('submitBtn'),      // 신청 버튼
    logoImg:           document.querySelector('.logo-image'),     // 로고 이미지 (관리자 진입용)
    exportBtn:         document.getElementById('exportBtn'),      // 명단 추출 버튼 (관리자)
    resetBtn:          document.getElementById('resetBtn'),       // 데이터 초기화 버튼 (관리자)
    adminControlGroup: document.getElementById('adminControlGroup'), // 시작/마감 버튼 그룹
    startBtn:          document.getElementById('startBtn'),       // 신청 시작/예약 버튼 (관리자)
    endBtn:            document.getElementById('endBtn'),         // 신청 마감 버튼 (관리자)
};


// ========================================
// 4. 앱 전역 상태
// ========================================
// 앱에서 시간에 따라 변하는 값들을 한 곳에서 관리합니다.
// 상태가 변하면 관련 UI 함수를 직접 호출해 화면을 업데이트합니다.

const state = {
    currentDay:     "화요일", // 현재 선택된 요일 (기본값: 화요일)
    isOpen:         false,    // Firestore의 isOpen 값 (관리자가 직접 열었는지)
    openTime:       null,     // 예약 오픈 시간 (Date 객체). null이면 예약 없음
    isLoaded:       false,    // Firestore 설정 데이터 최초 로드 완료 여부
    isSubmitting:   false,    // 신청 요청 처리 중 여부 (중복 클릭 방지용)
    logoClickCount: 0,        // 관리자 모드 진입용 로고 클릭 누적 횟수
    userIp:         "unknown",// 신청자 IP 주소 (로그 기록용, 실패 시 "unknown")

    // 각 요일별 신청자 이름 배열.
    // Firestore onSnapshot으로 실시간 동기화됩니다.
    members: {
        "화요일": [],
        "수요일": [],
        "목요일": [],
    },
};


// ========================================
// 5. 유틸리티 함수
// ========================================

// 외부 API(ipify)로 사용자의 공인 IP를 가져옵니다.
// 로그 기록에 활용되며, 실패해도 앱 동작에는 영향 없습니다.
async function initIp() {
    try {
        const res  = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        state.userIp = data.ip;
    } catch {
        // IP 로드 실패는 치명적이지 않으므로 경고만 출력합니다.
        console.warn("사용자 IP 로드 실패 → 로그에 'unknown'으로 기록됩니다.");
    }
}

// CSV 필드 하나를 안전하게 이스케이프합니다.
// 쉼표나 큰따옴표가 포함된 이름도 Excel에서 올바르게 열립니다.
// RFC 4180 CSV 표준: 특수문자가 있으면 큰따옴표로 감싸고, 내부 큰따옴표는 두 번 씁니다.
function escapeCsvField(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}


// ========================================
// 6. Firestore 실시간 구독
// ========================================

// 모든 요일의 신청자 목록을 실시간으로 구독합니다.
// onSnapshot은 데이터가 바뀔 때마다 자동으로 콜백을 호출합니다.
function subscribeToAllDays() {
    DAYS.forEach(day => {
        db.collection("votes").doc(day).onSnapshot(doc => {
            // 옵셔널 체이닝(?.)으로 null 안전하게 처리
            state.members[day] = doc.data()?.members || [];

            // 현재 보고 있는 요일이 업데이트됐을 때만 화면을 다시 그립니다.
            if (state.currentDay === day) {
                renderList(state.members[day]);
            }
        });
    });
}

// 신청 상태(열림/닫힘/예약 시간)를 실시간으로 구독합니다.
function subscribeToSettings() {
    db.collection("settings").doc("status").onSnapshot(doc => {
        if (!doc.exists) return; // 문서가 없으면 무시 (초기 상태)

        const data      = doc.data();
        state.isOpen    = data.isOpen;
        // Firestore Timestamp → JavaScript Date 변환
        state.openTime  = data.openTime ? data.openTime.toDate() : null;
        state.isLoaded  = true; // 최초 로드 완료 표시

        updateUIByStatus(); // 구독 데이터를 받자마자 즉시 UI 반영
    });
}


// ========================================
// 7. UI 렌더링
// ========================================

// 신청 버튼의 텍스트와 활성화/비활성화 상태를 현재 신청 상태에 맞게 갱신합니다.
// setInterval로 1초마다 호출되어 카운트다운 텍스트를 업데이트합니다.
function updateUIByStatus() {
    // Firestore에서 아직 설정 데이터를 받지 못한 초기 상태
    if (!state.isLoaded) {
        el.submitBtn.textContent = "로딩 중...";
        el.submitBtn.disabled    = true;
        return;
    }

    const now = new Date();

    // 예약 오픈 시간이 이미 지났다면 isOpen이 false여도 사실상 열린 상태입니다.
    const isEffectivelyOpen = state.isOpen || (state.openTime !== null && now >= state.openTime);

    if (isEffectivelyOpen) {
        el.submitBtn.disabled    = false;
        el.submitBtn.textContent = "신청";
    } else {
        el.submitBtn.disabled = true;

        if (state.openTime && now < state.openTime) {
            // 예약된 오픈 시간까지 남은 시간을 분/초로 표시합니다.
            const remainMs  = state.openTime - now;
            const remainMin = Math.floor(remainMs / 60000);
            const remainSec = Math.floor((remainMs % 60000) / 1000);

            el.submitBtn.textContent = remainMin > 0
                ? `${remainMin}분 ${remainSec}초 후 오픈`
                : `${remainSec}초 후 오픈`;
        } else {
            el.submitBtn.textContent = "신청 마감";
        }
    }
}

// 신청자 목록을 화면에 렌더링합니다.
// members: 현재 요일의 신청자 이름 배열
function renderList(members) {
    el.attendeeList.innerHTML = ''; // 기존 목록 초기화
    el.count.textContent      = members.length; // 인원 수 업데이트

    if (members.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'empty-msg';
        empty.textContent = '신청자가 없습니다.';
        el.attendeeList.appendChild(empty);
        return;
    }

    // 이름을 한국어 가나다순으로 정렬합니다.
    const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));

    sorted.forEach(name => {
        const item = document.createElement('div');
        item.className = 'attendee-item show';

        // textContent 사용 → innerHTML 대신 써야 XSS 공격을 방지할 수 있습니다.
        const nameSpan       = document.createElement('span');
        nameSpan.textContent = name;

        // ⚠️ 주의: onclick="deleteMember('${name}')" 방식은 이름에
        // 따옴표(')가 포함되면 JavaScript 문법 오류가 발생합니다.
        // dataset에 저장하고 이벤트 위임 방식으로 처리해야 안전합니다.
        const deleteBtn              = document.createElement('button');
        deleteBtn.className          = 'delete-btn';
        deleteBtn.textContent        = '×';
        deleteBtn.dataset.name       = name; // 이름을 data 속성에 안전하게 저장
        deleteBtn.setAttribute('aria-label', `${name} 삭제`);

        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        el.attendeeList.appendChild(item);
    });
}


// ========================================
// 8. 관리자 기능
// ========================================

// 관리자 전용 UI 요소들을 화면에 표시합니다.
// 인증 성공 후 한 번만 호출합니다.
function showAdminUI() {
    el.exportBtn.style.display        = 'block';
    el.resetBtn.style.display         = 'block';
    el.adminControlGroup.style.display = 'flex';
    el.attendeeList.classList.add('admin-mode'); // CSS에서 삭제 버튼 표시를 제어하는 클래스
}

// 특정 요일에서 신청자를 삭제합니다.
// 이벤트 위임으로 호출되며, day와 name을 명시적으로 받습니다.
async function deleteMember(day, name) {
    if (!confirm(`'${name}' 님을 ${day} 목록에서 삭제하시겠습니까?`)) return;

    try {
        // arrayRemove: members 배열에서 해당 이름만 제거 (나머지는 유지)
        await db.collection("votes").doc(day).update({
            members: firebase.firestore.FieldValue.arrayRemove(name),
        });
        // 삭제 성공 후 화면 갱신은 onSnapshot이 자동으로 처리합니다.
    } catch (e) {
        console.error("삭제 실패:", e);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

// 전체 명단을 CSV 파일로 내보냅니다.
// 열 구조: 화요일 | 수요일 | 목요일 (가나다순 정렬)
function exportToCSV() {
    // CSV 첫 번째 행: 헤더 (요일명)
    const header = DAYS.map(escapeCsvField).join(',');

    // 각 요일 신청자를 가나다순 정렬
    const sorted = DAYS.map(day =>
        [...state.members[day]].sort((a, b) => a.localeCompare(b, 'ko'))
    );

    // 가장 긴 신청자 목록 길이를 기준으로 행 수를 결정합니다.
    const maxRows = Math.max(...sorted.map(m => m.length), 0);

    const rows = [];
    for (let i = 0; i < maxRows; i++) {
        // i번째 행: 각 요일의 i번째 신청자. 없으면 빈 문자열.
        rows.push(sorted.map(members => escapeCsvField(members[i] || '')).join(','));
    }

    // BOM(﻿) 추가 → Excel에서 한글이 깨지지 않게 합니다.
    const csvContent = '﻿' + [header, ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    // 파일명에 오늘 날짜를 포함시킵니다.
    link.download = `마티니_명단_${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '')}.csv`;
    link.click();

    // 메모리 누수 방지: Blob URL 생성 후 더 이상 필요 없으면 해제합니다.
    URL.revokeObjectURL(url);
}


// ========================================
// 9. 이벤트 리스너
// ========================================

// ─── 로고 클릭 (관리자 모드 진입) ───────────────────────
// 로고를 LOGO_CLICK_COUNT번 클릭하면 관리자 비밀번호 입력창이 뜹니다.
el.logoImg.addEventListener('click', async () => {
    state.logoClickCount++;
    if (state.logoClickCount < LOGO_CLICK_COUNT) return;
    state.logoClickCount = 0; // 횟수 초기화 (다음 시도를 위해)

    const password = prompt("관리자 비밀번호를 입력하세요:");
    if (!password) return; // 취소 버튼 또는 빈 입력이면 무시

    try {
        // NONE: 탭/창을 닫으면 로그인 세션이 사라집니다 (보안 강화).
        await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        await auth.signInWithEmailAndPassword(ADMIN_EMAIL, password);

        showAdminUI();
        alert("관리자 모드 활성화 🍸");
    } catch (error) {
        // Firebase 오류 코드에 따라 다른 메시지를 표시합니다.
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            alert("비밀번호가 틀렸습니다.");
        } else {
            console.error("관리자 로그인 오류:", error);
            alert("로그인 중 오류가 발생했습니다.");
        }
    }
});

// ─── 요일 버튼 클릭 ─────────────────────────────────────
// 선택한 요일로 currentDay를 바꾸고 해당 목록을 표시합니다.
el.dayButtons.forEach(btn => {
    btn.addEventListener('click', e => {
        // 기존 활성 버튼에서 active 클래스 제거
        el.dayButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // 상태 및 헤더 텍스트 업데이트
        state.currentDay              = e.currentTarget.dataset.day;
        el.selectedDayName.textContent = state.currentDay;

        // 이미 메모리에 캐시된 데이터로 즉시 렌더링 (추가 네트워크 요청 없음)
        renderList(state.members[state.currentDay]);
    });
});

// ─── 신청 버튼 클릭 ─────────────────────────────────────
// 이름을 검증하고 Firestore에 신청을 등록합니다.
el.submitBtn.addEventListener('click', async () => {
    // 이미 처리 중이면 중복 클릭을 무시합니다.
    if (state.isSubmitting) return;

    // 신청 가능 상태 재확인 (버튼 활성화 상태와 실제 상태가 다를 수 있음)
    const isEffectivelyOpen = state.isOpen || (state.openTime !== null && new Date() >= state.openTime);
    if (!isEffectivelyOpen || !state.isLoaded) return;

    // ── 입력 검증 (검증 실패는 버튼 비활성화 없이 즉시 반환) ──
    const name = el.userNameInput.value.trim();
    if (!name) {
        alert("이름을 입력해 주세요.");
        return;
    }
    if (name.length > NAME_MAX_LENGTH) {
        alert(`이름은 ${NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
        return;
    }

    // 모든 요일에서 같은 이름이 있는지 확인합니다.
    // find로 어느 요일에 신청했는지도 알 수 있습니다.
    const duplicateDay = DAYS.find(day => state.members[day].includes(name));
    if (duplicateDay) {
        alert(`'${name}' 님은 이미 ${duplicateDay}에 신청하셨습니다.`);
        return;
    }

    if (state.members[state.currentDay].length >= MAX_MEMBERS) {
        alert(`${state.currentDay}은(는) 정원(${MAX_MEMBERS}명)이 초과되었습니다.`);
        return;
    }

    // ── 실제 신청 처리 ──
    state.isSubmitting       = true;
    el.submitBtn.disabled    = true;
    el.submitBtn.textContent = "신청 중...";

    try {
        // 배치(Batch) 쓰기: 신청자 추가 + 로그 기록을 원자적으로 처리합니다.
        // 두 작업이 동시에 성공하거나 동시에 실패하여 데이터 일관성을 보장합니다.
        const batch = db.batch();

        // 1) 해당 요일 문서의 members 배열에 이름 추가
        //    merge: true → 기존 데이터를 덮어쓰지 않고 병합합니다.
        batch.set(
            db.collection("votes").doc(state.currentDay),
            { members: firebase.firestore.FieldValue.arrayUnion(name) },
            { merge: true }
        );

        // 2) 로그 기록 (관리자가 신청 내역 및 IP 확인 가능)
        //    doc()에 인자 없이 쓰면 Firestore가 고유 ID를 자동 생성합니다.
        batch.set(
            db.collection("logs").doc(),
            {
                name,
                day:       state.currentDay,
                ip:        state.userIp,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(), // 서버 시간 사용
            }
        );

        await batch.commit();

        el.userNameInput.value = ''; // 입력 필드 초기화
        alert("신청이 완료되었습니다! 🍸");

    } catch (e) {
        console.error("신청 오류:", e);
        alert("신청 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
        // 성공/실패와 관계없이 항상 실행됩니다.
        // 버튼 상태를 현재 신청 가능 여부에 맞게 복구합니다.
        state.isSubmitting = false;
        updateUIByStatus();
    }
});

// ─── 신청자 목록 클릭 (이벤트 위임) ────────────────────
// 목록 컨테이너 하나에 이벤트를 등록해 모든 삭제 버튼 클릭을 처리합니다.
// 이 방식은 아이템마다 이벤트를 붙이는 것보다 메모리 효율적이고,
// 이름에 특수문자가 있어도 안전하게 처리됩니다.
el.attendeeList.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (!deleteBtn) return; // 삭제 버튼이 아닌 곳을 클릭하면 무시

    const name = deleteBtn.dataset.name; // renderList에서 저장한 data-name 값
    await deleteMember(state.currentDay, name);
});

// ─── 명단 추출 버튼 ─────────────────────────────────────
el.exportBtn.addEventListener('click', exportToCSV);

// ─── 데이터 초기화 버튼 ─────────────────────────────────
// 모든 요일의 신청자 명단을 삭제합니다. 되돌릴 수 없습니다.
el.resetBtn.addEventListener('click', async () => {
    const confirmed = confirm(
        "⚠️ 경고: 모든 요일의 신청자 명단이 영구 삭제됩니다.\n" +
        "이 작업은 되돌릴 수 없습니다.\n\n" +
        "정말로 초기화하시겠습니까?"
    );
    if (!confirmed) return;

    try {
        const batch = db.batch();
        // 각 요일 문서를 빈 배열로 덮어씁니다.
        DAYS.forEach(day => batch.set(db.collection("votes").doc(day), { members: [] }));
        await batch.commit();
        alert("초기화가 완료되었습니다.");
    } catch (e) {
        console.error("초기화 오류:", e);
        alert("초기화 중 오류가 발생했습니다.");
    }
});

// ─── 시작/예약 버튼 ─────────────────────────────────────
// 신청을 즉시 시작하거나, 특정 시간에 자동으로 열리도록 예약합니다.
el.startBtn.addEventListener('click', async () => {
    const input = prompt(
        "신청 시작 시간을 입력하세요.\n" +
        "예시: 2026-03-24 18:00\n\n" +
        "(빈칸으로 두면 즉시 시작)"
    );
    if (input === null) return; // 취소 버튼이면 무시

    let targetDate;
    if (input.trim() === '') {
        targetDate = new Date(); // 빈칸 → 즉시 시작
    } else {
        // ⚠️ Safari는 "YYYY-MM-DD HH:MM" 형식을 파싱하지 못합니다.
        //    하이픈(-)을 슬래시(/)로 바꾸면 모든 브라우저에서 동작합니다.
        targetDate = new Date(input.trim().replace(/-/g, '/'));

        if (isNaN(targetDate.getTime())) {
            alert("올바른 날짜 형식이 아닙니다.\n예시: 2026-03-24 18:00");
            return;
        }
    }

    try {
        const isImmediate = targetDate <= new Date();

        await db.collection("settings").doc("status").set({
            // 즉시 시작이면 isOpen을 true로 설정.
            // 예약이면 false로 두고, openTime을 지나면 updateUIByStatus에서 자동 오픈 처리.
            isOpen:   isImmediate,
            openTime: firebase.firestore.Timestamp.fromDate(targetDate),
        }, { merge: true });

        alert(isImmediate
            ? "신청이 즉시 시작되었습니다."
            : `${targetDate.toLocaleString('ko-KR')}에 신청이 열리도록 예약되었습니다.`
        );
    } catch (e) {
        console.error("시작 설정 오류:", e);
        alert("설정 중 오류가 발생했습니다.");
    }
});

// ─── 신청 마감 버튼 ─────────────────────────────────────
// 신청을 즉시 마감하고, 예약도 취소합니다.
el.endBtn.addEventListener('click', async () => {
    if (!confirm("신청을 마감하시겠습니까?")) return;

    try {
        await db.collection("settings").doc("status").set({
            isOpen:   false,
            openTime: null, // 예약도 함께 취소
        }, { merge: true });
        alert("신청이 마감되었습니다.");
    } catch (e) {
        console.error("마감 오류:", e);
        alert("마감 처리 중 오류가 발생했습니다.");
    }
});


// ========================================
// 10. 앱 초기화 (진입점)
// ========================================
// 페이지 로드 직후 실행됩니다.

initIp();              // 사용자 IP 로드 (비동기, 나머지 초기화와 병렬 실행됨)
subscribeToAllDays();  // 신청자 목록 실시간 구독 시작
subscribeToSettings(); // 신청 상태 실시간 구독 시작

// 1초마다 카운트다운 텍스트를 갱신합니다.
// updateUIByStatus 자체는 매우 가벼운 함수라 1초 간격이 적절합니다.
setInterval(updateUIByStatus, 1000);
