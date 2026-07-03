import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices } from "../firebase-client.js";
import { formatDateTime, normalizeDateTimeValue } from "../shared/common.js";

const CLASS_COLLECTION = "classSchedules";
const CLASS_DOC_ID = "weekly";
const EVENT_COLLECTION = "eventPosts";
const MEMBERS_COLLECTION = "members";

let memberContext;
let classSchedule = createDefaultSchedule();
let eventPosts = [];
let selectedEventId = null;
let selectedClassDayId = "";
let classFeedbackMessage = "";
let eventFeedbackMessage = "";

function createDefaultSchedule() {
  return {
    id: CLASS_DOC_ID,
    capacity: 10,
    isApplicationOpen: false,
    reservationCloseAt: "",
    reservationOpenAt: "",
    days: [
      { id: "mon", label: "월", applicants: [], capacity: 10, isOpen: false, order: 0 },
      { id: "tue", label: "화", applicants: [], capacity: 10, isOpen: false, order: 1 },
      { id: "wed", label: "수", applicants: [], capacity: 10, isOpen: false, order: 2 },
      { id: "thu", label: "목", applicants: [], capacity: 10, isOpen: false, order: 3 },
      { id: "fri", label: "금", applicants: [], capacity: 10, isOpen: false, order: 4 },
    ],
  };
}

function normalizeSchedule(data = {}) {
  const defaults = createDefaultSchedule();
  const sourceDays = Array.isArray(data.days) ? data.days : [];
  const capacity = Number.isFinite(Number(data.capacity)) ? Number(data.capacity) : defaults.capacity;

  return {
    ...defaults,
    ...data,
    capacity,
    isApplicationOpen: Boolean(data.isApplicationOpen),
    reservationCloseAt: normalizeDateTimeValue(data.reservationCloseAt),
    reservationOpenAt: normalizeDateTimeValue(data.reservationOpenAt),
    days: defaults.days.map((day) => {
      const existing = sourceDays.find((item) => item.id === day.id) || {};

      return {
        ...day,
        ...existing,
        applicants: Array.isArray(existing.applicants) ? existing.applicants : [],
        capacity,
        isOpen: Boolean(existing.isOpen),
        order: Number.isFinite(existing.order) ? existing.order : day.order,
      };
    }).sort((first, second) => first.order - second.order),
  };
}

function normalizeEvent(post = {}) {
  return {
    ...post,
    id: String(post.id || ""),
    title: String(post.title || "Untitled"),
    category: String(post.category || "Event"),
    fee: String(post.fee || ""),
    thumbnailUrl: String(post.thumbnailUrl || ""),
    eventAt: normalizeDateTimeValue(post.eventAt),
    recruitOpenAt: normalizeDateTimeValue(post.recruitOpenAt),
    recruitCloseAt: normalizeDateTimeValue(post.recruitCloseAt),
    capacity: Number.isFinite(Number(post.capacity)) ? Number(post.capacity) : 0,
    description: String(post.description || ""),
    applicants: Array.isArray(post.applicants) ? post.applicants : [],
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

function isEventRecruiting(eventPost) {
  const now = Date.now();
  const openAt = eventPost.recruitOpenAt ? new Date(eventPost.recruitOpenAt).getTime() : null;
  const closeAt = eventPost.recruitCloseAt ? new Date(eventPost.recruitCloseAt).getTime() : null;

  if (Number.isFinite(openAt) && now < openAt) {
    return false;
  }

  if (Number.isFinite(closeAt) && now >= closeAt) {
    return false;
  }

  return !eventPost.capacity || eventPost.applicants.length < eventPost.capacity;
}

function getEventStatusLabel(eventPost) {
  const now = Date.now();
  const eventAt = eventPost.eventAt ? new Date(eventPost.eventAt).getTime() : null;
  const openAt = eventPost.recruitOpenAt ? new Date(eventPost.recruitOpenAt).getTime() : null;
  const closeAt = eventPost.recruitCloseAt ? new Date(eventPost.recruitCloseAt).getTime() : null;
  const isFull = eventPost.capacity > 0 && eventPost.applicants.length >= eventPost.capacity;

  if (Number.isFinite(eventAt) && now >= eventAt) {
    return "종료";
  }

  if (isFull || (Number.isFinite(closeAt) && now >= closeAt)) {
    return "마감";
  }

  if (Number.isFinite(openAt) && now < openAt) {
    return "모집 전";
  }

  return "모집 중";
}

function sortEventsByRecentDate(posts) {
  return [...posts].sort((first, second) => {
    const firstTime = new Date(first.eventAt || first.createdAt || 0).getTime();
    const secondTime = new Date(second.eventAt || second.createdAt || 0).getTime();

    return secondTime - firstTime;
  });
}

async function isRegisteredMember(name, studentId) {
  const snapshots = await getDocs(query(
    collection(memberContext.db, MEMBERS_COLLECTION),
    where("studentId", "==", studentId),
    where("name", "==", name),
    limit(1),
  ));

  return !snapshots.empty;
}

async function assertRegisteredMember(name, studentId, setFeedback) {
  const normalizedName = String(name || "").trim();
  const normalizedStudentId = String(studentId || "").trim();

  if (!normalizedName || !normalizedStudentId) {
    setFeedback("이름과 학번을 입력해주세요.");
    return null;
  }

  const isRegistered = await isRegisteredMember(normalizedName, normalizedStudentId);

  if (!isRegistered) {
    setFeedback("동아리원만 신청 가능합니다.");
    return null;
  }

  return {
    name: normalizedName,
    studentId: normalizedStudentId,
  };
}

async function loadRemoteData(db) {
  const [scheduleSnapshot, eventSnapshots] = await Promise.all([
    getDoc(doc(db, CLASS_COLLECTION, CLASS_DOC_ID)),
    getDocs(collection(db, EVENT_COLLECTION)),
  ]);

  classSchedule = normalizeSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() : createDefaultSchedule());
  eventPosts = eventSnapshots.docs.map((snapshot) => normalizeEvent({
    id: snapshot.id,
    ...snapshot.data(),
  }));
}

function renderClassOptions() {
  const selectedDayInput = document.querySelector("[data-member-selected-day]");
  const list = document.querySelector("[data-member-class-list]");
  const form = document.querySelector("[data-member-class-form]");
  const submitButton = form?.querySelector('button[type="submit"]');
  const stateText = document.querySelector("[data-member-class-state]");
  const isOpen = getCurrentApplicationOpenState();
  const openDays = classSchedule.days.filter((day) => day.isOpen);

  if (!selectedDayInput || !list) {
    return;
  }

  if (!openDays.some((day) => day.id === selectedClassDayId)) {
    selectedClassDayId = "";
  }

  selectedDayInput.value = selectedClassDayId;
  const hasSelectableDay = isOpen && openDays.some((day) => {
    const isFull = classSchedule.capacity > 0 && day.applicants.length >= classSchedule.capacity;

    return !isFull;
  });

  if (submitButton) {
    submitButton.disabled = !isOpen || !hasSelectableDay || !selectedClassDayId;
  }

  if (stateText) {
    if (classFeedbackMessage) {
      stateText.textContent = classFeedbackMessage;
    } else if (!isOpen) {
      stateText.textContent = "신청이 닫혀있습니다.";
    } else if (!hasSelectableDay) {
      stateText.textContent = "신청 가능한 요일이 없습니다.";
    } else if (!selectedClassDayId) {
      stateText.textContent = "요일을 선택해주세요.";
    } else {
      stateText.textContent = "";
    }
  }

  const visibleDays = classSchedule.days.filter((day) => day.isOpen);

  if (!visibleDays.length) {
    list.innerHTML = "";
    return;
  }

  list.replaceChildren(...visibleDays.map((day) => {
    const item = document.createElement("button");
    const title = document.createElement("strong");
    const state = document.createElement("span");
    const isFull = classSchedule.capacity > 0 && day.applicants.length >= classSchedule.capacity;
    const isSelectable = isOpen && day.isOpen && !isFull;

    item.className = "member-class-day";
    item.type = "button";
    item.classList.toggle("is-open", day.isOpen);
    item.classList.toggle("is-locked", day.isOpen && !isSelectable);
    item.classList.toggle("is-selected", selectedClassDayId === day.id);
    item.disabled = !isSelectable;
    title.textContent = day.label;
    state.textContent = day.isOpen
      ? `${day.applicants.length}/${classSchedule.capacity}`
      : isFull
        ? "Full"
      : "Closed";
    item.append(title, state);
    item.addEventListener("click", () => {
      selectedClassDayId = day.id;
      selectedDayInput.value = day.id;
      renderClassOptions();
    });

    return item;
  }));
}

function createEventCard(eventPost) {
  const card = document.createElement("article");
  const media = document.createElement("div");
  const thumbnail = document.createElement("img");
  const status = document.createElement("span");
  const info = document.createElement("div");
  const category = document.createElement("span");
  const title = document.createElement("h3");
  const meta = document.createElement("p");

  card.className = "member-event-card member-event-card--post";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${eventPost.title} 상세 보기`);
  media.className = "member-event-media";
  thumbnail.src = eventPost.thumbnailUrl || "../assets/images/background.png";
  thumbnail.alt = "";
  status.className = "member-event-status";
  status.textContent = getEventStatusLabel(eventPost);
  info.className = "member-event-card__info";
  category.textContent = eventPost.category;
  title.textContent = eventPost.title;
  meta.textContent = `${formatDateTime(eventPost.eventAt)} · ${eventPost.fee || "참여비 없음"} · ${eventPost.applicants.length}/${eventPost.capacity || "제한 없음"}`;
  info.append(category, title, meta);
  media.append(thumbnail, status);
  card.append(media, info);
  card.addEventListener("click", () => {
    selectedEventId = eventPost.id;
    renderEvents();
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectedEventId = eventPost.id;
      renderEvents();
    }
  });

  return card;
}

function createEventDetail(eventPost) {
  const detail = document.createElement("article");
  const backButton = document.createElement("button");
  const thumbnail = document.createElement("img");
  const category = document.createElement("span");
  const title = document.createElement("h3");
  const meta = document.createElement("p");
  const description = document.createElement("p");
  const form = document.createElement("form");
  const feedback = document.createElement("p");
  const name = document.createElement("input");
  const studentId = document.createElement("input");
  const button = document.createElement("button");

  detail.className = "member-event-detail";
  backButton.type = "button";
  backButton.textContent = "Back";
  backButton.addEventListener("click", () => {
    selectedEventId = null;
    eventFeedbackMessage = "";
    renderEvents();
  });
  thumbnail.src = eventPost.thumbnailUrl || "../assets/images/background.png";
  thumbnail.alt = "";
  category.textContent = eventPost.category;
  title.textContent = eventPost.title;
  meta.textContent = `${formatDateTime(eventPost.eventAt)} · ${eventPost.fee || "참여비 없음"} · ${eventPost.applicants.length}/${eventPost.capacity || "제한 없음"}`;
  description.textContent = eventPost.description;
  form.className = "member-event-apply";
  name.name = "name";
  name.placeholder = "이름";
  name.required = true;
  studentId.name = "studentId";
  studentId.placeholder = "학번";
  studentId.required = true;
  studentId.inputMode = "numeric";
  button.type = "submit";
  button.textContent = isEventRecruiting(eventPost) ? "신청" : "마감";
  button.disabled = !isEventRecruiting(eventPost);
  form.append(name, studentId, button);
  feedback.className = "member-event-state";
  feedback.textContent = eventFeedbackMessage;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await applyEvent(eventPost.id, name.value, studentId.value);
    form.reset();
  });
  detail.append(backButton, thumbnail, category, title, meta, description, form, feedback);

  return detail;
}

function renderEvents() {
  const list = document.querySelector("[data-member-event-list]");

  if (!list) {
    return;
  }

  if (!eventPosts.length) {
    list.innerHTML = '<p class="admin-empty">등록된 이벤트가 없습니다.</p>';
    return;
  }

  const posts = sortEventsByRecentDate(eventPosts);
  const selectedPost = posts.find((post) => post.id === selectedEventId);

  list.classList.toggle("is-detail", Boolean(selectedPost));

  if (selectedPost) {
    list.replaceChildren(createEventDetail(selectedPost));
    return;
  }

  list.replaceChildren(...posts.map(createEventCard));
}

function renderMemberPage() {
  renderClassOptions();
  renderEvents();
}

function createApplicant(name, studentId) {
  return {
    id: `${studentId}-${Date.now()}`,
    name: String(name || "").trim(),
    studentId: String(studentId || "").trim(),
    createdAt: new Date().toISOString(),
  };
}

async function applyClass(form) {
  const formData = new FormData(form);
  const dayId = String(formData.get("dayId") || "");
  const day = classSchedule.days.find((item) => item.id === dayId);
  classFeedbackMessage = "";
  const registeredMember = await assertRegisteredMember(formData.get("name"), formData.get("studentId"), (message) => {
    classFeedbackMessage = message;
    renderClassOptions();
  });

  if (!registeredMember) {
    return;
  }

  const applicant = createApplicant(registeredMember.name, registeredMember.studentId);

  if (!day) {
    classFeedbackMessage = "요일을 선택해주세요.";
    renderClassOptions();
    return;
  }

  if (!getCurrentApplicationOpenState() || !day.isOpen) {
    classFeedbackMessage = "신청 가능한 요일이 아닙니다.";
    renderClassOptions();
    return;
  }

  if (classSchedule.capacity > 0 && day.applicants.length >= classSchedule.capacity) {
    classFeedbackMessage = "정원이 마감되었습니다.";
    renderClassOptions();
    return;
  }

  day.applicants = [
    ...day.applicants.filter((item) => item.studentId !== applicant.studentId),
    applicant,
  ];

  await setDoc(doc(memberContext.db, CLASS_COLLECTION, CLASS_DOC_ID), {
    ...classSchedule,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  form.reset();
  selectedClassDayId = "";
  classFeedbackMessage = "신청이 완료되었습니다.";
  await refreshMemberData();
}

async function applyEvent(eventId, name, studentId) {
  const post = eventPosts.find((item) => item.id === eventId);
  eventFeedbackMessage = "";
  const registeredMember = await assertRegisteredMember(name, studentId, (message) => {
    eventFeedbackMessage = message;
    renderEvents();
  });

  if (!registeredMember) {
    return;
  }

  const applicant = createApplicant(registeredMember.name, registeredMember.studentId);

  if (!isEventRecruiting(post)) {
    eventFeedbackMessage = "신청 가능한 이벤트가 아닙니다.";
    renderEvents();
    return;
  }

  post.applicants = [
    ...post.applicants.filter((item) => item.studentId !== applicant.studentId),
    applicant,
  ];

  await setDoc(doc(memberContext.db, EVENT_COLLECTION, eventId), {
    applicants: post.applicants,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  eventFeedbackMessage = "신청이 완료되었습니다.";
  await refreshMemberData();
}

async function refreshMemberData() {
  if (!memberContext) {
    return;
  }

  await loadRemoteData(memberContext.db);

  renderMemberPage();
}

function bindMemberForms() {
  document.querySelector("[data-member-class-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await applyClass(event.currentTarget);
  });
}

async function initMemberPage() {
  if (!document.querySelector("[data-member-app]")) {
    return;
  }

  bindMemberForms();


  try {
    const { auth, db } = await getFirebaseServices();

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "../index.html";
        return;
      }

      memberContext = { user, db };
      await refreshMemberData();
    });
  } catch {
    window.location.href = "../index.html";
  }
}

document.addEventListener("DOMContentLoaded", initMemberPage);


