(function () {
  const NAV_ITEMS = [
    {
      label: "소개",
      links: [
        { label: "연혁", href: "./history.html" },
        { label: "파트너", href: "./partners.html" },
      ],
    },
    {
      label: "활동",
      links: [
        { label: "클래스", href: "./classes.html" },
        { label: "행사", href: "./events.html" },
      ],
    },
    {
      label: "기록",
      links: [
        { label: "칵테일", href: "./cocktails.html" },
        { label: "갤러리", href: "./gallery.html" },
      ],
    },
    {
      label: "신청",
      links: [{ label: "가입 안내", href: "./join-guide.html" }],
    },
    {
      label: "문의",
      links: [
        { label: "방문", href: "./visit.html" },
        { label: "온라인", href: "./online.html" },
      ],
    },
  ];

  function renderTopbar(target) {
    const navItems = NAV_ITEMS.map((item) => {
      const links = item.links
        .map((link) => `<a href="${link.href}">${link.label}</a>`)
        .join("");

      return `
        <div class="site-nav__item">
          <button type="button">${item.label}</button>
          <div class="site-nav__dropdown">
            ${links}
          </div>
        </div>
      `;
    }).join("");

    target.innerHTML = `
      <header class="topbar" aria-label="Martini navigation">
        <a class="brand" href="./index.html" aria-label="Martini home">
          <img src="./assets/images/Name.png" alt="Martini" />
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

  function initTopbar() {
    document.querySelectorAll("[data-shared-topbar]").forEach(renderTopbar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTopbar);
  } else {
    initTopbar();
  }
})();
