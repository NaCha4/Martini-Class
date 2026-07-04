import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { watchAdminAuth } from "../firebase-client.js";
import { createFirebaseErrorFormatter, createStatusSetter, getTimestampMillis } from "../shared/common.js";

const COLLECTION_NAME = "faqEntries";
const LOADING_MESSAGE = "불러오는 중입니다.";
const EMPTY_MESSAGE = "등록된 자주 묻는 질문이 없습니다.";

let faqContext;
let faqEntries = [];

const setStatus = createStatusSetter("[data-faq-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter();

function setControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-faq-form] input, [data-faq-form] textarea, [data-faq-form] button, [data-faq-list] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function setFaqListMessage(message) {
  const list = document.querySelector("[data-faq-list]");

  if (list) {
    list.innerHTML = `<p class="admin-empty">${message}</p>`;
  }
}

function sortFaq(records) {
  return [...records].sort((first, second) => getTimestampMillis(second.createdAt) - getTimestampMillis(first.createdAt));
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
    setFaqListMessage(EMPTY_MESSAGE);
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
    setFaqListMessage(LOADING_MESSAGE);
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
    await watchAdminAuth({
      onDenied: () => {
        faqContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 자주 묻는 질문을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db }) => {
        faqContext = { user, db };
        setControlsEnabled(true);
        await refreshFaq();
      },
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initFaqManagement);
