const loginForm = document.querySelector("[data-login-form]");
const loginButton = document.querySelector("[data-login-button]");
const logoutButton = document.querySelector("[data-logout-button]");
const adminButton = document.querySelector("[data-admin-button]");

function moveToPage(target) {
  if (!target) return;

  window.location.href = target;
}

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  logoutButton.disabled = isLoading;
  adminButton.disabled = isLoading;
}

function updateLoginActions(user, isAdmin) {
  loginButton.classList.toggle("is-hidden", Boolean(user && isAdmin));
  loginForm.querySelectorAll("input").forEach((input) => {
    input.disabled = Boolean(user && isAdmin);
  });
  logoutButton.classList.toggle("is-hidden", !user || !isAdmin);
  adminButton.classList.toggle("is-hidden", !user || !isAdmin);
}

function getLoginErrorMessage(error) {
  if (error.code === "auth/invalid-credential") {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (error.code === "auth/user-disabled") {
    return "비활성화된 계정입니다.";
  }

  if (error.code === "auth/too-many-requests") {
    return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }

  return "로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

function bindNavigation() {
  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      moveToPage(element.dataset.route);
    });
  });
}

async function handleLogin(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) {
    alert("Firebase 연결을 준비하지 못했습니다.");
    return;
  }

  try {
    setLoading(true);

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const { isAdmin, user } = await martiniFirebase.signInWithEmail(email, password);

    if (!isAdmin) {
      updateLoginActions(null, false);
      alert("등록된 임원 계정이 아닙니다.");
      return;
    }

    updateLoginActions(user, true);
    moveToPage("./index.html");
  } catch (error) {
    alert(getLoginErrorMessage(error));
  } finally {
    setLoading(false);
  }
}

async function handleLogout() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    setLoading(true);
    await martiniFirebase.signOutUser();
    updateLoginActions(null, false);
  } catch {
    alert("로그아웃 중 문제가 발생했습니다.");
  } finally {
    setLoading(false);
  }
}

function bindAuth() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) {
    alert("Firebase SDK를 불러오지 못했습니다.");
    return;
  }

  martiniFirebase.subscribeAuth(({ user, isAdmin }) => {
    updateLoginActions(user, isAdmin);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindAuth();

  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);
  adminButton.addEventListener("click", () => moveToPage("./admin.html"));
});
