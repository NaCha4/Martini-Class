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

const COLLECTION_NAME = "faqEntries";

let faqContext;
let faqEntries = [];


function setStatus(message, isError = false) {
  const status = document.querySelector("[data-faq-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-faq-form] input, [data-faq-form] textarea, [data-faq-form] button, [data-faq-list] button").forEach((field) => {
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

function sortFaq(records) {
  return [...records].sort((first, second) => getCreatedAtMillis(second.createdAt) - getCreatedAtMillis(first.createdAt));
}

function normalizeFaqForm(form) {
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!title || !description) {
    throw new Error("제목과 내용을 모두 입력해주세요.");
  }

  return { title, description };
}

function createFaqRow(entry) {
  const row = document.createElement("article");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  const description = document.createElement("p");
  const deleteButton = document.createElement("button");

  row.className = "admin-history-row";
  title.textContent = entry.title;
  description.textContent = entry.description;
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteFaqEntry(entry));
  content.append(title, description);
  row.append(content, deleteButton);

  return row;
}

function renderFaq() {
  const list = document.querySelector("[data-faq-list]");

  if (!list) {
    return;
  }

  if (!faqEntries.length) {
    list.innerHTML = '<p class="admin-empty">등록된 자주 묻는 질문이 없습니다.</p>';
    return;
  }

  list.replaceChildren(...sortFaq(faqEntries).map(createFaqRow));
}


async function loadRemoteFaq(db) {
  const snapshots = await getDocs(collection(db, COLLECTION_NAME));

  faqEntries = snapshots.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  renderFaq();
}

async function refreshFaq() {
  if (!faqContext) {
    return;
  }

  try {
    await loadRemoteFaq(faqContext.db);

    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "자주 묻는 질문 목록을 불러오지 못했습니다."), true);
  }
}

async function saveFaqEntry(form) {
  const values = normalizeFaqForm(form);
  const docRef = doc(collection(faqContext.db, COLLECTION_NAME));

  await setDoc(docRef, {
    ...values,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteFaqEntry(entry) {
  if (!window.confirm(`"${entry.title}" 질문을 삭제할까요?`)) {
    return;
  }

  try {
    await deleteDoc(doc(faqContext.db, COLLECTION_NAME, entry.id));

    await refreshFaq();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "자주 묻는 질문 삭제에 실패했습니다."), true);
  }
}

function bindFaqForm() {
  const form = document.querySelector("[data-faq-form]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveFaqEntry(form);
      form.reset();
      await refreshFaq();
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "자주 묻는 질문 저장에 실패했습니다."), true);
    }
  });
}

async function initFaqManagement() {
  if (!document.querySelector("[data-faq-app]")) {
    return;
  }

  bindFaqForm();
  setControlsEnabled(false);

  try {
    const { auth, db } = await getFirebaseServices();

    onAuthStateChanged(auth, async (user) => {
      if (!isAllowedAdminUser(user)) {
        faqContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 자주 묻는 질문을 관리할 수 있습니다.", true);
        return;
      }

      faqContext = { user, db };
      setControlsEnabled(true);
      await refreshFaq();
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initFaqManagement);


