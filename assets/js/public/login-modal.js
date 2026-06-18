(function () {
  function bindLoginModal() {
    const modal = document.querySelector("[data-login-modal]");
    const openButton = document.querySelector("[data-login-modal-open]");
    const closeButtons = document.querySelectorAll("[data-login-modal-close]");

    if (!modal || !openButton) return;

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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeModal();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", bindLoginModal);
})();
