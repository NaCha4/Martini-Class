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
import { watchAdminAuth } from "../firebase-client.js?v=security-refactor-20260710";
import { createFirebaseErrorFormatter, createStatusSetter } from "../shared/common.js?v=security-refactor-20260710";

const COLLECTIONS = {
  template: "meetingMinuteTemplates",
  completed: "meetingMinutes",
};

const STORAGE_FOLDERS = {
  template: "meeting-minutes/template",
  completed: "meeting-minutes/completed",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const PERMISSION_MESSAGE = "권한이 없습니다. 관리자 로그인 상태, Firestore Rules, Storage Rules 배포 여부를 확인해주세요.";

let minutesContext;
let isDeleteMode = false;

const setStatus = createStatusSetter("[data-minutes-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter({
  "permission-denied": PERMISSION_MESSAGE,
  "storage/unauthorized": PERMISSION_MESSAGE,
  "failed-precondition": "Firestore 인덱스 또는 쿼리 조건 확인이 필요합니다. Firebase Console의 안내 링크를 확인해주세요.",
  "storage/object-not-found": "Storage에서 파일을 찾을 수 없습니다. Firestore 기록과 Storage 파일이 서로 맞는지 확인해주세요.",
  "storage/quota-exceeded": "Storage 사용량 한도를 초과했습니다.",
});

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

function getFileExtension(fileName) {
  const normalized = normalizeDownloadName(fileName, "");
  const dotIndex = normalized.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(dotIndex).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16);
}

function getAsciiDownloadName(fileName, fallback = "meeting-minutes") {
  const downloadName = normalizeDownloadName(fileName, fallback);
  const extension = getFileExtension(downloadName);
  const baseName = extension ? downloadName.slice(0, -extension.length) : downloadName;
  const asciiBase = baseName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");

  return `${asciiBase || fallback}${extension}`;
}

function encodeContentDispositionFileName(fileName) {
  return encodeURIComponent(normalizeDownloadName(fileName))
    .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function getAttachmentDisposition(fileName) {
  const downloadName = normalizeDownloadName(fileName);
  const asciiName = getAsciiDownloadName(downloadName).replace(/["\\]/g, "_");

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeContentDispositionFileName(downloadName)}`;
}

function getAttachmentDownloadUrl(url, fileName) {
  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}response-content-disposition=${encodeURIComponent(getAttachmentDisposition(fileName))}`;
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

async function downloadWithOriginalName(url, fileName) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    triggerDownload(objectUrl, fileName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
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

function createFileRow(data, downloadUrl, onDelete) {
  const row = document.createElement(downloadUrl ? "a" : "button");
  const info = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  const downloadName = normalizeDownloadName(data.originalName || data.title);

  row.className = "admin-file-row";
  row.setAttribute("aria-label", `${data.title || data.originalName || "파일"} ${isDeleteMode ? "삭제" : "다운로드"}`);

  if (downloadUrl) {
    row.href = downloadUrl;
    row.download = downloadName;
    row.rel = "noopener";
  } else {
    row.type = "button";
  }

  title.textContent = data.title || data.originalName || "Untitled";
  meta.textContent = [
    data.originalName,
    formatBytes(data.size),
  ].filter(Boolean).join(" · ");

  row.addEventListener("click", async (event) => {
    if (isDeleteMode) {
      event.preventDefault();
      onDelete();
      return;
    }

    if (!downloadUrl) {
      setStatus("다운로드 URL을 만들 수 없습니다. 파일을 다시 업로드해주세요.", true);
      return;
    }

    event.preventDefault();
    setStatus("다운로드를 준비 중입니다.");

    try {
      await downloadWithOriginalName(downloadUrl, downloadName);
      setStatus("");
    } catch (error) {
      console.warn("Meeting minutes named download failed; using direct URL fallback.", error);
      setStatus("기본 다운로드로 전환합니다.");
      window.location.href = downloadUrl;
      window.setTimeout(() => setStatus(""), 1200);
    }
  });

  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      if (isDeleteMode) {
        event.preventDefault();
        onDelete();
      }
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

async function getStorageDownloadUrl(storage, storagePath, originalName) {
  if (!storagePath) {
    throw new Error("다운로드할 Storage 경로가 없습니다.");
  }

  const downloadName = normalizeDownloadName(originalName);
  const storageRef = ref(storage, storagePath);
  const url = await getDownloadURL(storageRef);

  return getAttachmentDownloadUrl(url, downloadName);
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

async function renderList(type, docs, storage) {
  const list = document.querySelector(`[data-minutes-list="${type}"]`);

  if (!list) {
    return;
  }

  if (!docs.length) {
    list.innerHTML = '<p class="admin-empty">업로드된 파일이 없습니다.</p>';
    return;
  }

  const rows = await Promise.all(
    docs.map(async (snapshot) => {
      const data = snapshot.data();
      let downloadUrl = "";

      try {
        downloadUrl = await getStorageDownloadUrl(storage, data.storagePath, data.originalName);
      } catch (error) {
        console.warn("Meeting minutes download URL creation failed.", error);
      }

      return createFileRow(
        data,
        downloadUrl,
        () => {
          deleteRemoteMinutes(type, snapshot.id, data);
        }
      );
    })
  );

  list.replaceChildren(...rows);
}

async function loadMinutes(type, db, storage) {
  const list = document.querySelector(`[data-minutes-list="${type}"]`);

  if (list) {
    list.innerHTML = '<p class="admin-empty">불러오는 중입니다.</p>';
  }

  const minutesQuery = query(collection(db, COLLECTIONS[type]), orderBy("createdAt", "desc"));
  const snapshots = await getDocs(minutesQuery);

  await renderList(type, snapshots.docs, storage);
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
    setMinutesFormsEnabled(false);
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
    contentDisposition: getAttachmentDisposition(originalName),
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
    await watchAdminAuth({
      onDenied: () => {
        minutesContext = null;
        setMinutesFormsEnabled(false);
        setStatus("관리자 로그인 후 회의록을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db, storage }) => {
        minutesContext = { user, db, storage };
        await bindMinutesForms(user, db, storage);
        setMinutesFormsEnabled(true);
        await refreshMinutes();
      },
    });
  } catch (error) {
    setMinutesFormsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initMeetingMinutes);
