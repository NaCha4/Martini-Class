const privateGallery = document.querySelector("[data-private-class-gallery]");
const privateMessage = document.querySelector("[data-private-message]");
const { bindRouteNavigation, escapeHtml, moveToPage, normalizeDate } = window.MartiniUtils;

let privateClasses = [];
let selectedPrivateClassId = "";

function bindNavigation() {
  bindRouteNavigation();
}

function setPrivateMessage(message) {
  if (!privateMessage) return;

  privateMessage.textContent = message;
}

function formatClassDate(value) {
  const date = normalizeDate(value);

  if (!date) return "일정 미정";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusLabel(status) {
  return {
    upcoming: "모집예정",
    open: "모집중",
    closed: "마감",
    done: "종료된 클래스",
  }[status] || "마감";
}

function getClosedMessage(status) {
  return {
    upcoming: "아직 모집 전입니다.",
    closed: "마감된 클래스입니다.",
    done: "종료된 클래스입니다.",
  }[status] || "신청할 수 없는 클래스입니다.";
}

function canApply(privateClass) {
  const capacity = Number(privateClass.capacity || 0);
  const applicationCount = Number(privateClass.applicationCount || 0);

  return privateClass.status === "open" && (!capacity || applicationCount < capacity);
}

function getSelectedPrivateClass() {
  return privateClasses.find((privateClass) => privateClass.id === selectedPrivateClassId);
}

function renderPrivateClasses() {
  if (!privateGallery) return;

  const selectedPrivateClass = getSelectedPrivateClass();

  privateGallery.classList.toggle("is-detail", Boolean(selectedPrivateClass));

  if (selectedPrivateClass) {
    renderPrivateClassDetail(selectedPrivateClass);
    return;
  }

  renderPrivateClassList();
}

function renderPrivateClassList() {
  if (!privateClasses.length) {
    privateGallery.innerHTML = `<p class="empty-state">아직 등록된 개인 클래스가 없습니다.</p>`;
    setPrivateMessage("");
    return;
  }

  privateGallery.innerHTML = privateClasses.map((privateClass) => {
    const capacity = Number(privateClass.capacity || 0);
    const applicationCount = Number(privateClass.applicationCount || 0);
    const thumbnailUrl = privateClass.thumbnailDataUrl || privateClass.thumbnailUrl || "./assets/images/Logo.png";

    return `
      <article
        class="private-class-card"
        role="button"
        tabindex="0"
        data-open-private-class="${privateClass.id}"
      >
        <div class="private-class-card__visual">
          <img src="${escapeHtml(thumbnailUrl)}" alt="" />
          <span class="private-class-status private-class-status--${privateClass.status}">
            ${getStatusLabel(privateClass.status)}
          </span>
        </div>
        <div class="private-class-card__body">
          <div>
            <p class="gateway-card__label">${escapeHtml(privateClass.category)}</p>
            <h2>${escapeHtml(privateClass.title)}</h2>
            <p>${escapeHtml(privateClass.summary)}</p>
          </div>

          <div class="private-class-card__meta">
            <span>${formatClassDate(privateClass.eventAt)}</span>
            <span>${escapeHtml(privateClass.fee || "\uBBF8\uC815")}</span>
            <span>${applicationCount}/${capacity || "-"}\uBA85</span>
          </div>
        </div>
      </article>
    `;
  }).join("");

  setPrivateMessage("");
}

function renderPrivateClassDetail(privateClass) {
  const capacity = Number(privateClass.capacity || 0);
  const applicationCount = Number(privateClass.applicationCount || 0);
  const applyEnabled = canApply(privateClass);
  const thumbnailUrl = privateClass.thumbnailDataUrl || privateClass.thumbnailUrl || "./assets/images/Logo.png";

  privateGallery.innerHTML = `
    <article class="private-class-detail-post">
      <div class="private-class-detail-post__visual">
        <img src="${escapeHtml(thumbnailUrl)}" alt="" />
        <span class="private-class-status private-class-status--${privateClass.status}">
          ${getStatusLabel(privateClass.status)}
        </span>
      </div>

      <div class="private-class-detail-post__body">
        <p class="gateway-card__label">${escapeHtml(privateClass.category)}</p>
        <h1>${escapeHtml(privateClass.title)}</h1>
        <p class="private-class-lead">${escapeHtml(privateClass.summary)}</p>

        <section class="private-class-article">
          ${escapeHtml(privateClass.description).split("\n").filter(Boolean).map((line) => `<p>${line}</p>`).join("")}
        </section>

        <dl class="private-class-meta">
          <div>
            <dt>일시</dt>
            <dd>${formatClassDate(privateClass.eventAt)}</dd>
          </div>
          <div>
            <dt>참여비</dt>
            <dd>${escapeHtml(privateClass.fee)}</dd>
          </div>
          <div>
            <dt>모집</dt>
            <dd>${applicationCount}/${capacity || "-"}명</dd>
          </div>
        </dl>

        ${applyEnabled ? renderApplyForm(privateClass.id) : `
          <p class="private-class-closed">${getClosedMessage(privateClass.status)}</p>
        `}
      </div>
    </article>
  `;

  setPrivateMessage("");
}

function renderApplyForm(classId) {
  return `
    <form class="private-apply-form" data-private-apply-form="${classId}">
      <label>
        <span>이름</span>
        <input type="text" name="name" required />
      </label>
      <label>
        <span>학번</span>
        <input type="text" name="studentId" inputmode="numeric" required />
      </label>
      <button class="auth-button auth-button--primary" type="submit">
        신청하기
      </button>
    </form>
  `;
}

function bindPrivateClassInteractions() {
  privateGallery.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-private-class]");
    const detailPost = event.target.closest(".private-class-detail-post");

    if (openButton) {
      selectedPrivateClassId = openButton.dataset.openPrivateClass;
      renderPrivateClasses();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (selectedPrivateClassId && !detailPost) {
      selectedPrivateClassId = "";
      renderPrivateClasses();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  privateGallery.addEventListener("keydown", (event) => {
    const openCard = event.target.closest("[data-open-private-class]");

    if (!openCard || !["Enter", " "].includes(event.key)) return;

    event.preventDefault();
    selectedPrivateClassId = openCard.dataset.openPrivateClass;
    renderPrivateClasses();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  privateGallery.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-private-apply-form]");

    if (!form) return;

    event.preventDefault();

    const classId = form.dataset.privateApplyForm;
    const privateClass = privateClasses.find((item) => item.id === classId);
    const formData = new FormData(form);
    const submitButton = form.querySelector("button");

    if (!privateClass) return;

    try {
      submitButton.disabled = true;
      setPrivateMessage("클래스에 신청하고 있습니다.");
      await window.MartiniFirebase.submitPrivateClassApplication(privateClass, {
        name: String(formData.get("name") || "").trim(),
        studentId: String(formData.get("studentId") || "").trim(),
      });
      form.reset();
      setPrivateMessage("해당 클래스 신청이 완료되었습니다.");
    } catch (error) {
      setPrivateMessage(error.message || "해당 클래스 신청에 실패했습니다.");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function subscribePrivateClasses() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribePrivateClasses) {
    setPrivateMessage("게시물을 불러올 수 없습니다.");
    return;
  }

  martiniFirebase.subscribePrivateClasses((classes) => {
    privateClasses = classes;

    if (selectedPrivateClassId && !getSelectedPrivateClass()) {
      selectedPrivateClassId = "";
    }

    renderPrivateClasses();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindPrivateClassInteractions();
  subscribePrivateClasses();
});
