"use strict";

/* ===========================================================================
   SPARTA AI — Seedance 2.5 video gateway

   This function keeps the licensed BytePlus / ModelArk key on the server.
   It intentionally pins every request to the current Seedance 2.5 model
   version — callers cannot choose a different model.
   =========================================================================== */

const crypto = require("crypto");

/* Model IDs carry a release-date suffix that BytePlus rotates. A stale ID is a
   silent production failure, so both the model and the regional base URL can be
   corrected from the environment without shipping new code. */
const DEFAULT_MODEL = "dreamina-seedance-2-5-260628";
const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const PROVIDER_TIMEOUT_MS = 25_000;

function getModel() {
  const value = String(process.env.SEEDANCE_MODEL || process.env.ARK_VIDEO_MODEL || "").trim();
  return /^[A-Za-z0-9._-]{3,120}$/.test(value) ? value : DEFAULT_MODEL;
}

function getBaseUrl() {
  const raw = String(process.env.SEEDANCE_BASE_URL || process.env.ARK_BASE_URL || "").trim();
  if (!raw) return DEFAULT_BASE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function getTasksUrl() {
  return `${getBaseUrl()}/contents/generations/tasks`;
}

/* Kept as a named export for the test-suite and for callers that still read the
   pinned default. Runtime code must call getModel(). */
const MODEL = DEFAULT_MODEL;

/* Seedance 2.5 natively supports a single continuous 30s segment. The old
   [5, 15] window was a tool-layer artifact of an earlier integration, not a
   model limit, so this gateway honours the real [4, 30] range and defaults to
   the maximum native capability. */
const MIN_DURATION = 4;
const MAX_DURATION = 30;
const DEFAULT_DURATION = 30;
/* If the upstream tool layer ever re-imposes the legacy cap we fall back to a
   two-segment extension plan instead of silently shortening the video. */
const LEGACY_CAP_SECONDS = 15;
const DURATION_CAP_ERROR = /duration/i;
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
  const limit = Math.max(1, Math.min(60, Number(process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR || 10) || 10));
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

/* Clamp instead of rejecting: a request for 60s is a request for "as long as
   possible", and a request for 2s is a request for "as short as possible".
   The caller is told exactly what was changed through `notes`. */
function normalizeDuration(raw) {
  const notes = [];

  if (raw === undefined || raw === null || raw === "") {
    return { duration: DEFAULT_DURATION, notes };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: `المدة يجب أن تكون رقمًا بين ${MIN_DURATION} و${MAX_DURATION} ثانية.` };
  }

  let duration = Math.round(value);
  if (duration !== value) {
    notes.push({ code: "DURATION_ROUNDED", message: `تم تقريب المدة إلى ${duration} ثانية.` });
  }
  if (duration > MAX_DURATION) {
    duration = MAX_DURATION;
    notes.push({
      code: "DURATION_CAPPED",
      message: `الحد الأقصى الفعلي لنموذج Seedance 2.5 هو ${MAX_DURATION} ثانية، لذلك تم ضبط المدة على ${MAX_DURATION} ثانية.`
    });
  } else if (duration < MIN_DURATION) {
    duration = MIN_DURATION;
    notes.push({
      code: "DURATION_RAISED",
      message: `الحد الأدنى لنموذج Seedance 2.5 هو ${MIN_DURATION} ثوانٍ، لذلك تم رفع المدة إلى ${MIN_DURATION} ثوانٍ.`
    });
  }

  return { duration, notes };
}

/* The addendum is explicit: attached references are authoritative inputs, not
   mood boards. This directive travels with the prompt so the model is told so. */
function referenceFidelityDirective(references, mode) {
  if (!references.length) return "";

  const lines = ["Reference fidelity (authoritative inputs — do not reinterpret):"];
  const hasImages = references.some((reference) => reference.type === "image");
  const hasVideos = references.some((reference) => reference.type === "video");

  if (hasImages) {
    lines.push(
      "Use the attached image references as the exact visual source for the subjects and scenes they are mapped to. Preserve identity, proportions, colors, textures, clothing, accessories, environment and composition. Do not substitute a generic look-alike."
    );
  }
  if (hasVideos) {
    lines.push(
      "Use the attached video references as the direct motion, choreography and camera reference. Follow their action order, timing, rhythm and camera movement closely. Do not invent a different choreography."
    );
  }
  if (mode === "edit" || mode === "extend") {
    lines.push(
      "Preserve the source video's scene, framing and continuity. Apply only the changes explicitly requested."
    );
  }
  lines.push("Apply only the changes explicitly requested in the prompt above.");

  return lines.join("\n");
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

  const sections = [prompt.trim()];
  if (mapping.length) sections.push(`Reference mapping:\n${mapping.join("\n")}`);
  const fidelity = referenceFidelityDirective(references, mode);
  if (fidelity) sections.push(fidelity);

  const content = [{ type: "text", text: sections.join("\n\n") }];

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
  const requestedRatio = String(body.ratio || "16:9").trim();
  const resolution = String(body.resolution || "720p").trim();

  if (!prompt) return { error: "اكتب وصف الفيديو أولًا." };
  if (prompt.length > MAX_PROMPT_CHARS) return { error: "وصف الفيديو طويل جدًا. اختصره إلى 6,000 حرف أو أقل." };
  if (!RATIOS.has(requestedRatio)) return { error: "نسبة الأبعاد غير مدعومة." };
  if (!RESOLUTIONS.has(resolution)) return { error: "Seedance 2.5 يدعم 480p أو 720p في هذا التكامل." };

  const referenceResult = validateReferences(body.references, mode);
  if (referenceResult.error) return referenceResult;

  let ratio = requestedRatio;
  if (mode === "first-frame" || mode === "first-last" || mode === "edit" || mode === "extend") {
    ratio = "adaptive";
  }

  /* Edit tasks always inherit the source video's duration (-1). */
  let duration = -1;
  let notes = [];
  if (mode !== "edit") {
    const normalized = normalizeDuration(body.duration);
    if (normalized.error) return { error: normalized.error };
    duration = normalized.duration;
    notes = normalized.notes;
  }

  return {
    prompt,
    mode,
    ratio,
    duration,
    notes,
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
    model: String(task.model || getModel()),
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let response;
  let raw = "";
  try {
    response = await fetch(`${getTasksUrl()}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (typeof response.text === "function") {
      raw = await response.text();
    } else if (typeof response.json === "function") {
      /* Minimal Response-likes (tests, some polyfills) expose json() only. */
      raw = JSON.stringify((await response.json()) ?? {});
    }
  } catch (error) {
    const aborted = error?.name === "AbortError";
    const err = new Error(
      aborted
        ? "انتهت مهلة الاتصال بخدمة Seedance. حاول مرة أخرى."
        : `تعذر الوصول إلى خدمة Seedance: ${error?.message || "خطأ في الشبكة"}`
    );
    err.transient = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      /* The gateway occasionally answers with an HTML error page (bad base URL,
         proxy, WAF). Surface a trimmed excerpt instead of a blank message. */
      data = { __nonJson: raw.replace(/\s+/g, " ").trim().slice(0, 300) };
    }
  }
  return { response, data };
}

function providerError(data, fallback) {
  const detail =
    data?.error?.message ||
    data?.message ||
    data?.base_resp?.status_msg ||
    data?.__nonJson ||
    fallback ||
    "تعذر الاتصال بخدمة Seedance.";
  const code = data?.error?.code ? ` (${data.error.code})` : "";
  return `${String(detail).trim()}${code}`;
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

  const model = getModel();
  const payload = {
    model,
    content: buildContent(input.prompt, input.references, input.mode),
    ratio: input.ratio,
    duration: input.duration,
    resolution: input.resolution,
    generate_audio: input.generateAudio,
    watermark: input.watermark,
    return_last_frame: input.returnLastFrame
  };

  /* omni_reference_task_type is a Seedance 2.5 only hint. Sending it to another
     model version would be rejected, so it is gated on the active model. */
  if (/seedance-2-5/.test(model)) {
    if (input.mode === "reference") payload.omni_reference_task_type = "reference";
    if (input.mode === "edit") payload.omni_reference_task_type = "edit";
    if (input.mode === "extend") payload.omni_reference_task_type = "extend";
  }

  const { response, data } = await callProvider("", apiKey, { method: "POST", body: payload });
  if (!response.ok || !data?.id) {
    const detail = providerError(data, "تعذر بدء مهمة الفيديو.");
    const body400 = {
      ok: false,
      code: "SEEDANCE_CREATE_FAILED",
      error: detail,
      retryable: TRANSIENT_ERROR.test(detail)
    };

    /* A legacy duration cap upstream must never silently shorten the result:
       hand the caller a concrete two-segment extension plan instead. */
    if (input.duration > LEGACY_CAP_SECONDS && DURATION_CAP_ERROR.test(detail)) {
      body400.code = "SEEDANCE_DURATION_CAPPED";
      body400.fallback = {
        strategy: "extend",
        reason: `رفضت طبقة الخدمة المدة ${input.duration} ثانية رغم أن النموذج يدعمها. يمكن إنتاجها على مقطعين متصلين.`,
        segments: [LEGACY_CAP_SECONDS, Math.min(MAX_DURATION, input.duration) - LEGACY_CAP_SECONDS]
      };
    }

    return json(res, response.ok ? 502 : (response.status || 502), body400);
  }

  return json(res, 202, {
    ok: true,
    task: toTask(data),
    notes: input.notes,
    capabilities: {
      model,
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
    const body = parseBody(req);
    const action = String(body.action || "create").trim().toLowerCase();

    /* A key-free probe so the studio can tell the user exactly what is missing
       instead of failing on the first (expensive) generate click. */
    if (action === "health") {
      return json(res, 200, {
        ok: true,
        configured: Boolean(apiKey),
        model: getModel(),
        baseUrl: getBaseUrl(),
        accessCodeRequired: Boolean(String(process.env.SEEDANCE_ACCESS_CODE || "").trim()),
        capabilities: {
          duration: { min: MIN_DURATION, max: MAX_DURATION },
          resolutions: ["480p", "720p"],
          frameRate: 24,
          maxReferences: { images: MAX_IMAGES, videos: MAX_VIDEOS, audio: MAX_AUDIO, total: MAX_REFERENCES }
        },
        error: apiKey
          ? ""
          : "لم يتم إعداد Seedance بعد. أضف SEEDANCE_API_KEY أو ARK_API_KEY إلى متغيرات البيئة ثم أعد النشر."
      });
    }

    if (!apiKey) {
      return json(res, 503, {
        ok: false,
        code: "SEEDANCE_NOT_CONFIGURED",
        error: "لم يتم إعداد Seedance بعد. أضف SEEDANCE_API_KEY أو ARK_API_KEY إلى متغيرات Vercel ثم أعد النشر."
      });
    }

    /* These must be awaited: returning the promise directly would let a
       rejection escape this try/catch and leave the request without a
       response until the platform times it out. */
    if (action === "create") return await createTask(req, res, body, apiKey);
    if (action === "status") return await getTask(req, res, body, apiKey);
    if (action === "cancel") return await cancelTask(req, res, body, apiKey);
    return json(res, 400, { ok: false, code: "INVALID_ACTION", error: "الإجراء المطلوب غير مدعوم." });
  } catch (error) {
    console.error("Seedance video gateway error:", error);
    if (error?.transient) {
      return json(res, 504, {
        ok: false,
        code: "SEEDANCE_UNREACHABLE",
        error: error.message,
        retryable: true
      });
    }
    return json(res, 500, { ok: false, code: "VIDEO_SERVER_ERROR", error: error?.message || "حدث خطأ غير متوقع أثناء معالجة الفيديو." });
  }
};

module.exports._test = {
  MODEL,
  validateCreate,
  normalizeDuration,
  buildContent,
  toTask,
  resetRateLimit() { requestWindows.clear(); }
};
