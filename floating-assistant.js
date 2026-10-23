/* ==========================================================
   AURA Floating Bubble AI — المساعد العائم الشفاف فوق النظام
   ----------------------------------------------------------
   • فقاعة بلورية عائمة على وجه النظام بشعار طيفي جديد كليًا.
   • عند الضغط على الفقاعة: تضيء حدود الشاشة بالكامل بألوان
     متدفقة (Ambient Screen-Edge Glow)، ثم يظهر شريط الكتابة
     الزجاجي في أسفل الشاشة مع خلفية شفافة تمامًا.
   • وضع البث المباشر للشاشة مع الذكاء الاصطناعي (Live Screen AI):
     متابعة حية للشاشة + كشف تغيّر المشهد + محادثة صوتية ونصية.
   • متوافق مع تطبيق Android الأصلي (APK) والويب وDocument PiP.
   ========================================================== */
(function () {
  "use strict";

  if (window.__tmdFloatingAssistant) return;

  /* ============ إعدادات عامة ============ */
  const STORE_KEY = "tmd_float_state";
  const CHAT_KEY = "tmd_float_chat";
  const ENABLE_KEY = "tmd_float_enabled";
  const PLAN_KEY = "tmd_float_plan";

  const baseHref = (window.location && window.location.href) || "https://t-m-d-ai.vercel.app/";
  const API_URL = new URL("/api/chat", baseHref).href;
  const SITE_URL = new URL("/", baseHref).href;

  const TEXT_MODEL = "openai/gpt-oss-120b";
  const VISION_MODEL = "qwen/qwen3.8-27b";
  const MINIMAX_MODEL = "MiniMax-M3";
  const MAX_TURNS = 14;
  const REQUEST_TIMEOUT_MS = 45000;
  const LIVE_WATCH_INTERVAL_MS = 2400;
  const LIVE_COOLDOWN_MS = 9500;
  const LIVE_DIFF_THRESHOLD = 18;
  const LIVE_STABLE_MAX_DELTA = 7;

  const SYSTEM_PROMPT =
    "أنت المساعد الذكي العائم فوق شاشة الهاتف والنظام (AURA · SPARTA AI). " +
    "أجب بإيجاز شديد وبأسلوب طبيعي واضح ومباشر مناسب للقراءة الصوتية السريعة (2-4 جمل غالبًا) ما لم يطلب المستخدم التفصيل. " +
    "تجنّب الحشو والرموز الزائدة. " +
    "إذا أُرسلت لك لقطة من شاشة المستخدم فركّز على محتوى التطبيق أو الصفحة الظاهرة للمستخدم وتجاهل شريط الدردشة الزجاجي الصغير في أسفل الشاشة، وساعده عمليًا فيما يراه أمامه. " +
    "مصمم ومطور الأداة: من معتصم عمرو الى M.";

  const LIVE_SYSTEM_PROMPT =
    SYSTEM_PROMPT +
    " أنت الآن في وضع «البث المباشر للشاشة»: المستخدم يشارك شاشته معك مباشرة لحظة بلحظة. " +
    "تحدّث كرفيق ذكي يرى الشاشة الآن أمامه، وقدّم ملاحظة عملية فورية ومختصرة جدًا (جملتين إلى 3 جمل كحد أقصى).";

  const CHIPS = [
    "ماذا على شاشتي الآن؟",
    "لخّص ما أمامي",
    "ترجم الشاشة للعربية",
    "ساعدني في الخطوة التالية"
  ];

  /* ============ الشعار الجديد كليًا: بلورة الطيف الذكي (Prism-Aura Orb) ============ */
  let logoCounter = 0;
  function auraLogoSVG(className) {
    logoCounter += 1;
    const ringId = "tmdAuraRing_" + logoCounter;
    const starId = "tmdAuraStar_" + logoCounter;
    return (
      '<svg class="' + (className || "tmd-aura-logo") + '" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">' +
      "<defs>" +
      '<linearGradient id="' + ringId + '" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0%" stop-color="#00F2FE"/>' +
      '<stop offset="32%" stop-color="#4F7BFF"/>' +
      '<stop offset="64%" stop-color="#A855F7"/>' +
      '<stop offset="86%" stop-color="#FF4FD8"/>' +
      '<stop offset="100%" stop-color="#FFB84D"/>' +
      "</linearGradient>" +
      '<linearGradient id="' + starId + '" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0%" stop-color="#FFFFFF"/>' +
      '<stop offset="38%" stop-color="#8BF6FF"/>' +
      '<stop offset="72%" stop-color="#C084FC"/>' +
      '<stop offset="100%" stop-color="#FF6FD8"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<g transform="rotate(-26 32 32)">' +
      '<ellipse cx="32" cy="32" rx="23" ry="9.5" stroke="url(#' + ringId + ')" stroke-opacity="0.72" stroke-width="1.8"/>' +
      "</g>" +
      '<g transform="rotate(30 32 32)">' +
      '<ellipse cx="32" cy="32" rx="22" ry="9" stroke="#74E7FF" stroke-opacity="0.38" stroke-width="1.3" stroke-dasharray="3.5 3"/>' +
      "</g>" +
      '<path d="M32 10C33.9 22.3 41.7 30.1 54 32C41.7 33.9 33.9 41.7 32 54C30.1 41.7 22.3 33.9 10 32C22.3 30.1 30.1 22.3 32 10Z" fill="url(#' + starId + ')"/>' +
      '<circle cx="32" cy="32" r="4.2" fill="#FFFFFF" fill-opacity="0.95"/>' +
      '<path d="M47 13C47.6 16.2 49.8 18.4 53 19C49.8 19.6 47.6 21.8 47 25C46.4 21.8 44.2 19.6 41 19C44.2 18.4 46.4 16.2 47 13Z" fill="#00F2FE"/>' +
      '<circle cx="16.5" cy="45.5" r="2" fill="#FF6FD8"/>' +
      "</svg>"
    );
  }

  /* أيقونات خطية نظيفة */
  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>',
    unpin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    eyeOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="3"/><circle cx="12" cy="10.5" r="2.3" fill="currentColor" stroke="none"/><path d="M8.5 8a5 5 0 0 0 0 5"/><path d="M15.5 8a5 5 0 0 1 0 5"/><path d="M8 20h8"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>',
    speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="2.2"/></svg>',
    bubble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="9.5" cy="9.5" r="1.5" fill="currentColor" stroke="none"/></svg>'
  };

  /* ============ دالة حساب تغيّر إطارات البث المباشر (16x16 Luminance Diff) ============ */
  function signatureFromRGBA(rgba, width, height) {
    const grid = 16;
    const out = new Uint8Array(grid * grid);
    if (!rgba || width < 1 || height < 1) return out;
    for (let gy = 0; gy < grid; gy += 1) {
      const sy = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / grid));
      for (let gx = 0; gx < grid; gx += 1) {
        const sx = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / grid));
        const idx = (sy * width + sx) * 4;
        const r = rgba[idx] || 0;
        const g = rgba[idx + 1] || 0;
        const b = rgba[idx + 2] || 0;
        out[gy * grid + gx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
    }
    return out;
  }

  function signatureDiffPercent(sigA, sigB) {
    if (!sigA || !sigB || sigA.length !== sigB.length || !sigA.length) return 100;
    let totalDiff = 0;
    for (let i = 0; i < sigA.length; i += 1) {
      totalDiff += Math.abs(sigA[i] - sigB[i]);
    }
    return Math.min(100, Math.round((totalDiff / (sigA.length * 255)) * 100 * 2.4));
  }

  /* ============ الحالة ============ */
  const state = {
    open: false,
    streamMinimized: false,
    busy: false,
    speaking: false,
    speak: true,
    listening: false,
    sharing: false,
    liveAutoWatch: true,
    bursting: false,
    pinned: false,
    enabled: true,
    abortReason: "",
    controller: null,
    stream: null,
    attachment: null,
    messages: [],
    lastLiveTurnAt: 0,
    fab: null,
    win: null,
    aura: null
  };

  let pipWindow = null;
  let pipAura = null;
  let pendingReopen = false;
  let burstTimer = null;
  let openFocusTimer = null;
  let initialLiveTimer = null;
  let liveWatchTimer = null;
  let liveThumbTimer = null;
  let baselineSig = null;
  let prevTickSig = null;

  const store = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        try { localStorage.removeItem(key); } catch (err) { /* تجاهل */ }
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* تجاهل */ }
    },
    readFlag(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return raw !== "0" && raw !== "false";
      } catch (e) {
        return fallback;
      }
    },
    writeFlag(key, value) {
      try { localStorage.setItem(key, value ? "1" : "0"); } catch (e) { /* تجاهل */ }
    }
  };

  state.enabled = store.readFlag(ENABLE_KEY, true);

  const plan = {
    isPro() {
      return store.read(PLAN_KEY, "free") === "minimax";
    },
    setPro(value) {
      store.write(PLAN_KEY, value ? "minimax" : "free");
      updatePlanUI();
    }
  };

  function persistableMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
      .filter((m) => m && typeof m.content === "string")
      .map((m) => ({
        role: m.role === "user" || m.role === "assistant" || m.role === "error" ? m.role : "assistant",
        content: m.content.slice(0, 12000)
      }))
      .slice(-MAX_TURNS * 2);
  }

  /* ============ مزامنة المحادثة بين النوافذ ============ */
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("tmd_float_sync") : null;
  if (channel && typeof channel.unref === "function") {
    channel.unref();
  }
  if (channel) {
    channel.onmessage = (event) => {
      const data = event && event.data;
      if (!data || data.type !== "chat" || state.busy) return;
      if (Array.isArray(data.messages)) {
        state.messages = data.messages.filter((m) => m && typeof m.content === "string");
        renderAll();
      }
    };
  }

  function broadcastChat() {
    if (channel) {
      try { channel.postMessage({ type: "chat", messages: persistableMessages(state.messages) }); } catch (e) { /* تجاهل */ }
    }
  }

  /* ============ جسر Android الأصلي ============ */
  const androidBridge = window.TmdAndroid || null;
  const searchParams = new URLSearchParams((window.location && window.location.search) || "");
  const isAndroidApp = Boolean(androidBridge) || searchParams.get("android") === "1";

  if (isAndroidApp && document.body) {
    document.body.classList.add("tmd-android-overlay");
  }

  /* ============ 1. بناء طبقة الإضاءة المحيطة بالشاشة (Screen-Edge Aura) ============ */
  const aura = document.createElement("div");
  aura.className = "tmd-edge-aura";
  aura.setAttribute("aria-hidden", "true");
  aura.innerHTML =
    '<div class="tmd-edge-aura__bloom"></div>' +
    '<div class="tmd-edge-aura__rim"></div>';

  /* ============ 2. بناء الفقاعة البلورية العائمة (Floating Bubble) ============ */
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "tmd-fab";
  fab.setAttribute("aria-label", "اضغط لتشغيل الفقاعة الذكية");
  fab.title = "اضغط للتحدث مع الذكاء الاصطناعي (اسحب لتحريك الفقاعة)";
  fab.innerHTML =
    '<span class="tmd-fab__halo"></span>' +
    '<span class="tmd-fab__ring"></span>' +
    '<span class="tmd-fab__core"></span>' +
    '<span class="tmd-fab__icon">' + auraLogoSVG() + "</span>" +
    '<span class="tmd-fab__badge" data-el="badge">LIVE</span>' +
    '<span class="tmd-fab__tag" data-el="fabTag">المساعد مثبّت فوق التطبيقات</span>';

  /* ============ 3. بناء الشريط السفلي الزجاجي الشفاف (Bottom Chat Dock) ============ */
  const win = document.createElement("section");
  win.className = "tmd-mini";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "شريط المساعد الذكي الشفاف");
  win.setAttribute("aria-hidden", "true");
  win.innerHTML =
    /* شريط البث المباشر للشاشة (يظهر عند تفعيل البث المباشر) */
    '<div class="tmd-live-bar" data-el="screenBox">' +
    '<div class="tmd-live-bar__preview">' +
    '<video data-el="video" muted playsinline autoplay></video>' +
    '<img data-el="liveThumb" alt="معاينة البث المباشر للشاشة" hidden>' +
    "</div>" +
    '<div class="tmd-live-bar__status">' +
    '<span class="tmd-live-dot"></span>' +
    '<span data-el="liveLabel">بث مباشر للشاشة · يرى شاشتك الآن</span>' +
    "</div>" +
    '<button type="button" class="tmd-live-pill is-active" data-el="autoWatchBtn" title="متابعة تغيرات الشاشة تلقائيًا">متابعة حية</button>' +
    '<button type="button" class="tmd-live-pill" data-el="snapNowBtn" title="تحليل الشاشة الحالية فورًا">حلّل الآن</button>' +
    '<button type="button" class="tmd-live-pill tmd-live-pill--stop" data-el="stopLiveBtn" title="إنهاء البث المباشر">إنهاء</button>' +
    "</div>" +

    /* لوحة الباقات الشفافة (تفتح عند الطلب فقط) */
    '<div class="tmd-plan-sheet" data-el="planSheet" hidden>' +
    '<div class="tmd-plan-sheet__inner">' +
    '<div class="tmd-plan-sheet__head">' +
    "<strong>الباقات الذكية</strong>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="planClose" title="إغلاق">' + ICONS.close + "</button>" +
    "</div>" +
    '<div class="tmd-plan-card" data-plan="free">' +
    '<div class="tmd-plan-card__title">المجانية</div>' +
    '<div class="tmd-plan-card__desc">محادثة فورية وبث مباشر للشاشة مع الرؤية الذكية.</div>' +
    '<button type="button" class="tmd-plan-card__btn" data-el="planFree">الخطة الحالية</button>' +
    "</div>" +
    '<div class="tmd-plan-card tmd-plan-card--pro" data-plan="minimax">' +
    '<div class="tmd-plan-card__title">SPARTA Max <span class="tmd-plan-card__tag">PRO</span></div>' +
    '<div class="tmd-plan-card__desc">MiniMax M3 ومهمة Pro يومية داخل الأداة الكاملة. لا تشمل الخطة أرصدة يومية تلقائية.</div>' +
    '<button type="button" class="tmd-plan-card__btn tmd-plan-card__btn--pro" data-el="planPro">يتطلب اشتراكًا مدفوعًا</button>' +
    "</div>" +
    "</div>" +
    "</div>" +

    /* رسائل عائمة زجاجية فوق شريط الكتابة (تختفي تلقائيًا قبل بدء المحادثة لتبقى الشاشة مكشوفة) */
    '<div class="tmd-stream-wrap" data-el="streamWrap" hidden>' +
    '<div class="tmd-stream-bar" data-el="head">' +
    '<div class="tmd-stream-bar__info">' +
    '<span class="tmd-stream-bar__dot"></span>' +
    '<span class="tmd-mini__status" data-el="status">جاهز للتفاعل</span>' +
    "</div>" +
    '<div class="tmd-stream-bar__actions">' +
    '<button type="button" class="tmd-plan-chip" data-el="planBtn" title="خطة الذكاء الاصطناعي">' +
    '<span data-el="planName">مجاني</span>' +
    '<span class="tmd-plan-chip__credits" data-el="planCredits">—</span>' +
    "</button>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="clear" title="مسح المحادثة">' + ICONS.trash + "</button>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="collapse" title="طي/إظهار البطاقات العائمة">' + ICONS.eyeOff + "</button>" +
    "</div>" +
    "</div>" +
    '<div class="tmd-mini__body" data-el="body"></div>' +
    "</div>" +

    /* معاينة الصورة المرفقة */
    '<div class="tmd-attachment" data-el="attachment" hidden>' +
    '<img data-el="attachmentImage" alt="معاينة الصورة المرفقة">' +
    '<div class="tmd-attachment__info"><strong data-el="attachmentName">صورة</strong><span>جاهزة للتحليل مع رسالتك</span></div>' +
    '<button type="button" class="tmd-mini__head-btn" data-el="removeAttachment" title="إزالة المرفق">' + ICONS.close + "</button>" +
    "</div>" +

    /* شريط الاختصارات السريعة العائم بشفافية زجاجية */
    '<div class="tmd-quick-strip" data-el="quickStrip">' +
    '<div style="display:contents" data-el="chips"></div>' +
    '<button type="button" class="tmd-mini-util" data-el="imageBtn" title="إرفاق صورة من الجهاز">' + ICONS.image + "<span>صورة</span></button>" +
    '<button type="button" class="tmd-mini-util is-active" data-el="speakBtn" title="تفعيل/كتم النطق الصوتي">' + ICONS.speak + "<span>النطق</span></button>" +
    '<button type="button" class="tmd-mini-util" data-el="pinBtn" title="تثبيت كنافذة عائمة فوق البرامج">' + ICONS.pin + "<span>تثبيت</span></button>" +
    '<button type="button" class="tmd-mini-util" data-el="close" title="إخفاء الشريط والعودة إلى الفقاعة">' + ICONS.bubble + "<span>فقاعة</span></button>" +
    "</div>" +

    /* كبسولة الشات والكتابة السفلية (مكان الكتابة تحت) */
    '<input type="file" data-el="imageInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' +
    '<div class="tmd-composer-dock" data-el="composerDock">' +
    '<button type="button" class="tmd-dock-orb" data-el="orbBtn" title="تصغير إلى الفقاعة العائمة">' + auraLogoSVG() + "</button>" +
    '<textarea class="tmd-mini__input" data-el="input" rows="1" placeholder="اكتب رسالتك أو اضغط بث مباشر ليرى شاشتك…"></textarea>' +
    '<button type="button" class="tmd-dock-btn tmd-dock-btn--live" data-el="shareBtn" title="بث مباشر للشاشة مع الذكاء الاصطناعي">' + ICONS.live + "<span>بث مباشر</span></button>" +
    '<button type="button" class="tmd-dock-btn tmd-dock-btn--icon" data-el="micBtn" title="تحدّث بصوتك">' + ICONS.mic + "</button>" +
    '<button type="button" class="tmd-mini__send" data-el="send" title="إرسال">' + ICONS.send + "</button>" +
    "</div>" +
    '<div class="tmd-signature" data-el="signature">من معتصم عمرو الى M</div>';

  const el = {};
  win.querySelectorAll("[data-el]").forEach((node) => {
    el[node.dataset.el] = node;
  });
  el.badge = fab.querySelector("[data-el=badge]");
  el.fabTag = fab.querySelector("[data-el=fabTag]");

  const labels = {
    pinBtn: "تثبيت المساعد فوق التطبيقات",
    clear: "بدء محادثة جديدة",
    collapse: "إخفاء أو إظهار الردود العائمة",
    close: "العودة إلى الفقاعة العائمة",
    orbBtn: "العودة إلى الفقاعة العائمة",
    planClose: "إغلاق لوحة الباقات",
    shareBtn: "بدء أو إيقاف البث المباشر للشاشة",
    micBtn: "التحدث الصوتي مع المساعد",
    send: "إرسال الرسالة"
  };
  Object.keys(labels).forEach((key) => el[key]?.setAttribute("aria-label", labels[key]));

  document.body.appendChild(aura);
  document.body.appendChild(fab);
  document.body.appendChild(win);
  state.aura = aura;
  state.fab = fab;
  state.win = win;

  /* ============ مزامنة الإضاءة المحيطة بالشاشة + ارتفاع شريط Android ============ */
  function currentAuraMode() {
    if (!state.enabled || (!state.open && !state.sharing)) return "hidden";
    if (state.bursting) return "burst";
    if (state.busy) return "thinking";
    if (state.listening) return "listening";
    if (state.sharing) return "live";
    return "idle";
  }

  function applyAuraElement(targetAura, mode) {
    if (!targetAura) return;
    const active = mode !== "hidden";
    targetAura.classList.toggle("is-active", active);
    targetAura.classList.toggle("is-burst", mode === "burst");
    targetAura.classList.toggle("is-listening", mode === "listening");
    targetAura.classList.toggle("is-thinking", mode === "thinking");
    targetAura.classList.toggle("is-live", mode === "live");
  }

  function syncEdgeAura() {
    const mode = currentAuraMode();
    applyAuraElement(aura, mode);
    applyAuraElement(pipAura, mode);
    if (androidBridge && typeof androidBridge.setAuraState === "function") {
      try { androidBridge.setAuraState(mode); } catch (e) { /* تجاهل */ }
    }
  }

  function triggerAuraBurst() {
    state.bursting = true;
    syncEdgeAura();
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(() => {
      state.bursting = false;
      syncEdgeAura();
    }, 680);
  }

  function syncStreamVisibility() {
    const hasContent = state.messages.length > 0 || state.busy;
    el.streamWrap.hidden = !hasContent;
    el.streamWrap.classList.toggle("is-minimized", Boolean(state.streamMinimized));
    el.collapse.innerHTML = state.streamMinimized ? ICONS.eyeOn : ICONS.eyeOff;
    scheduleAndroidDockSync();
  }

  let dockSyncRaf = 0;
  function syncAndroidDockHeight() {
    if (!isAndroidApp || !androidBridge || typeof androidBridge.setDockHeightDp !== "function") return;
    if (!state.open) return;
    try {
      const rect = win.getBoundingClientRect();
      const measured = Math.ceil((rect && rect.height ? rect.height : 168) + 12);
      androidBridge.setDockHeightDp(Math.max(128, measured));
    } catch (e) { /* تجاهل */ }
  }

  function scheduleAndroidDockSync() {
    if (!isAndroidApp) return;
    const caf = window.cancelAnimationFrame || clearTimeout;
    const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
    if (dockSyncRaf) caf(dockSyncRaf);
    dockSyncRaf = raf(() => {
      dockSyncRaf = 0;
      syncAndroidDockHeight();
    });
  }

  if (typeof ResizeObserver === "function") {
    try {
      const ro = new ResizeObserver(() => scheduleAndroidDockSync());
      ro.observe(win);
    } catch (e) { /* تجاهل */ }
  }

  /* ============ واجهة الباقة ============ */
  function updatePlanUI() {
    const pro = plan.isPro();
    if (el.planName) el.planName.textContent = pro ? "Max Pro" : "مجاني";
    if (el.planCredits) el.planCredits.textContent = pro ? "PRO" : "—";
    if (el.planBtn) {
      el.planBtn.classList.toggle("is-pro", pro);
    }
    if (el.planPro) el.planPro.textContent = pro ? "SPARTA Max Pro مفعّلة" : "يتطلب اشتراكًا مدفوعًا";
    if (el.planPro) el.planPro.disabled = pro;
    if (el.planFree) el.planFree.textContent = pro ? "التحويل إلى المجانية" : "الخطة الحالية";
    if (el.planFree) el.planFree.disabled = !pro;
    win.classList.toggle("is-pro", pro);
  }

  function togglePlanSheet(force) {
    const show = typeof force === "boolean" ? force : el.planSheet.hidden;
    el.planSheet.hidden = !show;
    if (show) updatePlanUI();
    scheduleAndroidDockSync();
  }

  /* ============ أدوات مساعدة ============ */
  function setStatus(text) {
    if (el.status) el.status.textContent = text;
    if (state.sharing && el.liveLabel && text) {
      el.liveLabel.textContent = text;
    }
  }

  function flashFabTag() {
    el.fabTag.classList.add("is-visible");
    setTimeout(() => el.fabTag.classList.remove("is-visible"), 2600);
  }

  function applyEnabledState() {
    fab.hidden = !state.enabled;
    fab.setAttribute("aria-hidden", state.enabled ? "false" : "true");
    if (!state.enabled) {
      closeWin();
      fab.classList.remove("is-pinned");
    }
    syncEdgeAura();
  }

  function setEnabled(value) {
    state.enabled = Boolean(value);
    store.writeFlag(ENABLE_KEY, state.enabled);
    applyEnabledState();
  }

  window.addEventListener("storage", (event) => {
    if (event.key === ENABLE_KEY) {
      state.enabled = event.newValue !== "0" && event.newValue !== "false";
      applyEnabledState();
    }
  });

  window.addEventListener("tmd-floating-enabled-change", (event) => {
    setEnabled(Boolean(event.detail?.enabled));
  });

  function escapeHTML(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRich(text) {
    let html = escapeHTML(text);
    html = html.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, (m, code) =>
      "<pre><code>" + code.trim() + "</code></pre>");
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return html;
  }

  function scrollDown() {
    el.body.scrollTop = el.body.scrollHeight;
  }

  function saveChat() {
    store.write(CHAT_KEY, persistableMessages(state.messages));
    broadcastChat();
  }

  function savePrefs() {
    const view = (win.ownerDocument && win.ownerDocument.defaultView) || window;
    store.write(STORE_KEY, {
      speak: state.speak,
      liveAutoWatch: state.liveAutoWatch,
      fab: { top: fab.style.top || "", left: fab.style.left || "" },
      vw: view.innerWidth,
      vh: view.innerHeight
    });
  }

  /* ============ رسم الرسائل العائمة ============ */
  function bubble(message) {
    const node = document.createElement("div");
    const kind = message.role === "user" ? "user" : (message.role === "error" ? "err" : "ai");
    node.className = "tmd-msg tmd-msg--" + kind;
    if (message.role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "tmd-msg__spark";
      avatar.innerHTML = auraLogoSVG();
      node.appendChild(avatar);
    }
    if (message.image) {
      const img = document.createElement("img");
      img.src = message.image;
      img.alt = "لقطة من الشاشة";
      node.appendChild(img);
    }
    const body = document.createElement("div");
    body.innerHTML = renderRich(message.content || "");
    node.appendChild(body);
    el.body.appendChild(node);
    return node;
  }

  function renderAll() {
    el.body.innerHTML = "";
    state.messages.forEach(bubble);
    syncStreamVisibility();
    scrollDown();
  }

  function addTyping() {
    state.streamMinimized = false;
    syncStreamVisibility();
    const node = document.createElement("div");
    node.className = "tmd-msg tmd-msg--ai";
    node.innerHTML =
      '<span class="tmd-msg__spark">' + auraLogoSVG() + "</span>" +
      '<span class="tmd-typing"><span></span><span></span><span></span></span>';
    el.body.appendChild(node);
    scrollDown();
    scheduleAndroidDockSync();
    return node;
  }

  /* ============ النطق الصوتي (Native Android TTS + Web Speech TTS) ============ */
  const ttsSupported = "speechSynthesis" in window;

  window.tmdAndroidSpeechStarted = () => {
    state.speaking = true;
    setStatus("يتحدث معك الآن…");
  };

  window.tmdAndroidSpeechEnded = () => {
    state.speaking = false;
    setStatus(pinnedLabel());
  };

  function stopSpeaking() {
    state.speaking = false;
    if (androidBridge && typeof androidBridge.stopSpeaking === "function") {
      try { androidBridge.stopSpeaking(); } catch (e) { /* تجاهل */ }
    }
    if (ttsSupported) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* تجاهل */ }
    }
  }

  function speak(text) {
    if (!state.speak) return;
    stopSpeaking();
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, " مقطع برمجي. ")
      .replace(/[*#_~`>|]/g, "")
      .replace(/https?:\/\/\S+/g, " رابط ")
      .trim()
      .slice(0, 900);
    if (!clean) return;

    if (androidBridge && typeof androidBridge.speakText === "function") {
      try {
        androidBridge.speakText(clean);
        return;
      } catch (e) { /* انتقال تلقائي إلى المتصفح */ }
    }

    if (!ttsSupported) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "ar-SA";
    utter.rate = 1.03;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices ? (window.speechSynthesis.getVoices() || []) : [];
    const arabic = voices.find((v) => /ar/i.test(v.lang));
    if (arabic) utter.voice = arabic;
    utter.onstart = () => {
      state.speaking = true;
      setStatus("يقرأ الرد صوتيًا…");
    };
    utter.onend = () => {
      state.speaking = false;
      setStatus(pinnedLabel());
    };
    utter.onerror = () => {
      state.speaking = false;
    };
    window.speechSynthesis.speak(utter);
  }

  function pinnedLabel() {
    if (state.sharing) return "بث مباشر للشاشة · يرى شاشتك الآن";
    return state.pinned ? "مثبّت فوق التطبيقات" : "جاهز للتفاعل";
  }

  /* ============ التعرف على الكلام (STT) ============ */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function initRecognition() {
    if (!SR || recognition) return recognition;
    recognition = new SR();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      state.listening = true;
      el.micBtn.classList.add("is-rec");
      setStatus("أستمع إليك الآن…");
      syncEdgeAura();
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      el.input.value = (finalText || interim).trim();
      autoGrow();
      updateSendAvailability();
      if (finalText.trim()) {
        stopListening();
        send();
      }
    };
    recognition.onerror = (event) => {
      stopListening();
      if (event.error === "not-allowed") {
        pushError("تم رفض إذن الميكروفون. فعّل الإذن لاستخدام المحادثة الصوتية.");
      } else {
        setStatus("تعذّر الاستماع، حاول مجددًا");
      }
    };
    recognition.onend = () => stopListening();
    return recognition;
  }

  function stopListening() {
    state.listening = false;
    el.micBtn.classList.remove("is-rec");
    if (!state.busy) setStatus(pinnedLabel());
    syncEdgeAura();
  }

  function toggleMic() {
    stopSpeaking();
    if (androidBridge && typeof androidBridge.startVoiceInput === "function") {
      try {
        state.listening = true;
        el.micBtn.classList.add("is-rec");
        syncEdgeAura();
        setStatus("تحدّث الآن…");
        androidBridge.startVoiceInput();
      } catch (e) {
        stopListening();
        pushError("تعذّر تشغيل الميكروفون في الهاتف.");
      }
      return;
    }
    if (!SR) {
      pushError("متصفحك لا يدعم التعرّف الصوتي. جرّب Chrome أو تطبيق الهاتف.");
      return;
    }
    const rec = initRecognition();
    if (state.listening) {
      try { rec.stop(); } catch (e) { /* تجاهل */ }
      return;
    }
    try {
      rec.start();
    } catch (e) {
      stopListening();
    }
  }

  window.tmdAndroidVoiceResult = (text) => {
    stopListening();
    const clean = String(text || "").trim();
    el.input.value = clean;
    autoGrow();
    updateSendAvailability();
    if (clean && state.sharing) {
      /* في وضع البث المباشر يُرسل السؤال الصوتي مباشرة مع لقطة الشاشة الحية */
      send();
    } else {
      setStatus(clean ? "تم التقاط صوتك" : pinnedLabel());
      el.input.focus();
    }
  };

  window.tmdAndroidVoiceError = (message) => {
    stopListening();
    pushError(message || "تعذّر التعرف على الصوت.");
  };

  /* ============ الصور والمرفقات ============ */
  const MAX_IMAGE_DATA_URL_CHARS = 2600000;

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("تعذّرت قراءة الصورة."));
      reader.readAsDataURL(file);
    });
  }

  async function prepareImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("اختر صورة بصيغة JPG أو PNG أو WEBP أو GIF.");
    }
    if (file.size > 12 * 1024 * 1024) throw new Error("حجم الصورة كبير جدًا. الحد الأقصى 12MB.");
    const direct = await fileToDataURL(file);
    if (direct.length <= MAX_IMAGE_DATA_URL_CHARS) return direct;

    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error("تعذّر فتح الصورة."));
        node.src = url;
      });
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let output = canvas.toDataURL("image/jpeg", quality);
      while (output.length > MAX_IMAGE_DATA_URL_CHARS && quality > 0.4) {
        quality -= 0.08;
        output = canvas.toDataURL("image/jpeg", quality);
      }
      if (output.length > MAX_IMAGE_DATA_URL_CHARS) throw new Error("تعذّر ضغط الصورة إلى حجم مناسب.");
      return output;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function showAttachment(dataUrl, name) {
    if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(String(dataUrl || ""))) {
      pushError("لم تصل صورة صالحة من الهاتف.");
      return;
    }
    state.attachment = { dataUrl, name: String(name || "صورة مرفقة").slice(0, 120) };
    el.attachmentImage.src = dataUrl;
    el.attachmentName.textContent = state.attachment.name;
    el.attachment.hidden = false;
    setStatus("الصورة جاهزة للتحليل");
    updateSendAvailability();
    scheduleAndroidDockSync();
  }

  function clearAttachment() {
    state.attachment = null;
    el.attachment.hidden = true;
    el.attachmentImage.removeAttribute("src");
    el.imageInput.value = "";
    updateSendAvailability();
    scheduleAndroidDockSync();
  }

  async function handleImageFile(file) {
    if (!file) return;
    setStatus("جاري تجهيز الصورة…");
    try {
      showAttachment(await prepareImage(file), file.name || "صورة مرفقة");
    } catch (error) {
      pushError(error?.message || "تعذّر تجهيز الصورة.");
    }
  }

  function pickImage() {
    if (androidBridge && typeof androidBridge.openImagePicker === "function") {
      try { androidBridge.openImagePicker(); }
      catch (error) { pushError("تعذّر فتح معرض الصور في الهاتف."); }
      return;
    }
    el.imageInput.click();
  }

  window.tmdAndroidImageSelected = (dataUrl, name) => showAttachment(dataUrl, name);
  window.tmdAndroidImageSelectionFailed = (message) => pushError(message || "تعذّر قراءة الصورة المختارة.");

  /* ==========================================================
     البث المباشر للشاشة مع الذكاء الاصطناعي (Live Screen Broadcast)
  ========================================================== */
  function setNativeOverlayExpanded(value) {
    if (!androidBridge || typeof androidBridge.setOverlayExpanded !== "function") return;
    try { androidBridge.setOverlayExpanded(Boolean(value)); } catch (e) { /* تجاهل */ }
  }

  function sampleWebSignature() {
    if (!el.video || !el.video.videoWidth || !el.video.videoHeight) return null;
    try {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(el.video, 0, 0, 16, 16);
      const imgData = ctx.getImageData(0, 0, 16, 16);
      return signatureFromRGBA(imgData.data, 16, 16);
    } catch (e) {
      return null;
    }
  }

  function markCurrentFrameAsBaseline() {
    if (androidBridge && typeof androidBridge.markFrameBaseline === "function") {
      try { androidBridge.markFrameBaseline(); } catch (e) { /* تجاهل */ }
    }
    const sig = sampleWebSignature();
    if (sig) {
      baselineSig = sig;
      prevTickSig = sig;
    }
  }

  function refreshAndroidLiveThumb() {
    if (!state.sharing || !androidBridge || typeof androidBridge.getLatestScreenshot !== "function") return;
    try {
      const frame = androidBridge.getLatestScreenshot();
      if (frame && frame.startsWith("data:image/")) {
        el.liveThumb.src = frame;
        el.liveThumb.hidden = false;
      }
    } catch (e) { /* تجاهل */ }
  }

  function startLiveTimers() {
    stopLiveTimers();
    if (androidBridge) {
      refreshAndroidLiveThumb();
      liveThumbTimer = setInterval(refreshAndroidLiveThumb, 1200);
    }
    liveWatchTimer = setInterval(runLiveAutoWatchTick, LIVE_WATCH_INTERVAL_MS);
  }

  function stopLiveTimers() {
    if (initialLiveTimer) {
      clearTimeout(initialLiveTimer);
      initialLiveTimer = null;
    }
    if (liveWatchTimer) {
      clearInterval(liveWatchTimer);
      liveWatchTimer = null;
    }
    if (liveThumbTimer) {
      clearInterval(liveThumbTimer);
      liveThumbTimer = null;
    }
  }

  async function runLiveAutoWatchTick() {
    if (!state.sharing || !state.liveAutoWatch) return;
    if (state.busy || state.listening || state.speaking) return;
    if (Date.now() - state.lastLiveTurnAt < LIVE_COOLDOWN_MS) return;

    let diffFromBaseline = 0;
    let deltaFromPrev = 0;

    if (androidBridge && typeof androidBridge.getFrameChangePercent === "function") {
      try {
        diffFromBaseline = Number(androidBridge.getFrameChangePercent()) || 0;
        const prev = Number(prevTickSig || 0);
        deltaFromPrev = Math.abs(diffFromBaseline - prev);
        prevTickSig = diffFromBaseline;
      } catch (e) {
        return;
      }
    } else {
      const currentSig = sampleWebSignature();
      if (!currentSig) return;
      if (!baselineSig) {
        baselineSig = currentSig;
        prevTickSig = currentSig;
        return;
      }
      diffFromBaseline = signatureDiffPercent(baselineSig, currentSig);
      deltaFromPrev = prevTickSig ? signatureDiffPercent(prevTickSig, currentSig) : 0;
      prevTickSig = currentSig;
    }

    if (diffFromBaseline >= LIVE_DIFF_THRESHOLD && deltaFromPrev <= LIVE_STABLE_MAX_DELTA) {
      await sendLiveObservation(
        "تغيّر المشهد على شاشة المستخدم الآن أثناء البث المباشر. صف بإيجاز شديد ما الجديد الذي ظهر أمامه وكيف تساعده فورًا."
      );
    }
  }

  function markShareStarted() {
    state.sharing = true;
    if (!state.open) openWin();
    el.screenBox.classList.add("is-on");
    el.shareBtn.classList.add("is-active");
    const shareSpan = el.shareBtn.querySelector("span");
    if (shareSpan) shareSpan.textContent = "مباشر";
    el.badge.classList.add("is-on");
    el.autoWatchBtn.classList.toggle("is-active", state.liveAutoWatch);
    setStatus("بث مباشر للشاشة · يرى شاشتك الآن");
    syncEdgeAura();
    scheduleAndroidDockSync();
    startLiveTimers();

    /* فحص أولي تلقائي للشاشة فور بدء البث المباشر */
    if (initialLiveTimer) clearTimeout(initialLiveTimer);
    initialLiveTimer = setTimeout(() => {
      initialLiveTimer = null;
      if (state.sharing && !state.busy) {
        sendLiveObservation(
          "بدأ المستخدم البث المباشر للشاشة معك الآن. ألقِ نظرة على الشاشة الحالية، وصف باختصار شديد ولطيف ما تراه أمامه واسأله كيف تود مساعدته."
        );
      }
    }, 750);
  }

  window.tmdAndroidScreenShareStarted = markShareStarted;
  window.tmdAndroidScreenShareStopped = () => stopShare(true);
  window.tmdAndroidScreenShareDenied = () => pushError("لم يتم السماح ببدء البث المباشر للشاشة.");

  /* أمر مباشر من تطبيق Android لفتح شريط المحادثة السفلي مع الإضاءة المحيطة */
  window.tmdAndroidOpenDock = () => openWin();

  async function toggleShare() {
    if (state.sharing) {
      stopShare();
      return;
    }
    if (androidBridge && typeof androidBridge.startScreenShare === "function") {
      try { androidBridge.startScreenShare(); }
      catch (e) { pushError("تعذّر طلب إذن البث المباشر للشاشة من الهاتف."); }
      return;
    }
    const media = ((win.ownerDocument && win.ownerDocument.defaultView) || window).navigator.mediaDevices;
    if (!media || !media.getDisplayMedia) {
      pushError("متصفحك الحالي لا يدعم البث المباشر للشاشة. ثبّت تطبيق الهاتف (APK) للبث المباشر فوق كل التطبيقات، أو افتح من Chrome.");
      return;
    }
    try {
      const stream = await media.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });
      state.stream = stream;
      el.video.srcObject = stream;
      el.video.hidden = false;
      el.liveThumb.hidden = true;
      const track = stream.getVideoTracks()[0];
      if (track) track.addEventListener("ended", () => stopShare());
      markShareStarted();
    } catch (e) {
      if (e && (e.name === "NotAllowedError" || e.name === "AbortError")) {
        setStatus("أُلغي البث المباشر للشاشة");
      } else {
        pushError("تعذّر بدء البث المباشر للشاشة: " + (e?.message || e?.name || "خطأ غير معروف"));
      }
    }
  }

  function stopShare(fromNative) {
    stopLiveTimers();
    if (androidBridge && !fromNative && typeof androidBridge.stopScreenShare === "function") {
      try { androidBridge.stopScreenShare(); } catch (e) { /* تجاهل */ }
    }
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }
    state.stream = null;
    state.sharing = false;
    baselineSig = null;
    prevTickSig = null;
    if (el.video) el.video.srcObject = null;
    el.liveThumb.hidden = true;
    el.liveThumb.removeAttribute("src");
    el.screenBox.classList.remove("is-on");
    el.shareBtn.classList.remove("is-active");
    const shareSpan = el.shareBtn.querySelector("span");
    if (shareSpan) shareSpan.textContent = "بث مباشر";
    el.badge.classList.remove("is-on");
    setStatus(pinnedLabel());
    syncEdgeAura();
    scheduleAndroidDockSync();
  }

  function captureFrame() {
    if (!state.sharing) return null;
    if (androidBridge && typeof androidBridge.getLatestScreenshot === "function") {
      try { return androidBridge.getLatestScreenshot() || null; }
      catch (e) { return null; }
    }
    if (!el.video || !el.video.videoWidth) return null;
    const maxW = 1280;
    const scale = Math.min(1, maxW / el.video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(el.video.videoWidth * scale);
    canvas.height = Math.round(el.video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(el.video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch (e) {
      return null;
    }
  }

  /* ============ الاتصال بالـ API ============ */
  function buildApiMessages(image, overridePrompt) {
    const sysPrompt = state.sharing ? LIVE_SYSTEM_PROMPT : SYSTEM_PROMPT;
    if (overridePrompt && image) {
      const prior = state.messages.slice(-6).map((m) => ({
        role: m.role === "error" ? "assistant" : m.role,
        content: m.content
      }));
      return [{ role: "system", content: sysPrompt }]
        .concat(prior)
        .concat([
          {
            role: "user",
            content: [
              { type: "text", text: overridePrompt },
              { type: "image_url", image_url: { url: image } }
            ]
          }
        ]);
    }

    const history = state.messages.slice(-MAX_TURNS * 2).map((message, index, arr) => {
      const isLast = index === arr.length - 1;
      if (isLast && image && message.role === "user") {
        return {
          role: "user",
          content: [
            { type: "text", text: message.content || "حلّل ما يظهر على شاشتي الآن." },
            { type: "image_url", image_url: { url: image } }
          ]
        };
      }
      return { role: message.role === "error" ? "assistant" : message.role, content: message.content };
    });
    return [{ role: "system", content: sysPrompt }].concat(history);
  }

  function pushError(text) {
    const safe = String(text || "تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.");
    state.streamMinimized = false;
    state.messages.push({ role: "error", content: safe });
    bubble({ role: "error", content: safe });
    syncStreamVisibility();
    scrollDown();
    saveChat();
  }

  function describeHttpError(status, data) {
    if (status === 408) return "استغرق الطلب وقتًا أطول من المتوقع، حاول مرة أخرى.";
    if (status === 429) return "تم تجاوز حدود الاستخدام مؤقتًا، حاول بعد قليل.";
    if ([500, 502, 503, 504].includes(Number(status))) return "الخدمة غير متاحة حاليًا، حاول بعد قليل.";
    if (status === 413) return "حجم الرسالة أو لقطة الشاشة كبير جدًا، جرّب تقليل المحتوى.";
    if (status === 401 || status === 403) return "تعذر الوصول إلى خدمة الذكاء الاصطناعي حاليًا، حاول لاحقًا.";
    return (data && typeof data.error === "string" && data.error.trim())
      ? data.error.trim()
      : "تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.";
  }

  function setSendBusy(busy) {
    win.classList.toggle("is-busy", Boolean(busy));
    if (busy) {
      el.send.disabled = false;
      el.send.classList.add("is-stop");
      el.send.title = "إيقاف الطلب";
      el.send.innerHTML = ICONS.stop;
    } else {
      el.send.classList.remove("is-stop");
      el.send.title = "إرسال";
      el.send.innerHTML = ICONS.send;
      updateSendAvailability();
    }
    syncEdgeAura();
  }

  function updateSendAvailability() {
    if (state.busy) {
      el.send.disabled = false;
      return;
    }
    el.send.disabled = !el.input.value.trim() && !state.attachment && !state.sharing;
  }

  /* قراءة حية تلقائية لإطار الشاشة أثناء البث المباشر */
  async function sendLiveObservation(observationPrompt) {
    if (!state.sharing || state.busy) return;
    const frame = captureFrame();
    if (!frame) return;

    markCurrentFrameAsBaseline();
    state.lastLiveTurnAt = Date.now();
    state.busy = true;
    state.abortReason = "";
    setSendBusy(true);
    setStatus("يقرأ شاشتك مباشرة…");
    const typing = addTyping();
    state.controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      state.abortReason = "timeout";
      state.controller?.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: buildApiMessages(frame, observationPrompt)
        }),
        signal: state.controller.signal
      });

      let data = {};
      try { data = await response.json(); } catch (err) { /* تجاهل */ }
      typing.remove();

      if (!response.ok || !data || data.ok === false) return;
      const reply = (typeof data.reply === "string" ? data.reply : "").trim();
      if (!reply) return;

      state.streamMinimized = false;
      state.messages.push({ role: "assistant", content: reply });
      bubble({ role: "assistant", content: reply });
      syncStreamVisibility();
      saveChat();
      scrollDown();
      speak(reply);
    } catch (err) {
      typing.remove();
    } finally {
      window.clearTimeout(timeoutId);
      state.busy = false;
      state.controller = null;
      state.abortReason = "";
      state.lastLiveTurnAt = Date.now();
      setSendBusy(false);
      syncStreamVisibility();
      if (!state.listening) setStatus(pinnedLabel());
    }
  }

  async function send() {
    if (state.busy) {
      state.abortReason = "manual";
      if (state.controller) state.controller.abort();
      return;
    }
    const text = el.input.value.trim();
    if (!text && !state.attachment && !state.sharing) {
      updateSendAvailability();
      return;
    }

    stopSpeaking();
    state.streamMinimized = false;

    const useMiniMax = plan.isPro();
    const attachedImage = state.attachment?.dataUrl || null;
    const screenImage = attachedImage ? null : captureFrame();
    const image = attachedImage || screenImage;
    const prompt = text || (attachedImage ? "حلّل هذه الصورة واذكر أهم التفاصيل فيها." : "ماذا ترى على شاشتي الآن؟ ساعدني فيما أمامي.");

    if (screenImage) markCurrentFrameAsBaseline();
    state.lastLiveTurnAt = Date.now();

    state.messages.push({ role: "user", content: prompt, image: attachedImage || undefined });
    bubble({ role: "user", content: prompt, image: attachedImage || undefined });
    clearAttachment();
    el.input.value = "";
    autoGrow();
    syncStreamVisibility();
    saveChat();
    scrollDown();

    state.busy = true;
    state.abortReason = "";
    setSendBusy(true);
    setStatus(image && state.sharing ? "يحلل البث المباشر لشاشتك…" : "يفكّر الآن…");
    const typing = addTyping();
    state.controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      state.abortReason = "timeout";
      state.controller?.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: image ? VISION_MODEL : (useMiniMax ? MINIMAX_MODEL : TEXT_MODEL),
          messages: buildApiMessages(image)
        }),
        signal: state.controller.signal
      });

      let data = {};
      try {
        data = await response.json();
      } catch (jsonError) {
        if (response.ok) throw new Error("تعذر قراءة رد الخادم، حاول مرة أخرى.");
      }
      typing.remove();

      if (!response.ok || !data || data.ok === false) {
        throw new Error(describeHttpError(response.status, data));
      }

      const reply = (typeof data.reply === "string" ? data.reply : "").trim();
      if (!reply) throw new Error("لم يصل رد نصي من النموذج.");

      state.messages.push({ role: "assistant", content: reply });
      bubble({ role: "assistant", content: reply });
      syncStreamVisibility();
      saveChat();
      scrollDown();
      speak(reply);
    } catch (error) {
      typing.remove();
      syncStreamVisibility();
      if (error && error.name === "AbortError") {
        if (state.abortReason === "timeout") {
          pushError("استغرق الطلب وقتًا أطول من المتوقع، حاول مرة أخرى.");
        } else {
          setStatus("تم إيقاف الطلب");
        }
      } else if (error && /Failed to fetch|NetworkError|Load failed/i.test(String(error.message || ""))) {
        pushError("تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.");
      } else {
        pushError((error && error.message) || "تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      state.busy = false;
      state.controller = null;
      state.abortReason = "";
      state.lastLiveTurnAt = Date.now();
      setSendBusy(false);
      if (!state.listening) setStatus(pinnedLabel());
    }
  }

  /* ==========================================================
     التثبيت فوق كل التطبيقات (Document PiP / نافذة مستقلة)
  ========================================================== */
  async function pin() {
    if (!state.enabled) setEnabled(true);
    if (state.pinned && pipWindow) {
      try { pipWindow.close(); } catch (e) { /* تجاهل */ }
      return;
    }
    if ("documentPictureInPicture" in window && window.documentPictureInPicture) {
      try {
        const width = Math.max(360, Math.min(440, Math.round(window.screen.width * 0.3)));
        const height = Math.max(480, Math.min(700, Math.round(window.screen.height * 0.8)));
        pipWindow = await window.documentPictureInPicture.requestWindow({ width, height });
        adoptPipWindow(pipWindow);
        return;
      } catch (e) { /* انتقال تلقائي */ }
    }
    openPopupWindow();
  }

  function adoptPipWindow(pip) {
    const doc = pip.document;
    doc.documentElement.lang = "ar";
    doc.documentElement.dir = "rtl";
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme || "dark";
    doc.title = "المساعد العائم الذكي";

    Array.prototype.forEach.call(document.styleSheets, (sheet) => {
      try {
        if (sheet.href) {
          const link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          doc.head.appendChild(link);
        } else if (sheet.ownerNode && sheet.ownerNode.tagName === "STYLE") {
          const style = doc.createElement("style");
          style.textContent = Array.prototype.map.call(sheet.cssRules, (r) => r.cssText).join("\n");
          doc.head.appendChild(style);
        }
      } catch (e) { /* تجاهل */ }
    });

    doc.body.className = "tmd-pip-body";

    pipAura = document.createElement("div");
    pipAura.className = "tmd-edge-aura";
    pipAura.innerHTML = '<div class="tmd-edge-aura__bloom"></div><div class="tmd-edge-aura__rim"></div>';
    doc.body.appendChild(pipAura);

    const shell = doc.createElement("div");
    shell.className = "tmd-pip-shell";
    doc.body.appendChild(shell);

    shell.appendChild(win);
    win.classList.add("is-open", "is-pinned");
    state.open = true;
    state.pinned = true;

    fab.classList.add("is-pinned");
    fab.classList.remove("is-open-hidden");
    el.pinBtn.classList.add("is-active");
    el.pinBtn.innerHTML = ICONS.unpin + "<span>إلغاء</span>";
    setStatus("مثبّت فوق التطبيقات");
    triggerAuraBurst();
    flashFabTag();
    setTimeout(() => el.input.focus(), 140);

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        try { pip.close(); } catch (e) { /* تجاهل */ }
      }
    });

    pip.addEventListener("pagehide", () => unpin(), { once: true });
  }

  function unpin() {
    if (!state.pinned) return;
    state.pinned = false;
    pipWindow = null;
    pipAura = null;

    try {
      win.classList.remove("is-pinned");
      document.body.appendChild(win);
    } catch (e) { /* تجاهل */ }

    win.classList.remove("is-open");
    state.open = false;
    fab.classList.remove("is-pinned", "is-open-hidden");
    el.pinBtn.classList.remove("is-active");
    el.pinBtn.innerHTML = ICONS.pin + "<span>تثبيت</span>";
    setStatus(pinnedLabel());
    syncEdgeAura();

    if (pendingReopen) {
      pendingReopen = false;
      openWin();
    }
  }

  function openPopupWindow() {
    const w = Math.min(430, Math.round((window.screen && window.screen.availWidth || 440) * 0.92));
    const h = Math.min(700, Math.round((window.screen && window.screen.availHeight || 760) * 0.9));
    const opened = window.open(
      new URL("/assistant.html?popup=1", baseHref).href,
      "tmd-assistant",
      "popup=yes,width=" + w + ",height=" + h
    );
    if (opened) {
      closeWin();
    } else {
      pushError("تعذّر فتح النافذة العائمة. اسمح بالنوافذ المنبثقة أو ثبّت تطبيق الهاتف.");
    }
  }

  /* ============ السحب والإفلات للفقاعة ============ */
  function makeDraggable(handle, target, onEnd) {
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;
    let moved = false;
    let active = false;

    function down(event) {
      if (event.button != null && event.button !== 0) return;
      const point = event.touches ? event.touches[0] : event;
      const rect = target.getBoundingClientRect();
      active = true;
      moved = false;
      startX = point.clientX;
      startY = point.clientY;
      baseLeft = rect.left;
      baseTop = rect.top;
      target.style.top = rect.top + "px";
      target.style.left = rect.left + "px";
      target.style.right = "auto";
      target.style.bottom = "auto";
      target.style.insetInlineEnd = "auto";
      target.style.insetBlockEnd = "auto";
      const doc = handle.ownerDocument || document;
      doc.addEventListener("pointermove", move);
      doc.addEventListener("pointerup", up);
      doc.addEventListener("pointercancel", up);
    }

    function move(event) {
      if (!active) return;
      const view = (target.ownerDocument && target.ownerDocument.defaultView) || window;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved = true;
        target.classList.add("is-dragging");
      }
      const rect = target.getBoundingClientRect();
      const left = Math.min(Math.max(6, baseLeft + dx), view.innerWidth - rect.width - 6);
      const top = Math.min(Math.max(6, baseTop + dy), view.innerHeight - rect.height - 6);
      target.style.left = left + "px";
      target.style.top = top + "px";
    }

    function up() {
      active = false;
      target.classList.remove("is-dragging");
      const doc = handle.ownerDocument || document;
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerup", up);
      doc.removeEventListener("pointercancel", up);
      if (onEnd) onEnd(moved);
      savePrefs();
    }

    handle.addEventListener("pointerdown", down);
  }

  function snapFabToEdge() {
    const view = (fab.ownerDocument && fab.ownerDocument.defaultView) || window;
    const rect = fab.getBoundingClientRect();
    const middle = rect.left + rect.width / 2;
    const edge = middle < view.innerWidth / 2 ? 12 : view.innerWidth - rect.width - 12;
    fab.classList.add("is-snapping");
    fab.style.left = edge + "px";
    setTimeout(() => {
      fab.classList.remove("is-snapping");
      savePrefs();
    }, 270);
  }

  /* ============ فتح/إغلاق (إضاءة حدود الشاشة ← شريط الكتابة السفلي) ============ */
  function openWin() {
    if (!state.enabled) return;
    state.open = true;
    if (!state.pinned) {
      fab.classList.add("is-open-hidden");
      setNativeOverlayExpanded(true);
    }
    /* الخطوة 1: اشتعال الإضاءة الملونة حول حدود الشاشة بالكامل */
    triggerAuraBurst();

    /* الخطوة 2: صعود شريط الكتابة السفلي فوق الخلفية الشفافة */
    win.classList.add("is-open");
    win.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-label", "إغلاق شريط المساعد الذكي");
    syncStreamVisibility();
    updateSendAvailability();
    scheduleAndroidDockSync();

    if (openFocusTimer) clearTimeout(openFocusTimer);
    openFocusTimer = setTimeout(() => {
      openFocusTimer = null;
      scheduleAndroidDockSync();
      try { el.input.focus(); } catch (e) { /* تجاهل */ }
    }, 150);
    scrollDown();
  }

  function closeWin() {
    state.open = false;
    state.bursting = false;
    if (openFocusTimer) {
      clearTimeout(openFocusTimer);
      openFocusTimer = null;
    }
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
    win.classList.remove("is-open");
    win.setAttribute("aria-hidden", "true");
    fab.classList.remove("is-open-hidden");
    fab.setAttribute("aria-label", "اضغط لتشغيل الفقاعة الذكية");
    if (!state.pinned) setNativeOverlayExpanded(false);
    syncEdgeAura();
    stopSpeaking();
    if (state.listening && recognition) {
      try { recognition.stop(); } catch (e) { /* تجاهل */ }
    }
  }

  function toggleWin() {
    if (!state.enabled) return;
    if (state.pinned) {
      flashFabTag();
      setStatus("مثبّت فوق التطبيقات — أوقف التثبيت من زر الدبوس");
      return;
    }
    if (state.open) closeWin();
    else openWin();
  }

  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight || 40, 96) + "px";
    scheduleAndroidDockSync();
  }

  /* ============ ربط أحداث الواجهة ============ */
  if (isAndroidApp) {
    let nativeDrag = null;
    fab.addEventListener("pointerdown", (event) => {
      nativeDrag = { x: event.screenX, y: event.screenY, moved: false };
      try { fab.setPointerCapture(event.pointerId); } catch (e) { /* اختياري */ }
    });
    fab.addEventListener("pointermove", (event) => {
      if (!nativeDrag) return;
      const dx = event.screenX - nativeDrag.x;
      const dy = event.screenY - nativeDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) nativeDrag.moved = true;
      if (nativeDrag.moved && androidBridge && typeof androidBridge.moveBubbleBy === "function") {
        try { androidBridge.moveBubbleBy(dx, dy); } catch (e) { /* تجاهل */ }
      }
      nativeDrag.x = event.screenX;
      nativeDrag.y = event.screenY;
    });
    const endNativeDrag = () => {
      if (!nativeDrag) return;
      const moved = nativeDrag.moved;
      nativeDrag = null;
      if (moved) {
        if (androidBridge && typeof androidBridge.snapBubbleToEdge === "function") {
          try { androidBridge.snapBubbleToEdge(); } catch (e) { /* تجاهل */ }
        }
      } else {
        toggleWin();
      }
    };
    fab.addEventListener("pointerup", endNativeDrag);
    fab.addEventListener("pointercancel", () => { nativeDrag = null; });
  } else {
    makeDraggable(fab, fab, (moved) => {
      if (moved) snapFabToEdge();
      else toggleWin();
    });
  }

  const returnToBubble = () => {
    if (state.pinned) {
      try { if (pipWindow) pipWindow.close(); } catch (e) { /* تجاهل */ }
      return;
    }
    closeWin();
  };

  el.close.addEventListener("click", returnToBubble);
  el.orbBtn.addEventListener("click", returnToBubble);

  el.pinBtn.addEventListener("click", () => {
    if (state.pinned) {
      pendingReopen = true;
      try { if (pipWindow) pipWindow.close(); } catch (e) { unpin(); }
    } else {
      pin();
    }
  });

  el.collapse.addEventListener("click", () => {
    state.streamMinimized = !state.streamMinimized;
    syncStreamVisibility();
  });

  el.clear.addEventListener("click", () => {
    stopSpeaking();
    state.messages = [];
    state.streamMinimized = false;
    saveChat();
    renderAll();
    setStatus("تم مسح المحادثة");
  });

  el.planBtn.addEventListener("click", () => togglePlanSheet());
  el.planClose.addEventListener("click", () => togglePlanSheet(false));
  el.planPro.addEventListener("click", () => {
    setStatus("SPARTA Max Pro يتطلب اشتراكًا مدفوعًا");
    state.streamMinimized = false;
    state.messages.push({
      role: "assistant",
      content: "SPARTA Max Pro يتطلب اشتراكًا مدفوعًا ومؤكدًا. بعد التفعيل ستحصل على MiniMax M3 ومهمة Pro يومية داخل الأداة الكاملة."
    });
    renderAll();
  });
  el.planFree.addEventListener("click", () => {
    plan.setPro(false);
    togglePlanSheet(false);
    setStatus("تم الرجوع إلى الباقة المجانية");
  });

  el.send.addEventListener("click", send);
  el.input.addEventListener("input", () => { autoGrow(); updateSendAvailability(); });
  el.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  el.imageBtn.addEventListener("click", pickImage);
  el.imageInput.addEventListener("change", () => handleImageFile(el.imageInput.files?.[0]));
  el.removeAttachment.addEventListener("click", clearAttachment);

  /* أحداث البث المباشر للشاشة */
  el.shareBtn.addEventListener("click", toggleShare);
  el.stopLiveBtn.addEventListener("click", () => stopShare());
  el.autoWatchBtn.addEventListener("click", () => {
    state.liveAutoWatch = !state.liveAutoWatch;
    el.autoWatchBtn.classList.toggle("is-active", state.liveAutoWatch);
    el.autoWatchBtn.textContent = state.liveAutoWatch ? "متابعة حية" : "متابعة متوقفة";
    savePrefs();
  });
  el.snapNowBtn.addEventListener("click", () => {
    if (!state.sharing) return;
    sendLiveObservation("حلّل ما يظهر على شاشتي في هذه اللحظة بدقة وإيجاز.");
  });

  el.micBtn.addEventListener("click", toggleMic);
  el.speakBtn.addEventListener("click", () => {
    state.speak = !state.speak;
    el.speakBtn.classList.toggle("is-active", state.speak);
    const s = el.speakBtn.querySelector("span");
    if (s) s.textContent = state.speak ? "النطق" : "صامت";
    if (!state.speak) stopSpeaking();
    savePrefs();
  });

  CHIPS.forEach((label) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tmd-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      el.input.value = label;
      autoGrow();
      send();
    });
    el.chips.appendChild(chip);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open && !state.pinned) closeWin();
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      toggleWin();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopShare();
    stopSpeaking();
  });

  /* ============ الاستعادة ============ */
  (function restore() {
    const prefs = store.read(STORE_KEY, {});
    state.speak = prefs.speak !== false;
    state.liveAutoWatch = prefs.liveAutoWatch !== false;
    el.speakBtn.classList.toggle("is-active", state.speak);
    const speakSpan = el.speakBtn.querySelector("span");
    if (speakSpan) speakSpan.textContent = state.speak ? "النطق" : "صامت";
    el.autoWatchBtn.classList.toggle("is-active", state.liveAutoWatch);
    updatePlanUI();

    if (!isAndroidApp && prefs.fab && prefs.fab.top && prefs.vh) {
      const relTop = parseFloat(prefs.fab.top) / prefs.vh;
      const relLeft = parseFloat(prefs.fab.left) / prefs.vw;
      if (Number.isFinite(relTop) && Number.isFinite(relLeft)) {
        const size = (fab.getBoundingClientRect && fab.getBoundingClientRect().width) || 62;
        const top = Math.min(Math.max(8, relTop * window.innerHeight), window.innerHeight - size - 8);
        const left = Math.min(Math.max(8, relLeft * window.innerWidth), window.innerWidth - size - 8);
        fab.style.top = top + "px";
        fab.style.left = left + "px";
        fab.style.insetInlineEnd = "auto";
        fab.style.insetBlockEnd = "auto";
      }
    }

    const saved = store.read(CHAT_KEY, []);
    if (Array.isArray(saved)) {
      state.messages = saved
        .filter((m) => m && typeof m.content === "string")
        .map((m) => ({
          role: m.role === "user" || m.role === "assistant" || m.role === "error" ? m.role : "assistant",
          content: m.content
        }));
    }
    renderAll();
    updateSendAvailability();
    applyEnabledState();
  })();

  if (ttsSupported && typeof window.speechSynthesis.getVoices === "function") {
    window.speechSynthesis.getVoices();
  }

  const isMiniApp = document.body.classList.contains("tmd-assistant-page");
  const isPopup = searchParams.get("popup") === "1";
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone || isAndroidApp || isPopup) {
    el.pinBtn.style.display = "none";
  }

  /* في نافذة منبثقة يفتح الشريط والإضاءة مباشرة؛ أما في Android وفي صفحة عرض الهاتف فيبدأ كفقاعة عائمة حتى يجرّب المستخدم الضغط عليها بنفسه */
  if (isPopup && !isAndroidApp && state.enabled) {
    openWin();
  } else if (isAndroidApp) {
    setNativeOverlayExpanded(false);
    syncEdgeAura();
  }

  /* ============ واجهة برمجية عامة ============ */
  window.__tmdFloatingAssistant = {
    open: openWin,
    close: closeWin,
    toggle: toggleWin,
    pin,
    unpin,
    ask(text) {
      if (!state.enabled) setEnabled(true);
      openWin();
      el.input.value = String(text || "");
      autoGrow();
      return send();
    },
    shareScreen: toggleShare,
    startLiveBroadcast() {
      if (!state.sharing) return toggleShare();
    },
    stopLiveBroadcast: () => stopShare(),
    isLiveBroadcast() { return state.sharing; },
    stopShare,
    setEnabled,
    isEnabled() { return state.enabled; },
    setPaidPlan(active) {
      plan.setPro(Boolean(active));
      if (active) setStatus("SPARTA Max Pro مفعّلة — MiniMax جاهز");
    },
    isProPlan() { return plan.isPro(); },
    speak,
    stopSpeaking,
    state,
    _test: {
      auraLogoSVG,
      signatureFromRGBA,
      signatureDiffPercent,
      currentAuraMode,
      syncEdgeAura,
      destroy() {
        stopShare();
        closeWin();
        if (channel) {
          try { channel.close(); } catch (e) { /* تجاهل */ }
        }
      }
    }
  };
})();
