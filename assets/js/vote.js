const WEEKDAYS = [
  { key: "monday", label: "월요일" },
  { key: "tuesday", label: "화요일" },
  { key: "wednesday", label: "수요일" },
  { key: "thursday", label: "목요일" },
  { key: "friday", label: "금요일" },
];

const DEFAULT_CAPACITY = 12;
const dayListElement = document.querySelector("[data-public-day-list]");
const voteBoardElement = document.querySelector("[data-vote-board]");
const voteForm = document.querySelector("[data-class-vote-form]");
const voteMessage = document.querySelector("[data-vote-message]");
const voteSubmitButton = document.querySelector("[data-vote-submit]");
const { bindRouteNavigation, normalizeDate } = window.MartiniUtils;

let voteConfig = null;
let selectedDay = "";
let currentVoteState = {};
let applyScheduleTimer = null;

function bindNavigation() {
  bindRouteNavigation();
}

function setVoteMessage(message) {
  voteMessage.textContent = message;
}

function canOverrideApplyRules() {
  return window.MartiniFirebase?.readAdminSession?.() === true;
}

function getEnabledDays() {
  if (!voteConfig?.days) return [];

  return WEEKDAYS.filter((weekday) => voteConfig.days[weekday.key]?.enabled === true);
}

function getCapacity() {
  const capacity = Number(voteConfig?.capacity);

  return Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_CAPACITY;
}

function isApplyOpen() {
  if (canOverrideApplyRules()) return true;

  const now = new Date();
  const reservedOpenAt = normalizeDate(voteConfig?.reservedOpenAt);
  const reservedCloseAt = normalizeDate(voteConfig?.reservedCloseAt);

  if (reservedCloseAt && reservedCloseAt <= now) return false;

  return voteConfig?.isOpen === true || Boolean(reservedOpenAt && reservedOpenAt <= now);
}

function updateApplyView() {
  renderDayPicker();
  renderVoteBoard();
  setVoteMessage(
    isApplyOpen()
      ? "요일을 선택하고 신청 정보를 입력해주세요."
      : "현재 신청이 마감되어 있습니다.",
  );
}

function scheduleApplyViewUpdate() {
  window.clearTimeout(applyScheduleTimer);

  const now = Date.now();
  const upcomingScheduleTimes = [
    normalizeDate(voteConfig?.reservedOpenAt),
    normalizeDate(voteConfig?.reservedCloseAt),
  ]
    .map((date) => date?.getTime())
    .filter((time) => Number.isFinite(time) && time > now);

  if (!upcomingScheduleTimes.length) return;

  const nextDelay = Math.min(...upcomingScheduleTimes) - now + 1000;

  applyScheduleTimer = window.setTimeout(() => {
    updateApplyView();
    scheduleApplyViewUpdate();
  }, Math.min(nextDelay, 2147483647));
}

function normalizeStudentId(studentId) {
  return String(studentId || "").trim().replace(/\s+/g, "").replace(/\//g, "-");
}

function renderDayPicker() {
  const enabledDays = getEnabledDays();
  const applyOpen = isApplyOpen();

  dayListElement.classList.toggle("is-closed", !applyOpen);
  dayListElement.classList.toggle("is-empty", applyOpen && !enabledDays.length);

  if (!applyOpen) {
    dayListElement.innerHTML = `
      <div class="apply-closed-notice" role="status">
        <strong>신청 마감</strong>
        <span>현재 클래스 신청이 마감되었습니다.</span>
      </div>
    `;
    voteSubmitButton.disabled = true;
    return;
  }

  if (!enabledDays.length) {
    dayListElement.innerHTML = `<p class="empty-state">현재 신청 가능한 요일이 없습니다.</p>`;
    voteSubmitButton.disabled = true;
    return;
  }

  if (!enabledDays.some((weekday) => weekday.key === selectedDay)) {
    selectedDay = enabledDays[0].key;
  }

  voteSubmitButton.disabled = false;

  dayListElement.innerHTML = `
    <span class="public-day-indicator" aria-hidden="true"></span>
    ${enabledDays.map((weekday) => {
    const isSelected = selectedDay === weekday.key;

    return `
      <button
        class="public-day-button ${isSelected ? "is-active" : ""}"
        type="button"
        data-vote-day="${weekday.key}"
      >
        ${weekday.label}
      </button>
    `;
  }).join("")}
  `;

  window.requestAnimationFrame(updateDayPickerSelection);
}

function updateDayPickerSelection() {
  const indicator = dayListElement.querySelector(".public-day-indicator");
  const buttons = dayListElement.querySelectorAll("[data-vote-day]");
  const activeButton = dayListElement.querySelector(`[data-vote-day="${selectedDay}"]`);

  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.voteDay === selectedDay);
  });

  if (!indicator || !activeButton) return;

  indicator.style.width = `${activeButton.offsetWidth}px`;
  indicator.style.height = `${activeButton.offsetHeight}px`;
  indicator.style.transform = `translate(${activeButton.offsetLeft}px, ${activeButton.offsetTop}px)`;
}

function renderVoteBoard() {
  const enabledDays = getEnabledDays();
  const capacity = getCapacity();

  if (!enabledDays.length) {
    voteBoardElement.innerHTML = `<p class="empty-state">관리 페이지에서 신청 요일을 먼저 설정해주세요.</p>`;
    return;
  }

  voteBoardElement.innerHTML = enabledDays.map((weekday) => {
    const count = Number(currentVoteState[weekday.key] || 0);

    return `
      <article class="vote-board-day">
        <div class="vote-board-day__header">
          <h3>${weekday.label}</h3>
          <span>${count}/${capacity}</span>
        </div>
        <ol class="vote-member-list">
          <li class="empty-member">${count ? `${count}명이 신청했습니다.` : "아직 신청자가 없습니다."}</li>
        </ol>
      </article>
    `;
  }).join("");
}

function bindDayPicker() {
  dayListElement.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-vote-day]");

    if (!dayButton) return;

    selectedDay = dayButton.dataset.voteDay;
    updateDayPickerSelection();
  });
}

function bindApplyRuleOverrideUpdates() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeAuth) return;

  martiniFirebase.subscribeAuth(() => {
    updateApplyView();
  });
}

async function loadVoteConfig() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    voteConfig = await martiniFirebase.getVoteConfig();
    updateApplyView();
    scheduleApplyViewUpdate();
  } catch {
    voteSubmitButton.disabled = true;
    setVoteMessage("신청 설정을 불러오지 못했습니다.");
  }
}

function subscribeVotes() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassVoteState) return;

  martiniFirebase.subscribeClassVoteState((state) => {
    currentVoteState = state;
    renderVoteBoard();
  });
}

async function submitVote({ name, studentId, day }) {
  const firebase = window.firebase;
  const db = window.MartiniFirebase?.db;
  const capacity = getCapacity();
  const shouldOverrideApplyRules = canOverrideApplyRules();

  if (!firebase || !db) {
    throw new Error("Firebase 연결을 확인해주세요.");
  }

  const voteRef = db.collection("classVotes").doc(studentId);
  const targetStateRef = db.collection("classVoteState").doc(day);

  await db.runTransaction(async (transaction) => {
    const targetStateSnapshot = await transaction.get(targetStateRef);
    const targetCount = Number(targetStateSnapshot.data()?.count || 0);

    if (!shouldOverrideApplyRules && targetCount >= capacity) {
      throw new Error("DAY_FULL");
    }

    transaction.set(
      targetStateRef,
      { count: targetCount + 1 },
      { merge: true },
    );

    transaction.set(voteRef, {
      name,
      studentId,
      day,
      dayLabel: getDayLabel(day),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

function getDayLabel(dayKey) {
  return WEEKDAYS.find((weekday) => weekday.key === dayKey)?.label || dayKey;
}

function getSubmitErrorMessage(error) {
  if (error.message === "ALREADY_SAME_DAY") {
    return "이미 같은 요일에 신청했습니다.";
  }

  if (error.message === "DAY_FULL") {
    return "선택한 요일의 정원이 마감되었습니다.";
  }

  if (error.code === "permission-denied") {
    return "이미 신청했거나 현재 신청을 처리할 수 없습니다. 요일 변경이 필요하면 관리자에게 문의해주세요.";
  }

  return "신청 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

async function handleVoteSubmit(event) {
  event.preventDefault();

  const formData = new FormData(voteForm);
  const name = String(formData.get("name") || "").trim();
  const studentId = normalizeStudentId(formData.get("studentId"));

  if (!isApplyOpen()) {
    setVoteMessage("현재 신청이 마감되어 있습니다.");
    return;
  }

  if (!selectedDay) {
    setVoteMessage("요일을 선택해주세요.");
    return;
  }

  if (!getEnabledDays().some((weekday) => weekday.key === selectedDay)) {
    setVoteMessage("현재 신청 가능한 요일을 선택해주세요.");
    return;
  }

  if (!name || !studentId) {
    setVoteMessage("이름과 학번을 입력해주세요.");
    return;
  }

  try {
    voteSubmitButton.disabled = true;
    setVoteMessage("신청을 저장하고 있습니다.");
    await submitVote({ name, studentId, day: selectedDay });
    setVoteMessage(`${getDayLabel(selectedDay)} 신청이 완료되었습니다.`);
    voteForm.reset();
  } catch (error) {
    setVoteMessage(getSubmitErrorMessage(error));
  } finally {
    voteSubmitButton.disabled = !getEnabledDays().length;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindDayPicker();
  bindApplyRuleOverrideUpdates();
  loadVoteConfig();
  subscribeVotes();
  voteForm.addEventListener("submit", handleVoteSubmit);
  window.addEventListener("resize", updateDayPickerSelection);
});
