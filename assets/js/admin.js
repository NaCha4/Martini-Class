const WEEKDAYS = [
  { key: "monday", label: "월요일" },
  { key: "tuesday", label: "화요일" },
  { key: "wednesday", label: "수요일" },
  { key: "thursday", label: "목요일" },
  { key: "friday", label: "금요일" },
];

const DEFAULT_CAPACITY = 12;
const voteConfigForm = document.querySelector("[data-vote-config-form]");
const voteCapacityInput = document.querySelector("[data-vote-capacity]");
const voteDayList = document.querySelector("[data-vote-day-list]");
const voteConfigStatus = document.querySelector("[data-vote-config-status]");
const voteSaveButton = document.querySelector("[data-vote-save-button]");
const voteResetButton = document.querySelector("[data-vote-reset-button]");
const applyStatusCard = document.querySelector("[data-apply-status-card]");
const applyStatusCopy = document.querySelector("[data-apply-status-copy]");
const applyToggleButton = document.querySelector("[data-apply-toggle-button]");
const applyOpenAtInput = document.querySelector("[data-apply-open-at]");
const applyCloseAtInput = document.querySelector("[data-apply-close-at]");
const applyScheduleSummary = document.querySelector("[data-apply-schedule-summary]");
const applyScheduleClearButton = document.querySelector("[data-apply-schedule-clear]");
const regularApplyCount = document.querySelector("[data-regular-apply-count]");
const privateClassForm = document.querySelector("[data-private-class-form]");
const privateClassToolbar = document.querySelector("[data-private-class-toolbar]");
const privateClassWriteButton = document.querySelector("[data-private-class-write]");
const privateClassCancelButton = document.querySelector("[data-private-class-cancel]");
const privateThumbnailInput = document.querySelector("[data-private-thumbnail-input]");
const privateThumbnailPreview = document.querySelector("[data-private-thumbnail-preview]");
const privateClassStatus = document.querySelector("[data-private-class-status]");
const privateClassSaveButton = document.querySelector("[data-private-class-save]");
const privateClassAdminList = document.querySelector("[data-private-class-admin-list]");
const privateClassDetail = document.querySelector("[data-private-class-detail]");
const privateDetailTitle = document.querySelector("[data-private-detail-title]");
const privateDetailMeta = document.querySelector("[data-private-detail-meta]");
const privateClassEditButton = document.querySelector("[data-private-class-edit]");
const privateApplicantList = document.querySelector("[data-private-applicant-list]");
let adminClassVotes = [];
let privateClasses = [];
let privateClassApplications = [];
let selectedPrivateClassId = "";
let editingPrivateClassId = "";
let privateClassMode = "browse";
let currentVoteConfig = null;

function moveToPage(target) {
  if (!target) return;

  window.location.href = target;
}

function bindNavigation() {
  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      moveToPage(element.dataset.route);
    });
  });
}

function bindAuthGuard() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) {
    moveToPage("./login.html");
    return;
  }

  martiniFirebase.subscribeAuth(({ user, isAdmin }) => {
    if (!user || !isAdmin) {
      moveToPage("./login.html");
      return;
    }

  });
}

function setVoteConfigStatus(message) {
  if (!voteConfigStatus) return;

  voteConfigStatus.textContent = message;
}

function setPrivateClassStatus(message) {
  if (!privateClassStatus) return;

  privateClassStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDefaultVoteConfig() {
  return {
    isOpen: false,
    reservedOpenAt: null,
    reservedCloseAt: null,
    capacity: DEFAULT_CAPACITY,
    days: WEEKDAYS.reduce((days, weekday) => {
      days[weekday.key] = {
        enabled: false,
        capacity: DEFAULT_CAPACITY,
      };

      return days;
    }, {}),
  };
}

function normalizeConfigDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toDatetimeLocalValue(date) {
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInputDate(input) {
  if (!input?.value) return null;

  const date = new Date(input.value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatScheduleDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isEffectivelyOpen(config) {
  const now = new Date();
  const reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  const reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  if (reservedCloseAt && reservedCloseAt <= now) return false;

  return config?.isOpen === true || Boolean(reservedOpenAt && reservedOpenAt <= now);
}

function normalizeVoteConfig(config) {
  const defaultConfig = getDefaultVoteConfig();
  const savedDays = config?.days || {};
  const savedCapacity = Number(config?.capacity);
  const firstSavedDayCapacity = WEEKDAYS.map((weekday) => Number(savedDays[weekday.key]?.capacity))
    .find((capacity) => Number.isFinite(capacity) && capacity > 0);
  const capacity = Number.isFinite(savedCapacity) && savedCapacity > 0
    ? savedCapacity
    : firstSavedDayCapacity || DEFAULT_CAPACITY;

  defaultConfig.capacity = capacity;
  defaultConfig.isOpen = config?.isOpen === true;
  defaultConfig.reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  defaultConfig.reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  WEEKDAYS.forEach((weekday) => {
    const savedDay = savedDays[weekday.key] || {};

    defaultConfig.days[weekday.key] = {
      enabled: savedDay.enabled === true,
      capacity,
    };
  });

  return defaultConfig;
}

function renderVoteConfig(config) {
  if (!voteDayList) return;

  currentVoteConfig = config;
  renderApplyStatus(isEffectivelyOpen(config));
  renderApplySchedule(config);

  if (voteCapacityInput) {
    voteCapacityInput.value = config.capacity;
  }

  voteDayList.innerHTML = WEEKDAYS.map((weekday) => {
    const dayConfig = config.days[weekday.key];
    const checked = dayConfig.enabled ? "checked" : "";
    const activeClass = dayConfig.enabled ? " is-active" : "";

    return `
      <article class="vote-day-row${activeClass}" data-vote-day="${weekday.key}">
        <button class="vote-day-toggle" type="button" data-vote-toggle>
          <span class="vote-day-row__name">${weekday.label}</span>
        </button>
        <input type="checkbox" name="${weekday.key}-enabled" ${checked} hidden />
        <ul class="admin-vote-member-list" data-admin-vote-members="${weekday.key}"></ul>
      </article>
    `;
  }).join("");

  renderAdminVoteMembers();
}

function renderApplySchedule(config) {
  const reservedOpenAt = normalizeConfigDate(config?.reservedOpenAt);
  const reservedCloseAt = normalizeConfigDate(config?.reservedCloseAt);

  if (applyOpenAtInput) {
    applyOpenAtInput.value = toDatetimeLocalValue(reservedOpenAt);
  }

  if (applyCloseAtInput) {
    applyCloseAtInput.value = toDatetimeLocalValue(reservedCloseAt);
  }

  if (!applyScheduleSummary) return;

  if (!reservedOpenAt && !reservedCloseAt) {
    applyScheduleSummary.textContent = "예약된 오픈/마감 시간이 없습니다.";
    return;
  }

  const scheduleText = [
    reservedOpenAt ? `오픈 ${formatScheduleDate(reservedOpenAt)}` : "",
    reservedCloseAt ? `마감 ${formatScheduleDate(reservedCloseAt)}` : "",
  ].filter(Boolean).join(" · ");

  applyScheduleSummary.textContent = scheduleText;
}

function renderApplyStatus(isOpen) {
  applyStatusCard?.classList.toggle("is-open", isOpen);

  if (applyStatusCopy) {
    applyStatusCopy.textContent = isOpen
      ? "현재 신청을 받고 있습니다."
      : "현재 신청이 마감되어 있습니다.";
  }

  if (applyToggleButton) {
    applyToggleButton.textContent = isOpen ? "신청 마감" : "신청 오픈";
    applyToggleButton.classList.toggle("auth-button--primary", !isOpen);
    applyToggleButton.classList.toggle("auth-button--ghost", isOpen);
  }
}

function groupAdminVotesByDay() {
  return adminClassVotes.reduce((groups, vote) => {
    if (!groups[vote.day]) groups[vote.day] = [];
    groups[vote.day].push(vote);

    return groups;
  }, {});
}

function renderAdminVoteMembers() {
  if (!voteDayList) return;

  const groupedVotes = groupAdminVotesByDay();

  WEEKDAYS.forEach((weekday) => {
    const list = voteDayList.querySelector(`[data-admin-vote-members="${weekday.key}"]`);
    const votes = groupedVotes[weekday.key] || [];

    if (!list) return;

    list.innerHTML = votes.length
      ? votes.map((vote) => `
        <li class="admin-vote-member" draggable="true" data-student-id="${vote.studentId}">
          <span>${vote.name}</span>
          <button type="button" aria-label="${vote.name} 신청 삭제" data-delete-vote="${vote.studentId}">×</button>
        </li>
      `).join("")
      : `<li class="admin-vote-empty">신청자 없음</li>`;
  });
}

function renderDashboardStats() {
  if (!regularApplyCount) return;

  regularApplyCount.textContent = String(adminClassVotes.length);
}

function getPrivateClassStatusLabel(status) {
  return {
    upcoming: "모집예정",
    open: "모집중",
    closed: "마감",
    done: "종료",
  }[status] || "마감";
}

function renderPrivateClasses() {
  if (!privateClassAdminList) return;

  if (!privateClasses.length) {
    privateClassAdminList.innerHTML = `<p class="empty-state">아직 등록된 개인 클래스가 없습니다.</p>`;
    return;
  }

  privateClassAdminList.innerHTML = privateClasses.map((privateClass) => {
    const eventDate = normalizeConfigDate(privateClass.eventAt);
    const eventText = eventDate ? formatScheduleDate(eventDate) : "일정 미정";
    const capacity = Number(privateClass.capacity || 0);
    const applicationCount = Number(privateClass.applicationCount || 0);

    return `
      <article class="private-admin-item">
        <div>
          <span class="private-class-status private-class-status--${privateClass.status}">
            ${getPrivateClassStatusLabel(privateClass.status)}
          </span>
          <h3>${escapeHtml(privateClass.title)}</h3>
          <p>${escapeHtml(privateClass.summary)}</p>
          <small>${escapeHtml(privateClass.category)} · ${eventText} · ${applicationCount}/${capacity}명</small>
        </div>
        <div class="private-admin-item__actions">
          <button class="auth-button auth-button--primary" type="button" data-view-private-class="${privateClass.id}">
            상세보기
          </button>
          <button class="auth-button auth-button--ghost" type="button" data-delete-private-class="${privateClass.id}">
            삭제
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function getSelectedPrivateClass() {
  return privateClasses.find((privateClass) => privateClass.id === selectedPrivateClassId);
}

function getEditingPrivateClass() {
  return privateClasses.find((privateClass) => privateClass.id === editingPrivateClassId);
}

function setPrivateClassMode(mode) {
  privateClassMode = mode;
  const isWriting = mode === "write";

  privateClassForm?.classList.toggle("is-hidden", !isWriting);
  privateClassToolbar?.classList.toggle("is-hidden", isWriting);
  privateClassAdminList?.classList.toggle("is-hidden", isWriting);

  if (isWriting) {
    privateClassDetail?.classList.add("is-hidden");
  } else {
    renderPrivateClassDetail();
  }
}

function getPrivateClassApplications(classId = selectedPrivateClassId) {
  return privateClassApplications.filter((application) => application.classId === classId);
}

function renderPrivateClassDetail() {
  if (!privateClassDetail || !privateApplicantList) return;

  const privateClass = getSelectedPrivateClass();

  privateClassDetail.classList.toggle("is-hidden", !privateClass || privateClassMode === "write");

  if (!privateClass) return;

  const eventDate = normalizeConfigDate(privateClass.eventAt);
  const eventText = eventDate ? formatScheduleDate(eventDate) : "일정 미정";
  const applicants = getPrivateClassApplications(privateClass.id);

  privateDetailTitle.textContent = privateClass.title;
  privateDetailMeta.textContent = `${getPrivateClassStatusLabel(privateClass.status)} · ${privateClass.category} · ${eventText} · 신청 ${applicants.length}명`;
  privateApplicantList.innerHTML = applicants.length
    ? applicants.map((applicant) => `
      <li class="private-applicant">
        <div>
          <strong>${escapeHtml(applicant.name)}</strong>
          <span>${escapeHtml(applicant.studentId)}</span>
        </div>
        <button class="auth-button auth-button--ghost" type="button" data-delete-private-applicant="${applicant.id}">
          삭제
        </button>
      </li>
    `).join("")
    : `<li class="private-applicant-empty">아직 신청자가 없습니다.</li>`;
}

function fillPrivateClassForm(privateClass) {
  if (!privateClassForm || !privateClass) return;

  editingPrivateClassId = privateClass.id;
  privateClassForm.elements.title.value = privateClass.title || "";
  privateClassForm.elements.category.value = privateClass.category || "";
  privateClassForm.elements.fee.value = privateClass.fee || "";
  privateClassForm.elements.eventAt.value = toDatetimeLocalValue(normalizeConfigDate(privateClass.eventAt));
  privateClassForm.elements.capacity.value = privateClass.capacity || 8;
  privateClassForm.elements.summary.value = privateClass.summary || "";
  privateClassForm.elements.description.value = privateClass.description || "";
  privateClassForm.elements.status.value = privateClass.status || "upcoming";
  renderPrivateThumbnailPreview(privateClass.thumbnailDataUrl || privateClass.thumbnailUrl);
  privateClassSaveButton.textContent = "수정 저장";
  setPrivateClassStatus("선택한 개인 클래스 내용을 수정하고 있습니다.");
  setPrivateClassMode("write");
  privateClassForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetPrivateClassForm() {
  editingPrivateClassId = "";
  privateClassForm.reset();
  privateClassForm.elements.capacity.value = "8";
  privateClassForm.elements.status.value = "upcoming";
  renderPrivateThumbnailPreview("");
  privateClassSaveButton.textContent = "글 등록";
}

function renderPrivateThumbnailPreview(thumbnailUrl) {
  if (!privateThumbnailPreview) return;

  const image = privateThumbnailPreview.querySelector("img");
  const copy = privateThumbnailPreview.querySelector("small");

  if (image) {
    image.src = thumbnailUrl || "./assets/images/Logo.png";
  }

  if (copy) {
    copy.textContent = thumbnailUrl
      ? "현재 등록된 썸네일입니다."
      : "이미지를 선택하면 썸네일로 저장됩니다.";
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

async function compressPrivateThumbnail(file) {
  const imageSrc = await readImageFile(file);
  const image = await loadImage(imageSrc);
  const attempts = [
    { maxWidth: 720, quality: 0.72 },
    { maxWidth: 560, quality: 0.64 },
    { maxWidth: 420, quality: 0.56 },
    { maxWidth: 320, quality: 0.5 },
  ];

  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.maxWidth / image.naturalWidth);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);

    if (dataUrl.length <= 850000) {
      return { dataUrl };
    }
  }

  throw new Error("썸네일 이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해주세요.");
}

function startPrivateClassWrite() {
  selectedPrivateClassId = "";
  resetPrivateClassForm();
  setPrivateClassStatus("개인 클래스 글을 작성해주세요.");
  setPrivateClassMode("write");
}

function cancelPrivateClassWrite() {
  resetPrivateClassForm();
  setPrivateClassStatus("개인 클래스 목록을 확인하고 있습니다.");
  setPrivateClassMode("browse");
}

function collectPrivateClassData() {
  const formData = new FormData(privateClassForm);
  const eventAtValue = formData.get("eventAt");
  const eventAt = eventAtValue ? new Date(eventAtValue) : null;
  const capacity = Number(formData.get("capacity"));
  const editingPrivateClass = getEditingPrivateClass();

  return {
    id: editingPrivateClassId || undefined,
    title: String(formData.get("title") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    fee: String(formData.get("fee") || "").trim(),
    eventAt: eventAt && !Number.isNaN(eventAt.getTime()) ? eventAt : null,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 1,
    summary: String(formData.get("summary") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    status: String(formData.get("status") || "closed"),
    thumbnailUrl: editingPrivateClass?.thumbnailUrl || "",
    thumbnailDataUrl: editingPrivateClass?.thumbnailDataUrl || "",
  };
}

async function handlePrivateClassSubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.savePrivateClass) return;

  try {
    privateClassSaveButton.disabled = true;
    const isEditing = Boolean(editingPrivateClassId);
    const thumbnailFile = privateThumbnailInput?.files?.[0];
    setPrivateClassStatus("개인 클래스 글을 저장하고 있습니다.");
    const classData = collectPrivateClassData();
    const savedClassId = await martiniFirebase.savePrivateClass(classData);

    if (thumbnailFile) {
      if (!thumbnailFile.type.startsWith("image/")) {
        throw new Error("이미지 파일만 썸네일로 업로드할 수 있습니다.");
      }

      setPrivateClassStatus("썸네일 이미지를 압축하고 있습니다.");
      const thumbnail = await compressPrivateThumbnail(thumbnailFile);
      setPrivateClassStatus("썸네일을 글에 저장하고 있습니다.");
      await martiniFirebase.savePrivateClass({
        ...classData,
        id: savedClassId,
        thumbnailDataUrl: thumbnail.dataUrl,
        thumbnailUrl: "",
      });
    }

    selectedPrivateClassId = "";
    resetPrivateClassForm();
    setPrivateClassMode("browse");
    setPrivateClassStatus(isEditing ? "개인 클래스 글이 수정되었습니다." : "개인 클래스 글이 등록되었습니다.");
  } catch (error) {
    setPrivateClassStatus(error.message || "개인 클래스 글 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    privateClassSaveButton.disabled = false;
  }
}

function bindPrivateClassActions() {
  privateClassWriteButton?.addEventListener("click", startPrivateClassWrite);
  privateClassCancelButton?.addEventListener("click", cancelPrivateClassWrite);
  privateThumbnailInput?.addEventListener("change", () => {
    const file = privateThumbnailInput.files?.[0];

    if (!file) {
    const editingPrivateClass = getEditingPrivateClass();

    renderPrivateThumbnailPreview(editingPrivateClass?.thumbnailDataUrl || editingPrivateClass?.thumbnailUrl);
      return;
    }

    renderPrivateThumbnailPreview(URL.createObjectURL(file));
  });

  privateClassAdminList?.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view-private-class]");
    const deleteButton = event.target.closest("[data-delete-private-class]");

    if (viewButton) {
      selectedPrivateClassId = viewButton.dataset.viewPrivateClass;
      renderPrivateClassDetail();
      setPrivateClassStatus("선택한 개인 클래스 상세를 확인하고 있습니다.");
      privateClassDetail?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!deleteButton) return;

    const privateClass = privateClasses.find((item) => item.id === deleteButton.dataset.deletePrivateClass);
    const confirmed = window.confirm(`${privateClass?.title || "이 개인 클래스"} 글을 삭제할까요?`);

    if (!confirmed) return;

    try {
      deleteButton.disabled = true;
      setPrivateClassStatus("개인 클래스 글을 삭제하고 있습니다.");
      await window.MartiniFirebase.deletePrivateClass(deleteButton.dataset.deletePrivateClass);
      if (selectedPrivateClassId === deleteButton.dataset.deletePrivateClass) {
        selectedPrivateClassId = "";
        renderPrivateClassDetail();
      }
      setPrivateClassStatus("개인 클래스 글이 삭제되었습니다.");
    } catch {
      setPrivateClassStatus("개인 클래스 글 삭제에 실패했습니다.");
    } finally {
      deleteButton.disabled = false;
    }
  });

  privateClassEditButton?.addEventListener("click", () => {
    fillPrivateClassForm(getSelectedPrivateClass());
  });

  privateApplicantList?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-private-applicant]");

    if (!deleteButton) return;

    const application = privateClassApplications.find((item) => item.id === deleteButton.dataset.deletePrivateApplicant);
    const confirmed = window.confirm(`${application?.name || "이 신청자"} 신청을 삭제할까요?`);

    if (!application || !confirmed) return;

    try {
      deleteButton.disabled = true;
      setPrivateClassStatus("신청자를 삭제하고 있습니다.");
      await window.MartiniFirebase.deletePrivateClassApplication(application);
      setPrivateClassStatus("신청자가 삭제되었습니다.");
    } catch {
      setPrivateClassStatus("신청자 삭제에 실패했습니다.");
    } finally {
      deleteButton.disabled = false;
    }
  });
}

function subscribePrivateClasses() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribePrivateClasses) return;

  martiniFirebase.subscribePrivateClasses((classes) => {
    privateClasses = classes;
    renderPrivateClasses();
    renderPrivateClassDetail();
  });
}

function subscribePrivateClassApplications() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribePrivateClassApplications) return;

  martiniFirebase.subscribePrivateClassApplications((applications) => {
    privateClassApplications = applications;
    renderPrivateClassDetail();
  });
}

function collectVoteConfig() {
  const formData = new FormData(voteConfigForm);
  const days = {};
  const capacity = Number(formData.get("vote-capacity"));
  const normalizedCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_CAPACITY;
  const reservedOpenAt = getInputDate(applyOpenAtInput);
  const reservedCloseAt = getInputDate(applyCloseAtInput);

  WEEKDAYS.forEach((weekday) => {
    const enabled = formData.get(`${weekday.key}-enabled`) === "on";

    days[weekday.key] = {
      label: weekday.label,
      enabled,
      capacity: normalizedCapacity,
    };
  });

  return {
    isOpen: currentVoteConfig?.isOpen === true,
    reservedOpenAt,
    reservedCloseAt,
    capacity: normalizedCapacity,
    days,
  };
}

function isValidApplySchedule(config) {
  if (!config.reservedOpenAt || !config.reservedCloseAt) return true;

  return config.reservedCloseAt > config.reservedOpenAt;
}

function bindVoteCapacityToggles() {
  voteDayList?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-vote-toggle]");

    if (!toggleButton) return;

    const row = toggleButton.closest("[data-vote-day]");
    const checkbox = row?.querySelector('input[type="checkbox"]');

    if (!row || !checkbox) return;

    checkbox.checked = !checkbox.checked;
    row.classList.toggle("is-active", checkbox.checked);
  });
}

function bindVoteMemberActions() {
  voteDayList?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-vote]");

    if (!deleteButton) return;

    const studentId = deleteButton.dataset.deleteVote;
    const confirmed = window.confirm("이 신청자를 삭제할까요?");

    if (!confirmed) return;

    try {
      setVoteConfigStatus("신청자를 삭제하고 있습니다.");
      await window.MartiniFirebase.deleteClassVote(studentId);
      setVoteConfigStatus("신청자가 삭제되었습니다.");
    } catch {
      setVoteConfigStatus("신청자 삭제에 실패했습니다.");
    }
  });

  voteDayList?.addEventListener("dragstart", (event) => {
    const member = event.target.closest("[data-student-id]");

    if (!member) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", member.dataset.studentId);
    member.classList.add("is-dragging");
  });

  voteDayList?.addEventListener("dragend", (event) => {
    event.target.closest("[data-student-id]")?.classList.remove("is-dragging");
    voteDayList.querySelectorAll(".is-drop-target").forEach((row) => {
      row.classList.remove("is-drop-target");
    });
  });

  voteDayList?.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("is-drop-target");
  });

  voteDayList?.addEventListener("dragleave", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row || row.contains(event.relatedTarget)) return;

    row.classList.remove("is-drop-target");
  });

  voteDayList?.addEventListener("drop", async (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    row.classList.remove("is-drop-target");

    const studentId = event.dataTransfer.getData("text/plain");
    const targetDay = row.dataset.voteDay;
    const targetWeekday = WEEKDAYS.find((weekday) => weekday.key === targetDay);
    const vote = adminClassVotes.find((classVote) => classVote.studentId === studentId);

    if (!studentId || !targetWeekday || vote?.day === targetDay) return;

    try {
      setVoteConfigStatus(`${vote.name} 신청 요일을 이동하고 있습니다.`);
      await window.MartiniFirebase.moveClassVote(studentId, targetDay, targetWeekday.label);
      setVoteConfigStatus(`${vote.name} 신청 요일이 ${targetWeekday.label}로 변경되었습니다.`);
    } catch {
      setVoteConfigStatus("신청 요일 변경에 실패했습니다.");
    }
  });
}

function subscribeAdminClassVotes() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassVotes) return;

  martiniFirebase.subscribeClassVotes((votes) => {
    adminClassVotes = votes;
    renderDashboardStats();
    renderAdminVoteMembers();
  });
}

async function loadVoteConfig() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase || !voteConfigForm) return;

  try {
    setVoteConfigStatus("저장된 설정을 불러오고 있습니다.");
    const savedConfig = await martiniFirebase.getVoteConfig();
    renderVoteConfig(normalizeVoteConfig(savedConfig));
    setVoteConfigStatus("설정을 수정한 뒤 저장해주세요.");
  } catch {
    renderVoteConfig(getDefaultVoteConfig());
    setVoteConfigStatus("설정을 불러오지 못했습니다. 새 설정을 저장할 수 있습니다.");
  }
}

async function handleVoteConfigSubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    voteSaveButton.disabled = true;
    setVoteConfigStatus("설정을 저장하고 있습니다.");
    const nextConfig = collectVoteConfig();

    if (!isValidApplySchedule(nextConfig)) {
      setVoteConfigStatus("예약 마감 시간은 예약 오픈 시간보다 뒤여야 합니다.");
      return;
    }

    await martiniFirebase.saveVoteConfig(nextConfig);
    currentVoteConfig = nextConfig;
    renderApplyStatus(isEffectivelyOpen(nextConfig));
    renderApplySchedule(nextConfig);
    setVoteConfigStatus("신청 설정이 저장되었습니다.");
  } catch {
    setVoteConfigStatus("설정 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteSaveButton.disabled = false;
  }
}

async function handleApplyToggle() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const nextIsOpen = !isEffectivelyOpen(currentVoteConfig || getDefaultVoteConfig());

  try {
    applyToggleButton.disabled = true;
    setVoteConfigStatus(nextIsOpen ? "신청을 오픈하고 있습니다." : "신청을 마감하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(nextIsOpen);
    renderApplySchedule(currentVoteConfig);
    setVoteConfigStatus(nextIsOpen ? "신청이 오픈되었습니다." : "신청이 마감되었습니다.");
  } catch {
    setVoteConfigStatus("신청 상태 변경에 실패했습니다.");
  } finally {
    applyToggleButton.disabled = false;
  }
}

async function handleApplyScheduleClear() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    applyScheduleClearButton.disabled = true;
    setVoteConfigStatus("신청 예약을 해제하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(isEffectivelyOpen(currentVoteConfig));
    renderApplySchedule(currentVoteConfig);
    setVoteConfigStatus("신청 예약이 해제되었습니다.");
  } catch {
    setVoteConfigStatus("신청 예약 해제에 실패했습니다.");
  } finally {
    applyScheduleClearButton.disabled = false;
  }
}

async function handleVoteReset() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const confirmed = window.confirm(
    "현재 신청된 모든 기록을 삭제하고 요일별 신청 인원을 0명으로 초기화할까요?",
  );

  if (!confirmed) return;

  try {
    voteResetButton.disabled = true;
    voteSaveButton.disabled = true;
    setVoteConfigStatus("신청 데이터를 초기화하고 있습니다.");
    await martiniFirebase.resetClassVotes(WEEKDAYS.map((weekday) => weekday.key));
    setVoteConfigStatus("신청 데이터가 모두 초기화되었습니다.");
  } catch {
    setVoteConfigStatus("초기화에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteResetButton.disabled = false;
    voteSaveButton.disabled = false;
  }
}

function setActiveAdminTab(targetTab) {
  const tabs = document.querySelectorAll("[data-admin-tab]");
  const panels = document.querySelectorAll("[data-admin-panel]");

  tabs.forEach((tab) => {
    const isActive = tab.dataset.adminTab === targetTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.adminPanel === targetTab;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function bindAdminTabs() {
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveAdminTab(tab.dataset.adminTab);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindAuthGuard();
  bindAdminTabs();
  bindVoteCapacityToggles();
  bindVoteMemberActions();
  bindPrivateClassActions();
  loadVoteConfig();
  subscribeAdminClassVotes();
  subscribePrivateClasses();
  subscribePrivateClassApplications();
  voteConfigForm?.addEventListener("submit", handleVoteConfigSubmit);
  privateClassForm?.addEventListener("submit", handlePrivateClassSubmit);
  voteResetButton?.addEventListener("click", handleVoteReset);
  applyToggleButton?.addEventListener("click", handleApplyToggle);
  applyScheduleClearButton?.addEventListener("click", handleApplyScheduleClear);
});
