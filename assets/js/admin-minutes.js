const minutesStatus = document.querySelector("[data-minutes-status]");
const minutesFileInputs = document.querySelectorAll("[data-minutes-file-input]");
const minutesUploadButtons = document.querySelectorAll("[data-minutes-upload]");

const MINUTES_LABELS = {
  template: "\uD68C\uC758\uB85D \uC591\uC2DD",
  completed: "\uC791\uC131\uB41C \uD68C\uC758\uB85D",
};
const MINUTES_DOWNLOAD_VERSION = "template-download-20260602";

let meetingMinuteFiles = {};

function setMinutesStatus(message) {
  if (!minutesStatus) return;

  minutesStatus.textContent = message;
}

function formatMinutesFileSize(size) {
  const numericSize = Number(size || 0);

  if (!Number.isFinite(numericSize) || numericSize <= 0) return "";
  if (numericSize < 1024 * 1024) return `${Math.ceil(numericSize / 1024)}KB`;

  return `${(numericSize / 1024 / 1024).toFixed(1)}MB`;
}

function getMinutesUploadStatus(label, progress, stage) {
  if (stage === "encoding") {
    return `${label} \uD30C\uC77C\uC744 \uC800\uC7A5\uD560 \uC218 \uC788\uAC8C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
  }

  if (stage === "connecting") {
    return `${label} \uC5C5\uB85C\uB4DC\uB97C Firebase Storage\uC5D0 \uC5F0\uACB0\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
  }

  if (stage === "connecting-slow") {
    return `${label} \uC5C5\uB85C\uB4DC \uC5F0\uACB0\uC774 \uC9C0\uC5F0\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4. Firebase Storage \uAD8C\uD55C, \uB124\uD2B8\uC6CC\uD06C, \uD30C\uC77C \uD06C\uAE30\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.`;
  }

  if (stage === "finalizing") {
    return `${label} \uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
  }

  if (stage === "saving") {
    return `${label} \uC5C5\uB85C\uB4DC \uC815\uBCF4\uB97C \uC800\uC7A5\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
  }

  return `${label} \uC5C5\uB85C\uB4DC \uC911 ${progress}%`;
}

function getMinutesUploadErrorMessage(error, label) {
  const code = error?.code || "";
  const message = error?.message || "";

  if (code.includes("unauthorized")) {
    return `${label} \uC5C5\uB85C\uB4DC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. Firebase Storage \uADDC\uCE59\uC5D0 meeting-minutes \uACBD\uB85C\uAC00 \uD5C8\uC6A9\uB418\uC5C8\uB294\uC9C0 \uD655\uC778\uD574\uC8FC\uC138\uC694.`;
  }

  if (code.includes("canceled")) {
    return `${label} \uC5C5\uB85C\uB4DC\uAC00 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Firebase Storage \uAD8C\uD55C\uACFC \uB124\uD2B8\uC6CC\uD06C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.`;
  }

  return message || `${label} \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.`;
}

function getCompletedMinuteFiles() {
  if (Array.isArray(meetingMinuteFiles.completedFiles)) {
    return meetingMinuteFiles.completedFiles.filter((file) => file?.downloadUrl);
  }

  return meetingMinuteFiles.completed?.downloadUrl ? [meetingMinuteFiles.completed] : [];
}

function getMeetingMinuteDownloadUrl(file) {
  if (!file?.downloadUrl) return "#";

  try {
    const url = new URL(file.downloadUrl, window.location.href);

    url.searchParams.set("download", "1");
    url.searchParams.set("v", MINUTES_DOWNLOAD_VERSION);

    return url.toString();
  } catch {
    return file.downloadUrl;
  }
}

function createCompletedMinuteItem(file) {
  const item = document.createElement("div");
  const info = document.createElement("span");
  const actions = document.createElement("div");
  const downloadLink = document.createElement("a");
  const deleteButton = document.createElement("button");
  const sizeText = formatMinutesFileSize(file.size);

  item.className = "minutes-file-item";
  actions.className = "minutes-file-item__actions";
  info.textContent = `${file.name || "\uD68C\uC758\uB85D"}${sizeText ? ` / ${sizeText}` : ""}`;
  downloadLink.className = "auth-button auth-button--ghost";
  downloadLink.href = getMeetingMinuteDownloadUrl(file);
  downloadLink.download = file.name || "";
  downloadLink.textContent = "\uB2E4\uC6B4\uB85C\uB4DC";
  deleteButton.className = "auth-button auth-button--danger";
  deleteButton.type = "button";
  deleteButton.textContent = "\uC0AD\uC81C";
  deleteButton.addEventListener("click", () => {
    handleMeetingMinuteDelete(file, deleteButton);
  });

  actions.append(downloadLink, deleteButton);
  item.append(info, actions);

  return item;
}

async function handleMeetingMinuteDelete(file, deleteButton) {
  const martiniFirebase = window.MartiniFirebase;
  const fileName = file?.name || "\uD68C\uC758\uB85D";

  if (!martiniFirebase?.deleteMeetingMinuteFile) return;
  if (!window.confirm(`"${fileName}"\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?`)) return;

  try {
    deleteButton.disabled = true;
    setMinutesStatus(`${fileName} \uD68C\uC758\uB85D\uC744 \uC0AD\uC81C\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`);
    await martiniFirebase.deleteMeetingMinuteFile(file);
    setMinutesStatus(`${fileName} \uD68C\uC758\uB85D\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`);
  } catch (error) {
    console.error("Meeting minutes delete failed", error);
    setMinutesStatus(error.message || `${fileName} \uD68C\uC758\uB85D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.`);
    deleteButton.disabled = false;
  }
}

function renderCompletedMeetingMinuteFiles() {
  const files = getCompletedMinuteFiles();
  const nameElement = document.querySelector('[data-minutes-file-name="completed"]');
  const listElement = document.querySelector('[data-minutes-file-list="completed"]');

  if (nameElement) {
    nameElement.textContent = files.length
      ? `\uCD1D ${files.length}\uAC1C\uC758 \uD68C\uC758\uB85D\uC774 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`
      : "\uB4F1\uB85D\uB41C \uD68C\uC758\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  }

  if (!listElement) return;

  listElement.textContent = "";
  files.forEach((file) => {
    listElement.append(createCompletedMinuteItem(file));
  });
}

function renderMeetingMinuteFile(fileType) {
  if (fileType === "completed") {
    renderCompletedMeetingMinuteFiles();
    return;
  }

  const file = meetingMinuteFiles[fileType] || null;
  const nameElement = document.querySelector(`[data-minutes-file-name="${fileType}"]`);
  const downloadLink = document.querySelector(`[data-minutes-download="${fileType}"]`);
  const emptyText =
    fileType === "template"
      ? "\uB4F1\uB85D\uB41C \uC591\uC2DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."
      : "\uB4F1\uB85D\uB41C \uD68C\uC758\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";

  if (nameElement) {
    const sizeText = formatMinutesFileSize(file?.size);

    nameElement.textContent = file?.name
      ? `${file.name}${sizeText ? ` / ${sizeText}` : ""}`
      : emptyText;
  }

  if (!downloadLink) return;

  if (file?.downloadUrl) {
    downloadLink.href = getMeetingMinuteDownloadUrl(file);
    downloadLink.classList.remove("is-disabled");
    downloadLink.setAttribute("download", file.name || "");
    downloadLink.setAttribute("aria-disabled", "false");
    downloadLink.removeAttribute("target");
    downloadLink.removeAttribute("rel");
  } else {
    downloadLink.href = "#";
    downloadLink.classList.add("is-disabled");
    downloadLink.removeAttribute("download");
    downloadLink.setAttribute("aria-disabled", "true");
    downloadLink.removeAttribute("target");
    downloadLink.removeAttribute("rel");
  }
}

function renderMeetingMinuteFiles() {
  renderMeetingMinuteFile("template");
  renderMeetingMinuteFile("completed");
}

function subscribeMeetingMinuteFiles() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeMeetingMinuteFiles) return null;

  return martiniFirebase.subscribeMeetingMinuteFiles((files) => {
    meetingMinuteFiles = files || {};
    renderMeetingMinuteFiles();
    setMinutesStatus("\uD68C\uC758\uB85D \uD30C\uC77C\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  });
}

async function handleMeetingMinuteUpload(fileType) {
  const martiniFirebase = window.MartiniFirebase;
  const input = document.querySelector(`[data-minutes-file-input="${fileType}"]`);
  const uploadButton = document.querySelector(`[data-minutes-upload="${fileType}"]`);
  const file = input?.files?.[0];
  const label = MINUTES_LABELS[fileType] || "\uD68C\uC758\uB85D \uD30C\uC77C";

  if (!martiniFirebase?.uploadMeetingMinuteFile) return;

  if (!file) {
    input?.click();
    setMinutesStatus(`${label} \uD30C\uC77C\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.`);
    return;
  }

  try {
    uploadButton.disabled = true;
    const sizeText = formatMinutesFileSize(file.size);

    setMinutesStatus(
      `${label} \uC5C5\uB85C\uB4DC\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.${sizeText ? ` (${sizeText})` : ""}`,
    );
    await martiniFirebase.uploadMeetingMinuteFile(fileType, file, (progress, stage) => {
      setMinutesStatus(getMinutesUploadStatus(label, progress, stage));
    });
    input.value = "";
    setMinutesStatus(`${label}\uC774 \uC5C5\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`);
  } catch (error) {
    console.error("Meeting minutes upload failed", error);
    setMinutesStatus(getMinutesUploadErrorMessage(error, label));
  } finally {
    uploadButton.disabled = false;
  }
}

function bindMeetingMinutesActions() {
  minutesUploadButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleMeetingMinuteUpload(button.dataset.minutesUpload);
    });
  });

  minutesFileInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const fileType = input.dataset.minutesFileInput;
      const label = MINUTES_LABELS[fileType] || "\uD68C\uC758\uB85D \uD30C\uC77C";

      if (input.files?.[0]) {
        handleMeetingMinuteUpload(fileType);
        return;
      }

      setMinutesStatus(
        input.files?.[0]
          ? `${label} \uC5C5\uB85C\uB4DC \uC900\uBE44\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`
          : "\uD30C\uC77C \uC120\uD0DD\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      );
    });
  });

  document.querySelectorAll("[data-minutes-download]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.classList.contains("is-disabled")) {
        event.preventDefault();
        setMinutesStatus("\uB2E4\uC6B4\uB85C\uB4DC\uD560 \uD30C\uC77C\uC774 \uC544\uC9C1 \uC5C5\uB85C\uB4DC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
        return;
      }
    });
  });
}
