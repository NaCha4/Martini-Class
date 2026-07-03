import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { hashAccessCode, watchAdminAuth } from "../firebase-client.js";
import { createFirebaseErrorFormatter, createStatusSetter } from "../shared/common.js";

const CODE_COLLECTION = "memberAccessCodes";

let settingsContext;
let currentCodePrefix = "";

const setStatus = createStatusSetter("[data-settings-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter();

function setControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-member-code-form] input, [data-member-code-form] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function renderCurrentCode() {
  const currentCode = document.querySelector("[data-current-member-code]");

  if (!currentCode) {
    return;
  }

  currentCode.textContent = currentCodePrefix
    ? `${currentCodePrefix}*** 코드가 활성화 되어있습니다.`
    : "";
}

async function refreshCodes() {
  if (!settingsContext) {
    return;
  }

  const snapshots = await getDocs(collection(settingsContext.db, CODE_COLLECTION));
  const activeCode = snapshots.docs
    .map((snapshot) => snapshot.data())
    .find((record) => record.enabled === true);

  currentCodePrefix = activeCode?.codePrefix || "";
  renderCurrentCode();
  setStatus("");
}

async function saveAccessCode(form) {
  const formData = new FormData(form);
  const accessCode = String(formData.get("accessCode") || "").trim();

  if (!accessCode) {
    throw new Error("코드를 입력해주세요.");
  }

  const codeHash = await hashAccessCode(accessCode);
  const codePrefix = accessCode.slice(0, 1);

  const snapshots = await getDocs(collection(settingsContext.db, CODE_COLLECTION));
  const deleteJobs = snapshots.docs
    .filter((snapshot) => snapshot.id !== codeHash)
    .map((snapshot) => deleteDoc(doc(settingsContext.db, CODE_COLLECTION, snapshot.id)));

  await Promise.all(deleteJobs);
  await setDoc(doc(settingsContext.db, CODE_COLLECTION, codeHash), {
    enabled: true,
    codePrefix,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function bindSettingsForm() {
  const form = document.querySelector("[data-member-code-form]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveAccessCode(form);
      form.reset();
      await refreshCodes();
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "코드 저장에 실패했습니다."), true);
    }
  });
}

async function initSettingsManagement() {
  if (!document.querySelector("[data-settings-app]")) {
    return;
  }

  bindSettingsForm();
  setControlsEnabled(false);

  try {
    await watchAdminAuth({
      onDenied: () => {
        settingsContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 설정을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db }) => {
        settingsContext = { user, db };
        setControlsEnabled(true);
        await refreshCodes();
      },
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initSettingsManagement);
