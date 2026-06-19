(function () {
  function getRootPath() {
    return document.querySelector("script[data-root]")?.dataset.root || "./";
  }

  async function submitMemberLogin(form) {
    const status = form.querySelector("[data-member-login-status]");
    const codeInput = form.querySelector('input[name="accessCode"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const rootPath = getRootPath();
    const targetUrl = form.getAttribute("action") || `${rootPath}member/index.html`;

    status.textContent = "로그인 중입니다.";
    submitButton.disabled = true;

    try {

      const firebaseClientUrl = new URL(`${rootPath}assets/js/firebase-client.js`, window.location.href).href;
      const { signInMemberWithCode } = await import(firebaseClientUrl);

      await signInMemberWithCode(codeInput.value);
      window.location.href = targetUrl;
    } catch (error) {
      status.textContent = error.message || "로그인에 실패했습니다.";
      submitButton.disabled = false;
    }
  }

  async function submitAdminLogin(form) {
    const status = form.querySelector("[data-admin-login-status]");
    const [emailInput, passwordInput] = form.querySelectorAll("input");
    const submitButton = form.querySelector('button[type="submit"]');
    const rootPath = getRootPath();

    status.textContent = "로그인 중입니다.";
    submitButton.disabled = true;

    try {

      const firebaseClientUrl = new URL(`${rootPath}assets/js/firebase-client.js`, window.location.href).href;
      const { signInAdmin } = await import(firebaseClientUrl);
      await signInAdmin(emailInput.value.trim(), passwordInput.value);
      window.location.href = form.getAttribute("action") || `${rootPath}admin/index.html`;
    } catch (error) {
      status.textContent = error.message || "로그인에 실패했습니다.";
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
        const rootPath = getRootPath();

        window.location.href = `${rootPath}admin/index.html`;
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
