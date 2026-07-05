import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { watchAdminAuth } from "../firebase-client.js";
import {
  createFirebaseErrorFormatter,
  createStatusSetter,
  formatDateTime,
  fromDateTimeLocalValue,
  normalizeDateTimeValue,
  toDateTimeLocalValue,
} from "../shared/common.js";

const COLLECTION_NAME = "eventPosts";
const APPLICATION_COLLECTION = "eventApplications";
const STORAGE_FOLDER = "event-thumbnails";
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;

const PERMISSION_MESSAGE = "권한이 없습니다. 관리자 로그인 상태와 Firebase Rules 배포 여부를 확인해주세요.";

let eventContext;
let eventPosts = [];

const setStatus = createStatusSetter("[data-events-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter({
  "permission-denied": PERMISSION_MESSAGE,
  "storage/unauthorized": PERMISSION_MESSAGE,
  "storage/quota-exceeded": "Storage 사용량 한도를 초과했습니다.",
  "storage/object-not-found": "Storage에서 썸네일 파일을 찾을 수 없습니다.",
});

function normalizePost(post = {}) {
  return {
    ...post,
    thumbnailUrl: String(post.thumbnailUrl || "").trim(),
    thumbnailPath: String(post.thumbnailPath || "").trim(),
    title: String(post.title || "").trim(),
    category: String(post.category || "").trim(),
    fee: String(post.fee || "").trim(),
    eventAt: normalizeDateTimeValue(post.eventAt),
    recruitOpenAt: normalizeDateTimeValue(post.recruitOpenAt),
    recruitCloseAt: normalizeDateTimeValue(post.recruitCloseAt),
    capacity: Number.isFinite(Number(post.capacity)) ? Number(post.capacity) : 0,
    description: String(post.description || "").trim(),
    applicants: Array.isArray(post.applicants) ? post.applicants : [],
    createdAt: normalizeDateTimeValue(post.createdAt),
    updatedAt: normalizeDateTimeValue(post.updatedAt),
  };
}

function normalizeEventApplication(application = {}) {
  const studentId = String(application.studentId || "").trim();
  const applicationId = String(application.applicationId || `${application.eventId || ""}_${studentId}`).trim();

  return {
    id: applicationId || studentId,
    applicationId,
    eventId: String(application.eventId || "").trim(),
    eventTitle: String(application.eventTitle || "").trim(),
    name: String(application.name || "").trim(),
    studentId,
    createdAt: application.createdAt || "",
    source: "applicationDoc",
  };
}

function normalizeLegacyApplicant(applicant = {}) {
  const studentId = String(applicant.studentId || "").trim();

  return {
    id: String(applicant.id || studentId || crypto.randomUUID?.() || Date.now()),
    name: String(applicant.name || "").trim(),
    studentId,
    createdAt: applicant.createdAt || "",
    source: "eventPost",
  };
}

function getApplicantKey(applicant) {
  return applicant.studentId || applicant.applicationId || applicant.id;
}

function mergeApplicants(...applicantGroups) {
  const applicants = new Map();

  applicantGroups.flat().forEach((applicant) => {
    const key = getApplicantKey(applicant);

    if (key) {
      applicants.set(key, applicant);
    }
  });

  return Array.from(applicants.values());
}

function getFormValues(form) {
  const formData = new FormData(form);
  const values = normalizePost({
    title: formData.get("title"),
    category: formData.get("category"),
    fee: formData.get("fee"),
    eventAt: fromDateTimeLocalValue(formData.get("eventAt")),
    recruitOpenAt: fromDateTimeLocalValue(formData.get("recruitOpenAt")),
    recruitCloseAt: fromDateTimeLocalValue(formData.get("recruitCloseAt")),
    capacity: formData.get("capacity"),
    description: formData.get("description"),
  });

  if (!values.title || !values.category || !values.eventAt || !values.recruitOpenAt || !values.recruitCloseAt || !values.description) {
    throw new Error("필수 항목을 입력해주세요.");
  }

  if (values.capacity < 0) {
    throw new Error("모집 인원은 0 이상이어야 합니다.");
  }

  return values;
}

function getThumbnailFile(form) {
  const file = form.elements.thumbnailFile?.files?.[0];

  if (!file) {
    return null;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("썸네일은 이미지 파일만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_THUMBNAIL_SIZE) {
    throw new Error("썸네일은 5MB 이하로 업로드해주세요.");
  }

  return file;
}

function getSafeFileName(file) {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "image";
  const safeExtension = String(extension || "image").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "image";

  return `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${safeExtension}`;
}

async function uploadThumbnail(storage, postId, file) {
  const storagePath = `${STORAGE_FOLDER}/${postId}/${getSafeFileName(file)}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });

  return {
    thumbnailPath: storagePath,
    thumbnailUrl: await getDownloadURL(storageRef),
  };
}

async function deleteThumbnail(storage, storagePath) {
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

function sortPosts(posts) {
  return [...posts].sort((first, second) => {
    const firstTime = new Date(first.createdAt || first.eventAt || 0).getTime();
    const secondTime = new Date(second.createdAt || second.eventAt || 0).getTime();

    return secondTime - firstTime;
  });
}

function showEventView(viewName) {
  document.querySelectorAll("[data-events-view]").forEach((view) => {
    view.hidden = view.dataset.eventsView !== viewName;
  });
}

function resetEventForm() {
  const form = document.querySelector("[data-event-form]");

  if (!form) {
    return;
  }

  form.reset();
  form.elements.eventId.value = "";
  const thumbnailName = document.querySelector("[data-event-thumbnail-name]");

  if (thumbnailName) {
    thumbnailName.textContent = "선택된 파일 없음";
  }

  document.querySelector("[data-events-submit]").textContent = "Upload";
}

function openEventEditor(post) {
  const form = document.querySelector("[data-event-form]");

  if (!form) {
    return;
  }

  resetEventForm();

  if (post) {
    form.elements.eventId.value = post.id;
    form.elements.title.value = post.title || "";
    form.elements.category.value = post.category || "";
    form.elements.fee.value = post.fee || "";
    form.elements.eventAt.value = toDateTimeLocalValue(post.eventAt);
    form.elements.recruitOpenAt.value = toDateTimeLocalValue(post.recruitOpenAt);
    form.elements.recruitCloseAt.value = toDateTimeLocalValue(post.recruitCloseAt);
    form.elements.capacity.value = post.capacity ?? 0;
    form.elements.description.value = post.description || "";
    const thumbnailName = document.querySelector("[data-event-thumbnail-name]");

    if (thumbnailName) {
      thumbnailName.textContent = post.thumbnailUrl ? "현재 썸네일 유지" : "선택된 파일 없음";
    }

    document.querySelector("[data-events-submit]").textContent = "Update";
  }

  showEventView("editor");
  form.elements.title.focus();
}

function setControlsEnabled(isEnabled) {
  document.querySelectorAll("[data-events-write], [data-event-form] input, [data-event-form] textarea, [data-event-form] button").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function createMetaItem(label, value) {
  const item = document.createElement("span");
  item.textContent = `${label} ${value}`;

  return item;
}

function createApplicantRow(post, applicant) {
  const row = document.createElement("div");
  const identity = document.createElement("span");
  const deleteButton = document.createElement("button");

  row.className = "admin-event-applicant";
  identity.textContent = [applicant.name, applicant.studentId].filter(Boolean).join(" · ") || "이름 없음";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteApplicant(post, applicant));
  row.append(identity, deleteButton);

  return row;
}

function createEventCard(post) {
  const card = document.createElement("article");
  const head = document.createElement("div");
  const titleBox = document.createElement("div");
  const category = document.createElement("span");
  const title = document.createElement("h2");
  const actions = document.createElement("div");
  const editButton = document.createElement("button");
  const deleteButton = document.createElement("button");
  const body = document.createElement("div");
  const meta = document.createElement("div");
  const applicants = document.createElement("section");
  const applicantTitle = document.createElement("h3");
  const applicantList = document.createElement("div");

  card.className = "admin-event-card";
  head.className = "admin-event-card__head";
  category.className = "admin-event-category";
  category.textContent = post.category || "Event";
  title.textContent = post.title || "Untitled";
  actions.className = "admin-event-card__actions";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openEventEditor(post));
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deletePost(post));
  body.className = "admin-event-card__body";
  meta.className = "admin-event-card__meta";
  meta.append(
    createMetaItem("진행", formatDateTime(post.eventAt)),
    createMetaItem("모집", `${formatDateTime(post.recruitOpenAt)} - ${formatDateTime(post.recruitCloseAt)}`),
    createMetaItem("인원", `${post.applicants.length}/${post.capacity || 0}`),
    createMetaItem("참여비", post.fee || "-"),
  );
  applicants.className = "admin-event-applicants";
  applicantTitle.textContent = "Applicants";
  applicantList.className = "admin-event-applicant-list";

  if (post.applicants.length) {
    applicantList.replaceChildren(...post.applicants.map((applicant) => createApplicantRow(post, applicant)));
  } else {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = "신청자가 없습니다.";
    applicantList.append(empty);
  }

  titleBox.append(category, title);
  actions.append(editButton, deleteButton);
  head.append(titleBox, actions);
  applicants.append(applicantTitle, applicantList);
  body.append(meta);
  card.append(head, body, applicants);

  if (post.thumbnailUrl) {
    const thumbnail = document.createElement("img");
    thumbnail.className = "admin-event-thumbnail";
    thumbnail.src = post.thumbnailUrl;
    thumbnail.alt = "";
    card.prepend(thumbnail);
  }

  return card;
}

function renderPosts() {
  const list = document.querySelector("[data-events-list]");

  if (!list) {
    return;
  }

  if (!eventPosts.length) {
    list.innerHTML = '<p class="admin-empty">작성된 글이 없습니다.</p>';
    return;
  }

  list.replaceChildren(...sortPosts(eventPosts).map(createEventCard));
}

async function loadRemotePosts(db) {
  const eventQuery = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
  const [snapshots, applicationSnapshots] = await Promise.all([
    getDocs(eventQuery),
    getDocs(collection(db, APPLICATION_COLLECTION)),
  ]);
  const applications = applicationSnapshots.docs.map((applicationSnapshot) => normalizeEventApplication({
    applicationId: applicationSnapshot.id,
    ...applicationSnapshot.data(),
  }));

  eventPosts = snapshots.docs.map((snapshot) => {
    const post = normalizePost({
      id: snapshot.id,
      ...snapshot.data(),
    });

    return {
      ...post,
      applicants: mergeApplicants(
        post.applicants.map(normalizeLegacyApplicant),
        applications.filter((application) => application.eventId === post.id),
      ),
    };
  });
  renderPosts();
}

async function refreshPosts() {
  if (!eventContext) {
    return;
  }

  try {
    await loadRemotePosts(eventContext.db);
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "이벤트 목록을 불러오지 못했습니다."), true);
  }
}

async function saveRemotePost(form, values, thumbnailFile) {
  const id = form.elements.eventId.value;
  const previous = eventPosts.find((post) => post.id === id);
  const docRef = id ? doc(eventContext.db, COLLECTION_NAME, id) : doc(collection(eventContext.db, COLLECTION_NAME));
  const thumbnail = thumbnailFile
    ? await uploadThumbnail(eventContext.storage, docRef.id, thumbnailFile)
    : {
      thumbnailPath: previous?.thumbnailPath || "",
      thumbnailUrl: previous?.thumbnailUrl || "",
    };
  const nowFields = {
    ...values,
    ...thumbnail,
    applicants: (previous?.applicants || [])
      .filter((applicant) => applicant.source === "eventPost")
      .map((applicant) => ({
        id: applicant.id,
        name: applicant.name,
        studentId: applicant.studentId,
        createdAt: applicant.createdAt,
      })),
    updatedAt: serverTimestamp(),
  };

  if (id) {
    await setDoc(docRef, nowFields, { merge: true });

    if (thumbnailFile && previous?.thumbnailPath && previous.thumbnailPath !== thumbnail.thumbnailPath) {
      await deleteThumbnail(eventContext.storage, previous.thumbnailPath);
    }

    return;
  }

  await setDoc(docRef, {
    ...nowFields,
    createdAt: serverTimestamp(),
  });
}

async function savePostApplicants(post, applicants) {
  await setDoc(doc(eventContext.db, COLLECTION_NAME, post.id), {
    applicants: applicants
      .filter((applicant) => applicant.source === "eventPost")
      .map((applicant) => ({
        id: applicant.id,
        name: applicant.name,
        studentId: applicant.studentId,
        createdAt: applicant.createdAt,
      })),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function deletePost(post) {
  if (!window.confirm(`"${post.title}" 글을 삭제할까요?`)) {
    return;
  }

  try {
    await deleteThumbnail(eventContext.storage, post.thumbnailPath);
    await deleteEventApplications(post.id);
    await deleteDoc(doc(eventContext.db, COLLECTION_NAME, post.id));

    await refreshPosts();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "글 삭제에 실패했습니다."), true);
  }
}

async function deleteApplicant(post, applicant) {
  const applicantLabel = applicant.name || applicant.studentId || "신청자";

  if (!window.confirm(`${applicantLabel} 신청자를 삭제할까요?`)) {
    return;
  }

  try {
    if (applicant.source === "applicationDoc" && applicant.applicationId) {
      await deleteDoc(doc(eventContext.db, APPLICATION_COLLECTION, applicant.applicationId));
      await refreshPosts();
      return;
    }

    const applicants = post.applicants.filter((item) => {
      if (applicant.id && item.id) {
        return item.id !== applicant.id;
      }

      return !(item.name === applicant.name && item.studentId === applicant.studentId);
    });

    await savePostApplicants(post, applicants);
    await refreshPosts();
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "신청자 삭제에 실패했습니다."), true);
  }
}

async function deleteEventApplications(eventId) {
  const snapshots = await getDocs(query(
    collection(eventContext.db, APPLICATION_COLLECTION),
    where("eventId", "==", eventId),
  ));

  await Promise.all(snapshots.docs.map((snapshot) => (
    deleteDoc(doc(eventContext.db, APPLICATION_COLLECTION, snapshot.id))
  )));
}

function bindEventControls() {
  const form = document.querySelector("[data-event-form]");
  const writeButton = document.querySelector("[data-events-write]");
  const cancelButton = document.querySelector("[data-events-cancel]");
  const thumbnailInput = form?.elements.thumbnailFile;

  writeButton?.addEventListener("click", () => openEventEditor());
  cancelButton?.addEventListener("click", () => {
    resetEventForm();
    showEventView("list");
  });

  thumbnailInput?.addEventListener("change", () => {
    const thumbnailName = document.querySelector("[data-event-thumbnail-name]");

    if (thumbnailName) {
      thumbnailName.textContent = thumbnailInput.files?.[0]?.name || "선택된 파일 없음";
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const values = getFormValues(form);
      const thumbnailFile = getThumbnailFile(form);

      await saveRemotePost(form, values, thumbnailFile);

      resetEventForm();
      await refreshPosts();
      showEventView("list");
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "글 저장에 실패했습니다."), true);
    }
  });
}

async function initEventManagement() {
  if (!document.querySelector("[data-events-app]")) {
    return;
  }

  bindEventControls();
  setControlsEnabled(false);

  try {
    await watchAdminAuth({
      onDenied: () => {
        eventContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 이벤트를 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db, storage }) => {
        eventContext = { user, db, storage };
        setControlsEnabled(true);
        await refreshPosts();
      },
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initEventManagement);
