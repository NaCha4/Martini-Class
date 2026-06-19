(function () {
  function bindAdminMenu() {
    const buttons = Array.from(document.querySelectorAll("[data-admin-menu]"));
    const panels = Array.from(document.querySelectorAll("[data-admin-panel]"));

    if (!buttons.length || !panels.length) {
      return;
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.adminMenu;
        const currentPanel = panels.find((panel) => !panel.hidden);
        const nextPanel = panels.find((panel) => panel.dataset.adminPanel === target);

        if (!nextPanel || currentPanel === nextPanel) {
          return;
        }

        buttons.forEach((item) => {
          const isActive = item === button;
          item.classList.toggle("is-active", isActive);
          item.setAttribute("aria-pressed", String(isActive));
        });

        currentPanel?.classList.add("is-leaving");

        window.setTimeout(() => {
          panels.forEach((panel) => {
            panel.classList.remove("is-active", "is-leaving");
            panel.hidden = true;
          });

          nextPanel.hidden = false;
          window.requestAnimationFrame(() => {
            nextPanel.classList.add("is-active");
          });
        }, 140);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", bindAdminMenu);
})();


