const WEEKDAYS = [
  { key: "monday", label: "월요일" },
  { key: "tuesday", label: "화요일" },
  { key: "wednesday", label: "수요일" },
  { key: "thursday", label: "목요일" },
  { key: "friday", label: "금요일" },
];

const DEFAULT_CAPACITY = 12;
const voteConfigForm = document.querySelector("[data-vote-config-form]");
const voteCapacityInput = document.querySelector("[data-vote-capacity]");
const voteDayList = document.querySelector("[data-vote-day-list]");
const voteConfigStatus = document.querySelector("[data-vote-config-status]");
const voteSaveButton = document.querySelector("[data-vote-save-button]");
const voteResetButton = document.querySelector("[data-vote-reset-button]");
const applyStatusCard = document.querySelector("[data-apply-status-card]");
const applyStatusCopy = document.querySelector("[data-apply-status-copy]");
const applyToggleButton = document.querySelector("[data-apply-toggle-button]");
const applyOpenAtInput = document.querySelector("[data-apply-open-at]");
const applyCloseAtInput = document.querySelector("[data-apply-close-at]");
const applyScheduleSummary = document.querySelector("[data-apply-schedule-summary]");
const applyScheduleClearButton = document.querySelector("[data-apply-schedule-clear]");
const regularApplyCount = document.querySelector("[data-regular-apply-count]");
let adminClassVotes = [];
let currentVoteConfig = null;

function moveToPage(target) {
  if (!target) return;

  window.location.href = target;
}

function bindNavigation() {
  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      moveToPage(element.dataset.route);
    });
  });
}

function bindAuthGuard() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) {
    moveToPage("./login.html");
    return;
  }

  martiniFirebase.subscribeAuth(({ user, isAdmin }) => {
    if (!user || !isAdmin) {
      moveToPage("./login.html");
      return;
    }

  });
}

function setVoteConfigStatus(message) {
  if (!voteConfigStatus) return;

  voteConfigStatus.textContent = message;
}

function getDefaultVoteConfig() {
  return {
    isOpen: false,
    reservedOpenAt: null,
    reservedCloseAt: null,
    capacity: DEFAULT_CAPACITY,
    days: WEEKDAYS.reduce((days, weekday) => {
      days[weekday.key] = {
        enabled: false,
        capacity: DEFAULT_CAPACITY,
      };

      return days;
    }, {}),
  };
}

function normalizeConfigDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toDatetimeLocalValue(date) {
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInputDate(input) {
  if (!input?.value) return null;

  const date = new Date(input.value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatScheduleDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isEffectivelyOpen(config) {
  const now = new Date();
  const reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  const reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  if (reservedCloseAt && reservedCloseAt <= now) return false;

  return config?.isOpen === true || Boolean(reservedOpenAt && reservedOpenAt <= now);
}

function normalizeVoteConfig(config) {
  const defaultConfig = getDefaultVoteConfig();
  const savedDays = config?.days || {};
  const savedCapacity = Number(config?.capacity);
  const firstSavedDayCapacity = WEEKDAYS.map((weekday) => Number(savedDays[weekday.key]?.capacity))
    .find((capacity) => Number.isFinite(capacity) && capacity > 0);
  const capacity = Number.isFinite(savedCapacity) && savedCapacity > 0
    ? savedCapacity
    : firstSavedDayCapacity || DEFAULT_CAPACITY;

  defaultConfig.capacity = capacity;
  defaultConfig.isOpen = config?.isOpen === true;
  defaultConfig.reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  defaultConfig.reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  WEEKDAYS.forEach((weekday) => {
    const savedDay = savedDays[weekday.key] || {};

    defaultConfig.days[weekday.key] = {
      enabled: savedDay.enabled === true,
      capacity,
    };
  });

  return defaultConfig;
}

function renderVoteConfig(config) {
  if (!voteDayList) return;

  currentVoteConfig = config;
  renderApplyStatus(isEffectivelyOpen(config));
  renderApplySchedule(config);

  if (voteCapacityInput) {
    voteCapacityInput.value = config.capacity;
  }

  voteDayList.innerHTML = WEEKDAYS.map((weekday) => {
    const dayConfig = config.days[weekday.key];
    const checked = dayConfig.enabled ? "checked" : "";
    const activeClass = dayConfig.enabled ? " is-active" : "";

    return `
      <article class="vote-day-row${activeClass}" data-vote-day="${weekday.key}">
        <button class="vote-day-toggle" type="button" data-vote-toggle>
          <span class="vote-day-row__name">${weekday.label}</span>
        </button>
        <input type="checkbox" name="${weekday.key}-enabled" ${checked} hidden />
        <ul class="admin-vote-member-list" data-admin-vote-members="${weekday.key}"></ul>
      </article>
    `;
  }).join("");

  renderAdminVoteMembers();
}

function renderApplySchedule(config) {
  const reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  const reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  if (applyOpenAtInput) {
    applyOpenAtInput.value = toDatetimeLocalValue(reservedOpenAt);
  }

  if (applyCloseAtInput) {
    applyCloseAtInput.value = toDatetimeLocalValue(reservedCloseAt);
  }

  if (!applyScheduleSummary) return;

  if (!reservedOpenAt && !reservedCloseAt) {
    applyScheduleSummary.textContent = "예약된 오픈/마감 시간이 없습니다.";
    return;
  }

  const scheduleText = [
    reservedOpenAt ? `오픈 ${formatScheduleDate(reservedOpenAt)}` : "",
    reservedCloseAt ? `마감 ${formatScheduleDate(reservedCloseAt)}` : "",
  ].filter(Boolean).join(" · ");

  applyScheduleSummary.textContent = scheduleText;
}

function renderApplyStatus(isOpen) {
  applyStatusCard?.classList.toggle("is-open", isOpen);

  if (applyStatusCopy) {
    applyStatusCopy.textContent = isOpen
      ? "현재 신청을 받고 있습니다."
      : "현재 신청이 마감되어 있습니다.";
  }

  if (applyToggleButton) {
    applyToggleButton.textContent = isOpen ? "신청 마감" : "신청 오픈";
    applyToggleButton.classList.toggle("auth-button--primary", !isOpen);
    applyToggleButton.classList.toggle("auth-button--ghost", isOpen);
  }
}

function groupAdminVotesByDay() {
  return adminClassVotes.reduce((groups, vote) => {
    if (!groups[vote.day]) groups[vote.day] = [];
    groups[vote.day].push(vote);

    return groups;
  }, {});
}

function renderAdminVoteMembers() {
  if (!voteDayList) return;

  const groupedVotes = groupAdminVotesByDay();

  WEEKDAYS.forEach((weekday) => {
    const list = voteDayList.querySelector(`[data-admin-vote-members="${weekday.key}"]`);
    const votes = groupedVotes[weekday.key] || [];

    if (!list) return;

    list.innerHTML = votes.length
      ? votes.map((vote) => `
        <li class="admin-vote-member" draggable="true" data-student-id="${vote.studentId}">
          <span>${vote.name}</span>
          <button type="button" aria-label="${vote.name} 신청 삭제" data-delete-vote="${vote.studentId}">×</button>
        </li>
      `).join("")
      : `<li class="admin-vote-empty">신청자 없음</li>`;
  });
}

function renderDashboardStats() {
  if (!regularApplyCount) return;

  regularApplyCount.textContent = String(adminClassVotes.length);
}

function collectVoteConfig() {
  const formData = new FormData(voteConfigForm);
  const days = {};
  const capacity = Number(formData.get("vote-capacity"));
  const normalizedCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_CAPACITY;
  const reservedOpenAt = getInputDate(applyOpenAtInput);
  const reservedCloseAt = getInputDate(applyCloseAtInput);

  WEEKDAYS.forEach((weekday) => {
    const enabled = formData.get(`${weekday.key}-enabled`) === "on";

    days[weekday.key] = {
      label: weekday.label,
      enabled,
      capacity: normalizedCapacity,
    };
  });

  return {
    isOpen: currentVoteConfig?.isOpen === true,
    reservedOpenAt,
    reservedCloseAt,
    capacity: normalizedCapacity,
    days,
  };
}

function isValidApplySchedule(config) {
  if (!config.reservedOpenAt || !config.reservedCloseAt) return true;

  return config.reservedCloseAt > config.reservedOpenAt;
}

function bindVoteCapacityToggles() {
  voteDayList?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-vote-toggle]");

    if (!toggleButton) return;

    const row = toggleButton.closest("[data-vote-day]");
    const checkbox = row?.querySelector('input[type="checkbox"]');

    if (!row || !checkbox) return;

    checkbox.checked = !checkbox.checked;
    row.classList.toggle("is-active", checkbox.checked);
  });
}

function bindVoteMemberActions() {
  voteDayList?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-vote]");

    if (!deleteButton) return;

    const studentId = deleteButton.dataset.deleteVote;
    const confirmed = window.confirm("이 신청자를 삭제할까요?");

    if (!confirmed) return;

    try {
      setVoteConfigStatus("신청자를 삭제하고 있습니다.");
      await window.MartiniFirebase.deleteClassVote(studentId);
      setVoteConfigStatus("신청자가 삭제되었습니다.");
    } catch {
      setVoteConfigStatus("신청자 삭제에 실패했습니다.");
    }
  });

  voteDayList?.addEventListener("dragstart", (event) => {
    const member = event.target.closest("[data-student-id]");

    if (!member) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", member.dataset.studentId);
    member.classList.add("is-dragging");
  });

  voteDayList?.addEventListener("dragend", (event) => {
    event.target.closest("[data-student-id]")?.classList.remove("is-dragging");
    voteDayList.querySelectorAll(".is-drop-target").forEach((row) => {
      row.classList.remove("is-drop-target");
    });
  });

  voteDayList?.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("is-drop-target");
  });

  voteDayList?.addEventListener("dragleave", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row || row.contains(event.relatedTarget)) return;

    row.classList.remove("is-drop-target");
  });

  voteDayList?.addEventListener("drop", async (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    row.classList.remove("is-drop-target");

    const studentId = event.dataTransfer.getData("text/plain");
    const targetDay = row.dataset.voteDay;
    const targetWeekday = WEEKDAYS.find((weekday) => weekday.key === targetDay);
    const vote = adminClassVotes.find((classVote) => classVote.studentId === studentId);

    if (!studentId || !targetWeekday || vote?.day === targetDay) return;

    try {
      setVoteConfigStatus(`${vote.name} 신청 요일을 이동하고 있습니다.`);
      await window.MartiniFirebase.moveClassVote(studentId, targetDay, targetWeekday.label);
      setVoteConfigStatus(`${vote.name} 신청 요일이 ${targetWeekday.label}로 변경되었습니다.`);
    } catch {
      setVoteConfigStatus("신청 요일 변경에 실패했습니다.");
    }
  });
}

function subscribeAdminClassVotes() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassVotes) return;

  martiniFirebase.subscribeClassVotes((votes) => {
    adminClassVotes = votes;
    renderDashboardStats();
    renderAdminVoteMembers();
  });
}

async function loadVoteConfig() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase || !voteConfigForm) return;

  try {
    setVoteConfigStatus("저장된 설정을 불러오고 있습니다.");
    const savedConfig = await martiniFirebase.getVoteConfig();
    renderVoteConfig(normalizeVoteConfig(savedConfig));
    setVoteConfigStatus("설정을 수정한 뒤 저장해주세요.");
  } catch {
    renderVoteConfig(getDefaultVoteConfig());
    setVoteConfigStatus("설정을 불러오지 못했습니다. 새 설정을 저장할 수 있습니다.");
  }
}

async function handleVoteConfigSubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    voteSaveButton.disabled = true;
    setVoteConfigStatus("설정을 저장하고 있습니다.");
    const nextConfig = collectVoteConfig();

    if (!isValidApplySchedule(nextConfig)) {
      setVoteConfigStatus("예약 마감 시간은 예약 오픈 시간보다 뒤여야 합니다.");
      return;
    }

    await martiniFirebase.saveVoteConfig(nextConfig);
    currentVoteConfig = nextConfig;
    renderApplyStatus(isEffectivelyOpen(nextConfig));
    renderApplySchedule(nextConfig);
    setVoteConfigStatus("신청 설정이 저장되었습니다.");
  } catch {
    setVoteConfigStatus("설정 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteSaveButton.disabled = false;
  }
}

async function handleApplyToggle() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const nextIsOpen = !isEffectivelyOpen(currentVoteConfig || getDefaultVoteConfig());

  try {
    applyToggleButton.disabled = true;
    setVoteConfigStatus(nextIsOpen ? "신청을 오픈하고 있습니다." : "신청을 마감하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(nextIsOpen);
    renderApplySchedule(currentVoteConfig);
    setVoteConfigStatus(nextIsOpen ? "신청이 오픈되었습니다." : "신청이 마감되었습니다.");
  } catch {
    setVoteConfigStatus("신청 상태 변경에 실패했습니다.");
  } finally {
    applyToggleButton.disabled = false;
  }
}

async function handleApplyScheduleClear() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    applyScheduleClearButton.disabled = true;
    setVoteConfigStatus("신청 예약을 해제하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(isEffectivelyOpen(currentVoteConfig));
    renderApplySchedule(currentVoteConfig);
    setVoteConfigStatus("신청 예약이 해제되었습니다.");
  } catch {
    setVoteConfigStatus("신청 예약 해제에 실패했습니다.");
  } finally {
    applyScheduleClearButton.disabled = false;
  }
}

async function handleVoteReset() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const confirmed = window.confirm(
    "현재 신청된 모든 기록을 삭제하고 요일별 신청 인원을 0명으로 초기화할까요?",
  );

  if (!confirmed) return;

  try {
    voteResetButton.disabled = true;
    voteSaveButton.disabled = true;
    setVoteConfigStatus("신청 데이터를 초기화하고 있습니다.");
    await martiniFirebase.resetClassVotes(WEEKDAYS.map((weekday) => weekday.key));
    setVoteConfigStatus("신청 데이터가 모두 초기화되었습니다.");
  } catch {
    setVoteConfigStatus("초기화에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteResetButton.disabled = false;
    voteSaveButton.disabled = false;
  }
}

function setActiveAdminTab(targetTab) {
  const tabs = document.querySelectorAll("[data-admin-tab]");
  const panels = document.querySelectorAll("[data-admin-panel]");

  tabs.forEach((tab) => {
    const isActive = tab.dataset.adminTab === targetTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.adminPanel === targetTab;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function bindAdminTabs() {
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveAdminTab(tab.dataset.adminTab);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindAuthGuard();
  bindAdminTabs();
  bindVoteCapacityToggles();
  bindVoteMemberActions();
  loadVoteConfig();
  subscribeAdminClassVotes();
  voteConfigForm?.addEventListener("submit", handleVoteConfigSubmit);
  voteResetButton?.addEventListener("click", handleVoteReset);
  applyToggleButton?.addEventListener("click", handleApplyToggle);
  applyScheduleClearButton?.addEventListener("click", handleApplyScheduleClear);
});
