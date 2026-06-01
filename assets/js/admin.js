const WEEKDAYS = [
  { key: "monday", label: "월요일" },
  { key: "tuesday", label: "화요일" },
  { key: "wednesday", label: "수요일" },
  { key: "thursday", label: "목요일" },
  { key: "friday", label: "금요일" },
];

const INVENTORY_CATEGORIES = [
  { key: "alcohol", label: "술" },
  { key: "juice", label: "음료" },
  { key: "mix", label: "믹스/가루" },
  { key: "supply", label: "소모품" },
  { key: "etc", label: "기타" },
];

const DEFAULT_CAPACITY = 12;
const voteConfigForm = document.querySelector("[data-vote-config-form]");
const voteCapacityInput = document.querySelector("[data-vote-capacity]");
const voteDayList = document.querySelector("[data-vote-day-list]");
const voteConfigStatus = document.querySelector("[data-vote-config-status]");
const voteResetButton = document.querySelector("[data-vote-reset-button]");
const applyStatusCard = document.querySelector("[data-apply-status-card]");
const applyStatusCopy = document.querySelector("[data-apply-status-copy]");
const applyToggleButton = document.querySelector("[data-apply-toggle-button]");
const applyOpenAtInput = document.querySelector("[data-apply-open-at]");
const applyCloseAtInput = document.querySelector("[data-apply-close-at]");
const applyScheduleSummary = document.querySelector("[data-apply-schedule-summary]");
const applyScheduleClearButton = document.querySelector("[data-apply-schedule-clear]");
const regularApplyCount = document.querySelector("[data-regular-apply-count]");
const dashboardPrivateApplications = document.querySelector("[data-dashboard-private-applications]");
const dashboardApplyStatus = document.querySelector("[data-dashboard-apply-status]");
const dashboardVoteList = document.querySelector("[data-dashboard-vote-list]");
const dashboardPrivateList = document.querySelector("[data-dashboard-private-list]");
const dashboardMemoInput = document.querySelector("[data-dashboard-memo-input]");
const dashboardMemoStatus = document.querySelector("[data-dashboard-memo-status]");
const executiveOrg = document.querySelector("[data-executive-org]");
const executiveDayBoard = document.querySelector("[data-executive-day-board]");
const executiveEventBoard = document.querySelector("[data-executive-event-board]");
const executiveEditButton = document.querySelector("[data-executive-edit]");
const executiveSaveButton = document.querySelector("[data-executive-save]");
const executiveCancelButton = document.querySelector("[data-executive-cancel]");
const executiveAddDepartmentButton = document.querySelector("[data-executive-add-department]");
const executiveAddEventButton = document.querySelector("[data-executive-add-event]");
const privateClassForm = document.querySelector("[data-private-class-form]");
const privateClassToolbar = document.querySelector("[data-private-class-toolbar]");
const privateClassWriteButton = document.querySelector("[data-private-class-write]");
const privateClassCancelButton = document.querySelector("[data-private-class-cancel]");
const privateThumbnailInput = document.querySelector("[data-private-thumbnail-input]");
const privateThumbnailPreview = document.querySelector("[data-private-thumbnail-preview]");
const privateClassStatus = document.querySelector("[data-private-class-status]");
const privateClassSaveButton = document.querySelector("[data-private-class-save]");
const privateClassAdminList = document.querySelector("[data-private-class-admin-list]");
const privateClassDetail = document.querySelector("[data-private-class-detail]");
const privateDetailTitle = document.querySelector("[data-private-detail-title]");
const privateDetailMeta = document.querySelector("[data-private-detail-meta]");
const privateClassEditButton = document.querySelector("[data-private-class-edit]");
const privateApplicantExportButton = document.querySelector("[data-private-applicant-export]");
const privateApplicantList = document.querySelector("[data-private-applicant-list]");
const inventoryForm = document.querySelector("[data-inventory-form]");
const inventoryList = document.querySelector("[data-inventory-list]");
const inventoryStatus = document.querySelector("[data-inventory-status]");
const inventorySaveButton = document.querySelector("[data-inventory-save]");
const inventoryCancelButton = document.querySelector("[data-inventory-cancel]");
const inventoryDeleteButton = document.querySelector("[data-inventory-delete]");
const usageScheduleSelect = document.querySelector("[data-usage-schedule-select]");
const usageWeekSelect = document.querySelector("[data-usage-week-select]");
const usageAttendeesInput = document.querySelector("[data-usage-attendees]");
const usageBufferInput = document.querySelector("[data-usage-buffer]");
const usageLoadVotesButton = document.querySelector("[data-usage-load-votes]");
const usageResult = document.querySelector("[data-usage-result]");
const scheduleForm = document.querySelector("[data-schedule-form]");
const scheduleList = document.querySelector("[data-schedule-list]");
const scheduleWeekList = document.querySelector("[data-schedule-week-list]");
const scheduleAddWeekButton = document.querySelector("[data-schedule-add-week]");
const scheduleSaveButton = document.querySelector("[data-schedule-save]");
const scheduleStatus = document.querySelector("[data-schedule-status]");
const {
  bindRouteNavigation,
  escapeHtml,
  moveToPage,
  normalizeDate: normalizeConfigDate,
} = window.MartiniUtils;

let adminClassVotes = [];
let privateClasses = [];
let privateClassApplications = [];
let inventoryItems = [];
let classSchedules = [];
let attendanceRecords = [];
let executiveConfig = null;
let executiveDraft = null;
let isExecutiveEditing = false;
let selectedPrivateClassId = "";
let editingPrivateClassId = "";
let privateClassMode = "browse";
let editingInventoryItemId = "";
let editingClassScheduleId = "";
let currentVoteConfig = null;
let selectedAdminVoteStudentId = "";
let voteConfigAutoSaveTimer = null;
let currentDashboardMemo = "";
let dashboardMemoSaveTimer = null;
const adminDataSubscriptions = {};

function bindNavigation() {
  bindRouteNavigation();
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

function setPrivateClassStatus(message) {
  if (!privateClassStatus) return;

  privateClassStatus.textContent = message;
}

function setInventoryStatus(message) {
  if (!inventoryStatus) return;

  inventoryStatus.textContent = message;
}

function setScheduleStatus(message) {
  if (!scheduleStatus) return;

  scheduleStatus.textContent = message;
}

function startAdminDataSubscription(key, subscribe) {
  if (adminDataSubscriptions[key]) return;

  const unsubscribe = subscribe?.();

  if (!unsubscribe) return;

  adminDataSubscriptions[key] = typeof unsubscribe === "function" ? unsubscribe : true;
}

function ensureAdminTabData(tabName) {
  if (tabName === "dashboard") {
    startAdminDataSubscription("classVotes", subscribeAdminClassVotes);
    startAdminDataSubscription("privateClasses", subscribePrivateClasses);
    startAdminDataSubscription("adminMemo", subscribeAdminMemo);
    return;
  }

  if (tabName === "vote") {
    startAdminDataSubscription("classVotes", subscribeAdminClassVotes);
    return;
  }

  if (tabName === "executive") {
    startAdminDataSubscription("executiveConfig", subscribeExecutiveConfig);
    return;
  }

  if (tabName === "private") {
    startAdminDataSubscription("privateClasses", subscribePrivateClasses);
    startAdminDataSubscription("privateClassApplications", subscribePrivateClassApplications);
    return;
  }

  if (tabName === "inventory" || tabName === "schedule") {
    startAdminDataSubscription("inventoryItems", subscribeInventoryItems);
    startAdminDataSubscription("classSchedules", subscribeClassSchedules);
    return;
  }

  if (tabName === "minutes") {
    startAdminDataSubscription("meetingMinutes", subscribeMeetingMinuteFiles);
  }
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
  renderExecutiveDayBoard();
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

    list.textContent = "";

    if (!votes.length) {
      const emptyItem = document.createElement("li");

      emptyItem.className = "admin-vote-empty";
      emptyItem.textContent = "신청자 없음";
      list.append(emptyItem);
      return;
    }

    votes.forEach((vote) => {
      const memberItem = document.createElement("li");
      const nameElement = document.createElement("span");
      const deleteButton = document.createElement("button");
      const studentId = String(vote.studentId || "");
      const name = String(vote.name || "");

      memberItem.className = `admin-vote-member${selectedAdminVoteStudentId === studentId ? " is-selected" : ""}`;
      memberItem.draggable = true;
      memberItem.dataset.studentId = studentId;
      nameElement.textContent = name;
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `${name} 신청 삭제`);
      deleteButton.dataset.deleteVote = studentId;
      deleteButton.textContent = "x";
      memberItem.append(nameElement, deleteButton);
      list.append(memberItem);
    });
  });
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

  ensureAdminTabData(targetTab);
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
  bindDashboardMemoActions();
  bindVoteCapacityToggles();
  bindVoteConfigAutoSave();
  bindVoteMemberActions();
  bindExecutiveActions();
  bindPrivateClassActions();
  bindInventoryActions();
  bindScheduleActions();
  bindMeetingMinutesActions();
  setupDefaultScheduleWeeks();
  loadVoteConfig();
  ensureAdminTabData("dashboard");
  privateClassForm?.addEventListener("submit", handlePrivateClassSubmit);
  voteResetButton?.addEventListener("click", handleVoteReset);
  applyToggleButton?.addEventListener("click", handleApplyToggle);
  applyScheduleClearButton?.addEventListener("click", handleApplyScheduleClear);
  window.setInterval(() => {
    renderPrivateClasses();
    renderPrivateClassDetail();
    renderDashboardStats();
  }, 60000);
});
