import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { getFirebaseServices, isAllowedAdminUser } from "../firebase-client.js";

const COLLECTIONS = {
  template: "meetingMinuteTemplates",
  completed: "meetingMinutes",
};

const STORAGE_FOLDERS = {
  template: "meeting-minutes/template",
  completed: "meeting-minutes/completed",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
let minutesContext;
let isDeleteMode = false;

function getFirebaseErrorMessage(error, fallback) {
  switch (error?.code) {
    case "permission-denied":
    case "storage/unauthorized":
      return "권한이 없습니다. 관리자 로그인 상태, Firestore Rules, Storage Rules 배포 여부를 확인해주세요.";
    case "failed-precondition":
      return "Firestore 인덱스 또는 쿼리 조건 확인이 필요합니다. Firebase Console의 안내 링크를 확인해주세요.";
    case "appCheck/recaptcha-error":
    case "appCheck/fetch-status-error":
    case "auth/firebase-app-check-token-is-invalid":
      return "App Check 확인에 실패했습니다. reCAPTCHA 허용 도메인과 App Check 설정을 확인해주세요.";
    case "storage/object-not-found":
      return "Storage에서 파일을 찾을 수 없습니다. Firestore 기록과 Storage 파일이 서로 맞는지 확인해주세요.";
    case "storage/quota-exceeded":
      return "Storage 사용량 한도를 초과했습니다.";
    default:
      return error?.message || fallback;
  }
}

function setStatus(message, isError = false) {
  const status = document.querySelector("[data-minutes-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function safeFileName(fileName) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "meeting-minutes";
}

function normalizeDownloadName(fileName, fallback = "meeting-minutes") {
  const normalized = String(fileName || "").trim().normalize("NFC");

  return normalized || fallback;
}

function getAttachmentDownloadUrl(url, fileName) {
  const downloadName = normalizeDownloadName(fileName);
  const safeAsciiName = downloadName.replace(/["\\]/g, "_");
  const disposition = `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}response-content-disposition=${encodeURIComponent(disposition)}`;
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");

  link.href = url;
  link.download = normalizeDownloadName(fileName);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function validateFile(file) {
  if (!file) {
    throw new Error("업로드할 파일을 선택해주세요.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("20MB 이하 파일만 업로드할 수 있습니다.");
  }
}

function setDeleteMode(isEnabled) {
  isDeleteMode = isEnabled;
  document.body.classList.toggle("is-minutes-delete-mode", isEnabled);

  const button = document.querySelector("[data-minutes-manage]");

  if (button) {
    button.classList.toggle("is-active", isEnabled);
    button.setAttribute("aria-pressed", String(isEnabled));
    button.textContent = isEnabled ? "완료" : "관리";
  }

  setStatus(isEnabled ? "삭제할 파일을 선택해주세요." : "");
}

function createFileRow(data, onDownload, onDelete) {
  const row = document.createElement("article");
  const info = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("span");

  row.className = "admin-file-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${data.title || data.originalName || "파일"} ${isDeleteMode ? "삭제" : "다운로드"}`);
  title.textContent = data.title || data.originalName || "Untitled";
  meta.textContent = [
    data.originalName,
    formatBytes(data.size),
  ].filter(Boolean).join(" · ");
  row.addEventListener("click", () => {
    if (isDeleteMode) {
      onDelete();
      return;
    }

    onDownload();
  });
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (isDeleteMode) {
        onDelete();
        return;
      }

      onDownload();
    }
  });

  info.append(title, meta);
  row.append(info);

  return row;
}

function setMinutesFormsEnabled(isEnabled) {
  document.querySelectorAll("[data-minutes-form] input, [data-minutes-form] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function setUploadFormsEnabled(isEnabled) {
  document.querySelectorAll("[data-minutes-form] input, [data-minutes-form] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function updateFilePicker(input) {
  const fileName = input.closest(".admin-upload-field")?.querySelector("[data-file-name]");

  if (!fileName) {
    return;
  }

  fileName.textContent = input.files?.[0]?.name || "선택된 파일 없음";
}

function resetFilePickers(form) {
  form.querySelectorAll('input[type="file"]').forEach(updateFilePicker);
}

function bindFilePickers() {
  document.querySelectorAll(".admin-file-input").forEach((input) => {
    if (input.dataset.bound === "true") {
      return;
    }

    input.dataset.bound = "true";
    updateFilePicker(input);
    input.addEventListener("change", () => updateFilePicker(input));
  });
}

async function downloadStorageFile(storage, storagePath, originalName) {
  if (!storagePath) {
    throw new Error("다운로드할 Storage 경로가 없습니다.");
  }

  const downloadName = normalizeDownloadName(originalName);
  const url = await getDownloadURL(ref(storage, storagePath));
  const attachmentUrl = getAttachmentDownloadUrl(url, downloadName);

  try {
    const response = await fetch(attachmentUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      triggerDownload(objectUrl, downloadName);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  } catch (error) {
    console.warn("Meeting minutes blob download failed; using attachment URL fallback.", error);
    triggerDownload(attachmentUrl, downloadName);
  }
}

async function deleteStorageFile(storage, storagePath) {
  if (!storagePath) {
    return;
  }

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }
}

async function deleteRemoteMinutes(type, id, data) {
  if (!window.confirm(`"${data.title || data.originalName || "파일"}" 파일을 삭제할까요?`)) {
    return;
  }

  const { db, storage } = minutesContext;

  setStatus("삭제 중입니다.");

  try {
    await deleteStorageFile(storage, data.storagePath);
    await deleteDoc(doc(db, COLLECTIONS[type], id));
    await refreshMinutes();
    setStatus("삭제가 완료되었습니다.");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "삭제에 실패했습니다."), true);
  }
}

function renderList(type, docs, storage) {
  const list = document.querySelector(`[data-minutes-list="${type}"]`);

  if (!list) {
    return;
  }

  if (!docs.length) {
    list.innerHTML = '<p class="admin-empty">업로드된 파일이 없습니다.</p>';
    return;
  }

  list.replaceChildren(
    ...docs.map((snapshot) => {
      const data = snapshot.data();

      return createFileRow(
        data,
        () => {
          downloadStorageFile(storage, data.storagePath, data.originalName).catch((error) => {
            setStatus(getFirebaseErrorMessage(error, "다운로드에 실패했습니다."), true);
          });
        },
        () => {
          deleteRemoteMinutes(type, snapshot.id, data);
        }
      );
    })
  );
}

async function loadMinutes(type, db, storage) {
  const list = document.querySelector(`[data-minutes-list="${type}"]`);

  if (list) {
    list.innerHTML = '<p class="admin-empty">불러오는 중입니다.</p>';
  }

  const minutesQuery = query(collection(db, COLLECTIONS[type]), orderBy("createdAt", "desc"));
  const snapshots = await getDocs(minutesQuery);

  renderList(type, snapshots.docs, storage);
}

async function refreshMinutes() {
  if (!minutesContext) {
    return;
  }

  const { db, storage } = minutesContext;

  setStatus("회의록 정보를 불러오는 중입니다.");

  try {
    await Promise.all([
      loadMinutes("template", db, storage),
      loadMinutes("completed", db, storage),
    ]);
    setStatus("");
  } catch (error) {
    setUploadFormsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "회의록 정보를 불러오지 못했습니다."), true);
  }
}

async function uploadMinutes(type, form, user, db, storage) {
  const formData = new FormData(form);
  const file = formData.get("file");
  const title = String(formData.get("title") || "").trim();

  validateFile(file);

  if (!title) {
    throw new Error("제목을 입력해주세요.");
  }

  const docRef = doc(collection(db, COLLECTIONS[type]));
  const originalName = normalizeDownloadName(file.name);
  const storedName = `${docRef.id}-${safeFileName(file.name)}`;
  const storagePath = `${STORAGE_FOLDERS[type]}/${storedName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: {
      originalName,
      type,
    },
  });

  await setDoc(docRef, {
    title,
    type,
    originalName,
    storedName,
    storagePath,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdBy: user.email,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function bindMinutesForms(user, db, storage) {
  const forms = document.querySelectorAll("[data-minutes-form]");

  forms.forEach((form) => {
    if (form.dataset.bound === "true") {
      return;
    }

    form.dataset.bound = "true";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const type = form.dataset.minutesForm;
      const submitButton = form.querySelector('button[type="submit"]');

      submitButton.disabled = true;
      setStatus("업로드 중입니다.");

      try {
        await uploadMinutes(type, form, user, db, storage);

        form.reset();
        resetFilePickers(form);
        await refreshMinutes();
        setStatus("업로드가 완료되었습니다.");
      } catch (error) {
        setStatus(getFirebaseErrorMessage(error, "업로드에 실패했습니다."), true);
      } finally {
        submitButton.disabled = false;
      }
    });
  });
}

async function initMeetingMinutes() {
  if (!document.querySelector("[data-minutes-app]")) {
    return;
  }

  bindFilePickers();
  document.querySelector("[data-minutes-manage]")?.addEventListener("click", () => {
    setDeleteMode(!isDeleteMode);
  });
  setMinutesFormsEnabled(false);


  try {
    const { auth, db, storage } = await getFirebaseServices();

    onAuthStateChanged(auth, async (user) => {
      if (!isAllowedAdminUser(user)) {
        minutesContext = null;
        setMinutesFormsEnabled(false);
        setStatus("관리자 로그인 후 회의록을 관리할 수 있습니다.", true);
        return;
      }

      minutesContext = { user, db, storage };
      await bindMinutesForms(user, db, storage);
      setMinutesFormsEnabled(true);
      await refreshMinutes();
    });
  } catch (error) {
    setMinutesFormsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initMeetingMinutes);



