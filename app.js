"use strict";

/* ===========================================================================
   SPARTA AI — Complete Application Script
   Architect, Developer & Designer: ياسين عمرو عبد الرحيم (Yassin Amr Abdelrahim)
   =========================================================================== */

/* =========================================================
   1. GLOBAL STATE + SAFE LOCAL STORAGE
   ========================================================= */
const STORAGE_KEYS = {
  messages: "tmd_messages",
  conversations: "tmd_conversations",
  theme: "tmd_theme",
  model: "tmd_model",
  minimaxBilling: "tmd_minimax_billing",
  floatingBubble: "tmd_float_enabled",
  aiMode: "tmd_ai_mode"
};

function safeGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("LocalStorage read failed:", key, error);
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("LocalStorage write failed:", key, error);
    return false;
  }
}

function safeRemoveItem(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("LocalStorage remove failed:", key, error);
  }
}


const AI_MODES = {
  competition: {
    title: "وضع المنافسة",
    label: "منافسة",
    icon: "⚔",
    placeholder: "اكتب موضوع البحث لتتنافس أداتان ذكيتان على أفضل نتيجة...",
    description: "يشغّل مسارين مستقلين للموضوع نفسه، ثم يعرض نتيجتين واضحتين لتختار النتيجة المرضية.",
    steps: ["محرك أول", "محرك ثانٍ", "اختيار النتيجة"],
    directive: "أنت في وضع المنافسة. عالج طلب المستخدم عبر نتيجتين مستقلتين بأسلوبين مختلفين، ثم اختم بملخص يساعد المستخدم على اختيار النتيجة الأنسب. لا تخلط النتيجتين، واجعل كل نتيجة كاملة ومنظمة.",
    engineA: "أنت المحرك الأول في وضع المنافسة داخل SPARTA AI. قدّم نتيجة دقيقة ومنظمة ومحافظة على الموثوقية، مع نقاط واضحة وخلاصة عملية.",
    engineB: "أنت المحرك الثاني في وضع المنافسة داخل SPARTA AI. قدّم نتيجة مستقلة من زاوية مختلفة وأكثر إبداعًا، مع ترتيب واضح وخلاصة قابلة للتنفيذ."
  },
  comparison: {
    title: "وضع المقارنة",
    label: "مقارنة",
    icon: "⚖",
    placeholder: "اكتب الشيئين المحتار بينهما لأقارن وأرشّح الأفضل...",
    description: "يقارن بين خيارين أو أكثر بمعايير استخدام حقيقية، ثم يرشّح الحل الأمثل بوضوح.",
    steps: ["معايير", "جدول مقارنة", "ترشيح نهائي"],
    directive: "أنت في وضع المقارنة. استخرج الخيارات التي يريد المستخدم المقارنة بينها، وحدد معايير عادلة، ثم قدّم جدول مقارنة مختصرًا، واذكر الخيار الأفضل حسب الاستخدام العملي مع سبب واضح. إذا كانت الخيارات غير واضحة فاطلب توضيحًا قصيرًا أولًا."
  },
  "deep-search": {
    title: "وضع البحث العميق",
    label: "بحث عميق",
    icon: "⌕",
    placeholder: "اكتب موضوع البحث العميق وسأرتبه بمصادر ومحاور موثوقة...",
    description: "ينظم بحثًا موسعًا: محاور، مصادر موثوقة، ترتيب النتائج، خلاصة، ونقاط تحقق.",
    steps: ["محاور البحث", "مصادر موثوقة", "ملخص مرتب"],
    directive: "أنت في وضع البحث العميق. قدّم بحثًا مرتبًا وشاملًا حول طلب المستخدم: عرّف السؤال، قسّم المحاور، اذكر مصادر موثوقة ومعتمدة أو أنواع المصادر المناسبة، رتّب النتائج حسب الأهمية، واختم بخلاصة وتوصيات. لا تخترع روابط أو مراجع غير مؤكدة؛ إذا احتاج الموضوع معلومات لحظية غير متاحة من السياق فوضّح ذلك واطلب روابط أو ملفات داعمة."
  }
};

function isValidAiMode(mode) {
  return Object.prototype.hasOwnProperty.call(AI_MODES, mode);
}

function normalizeAiMode(mode) {
  return isValidAiMode(mode) ? mode : "";
}

function safeReadJSON(key, fallback) {
  const raw = safeGetItem(key);
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Invalid JSON in LocalStorage; resetting key:", key, error);
    safeRemoveItem(key);
    return fallback;
  }
}

function safeRole(role) {
  return role === "assistant" || role === "user" || role === "error" ? role : "assistant";
}

function sanitizeMessageForStorage(message) {
  if (!message || typeof message !== "object") return null;
  const role = safeRole(message.role);
  const content = typeof message.content === "string" ? message.content.slice(0, 20000) : "";
  if (!content && !message.fileName && !message.imageName) return null;

  const clean = {
    role,
    content
  };

  if (typeof message.mode === "string" && isValidAiMode(message.mode)) clean.mode = message.mode;
  if (typeof message.fileName === "string") clean.fileName = message.fileName.slice(0, 180);
  if (typeof message.imageName === "string") clean.imageName = message.imageName.slice(0, 180);
  if (typeof message.model === "string") clean.model = message.model.slice(0, 80);
  if (message.provider === "groq" || message.provider === "minimax") clean.provider = message.provider;
  if (message.notice && typeof message.notice.text === "string") {
    clean.notice = {
      type: typeof message.notice.type === "string" ? message.notice.type.slice(0, 40) : "info",
      text: message.notice.text.slice(0, 800)
    };
  }
  if (message.usage && typeof message.usage === "object") {
    clean.usage = {};
    ["prompt_tokens", "completion_tokens", "total_tokens", "cached_tokens"].forEach((key) => {
      const value = Number(message.usage[key]);
      if (Number.isFinite(value) && value >= 0) clean.usage[key] = value;
    });
    if (!Object.keys(clean.usage).length) delete clean.usage;
  }

  // لا نحفظ بيانات الصور أو نصوص الملفات الطويلة في LocalStorage حفاظًا على الخصوصية والأداء.
  return clean;
}

function sanitizeMessagesForStorage(messages, limit = 50) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map(sanitizeMessageForStorage)
    .filter(Boolean)
    .slice(-limit);
}

function sanitizeConversationsForStorage(conversations) {
  if (!Array.isArray(conversations)) return [];
  return conversations
    .map((conversation) => {
      if (!conversation || typeof conversation !== "object") return null;
      const messages = sanitizeMessagesForStorage(conversation.messages, 50);
      const title = typeof conversation.title === "string" && conversation.title.trim()
        ? conversation.title.trim().slice(0, 80)
        : "محادثة جديدة";
      return {
        id: Number.isFinite(Number(conversation.id)) ? Number(conversation.id) : Date.now(),
        title,
        messages,
        active: Boolean(conversation.active)
      };
    })
    .filter(Boolean)
    .slice(-30);
}

const state = {
  messages: sanitizeMessagesForStorage(safeReadJSON(STORAGE_KEYS.messages, []), 50),
  conversations: sanitizeConversationsForStorage(safeReadJSON(STORAGE_KEYS.conversations, [])),
  theme: safeGetItem(STORAGE_KEYS.theme) === "light" ? "light" : "dark",
  model: safeGetItem(STORAGE_KEYS.model) || "openai/gpt-oss-120b",
  aiMode: normalizeAiMode(safeGetItem(STORAGE_KEYS.aiMode)),
  floatingBubbleEnabled: safeGetItem(STORAGE_KEYS.floatingBubble) !== "0",
  busy: false,
  controller: null,
  abortReason: "",
  selectedImage: null,
  selectedDocument: null,
  imageMode: "analyze",
  lastCreatorResponseIndex: -1,
  // Set to true after MiniMax reports an empty balance (code 1008),
  // so the UI can warn the user before the next attempt.
  minimaxBillingBlocked: safeGetItem(STORAGE_KEYS.minimaxBilling) === "1"
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

const REQUEST_TIMEOUT_MS = 45000;

/* اشتراك SPARTA Pro هو المصدر الوحيد للوصول إلى MiniMax ومهمة اليوم.
   المفتاح متوافق مع الفقاعة العائمة حتى تتطابق الحالة في الواجهتين. */
const SPARTA_PLAN_KEY = "tmd_float_plan";
const SPARTA_DAILY_MISSION_KEY = "sparta_pro_daily_mission";
const SPARTA_DAILY_MISSIONS = [
  {
    title: "حلّل قرارًا واحدًا بوضوح",
    description: "حوّل قرارًا مهنيًا أو شخصيًا إلى خيارات، معايير، وخطوة تالية عملية خلال خمس دقائق.",
    prompt: "هذه مهمة SPARTA اليومية: ساعدني في تحليل قرار واحد. اسألني أولًا عن القرار، ثم رتّب الخيارات والمعايير، واقترح خطوة تالية عملية ومختصرة."
  },
  {
    title: "حوّل فكرة إلى خطة تنفيذ",
    description: "قسّم فكرة واحدة إلى أول ثلاث خطوات قابلة للإنجاز اليوم، مع ترتيب الأولويات.",
    prompt: "هذه مهمة SPARTA اليومية: حوّل فكرتي إلى خطة تنفيذ قصيرة. اسألني عن الفكرة، ثم أعطني أول ثلاث خطوات واقعية بترتيب الأولوية."
  },
  {
    title: "ابنِ ملخصًا يحسم الأولويات",
    description: "اجمع المعلومات المتفرقة في ملخص واضح يبين ما يجب فعله الآن وما يمكن تأجيله.",
    prompt: "هذه مهمة SPARTA اليومية: ساعدني على ترتيب أولوياتي. اسألني عن مهامي، ثم أنشئ ملخصًا قصيرًا يحدد ما أنجزه الآن وما أؤجله ولماذا."
  }
];

function spartaTodayKey() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function hasSpartaPro() {
  return safeReadJSON(SPARTA_PLAN_KEY, "free") === "minimax";
}

function getSpartaDailyMission() {
  const day = spartaTodayKey();
  const seed = Number(day.replace(/-/g, ""));
  const index = Number.isFinite(seed) ? seed % SPARTA_DAILY_MISSIONS.length : 0;
  return { ...SPARTA_DAILY_MISSIONS[index], day, index };
}

function readSpartaDailyMissionState() {
  const stored = safeReadJSON(SPARTA_DAILY_MISSION_KEY, null);
  const mission = getSpartaDailyMission();
  return stored && stored.day === mission.day ? stored : { day: mission.day, completed: false };
}

function completeSpartaDailyMission() {
  const mission = getSpartaDailyMission();
  safeSetItem(SPARTA_DAILY_MISSION_KEY, JSON.stringify({
    day: mission.day,
    mission: mission.index,
    completed: true,
    completedAt: Date.now()
  }));
  updateSpartaDailyMissionUI();
}

function updateSpartaDailyMissionUI() {
  const card = document.getElementById("dailyMission");
  const title = document.getElementById("dailyMissionTitle");
  const description = document.getElementById("dailyMissionDescription");
  const meta = document.getElementById("dailyMissionMeta");
  const lock = document.getElementById("dailyMissionLock");
  const button = document.getElementById("dailyMissionButton");
  if (!card || !title || !description || !meta || !lock || !button) return;

  const mission = getSpartaDailyMission();
  const progress = readSpartaDailyMissionState();
  const pro = hasSpartaPro();
  const completed = pro && progress.completed === true;

  title.textContent = mission.title;
  description.textContent = mission.description;
  card.classList.toggle("is-locked", !pro);
  card.classList.toggle("is-complete", completed);

  if (!pro) {
    lock.textContent = "PRO";
    meta.textContent = "متاحة باشتراك SPARTA Pro المدفوع فقط · لا تشمل الخطط أرصدة يومية تلقائية";
    button.textContent = "تتطلب Pro";
    button.setAttribute("aria-label", "مهمة اليوم متاحة في اشتراك SPARTA Pro المدفوع فقط");
    return;
  }

  if (completed) {
    lock.textContent = "تم";
    meta.textContent = "أُنجزت مهمة اليوم · يعود تحدٍّ جديد عند بدء اليوم التالي";
    button.textContent = "أُنجزت اليوم";
    button.setAttribute("aria-label", "مهمة اليوم مكتملة");
  } else {
    lock.textContent = "PRO";
    meta.textContent = "تحدٍّ واحد كل يوم لنسخة SPARTA Pro · المهمة لا تمنح رصيدًا أو نقاطًا";
    button.textContent = "ابدأ المهمة";
    button.setAttribute("aria-label", "ابدأ مهمة SPARTA Pro اليومية");
  }
}

/* أيقونات SVG خطية موحّدة مستوحاة من Lucide. */
const UI_ICONS = {
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-24 12 12)"><ellipse cx="12" cy="12" rx="9" ry="3.8"/><circle cx="4.9" cy="14.4" r="1.3" fill="currentColor" stroke="none"/></g><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.7 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  send: '<svg class="send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>'
};

function botSparkHTML() {
  return UI_ICONS.sparkles.replace("<svg ", '<svg class="bot-spark-logo" ');
}

if (!VALID_MODELS.has(state.model)) {
  state.model = MODELS.smart;
  safeSetItem(STORAGE_KEYS.model, state.model);
}


/* =========================================================
   2. CREATOR & IDENTITY RESPONSES LIBRARY (ياسين عمرو عبد الرحيم)
   ========================================================= */
const CREATOR_RESPONSES = [
  `أنا **SPARTA AI**، مساعد ذكاء اصطناعي فائق التطور. تم تصميمي وتطويري وبرمجتي بالكامل بواسطة المطور والمصمم المبدع **ياسين عمرو عبد الرحيم**، الذي هندس واجهتي وخوارزمياتي لتقديم تجربة ذكية وسريعة واحترافية.`,

  `الفضل في وجودي وابتكاري يعود للمطور والمهندس **ياسين عمرو عبد الرحيم**؛ هو العقل المدبر الذي قام بتصميم كل جزء في هذا النظام وبرمجته بأحدث تقنيات الذكاء الاصطناعي لتلبية كافة احتياجاتك.`,

  `صممني وطوّرني المطور البارع **ياسين عمرو عبد الرحيم**. قام ببرمجة نظامي وهندسة الواجهة النجمية التفاعلية ونظام المحادثة الذكي ليضمن لك تجربة استثنائية وسلسة.`,

  `أنا ثمرة رؤية وإبداع المطور **ياسين عمرو عبد الرحيم**، الذي جمع بين التصميم العصري الفاخر والذكاء الاصطناعي فائق السرعة لصنع منصة **SPARTA AI**.`,

  `المطور والمصمم الحصري لمنصة **SPARTA AI** هو **ياسين عمرو عبد الرحيم**. هو من وضع هيكلية النظام، وصمم الواجهات، وبرمج خوارزميات الاستجابة وتحليل المستندات والصور.`,

  `قام بهندستي وبنائي المطور الذكي **ياسين عمرو عبد الرحيم**، بهدف تقديم رفيق ذكاء اصطناعي فائق الدقة والقوة في معالجة النصوص، الملفات، والصور.`,

  `أنا نظام ذكاء اصطناعي ابتكره وصممه المطور **ياسين عمرو عبد الرحيم**؛ كل تفصيلة بصرية وبرمجية تراها هنا هي نتاج شغفه وإبداعه في عالم البرمجة والذكاء الاصطناعي.`,

  `تكويني التقني وتصميمي البصري وراءهما المطور المتميز **ياسين عمرو عبد الرحيم**، الذي طوّر هذه الأداة لتكون مساعدك الاحترافي الأول وسريع الاستجابة.`,

  `صانعي ومطوري هو المبدع **ياسين عمرو عبد الرحيم**، رائد هذا المشروع ومصممه، وقد صاغ خوارزمياتي بعناية فائقة لأكون في خدمتك دائماً بأعلى جودة.`,

  `تمت برمجتي وصياغة بنيتي التحتية بواسطة المهندس والمطور **ياسين عمرو عبد الرحيم**، حيث حرص على جعلي مساعداً فائق الأداء والذكاء بواجهة متجاوبة بالكامل.`,

  `أنا **SPARTA AI**، ومطوري ومصممي هو **ياسين عمرو عبد الرحيم**. إذا كان لديك أي استفسار أو مهمة، فأنا مجهز بالكامل لمساعدتك بفضل التطوير المتقن الذي وضعه فيّ.`
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
   3. DEEP-SPACE STARFIELD ENGINE (خلفية الفضاء العميق)
   Layered parallax stars, warm nebula glow, twinkle,
   and occasional shooting stars — rebuilt for the
   Spartan crimson & gold identity.
   ========================================================= */
class StarfieldEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    this.layers = [];
    this.meteors = [];
    this.nebulae = [];
    this.mythicSigils = [];
    this.running = false;
    this.densityMultiplier = 2; // 1: calm, 2: balanced, 3: dense
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    // Pointer parallax (normalized -0.5..0.5, eased every frame).
    this.pointerTarget = { x: 0, y: 0 };
    this.pointerEased = { x: 0, y: 0 };

    this.nebulaCanvas = document.createElement("canvas");
    this.nebulaCtx = this.nebulaCanvas.getContext("2d");

    this.reducedMotion = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.nextMeteorTime = Date.now() + 7000;
    this.frameHandle = null;

    this.init();
  }

  init() {
    this.resize();
    this.createScene();
    this.bindEvents();
    this.start();
  }

  setDensity(level) {
    const next = Math.max(1, Math.min(3, level));
    if (next === this.densityMultiplier && this.layers.length) return;
    this.densityMultiplier = next;
    this.createScene();
    if (!this.running) this.renderFrame(Date.now());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // setTransform (instead of scale) keeps repeated resizes from compounding.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paintNebulaLayer();
  }

  /* ---------- Scene construction ---------- */

  createScene() {
    this.createNebulae();
    this.createStars();
    this.createMythicSigils();
    this.paintNebulaLayer();
  }

  createNebulae() {
    const base = Math.max(this.width, this.height);
    // Warm, very low intensity glows: ember crimson, aged gold, deep wine.
    this.nebulae = [
      { fx: 0.16, fy: 0.24, radius: base * 0.52, color: "rgba(224, 85, 78, 0.085)", driftA: 0.00021, driftR: 0.05 },
      { fx: 0.82, fy: 0.7, radius: base * 0.46, color: "rgba(217, 164, 91, 0.06)", driftA: 0.00016, driftR: 0.045 },
      { fx: 0.62, fy: 0.12, radius: base * 0.34, color: "rgba(150, 60, 82, 0.07)", driftA: 0.00027, driftR: 0.035 }
    ];
  }

  paintNebulaLayer() {
    if (!this.nebulaCtx || !this.width || !this.height) return;
    this.nebulaCanvas.width = Math.max(1, Math.round(this.width / 2));
    this.nebulaCanvas.height = Math.max(1, Math.round(this.height / 2));
    const nctx = this.nebulaCtx;
    const w = this.nebulaCanvas.width;
    const h = this.nebulaCanvas.height;

    nctx.clearRect(0, 0, w, h);
    for (const blob of this.nebulae) {
      const cx = blob.fx * w;
      const cy = blob.fy * h;
      const r = blob.radius / 2;
      const gradient = nctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(0.55, blob.color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.45).toFixed(3) + ")"));
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      nctx.fillStyle = gradient;
      nctx.fillRect(0, 0, w, h);
    }
  }

  createStars() {
    const area = this.width * this.height;
    const base = Math.floor(area / 4200);
    const total = Math.min(220, Math.max(50, Math.floor(base * (this.densityMultiplier * 0.4))));

    // Warm constellation palette matching the crimson & gold identity.
    const palette = [
      { color: "246, 241, 236", weight: 0.44 }, // warm white
      { color: "242, 212, 155", weight: 0.26 }, // champagne
      { color: "232, 178, 92", weight: 0.16 },  // gold
      { color: "236, 122, 104", weight: 0.14 }  // ember
    ];

    const pickColor = () => {
      let roll = Math.random();
      for (const entry of palette) {
        if (roll < entry.weight) return entry.color;
        roll -= entry.weight;
      }
      return palette[0].color;
    };

    // Three depth layers: far dust, mid field, near sparks.
    const layerSpecs = [
      { share: 0.52, depth: 0.22, size: [0.3, 0.75], alpha: [0.1, 0.32], glintChance: 0 },
      { share: 0.33, depth: 0.55, size: [0.55, 1.1], alpha: [0.16, 0.42], glintChance: 0.06 },
      { share: 0.15, depth: 1, size: [0.9, 1.8], alpha: [0.26, 0.6], glintChance: 0.3 }
    ];

    this.layers = layerSpecs.map((spec) => {
      const count = Math.max(6, Math.round(total * spec.share));
      const stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          size: spec.size[0] + Math.random() * (spec.size[1] - spec.size[0]),
          color: pickColor(),
          baseAlpha: spec.alpha[0] + Math.random() * (spec.alpha[1] - spec.alpha[0]),
          twinkleSpeed: Math.random() * 0.9 + 0.35,
          twinkleOffset: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * 0.05 * (0.4 + spec.depth),
          driftY: (Math.random() - 0.5) * 0.05 * (0.4 + spec.depth),
          glint: Math.random() < spec.glintChance
        });
      }
      return { depth: spec.depth, stars };
    });
  }


  createMythicSigils() {
    const side = Math.max(1, Math.min(this.width, this.height));
    const large = Math.max(this.width, this.height);
    this.mythicSigils = [
      {
        x: this.width * 0.18,
        y: this.height * 0.72,
        radius: Math.max(78, side * 0.16),
        points: 3,
        rotation: -0.22,
        spin: -0.000018,
        color: "244, 195, 106",
        accent: "255, 95, 109",
        alpha: 0.16,
        depth: 0.55
      },
      {
        x: this.width * 0.78,
        y: this.height * 0.28,
        radius: Math.max(72, side * 0.13),
        points: 6,
        rotation: 0.18,
        spin: 0.000016,
        color: "116, 231, 255",
        accent: "244, 195, 106",
        alpha: 0.13,
        depth: 0.78
      },
      {
        x: this.width * 0.55,
        y: this.height * 0.86,
        radius: Math.max(110, large * 0.13),
        points: 8,
        rotation: Math.PI / 8,
        spin: -0.00001,
        color: "255, 95, 109",
        accent: "244, 195, 106",
        alpha: 0.1,
        depth: 0.35
      }
    ];
  }

  drawMythicSigils(now) {
    if (!this.mythicSigils.length) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const sigil of this.mythicSigils) {
      const pulse = this.reducedMotion ? 0 : Math.sin(now * 0.0011 + sigil.radius) * 0.035;
      const parX = this.pointerEased.x * -30 * sigil.depth;
      const parY = this.pointerEased.y * -22 * sigil.depth;
      const rotation = sigil.rotation + (this.reducedMotion ? 0 : now * sigil.spin);
      const r = sigil.radius * (1 + pulse * 0.18);

      ctx.save();
      ctx.translate(sigil.x + parX, sigil.y + parY);
      ctx.rotate(rotation);
      ctx.globalAlpha = Math.max(0.03, sigil.alpha + pulse);
      ctx.strokeStyle = `rgba(${sigil.color}, 1)`;
      ctx.lineWidth = 1.05;
      ctx.setLineDash([Math.max(8, r * 0.08), Math.max(8, r * 0.06)]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = `rgba(${sigil.color}, 0.8)`;
      ctx.beginPath();
      for (let i = 0; i <= sigil.points; i++) {
        const angle = (Math.PI * 2 * i) / sigil.points - Math.PI / 2;
        const px = Math.cos(angle) * r * 0.68;
        const py = Math.sin(angle) * r * 0.68;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.strokeStyle = `rgba(${sigil.accent}, 0.5)`;
      ctx.lineWidth = 0.65;
      for (let i = 0; i < sigil.points; i++) {
        const angle = (Math.PI * 2 * i) / sigil.points - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * r * 0.54, Math.sin(angle) * r * 0.54);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(${sigil.accent}, 0.72)`;
      ctx.beginPath();
      ctx.arc(0, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------- Meteors ---------- */

  addMeteor() {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft
      ? Math.random() * this.width * 0.35
      : this.width * 0.45 + Math.random() * this.width * 0.55;
    const startY = Math.random() * this.height * 0.35;
    const speed = Math.random() * 5 + 8;
    const angle = (Math.PI / 4) + (Math.random() * 0.35 - 0.175);
    const direction = fromLeft ? 1 : -1;

    this.meteors.push({
      x: startX,
      y: startY,
      length: Math.random() * 110 + 80,
      speed,
      dx: Math.cos(angle) * speed * direction,
      dy: Math.sin(angle) * speed,
      life: 0,
      maxLife: Math.random() * 40 + 38,
      hue: Math.random() < 0.35 ? "232, 178, 92" : "246, 236, 226"
    });
  }

  /* ---------- Events & lifecycle ---------- */

  bindEvents() {
    let resizeTimer = null;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.resize();
        this.createScene();
        if (!this.running) this.renderFrame(Date.now());
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    window.addEventListener("mousemove", (e) => {
      this.pointerTarget.x = (e.clientX / this.width) - 0.5;
      this.pointerTarget.y = (e.clientY / this.height) - 0.5;
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden || this.canvas.style.display === "none") {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  start() {
    if (this.running) return;
    if (this.reducedMotion) {
      // Static, calm render — no animation loop for reduced-motion users.
      this.renderFrame(Date.now());
      return;
    }
    this.running = true;
    this.animate();
  }

  stop() {
    this.running = false;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  /* ---------- Rendering ---------- */

  drawStar(star, time, offsetX, offsetY) {
    const twinkle = this.reducedMotion ? 0 : Math.sin(time * 0.0018 * star.twinkleSpeed + star.twinkleOffset) * 0.4;
    const alpha = Math.max(0.05, Math.min(0.9, star.baseAlpha + twinkle));
    const x = star.x + offsetX;
    const y = star.y + offsetY;

    this.ctx.fillStyle = "rgba(" + star.color + ", " + alpha.toFixed(3) + ")";
    this.ctx.beginPath();
    this.ctx.arc(x, y, star.size, 0, Math.PI * 2);
    this.ctx.fill();

    // Bright foreground stars get a soft four-point glint.
    if (star.glint && alpha > 0.34) {
      const reach = star.size * 5.2 * alpha;
      this.ctx.strokeStyle = "rgba(" + star.color + ", " + (alpha * 0.32).toFixed(3) + ")";
      this.ctx.lineWidth = 0.7;
      this.ctx.beginPath();
      this.ctx.moveTo(x - reach, y);
      this.ctx.lineTo(x + reach, y);
      this.ctx.moveTo(x, y - reach);
      this.ctx.lineTo(x, y + reach);
      this.ctx.stroke();
    }
  }

  drawMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.dx;
      m.y += m.dy;
      m.life++;

      const progress = m.life / m.maxLife;
      const alpha = Math.max(0, Math.sin(Math.min(1, progress) * Math.PI));
      const tailX = m.x - m.dx * (m.length / m.speed);
      const tailY = m.y - m.dy * (m.length / m.speed);

      const trail = this.ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      trail.addColorStop(0, "rgba(" + m.hue + ", " + (alpha * 0.75).toFixed(3) + ")");
      trail.addColorStop(1, "rgba(" + m.hue + ", 0)");

      this.ctx.strokeStyle = trail;
      this.ctx.lineWidth = 1.6;
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(m.x, m.y);
      this.ctx.lineTo(tailX, tailY);
      this.ctx.stroke();

      // Bright head.
      this.ctx.fillStyle = "rgba(" + m.hue + ", " + alpha.toFixed(3) + ")";
      this.ctx.beginPath();
      this.ctx.arc(m.x, m.y, 1.4, 0, Math.PI * 2);
      this.ctx.fill();

      if (m.life >= m.maxLife || m.x < -m.length || m.x > this.width + m.length || m.y > this.height + m.length) {
        this.meteors.splice(i, 1);
      }
    }
  }

  renderFrame(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Ease pointer parallax.
    this.pointerEased.x += (this.pointerTarget.x - this.pointerEased.x) * 0.035;
    this.pointerEased.y += (this.pointerTarget.y - this.pointerEased.y) * 0.035;

    // Nebula glow: pre-rendered layer, drifting almost imperceptibly.
    if (this.nebulaCanvas.width > 1) {
      const driftX = this.reducedMotion ? 0 : Math.sin(now * 0.00003) * 24;
      const driftY = this.reducedMotion ? 0 : Math.cos(now * 0.000024) * 18;
      const parX = this.pointerEased.x * -10;
      const parY = this.pointerEased.y * -10;
      ctx.drawImage(
        this.nebulaCanvas,
        -40 + driftX + parX,
        -40 + driftY + parY,
        this.width + 80,
        this.height + 80
      );
    }

    // Mythic geometry sits in the far background so the interface feels carved into space.
    this.drawMythicSigils(now);

    // Star layers, far to near, each with its own parallax strength.
    for (const layer of this.layers) {
      const offsetX = this.pointerEased.x * -26 * layer.depth;
      const offsetY = this.pointerEased.y * -18 * layer.depth;

      for (const star of layer.stars) {
        if (!this.reducedMotion) {
          star.x += star.driftX;
          star.y += star.driftY;
          if (star.x < -4) star.x = this.width + 4;
          if (star.x > this.width + 4) star.x = -4;
          if (star.y < -4) star.y = this.height + 4;
          if (star.y > this.height + 4) star.y = -4;
        }
        this.drawStar(star, now, offsetX, offsetY);
      }
    }

    // Occasional shooting star.
    if (!this.reducedMotion) {
      if (now > this.nextMeteorTime) {
        this.addMeteor();
        this.nextMeteorTime = now + Math.random() * 11000 + 9000;
      }
      this.drawMeteors();
    }
  }

  animate() {
    if (!this.running) return;
    this.renderFrame(Date.now());
    this.frameHandle = requestAnimationFrame(() => this.animate());
  }
}


/* =========================================================
   4. USER BACKGROUND MANAGER (التخصيص الشخصي المحفوظ محلياً)
   ========================================================= */
class UserBackgroundManager {
  constructor(starfield) {
    this.starfield = starfield;
    this.storageKey = "tmd_user_bg_settings_v4";
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
      dim: 24,
      blur: 0,
      starsOverlay: false,
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
      const showStars = (type === "preset" && preset === "animated-stars") || Boolean(starsOverlay);
      this.starsCanvas.style.display = showStars ? "block" : "none";
      this.starsCanvas.style.opacity = showStars ? "0.75" : "0";
      if (showStars) this.starfield?.start();
      else this.starfield?.stop();
    }

    if (this.starfield) {
      this.starfield.setDensity(starsDensity);
    }

    // 3. Background Layer
    if (!this.layer) return;

    if (type === "preset") {
      this.applyPresetBackground(preset);
    } else if (type === "upload" && customDataUrl) {
      this.layer.style.backgroundColor = "transparent";
      this.layer.style.backgroundImage = `url("${customDataUrl}")`;
      this.layer.style.opacity = "1";
    } else if (type === "url" && customUrl) {
      this.layer.style.backgroundColor = "transparent";
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
      "nebula": "#1d1430",
      "cyberpunk": "#211d35",
      "aurora": "#10252c",
      "obsidian": "#070812",
      "galaxy-gold": "#241a10"
    };

    this.layer.style.backgroundImage = "none";
    if (preset === "animated-stars" || !presets[preset]) {
      this.layer.style.backgroundColor = "transparent";
      this.layer.style.opacity = "0";
    } else {
      this.layer.style.backgroundColor = presets[preset];
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
      document.getElementById("closeSidebar")?.click();
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
        this.tabBtns.forEach((item) => {
          item.classList.remove("active");
          item.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const tab = btn.dataset.tab;
        Object.keys(this.tabPanes).forEach(key => {
          this.tabPanes[key]?.classList.toggle("hidden", key !== tab);
        });
      });
    });

    // Preset selection
    this.presetCards?.forEach(card => {
      const selectPreset = () => {
        this.presetCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        this.settings.type = "preset";
        this.settings.preset = card.dataset.preset;
        this.applySettings();
      };
      card.addEventListener("click", selectPreset);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPreset();
        }
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
      this.settings.starsOverlay = false;
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
        dim: 24,
        blur: 0,
        starsOverlay: false,
        starsDensity: 2
      };
      this.saveSettings();
      this.applySettings();
      showToast("تمت استعادة الخلفية الهادئة الافتراضية.");
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
      console.warn("Background compression error:", err);
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
    this.previouslyFocused = document.activeElement;
    this.modal?.classList.remove("hidden");
    requestAnimationFrame(() => this.closeBtn?.focus());
  }

  close() {
    this.modal?.classList.add("hidden");
    if (this.previouslyFocused instanceof HTMLElement) this.previouslyFocused.focus();
  }
}


/* =========================================================
   5. DOM ELEMENTS CACHE
   ========================================================= */
let chat, welcome, input, sendButton;
let plusButton, plusMenu;
let documentInput, imageInput;
let addImageButton, analyzeDocumentButton, imageEditButton;
let imagePreviewContainer, imagePreview, imageFileName, imageModeLabel, attachmentSize, removeImage;
let historyList, newChat;
let settingsBtn, modalBackdrop, modalClose;
let themeSelect, modelSelect, modelName, floatBubbleToggle;
let toast, sidebar, openSidebar, closeSidebar, sidebarBackdrop;
let exportChatBtn, clearChatBtn, clearAllHistoryBtn;
let scrollBottomBtn;
let modeWheel, modeInterface, modeInterfaceOrb, modeInterfaceTitle, modeInterfaceDescription, modeInterfaceSteps, modeInterfaceClear;
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

  if (state.model === MODELS.minimax && !hasSpartaPro()) {
    state.model = MODELS.smart;
    safeSetItem(STORAGE_KEYS.model, state.model);
  }
  applyTheme();
  updateModelUI();
  updateSpartaDailyMissionUI();
  bindEvents();
  renderHistory();
  renderMessages();
  setupTextarea();
  setupModeWheel();
  setupScrollBottom();
  setupVisualViewportFix();
  syncFloatingBubbleToggle();
  updateComposerState();
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
  attachmentSize = document.getElementById("attachmentSize");
  removeImage = document.getElementById("removeImage");

  historyList = document.getElementById("history");
  newChat = document.getElementById("newChat");

  settingsBtn = document.getElementById("settingsBtn");
  modalBackdrop = document.getElementById("modalBackdrop");
  modalClose = document.getElementById("modalClose");

  themeSelect = document.getElementById("themeSelect");
  modelSelect = document.getElementById("modelSelect");
  modelName = document.getElementById("modelName");
  floatBubbleToggle = document.getElementById("floatBubbleToggle");

  toast = document.getElementById("toast");
  sidebar = document.getElementById("sidebar");
  sidebarBackdrop = document.getElementById("sidebarBackdrop");
  openSidebar = document.getElementById("openSidebar");
  closeSidebar = document.getElementById("closeSidebar");

  exportChatBtn = document.getElementById("exportChatBtn");
  clearChatBtn = document.getElementById("clearChatBtn");
  clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");
  scrollBottomBtn = document.getElementById("scrollBottomBtn");

  modeWheel = document.getElementById("modeWheel");
  modeInterface = document.getElementById("modeInterface");
  modeInterfaceOrb = document.getElementById("modeInterfaceOrb");
  modeInterfaceTitle = document.getElementById("modeInterfaceTitle");
  modeInterfaceDescription = document.getElementById("modeInterfaceDescription");
  modeInterfaceSteps = document.getElementById("modeInterfaceSteps");
  modeInterfaceClear = document.getElementById("modeInterfaceClear");

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

  // تثبيت المساعد العائم فوق كل التطبيقات (زر الشريط العلوي + الإعدادات + التلميح السريع)
  const pinFloatingAssistant = () => {
    if (state.floatingBubbleEnabled === false) {
      showToast("فعّل خيار «إظهار فقاعة SPARTA AI» من الإعدادات أولًا.");
      return;
    }
    const api = window.__tmdFloatingAssistant;
    if (api && typeof api.pin === "function") {
      api.pin();
      showToast("جارٍ تثبيت المساعد فوق التطبيقات…", "info");
    } else {
      showToast("المساعد العائم لم يجهز بعد، جرّب بعد لحظات.");
    }
  };
  document.getElementById("pinAssistantBtn")?.addEventListener("click", pinFloatingAssistant);
  document.getElementById("pinQuickHint")?.addEventListener("click", pinFloatingAssistant);
  [document.getElementById("pinQuickHint"), document.getElementById("bgQuickHint")].forEach((node) => {
    node?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        node.click();
      }
    });
  });
  document.getElementById("pinFromSettingsBtn")?.addEventListener("click", () => {
    modalBackdrop?.classList.add("hidden");
    pinFloatingAssistant();
  });

  // Responsive Sidebar Drawer
  const setSidebarOpen = (isOpen) => {
    const compact = window.matchMedia("(max-width: 1024px)").matches;
    sidebar?.classList.toggle("open", Boolean(isOpen));
    sidebarBackdrop?.classList.toggle("show", Boolean(isOpen));
    openSidebar?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (sidebar) {
      sidebar.setAttribute("aria-hidden", compact && !isOpen ? "true" : "false");
      sidebar.inert = compact && !isOpen;
    }
  };
  openSidebar?.setAttribute("aria-controls", "sidebar");
  openSidebar?.addEventListener("click", () => setSidebarOpen(true));

  const closeSidebarFn = () => setSidebarOpen(false);
  closeSidebar?.addEventListener("click", closeSidebarFn);
  sidebarBackdrop?.addEventListener("click", closeSidebarFn);
  window.addEventListener("resize", () => setSidebarOpen(sidebar?.classList.contains("open") || false));
  setSidebarOpen(false);

  // Settings Modal
  settingsBtn?.addEventListener("click", openSettings);
  modalClose?.addEventListener("click", closeSettings);
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeSettings();
  });

  // Developer Profile Modal
  const openDeveloperModal = () => developerModalBackdrop?.classList.remove("hidden");
  developerCardBtn?.addEventListener("click", openDeveloperModal);
  developerCardBtn?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDeveloperModal();
    }
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
    safeSetItem(STORAGE_KEYS.theme, state.theme);
    applyTheme();
  });

  floatBubbleToggle?.addEventListener("change", () => {
    setFloatingBubbleEnabled(Boolean(floatBubbleToggle.checked));
  });

  const toggleTheme = () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    safeSetItem(STORAGE_KEYS.theme, state.theme);
    applyTheme();
    showToast(state.theme === "light" ? "تم التبديل للمظهر الفاتح" : "تم التبديل للمظهر الداكن");
  };

  document.getElementById("themeTop")?.addEventListener("click", toggleTheme);
  document.getElementById("themeTopDesktop")?.addEventListener("click", toggleTheme);

  // Model Selector — MiniMax/M3 هو جزء من اشتراك SPARTA Pro المدفوع فقط.
  const selectModel = (value) => {
    const candidate = VALID_MODELS.has(value) ? value : MODELS.smart;
    if (candidate === MODELS.minimax && !hasSpartaPro()) {
      state.model = MODELS.smart;
      safeSetItem(STORAGE_KEYS.model, state.model);
      updateModelUI();
      showToast("SPARTA Max مع MiniMax M3 متاحان ضمن اشتراك SPARTA Pro المدفوع فقط.");
      return false;
    }
    state.model = candidate;
    safeSetItem(STORAGE_KEYS.model, state.model);
    updateModelUI();
    return true;
  };

  modelSelect?.addEventListener("change", () => selectModel(modelSelect.value));

  const settingsModel = document.getElementById("modelSelectSettings");
  settingsModel?.addEventListener("change", () => selectModel(settingsModel.value));

  // مهمة اليوم ليست رصيدًا مجانيًا: هي تحدٍّ مستقل للنسخة المدفوعة فقط.
  document.getElementById("dailyMissionButton")?.addEventListener("click", () => {
    if (!hasSpartaPro()) {
      showToast("مهمة اليوم وSPARTA Max متاحان في اشتراك SPARTA Pro المدفوع فقط.");
      updateSpartaDailyMissionUI();
      return;
    }
    const mission = getSpartaDailyMission();
    const progress = readSpartaDailyMissionState();
    if (progress.completed) {
      showToast("أكملت مهمة اليوم بالفعل. يعود تحدٍّ جديد غدًا.");
      return;
    }
    state.model = MODELS.minimax;
    safeSetItem(STORAGE_KEYS.model, state.model);
    updateModelUI();
    if (!input) return;
    input.value = mission.prompt;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
    input.dataset.spartaDailyMission = mission.day;
    input.focus();
    updateComposerState();
    showToast("تم تجهيز مهمة اليوم في SPARTA Max. أرسلها للبدء.");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === SPARTA_PLAN_KEY || event.key === SPARTA_DAILY_MISSION_KEY) {
      updateSpartaDailyMissionUI();
      if (!hasSpartaPro() && state.model === MODELS.minimax) {
        state.model = MODELS.smart;
        safeSetItem(STORAGE_KEYS.model, state.model);
        updateModelUI();
      }
    }
  });

  // Welcome Cards Click to Prompt
  document.querySelectorAll(".welcome-card[data-prompt]").forEach(card => {
    card.addEventListener("click", () => {
      if (!input) return;
      input.value = card.dataset.prompt;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
      input.focus();
      updateComposerState();
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
    updateComposerState();
  });
}


function setupModeWheel() {
  state.aiMode = normalizeAiMode(state.aiMode);
  modeWheel?.querySelectorAll(".mode-node[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = normalizeAiMode(button.dataset.mode);
      if (!mode) return;
      setAiMode(mode, button);
    });
  });

  modeInterfaceClear?.addEventListener("click", () => {
    state.aiMode = "";
    safeRemoveItem(STORAGE_KEYS.aiMode);
    updateModeWheel();
    showToast("تم إلغاء الوضع الذكي والعودة للمحادثة العادية.", "info");
  });

  updateModeWheel();
}

function setAiMode(mode, button) {
  const next = normalizeAiMode(mode);
  if (!next) return;
  state.aiMode = next;
  safeSetItem(STORAGE_KEYS.aiMode, next);

  if (button) {
    button.classList.remove("is-bursting");
    // Restart the launch/burst animation even when the same mode is selected again.
    void button.offsetWidth;
    button.classList.add("is-bursting");
    window.setTimeout(() => button.classList.remove("is-bursting"), 760);
  }

  updateModeWheel();
  showToast(`${AI_MODES[next].title} جاهز — اكتب طلبك الآن.`, "info");
}

function updateModeWheel() {
  const activeMode = normalizeAiMode(state.aiMode);
  const activeConfig = activeMode ? AI_MODES[activeMode] : null;

  modeWheel?.querySelectorAll(".mode-node[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === activeMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });

  if (input) {
    input.placeholder = activeConfig?.placeholder || "اكتب رسالتك وأطلق شرارة الفكرة...";
  }

  if (!modeInterface) return;
  modeInterface.classList.toggle("hidden", !activeConfig);

  if (!activeConfig) return;
  if (modeInterfaceOrb) modeInterfaceOrb.textContent = activeConfig.icon;
  if (modeInterfaceTitle) modeInterfaceTitle.textContent = activeConfig.title;
  if (modeInterfaceDescription) modeInterfaceDescription.textContent = activeConfig.description;
  if (modeInterfaceSteps) {
    modeInterfaceSteps.innerHTML = activeConfig.steps
      .map((step) => `<span>${escapeHTML(step)}</span>`)
      .join("");
  }
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

function setupVisualViewportFix() {
  if (!window.visualViewport || !document.documentElement) return;
  const isIOSLike = /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOSLike) return;

  const update = () => {
    const viewport = window.visualViewport;
    const focused = document.activeElement === input;
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty("--keyboard-inset", focused && inset > 60 ? `${Math.round(inset)}px` : "0px");
    document.body.classList.toggle("keyboard-adjust", focused && inset > 60);
  };

  window.visualViewport.addEventListener("resize", update);
  window.visualViewport.addEventListener("scroll", update);
  input?.addEventListener("focus", update);
  input?.addEventListener("blur", () => {
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    document.body.classList.remove("keyboard-adjust");
  });
  update();
}

function updateComposerState() {
  if (!sendButton) return;
  if (state.busy) {
    sendButton.disabled = false;
    return;
  }
  const hasText = Boolean(input?.value?.trim());
  const hasAttachment = Boolean(state.selectedImage || state.selectedDocument);
  sendButton.disabled = !(hasText || hasAttachment);
}

function syncFloatingBubbleToggle() {
  if (floatBubbleToggle) {
    floatBubbleToggle.checked = state.floatingBubbleEnabled !== false;
  }
}

function setFloatingBubbleEnabled(enabled) {
  state.floatingBubbleEnabled = Boolean(enabled);
  safeSetItem(STORAGE_KEYS.floatingBubble, state.floatingBubbleEnabled ? "1" : "0");
  syncFloatingBubbleToggle();

  const api = window.__tmdFloatingAssistant;
  if (api && typeof api.setEnabled === "function") {
    api.setEnabled(state.floatingBubbleEnabled);
  } else {
    window.dispatchEvent(new CustomEvent("tmd-floating-enabled-change", {
      detail: { enabled: state.floatingBubbleEnabled }
    }));
  }

  showToast(state.floatingBubbleEnabled
    ? "تم إظهار فقاعة SPARTA AI."
    : "تم إخفاء فقاعة SPARTA AI. يمكنك إعادتها من الإعدادات.");
}


/* =========================================================
   9. THEME & MODEL UI
   ========================================================= */
function applyTheme() {
  state.theme = state.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  if (themeSelect) themeSelect.value = state.theme;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", state.theme === "light" ? "#FAF6F1" : "#070812");
  const themeIcon = state.theme === "light" ? UI_ICONS.moon : UI_ICONS.sun;
  document.querySelectorAll(".theme-icon, .theme-icon-indicator").forEach((node) => {
    node.innerHTML = themeIcon;
  });
  document.getElementById("themeTopDesktop")?.setAttribute("aria-label", state.theme === "light" ? "تفعيل المظهر الداكن" : "تفعيل المظهر الفاتح");
  document.getElementById("themeTop")?.setAttribute("aria-label", state.theme === "light" ? "تفعيل المظهر الداكن" : "تفعيل المظهر الفاتح");
}

function updateModelUI() {
  if (modelSelect) modelSelect.value = state.model;
  const settingsModel = document.getElementById("modelSelectSettings");
  if (settingsModel) settingsModel.value = state.model;
  if (!modelName) return;

  if (state.model === MODELS.vision) {
    modelName.textContent = "SPARTA Vision 27B";
  } else if (state.model === MODELS.minimax) {
    modelName.textContent = state.minimaxBillingBlocked
      ? "SPARTA Max Pro — MiniMax M3 (الرصيد منتهٍ — تحويل تلقائي إلى Groq)"
      : "SPARTA Max Pro — MiniMax M3";
  } else if (state.model === MODELS.fast) {
    modelName.textContent = "SPARTA Fast 20B";
  } else {
    modelName.textContent = "SPARTA Core 120B";
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
    plusButton?.setAttribute("aria-expanded", "true");
  } else {
    plusMenu.classList.add("hidden");
    plusButton?.classList.remove("active");
    plusButton?.setAttribute("aria-expanded", "false");
  }
}

function closePlusMenu() {
  plusMenu?.classList.add("hidden");
  plusButton?.classList.remove("active");
  plusButton?.setAttribute("aria-expanded", "false");
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
    console.warn("Image selection error:", error);
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
  if (attachmentSize) attachmentSize.textContent = formatFileSize(state.selectedImage.file?.size);
  if (imagePreviewContainer) imagePreviewContainer.classList.remove("hidden");
  updateComposerState();
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
  if (attachmentSize) attachmentSize.textContent = "";
  if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
  updateComposerState();
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
    if (imageModeLabel) imageModeLabel.textContent = "مستند جاهز للتحليل";
    if (attachmentSize) attachmentSize.textContent = formatFileSize(file.size);

    showToast(`تم إرفاق المستند: ${file.name}`);

    if (input && !input.value.trim()) {
      input.value = "حلل هذا المستند واذكر أهم النقاط والاستنتاجات والمعلومات الأساسية فيه.";
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
    }
    input?.focus();
    updateComposerState();
  } catch (error) {
    console.warn("Document error:", error);
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

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
    if (next) safeSetItem(STORAGE_KEYS.minimaxBilling, "1");
    else safeRemoveItem(STORAGE_KEYS.minimaxBilling);
  } catch (err) {
    console.warn("Failed to persist MiniMax billing state:", err);
  }
  updateModelUI();
}

function describeHttpError(status, requestedModel = state.model) {
  const usingMiniMax = requestedModel === MODELS.minimax;
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


function getModeDirective(mode, variant = "") {
  const config = AI_MODES[mode];
  if (!config) return "";
  if (mode === "competition" && variant === "engineA") return config.engineA;
  if (mode === "competition" && variant === "engineB") return config.engineB;
  return config.directive;
}

function withModeInstruction(content, mode, variant = "") {
  const directive = getModeDirective(mode, variant);
  if (!directive) return content || "";
  const userContent = (content || "").trim() || "ابدأ بتطبيق هذا الوضع على طلبي الحالي.";
  return `${directive}\n\nطلب المستخدم:\n${userContent}`;
}

function applyDirectiveToLatestUser(messages, directive) {
  const cloned = Array.isArray(messages)
    ? messages.map((msg) => ({ ...msg }))
    : [];

  for (let i = cloned.length - 1; i >= 0; i--) {
    if (cloned[i]?.role === "user" && typeof cloned[i].content === "string") {
      cloned[i].content = `${directive}\n\nطلب المستخدم:\n${cloned[i].content.trim() || "ابدأ البحث الآن."}`;
      break;
    }
  }

  return cloned;
}

async function requestChatCompletion(model, messages, signal) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ model, messages }),
    signal
  });

  let data = {};
  try {
    data = await response.json();
  } catch (jsonError) {
    if (response.ok) {
      throw new Error("تعذر قراءة رد الخادم، حاول مرة أخرى.");
    }
    data = {};
  }

  if (!response.ok) {
    const httpError = new Error(
      data?.error ||
      describeHttpError(response.status, model)
    );
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

  return data;
}

async function runCompetitionMode(apiMessages, signal) {
  const engineA = requestChatCompletion(
    MODELS.smart,
    applyDirectiveToLatestUser(apiMessages, getModeDirective("competition", "engineA")),
    signal
  );
  const engineB = requestChatCompletion(
    MODELS.fast,
    applyDirectiveToLatestUser(apiMessages, getModeDirective("competition", "engineB")),
    signal
  );

  const [first, second] = await Promise.allSettled([engineA, engineB]);

  if (first.status === "rejected" && second.status === "rejected") {
    throw first.reason || second.reason || new Error("تعذر تشغيل وضع المنافسة حالياً.");
  }

  const renderResult = (settled, label, modelLabel) => {
    if (settled.status === "fulfilled") {
      const reply = cleanAssistantReply(settled.value?.reply || "");
      return `### ${label} — ${modelLabel}\n${reply || "لم يرجع هذا المحرك نتيجة نصية واضحة."}`;
    }
    const reason = settled.reason?.message || "تعذر الحصول على نتيجة من هذا المحرك.";
    return `### ${label} — ${modelLabel}\n> ${reason}`;
  };

  const reply = [
    "## ⚔ وضع المنافسة — نتيجتان مستقلتان",
    "قمت بتشغيل مسارين مختلفين للطلب نفسه. راجع النتيجتين واختر الأنسب لك من أزرار الاعتماد أسفل الرد.",
    renderResult(first, "النتيجة الأولى", "SPARTA Core"),
    renderResult(second, "النتيجة الثانية", "SPARTA Fast"),
    "### طريقة الاختيار",
    "- اختر **اعتماد النتيجة الأولى** إذا أردت الدقة والتنظيم المحافظ.\n- اختر **اعتماد النتيجة الثانية** إذا أردت زاوية مختلفة أو أسلوبًا أكثر سرعة.\n- أو اطلب **دمج الأفضل** للحصول على نسخة نهائية تجمع أقوى النقاط."
  ].join("\n\n");

  return {
    reply,
    model: "SPARTA Competition",
    provider: "groq"
  };
}

async function sendMessage() {
  if (state.busy) {
    stopRequest();
    return;
  }

  const text = input?.value?.trim() || "";
  const activeAiMode = normalizeAiMode(state.aiMode);
  if (!text && !state.selectedImage && !state.selectedDocument) {
    return;
  }
  const isDailyMissionRequest = input?.dataset.spartaDailyMission === spartaTodayKey();

  state.busy = true;
  state.controller = new AbortController();
  state.abortReason = "";
  const timeoutId = window.setTimeout(() => {
    state.abortReason = "timeout";
    state.controller?.abort();
  }, REQUEST_TIMEOUT_MS);
  setSendingState(true);

  // Build User Message
  const userMessage = {
    role: "user",
    content: text,
    mode: activeAiMode || undefined
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

  // عرض الرسالة بحركة دخول قصيرة وهادئة.
  renderMessages();

  if (input) {
    input.value = "";
    input.style.height = "auto";
    delete input.dataset.spartaDailyMission;
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

    // 2. Normal Request to Backend (or advanced mode routing)
    const hasImage = Boolean(attachedImage);
    const hasDocument = Boolean(attachedDoc);
    const runDualCompetition = activeAiMode === "competition" && !hasImage && !hasDocument;
    const apiMessages = buildApiMessages({
      applyModes: !runDualCompetition,
      ignoreAttachments: runDualCompetition
    });

    if (runDualCompetition) {
      const competitionData = await runCompetitionMode(apiMessages, state.controller.signal);
      removeLoadingMessage(loadingId);

      state.messages.push({
        role: "assistant",
        content: competitionData.reply,
        mode: "competition",
        model: competitionData.model,
        provider: competitionData.provider
      });

      saveMessages();
      renderMessages();
      saveConversation();
      return;
    }

    const selectedModel = VALID_MODELS.has(state.model) ? state.model : MODELS.smart;
    let model = hasImage && selectedModel !== MODELS.minimax
      ? MODELS.vision
      : selectedModel;

    if (!hasImage && activeAiMode === "comparison") {
      model = hasSpartaPro() ? MODELS.minimax : MODELS.smart;
    } else if (!hasImage && activeAiMode === "deep-search") {
      model = MODELS.smart;
    }

    const data = await requestChatCompletion(model, apiMessages, state.controller.signal);
    removeLoadingMessage(loadingId);

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
      mode: activeAiMode || undefined,
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

    // لا توجد مكافأة رصيد هنا: نعلّم المهمة مكتملة فقط بعد رد ناجح من Pro.
    if (isDailyMissionRequest && hasSpartaPro()) {
      completeSpartaDailyMission();
      showToast("أُنجزت مهمة SPARTA Pro اليومية. يعود تحدٍّ جديد غدًا.");
    }

    saveMessages();
    renderMessages();
    saveConversation();
  } catch (error) {
    removeLoadingMessage(loadingId);

    if (error?.name === "AbortError") {
      if (state.abortReason === "timeout") {
        const message = "استغرق الطلب وقتًا أطول من المتوقع، حاول مرة أخرى.";
        showToast(message);
        addErrorMessage(message);
      } else {
        showToast("تم إيقاف المعالجة.");
      }
    } else {
      console.warn("SPARTA AI Message Error:", error?.message || error);
      const message = error?.message || "تعذر الاتصال بالذكاء الاصطناعي، حاول مرة أخرى.";
      showToast(message);
      addErrorMessage(
        message,
        error?.notice
      );
    }
  } finally {
    window.clearTimeout(timeoutId);
    state.busy = false;
    state.controller = null;
    state.abortReason = "";
    setSendingState(false);
  }
}

function buildApiMessages(options = {}) {
  const applyModes = options.applyModes !== false;
  const ignoreAttachments = options.ignoreAttachments === true;
  const historyMessages = Array.isArray(state.messages) ? state.messages.slice(-16) : [];

  const lastImageIndex = historyMessages.reduce((idx, msg, i) => msg?.image ? i : idx, -1);
  const lastFileIndex = historyMessages.reduce((idx, msg, i) => msg?.fileText ? i : idx, -1);

  if (!ignoreAttachments && lastImageIndex !== -1) {
    const msg = historyMessages[lastImageIndex];
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: applyModes
              ? withModeInstruction(msg.content?.trim() || "حلل هذه الصورة وقدم النتيجة النهائية فقط.", msg.mode)
              : (msg.content?.trim() || "حلل هذه الصورة وقدم النتيجة النهائية فقط.")
          },
          {
            type: "image_url",
            image_url: { url: msg.image }
          }
        ]
      }
    ];
  }

  if (!ignoreAttachments && lastFileIndex !== -1) {
    const context = [];
    for (let i = Math.max(0, lastFileIndex - 2); i < lastFileIndex; i++) {
      const msg = historyMessages[i];
      if (msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
        context.push({ role: msg.role, content: msg.content.slice(-1200) });
      }
    }

    const fileMsg = historyMessages[lastFileIndex];
    const filePrompt = applyModes
      ? withModeInstruction(fileMsg.content || "حلل الملف المرفق.", fileMsg.mode)
      : (fileMsg.content || "حلل الملف المرفق.");
    context.push({
      role: "user",
      content:
        `${filePrompt}\n\n` +
        `اسم الملف: ${fileMsg.fileName || "file"}\n\n` +
        `محتوى الملف:\n--- BEGIN FILE ---\n` +
        `${truncateText(fileMsg.fileText || "", 12000)}\n` +
        `--- END FILE ---`
    });
    return context;
  }

  return historyMessages
    .filter(msg => msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string" && msg.content.trim())
    .map(msg => {
      const content = msg.content.slice(-2500);
      return {
        role: msg.role,
        content: applyModes && msg.role === "user"
          ? withModeInstruction(content, msg.mode)
          : content
      };
    });
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
    avatar.classList.add("is-bot");
    avatar.innerHTML = botSparkHTML();
  }

  const content = document.createElement("div");
  content.className = "message-content";

  // Provider notice (billing / fallback)
  if (message.notice && typeof message.notice.text === "string") {
    const notice = document.createElement("div");
    notice.className = "message-notice";
    notice.innerHTML = UI_ICONS.info + `<span>${escapeHTML(message.notice.text)}</span>`;
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
    fileBox.innerHTML = UI_ICONS.paperclip + `<span>${escapeHTML(message.fileName)}</span>`;
    content.appendChild(fileBox);
  }

  // Active AI mode badge
  if (message.mode && AI_MODES[message.mode]) {
    const modeBadge = document.createElement("div");
    modeBadge.className = "message-mode-badge";
    modeBadge.textContent = `${AI_MODES[message.mode].icon} ${AI_MODES[message.mode].title}`;
    content.appendChild(modeBadge);
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

    if (message.role === "assistant" && message.mode === "competition") {
      content.appendChild(createCompetitionChoiceActions());
    }

    // Message Actions Toolbar (Copy & TTS)
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-action-btn";
    copyBtn.innerHTML = UI_ICONS.copy + `<span>نسخ</span>`;
    copyBtn.setAttribute("aria-label", "نسخ نص الرسالة");
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(message.content);
      showToast("تم نسخ النص", "success");
    });
    actions.appendChild(copyBtn);

    if ("speechSynthesis" in window) {
      const speakBtn = document.createElement("button");
      speakBtn.className = "msg-action-btn";
      speakBtn.innerHTML = UI_ICONS.volume + `<span>استماع</span>`;
      speakBtn.setAttribute("aria-label", "الاستماع إلى الرسالة");
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


function createCompetitionChoiceActions() {
  const wrap = document.createElement("div");
  wrap.className = "mode-choice-actions";

  const choices = [
    {
      label: "اعتماد النتيجة الأولى",
      prompt: "اعتمد النتيجة الأولى من وضع المنافسة وحوّلها إلى خطة نهائية مختصرة ومنظمة."
    },
    {
      label: "اعتماد النتيجة الثانية",
      prompt: "اعتمد النتيجة الثانية من وضع المنافسة وحوّلها إلى خطة نهائية مختصرة ومنظمة."
    },
    {
      label: "ادمج الأفضل",
      prompt: "ادمج أفضل ما في النتيجتين من وضع المنافسة وقدّم نسخة نهائية واحدة أقوى وأكثر دقة."
    }
  ];

  for (const choice of choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-choice-btn";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => {
      if (!input) return;
      input.value = choice.prompt;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
      input.focus();
      updateComposerState();
      showToast("تم تجهيز اختيارك في صندوق الكتابة.", "success");
    });
    wrap.appendChild(btn);
  }

  return wrap;
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
          <button class="copy-code-btn" type="button" aria-label="نسخ الكود" onclick="copyCodeFromBlock(this)">${UI_ICONS.copy}<span>نسخ الكود</span></button>
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
    btn.innerHTML = UI_ICONS.check + "<span>تم النسخ</span>";
    setTimeout(() => { btn.innerHTML = UI_ICONS.copy + "<span>نسخ الكود</span>"; }, 1800);
    showToast("تم نسخ الكود", "success");
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
    <div class="message-avatar is-bot">${botSparkHTML()}</div>
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
    <div class="message-avatar is-bot">${botSparkHTML()}</div>
    <div class="message-content">
      ${notice ? `<div class="message-notice">${UI_ICONS.info}<span>${escapeHTML(notice)}</span></div>` : ""}
      <div class="message-text error-text">
        ${UI_ICONS.alert}<span>${escapeHTML(message)}</span>
      </div>
    </div>
  `;
  chat.appendChild(wrapper);
  scrollToBottom();
}

function setSendingState(sending) {
  if (!sendButton) return;
  if (sending) {
    sendButton.disabled = false;
    sendButton.classList.add("stop");
    sendButton.innerHTML = UI_ICONS.square;
    sendButton.setAttribute("aria-label", "إيقاف");
    sendButton.setAttribute("title", "إيقاف الطلب الحالي");
  } else {
    sendButton.classList.remove("stop");
    sendButton.innerHTML = UI_ICONS.send;
    sendButton.setAttribute("aria-label", "إرسال");
    sendButton.setAttribute("title", "إرسال (Enter)");
    updateComposerState();
  }
}

function stopRequest() {
  state.abortReason = "manual";
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
    safeSetItem(STORAGE_KEYS.messages, JSON.stringify(sanitizeMessagesForStorage(state.messages, 50)));
  } catch (error) {
    console.warn("Storage quota fallback:", error);
    const lightweight = state.messages.map(m => ({
      role: m.role,
      content: m.content,
      fileName: m.fileName
    }));
    try {
      safeSetItem(STORAGE_KEYS.messages, JSON.stringify(lightweight.slice(-25)));
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

    safeSetItem(STORAGE_KEYS.conversations, JSON.stringify(sanitizeConversationsForStorage(state.conversations)));
    renderHistory();
  } catch (e) {
    console.warn("Could not save conversation:", e);
  }
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = "";

  if (!state.conversations.length) {
    historyList.innerHTML = `<div class="empty-history">${UI_ICONS.message}<span>لا توجد محادثات بعد</span><button class="empty-history-action" type="button">ابدأ محادثة جديدة</button></div>`;
    historyList.querySelector(".empty-history-action")?.addEventListener("click", createNewChat);
    return;
  }

  const list = [...state.conversations].reverse();
  list.forEach(conv => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `history-item ${conv.active ? "active" : ""}`;
    item.innerHTML = UI_ICONS.message + `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(conv.title || "محادثة جديدة")}</span>`;
    item.addEventListener("click", () => loadConversation(conv));
    historyList.appendChild(item);
  });
}

function loadConversation(conv) {
  if (!conv) return;
  state.messages = Array.isArray(conv.messages) ? [...conv.messages] : [];
  resetAttachment();
  renderMessages();
  closeSidebar?.click();
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
  safeSetItem(STORAGE_KEYS.conversations, JSON.stringify(sanitizeConversationsForStorage(state.conversations)));
  renderHistory();
  closeSidebar?.click();
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
  safeRemoveItem(STORAGE_KEYS.messages);
  safeRemoveItem(STORAGE_KEYS.conversations);
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

  let text = `# سجل محادثة SPARTA AI\n`;
  text += `تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}\n`;
  text += `تطوير وتصميم: ياسين عمرو عبد الرحيم\n`;
  text += `---------------------------------------------------\n\n`;

  state.messages.forEach(m => {
    const role = m.role === "user" ? "المستخدم" : "SPARTA AI";
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
  syncFloatingBubbleToggle();
  openSettings.previouslyFocused = document.activeElement;
  modalBackdrop?.classList.remove("hidden");
  requestAnimationFrame(() => modalClose?.focus());
}

function closeSettings() {
  modalBackdrop?.classList.add("hidden");
  if (openSettings.previouslyFocused instanceof HTMLElement) openSettings.previouslyFocused.focus();
}

function showToast(message, requestedType) {
  if (!toast) return;
  const text = String(message || "");
  const type = requestedType || (/خطأ|تعذر|فشل|غير صحيحة|مرفوض/i.test(text)
    ? "error"
    : (/جار|انتظر|تنبيه|رصيد/i.test(text) ? "info" : "success"));
  const icon = type === "error" ? UI_ICONS.alert : (type === "info" ? UI_ICONS.info : UI_ICONS.check);
  toast.classList.remove("is-error", "is-info", "is-warning");
  if (type !== "success") toast.classList.add(`is-${type}`);
  toast.innerHTML = icon + `<span>${escapeHTML(text)}</span>`;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
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
  setFloatingBubbleEnabled,
  showToast
};

console.log("SPARTA AI loaded — Engineered & Designed by Yassin Amr Abdelrahim (ياسين عمرو عبد الرحيم)");

