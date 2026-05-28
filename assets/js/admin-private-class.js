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

  if (!martiniFirebase?.subscribePrivateClasses) return null;

  return martiniFirebase.subscribePrivateClasses((classes) => {
    privateClasses = classes;
    renderPrivateClasses();
    renderPrivateClassDetail();
    renderDashboardStats();
  });
}

function subscribePrivateClassApplications() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribePrivateClassApplications) return null;

  return martiniFirebase.subscribePrivateClassApplications((applications) => {
    privateClassApplications = applications;
    renderPrivateClassDetail();
    renderDashboardStats();
  });
}
