"use strict";

/* ==========================================================
   SPARTA AI — PWA installer + Service Worker registration
   - لا يتعامل مع مفاتيح API أو بيانات حساسة.
   - زر التثبيت يظهر فقط عند توفر التثبيت المباشر أو تعليمات iOS.
   ========================================================== */
(function () {
  const INSTALL_FLAG = "tmd_pwa_installed";
  const SERVICE_WORKER_URL = "/service-worker.js";

  let deferredPrompt = null;
  let installMode = "hidden";

  const ICONS = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>'
  };

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* تجاهل */ }
  }

  const isStandalone = () => {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone
    );
  };

  const isIOS = () => {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  };

  const isAndroid = () => /android/i.test(navigator.userAgent);

  const canUseSW = () => {
    return "serviceWorker" in navigator &&
      (window.location.protocol === "https:" || ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname));
  };

  function toast(message) {
    if (window.TMDAI && typeof window.TMDAI.showToast === "function") {
      window.TMDAI.showToast(message);
      return;
    }
    let node = document.getElementById("pwaToast");
    if (!node) {
      node = document.createElement("div");
      node.id = "pwaToast";
      node.className = "toast";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    const safeMessage = String(message || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
    node.innerHTML = ICONS.check + `<span>${safeMessage}</span>`;
    node.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => node.classList.remove("show"), 3500);
  }

  function installButtons() {
    return [
      document.getElementById("installAppBtn"),
      document.getElementById("installFromSettingsBtn")
    ].filter(Boolean);
  }

  function setInstallUI(mode) {
    installMode = mode;
    const installed = isStandalone() || safeGet(INSTALL_FLAG) === "1";
    const show = !installed && mode !== "hidden";
    const label = mode === "ios" ? "إضافة للشاشة" : "تثبيت التطبيق";
    const title = mode === "prompt"
      ? "تثبيت SPARTA AI كتطبيق"
      : "عرض تعليمات تثبيت SPARTA AI على هذا الجهاز";

    installButtons().forEach((button) => {
      button.hidden = !show;
      button.setAttribute("aria-hidden", show ? "false" : "true");
      button.title = title;
      const text = button.querySelector(".topbar-btn-text") || button;
      if (text && button.id === "installAppBtn") text.textContent = label;
      if (button.id === "installFromSettingsBtn") button.innerHTML = ICONS.download + `<span>${mode === "ios" ? "طريقة الإضافة" : "تثبيت التطبيق"}</span>`;
    });

    const row = document.getElementById("installSettingRow");
    if (row) row.hidden = !show;
    const desc = document.getElementById("installSettingDesc");
    if (desc) {
      desc.textContent = mode === "ios"
        ? "على iPhone/iPad يتم التثبيت من زر المشاركة ثم إضافة إلى الشاشة الرئيسية."
        : "ثبّت SPARTA AI كتطبيق مستقل يعمل بواجهة PWA سريعة.";
    }
  }

  function deviceInstructions() {
    if (isIOS()) {
      return [
        "افتح الموقع من Safari على iPhone أو iPad.",
        "اضغط زر المشاركة في شريط Safari.",
        "اختر: إضافة إلى الشاشة الرئيسية.",
        "اضغط إضافة، ثم افتح SPARTA AI من أيقونة الشاشة الرئيسية."
      ];
    }

    if (isAndroid()) {
      return [
        "افتح الموقع من Chrome أو متصفح Android حديث.",
        "من قائمة المتصفح اختر: تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.",
        "إذا ظهر زر التثبيت داخل SPARTA AI فاضغطه مباشرة.",
        "بعد التثبيت افتح التطبيق لتظهر الفقاعة العائمة داخل تجربة التطبيق."
      ];
    }

    return [
      "استخدم Chrome أو Edge للحصول على زر تثبيت مباشر.",
      "أو افتح قائمة المتصفح وابحث عن Install app / تثبيت التطبيق.",
      "بعد التثبيت سيعمل SPARTA AI في نافذة مستقلة بدون واجهة المتصفح قدر الإمكان."
    ];
  }

  function showInstallGuide() {
    let sheet = document.getElementById("pwaInstallSheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "pwaInstallSheet";
      sheet.className = "pwa-install-sheet hidden";
      sheet.innerHTML = `
        <div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
          <button class="pwa-install-close" type="button" aria-label="إغلاق">${ICONS.close}</button>
          <div class="pwa-install-icon" aria-hidden="true">${ICONS.download}</div>
          <h2 id="pwaInstallTitle">تثبيت SPARTA AI</h2>
          <p class="pwa-install-lead">يمكنك إضافة SPARTA AI إلى الشاشة الرئيسية كتطبيق ويب سريع. لا يتم تخزين أي مفاتيح API داخل التطبيق.</p>
          <ol class="pwa-install-steps"></ol>
          <button class="btn btn-primary pwa-install-ok" type="button">تم</button>
        </div>
      `;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (event) => {
        if (event.target === sheet || event.target.closest(".pwa-install-close") || event.target.closest(".pwa-install-ok")) {
          sheet.classList.add("hidden");
        }
      });
    }

    const steps = sheet.querySelector(".pwa-install-steps");
    if (steps) {
      steps.innerHTML = deviceInstructions().map((step) => `<li>${step}</li>`).join("");
    }
    sheet.classList.remove("hidden");
  }

  async function runInstallPrompt() {
    if (isStandalone()) {
      setInstallUI("hidden");
      toast("SPARTA AI مثبت بالفعل كتطبيق.");
      return;
    }

    if (!deferredPrompt) {
      showInstallGuide();
      return;
    }

    const promptEvent = deferredPrompt;
    deferredPrompt = null;

    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === "accepted") {
        safeSet(INSTALL_FLAG, "1");
        setInstallUI("hidden");
        toast("تم تثبيت SPARTA AI بنجاح.");
      } else {
        setInstallUI("prompt");
      }
    } catch (error) {
      console.warn("PWA install prompt failed:", error?.message || error);
      showInstallGuide();
      setInstallUI(isIOS() ? "ios" : "hidden");
    }
  }

  function bindButtons() {
    installButtons().forEach((button) => {
      if (button.dataset.pwaBound === "1") return;
      button.dataset.pwaBound = "1";
      button.addEventListener("click", runInstallPrompt);
    });
  }

  function registerServiceWorker() {
    if (!canUseSW()) return;

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("تم تجهيز تحديث جديد لـ SPARTA AI وسيُطبق عند إعادة فتح التطبيق.");
            }
          });
        });
      } catch (error) {
        console.warn("Service Worker registration failed:", error?.message || error);
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    bindButtons();
    setInstallUI("prompt");
  });

  window.addEventListener("appinstalled", () => {
    safeSet(INSTALL_FLAG, "1");
    deferredPrompt = null;
    setInstallUI("hidden");
    toast("تم تثبيت SPARTA AI كتطبيق بنجاح.");
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    if (isStandalone() || safeGet(INSTALL_FLAG) === "1") {
      setInstallUI("hidden");
    } else if (isIOS()) {
      setInstallUI("ios");
    } else {
      setInstallUI(deferredPrompt ? "prompt" : "hidden");
    }
  });

  registerServiceWorker();
})();
