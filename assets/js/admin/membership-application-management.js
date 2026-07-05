import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { watchAdminAuth } from "../firebase-client.js";
import { createFirebaseErrorFormatter, createStatusSetter, formatDateTime } from "../shared/common.js";

const APPLICATION_COLLECTION = "membershipApplications";
const MEMBER_COLLECTION = "members";

let applicationContext;
let applications = [];

const setStatus = createStatusSetter("[data-applications-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter();

function normalizeApplication(application = {}) {
  return {
    ...application,
    id: String(application.id || ""),
    name: String(application.name || "").trim(),
    studentId: String(application.studentId || "").trim(),
    department: String(application.department || "").trim(),
    contact: String(application.contact || "").trim(),
    email: String(application.email || "").trim(),
    motivation: String(application.motivation || "").trim(),
    note: String(application.note || "").trim(),
    status: String(application.status || "pending").trim(),
  };
}

function getStatusLabel(status) {
  switch (status) {
    case "approved":
      return "승인";
    case "rejected":
      return "반려";
    default:
      return "검토 대기";
  }
}

function createInfoLine(label, value) {
  const line = document.createElement("p");

  line.textContent = `${label}: ${value || "-"}`;
  return line;
}

function createApplicationCard(application) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const titleBox = document.createElement("div");
  const status = document.createElement("span");
  const title = document.createElement("h3");
  const meta = document.createElement("p");
  const body = document.createElement("div");
  const actions = document.createElement("div");
  const approveButton = document.createElement("button");
  const rejectButton = document.createElement("button");
  const deleteButton = document.createElement("button");

  card.className = "admin-application-card";
  header.className = "admin-application-card__header";
  status.className = "admin-event-category";
  status.textContent = getStatusLabel(application.status);
  title.textContent = application.name || "이름 없음";
  meta.textContent = [application.studentId, application.department, formatDateTime(application.createdAt)].filter(Boolean).join(" · ");
  body.className = "admin-application-card__body";
  body.append(
    createInfoLine("연락처", application.contact),
    createInfoLine("이메일", application.email),
    createInfoLine("지원 동기", application.motivation),
    createInfoLine("기타", application.note),
  );
  actions.className = "admin-event-card__actions";
  approveButton.type = "button";
  approveButton.textContent = "Approve";
  approveButton.disabled = application.status === "approved";
  approveButton.addEventListener("click", () => approveApplication(application));
  rejectButton.type = "button";
  rejectButton.textContent = "Reject";
  rejectButton.disabled = application.status === "rejected";
  rejectButton.addEventListener("click", () => updateApplicationStatus(application, "rejected"));
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteApplication(application));

  titleBox.append(status, title, meta);
  actions.append(approveButton, rejectButton, deleteButton);
  header.append(titleBox, actions);
  card.append(header, body);

  return card;
}

function renderApplications() {
  const list = document.querySelector("[data-applications-list]");

  if (!list) {
    return;
  }

  if (!applications.length) {
    list.innerHTML = '<p class="admin-empty">가입 신청이 없습니다.</p>';
    return;
  }

  list.replaceChildren(...applications.map(createApplicationCard));
}

async function loadApplications(db) {
  const snapshots = await getDocs(query(
    collection(db, APPLICATION_COLLECTION),
    orderBy("createdAt", "desc"),
  ));

  applications = snapshots.docs.map((snapshot) => normalizeApplication({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  renderApplications();
}

async function refreshApplications() {
  if (!applicationContext) {
    return;
  }

  try {
    await loadApplications(applicationContext.db);
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "가입 신청 목록을 불러오지 못했습니다."), true);
  }
}

async function findExistingMember(studentId) {
  const snapshots = await getDocs(query(
    collection(applicationContext.db, MEMBER_COLLECTION),
    where("studentId", "==", studentId),
    limit(1),
  ));

  return snapshots.empty ? null : snapshots.docs[0];
}

async function approveApplication(application) {
  if (!window.confirm(`${application.name || "신청자"} 신청을 승인할까요?`)) {
    return;
  }

  try {
    const existingMember = await findExistingMember(application.studentId);
    const memberRef = existingMember
      ? doc(applicationContext.db, MEMBER_COLLECTION, existingMember.id)
      : doc(collection(applicationContext.db, MEMBER_COLLECTION));

    await setDoc(memberRef, {
      name: application.name,
      studentId: application.studentId,
      department: application.department,
      enrollmentStatus: "재학",
      sourceApplicationId: application.id,
      updatedAt: serverTimestamp(),
      ...(existingMember ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });

    await updateApplicationStatus(application, "approved", false);
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "가입 신청 승인에 실패했습니다."), true);
  }
}

async function updateApplicationStatus(application, status, shouldConfirm = true) {
  if (shouldConfirm && !window.confirm(`${application.name || "신청자"} 신청을 ${getStatusLabel(status)} 처리할까요?`)) {
    return;
  }

  try {
    await setDoc(doc(applicationContext.db, APPLICATION_COLLECTION, application.id), {
      status,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await refreshApplications();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "가입 신청 상태 변경에 실패했습니다."), true);
  }
}

async function deleteApplication(application) {
  if (!window.confirm(`${application.name || "신청자"} 신청서를 삭제할까요?`)) {
    return;
  }

  try {
    await deleteDoc(doc(applicationContext.db, APPLICATION_COLLECTION, application.id));
    await refreshApplications();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "가입 신청 삭제에 실패했습니다."), true);
  }
}

async function initMembershipApplicationManagement() {
  if (!document.querySelector("[data-applications-app]")) {
    return;
  }

  try {
    await watchAdminAuth({
      onDenied: () => {
        applicationContext = null;
        setStatus("관리자 로그인 후 가입 신청을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db }) => {
        applicationContext = { user, db };
        await refreshApplications();
      },
    });
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initMembershipApplicationManagement);
