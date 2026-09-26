/* ==========================================================
   T.M.D_AI — الأداة العائمة (Floating Mini Assistant)
   ----------------------------------------------------------
   • زر عائم قابل للسحب يظهر فوق الواجهة في أي صفحة.
   • شاشة مصغّرة من T.M.D_AI للدردشة السريعة دون مغادرة الصفحة.
   • مشاركة الشاشة مع المساعد وتحليل ما يراه المستخدم.
   • تحدّث صوتي: المساعد ينطق الرد، والمستخدم يتحدث بالميكروفون.
   ملف مستقل تمامًا — لا يعتمد على app.js.
   ========================================================== */
(function () {
  "use strict";

  if (window.__tmdFloatingAssistant) return;

  /* ============ إعدادات عامة ============ */
  const STORE_KEY = "tmd_float_state";
  const CHAT_KEY = "tmd_float_chat";
  const API_URL = "/api/chat";
  const TEXT_MODEL = "openai/gpt-oss-120b";
  const VISION_MODEL = "qwen/qwen3.8-27b";
  const MAX_TURNS = 14;

  const SYSTEM_PROMPT =
    "أنت T.M.D_AI، مساعد ذكي عربي احترافي يعمل الآن داخل نافذة مصغّرة عائمة فوق موقع المستخدم. " +
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

  /* ============ الحالة ============ */
  const state = {
    open: false,
    collapsed: false,
    busy: false,
    speak: true,
    listening: false,
    sharing: false,
    controller: null,
    stream: null,
    messages: [],
    fab: null,
    win: null
  };

  const store = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* تجاهل */ }
    }
  };

  /* ============ بناء الواجهة ============ */
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "tmd-fab";
  fab.setAttribute("aria-label", "فتح مساعد T.M.D_AI العائم");
  fab.title = "T.M.D_AI — مساعد عائم (اسحب لتحريكه)";
  fab.innerHTML =
    '<span class="tmd-fab__ring"></span>' +
    '<span class="tmd-fab__icon">🤖</span>' +
    '<span class="tmd-fab__badge" data-el="badge">●</span>';

  const win = document.createElement("section");
  win.className = "tmd-mini";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "شاشة T.M.D_AI المصغّرة");
  win.innerHTML = `
    <header class="tmd-mini__head" data-el="head">
      <div class="tmd-mini__avatar">🤖</div>
      <div class="tmd-mini__titles">
        <div class="tmd-mini__title">T.M.D_AI — مساعد عائم</div>
        <div class="tmd-mini__status" data-el="status">جاهز للدردشة</div>
      </div>
      <button type="button" class="tmd-mini__head-btn" data-el="clear" title="محادثة جديدة">🗑</button>
      <button type="button" class="tmd-mini__head-btn" data-el="collapse" title="تصغير">–</button>
      <button type="button" class="tmd-mini__head-btn" data-el="close" title="إغلاق">✕</button>
    </header>

    <div class="tmd-mini__screen" data-el="screenBox">
      <video data-el="video" muted playsinline autoplay></video>
      <span class="tmd-mini__screen-tag">مشاركة الشاشة نشطة</span>
    </div>

    <div class="tmd-mini__body" data-el="body"></div>

    <div class="tmd-mini__chips" data-el="chips"></div>

    <div class="tmd-mini__tools">
      <button type="button" class="tmd-tool" data-el="shareBtn">🖥️ <span>مشاركة الشاشة</span></button>
      <button type="button" class="tmd-tool" data-el="micBtn">🎙️ <span>تحدّث</span></button>
      <button type="button" class="tmd-tool" data-el="speakBtn">🔊 <span>النطق</span></button>
    </div>

    <div class="tmd-mini__foot">
      <textarea class="tmd-mini__input" data-el="input" rows="1"
        placeholder="اكتب رسالتك أو تحدّث بالميكروفون…"></textarea>
      <button type="button" class="tmd-mini__send" data-el="send" title="إرسال">➤</button>
    </div>
  `;

  const el = {};
  win.querySelectorAll("[data-el]").forEach((node) => {
    el[node.dataset.el] = node;
  });
  el.badge = fab.querySelector("[data-el=badge]");

  document.body.appendChild(fab);
  document.body.appendChild(win);
  state.fab = fab;
  state.win = win;

  /* ============ أدوات مساعدة ============ */
  function setStatus(text) {
    el.status.textContent = text;
  }

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
      `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return html;
  }

  function scrollDown() {
    el.body.scrollTop = el.body.scrollHeight;
  }

  function saveChat() {
    store.write(CHAT_KEY, state.messages.slice(-MAX_TURNS * 2));
  }

  function savePrefs() {
    const rect = win.getBoundingClientRect();
    store.write(STORE_KEY, {
      speak: state.speak,
      fab: { top: fab.style.top || "", left: fab.style.left || "" },
      win: { top: win.style.top || "", left: win.style.left || "" },
      winW: rect.width
    });
  }

  /* ============ رسم الرسائل ============ */
  function bubble(message) {
    const node = document.createElement("div");
    const kind = message.role === "user" ? "user" : (message.role === "error" ? "err" : "ai");
    node.className = `tmd-msg tmd-msg--${kind}`;
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
          "مرحبًا 👋 أنا T.M.D_AI في نافذة مصغّرة.\n" +
          "اكتب لي، أو اضغط 🎙️ وتحدّث معي، أو شارك شاشتك عبر 🖥️ لأرى ما تعمل عليه وأساعدك مباشرة."
      });
    }
    state.messages.forEach(bubble);
    scrollDown();
  }

  function addTyping() {
    const node = document.createElement("div");
    node.className = "tmd-msg tmd-msg--ai";
    node.innerHTML = '<span class="tmd-typing"><span></span><span></span><span></span></span>';
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
    utter.onend = () => setStatus(state.sharing ? "🖥️ يشاهد شاشتك" : "جاهز للدردشة");
    window.speechSynthesis.speak(utter);
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
    if (!state.busy) setStatus(state.sharing ? "🖥️ يشاهد شاشتك" : "جاهز للدردشة");
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

  /* ============ مشاركة الشاشة ============ */
  async function toggleShare() {
    if (state.sharing) {
      stopShare();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      pushError("متصفحك لا يدعم مشاركة الشاشة.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });
      state.stream = stream;
      state.sharing = true;
      el.video.srcObject = stream;
      el.screenBox.classList.add("is-on");
      el.shareBtn.classList.add("is-active");
      el.shareBtn.querySelector("span").textContent = "إيقاف المشاركة";
      el.badge.classList.add("is-on");
      setStatus("🖥️ يشاهد شاشتك");
      stream.getVideoTracks()[0].addEventListener("ended", stopShare);
      bubble({
        role: "assistant",
        content: "تم تفعيل مشاركة الشاشة ✅ سأرفق لقطة من شاشتك مع كل رسالة لأفهم ما تعمل عليه. اسألني: ماذا ترى على شاشتي؟"
      });
      scrollDown();
    } catch (e) {
      if (e && e.name !== "NotAllowedError") {
        pushError("تعذّر بدء مشاركة الشاشة: " + (e.message || e.name));
      }
    }
  }

  function stopShare() {
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
    setStatus("جاهز للدردشة");
  }

  function captureFrame() {
    if (!state.sharing || !el.video.videoWidth) return null;
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
    state.messages.push({ role: "error", content: text });
    bubble({ role: "error", content: text });
    scrollDown();
    saveChat();
  }

  async function send() {
    if (state.busy) {
      if (state.controller) state.controller.abort();
      return;
    }
    const text = el.input.value.trim();
    if (!text) return;

    stopSpeaking();
    const image = captureFrame();

    state.messages.push({ role: "user", content: text, image: image || undefined });
    bubble({ role: "user", content: text, image: image || undefined });
    el.input.value = "";
    autoGrow();
    saveChat();
    scrollDown();

    state.busy = true;
    el.send.disabled = true;
    setStatus("… يفكّر");
    const typing = addTyping();
    state.controller = new AbortController();

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: image ? VISION_MODEL : TEXT_MODEL,
          messages: buildApiMessages(image)
        }),
        signal: state.controller.signal
      });

      const data = await response.json().catch(() => ({}));
      typing.remove();

      if (!response.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || `تعذّر الحصول على رد (${response.status}).`);
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
        setStatus("تم إيقاف الطلب");
      } else {
        pushError((error && error.message) || "حدث خطأ غير متوقع.");
      }
    } finally {
      state.busy = false;
      state.controller = null;
      el.send.disabled = false;
      if (!state.listening) {
        setStatus(state.sharing ? "🖥️ يشاهد شاشتك" : "جاهز للدردشة");
      }
    }
  }

  /* ============ السحب والإفلات ============ */
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
      target.style.top = `${rect.top}px`;
      target.style.left = `${rect.left}px`;
      target.style.right = "auto";
      target.style.bottom = "auto";
      target.style.insetInlineEnd = "auto";
      target.style.insetBlockEnd = "auto";
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    }

    function move(event) {
      if (!active) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved = true;
        target.classList.add("is-dragging");
      }
      const rect = target.getBoundingClientRect();
      const left = Math.min(Math.max(4, baseLeft + dx), window.innerWidth - rect.width - 4);
      const top = Math.min(Math.max(4, baseTop + dy), window.innerHeight - rect.height - 4);
      target.style.left = `${left}px`;
      target.style.top = `${top}px`;
    }

    function up() {
      active = false;
      target.classList.remove("is-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (onEnd) onEnd(moved);
      savePrefs();
    }

    handle.addEventListener("pointerdown", down);
  }

  /* ============ فتح/إغلاق ============ */
  function openWin() {
    state.open = true;
    win.classList.add("is-open");
    win.classList.remove("is-collapsed");
    state.collapsed = false;
    fab.setAttribute("aria-label", "إغلاق مساعد T.M.D_AI العائم");
    setTimeout(() => el.input.focus(), 120);
    scrollDown();
  }

  function closeWin() {
    state.open = false;
    win.classList.remove("is-open");
    stopSpeaking();
    if (state.listening && recognition) {
      try { recognition.stop(); } catch (e) { /* تجاهل */ }
    }
  }

  function toggleWin() {
    if (state.open) closeWin();
    else openWin();
  }

  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = `${Math.min(el.input.scrollHeight, 96)}px`;
  }

  /* ============ الربط ============ */
  makeDraggable(fab, fab, (moved) => {
    if (!moved) toggleWin();
  });
  makeDraggable(el.head, win);

  el.close.addEventListener("click", closeWin);
  el.collapse.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    win.classList.toggle("is-collapsed", state.collapsed);
    el.collapse.textContent = state.collapsed ? "▢" : "–";
  });
  el.clear.addEventListener("click", () => {
    stopSpeaking();
    state.messages = [];
    saveChat();
    renderAll();
    setStatus("بدأنا محادثة جديدة");
  });

  el.send.addEventListener("click", send);
  el.input.addEventListener("input", autoGrow);
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
    if (event.key === "Escape" && state.open) closeWin();
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

    if (prefs.fab && prefs.fab.top) {
      fab.style.top = prefs.fab.top;
      fab.style.left = prefs.fab.left;
      fab.style.insetInlineEnd = "auto";
      fab.style.insetBlockEnd = "auto";
    }

    const saved = store.read(CHAT_KEY, []);
    if (Array.isArray(saved)) {
      state.messages = saved
        .filter((m) => m && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content }));
    }
    renderAll();
  })();

  if (ttsSupported && typeof window.speechSynthesis.getVoices === "function") {
    window.speechSynthesis.getVoices();
  }

  /* ============ واجهة برمجية عامة ============ */
  window.__tmdFloatingAssistant = {
    open: openWin,
    close: closeWin,
    toggle: toggleWin,
    ask(text) {
      openWin();
      el.input.value = String(text || "");
      autoGrow();
      send();
    },
    shareScreen: toggleShare,
    stopShare,
    speak,
    stopSpeaking,
    state
  };
})();
