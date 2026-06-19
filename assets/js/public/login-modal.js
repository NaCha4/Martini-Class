(function () {
  const LOGIN_PROGRESS_MESSAGE = "\uB85C\uADF8\uC778 \uC911\uC785\uB2C8\uB2E4.";
  const LOGIN_FAILURE_MESSAGE = "\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  function getRootPath() {
    return document.querySelector("script[data-root]")?.dataset.root || "./";
  }

  function getLoginModalUrl() {
    const rootPath = getRootPath();
    const loginUrl = new URL(`${rootPath}index.html`, window.location.href);

    loginUrl.searchParams.set("login", "open");
    return loginUrl.href;
  }

  async function submitMemberLogin(form) {
    const status = form.querySelector("[data-member-login-status]");
    const codeInput = form.querySelector('input[name="accessCode"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const rootPath = getRootPath();
    const targetUrl = form.getAttribute("action") || `${rootPath}member/index.html`;

    status.textContent = LOGIN_PROGRESS_MESSAGE;
    submitButton.disabled = true;

    try {
      const firebaseClientUrl = new URL(`${rootPath}assets/js/firebase-client.js`, window.location.href).href;
      const { signInMemberWithCode } = await import(firebaseClientUrl);

      await signInMemberWithCode(codeInput.value);
      window.location.href = targetUrl;
    } catch (error) {
      status.textContent = error.message || LOGIN_FAILURE_MESSAGE;
      submitButton.disabled = false;
    }
  }

  async function submitAdminLogin(form) {
    const status = form.querySelector("[data-admin-login-status]");
    const [emailInput, passwordInput] = form.querySelectorAll("input");
    const submitButton = form.querySelector('button[type="submit"]');
    const rootPath = getRootPath();

    status.textContent = LOGIN_PROGRESS_MESSAGE;
    submitButton.disabled = true;

    try {
      const firebaseClientUrl = new URL(`${rootPath}assets/js/firebase-client.js`, window.location.href).href;
      const { signInAdmin } = await import(firebaseClientUrl);

      await signInAdmin(emailInput.value.trim(), passwordInput.value);
      window.location.href = form.getAttribute("action") || `${rootPath}admin/index.html`;
    } catch (error) {
      status.textContent = error.message || LOGIN_FAILURE_MESSAGE;
      submitButton.disabled = false;
    }
  }

  function bindLoginModal() {
    const modal = document.querySelector("[data-login-modal]");
    const openButton = document.querySelector("[data-login-modal-open]");
    const closeButtons = document.querySelectorAll("[data-login-modal-close]");
    const adminLoginForm = document.querySelector("[data-admin-login-form]");
    const memberLoginForm = document.querySelector("[data-member-login-form]");

    if (!openButton) return;

    if (!modal) {
      openButton.addEventListener("click", () => {
        window.location.href = getLoginModalUrl();
      });
      return;
    }

    const firstInput = modal.querySelector("input");

    function openModal() {
      modal.hidden = false;
      document.body.classList.add("is-modal-open");
      requestAnimationFrame(() => {
        firstInput?.focus();
      });
    }

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
      openButton.focus();
    }

    openButton.addEventListener("click", openModal);

    if (new URLSearchParams(window.location.search).get("login") === "open") {
      openModal();
      const cleanUrl = new URL(window.location.href);

      cleanUrl.searchParams.delete("login");
      window.history.replaceState({}, "", cleanUrl);
    }

    closeButtons.forEach((button) => {
      button.addEventListener("click", closeModal);
    });

    adminLoginForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAdminLogin(adminLoginForm);
    });

    memberLoginForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitMemberLogin(memberLoginForm);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeModal();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", bindLoginModal);
})();