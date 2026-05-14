const ROUTE_SELECTOR = "[data-route]";
const { bindRouteNavigation, moveToPage } = window.MartiniUtils;

function updateAdminNavigation(isAdmin) {
  const adminCard = document.querySelector("[data-admin-card]");
  const attendanceCard = document.querySelector("[data-attendance-card]");
  const loginButton = document.querySelector(".login-link");

  if (!loginButton) return;

  adminCard?.classList.toggle("is-hidden", !isAdmin);
  attendanceCard?.classList.toggle("is-hidden", !isAdmin);
  loginButton.textContent = isAdmin ? "로그아웃" : "로그인";
  loginButton.dataset.route = isAdmin ? "" : "./login.html";
}

function readAdminSession() {
  return window.MartiniFirebase?.readAdminSession() ?? false;
}

function bindNavigation() {
  bindRouteNavigation({
    selector: ROUTE_SELECTOR,
    beforeRoute: async (event, element) => {
      if (element.classList.contains("login-link") && readAdminSession()) {
        event.preventDefault();
        await window.MartiniFirebase?.signOutUser();
        updateAdminNavigation(false);
      }
    },
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
