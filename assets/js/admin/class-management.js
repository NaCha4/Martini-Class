import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { watchAdminAuth } from "../firebase-client.js";
import {
  fromDateTimeLocalValue,
  normalizeDateTimeValue,
  toDateTimeLocalValue,
} from "../shared/common.js";

const COLLECTION_NAME = "classSchedules";
const SCHEDULE_ID = "weekly";
const DAYS = [
  { id: "mon", label: "월" },
  { id: "tue", label: "화" },
  { id: "wed", label: "수" },
  { id: "thu", label: "목" },
  { id: "fri", label: "금" },
];

let classContext;
let classSchedule = createDefaultSchedule();
let isClassEditMode = false;
let activeApplicantDrag = null;
let classScheduleTimer;
let pendingAnimatedDayId = null;


function setStatus() {
  const status = document.querySelector("[data-classes-status]");

  if (status) {
    status.textContent = "";
    status.classList.toggle("is-error", false);
  }
}

function createDefaultSchedule() {
  return {
    id: SCHEDULE_ID,
    capacity: 10,
    isApplicationOpen: false,
    reservationCloseAt: "",
    reservationOpenAt: "",
    days: DAYS.map((day, index) => ({
      ...day,
      applicants: [],
      capacity: 10,
      isOpen: false,
      order: index,
    })),
  };
}

function normalizeSchedule(data = {}) {
  const sourceDays = Array.isArray(data.days) ? data.days : [];
  const fallbackCapacity = Number.isFinite(Number(data.capacity))
    ? Number(data.capacity)
    : Number(sourceDays.find((day) => Number.isFinite(Number(day.capacity)))?.capacity) || 10;

  return {
    id: SCHEDULE_ID,
    capacity: fallbackCapacity,
    isApplicationOpen: Boolean(data.isApplicationOpen),
    reservationCloseAt: normalizeDateTimeValue(data.reservationCloseAt),
    reservationOpenAt: normalizeDateTimeValue(data.reservationOpenAt),
    days: DAYS.map((day, index) => {
      const existing = sourceDays.find((item) => item.id === day.id) || {};

      return {
        ...day,
        applicants: Array.isArray(existing.applicants) ? existing.applicants : [],
        capacity: fallbackCapacity,
        isOpen: Boolean(existing.isOpen),
        order: Number.isFinite(existing.order) ? existing.order : index,
      };
    }).sort((first, second) => first.order - second.order),
  };
}

function getCurrentApplicationOpenState() {
  const now = Date.now();
  const openAt = classSchedule.reservationOpenAt ? new Date(classSchedule.reservationOpenAt).getTime() : null;
  const closeAt = classSchedule.reservationCloseAt ? new Date(classSchedule.reservationCloseAt).getTime() : null;

  if (Number.isFinite(closeAt) && now >= closeAt) {
    return false;
  }

  if (Number.isFinite(openAt)) {
    return now >= openAt;
  }

  return Boolean(classSchedule.isApplicationOpen);
}


async function loadRemoteSchedule(db) {
  const snapshot = await getDoc(doc(db, COLLECTION_NAME, SCHEDULE_ID));

  classSchedule = normalizeSchedule(snapshot.exists() ? snapshot.data() : createDefaultSchedule());
}

async function saveRemoteSchedule(db) {
  await setDoc(doc(db, COLLECTION_NAME, SCHEDULE_ID), {
    ...classSchedule,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function persistSchedule() {
  await saveRemoteSchedule(classContext.db);
}

function setClassControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-classes-app-toggle], [data-classes-edit], [data-classes-reset], [data-classes-capacity], [data-classes-open-at], [data-classes-close-at], [data-classes-clear-reservation]").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function syncClassButtons() {
  const appToggle = document.querySelector("[data-classes-app-toggle]");
  const editButton = document.querySelector("[data-classes-edit]");
  const capacityInput = document.querySelector("[data-classes-capacity]");
  const openAtInput = document.querySelector("[data-classes-open-at]");
  const closeAtInput = document.querySelector("[data-classes-close-at]");
  const panel = document.querySelector('[data-admin-panel="classes"]');
  const isCurrentlyOpen = getCurrentApplicationOpenState();

  if (capacityInput) {
    capacityInput.value = String(classSchedule.capacity);
  }

  if (openAtInput) {
    openAtInput.value = toDateTimeLocalValue(classSchedule.reservationOpenAt);
  }

  if (closeAtInput) {
    closeAtInput.value = toDateTimeLocalValue(classSchedule.reservationCloseAt);
  }

  const appToggleTitle = appToggle.querySelector("strong");
  const appToggleDescription = appToggle.querySelector("span");

  if (appToggleTitle) {
    appToggleTitle.textContent = isCurrentlyOpen ? "신청 열림" : "신청 닫힘";
  }

  if (appToggleDescription) {
    appToggleDescription.textContent = isCurrentlyOpen ? "신청을 받고 있습니다." : "신청을 받지 않습니다.";
  }

  appToggle.classList.toggle("is-active", isCurrentlyOpen);
  appToggle.setAttribute("aria-pressed", String(isCurrentlyOpen));
  editButton.classList.toggle("is-active", isClassEditMode);
  editButton.setAttribute("aria-pressed", String(isClassEditMode));
  panel?.classList.toggle("is-class-edit-mode", isClassEditMode);
}

function playClassStateAnimation(element) {
  if (!element) {
    return;
  }

  element.classList.remove("is-state-changing");
  window.requestAnimationFrame(() => {
    element.classList.add("is-state-changing");
  });
  element.addEventListener("animationend", () => {
    element.classList.remove("is-state-changing");
  }, { once: true });
}

function renderClasses() {
  const board = document.querySelector("[data-classes-app]");

  if (!board) {
    return;
  }

  syncClassButtons();
  board.replaceChildren(...classSchedule.days.map(renderClassDayCard));
}

function renderClassDayCard(day) {
  const card = document.createElement("article");
  const header = document.createElement("button");
  const title = document.createElement("strong");
  const state = document.createElement("span");
  const list = document.createElement("div");

  card.className = "admin-class-day-card";
  card.classList.toggle("is-open", day.isOpen);
  card.dataset.dayId = day.id;

  if (pendingAnimatedDayId === day.id) {
    window.requestAnimationFrame(() => {
      playClassStateAnimation(card);
      pendingAnimatedDayId = null;
    });
  }

  header.className = "admin-class-day-card__header";
  header.type = "button";
  title.textContent = day.label;
  state.textContent = day.isOpen ? "Open" : "Closed";
  header.append(title, state);
  card.addEventListener("click", async (event) => {
    const target = event.target;
    const isIgnoredClick = target instanceof Element
      && Boolean(target.closest(".admin-class-applicant"));

    if (isIgnoredClick) {
      return;
    }

    day.isOpen = !day.isOpen;
    pendingAnimatedDayId = day.id;
    await updateSchedule();
  });

  list.className = "admin-class-applicant-list";

  if (!day.applicants.length) {
    list.innerHTML = '<p class="admin-empty">신청자가 없습니다.</p>';
  } else {
    list.replaceChildren(...day.applicants.map((applicant) => renderClassApplicant(day, applicant)));
  }

  card.append(header, list);

  return card;
}

function renderClassApplicant(day, applicant) {
  const row = document.createElement("div");
  const name = document.createElement("span");

  row.className = "admin-class-applicant";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${applicant.name} 삭제`);
  name.textContent = applicant.name;
  row.append(name);
  row.addEventListener("click", async () => {
    if (row.dataset.skipClick === "true") {
      delete row.dataset.skipClick;
      return;
    }

    if (isClassEditMode) {
      await removeClassApplicant(day.id, applicant.id);
    }
  });
  row.addEventListener("keydown", async (event) => {
    if (isClassEditMode && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      await removeClassApplicant(day.id, applicant.id);
    }
  });
  bindClassApplicantDragEvents(row, day, applicant);

  return row;
}

async function updateSchedule() {
  renderClasses();

  try {
    await persistSchedule();
  } catch {
    await refreshClasses();
  }
}

async function refreshClasses() {
  if (!classContext) {
    return;
  }

  try {
    await loadRemoteSchedule(classContext.db);

    renderClasses();
    setStatus();
  } catch {
    setClassControlsEnabled(false);
    setStatus();
  }
}

function bindClassButtons() {
  document.querySelector("[data-classes-app-toggle]")?.addEventListener("click", async () => {
    classSchedule.isApplicationOpen = !classSchedule.isApplicationOpen;
    playClassStateAnimation(document.querySelector("[data-classes-app-toggle]"));
    await updateSchedule();
  });

  document.querySelector("[data-classes-edit]")?.addEventListener("click", () => {
    isClassEditMode = !isClassEditMode;
    renderClasses();
  });

  document.querySelector("[data-classes-reset]")?.addEventListener("click", async () => {
    if (!window.confirm("정기 교육 신청자 목록과 요일 설정을 모두 초기화할까요?")) {
      return;
    }

    classSchedule = createDefaultSchedule();
    await updateSchedule();
  });

  document.querySelector("[data-classes-capacity]")?.addEventListener("change", async (event) => {
    classSchedule.capacity = Math.max(0, Number.parseInt(event.target.value, 10) || 0);
    classSchedule.days = classSchedule.days.map((day) => ({ ...day, capacity: classSchedule.capacity }));
    await updateSchedule();
  });

  document.querySelector("[data-classes-open-at]")?.addEventListener("change", async (event) => {
    classSchedule.reservationOpenAt = fromDateTimeLocalValue(event.target.value);
    await updateSchedule();
  });

  document.querySelector("[data-classes-close-at]")?.addEventListener("change", async (event) => {
    classSchedule.reservationCloseAt = fromDateTimeLocalValue(event.target.value);
    await updateSchedule();
  });

  document.querySelector("[data-classes-clear-reservation]")?.addEventListener("click", async () => {
    classSchedule.reservationOpenAt = "";
    classSchedule.reservationCloseAt = "";
    await updateSchedule();
  });
}

async function removeClassApplicant(dayId, applicantId) {
  const day = classSchedule.days.find((item) => item.id === dayId);

  if (!day) {
    return;
  }

  day.applicants = day.applicants.filter((applicant) => applicant.id !== applicantId);
  await updateSchedule();
}

function bindClassApplicantDragEvents(row, sourceDay, applicant) {
  row.addEventListener("pointerdown", (event) => {
    if (!isClassEditMode) {
      activeApplicantDrag = null;
      return;
    }

    activeApplicantDrag = {
      applicant,
      dragImage: null,
      pointerId: event.pointerId,
      row,
      sourceDayId: sourceDay.id,
      startX: event.clientX,
      startY: event.clientY,
      targetDayId: null,
      wasMoved: false,
    };
    row.setPointerCapture?.(event.pointerId);
  });

  row.addEventListener("pointermove", (event) => {
    updateClassApplicantDrag(event);
  });

  row.addEventListener("pointerup", () => {
    finishClassApplicantDrag();
  });

  row.addEventListener("pointercancel", () => {
    cleanupClassApplicantDrag();
  });
}

function createClassDragImage(name) {
  const dragImage = document.createElement("div");

  dragImage.className = "admin-drag-image";
  dragImage.textContent = name;
  document.body.append(dragImage);

  return dragImage;
}

function updateClassApplicantDrag(event) {
  if (!activeApplicantDrag) {
    return;
  }

  const distance = Math.hypot(event.clientX - activeApplicantDrag.startX, event.clientY - activeApplicantDrag.startY);

  if (!activeApplicantDrag.wasMoved && distance < 6) {
    return;
  }

  event.preventDefault();
  activeApplicantDrag.wasMoved = true;
  activeApplicantDrag.row.dataset.skipClick = "true";
  activeApplicantDrag.row.classList.add("is-dragging");

  if (!activeApplicantDrag.dragImage) {
    activeApplicantDrag.dragImage = createClassDragImage(activeApplicantDrag.applicant.name);
  }

  activeApplicantDrag.dragImage.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
  document.querySelectorAll(".admin-class-day-card").forEach((card) => card.classList.remove("is-applicant-drop-target"));

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".admin-class-day-card");

  if (!target || target.dataset.dayId === activeApplicantDrag.sourceDayId) {
    activeApplicantDrag.targetDayId = null;
    return;
  }

  activeApplicantDrag.targetDayId = target.dataset.dayId || null;
  target.classList.add("is-applicant-drop-target");
}

function finishClassApplicantDrag() {
  if (!activeApplicantDrag) {
    return;
  }

  const dragState = activeApplicantDrag;

  cleanupClassApplicantDrag();

  if (dragState.wasMoved && dragState.targetDayId) {
    moveClassApplicant(dragState.sourceDayId, dragState.targetDayId, dragState.applicant.id);
  }
}

function cleanupClassApplicantDrag() {
  if (!activeApplicantDrag) {
    return;
  }

  try {
    activeApplicantDrag.row.releasePointerCapture?.(activeApplicantDrag.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  activeApplicantDrag.dragImage?.remove();
  activeApplicantDrag.row.classList.remove("is-dragging");
  activeApplicantDrag = null;
  document.querySelectorAll(".admin-class-day-card").forEach((card) => card.classList.remove("is-applicant-drop-target"));
}

async function moveClassApplicant(sourceDayId, targetDayId, applicantId) {
  const sourceDay = classSchedule.days.find((day) => day.id === sourceDayId);
  const targetDay = classSchedule.days.find((day) => day.id === targetDayId);
  const applicant = sourceDay?.applicants.find((item) => item.id === applicantId);

  if (!sourceDay || !targetDay || !applicant) {
    return;
  }

  sourceDay.applicants = sourceDay.applicants.filter((item) => item.id !== applicantId);
  targetDay.applicants = [...targetDay.applicants.filter((item) => item.id !== applicantId), applicant];
  await updateSchedule();
}

function bindClassDragReset() {
  document.addEventListener("pointermove", (event) => {
    updateClassApplicantDrag(event);
  });

  document.addEventListener("pointerup", () => {
    finishClassApplicantDrag();
  });

  document.addEventListener("pointercancel", () => {
    cleanupClassApplicantDrag();
  });
}

function startClassScheduleTimer() {
  window.clearInterval(classScheduleTimer);
  classScheduleTimer = window.setInterval(() => {
    syncClassButtons();
  }, 30000);
}

async function initClassManagement() {
  if (!document.querySelector("[data-classes-app]")) {
    return;
  }

  bindClassButtons();
  bindClassDragReset();
  startClassScheduleTimer();
  setClassControlsEnabled(false);

  try {
    await watchAdminAuth({
      onDenied: () => {
        classContext = null;
        setClassControlsEnabled(false);
        setStatus();
      },
      onAdmin: async (user, { db }) => {
        classContext = { user, db };
        setClassControlsEnabled(true);
        await refreshClasses();
      },
    });
  } catch {
    setClassControlsEnabled(false);
    setStatus();
  }
}

document.addEventListener("DOMContentLoaded", initClassManagement);
