/* ==========================================================
   SPARTA AI — المساعد العائم فوق كل التطبيقات
   ----------------------------------------------------------
   • فقاعة عائمة قابلة للسحب مع شعار الشرارة (ب نمط Gemini).
   • زر «تثبيت» 📌: يرفع المساعد إلى نافذة عائمة دائمة تبقى
     فوق كل البرامج والتطبيقات (Document Picture-in-Picture)
     وهي متصلة بالموقع — دون بقاء المستخدم داخل SPARTA AI.
   • على المتصفحات التي لا تدعم ذلك: نافذة مستقلة مدمجة.
   • دردشة سريعة + مشاركة شاشة + نطق + ميكروفون.
   • مزامنة المحادثة بين النوافذ عبر BroadcastChannel.
   ملف مستقل تمامًا — لا يعتمد على app.js.
   ========================================================== */
(function () {
  "use strict";

  if (window.__tmdFloatingAssistant) return;

  /* ============ إعدادات عامة ============ */
  const STORE_KEY = "tmd_float_state";
  const CHAT_KEY = "tmd_float_chat";
  const ENABLE_KEY = "tmd_float_enabled";
  // رابط مطلق حتى يستمر العمل من داخل نافذة التثبيت العائمة (PiP).
  const API_URL = new URL("/api/chat", window.location.href).href;
  const SITE_URL = new URL("/", window.location.href).href;
  const TEXT_MODEL = "openai/gpt-oss-120b";
  const VISION_MODEL = "qwen/qwen3.8-27b";
  /* SPARTA Pro المدفوع: MiniMax ومهمة اليوم للنسخة المدفوعة فقط.
     لا تمنح أي باقة أرصدة يومية تلقائية. */
  const PLAN_KEY = "tmd_float_plan";
  const MINIMAX_MODEL = "MiniMax-M3";
  const MAX_TURNS = 14;
  const REQUEST_TIMEOUT_MS = 45000;

  const SYSTEM_PROMPT =
    "أنت SPARTA AI، مساعد ذكي عربي احترافي يعمل الآن داخل نافذة عائمة فوق بقية التطبيقات. " +
    "أجب بإيجاز وبأسلوب محادثة طبيعي مناسب للقراءة الصوتية (2-5 جمل غالبًا) ما لم يطلب المستخدم التفصيل. " +
    "تجنّب الإفراط في الرموز والتنسيق لأن ردّك يُقرأ بصوت مسموع. " +
    "إذا أُرسلت لك لقطة من شاشة المستخدم فحلّلها بدقة وصف ما تراه وساعده عمليًا فيما يفعله. " +
    "مطوّر ومصمم ومهندس المنصة هو ياسين عمرو عبد الرحيم.";

  const CHIPS = [
    "ماذا ترى على شاشتي؟",
    "لخّص هذه الصفحة",
    "اشرح لي الكود الظاهر",
    "ساعدني في الخطوة التالية"
  ];

  /* ============ برق SPARTA أحادي اللون ============ */
  let sparkSeq = 0;
  function sparkSVG(className) {
    const gid = "spartaBoltGrad" + (++sparkSeq);
    return (
      '<svg class="' + (className || "tmd-spark") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<linearGradient id="' + gid + '" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#ffffff"/>' +
      '<stop offset="0.52" stop-color="#dedede"/>' +
      '<stop offset="1" stop-color="#8f8f8f"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<path d="M14.1 1.8 4.5 13h6L9.4 22.2 19.5 10h-6.1l.7-8.2Z" fill="url(#' + gid + ')" stroke="#fff" stroke-opacity=".6" stroke-width=".55" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  /* أيقونات خطية موحّدة (بدل الرموز التعبيرية) */
  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>',
    unpin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>',
    speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
    site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>'
  };

  /* ============ الحالة ============ */
  const state = {
    open: false,
    collapsed: false,
    busy: false,
    speak: true,
    listening: false,
    sharing: false,
    pinned: false,
    enabled: true,
    abortReason: "",
    controller: null,
    stream: null,
    messages: [],
    fab: null,
    win: null
  };

  let pipWindow = null; // نافذة التثبيت فوق التطبيقات (Document PiP)
  let pendingReopen = false; // إعادة فتح النافذة بالموقع بعد إلغاء التثبيت بزر الدبوس

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

  /* ============ اشتراك SPARTA Pro ============ */
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
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("tmd_float_sync") : null;
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

  /* ============ بناء الواجهة ============ */
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "tmd-fab";
  fab.setAttribute("aria-label", "فتح مساعد SPARTA AI العائم");
  fab.title = "SPARTA AI — المساعد العائم (اسحب لتحريكه)";
  fab.innerHTML =
    '<span class="tmd-fab__ring"></span>' +
    '<span class="tmd-fab__ring tmd-fab__ring--gold"></span>' +
    '<span class="tmd-fab__icon">' + sparkSVG() + "</span>" +
    '<span class="tmd-fab__badge" data-el="badge">●</span>' +
    '<span class="tmd-fab__tag" data-el="fabTag">المساعد مثبّت فوق التطبيقات ✓</span>';

  const win = document.createElement("section");
  win.className = "tmd-mini";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "نافذة SPARTA AI العائمة");
  win.innerHTML =
    '<header class="tmd-mini__head" data-el="head">' +
    '<div class="tmd-mini__avatar">' + sparkSVG() + "</div>" +
    '<div class="tmd-mini__titles">' +
    '<div class="tmd-mini__title">SPARTA AI — المساعد العائم</div>' +
    '<div class="tmd-mini__status" data-el="status">جاهز للدردشة</div>' +
    "</div>" +
    '<button type="button" class="tmd-plan-chip" data-el="planBtn" title="SPARTA Pro — MiniMax ومهمة يومية للنسخة المدفوعة">' +
    '<span class="tmd-plan-chip__name" data-el="planName">مجاني</span>' +
    '<span class="tmd-plan-chip__credits" data-el="planCredits">—</span>' +
    "</button>" +
    '<button type="button" class="tmd-mini__head-btn tmd-pin-btn" data-el="pinBtn" title="تثبيت فوق كل التطبيقات — نافذة عائمة دائمة تبقى أمامك أثناء استخدام أي برنامج آخر">' + ICONS.pin + "</button>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="clear" title="محادثة جديدة">' + ICONS.trash + "</button>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="collapse" title="تصغير">' + ICONS.minus + "</button>" +
    '<button type="button" class="tmd-mini__head-btn" data-el="close" title="إغلاق">' + ICONS.close + "</button>" +
    "</header>" +

    '<div class="tmd-mini__screen" data-el="screenBox">' +
    '<video data-el="video" muted playsinline autoplay></video>' +
    '<span class="tmd-mini__screen-tag">مشاركة الشاشة نشطة</span>' +
    "</div>" +

    '<div class="tmd-plan-sheet" data-el="planSheet" hidden>' +
    '<div class="tmd-plan-sheet__inner">' +
    '<div class="tmd-plan-sheet__head">' +
    '<strong>الباقات</strong>' +
    '<button type="button" class="tmd-mini__head-btn" data-el="planClose" title="إغلاق">' + ICONS.close + "</button>" +
    "</div>" +
    '<div class="tmd-plan-card" data-plan="free">' +
    '<div class="tmd-plan-card__title">المجانية</div>' +
    '<div class="tmd-plan-card__desc">دردشة أساسية. لا تشمل MiniMax أو مهمة SPARTA Pro اليومية.</div>' +
    '<button type="button" class="tmd-plan-card__btn" data-el="planFree">استخدام المجانية</button>' +
    "</div>" +
    '<div class="tmd-plan-card tmd-plan-card--pro" data-plan="minimax">' +
    '<div class="tmd-plan-card__title">SPARTA Max <span class="tmd-plan-card__tag">PRO</span></div>' +
    '<div class="tmd-plan-card__desc">MiniMax M3 ومهمة Pro واحدة كل يوم داخل الأداة الكاملة. لا تشمل الخطة أرصدة يومية تلقائية.</div>' +
    '<button type="button" class="tmd-plan-card__btn tmd-plan-card__btn--pro" data-el="planPro">يتطلب اشتراكًا مدفوعًا</button>' +
    "</div>" +
    "</div>" +
    "</div>" +

    '<div class="tmd-mini__body" data-el="body"></div>' +

    '<div class="tmd-mini__chips" data-el="chips"></div>' +

    '<div class="tmd-mini__tools">' +
    '<button type="button" class="tmd-tool" data-el="shareBtn">' + ICONS.screen + "<span>مشاركة الشاشة</span></button>" +
    '<button type="button" class="tmd-tool" data-el="micBtn">' + ICONS.mic + "<span>تحدّث</span></button>" +
    '<button type="button" class="tmd-tool" data-el="speakBtn">' + ICONS.speak + "<span>النطق</span></button>" +
    "</div>" +

    '<div class="tmd-mini__foot">' +
    '<textarea class="tmd-mini__input" data-el="input" rows="1" placeholder="اكتب رسالتك أو تحدّث بالميكروفون…"></textarea>' +
    '<button type="button" class="tmd-mini__send" data-el="send" title="إرسال">' + ICONS.send + "</button>" +
    "</div>" +

    '<a class="tmd-open-site" data-el="openSite" href="/" title="فتح موقع SPARTA AI الكامل">' + ICONS.site + "<span>الموقع الكامل</span></a>";

  const el = {};
  win.querySelectorAll("[data-el]").forEach((node) => {
    el[node.dataset.el] = node;
  });
  el.badge = fab.querySelector("[data-el=badge]");
  el.fabTag = fab.querySelector("[data-el=fabTag]");
  el.openSite.href = SITE_URL;

  document.body.appendChild(fab);
  document.body.appendChild(win);
  state.fab = fab;
  state.win = win;

  /* ============ واجهة الباقة ============ */
  function updatePlanUI() {
    const pro = plan.isPro();
    if (el.planName) el.planName.textContent = pro ? "Max Pro" : "مجاني";
    if (el.planCredits) el.planCredits.textContent = pro ? "PRO" : "—";
    if (el.planBtn) {
      el.planBtn.classList.toggle("is-pro", pro);
      el.planBtn.classList.remove("is-empty");
      el.planBtn.title = pro
        ? "SPARTA Max Pro — MiniMax ومهمة يومية، من دون رصيد يومي تلقائي"
        : "الباقة المجانية — لا تشمل MiniMax أو مهمة SPARTA Pro";
    }
    if (el.planPro) el.planPro.textContent = pro ? "SPARTA Max Pro مفعّلة ✓" : "يتطلب اشتراكًا مدفوعًا";
    if (el.planPro) el.planPro.disabled = pro;
    if (el.planFree) el.planFree.textContent = pro ? "التحويل إلى المجانية" : "الخطة الحالية";
    if (el.planFree) el.planFree.disabled = !pro;
    win.classList.toggle("is-pro", pro);
  }

  function togglePlanSheet(force) {
    const show = typeof force === "boolean" ? force : el.planSheet.hidden;
    el.planSheet.hidden = !show;
    if (show) updatePlanUI();
  }

  /* ============ أدوات مساعدة ============ */
  function setStatus(text) {
    el.status.textContent = text;
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
    const view = win.ownerDocument.defaultView || window;
    const rect = win.getBoundingClientRect();
    store.write(STORE_KEY, {
      speak: state.speak,
      fab: { top: fab.style.top || "", left: fab.style.left || "" },
      win: { top: win.style.top || "", left: win.style.left || "" },
      winW: rect.width,
      vw: view.innerWidth,
      vh: view.innerHeight
    });
  }

  /* ============ رسم الرسائل ============ */
  function bubble(message) {
    const node = document.createElement("div");
    const kind = message.role === "user" ? "user" : (message.role === "error" ? "err" : "ai");
    node.className = "tmd-msg tmd-msg--" + kind;
    if (message.role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "tmd-msg__spark";
      avatar.innerHTML = sparkSVG();
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
    if (!state.messages.length) {
      bubble({
        role: "assistant",
        content:
          "مرحبًا 👋 أنا SPARTA AI في نافذة عائمة.\n" +
          "اكتب لي، أو اضغط 🎙️ وتحدّث معي، أو شارك شاشتك لأرى ما تعمل عليه.\n" +
          "واضغط زر التثبيت 📌 بالأعلى لأبقى فوق كل التطبيقات أثناء عملك."
      });
    }
    state.messages.forEach(bubble);
    scrollDown();
  }

  function addTyping() {
    const node = document.createElement("div");
    node.className = "tmd-msg tmd-msg--ai";
    node.innerHTML =
      '<span class="tmd-msg__spark">' + sparkSVG() + "</span>" +
      '<span class="tmd-typing"><span></span><span></span><span></span></span>';
    el.body.appendChild(node);
    scrollDown();
    return node;
  }

  /* ============ النطق الصوتي (TTS) ============ */
  const ttsSupported = "speechSynthesis" in window;

  function stopSpeaking() {
    if (ttsSupported) window.speechSynthesis.cancel();
  }

  function speak(text) {
    if (!state.speak || !ttsSupported) return;
    stopSpeaking();
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, " مقطع برمجي. ")
      .replace(/[*#_~`>|]/g, "")
      .replace(/https?:\/\/\S+/g, " رابط ")
      .trim()
      .slice(0, 900);
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "ar-SA";
    utter.rate = 1.02;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices() || [];
    const arabic = voices.find((v) => /ar/i.test(v.lang));
    if (arabic) utter.voice = arabic;
    utter.onstart = () => setStatus("🔊 يتحدث الآن…");
    utter.onend = () => setStatus(pinnedLabel());
    window.speechSynthesis.speak(utter);
  }

  function pinnedLabel() {
    if (state.sharing) return "🖥️ يشاهد شاشتك";
    return state.pinned ? "📌 مثبّت فوق التطبيقات" : "جاهز للدردشة";
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
      setStatus("🎙️ أستمع إليك…");
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
      if (finalText.trim()) {
        stopListening();
        send();
      }
    };
    recognition.onerror = (event) => {
      stopListening();
      if (event.error === "not-allowed") {
        pushError("تم رفض إذن الميكروفون. فعّل الإذن من إعدادات المتصفح لاستخدام المحادثة الصوتية.");
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
  }

  function toggleMic() {
    if (!SR) {
      pushError("متصفحك لا يدعم التعرّف على الكلام. جرّب Chrome أو Edge.");
      return;
    }
    const rec = initRecognition();
    if (state.listening) {
      try { rec.stop(); } catch (e) { /* تجاهل */ }
      return;
    }
    stopSpeaking();
    try {
      rec.start();
    } catch (e) {
      stopListening();
    }
  }

  /* ============ مشاركة الشاشة / جسر Android ============ */
  // لا يظهر هذا الجسر إلا داخل APK. الاستعلام مفيد أثناء تحميل صفحة Android
  // لكنه لا يمنح أي صلاحيات في المتصفح العادي.
  const androidBridge = window.TmdAndroid || null;
  const isAndroidApp = Boolean(androidBridge) || new URLSearchParams(window.location.search).get("android") === "1";

  if (isAndroidApp) document.body.classList.add("tmd-android-overlay");

  function setNativeOverlayExpanded(value) {
    if (!androidBridge || typeof androidBridge.setOverlayExpanded !== "function") return;
    try { androidBridge.setOverlayExpanded(Boolean(value)); } catch (e) { /* تجاهل */ }
  }

  function markShareStarted() {
    state.sharing = true;
    el.screenBox.classList.add("is-on");
    el.shareBtn.classList.add("is-active");
    el.shareBtn.querySelector("span").textContent = "إيقاف المشاركة";
    el.badge.classList.add("is-on");
    setStatus("🖥️ يشاهد شاشتك");
    bubble({
      role: "assistant",
      content: "تم تفعيل مشاركة الشاشة ✅ سأرفق لقطة من شاشتك مع كل رسالة لأفهم ما تعمل عليه. اسألني: ماذا ترى على شاشتي؟"
    });
    scrollDown();
  }

  // يستدعي تطبيق Android هذه الدوال بعد نتيجة نافذة موافقة النظام.
  window.tmdAndroidScreenShareStarted = markShareStarted;
  window.tmdAndroidScreenShareStopped = () => stopShare(true);
  window.tmdAndroidScreenShareDenied = () => pushError("لم يتم السماح بمشاركة الشاشة.");

  async function toggleShare() {
    if (state.sharing) {
      stopShare();
      return;
    }
    if (androidBridge) {
      try { androidBridge.startScreenShare(); }
      catch (e) { pushError("تعذّر طلب إذن مشاركة الشاشة من Android."); }
      return;
    }
    const media = (win.ownerDocument.defaultView || window).navigator.mediaDevices;
    if (!media || !media.getDisplayMedia) {
      pushError("متصفحك لا يدعم مشاركة الشاشة.");
      return;
    }
    try {
      const stream = await media.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });
      state.stream = stream;
      el.video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener("ended", stopShare);
      markShareStarted();
    } catch (e) {
      if (e && e.name !== "NotAllowedError") {
        pushError("تعذّر بدء مشاركة الشاشة: " + (e.message || e.name));
      }
    }
  }

  function stopShare(fromNative) {
    if (androidBridge && !fromNative) {
      try { androidBridge.stopScreenShare(); } catch (e) { /* تجاهل */ }
    }
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }
    state.stream = null;
    state.sharing = false;
    el.video.srcObject = null;
    el.screenBox.classList.remove("is-on");
    el.shareBtn.classList.remove("is-active");
    el.shareBtn.querySelector("span").textContent = "مشاركة الشاشة";
    el.badge.classList.remove("is-on");
    setStatus(pinnedLabel());
  }

  function captureFrame() {
    if (!state.sharing) return null;
    if (androidBridge) {
      try { return androidBridge.getLatestScreenshot() || null; }
      catch (e) { return null; }
    }
    if (!el.video.videoWidth) return null;
    const maxW = 1280;
    const scale = Math.min(1, maxW / el.video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(el.video.videoWidth * scale);
    canvas.height = Math.round(el.video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(el.video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch (e) {
      return null;
    }
  }

  /* ============ الاتصال بالـ API ============ */
  function buildApiMessages(image) {
    const history = state.messages.slice(-MAX_TURNS * 2).map((message, index, arr) => {
      const isLast = index === arr.length - 1;
      if (isLast && image && message.role === "user") {
        return {
          role: "user",
          content: [
            { type: "text", text: message.content || "حلّل لقطة شاشتي الحالية." },
            { type: "image_url", image_url: { url: image } }
          ]
        };
      }
      return { role: message.role === "error" ? "assistant" : message.role, content: message.content };
    });
    return [{ role: "system", content: SYSTEM_PROMPT }].concat(history);
  }

  function pushError(text) {
    const safe = String(text || "تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.");
    state.messages.push({ role: "error", content: safe });
    bubble({ role: "error", content: safe });
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
      el.send.innerHTML = '<span style="font-size:1.05rem;line-height:1">■</span>';
    } else {
      el.send.classList.remove("is-stop");
      el.send.title = "إرسال";
      el.send.innerHTML = ICONS.send;
      updateSendAvailability();
    }
  }

  function updateSendAvailability() {
    if (state.busy) {
      el.send.disabled = false;
      return;
    }
    el.send.disabled = !el.input.value.trim();
  }

  async function send() {
    if (state.busy) {
      state.abortReason = "manual";
      if (state.controller) state.controller.abort();
      return;
    }
    const text = el.input.value.trim();
    if (!text) {
      updateSendAvailability();
      return;
    }

    stopSpeaking();

    /* MiniMax جزء من SPARTA Max Pro فقط؛ لا ننشئ أو نمنح رصيدًا يوميًا. */
    const useMiniMax = plan.isPro();

    const image = captureFrame();

    state.messages.push({ role: "user", content: text, image: image || undefined });
    bubble({ role: "user", content: text, image: image || undefined });
    el.input.value = "";
    autoGrow();
    saveChat();
    scrollDown();

    state.busy = true;
    state.abortReason = "";
    setSendBusy(true);
    setStatus("… يفكّر");
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
      saveChat();
      scrollDown();
      speak(reply);
    } catch (error) {
      typing.remove();
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
      setSendBusy(false);
      if (!state.listening) setStatus(pinnedLabel());
    }
  }

  /* ==========================================================
     التثبيت فوق كل التطبيقات (الفقاعة الدائمة)
     ----------------------------------------------------------
     Chrome/Edge (كمبيوتر): Document Picture-in-Picture
     نافذة دائمة فوق كل النوافذ، متصلة بالموقع الأصلي.
     غير ذلك: نافذة مستقلة مدمجة عبر assistant.html
  ========================================================== */
  async function pin() {
    if (!state.enabled) {
      setEnabled(true);
    }
    if (state.pinned && pipWindow) {
      try { pipWindow.close(); } catch (e) { /* تجاهل */ }
      return;
    }
    if ("documentPictureInPicture" in window && window.documentPictureInPicture) {
      try {
        const width = Math.max(340, Math.min(430, Math.round(window.screen.width * 0.28)));
        const height = Math.max(500, Math.min(720, Math.round(window.screen.height * 0.82)));
        pipWindow = await window.documentPictureInPicture.requestWindow({ width, height });
        adoptPipWindow(pipWindow);
        return;
      } catch (e) {
        /* إن فشل: نستخدم النافذة المستقلة */
      }
    }
    openPopupWindow();
  }

  function adoptPipWindow(pip) {
    const doc = pip.document;
    doc.documentElement.lang = "ar";
    doc.documentElement.dir = "rtl";
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme || "dark";
    doc.title = "SPARTA AI — مساعد عائم";

    /* نسخ التنسيقات إلى نافذة التثبيت */
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
      } catch (e) { /* ورقة خارجية محمية — تجاهل */ }
    });

    doc.body.className = "tmd-pip-body";

    const shell = doc.createElement("div");
    shell.className = "tmd-pip-shell";
    doc.body.appendChild(shell);

    /* نقل نافذة المحادثة نفسها إلى النافذة العائمة */
    shell.appendChild(win);
    win.classList.add("is-open", "is-pinned");
    win.classList.remove("is-collapsed");
    state.collapsed = false;
    state.open = true;
    state.pinned = true;

    fab.classList.add("is-pinned");
    el.pinBtn.classList.add("is-active");
    el.pinBtn.title = "إلغاء التثبيت وإعادة المساعد إلى الموقع";
    el.pinBtn.innerHTML = ICONS.unpin;
    setStatus("📌 مثبّت فوق التطبيقات");
    flashFabTag();

    bubble({
      role: "assistant",
      content: "تم التثبيت 📌 أنا الآن نافذة عائمة فوق كل التطبيقات، وسأبقى متصلًا وأعمل أثناء استخدامك أي برنامج آخر. (تبقى متصلًا بالموقع الأصلي ما دام تبويبه مفتوحًا)"
    });
    scrollDown();
    setTimeout(() => el.input.focus(), 150);

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

    try {
      win.classList.remove("is-pinned");
      document.body.appendChild(win);
    } catch (e) { /* الصفحة الأصلية أُغلقت — تجاهل */ }

    win.classList.remove("is-open");
    state.open = false;
    fab.classList.remove("is-pinned");
    if (pendingReopen) {
      pendingReopen = false;
      openWin();
    }
    el.pinBtn.classList.remove("is-active");
    el.pinBtn.title = "تثبيت فوق كل التطبيقات — نافذة عائمة دائمة تبقى أمامك أثناء استخدام أي برنامج آخر";
    el.pinBtn.innerHTML = ICONS.pin;
    setStatus(pinnedLabel());
  }

  function openPopupWindow() {
    const w = Math.min(420, Math.round(window.screen.availWidth * 0.9) || 400);
    const h = Math.min(680, Math.round(window.screen.availHeight * 0.9) || 620);
    const opened = window.open(
      new URL("/assistant.html", window.location.href).href,
      "tmd-assistant",
      "popup=yes,width=" + w + ",height=" + h
    );
    if (opened) {
      closeWin();
      bubble({
        role: "assistant",
        content: "فتحنا المساعد في نافذة مستقلة 🗗 استمر في عملك وسيبقى يعمل بجانبك.\nللحصول على النافذة العائمة فوق كل التطبيقات استخدم Chrome أو Edge على الكمبيوتر."
      });
      scrollDown();
    } else {
      pushError("تعذّر فتح النافذة العائمة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
    }
  }

  /* ============ السحب والإفلات (يعمل داخل أي مستند) ============ */
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
      const view = target.ownerDocument.defaultView || window;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved = true;
        target.classList.add("is-dragging");
      }
      const rect = target.getBoundingClientRect();
      const left = Math.min(Math.max(4, baseLeft + dx), view.innerWidth - rect.width - 4);
      const top = Math.min(Math.max(4, baseTop + dy), view.innerHeight - rect.height - 4);
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

  /* التصاق الفقاعة بأقرب حافة بعد السحب */
  function snapFabToEdge() {
    const view = fab.ownerDocument.defaultView || window;
    const rect = fab.getBoundingClientRect();
    const middle = rect.left + rect.width / 2;
    const edge = middle < view.innerWidth / 2 ? 10 : view.innerWidth - rect.width - 10;
    fab.classList.add("is-snapping");
    fab.style.left = edge + "px";
    setTimeout(() => {
      fab.classList.remove("is-snapping");
      savePrefs();
    }, 260);
  }

  /* ============ فتح/إغلاق ============ */
  function openWin() {
    if (!state.enabled) return;
    // في APK لا تبقى نافذة WebView كبيرة وشفافة فوق التطبيقات: تتسع فقط
    // عندما يفتح المستخدم الفقاعة، كي تبقى بقية واجهة الهاتف قابلة للمس.
    if (!state.pinned) setNativeOverlayExpanded(true);
    state.open = true;
    win.classList.add("is-open");
    win.classList.remove("is-collapsed");
    state.collapsed = false;
    fab.setAttribute("aria-label", "إغلاق مساعد SPARTA AI العائم");
    setTimeout(() => el.input.focus(), 120);
    scrollDown();
  }

  function closeWin() {
    state.open = false;
    win.classList.remove("is-open");
    if (!state.pinned) setNativeOverlayExpanded(false);
    stopSpeaking();
    if (state.listening && recognition) {
      try { recognition.stop(); } catch (e) { /* تجاهل */ }
    }
  }

  function toggleWin() {
    if (!state.enabled) return;
    if (state.pinned) {
      flashFabTag();
      setStatus("📌 مثبّت فوق التطبيقات — أوقف التثبيت من زر الدبوس بالنافذة العائمة");
      return;
    }
    if (state.open) closeWin();
    else openWin();
  }

  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 96) + "px";
  }

  /* ============ الربط ============ */
  if (isAndroidApp) {
    // حجم نافذة Android يساوي حجم الفقاعة عند الإغلاق؛ تحريك عنصر HTML
    // داخله لن يحرّك النافذة الأصلية، لذلك نحافظ على لمسة واحدة موثوقة للفتح.
    fab.addEventListener("click", toggleWin);
  } else {
    makeDraggable(fab, fab, (moved) => {
      if (moved) snapFabToEdge();
      else toggleWin();
    });
    makeDraggable(el.head, win);
  }

  el.close.addEventListener("click", () => {
    if (state.pinned) {
      try { if (pipWindow) pipWindow.close(); } catch (e) { /* تجاهل */ }
      return;
    }
    closeWin();
  });

  el.pinBtn.addEventListener("click", () => {
    if (state.pinned) {
      pendingReopen = true; // إلغاء التثبيت يعيد النافذة مفتوحة داخل الموقع
      try { if (pipWindow) pipWindow.close(); } catch (e) { unpin(); }
    } else {
      pin();
    }
  });

  el.collapse.addEventListener("click", () => {
    // التصغير في APK يعيد النافذة إلى فقاعة حقيقية صغيرة، بدلاً من ترك
    // مستطيل شفاف فوق التطبيقات يمنع لمس الشاشة.
    if (isAndroidApp) {
      closeWin();
      return;
    }
    state.collapsed = !state.collapsed;
    win.classList.toggle("is-collapsed", state.collapsed);
    el.collapse.innerHTML = state.collapsed ? ICONS.plus : ICONS.minus;
  });

  el.clear.addEventListener("click", () => {
    stopSpeaking();
    state.messages = [];
    saveChat();
    renderAll();
    setStatus("بدأنا محادثة جديدة");
  });

  el.planBtn.addEventListener("click", () => togglePlanSheet());
  el.planClose.addEventListener("click", () => togglePlanSheet(false));
  el.planPro.addEventListener("click", () => {
    // لا نحوّل المستخدم إلى Pro محليًا: التفعيل يأتي من تحقق الاشتراك المدفوع.
    setStatus("SPARTA Max Pro يتطلب اشتراكًا مدفوعًا");
    bubble({
      role: "assistant",
      content:
        "SPARTA Max Pro يتطلب اشتراكًا مدفوعًا ومؤكدًا. بعد التفعيل ستحصل على MiniMax M3 ومهمة Pro يومية داخل الأداة الكاملة. لا تتضمن الخطط أرصدة يومية تلقائية."
    });
    scrollDown();
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

  el.shareBtn.addEventListener("click", toggleShare);
  el.micBtn.addEventListener("click", toggleMic);
  el.speakBtn.addEventListener("click", () => {
    state.speak = !state.speak;
    el.speakBtn.classList.toggle("is-active", state.speak);
    el.speakBtn.querySelector("span").textContent = state.speak ? "النطق" : "صامت";
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
    el.speakBtn.classList.toggle("is-active", state.speak);
    el.speakBtn.querySelector("span").textContent = state.speak ? "النطق" : "صامت";
    updatePlanUI();

    if (prefs.fab && prefs.fab.top && prefs.vh) {
      /* إعادة تموضع الفقاعة بالنسبة لأبعاد الشاشة الحالية */
      const relTop = parseFloat(prefs.fab.top) / prefs.vh;
      const relLeft = parseFloat(prefs.fab.left) / prefs.vw;
      if (Number.isFinite(relTop) && Number.isFinite(relLeft)) {
        const size = fab.getBoundingClientRect().width || 62;
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

  /* عند تشغيل النسخة المستقلة (نافذة منبثقة أو تطبيق مثبت)
     تظهر المحادثة مباشرة كنافذة عائمة كاملة الشاشة. */
  const isMiniApp = document.body.classList.contains("tmd-assistant-page");
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone || isAndroidApp) {
    el.pinBtn.style.display = "none";
    el.openSite.style.display = "none";
  }
  // assistant.html هو نافذة مستقلة في الويب/PWA، لكنه داخل APK هو محتوى
  // الفقاعة؛ لذلك لا نفتحه تلقائياً ولا نحجب واجهة الهاتف بمستطيل كبير.
  if (isMiniApp && !isAndroidApp && state.enabled) {
    document.documentElement.classList.add("tmd-standalone");
    openWin();
    fab.setAttribute("aria-label", "إغلاق المساعد العائم");
  } else if (isAndroidApp) {
    setNativeOverlayExpanded(false);
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
      send();
    },
    shareScreen: toggleShare,
    stopShare,
    setEnabled,
    isEnabled() { return state.enabled; },
    // جسر التكامل مع بوابة دفع موثوقة: يجب ألا يستدعى إلا بعد تأكيد الاشتراك.
    // لا يوجد زر في الواجهة يحوّل الباقة المجانية إلى Pro من تلقاء نفسه.
    setPaidPlan(active) {
      plan.setPro(Boolean(active));
      if (active) setStatus("SPARTA Max Pro مفعّلة — MiniMax ومهمة اليوم جاهزان");
    },
    isProPlan() { return plan.isPro(); },
    speak,
    stopSpeaking,
    state
  };
})();
