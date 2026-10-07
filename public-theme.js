"use strict";

(function () {
  const STORAGE_KEY = "tmd_theme";
  const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>'
  };

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
    } catch (error) {
      return "dark";
    }
  }

  function applyTheme(theme, button) {
    const resolved = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = resolved;
    if (document.body) document.body.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "light" ? "#FFFFFF" : "#212121");
    if (button) {
      button.innerHTML = resolved === "light" ? ICONS.moon : ICONS.sun;
      button.setAttribute("aria-label", resolved === "light" ? "تفعيل المظهر الداكن" : "تفعيل المظهر الفاتح");
      button.title = button.getAttribute("aria-label");
    }
  }

  applyTheme(readTheme());

  document.addEventListener("DOMContentLoaded", () => {
    const nav = document.querySelector(".page-nav");
    if (!nav || !nav.parentElement) return;

    const wrapper = document.createElement("div");
    wrapper.className = "page-nav-wrap";
    nav.parentElement.insertBefore(wrapper, nav);
    wrapper.appendChild(nav);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-theme-toggle";
    wrapper.appendChild(button);
    applyTheme(readTheme(), button);

    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(STORAGE_KEY, next); } catch (error) { /* Local storage may be unavailable. */ }
      applyTheme(next, button);
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyTheme(readTheme(), document.querySelector(".page-theme-toggle"));
  });
})();
