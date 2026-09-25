"use strict";

/* ===========================================================================
   T.M.D_AI_Pro — Complete Application Script
   Architect, Developer & Designer: ياسين عمرو عبد الرحيم (Yassin Amr Abdelrahim)
   =========================================================================== */

/* =========================================================
   1. GLOBAL STATE
   ========================================================= */
const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  conversations: JSON.parse(localStorage.getItem("tmd_conversations") || "[]"),
  theme: localStorage.getItem("tmd_theme") || "dark",
  model: localStorage.getItem("tmd_model") || "openai/gpt-oss-120b",
  busy: false,
  controller: null,
  selectedImage: null,
  selectedDocument: null,
  imageMode: "analyze",
  lastCreatorResponseIndex: -1,
  // Set to true after MiniMax reports an empty balance (code 1008),
  // so the UI can warn the user before the next attempt.
  minimaxBillingBlocked: localStorage.getItem("tmd_minimax_billing") === "1"
};

const MODELS = {
  fast: "openai/gpt-oss-20b",
  smart: "openai/gpt-oss-120b",
  vision: "qwen/qwen3.8-27b",
  minimax: "MiniMax-M3"
};

const VALID_MODELS = new Set([
  MODELS.fast,
  MODELS.smart,
  MODELS.vision,
  MODELS.minimax
]);

if (!VALID_MODELS.has(state.model)) {
  state.model = MODELS.smart;
  localStorage.setItem("tmd_model", state.model);
}


/* =========================================================
   2. CREATOR & IDENTITY RESPONSES LIBRARY (ياسين عمرو عبد الرحيم)
   ========================================================= */
const CREATOR_RESPONSES = [
  `أنا **T.M.D_AI_Pro**، مساعد ذكاء اصطناعي فائق التطور. تم تصميمي وتطويري وبرمجتي بالكامل بواسطة المطور والمصمم المبدع **ياسين عمرو عبد الرحيم**، الذي هندس واجهتي وخوارزمياتي لتقديم تجربة ذكية وسريعة واحترافية.`,

  `الفضل في وجودي وابتكاري يعود للمطور والمهندس **ياسين عمرو عبد الرحيم**؛ هو العقل المدبر الذي قام بتصميم كل جزء في هذا النظام وبرمجته بأحدث تقنيات الذكاء الاصطناعي لتلبية كافة احتياجاتك.`,

  `صممني وطوّرني المطور البارع **ياسين عمرو عبد الرحيم**. قام ببرمجة نظامي وهندسة الواجهة النجمية التفاعلية ونظام المحادثة الذكي ليضمن لك تجربة استثنائية وسلسة.`,

  `أنا ثمرة رؤية وإبداع المطور **ياسين عمرو عبد الرحيم**، الذي جمع بين التصميم العصري الفاخر والذكاء الاصطناعي فائق السرعة لصنع منصة **T.M.D_AI_Pro**.`,

  `المطور والمصمم الحصري لمنصة **T.M.D_AI_Pro** هو **ياسين عمرو عبد الرحيم**. هو من وضع هيكلية النظام، وصمم الواجهات، وبرمج خوارزميات الاستجابة وتحليل المستندات والصور.`,

  `قام بهندستي وبنائي المطور الذكي **ياسين عمرو عبد الرحيم**، بهدف تقديم رفيق ذكاء اصطناعي فائق الدقة والقوة في معالجة النصوص، الملفات، والصور.`,

  `أنا نظام ذكاء اصطناعي ابتكره وصممه المطور **ياسين عمرو عبد الرحيم**؛ كل تفصيلة بصرية وبرمجية تراها هنا هي نتاج شغفه وإبداعه في عالم البرمجة والذكاء الاصطناعي.`,

  `تكويني التقني وتصميمي البصري وراءهما المطور المتميز **ياسين عمرو عبد الرحيم**، الذي طوّر هذه الأداة لتكون مساعدك الاحترافي الأول وسريع الاستجابة.`,

  `صانعي ومطوري هو المبدع **ياسين عمرو عبد الرحيم**، رائد هذا المشروع ومصممه، وقد صاغ خوارزمياتي بعناية فائقة لأكون في خدمتك دائماً بأعلى جودة.`,

  `تمت برمجتي وصياغة بنيتي التحتية بواسطة المهندس والمطور **ياسين عمرو عبد الرحيم**، حيث حرص على جعلي مساعداً فائق الأداء والذكاء بواجهة متجاوبة بالكامل.`,

  `أنا **T.M.D_AI_Pro**، ومطوري ومصممي هو **ياسين عمرو عبد الرحيم**. إذا كان لديك أي استفسار أو مهمة، فأنا مجهز بالكامل لمساعدتك بفضل التطوير المتقن الذي وضعه فيّ.`
];

function getDynamicCreatorResponse() {
  let nextIndex;
  do {
    nextIndex = Math.floor(Math.random() * CREATOR_RESPONSES.length);
  } while (nextIndex === state.lastCreatorResponseIndex && CREATOR_RESPONSES.length > 1);

  state.lastCreatorResponseIndex = nextIndex;
  return CREATOR_RESPONSES[nextIndex];
}

function isCreatorOrIdentityQuestion(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().toLowerCase();

  const patterns = [
    /من\s*(صممك|طورك|برمجك|صنعك|سواك|عملك|أنشأك|انشاك|خلقك|بناك|ابتكرك)/i,
    /مين\s*(صممك|طورك|برمجك|صنعك|سواك|عملك|أنشأك|انشاك|بناك|ابتكرك|اللي\s*عملك|اللي\s*سواك)/i,
    /من\s*هو\s*(مطورك|مصممك|مبرمجك|صانعك|صاحبك|مالكك)/i,
    /مين\s*(مطورك|مصممك|مبرمجك|صانعك|صاحبك)/i,
    /من\s*صاحب\s*(الموقع|الأداة|المنصة|البرنامج|التطبيق)/i,
    /من\s*(برمج|صمم|طور|صنع|بنى)\s*(هذا|هذه)?\s*(الموقع|الأداة|المنصة|الذكاء)/i,
    /ما\s*(هو\s*)?تكوينك/i,
    /من\s*أنت|من\s*انت|عرف\s*بنفسك/i,
    /من\s*هو\s*ياسين|من\s*ياسين|ياسين\s*عمرو/i,
    /who\s*(made|created|designed|developed|programmed|built)\s*(you|this)/i,
    /who\s*is\s*(your\s*)?(developer|creator|designer|author|maker)/i,
    /who\s*are\s*you/i
  ];

  return patterns.some(pattern => pattern.test(clean));
}


/* =========================================================
   3. DYNAMIC INTERACTIVE STARFIELD ENGINE (خلفية النجوم اللامعة)
   ========================================================= */
class StarfieldEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.stars = [];
    this.meteors = [];
    this.running = false;
    this.densityMultiplier = 2; // 1: light, 2: medium, 3: dense
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.mouse = { x: -1000, y: -1000, active: false };
    this.nextMeteorTime = Date.now() + 2000;

    this.init();
  }

  init() {
    this.resize();
    this.createStars();
    this.bindEvents();
    this.start();
  }

  setDensity(level) {
    this.densityMultiplier = Math.max(1, Math.min(3, level));
    this.createStars();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  createStars() {
    const baseCount = Math.floor((this.width * this.height) / 5000);
    const count = Math.min(320, Math.max(70, Math.floor(baseCount * (this.densityMultiplier * 0.65))));

    this.stars = [];
    const colors = [
      "rgba(255, 255, 255,",
      "rgba(0, 242, 254,",
      "rgba(255, 209, 102,",
      "rgba(143, 176, 255,",
      "rgba(255, 120, 200,"
    ];

    for (let i = 0; i < count; i++) {
      const isForeground = Math.random() < 0.18; // 18% bright sparkling stars with cross flares
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: isForeground ? (Math.random() * 2.2 + 1.2) : (Math.random() * 1.4 + 0.4),
        colorPrefix: colors[Math.floor(Math.random() * colors.length)],
        baseAlpha: Math.random() * 0.5 + 0.3,
        twinkleSpeed: Math.random() * 0.04 + 0.015,
        twinkleOffset: Math.random() * Math.PI * 2,
        hasFlare: isForeground,
        driftX: (Math.random() - 0.5) * 0.15,
        driftY: (Math.random() - 0.5) * 0.15
      });
    }
  }

  addMeteor() {
    const startX = Math.random() * (this.width * 0.8) + (this.width * 0.2);
    const startY = Math.random() * (this.height * 0.4);
    const length = Math.random() * 90 + 70;
    const speed = Math.random() * 6 + 7;
    const angle = (Math.PI / 4) + (Math.random() * 0.3 - 0.15); // ~45 deg

    this.meteors.push({
      x: startX,
      y: startY,
      length,
      speed,
      dx: -Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      opacity: 1,
      life: 0,
      maxLife: Math.random() * 45 + 35
    });
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      this.resize();
      this.createStars();
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this.resize();
        this.createStars();
      }, 200);
    });

    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.animate();
  }

  stop() {
    this.running = false;
  }

  drawStar(star, time) {
    const alpha = Math.max(0.1, Math.min(1, star.baseAlpha + Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.45));
    this.ctx.fillStyle = star.colorPrefix + alpha + ")";

    // Draw main star body
    this.ctx.beginPath();
    this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw radiant 4-point cross diffraction sparkle flare for foreground stars
    if (star.hasFlare && alpha > 0.65) {
      const flareLen = star.size * (3.5 + (alpha - 0.65) * 6);
      this.ctx.strokeStyle = star.colorPrefix + (alpha * 0.75) + ")";
      this.ctx.lineWidth = 0.8;

      this.ctx.beginPath();
      // Horizontal flare
      this.ctx.moveTo(star.x - flareLen, star.y);
      this.ctx.lineTo(star.x + flareLen, star.y);
      // Vertical flare
      this.ctx.moveTo(star.x, star.y - flareLen);
      this.ctx.lineTo(star.x, star.y + flareLen);
      this.ctx.stroke();

      // Soft glow center
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
      this.ctx.fillStyle = star.colorPrefix + (alpha * 0.25) + ")";
      this.ctx.fill();
    }
  }

  animate() {
    if (!this.running) return;
    const now = Date.now();
    const time = now * 0.002;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update & draw stars
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      star.x += star.driftX;
      star.y += star.driftY;

      if (star.x < 0) star.x = this.width;
      if (star.x > this.width) star.x = 0;
      if (star.y < 0) star.y = this.height;
      if (star.y > this.height) star.y = 0;

      this.drawStar(star, time);
    }

    // Occasional shooting meteor
    if (now > this.nextMeteorTime) {
      this.addMeteor();
      this.nextMeteorTime = now + Math.random() * 4500 + 3500;
    }

    // Render meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.dx;
      m.y += m.dy;
      m.life++;

      const progress = m.life / m.maxLife;
      const alpha = Math.max(0, 1 - progress);

      const grad = this.ctx.createLinearGradient(
        m.x, m.y,
        m.x - m.dx * (m.length / m.speed),
        m.y - m.dy * (m.length / m.speed)
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95})`);
      grad.addColorStop(0.2, `rgba(0, 242, 254, ${alpha * 0.8})`);
      grad.addColorStop(1, "rgba(0, 242, 254, 0)");

      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = 1.8;
      this.ctx.beginPath();
      this.ctx.moveTo(m.x, m.y);
      this.ctx.lineTo(
        m.x - m.dx * (m.length / m.speed),
        m.y - m.dy * (m.length / m.speed)
      );
      this.ctx.stroke();

      if (m.life >= m.maxLife) {
        this.meteors.splice(i, 1);
      }
    }

    requestAnimationFrame(() => this.animate());
  }
}


/* =========================================================
   4. USER BACKGROUND MANAGER (التخصيص الشخصي المحفوظ محلياً)
   ========================================================= */
class UserBackgroundManager {
  constructor(starfield) {
    this.starfield = starfield;
    this.storageKey = "tmd_user_bg_settings_v3";
    this.settings = this.loadSettings();

    this.layer = document.getElementById("userBgLayer");
    this.overlay = document.getElementById("bgDimOverlay");
    this.starsCanvas = document.getElementById("starsCanvas");

    this.cacheModalElements();
    this.applySettings();
    this.bindEvents();
  }

  loadSettings() {
    const defaults = {
      type: "preset",
      preset: "animated-stars",
      customDataUrl: "",
      customUrl: "",
      dim: 40,
      blur: 0,
      starsOverlay: true,
      starsDensity: 2
    };

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Could not load background settings:", e);
    }
    return defaults;
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
      showToast("تم حفظ وتطبيق تخصيص الخلفية الخاص بك بنجاح!");
    } catch (e) {
      console.warn("Failed to persist background settings in localStorage:", e);
      showToast("تم تطبيق الخلفية، ولكن حجم الصورة قد يكون كبيراً للحفظ الدائم.");
    }
  }

  applySettings() {
    const { type, preset, customDataUrl, customUrl, dim, blur, starsOverlay, starsDensity } = this.settings;

    // 1. Overlay Dim & Blur
    if (this.overlay) {
      this.overlay.style.setProperty("--bg-dim", (dim / 100).toFixed(2));
      this.overlay.style.setProperty("--bg-blur", `${blur}px`);
    }

    // 2. Stars Canvas Visibility & Density
    if (this.starsCanvas) {
      if (type === "preset" && preset === "animated-stars") {
        this.starsCanvas.style.display = "block";
        this.starsCanvas.style.opacity = "1";
      } else {
        this.starsCanvas.style.display = starsOverlay ? "block" : "none";
        this.starsCanvas.style.opacity = starsOverlay ? "0.85" : "0";
      }
    }

    if (this.starfield) {
      this.starfield.setDensity(starsDensity);
    }

    // 3. Background Layer
    if (!this.layer) return;

    if (type === "preset") {
      this.applyPresetBackground(preset);
    } else if (type === "upload" && customDataUrl) {
      this.layer.style.backgroundImage = `url("${customDataUrl}")`;
      this.layer.style.opacity = "1";
    } else if (type === "url" && customUrl) {
      this.layer.style.backgroundImage = `url("${customUrl}")`;
      this.layer.style.opacity = "1";
    } else {
      this.applyPresetBackground("animated-stars");
    }

    this.syncUIControls();
  }

  applyPresetBackground(preset) {
    if (!this.layer) return;

    const presets = {
      "animated-stars": "",
      "nebula": "radial-gradient(circle at 20% 20%, rgba(138,43,226,0.6) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(0,242,254,0.5) 0%, transparent 60%), #070a16",
      "cyberpunk": "linear-gradient(135deg, rgba(255,0,127,0.45) 0%, rgba(0,242,254,0.35) 100%), #080914",
      "aurora": "radial-gradient(circle at 50% 10%, rgba(0,255,136,0.4) 0%, rgba(0,242,254,0.35) 40%, transparent 75%), #040912",
      "obsidian": "linear-gradient(180deg, #0e111a 0%, #05060a 100%)",
      "galaxy-gold": "radial-gradient(circle at 40% 30%, rgba(255,209,102,0.45) 0%, rgba(255,75,43,0.3) 50%, transparent 80%), #0b0714"
    };

    if (preset === "animated-stars" || !presets[preset]) {
      this.layer.style.backgroundImage = "none";
      this.layer.style.opacity = "0";
    } else {
      this.layer.style.backgroundImage = presets[preset];
      this.layer.style.opacity = "1";
    }
  }

  cacheModalElements() {
    this.modal = document.getElementById("bgCustomizerModalBackdrop");
    this.closeBtn = document.getElementById("bgCustomizerClose");
    this.tabBtns = document.querySelectorAll(".customizer-tab");
    this.tabPanes = {
      presets: document.getElementById("panePresets"),
      upload: document.getElementById("paneUpload"),
      url: document.getElementById("paneUrl")
    };
    this.presetCards = document.querySelectorAll(".preset-card");
    this.fileInput = document.getElementById("userCustomBgInput");
    this.triggerUploadBtn = document.getElementById("triggerBgUploadBtn");
    this.uploadedWrap = document.getElementById("uploadedPreviewWrap");
    this.uploadedImg = document.getElementById("uploadedPreviewImg");
    this.removeUploadedBtn = document.getElementById("removeUploadedBgBtn");
    this.urlInput = document.getElementById("bgUrlInput");
    this.applyUrlBtn = document.getElementById("applyBgUrlBtn");
    this.dimSlider = document.getElementById("bgDimRange");
    this.dimLabel = document.getElementById("dimValueLabel");
    this.blurSlider = document.getElementById("bgBlurRange");
    this.blurLabel = document.getElementById("blurValueLabel");
    this.starsOverlayToggle = document.getElementById("starsOverlayToggle");
    this.starsDensitySlider = document.getElementById("starsDensityRange");
    this.starsDensityLabel = document.getElementById("starsDensityLabel");
    this.saveBtn = document.getElementById("saveBgSettingsBtn");
    this.resetBtn = document.getElementById("resetBgBtn");
  }

  syncUIControls() {
    // Preset cards
    this.presetCards?.forEach(card => {
      const isCurrent = this.settings.type === "preset" && card.dataset.preset === this.settings.preset;
      card.classList.toggle("active", isCurrent);
    });

    // Uploaded preview
    if (this.uploadedWrap && this.uploadedImg) {
      if (this.settings.customDataUrl) {
        this.uploadedImg.src = this.settings.customDataUrl;
        this.uploadedWrap.classList.remove("hidden");
      } else {
        this.uploadedWrap.classList.add("hidden");
      }
    }

    // URL input
    if (this.urlInput) {
      this.urlInput.value = this.settings.customUrl || "";
    }

    // Sliders
    if (this.dimSlider) this.dimSlider.value = this.settings.dim;
    if (this.dimLabel) this.dimLabel.textContent = `${this.settings.dim}%`;
    if (this.blurSlider) this.blurSlider.value = this.settings.blur;
    if (this.blurLabel) this.blurLabel.textContent = `${this.settings.blur}px`;
    if (this.starsOverlayToggle) this.starsOverlayToggle.checked = Boolean(this.settings.starsOverlay);
    if (this.starsDensitySlider) this.starsDensitySlider.value = this.settings.starsDensity;
    if (this.starsDensityLabel) {
      const labels = { 1: "خفيفة", 2: "متوسطة", 3: "عالية ومكثفة" };
      this.starsDensityLabel.textContent = labels[this.settings.starsDensity] || "عالية";
    }
  }

  bindEvents() {
    // Open Customizer Triggers
    document.getElementById("openBgCustomizerBtn")?.addEventListener("click", () => this.open());
    document.getElementById("sidebarCustomizerBtn")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.remove("open");
      document.getElementById("sidebarBackdrop")?.classList.remove("show");
      this.open();
    });
    document.getElementById("bgQuickHint")?.addEventListener("click", () => this.open());
    document.getElementById("openBgFromSettingsBtn")?.addEventListener("click", () => {
      document.getElementById("modalBackdrop")?.classList.add("hidden");
      this.open();
    });

    // Close Modal
    this.closeBtn?.addEventListener("click", () => this.close());
    this.modal?.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    // Tabs switching
    this.tabBtns?.forEach(btn => {
      btn.addEventListener("click", () => {
        this.tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        Object.keys(this.tabPanes).forEach(key => {
          this.tabPanes[key]?.classList.toggle("hidden", key !== tab);
        });
      });
    });

    // Preset selection
    this.presetCards?.forEach(card => {
      card.addEventListener("click", () => {
        this.presetCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        this.settings.type = "preset";
        this.settings.preset = card.dataset.preset;
        this.applySettings();
      });
    });

    // File Upload trigger
    this.triggerUploadBtn?.addEventListener("click", () => this.fileInput?.click());
    this.fileInput?.addEventListener("change", (e) => this.handleCustomFileUpload(e));

    // Remove uploaded photo
    this.removeUploadedBtn?.addEventListener("click", () => {
      this.settings.customDataUrl = "";
      this.settings.type = "preset";
      this.settings.preset = "animated-stars";
      this.applySettings();
      showToast("تمت إزالة صورتك الخاصة والعودة للخلفية الافتراضية.");
    });

    // Apply URL
    this.applyUrlBtn?.addEventListener("click", () => {
      const url = this.urlInput?.value?.trim();
      if (!url) {
        showToast("يرجى إدخال رابط الصورة أولاً.");
        return;
      }
      this.settings.type = "url";
      this.settings.customUrl = url;
      this.applySettings();
      showToast("تم تطبيق رابط الصورة كخلفية!");
    });

    // Dim Slider
    this.dimSlider?.addEventListener("input", () => {
      this.settings.dim = parseInt(this.dimSlider.value, 10);
      if (this.dimLabel) this.dimLabel.textContent = `${this.settings.dim}%`;
      this.applySettings();
    });

    // Blur Slider
    this.blurSlider?.addEventListener("input", () => {
      this.settings.blur = parseInt(this.blurSlider.value, 10);
      if (this.blurLabel) this.blurLabel.textContent = `${this.settings.blur}px`;
      this.applySettings();
    });

    // Stars Overlay toggle
    this.starsOverlayToggle?.addEventListener("change", () => {
      this.settings.starsOverlay = this.starsOverlayToggle.checked;
      this.applySettings();
    });

    // Stars Density Slider
    this.starsDensitySlider?.addEventListener("input", () => {
      this.settings.starsDensity = parseInt(this.starsDensitySlider.value, 10);
      const labels = { 1: "خفيفة", 2: "متوسطة", 3: "عالية ومكثفة" };
      if (this.starsDensityLabel) {
        this.starsDensityLabel.textContent = labels[this.settings.starsDensity] || "عالية";
      }
      this.applySettings();
    });

    // Save and Reset Buttons
    this.saveBtn?.addEventListener("click", () => {
      this.saveSettings();
      this.close();
    });

    this.resetBtn?.addEventListener("click", () => {
      this.settings = {
        type: "preset",
        preset: "animated-stars",
        customDataUrl: "",
        customUrl: "",
        dim: 40,
        blur: 0,
        starsOverlay: true,
        starsDensity: 2
      };
      this.saveSettings();
      this.applySettings();
      showToast("تمت استعادة الخلفية الافتراضية (فضاء النجوم البراقة).");
    });
  }

  async handleCustomFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("الملف المختار ليس صورة صالحة.");
      return;
    }

    showToast("جاري معالجة وضغط الصورة للخلفية...");

    try {
      const compressedDataUrl = await this.compressBackgroundImage(file);
      this.settings.type = "upload";
      this.settings.customDataUrl = compressedDataUrl;
      this.applySettings();
      showToast("تم تعيين صورتك المخصصة بنجاح!");
    } catch (err) {
      console.error("Background compression error:", err);
      showToast("تعذر تحميل الصورة، يرجى اختيار صورة أخرى.");
    }
  }

  compressBackgroundImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1920;
          let w = img.width;
          let h = img.height;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  open() {
    this.syncUIControls();
    this.modal?.classList.remove("hidden");
  }

  close() {
    this.modal?.classList.add("hidden");
  }
}


/* =========================================================
   5. DOM ELEMENTS CACHE
   ========================================================= */
let chat, welcome, input, sendButton;
let plusButton, plusMenu;
let documentInput, imageInput;
let addImageButton, analyzeDocumentButton, imageEditButton;
let imagePreviewContainer, imagePreview, imageFileName, imageModeLabel, removeImage;
let historyList, newChat;
let settingsBtn, modalBackdrop, modalClose;
let themeSelect, modelSelect, modelName;
let toast, sidebar, openSidebar, closeSidebar, sidebarBackdrop;
let exportChatBtn, clearChatBtn, clearAllHistoryBtn;
let scrollBottomBtn;
let developerCardBtn, developerModalBackdrop, devModalClose;


/* =========================================================
   6. APPLICATION INITIALIZATION
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  cacheElements();

  // Initialize Animated Stars Canvas
  const starfield = new StarfieldEngine("starsCanvas");

  // Initialize User Background Customizer
  const bgManager = new UserBackgroundManager(starfield);
  window.TMD_BgManager = bgManager;

  applyTheme();
  updateModelUI();
  bindEvents();
  renderHistory();
  renderMessages();
  setupTextarea();
  setupScrollBottom();
});

function cacheElements() {
  chat = document.getElementById("chat");
  welcome = document.getElementById("welcome");
  input = document.getElementById("input");
  sendButton = document.getElementById("send");

  plusButton = document.getElementById("plusButton");
  plusMenu = document.getElementById("plusMenu");

  documentInput = document.getElementById("documentInput");
  imageInput = document.getElementById("imageInput");

  addImageButton = document.getElementById("addImageButton");
  analyzeDocumentButton = document.getElementById("analyzeDocumentButton");
  imageEditButton = document.getElementById("imageEditButton");

  imagePreviewContainer = document.getElementById("imagePreviewContainer");
  imagePreview = document.getElementById("imagePreview");
  imageFileName = document.getElementById("imageFileName");
  imageModeLabel = document.getElementById("imageModeLabel");
  removeImage = document.getElementById("removeImage");

  historyList = document.getElementById("history");
  newChat = document.getElementById("newChat");

  settingsBtn = document.getElementById("settingsBtn");
  modalBackdrop = document.getElementById("modalBackdrop");
  modalClose = document.getElementById("modalClose");

  themeSelect = document.getElementById("themeSelect");
  modelSelect = document.getElementById("modelSelect");
  modelName = document.getElementById("modelName");

  toast = document.getElementById("toast");
  sidebar = document.getElementById("sidebar");
  sidebarBackdrop = document.getElementById("sidebarBackdrop");
  openSidebar = document.getElementById("openSidebar");
  closeSidebar = document.getElementById("closeSidebar");

  exportChatBtn = document.getElementById("exportChatBtn");
  clearChatBtn = document.getElementById("clearChatBtn");
  clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");
  scrollBottomBtn = document.getElementById("scrollBottomBtn");

  developerCardBtn = document.getElementById("developerCardBtn");
  developerModalBackdrop = document.getElementById("developerModalBackdrop");
  devModalClose = document.getElementById("devModalClose");
}


/* =========================================================
   7. EVENTS BINDING
   ========================================================= */
function bindEvents() {
  // Send Message
  sendButton?.addEventListener("click", sendMessage);

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Global Keyboard Shortcuts (Ctrl+K: New Chat, Esc: Close Modals)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      createNewChat();
    }
    if (e.key === "Escape") {
      closeAllModals();
    }
  });

  // Plus Menu
  plusButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlusMenu();
  });

  document.addEventListener("click", (e) => {
    if (plusMenu && !plusMenu.contains(e.target) && e.target !== plusButton) {
      closePlusMenu();
    }
  });

  // Attachments Handlers
  addImageButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.imageMode = "analyze";
    closePlusMenu();
    if (imageInput) {
      imageInput.value = "";
      imageInput.click();
    }
  });

  imageEditButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.imageMode = "edit";
    closePlusMenu();
    if (imageInput) {
      imageInput.value = "";
      imageInput.click();
    }
  });

  imageInput?.addEventListener("change", handleImageSelection);

  analyzeDocumentButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePlusMenu();
    if (documentInput) {
      documentInput.value = "";
      documentInput.click();
    }
  });

  documentInput?.addEventListener("change", handleDocumentSelection);

  removeImage?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetAttachment();
  });

  // New Chat
  newChat?.addEventListener("click", createNewChat);

  // Clear & Export Chat
  clearChatBtn?.addEventListener("click", clearCurrentChat);
  exportChatBtn?.addEventListener("click", exportCurrentChat);
  clearAllHistoryBtn?.addEventListener("click", clearAllConversations);

  // Responsive Sidebar Drawer
  openSidebar?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    sidebarBackdrop?.classList.add("show");
  });

  const closeSidebarFn = () => {
    sidebar?.classList.remove("open");
    sidebarBackdrop?.classList.remove("show");
  };

  closeSidebar?.addEventListener("click", closeSidebarFn);
  sidebarBackdrop?.addEventListener("click", closeSidebarFn);

  // Settings Modal
  settingsBtn?.addEventListener("click", openSettings);
  modalClose?.addEventListener("click", closeSettings);
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeSettings();
  });

  // Developer Profile Modal
  developerCardBtn?.addEventListener("click", () => {
    developerModalBackdrop?.classList.remove("hidden");
  });
  devModalClose?.addEventListener("click", () => {
    developerModalBackdrop?.classList.add("hidden");
  });
  developerModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === developerModalBackdrop) developerModalBackdrop.classList.add("hidden");
  });

  // Theme Sync & Toggles
  themeSelect?.addEventListener("change", () => {
    state.theme = themeSelect.value === "light" ? "light" : "dark";
    localStorage.setItem("tmd_theme", state.theme);
    applyTheme();
  });

  const toggleTheme = () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("tmd_theme", state.theme);
    applyTheme();
    showToast(state.theme === "light" ? "تم التبديل للمظهر الفاتح" : "تم التبديل للمظهر الداكن");
  };

  document.getElementById("themeTop")?.addEventListener("click", toggleTheme);
  document.getElementById("themeTopDesktop")?.addEventListener("click", toggleTheme);

  // Model Selector
  modelSelect?.addEventListener("change", () => {
    const val = modelSelect.value;
    state.model = VALID_MODELS.has(val) ? val : MODELS.smart;
    localStorage.setItem("tmd_model", state.model);
    updateModelUI();
    const settingsModel = document.getElementById("modelSelectSettings");
    if (settingsModel) settingsModel.value = state.model;
  });

  const settingsModel = document.getElementById("modelSelectSettings");
  settingsModel?.addEventListener("change", () => {
    const val = settingsModel.value;
    state.model = VALID_MODELS.has(val) ? val : MODELS.smart;
    localStorage.setItem("tmd_model", state.model);
    if (modelSelect) modelSelect.value = state.model;
    updateModelUI();
  });

  // Welcome Cards Click to Prompt
  document.querySelectorAll(".welcome-card[data-prompt]").forEach(card => {
    card.addEventListener("click", () => {
      if (!input) return;
      input.value = card.dataset.prompt;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
      input.focus();
    });
  });
}

function closeAllModals() {
  modalBackdrop?.classList.add("hidden");
  developerModalBackdrop?.classList.add("hidden");
  window.TMD_BgManager?.close();
  closePlusMenu();
}


/* =========================================================
   8. TEXTAREA & SCROLL CONTROLS
   ========================================================= */
function setupTextarea() {
  if (!input) return;
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  });
}

function setupScrollBottom() {
  if (!chat || !scrollBottomBtn) return;
  chat.addEventListener("scroll", () => {
    const distFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    if (distFromBottom > 160) {
      scrollBottomBtn.classList.remove("hidden");
    } else {
      scrollBottomBtn.classList.add("hidden");
    }
  });

  scrollBottomBtn.addEventListener("click", () => {
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  });
}


/* =========================================================
   9. THEME & MODEL UI
   ========================================================= */
function applyTheme() {
  state.theme = state.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  if (themeSelect) themeSelect.value = state.theme;
}

function updateModelUI() {
  if (modelSelect) modelSelect.value = state.model;
  if (!modelName) return;

  if (state.model === MODELS.vision) {
    modelName.textContent = "T.M.D Vision 27B";
  } else if (state.model === MODELS.minimax) {
    modelName.textContent = state.minimaxBillingBlocked
      ? "T.M.D Max — MiniMax M3 (⚠️ الرصيد منتهٍ — تحويل تلقائي إلى Groq)"
      : "T.M.D Max — MiniMax M3";
  } else if (state.model === MODELS.fast) {
    modelName.textContent = "T.M.D Fast 20B";
  } else {
    modelName.textContent = "T.M.D Pro 120B";
  }
}


/* =========================================================
   10. PLUS MENU ACTIONS
   ========================================================= */
function togglePlusMenu() {
  if (!plusMenu) return;
  const isHidden = plusMenu.classList.contains("hidden");
  if (isHidden) {
    plusMenu.classList.remove("hidden");
    plusButton?.classList.add("active");
  } else {
    plusMenu.classList.add("hidden");
    plusButton?.classList.remove("active");
  }
}

function closePlusMenu() {
  plusMenu?.classList.add("hidden");
  plusButton?.classList.remove("active");
}


/* =========================================================
   11. IMAGE SELECTION & PREPARATION
   ========================================================= */
async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("الملف المحدد ليس صورة صالحة.");
    return;
  }

  try {
    showToast("جاري تجهيز الصورة للتحليل...");
    const dataURL = await prepareImage(file);

    state.selectedImage = {
      file,
      dataURL,
      name: file.name,
      type: file.type
    };
    state.selectedDocument = null;

    showImagePreview();
    updateImageMode();
    showToast("تم إرفاق الصورة بنجاح.");
  } catch (error) {
    console.error("Image selection error:", error);
    showToast(error?.message || "تعذر قراءة الصورة.");
  }
}

async function prepareImage(file) {
  const MAX_DATA_URL_CHARS = 2600000;

  if (file.type !== "image/gif" && file.size <= 1600000) {
    const direct = await fileToDataURL(file);
    if (String(direct).length <= MAX_DATA_URL_CHARS) {
      return direct;
    }
  }

  const objectURL = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("تعذر فتح الصورة."));
      image.src = objectURL;
    });

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let quality = 0.85;
    let dataURL = canvas.toDataURL("image/jpeg", quality);

    while (dataURL.length > MAX_DATA_URL_CHARS && quality > 0.45) {
      quality -= 0.08;
      dataURL = canvas.toDataURL("image/jpeg", quality);
    }

    return dataURL;
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

function showImagePreview() {
  if (!state.selectedImage) return;
  if (imagePreview) imagePreview.src = state.selectedImage.dataURL;
  if (imageFileName) imageFileName.textContent = state.selectedImage.name;
  if (imagePreviewContainer) imagePreviewContainer.classList.remove("hidden");
}

function updateImageMode() {
  if (!imageModeLabel) return;
  imageModeLabel.textContent = state.imageMode === "edit" ? "تجهيز / تعديل الصورة" : "تحليل الصورة";
}

function resetAttachment() {
  state.selectedImage = null;
  state.selectedDocument = null;
  state.imageMode = "analyze";

  if (imageInput) imageInput.value = "";
  if (documentInput) documentInput.value = "";
  if (imagePreview) imagePreview.removeAttribute("src");
  if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
}


/* =========================================================
   12. DOCUMENT SELECTION & EXTRACTION
   ========================================================= */
async function handleDocumentSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    showToast("جاري قراءة واستخراج نص الملف...");
    const text = await readDocument(file);

    if (!text.trim()) {
      throw new Error("لم يتم العثور على محتوى نصي داخل الملف.");
    }

    state.selectedDocument = {
      file,
      name: file.name,
      type: file.type,
      text
    };
    state.selectedImage = null;

    if (imagePreviewContainer) imagePreviewContainer.classList.remove("hidden");
    if (imagePreview) imagePreview.removeAttribute("src");
    if (imageFileName) imageFileName.textContent = file.name;
    if (imageModeLabel) imageModeLabel.textContent = "تحليل المستند";

    showToast(`تم إرفاق المستند: ${file.name}`);

    if (input && !input.value.trim()) {
      input.value = "حلل هذا المستند واذكر أهم النقاط والاستنتاجات والمعلومات الأساسية فيه.";
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
    }
    input?.focus();
  } catch (error) {
    console.error("Document error:", error);
    state.selectedDocument = null;
    showToast(error?.message || "تعذر قراءة الملف.");
  }
}

async function readDocument(file) {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("حجم الملف يجب ألا يتجاوز 15MB.");
  }

  const name = file.name.toLowerCase();

  // Text & Code files
  if (/\.(txt|md|csv|json|html|htm|css|js|jsx|ts|tsx|xml|log|yaml|yml|sql|py|java|cpp|c)$/i.test(name)) {
    return await file.text();
  }

  // DOCX files
  if (name.endsWith(".docx")) {
    if (!window.mammoth) {
      throw new Error("قارئ DOCX غير متوفر حالياً.");
    }
    const result = await window.mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer()
    });
    return result.value || "";
  }

  // PDF files
  if (name.endsWith(".pdf")) {
    let pdfjs = window.pdfjsLib;
    if (!pdfjs) {
      try {
        pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs");
      } catch {
        throw new Error("قارئ PDF غير متوفر.");
      }
    }

    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";
    }

    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer())
    }).promise;

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || "").join(" ").trim();
      pages.push(`### الصفحة ${i}\n${text}`);
    }
    return pages.join("\n\n");
  }

  throw new Error("صيغة الملف غير مدعومة. استخدم PDF أو Word أو TXT أو ملفات الأكواد.");
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}


/* =========================================================
   13. MESSAGE SENDING & SMART ROUTING
   ========================================================= */
/*
 * Translate HTTP errors into clear Arabic guidance
 * instead of showing a bare status code like "403".
 */
/*
 * Track the MiniMax billing state so the model selector can warn
 * the user that requests will be served by Groq automatically.
 */
function setMiniMaxBillingBlocked(blocked) {
  const next = Boolean(blocked);
  if (state.minimaxBillingBlocked === next) return;
  state.minimaxBillingBlocked = next;
  try {
    if (next) localStorage.setItem("tmd_minimax_billing", "1");
    else localStorage.removeItem("tmd_minimax_billing");
  } catch (err) {
    console.warn("Failed to persist MiniMax billing state:", err);
  }
  updateModelUI();
}

function describeHttpError(status) {
  const usingMiniMax = state.model === MODELS.minimax;
  const provider = usingMiniMax ? "MiniMax" : "Groq";
  const keyName = usingMiniMax ? "MINIMAX_API_KEY" : "GROQ_API_KEY";

  switch (status) {
    case 401:
      return `خدمة ${provider} ترفض المفتاح (401). حدّث ${keyName} في إعدادات Vercel ثم أعد النشر.`;
    case 402:
      return `رصيد حساب MiniMax غير كافٍ (402 / insufficient balance). اشحن الرصيد من platform.minimax.io أو اختر أحد نماذج Groq من قائمة النماذج.`;
    case 403:
      return `تم رفض الوصول (403). مفتاح ${provider} لا يملك صلاحية النموذج المطلوب — تحقق من صلاحيات النموذج أو حدّث المفتاح في Vercel ثم أعد النشر.`;
    case 404:
      return `النموذج المطلوب غير موجود في خدمة ${provider} (404). اختر نموذجًا آخر من الإعدادات أو راجع إعدادات النموذج.`;
    case 413:
      return "حجم الرسالة أو المرفق كبير جدًا (413). جرّب مرفقًا أصغر.";
    case 429:
      return "تم تجاوز حدود الاستخدام مؤقتًا (429). انتظر دقيقة ثم أعد المحاولة.";
    case 500:
    case 502:
    case 503:
    case 504:
      return `الخادم واجه مشكلة مؤقتة (${status}). أعد المحاولة بعد لحظات.`;
    default:
      return `خطأ من الخادم: ${status}`;
  }
}

async function sendMessage() {
  if (state.busy) {
    stopRequest();
    return;
  }

  const text = input?.value?.trim() || "";
  if (!text && !state.selectedImage && !state.selectedDocument) {
    return;
  }

  state.busy = true;
  state.controller = new AbortController();
  setSendingState(true);

  // Build User Message
  const userMessage = {
    role: "user",
    content: text
  };

  if (state.selectedImage) {
    userMessage.image = state.selectedImage.dataURL;
    userMessage.imageName = state.selectedImage.name;
  }

  if (state.selectedDocument) {
    userMessage.fileName = state.selectedDocument.name;
    userMessage.fileText = state.selectedDocument.text;
  }

  state.messages.push(userMessage);
  saveMessages();
  renderMessages();

  if (input) {
    input.value = "";
    input.style.height = "auto";
  }

  const attachedImage = state.selectedImage;
  const attachedDoc = state.selectedDocument;
  resetAttachment();

  const loadingId = addLoadingMessage();

  try {
    // 1. SMART IDENTITY CHECK: If user asks about creator/developer/designer/formation
    if (!attachedImage && !attachedDoc && isCreatorOrIdentityQuestion(text)) {
      // Add slight natural delay for realistic high-end AI feel
      await new Promise(r => setTimeout(r, 450));
      removeLoadingMessage(loadingId);

      const dynamicReply = getDynamicCreatorResponse();
      state.messages.push({
        role: "assistant",
        content: dynamicReply
      });

      saveMessages();
      renderMessages();
      saveConversation();
      return;
    }

    // 2. Normal Request to Backend
    const apiMessages = buildApiMessages();
    const hasImage = Boolean(attachedImage);
    const selectedModel = VALID_MODELS.has(state.model) ? state.model : MODELS.smart;
    const model = hasImage && selectedModel !== MODELS.minimax
      ? MODELS.vision
      : selectedModel;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: apiMessages
      }),
      signal: state.controller.signal
    });

    const data = await response.json().catch(() => ({}));
    removeLoadingMessage(loadingId);

    if (!response.ok) {
      const httpError = new Error(
        data?.error ||
        describeHttpError(response.status)
      );
      // The backend may attach a billing/provider notice to the error.
      if (data?.notice && typeof data.notice.text === "string") {
        httpError.notice = data.notice.text;
      }
      if (data?.code === "MINIMAX_INSUFFICIENT_BALANCE") {
        setMiniMaxBillingBlocked(true);
      }
      throw httpError;
    }

    if (!data?.ok) {
      throw new Error(data?.error || "لم يتم الحصول على رد.");
    }

    let reply = typeof data.reply === "string" ? data.reply : "";
    reply = cleanAssistantReply(reply);

    if (!reply) {
      throw new Error("لم يرجع النموذج إجابة نصية.");
    }

    /*
     * The backend may report that MiniMax has no balance left and
     * that the request was served by Groq instead.
     */
    const notice = data?.notice && typeof data.notice.text === "string"
      ? { type: data.notice.type || "info", text: data.notice.text }
      : null;

    state.messages.push({
      role: "assistant",
      content: reply,
      model: typeof data.model === "string" ? data.model : model,
      provider: data.provider === "minimax" ? "minimax" : "groq",
      usage: data.usage && typeof data.usage === "object" ? data.usage : undefined,
      notice: notice || undefined
    });

    if (notice) {
      showToast(notice.text);
    }

    // Remember whether MiniMax has run out of balance.
    if (data.provider === "minimax") {
      setMiniMaxBillingBlocked(false);
    } else if (notice?.type === "billing") {
      setMiniMaxBillingBlocked(true);
    }

    saveMessages();
    renderMessages();
    saveConversation();
  } catch (error) {
    removeLoadingMessage(loadingId);
    console.error("T.M.D_AI_Pro Message Error:", error);

    if (error?.name === "AbortError") {
      showToast("تم إيقاف المعالجة.");
    } else {
      showToast(error?.message || "حدث خطأ أثناء الاتصال.");
      addErrorMessage(
        error?.message || "تعذر إكمال الرد، يرجى المحاولة مجددًا.",
        error?.notice
      );
    }
  } finally {
    state.busy = false;
    state.controller = null;
    setSendingState(false);
  }
}

function buildApiMessages() {
  const historyMessages = Array.isArray(state.messages) ? state.messages.slice(-16) : [];

  const lastImageIndex = historyMessages.reduce((idx, msg, i) => msg?.image ? i : idx, -1);
  const lastFileIndex = historyMessages.reduce((idx, msg, i) => msg?.fileText ? i : idx, -1);

  if (lastImageIndex !== -1) {
    const msg = historyMessages[lastImageIndex];
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: msg.content?.trim() || "حلل هذه الصورة وقدم النتيجة النهائية فقط."
          },
          {
            type: "image_url",
            image_url: { url: msg.image }
          }
        ]
      }
    ];
  }

  if (lastFileIndex !== -1) {
    const context = [];
    for (let i = Math.max(0, lastFileIndex - 2); i < lastFileIndex; i++) {
      const msg = historyMessages[i];
      if (msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
        context.push({ role: msg.role, content: msg.content.slice(-1200) });
      }
    }

    const fileMsg = historyMessages[lastFileIndex];
    context.push({
      role: "user",
      content:
        `${fileMsg.content || "حلل الملف المرفق."}\n\n` +
        `اسم الملف: ${fileMsg.fileName || "file"}\n\n` +
        `محتوى الملف:\n--- BEGIN FILE ---\n` +
        `${truncateText(fileMsg.fileText || "", 12000)}\n` +
        `--- END FILE ---`
    });
    return context;
  }

  return historyMessages
    .filter(msg => msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string" && msg.content.trim())
    .map(msg => ({
      role: msg.role,
      content: msg.content.slice(-2500)
    }));
}

function cleanAssistantReply(text) {
  if (typeof text !== "string") return "";
  let res = text;
  res = res.replace(/<think>[\s\S]*?<\/think>/gi, "");
  res = res.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  res = res.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  res = res.replace(/<think>[\s\S]*$/gi, "");
  res = res.replace(/<\/?(?:think|analysis|thinking)>/gi, "");
  res = res.replace(/^\s*(reasoning|analysis|thoughts?)\s*:\s*/i, "");
  res = res.replace(/\n{3,}/g, "\n\n");
  return res.trim();
}


/* =========================================================
   14. MESSAGE RENDERING & MARKDOWN
   ========================================================= */
function renderMessages() {
  if (!chat) return;
  chat.innerHTML = "";

  if (!state.messages.length) {
    if (welcome) {
      welcome.style.display = "";
      chat.appendChild(welcome);
    }
    return;
  }

  if (welcome) welcome.style.display = "none";
  state.messages.forEach(renderMessage);
  scrollToBottom();
}

function renderMessage(message, index) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  if (message.role === "user") {
    avatar.textContent = "أنت";
  } else {
    avatar.innerHTML = `<span style="font-size:0.8rem; font-weight:900;">TMD</span>`;
  }

  const content = document.createElement("div");
  content.className = "message-content";

  // Provider notice (billing / fallback)
  if (message.notice && typeof message.notice.text === "string") {
    const notice = document.createElement("div");
    notice.className = "message-notice";
    notice.textContent = `ℹ️ ${message.notice.text}`;
    content.appendChild(notice);
  }

  // Attached Image
  if (message.image) {
    const img = document.createElement("img");
    img.src = message.image;
    img.alt = message.imageName || "صورة";
    img.className = "message-image";
    content.appendChild(img);
  }

  // Attached File
  if (message.fileName) {
    const fileBox = document.createElement("div");
    fileBox.className = "message-file";
    fileBox.textContent = `📎 ${message.fileName}`;
    content.appendChild(fileBox);
  }

  // Text Content
  if (message.content) {
    const text = document.createElement("div");
    text.className = "message-text";
    text.innerHTML = renderMarkdown(message.content);
    content.appendChild(text);

    // Show the actual provider/model and token usage returned by the API.
    if (message.role === "assistant" && message.model) {
      const meta = document.createElement("div");
      meta.className = "message-meta";

      const modelLabels = {
        [MODELS.smart]: "GPT OSS 120B",
        [MODELS.fast]: "GPT OSS 20B",
        [MODELS.vision]: "Qwen Vision 27B",
        [MODELS.minimax]: "MiniMax M3"
      };

      const parts = [modelLabels[message.model] || message.model];
      const totalTokens = Number(message.usage?.total_tokens);
      if (Number.isFinite(totalTokens) && totalTokens >= 0) {
        parts.push(`الاستخدام: ${totalTokens.toLocaleString("ar-EG")} توكن`);
      }

      meta.textContent = parts.join(" • ");
      content.appendChild(meta);
    }

    // Message Actions Toolbar (Copy & TTS)
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-action-btn";
    copyBtn.innerHTML = `<span>📋</span> <span>نسخ</span>`;
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(message.content);
      showToast("تم نسخ نص الرسالة إلى الحافظة!");
    });
    actions.appendChild(copyBtn);

    if ("speechSynthesis" in window) {
      const speakBtn = document.createElement("button");
      speakBtn.className = "msg-action-btn";
      speakBtn.innerHTML = `<span>🔊</span> <span>استماع</span>`;
      speakBtn.addEventListener("click", () => speakText(message.content));
      actions.appendChild(speakBtn);
    }

    content.appendChild(actions);
  }

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  chat.appendChild(wrapper);
}

function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[*#_~`]/g, "").slice(0, 500);
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "ar-SA";
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
  showToast("جاري القراءة الصوتية...");
}

function renderMarkdown(text) {
  let html = escapeHTML(text);

  // Multi-line code blocks
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const displayLang = lang || "code";
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span>${displayLang}</span>
          <button class="copy-code-btn" type="button" onclick="copyCodeFromBlock(this)">📋 نسخ الكود</button>
        </div>
        <pre><code class="language-${displayLang}">${code.trim()}</code></pre>
      </div>
    `;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Unordered list
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/gim, "");

  // Line breaks to paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    const trimmed = p.trim();
    if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<div")) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("");

  return html;
}

window.copyCodeFromBlock = function(btn) {
  const pre = btn.closest(".code-block-wrapper")?.querySelector("pre code");
  if (pre) {
    navigator.clipboard.writeText(pre.innerText || pre.textContent);
    btn.textContent = "✓ تم النسخ!";
    setTimeout(() => { btn.textContent = "📋 نسخ الكود"; }, 2000);
    showToast("تم نسخ الكود البرمجي!");
  }
};

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   15. LOADING & ERROR STATES
   ========================================================= */
let loadingCounter = 0;

function addLoadingMessage() {
  const id = ++loadingCounter;
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant loading-message";
  wrapper.dataset.loadingId = String(id);
  wrapper.innerHTML = `
    <div class="message-avatar">TMD</div>
    <div class="message-content">
      <div class="message-text">
        <span>جاري المعالجة والتفكير</span>
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  chat?.appendChild(wrapper);
  scrollToBottom();
  return id;
}

function removeLoadingMessage(id) {
  chat?.querySelector(`[data-loading-id="${id}"]`)?.remove();
}

function addErrorMessage(message, notice) {
  if (!chat) return;
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";
  wrapper.innerHTML = `
    <div class="message-avatar">!</div>
    <div class="message-content">
      ${notice ? `<div class="message-notice">ℹ️ ${escapeHTML(notice)}</div>` : ""}
      <div class="message-text error-text">
        ⚠️ ${escapeHTML(message)}
      </div>
    </div>
  `;
  chat.appendChild(wrapper);
  scrollToBottom();
}

function setSendingState(sending) {
  if (!sendButton) return;
  if (sending) {
    sendButton.classList.add("stop");
    sendButton.innerHTML = `<span style="font-size:1.1rem;">■</span>`;
    sendButton.setAttribute("aria-label", "إيقاف");
  } else {
    sendButton.classList.remove("stop");
    sendButton.innerHTML = `<svg class="send-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    sendButton.setAttribute("aria-label", "إرسال");
  }
}

function stopRequest() {
  if (state.controller) state.controller.abort();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    if (chat) chat.scrollTop = chat.scrollHeight;
  });
}


/* =========================================================
   16. LOCAL STORAGE & HISTORY MANAGEMENT
   ========================================================= */
function saveMessages() {
  try {
    state.messages = state.messages.slice(-50);
    localStorage.setItem("tmd_messages", JSON.stringify(state.messages));
  } catch (error) {
    console.warn("Storage quota fallback:", error);
    const lightweight = state.messages.map(m => ({
      role: m.role,
      content: m.content,
      fileName: m.fileName
    }));
    try {
      localStorage.setItem("tmd_messages", JSON.stringify(lightweight.slice(-25)));
    } catch {}
  }
}

function saveConversation() {
  try {
    const firstUser = state.messages.find(m => m.role === "user");
    if (!firstUser) return;
    const title = String(firstUser.content || "محادثة جديدة").slice(0, 50);

    const existing = state.conversations[state.conversations.length - 1];
    if (existing && existing.active) {
      existing.messages = state.messages.slice(-50);
      existing.title = title;
    } else {
      state.conversations.push({
        id: Date.now(),
        title,
        messages: state.messages.slice(-50),
        active: true
      });
    }

    state.conversations = state.conversations.slice(-30);
    state.conversations.forEach((c, idx) => {
      c.active = (idx === state.conversations.length - 1);
    });

    localStorage.setItem("tmd_conversations", JSON.stringify(state.conversations));
    renderHistory();
  } catch (e) {
    console.warn("Could not save conversation:", e);
  }
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = "";

  if (!state.conversations.length) {
    historyList.innerHTML = `<div class="empty-history">لا توجد محادثات سابقة</div>`;
    return;
  }

  const list = [...state.conversations].reverse();
  list.forEach(conv => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `history-item ${conv.active ? "active" : ""}`;
    item.innerHTML = `<span>💬</span> <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHTML(conv.title || "محادثة جديدة")}</span>`;
    item.addEventListener("click", () => loadConversation(conv));
    historyList.appendChild(item);
  });
}

function loadConversation(conv) {
  if (!conv) return;
  state.messages = Array.isArray(conv.messages) ? [...conv.messages] : [];
  resetAttachment();
  renderMessages();
  sidebar?.classList.remove("open");
  sidebarBackdrop?.classList.remove("show");
  saveMessages();
}

function createNewChat() {
  if (state.messages.length) {
    const firstUser = state.messages.find(m => m.role === "user");
    if (firstUser) {
      state.conversations.forEach(c => { c.active = false; });
      state.conversations.push({
        id: Date.now(),
        title: String(firstUser.content || "محادثة جديدة").slice(0, 50),
        messages: state.messages.slice(-50),
        active: false
      });
      state.conversations = state.conversations.slice(-30);
    }
  }

  state.messages = [];
  resetAttachment();
  renderMessages();
  saveMessages();
  localStorage.setItem("tmd_conversations", JSON.stringify(state.conversations));
  renderHistory();
  sidebar?.classList.remove("open");
  sidebarBackdrop?.classList.remove("show");
  input?.focus();
  showToast("تم بدء محادثة جديدة");
}

function clearCurrentChat() {
  if (!state.messages.length) {
    showToast("المحادثة فارغة بالفعل.");
    return;
  }
  state.messages = [];
  resetAttachment();
  renderMessages();
  saveMessages();
  showToast("تم مسح المحادثة الحالية.");
}

function clearAllConversations() {
  if (!state.conversations.length && !state.messages.length) {
    showToast("لا يوجد سجل للمسح.");
    return;
  }
  state.messages = [];
  state.conversations = [];
  localStorage.removeItem("tmd_messages");
  localStorage.removeItem("tmd_conversations");
  resetAttachment();
  renderMessages();
  renderHistory();
  showToast("تم مسح كافة المحادثات والسجل بالكامل.");
}

function exportCurrentChat() {
  if (!state.messages.length) {
    showToast("لا توجد رسائل لتصديرها.");
    return;
  }

  let text = `# سجل محادثة T.M.D_AI_Pro\n`;
  text += `تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}\n`;
  text += `تطوير وتصميم: ياسين عمرو عبد الرحيم\n`;
  text += `---------------------------------------------------\n\n`;

  state.messages.forEach(m => {
    const role = m.role === "user" ? "👤 المستخدم" : "🤖 T.M.D_AI_Pro";
    text += `${role}:\n${m.content || ""}\n\n`;
  });

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tmd-ai-chat-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("تم تصدير المحادثة كملف نصي بنجاح!");
}


/* =========================================================
   17. MODALS & UTILITIES
   ========================================================= */
function openSettings() {
  modalBackdrop?.classList.remove("hidden");
}

function closeSettings() {
  modalBackdrop?.classList.add("hidden");
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function truncateText(text, limit) {
  if (typeof text !== "string") return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n\n[تم اختصار باقي المحتوى بسبب الحجم]";
}


/* =========================================================
   18. GLOBAL DEBUG OBJECT
   ========================================================= */
window.TMDAI = {
  state,
  sendMessage,
  resetAttachment,
  createNewChat,
  stopRequest,
  togglePlusMenu,
  closePlusMenu,
  showToast
};

console.log("T.M.D_AI_Pro loaded — Engineered & Designed by Yassin Amr Abdelrahim (ياسين عمرو عبد الرحيم)");
