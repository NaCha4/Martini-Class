const ROUTE_SELECTOR = "[data-route]";

function moveToPage(target) {
  if (!target) return;

  window.location.href = target;
}

function updateAdminNavigation(isAdmin) {
  const adminCard = document.querySelector("[data-admin-card]");
  const loginButton = document.querySelector(".login-link");

  if (!loginButton) return;

  adminCard?.classList.toggle("is-hidden", !isAdmin);
  loginButton.textContent = isAdmin ? "로그아웃" : "로그인";
  loginButton.dataset.route = isAdmin ? "" : "./login.html";
}

function readAdminSession() {
  return window.MartiniFirebase?.readAdminSession() ?? false;
}

function bindNavigation() {
  document.querySelectorAll(ROUTE_SELECTOR).forEach((element) => {
    element.addEventListener("click", async () => {
      if (element.classList.contains("login-link") && readAdminSession()) {
        await window.MartiniFirebase?.signOutUser();
        updateAdminNavigation(false);
        return;
      }

      moveToPage(element.dataset.route);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  updateAdminNavigation(readAdminSession());

  window.MartiniFirebase?.subscribeAuth(({ isAdmin }) => {
    updateAdminNavigation(isAdmin);
  });
});

window.MartiniMain = {
  updateAdminNavigation,
};
