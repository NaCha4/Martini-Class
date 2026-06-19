(function () {
  const ROOT_PATH = document.currentScript?.dataset.root || "./";
  const NAV_ITEMS = [
    {
      label: "소개",
      links: [
        { label: "연혁", href: "about/history.html" },
        { label: "시설", href: "about/facilities.html" },
        { label: "파트너", href: "about/partners.html" },
      ],
    },
    {
      label: "활동",
      links: [
        { label: "클래스", href: "activities/classes.html" },
        { label: "행사", href: "activities/events.html" },
      ],
    },
    {
      label: "기록",
      links: [
        { label: "칵테일", href: "records/cocktails.html" },
        { label: "갤러리", href: "records/gallery.html" },
      ],
    },
    {
      label: "신청",
      links: [{ label: "가입 안내", href: "join/join-guide.html" }],
    },
    {
      label: "문의",
      links: [
        { label: "문의처", href: "contact/contact.html" },
        { label: "자주 묻는 질문", href: "contact/faq.html" },
      ],
    },
  ];

  function fromRoot(path) {
    return `${ROOT_PATH}${path}`;
  }

  function closeAllMenus() {
    document.querySelectorAll(".site-nav__item.is-open").forEach((item) => {
      item.classList.remove("is-open");
      item.querySelector("button")?.setAttribute("aria-expanded", "false");
    });
  }

  function renderTopbar(target) {
    const navItems = NAV_ITEMS.map((item) => {
      const links = item.links
        .map((link) => `<a href="${fromRoot(link.href)}">${link.label}</a>`)
        .join("");

      return `
        <div class="site-nav__item">
          <button type="button" aria-expanded="false">${item.label}</button>
          <div class="site-nav__dropdown">
            ${links}
          </div>
        </div>
      `;
    }).join("");

    target.innerHTML = `
      <header class="topbar" aria-label="Martini navigation">
        <a class="brand" href="${fromRoot("index.html")}" aria-label="Martini home">
          <img src="${fromRoot("assets/images/Name.png")}" alt="Martini" />
        </a>

        <div class="topbar__actions">
          <nav class="site-nav" aria-label="홈페이지 메뉴">
            ${navItems}
          </nav>

          <button class="login-button" type="button" data-login-modal-open>로그인</button>
        </div>
      </header>
    `;
  }

  function bindMobileMenus() {
    document.querySelectorAll(".site-nav__item > button").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".site-nav__item");
        const isOpen = item?.classList.contains("is-open");

        closeAllMenus();

        if (!isOpen && item) {
          item.classList.add("is-open");
          button.setAttribute("aria-expanded", "true");
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest(".site-nav__item")) {
        return;
      }

      closeAllMenus();
    });
  }

  function initTopbar() {
    document.querySelectorAll("[data-shared-topbar]").forEach(renderTopbar);
    bindMobileMenus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTopbar);
  } else {
    initTopbar();
  }
})();
