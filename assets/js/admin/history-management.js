import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices, isAllowedAdminUser } from "../firebase-client.js";

const COLLECTION_NAME = "historyEntries";

let historyContext;
let historyEntries = [];


function setStatus(message, isError = false) {
  const status = document.querySelector("[data-history-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-history-form] input, [data-history-form] textarea, [data-history-form] button, [data-history-list] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function getFirebaseErrorMessage(error, fallback) {
  switch (error?.code) {
    case "permission-denied":
      return "권한이 없습니다. 관리자 로그인 상태와 Firestore Rules 배포 여부를 확인해주세요.";
    case "appCheck/recaptcha-error":
    case "appCheck/fetch-status-error":
    case "auth/firebase-app-check-token-is-invalid":
      return "App Check 확인에 실패했습니다. reCAPTCHA 허용 도메인과 App Check 설정을 확인해주세요.";
    default:
      return error?.message || fallback;
  }
}


function getCreatedAtMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return new Date(value).getTime() || 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return 0;
}

function sortHistory(records) {
  return [...records].sort((first, second) => {
    const yearCompare = String(second.year || "").localeCompare(String(first.year || ""), "ko-KR", { numeric: true });

    if (yearCompare !== 0) {
      return yearCompare;
    }

    return getCreatedAtMillis(second.createdAt) - getCreatedAtMillis(first.createdAt);
  });
}

function normalizeHistoryForm(form) {
  const formData = new FormData(form);
  const year = String(formData.get("year") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!year || !title || !description) {
    throw new Error("연도, 제목, 내용을 모두 입력해주세요.");
  }

  return { year, title, description };
}

function createHistoryRow(entry) {
  const row = document.createElement("article");
  const content = document.createElement("div");
  const year = document.createElement("span");
  const title = document.createElement("strong");
  const description = document.createElement("p");
  const deleteButton = document.createElement("button");

  row.className = "admin-history-row";
  year.textContent = entry.year;
  title.textContent = entry.title;
  description.textContent = entry.description;
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteHistoryEntry(entry));
  content.append(year, title, description);
  row.append(content, deleteButton);

  return row;
}

function renderHistory() {
  const list = document.querySelector("[data-history-list]");

  if (!list) {
    return;
  }

  if (!historyEntries.length) {
    list.innerHTML = '<p class="admin-empty">등록된 연혁이 없습니다.</p>';
    return;
  }

  list.replaceChildren(...sortHistory(historyEntries).map(createHistoryRow));
}


async function loadRemoteHistory(db) {
  const snapshots = await getDocs(collection(db, COLLECTION_NAME));

  historyEntries = snapshots.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  renderHistory();
}

async function refreshHistory() {
  if (!historyContext) {
    return;
  }

  try {
    await loadRemoteHistory(historyContext.db);

    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "연혁 목록을 불러오지 못했습니다."), true);
  }
}

async function saveHistoryEntry(form) {
  const values = normalizeHistoryForm(form);
  const docRef = doc(collection(historyContext.db, COLLECTION_NAME));

  await setDoc(docRef, {
    ...values,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteHistoryEntry(entry) {
  if (!window.confirm(`"${entry.title}" 연혁을 삭제할까요?`)) {
    return;
  }

  try {
    await deleteDoc(doc(historyContext.db, COLLECTION_NAME, entry.id));

    await refreshHistory();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "연혁 삭제에 실패했습니다."), true);
  }
}

function bindHistoryForm() {
  const form = document.querySelector("[data-history-form]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveHistoryEntry(form);
      form.reset();
      await refreshHistory();
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "연혁 저장에 실패했습니다."), true);
    }
  });
}

async function initHistoryManagement() {
  if (!document.querySelector("[data-history-app]")) {
    return;
  }

  bindHistoryForm();
  setControlsEnabled(false);

  try {
    const { auth, db } = await getFirebaseServices();

    onAuthStateChanged(auth, async (user) => {
      if (!isAllowedAdminUser(user)) {
        historyContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 연혁을 관리할 수 있습니다.", true);
        return;
      }

      historyContext = { user, db };
      setControlsEnabled(true);
      await refreshHistory();
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initHistoryManagement);


