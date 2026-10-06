"use strict";

/* ===========================================================================
   SPARTA AI — Seedance 2.5 video gateway

   This function keeps the licensed BytePlus / ModelArk key on the server.
   It intentionally pins every request to the current Seedance 2.5 model
   version — callers cannot choose a different model.
   =========================================================================== */

const crypto = require("crypto");

const MODEL = "dreamina-seedance-2-5-260628";
const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const TASKS_URL = `${BASE_URL}/contents/generations/tasks`;

const MIN_DURATION = 4;
const MAX_DURATION = 30;
const MAX_PROMPT_CHARS = 6000;
const MAX_IMAGE_DATA_URL_CHARS = 2_800_000;
const MAX_REFERENCES = 50;
const MAX_IMAGES = 30;
const MAX_VIDEOS = 10;
const MAX_AUDIO = 10;
const RATIOS = new Set(["16:9", "9:16", "1:1", "adaptive"]);
const RESOLUTIONS = new Set(["480p", "720p"]);
const MODES = new Set(["text", "first-frame", "first-last", "reference", "edit", "extend"]);
const TRANSIENT_ERROR = /timeout|temporar|internal|server error|service unavailable|rate limit/i;

/* Best-effort protection for an expensive public endpoint. It is intentionally
   memory-only: Vercel functions can scale horizontally, so this is a safety
   belt rather than a replacement for application-level authentication. */
const requestWindows = new Map();

function json(res, status, body) {
  return res.status(status).json(body);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body !== "string") return {};
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    throw new Error("تعذر قراءة بيانات طلب الفيديو.");
  }
}

function getApiKey() {
  return String(process.env.SEEDANCE_API_KEY || process.env.ARK_API_KEY || "").trim();
}

function safeEqual(first, second) {
  if (typeof first !== "string" || typeof second !== "string") return false;
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAccessCode(req, body) {
  const expected = String(process.env.SEEDANCE_ACCESS_CODE || "").trim();
  if (!expected) return null;
  const headers = req.headers || {};
  const supplied = String(
    body.accessCode || headers["x-seedance-access-code"] || ""
  ).trim();
  if (safeEqual(expected, supplied)) return null;
  return "رمز الوصول إلى Seedance غير صحيح أو مفقود.";
}

function getClientKey(req) {
  const headers = req.headers || {};
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(headers["x-real-ip"] || "unknown").trim() || "unknown";
}

function enforceCreateLimit(req) {
  const limit = Math.max(1, Math.min(30, Number(process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR || 3) || 3));
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const key = getClientKey(req);
  const active = (requestWindows.get(key) || []).filter((time) => now - time < windowMs);

  if (active.length >= limit) {
    requestWindows.set(key, active);
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - active[0])) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  active.push(now);
  requestWindows.set(key, active);
  return { ok: true };
}

function validTaskId(value) {
  return /^[A-Za-z0-9_.:-]{3,180}$/.test(String(value || ""));
}

function normalizeMode(value) {
  return MODES.has(value) ? value : "text";
}

function isPublicOrAssetUrl(value, allowImageData) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("asset://")) return /^asset:\/\/[-A-Za-z0-9_.]+$/.test(url);
  if (allowImageData && /^data:image\/(?:jpeg|jpg|png|webp|bmp|tiff|gif|heic|heif);base64,[a-z0-9+/=\s]+$/i.test(url)) {
    return url.length <= MAX_IMAGE_DATA_URL_CHARS;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanPurpose(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 480);
}

function validateReferences(rawReferences, mode) {
  const references = Array.isArray(rawReferences) ? rawReferences : [];
  if (references.length > MAX_REFERENCES) {
    return { error: `الحد الأقصى للمراجع هو ${MAX_REFERENCES} مرجعًا في الطلب الواحد.` };
  }

  const clean = [];
  const counts = { image: 0, video: 0, audio: 0 };

  for (const reference of references) {
    if (!reference || typeof reference !== "object") {
      return { error: "أحد المراجع غير صالح." };
    }

    const type = String(reference.type || "").toLowerCase();
    if (!(type === "image" || type === "video" || type === "audio")) {
      return { error: "نوع المرجع يجب أن يكون صورة أو فيديو أو صوتًا." };
    }

    const source = String(reference.source || "").trim();
    if (!isPublicOrAssetUrl(source, type === "image")) {
      return {
        error: type === "image"
          ? "مصدر الصورة يجب أن يكون رابط HTTPS عامًّا أو asset:// أو Data URL صالحًا وصغيرًا."
          : "مصدر الفيديو أو الصوت يجب أن يكون رابط HTTPS عامًّا أو asset://."
      };
    }

    counts[type] += 1;
    clean.push({ type, source, purpose: cleanPurpose(reference.purpose), name: String(reference.name || "").slice(0, 160) });
  }

  if (counts.image > MAX_IMAGES) return { error: `يمكن استخدام ${MAX_IMAGES} صورة كحد أقصى.` };
  if (counts.video > MAX_VIDEOS) return { error: `يمكن استخدام ${MAX_VIDEOS} فيديوهات كحد أقصى.` };
  if (counts.audio > MAX_AUDIO) return { error: `يمكن استخدام ${MAX_AUDIO} مقاطع صوتية كحد أقصى.` };

  if (mode === "first-frame" && (clean.length !== 1 || clean[0].type !== "image")) {
    return { error: "وضع إطار البداية يحتاج صورة واحدة فقط." };
  }
  if (mode === "first-last" && (clean.length !== 2 || clean.some((item) => item.type !== "image"))) {
    return { error: "وضع إطاري البداية والنهاية يحتاج صورتين فقط." };
  }
  if (mode === "reference" && !clean.length) {
    return { error: "أضف مرجعًا فعليًا واحدًا على الأقل لوضع المراجع." };
  }
  if ((mode === "edit" || mode === "extend") && !clean.some((item) => item.type === "video")) {
    return { error: "وضع التعديل أو التمديد يحتاج رابط فيديو مرجعيًا فعليًا واحدًا على الأقل." };
  }
  if (mode === "text" && clean.length) {
    return { error: "وضع النص فقط لا يقبل مراجع. اختر وضع الإطار أو المراجع بدلًا منه." };
  }

  return { references: clean };
}

function buildContent(prompt, references, mode) {
  const mapping = references
    .map((reference, index) => {
      if (!reference.purpose) return "";
      const label = `${reference.type[0].toUpperCase()}${reference.type.slice(1)} ${index + 1}`;
      return `@${label}: ${reference.purpose}`;
    })
    .filter(Boolean);

  const promptWithMapping = mapping.length
    ? `${prompt.trim()}\n\nReference mapping:\n${mapping.join("\n")}`
    : prompt.trim();

  const content = [{ type: "text", text: promptWithMapping }];

  references.forEach((reference, index) => {
    let role = `reference_${reference.type}`;
    if (mode === "first-frame") role = "first_frame";
    if (mode === "first-last") role = index === 0 ? "first_frame" : "last_frame";

    if (reference.type === "image") {
      content.push({ type: "image_url", image_url: { url: reference.source }, role });
    } else if (reference.type === "video") {
      content.push({ type: "video_url", video_url: { url: reference.source }, role });
    } else {
      content.push({ type: "audio_url", audio_url: { url: reference.source }, role });
    }
  });

  return content;
}

function validateCreate(body) {
  const prompt = String(body.prompt || "").trim();
  const mode = normalizeMode(String(body.mode || "text"));
  const requestedDuration = Number(body.duration);
  const requestedRatio = String(body.ratio || "16:9").trim();
  const resolution = String(body.resolution || "720p").trim();

  if (!prompt) return { error: "اكتب وصف الفيديو أولًا." };
  if (prompt.length > MAX_PROMPT_CHARS) return { error: "وصف الفيديو طويل جدًا. اختصره إلى 6,000 حرف أو أقل." };
  if (!RATIOS.has(requestedRatio)) return { error: "نسبة الأبعاد غير مدعومة." };
  if (!RESOLUTIONS.has(resolution)) return { error: "Seedance 2.5 يدعم 480p أو 720p في هذا التكامل." };

  const referenceResult = validateReferences(body.references, mode);
  if (referenceResult.error) return referenceResult;

  let ratio = requestedRatio;
  let duration = requestedDuration;
  if (mode === "first-frame" || mode === "first-last" || mode === "edit" || mode === "extend") {
    ratio = "adaptive";
  }
  if (mode === "edit") {
    duration = -1;
  } else if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return { error: `المدة يجب أن تكون رقمًا صحيحًا بين ${MIN_DURATION} و${MAX_DURATION} ثانية.` };
  }

  return {
    prompt,
    mode,
    ratio,
    duration,
    resolution,
    references: referenceResult.references,
    generateAudio: body.generateAudio !== false,
    watermark: body.watermark === true,
    returnLastFrame: body.returnLastFrame !== false
  };
}

function toTask(data) {
  const task = data && typeof data === "object" ? data : {};
  const content = task.content && typeof task.content === "object" ? task.content : {};
  return {
    id: String(task.id || ""),
    model: String(task.model || MODEL),
    status: String(task.status || "queued"),
    createdAt: Number(task.created_at) || undefined,
    duration: Number.isFinite(Number(task.duration)) ? Number(task.duration) : undefined,
    videoUrl: typeof content.video_url === "string" ? content.video_url : "",
    lastFrameUrl: typeof content.last_frame_url === "string" ? content.last_frame_url : "",
    error: task.error && typeof task.error === "object"
      ? { code: String(task.error.code || ""), message: String(task.error.message || "") }
      : null
  };
}

async function callProvider(path, apiKey, options = {}) {
  const response = await fetch(`${TASKS_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function providerError(data, fallback) {
  return String(
    data?.error?.message || data?.message || data?.base_resp?.status_msg || fallback || "تعذر الاتصال بخدمة Seedance."
  ).trim();
}

async function createTask(req, res, body, apiKey) {
  const accessError = requireAccessCode(req, body);
  if (accessError) return json(res, 401, { ok: false, code: "ACCESS_DENIED", error: accessError });

  const input = validateCreate(body);
  if (input.error) return json(res, 400, { ok: false, code: "INVALID_VIDEO_REQUEST", error: input.error });

  const limited = enforceCreateLimit(req);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSeconds));
    return json(res, 429, {
      ok: false,
      code: "VIDEO_RATE_LIMIT",
      error: "تم بلوغ الحد المؤقت لإنشاء الفيديوهات. حاول لاحقًا.",
      retryAfterSeconds: limited.retryAfterSeconds
    });
  }

  const payload = {
    model: MODEL,
    content: buildContent(input.prompt, input.references, input.mode),
    ratio: input.ratio,
    duration: input.duration,
    resolution: input.resolution,
    generate_audio: input.generateAudio,
    watermark: input.watermark,
    return_last_frame: input.returnLastFrame
  };

  if (input.mode === "reference") payload.omni_reference_task_type = "reference";
  if (input.mode === "edit") payload.omni_reference_task_type = "edit";
  if (input.mode === "extend") payload.omni_reference_task_type = "extend";

  const { response, data } = await callProvider("", apiKey, { method: "POST", body: payload });
  if (!response.ok || !data?.id) {
    const detail = providerError(data, "تعذر بدء مهمة الفيديو.");
    return json(res, response.ok ? 502 : (response.status || 502), {
      ok: false,
      code: "SEEDANCE_CREATE_FAILED",
      error: detail,
      retryable: TRANSIENT_ERROR.test(detail)
    });
  }

  return json(res, 202, {
    ok: true,
    task: toTask(data),
    capabilities: {
      model: MODEL,
      duration: { min: MIN_DURATION, max: MAX_DURATION },
      resolutions: ["480p", "720p"],
      frameRate: 24,
      maxReferences: { images: MAX_IMAGES, videos: MAX_VIDEOS, audio: MAX_AUDIO, total: MAX_REFERENCES }
    }
  });
}

async function getTask(req, res, body, apiKey) {
  const accessError = requireAccessCode(req, body);
  if (accessError) return json(res, 401, { ok: false, code: "ACCESS_DENIED", error: accessError });
  const taskId = String(body.taskId || "").trim();
  if (!validTaskId(taskId)) return json(res, 400, { ok: false, code: "INVALID_TASK_ID", error: "معرّف مهمة الفيديو غير صالح." });

  const { response, data } = await callProvider(`/${encodeURIComponent(taskId)}`, apiKey);
  if (!response.ok) {
    return json(res, response.status || 502, {
      ok: false,
      code: "SEEDANCE_STATUS_FAILED",
      error: providerError(data, "تعذر جلب حالة مهمة الفيديو.")
    });
  }
  return json(res, 200, { ok: true, task: toTask(data) });
}

async function cancelTask(req, res, body, apiKey) {
  const accessError = requireAccessCode(req, body);
  if (accessError) return json(res, 401, { ok: false, code: "ACCESS_DENIED", error: accessError });
  const taskId = String(body.taskId || "").trim();
  if (!validTaskId(taskId)) return json(res, 400, { ok: false, code: "INVALID_TASK_ID", error: "معرّف مهمة الفيديو غير صالح." });

  const { response, data } = await callProvider(`/${encodeURIComponent(taskId)}`, apiKey, { method: "DELETE" });
  if (!response.ok) {
    return json(res, response.status || 502, {
      ok: false,
      code: "SEEDANCE_CANCEL_FAILED",
      error: providerError(data, "تعذر إلغاء المهمة. يمكن إلغاء المهام الموجودة في قائمة الانتظار فقط.")
    });
  }
  return json(res, 200, { ok: true, taskId, status: "cancelled" });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Seedance-Access-Code");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "استخدم POST." });

  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return json(res, 503, {
        ok: false,
        code: "SEEDANCE_NOT_CONFIGURED",
        error: "لم يتم إعداد Seedance بعد. أضف SEEDANCE_API_KEY أو ARK_API_KEY إلى متغيرات Vercel ثم أعد النشر."
      });
    }

    const body = parseBody(req);
    const action = String(body.action || "create").trim().toLowerCase();
    if (action === "create") return createTask(req, res, body, apiKey);
    if (action === "status") return getTask(req, res, body, apiKey);
    if (action === "cancel") return cancelTask(req, res, body, apiKey);
    return json(res, 400, { ok: false, code: "INVALID_ACTION", error: "الإجراء المطلوب غير مدعوم." });
  } catch (error) {
    console.error("Seedance video gateway error:", error);
    return json(res, 500, { ok: false, code: "VIDEO_SERVER_ERROR", error: error?.message || "حدث خطأ غير متوقع أثناء معالجة الفيديو." });
  }
};

module.exports._test = {
  MODEL,
  validateCreate,
  buildContent,
  toTask,
  resetRateLimit() { requestWindows.clear(); }
};
