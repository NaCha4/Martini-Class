(function () {
  function moveToPage(target) {
    if (!target) return;

    window.location.href = target;
  }

  function bindRouteNavigation(options = {}) {
    const selector = options.selector || "[data-route]";

    document.querySelectorAll(selector).forEach((element) => {
      element.addEventListener("click", (event) => {
        options.beforeRoute?.(event, element);

        if (event.defaultPrevented) return;

        moveToPage(element.dataset.route);
      });
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  window.MartiniUtils = {
    bindRouteNavigation,
    escapeHtml,
    moveToPage,
    normalizeDate,
  };
})();
