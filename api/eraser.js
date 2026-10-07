"use strict";

/* ===========================================================================
   SPARTA AI — Smart Eraser gateway (object removal / inpainting)

   The browser paints a mask over the area that must disappear and posts the
   image + mask here. This function keeps every provider key on the server and
   talks to the first configured inpainting engine:

     1. Replicate   — REPLICATE_API_TOKEN  (+ optional REPLICATE_API_KEY)
     2. OpenAI      — OPENAI_API_KEY       (gpt-image-1 / dall-e-2 edits)
     3. HuggingFace — HF_API_TOKEN         (+ optional HUGGINGFACE_TOKEN)

   Mask convention (kept identical to the upstream models): white pixels are
   removed, black pixels are preserved.

   MiniMax is deliberately NOT used here: image-01 exposes only subject
   reference, with no mask/inpainting field, so it cannot honour a mask.
   =========================================================================== */

const crypto = require("crypto");

const PROVIDER_TIMEOUT_MS = Number(process.env.ERASER_TIMEOUT_MS || 60_000) || 60_000;
const POLL_INTERVAL_MS = 1200;
const POLL_BUDGET_MS = Math.min(PROVIDER_TIMEOUT_MS, 110_000);
/* Hard ceiling for one HTTP request, so a slow engine cannot eat the whole
   serverless budget and starve the fallback engines. */
const REQUEST_BUDGET_MS = Math.min(PROVIDER_TIMEOUT_MS, 115_000);

const MAX_DATA_URL_CHARS = 12_000_000; /* ~9 MB of binary — Vercel allows 4.5 MB bodies by default */
const MAX_PROMPT_CHARS = 1200;
const MAX_EDGE_FEATHER_PX = 24;

const DEFAULT_ENGINES = ["replicate", "openai", "huggingface"];

const REPLICATE_URL = "https://api.replicate.com/v1";
const OPENAI_URL = "https://api.openai.com/v1/images/edits";
const HF_URL = "https://api-inference.huggingface.co/models";

/* Both models take { image, mask, prompt }. LaMa is the classic object-remover
   (no prompt needed); Ideogram v2 repaints the region from the prompt. */
const DEFAULT_REPLICATE_MODEL = "cjwbw/la-ma:922c7bb67b87ec32cbc9fd1cccfd22930270f625b445c39cc0c793cc17b5e3d";
const DEFAULT_OPENAI_MODEL = "gpt-image-1";
/* Hugging Face is the third fallback. Point HF_ERASER_MODEL at whichever
   inpainting model you host; it must be a model (not a Space) that accepts
   { image, mask } on the Inference API and returns an image. The value below
   is a starting point and may need replacing for your account. */
const DEFAULT_HF_ERASER_MODEL = "Sanster/LaMa";

const TRANSIENT_ERROR = /timeout|temporar|internal|server error|service unavailable|rate limit|overloaded|502|503|504/i;

/* Best-effort protection for an expensive public endpoint. Memory-only, so it
   is a safety belt rather than a replacement for real authentication. */
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
    throw new Error("تعذر قراءة بيانات طلب الممحاة.");
  }
}

function safeEqual(first, second) {
  if (typeof first !== "string" || typeof second !== "string") return false;
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAccessCode(req, body) {
  const expected = String(process.env.ERASER_ACCESS_CODE || "").trim();
  if (!expected) return null;
  const headers = req.headers || {};
  const supplied = String(body.accessCode || headers["x-eraser-access-code"] || "").trim();
  if (safeEqual(expected, supplied)) return null;
  return "رمز الوصول إلى أداة الإزالة غير صحيح أو مفقود.";
}

function getClientKey(req) {
  const headers = req.headers || {};
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(headers["x-real-ip"] || "unknown").trim() || "unknown";
}

function enforceLimit(req) {
  const limit = Math.max(1, Math.min(60, Number(process.env.ERASER_MAX_REQUESTS_PER_HOUR || process.env.ERASER_MAX_PER_HOUR || 20) || 20));
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

/* ---------- input validation ---------- */

const DATA_URL_PATTERN = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i;

function readDataUrl(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return { error: `${label} مطلوبة.` };
  const match = DATA_URL_PATTERN.exec(raw);
  if (!match) return { error: `${label} يجب أن تكون صورة بصيغة data URL.` };
  if (raw.length > MAX_DATA_URL_CHARS) {
    return { error: `${label} كبيرة جدًا. قلّل أبعاد الصورة ثم أعد المحاولة.` };
  }
  const mimeType = match[1].toLowerCase();
  if (!/^image\//.test(mimeType)) return { error: `${label} ليست صورة صالحة.` };
  const payload = match[2].replace(/\s+/g, "");
  if (!payload) return { error: `${label} فارغة.` };
  return { mimeType, base64: payload, chars: raw.length };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeEdgeFeather(value) {
  return clampNumber(value, 0, MAX_EDGE_FEATHER_PX, 2);
}

function normalizeEngines(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const wanted = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return DEFAULT_ENGINES.slice();
  const valid = wanted.filter((name) => DEFAULT_ENGINES.includes(name));
  return valid.length ? valid : DEFAULT_ENGINES.slice();
}

function buildInpaintPrompt(userPrompt) {
  const extra = String(userPrompt || "").trim().slice(0, MAX_PROMPT_CHARS);
  const base =
    "Remove the masked object completely and reconstruct the hidden area so it continues the " +
    "surrounding background naturally. Keep the original lighting, colour palette, perspective, " +
    "shadows, texture and depth of field. No new objects, no people, no text, no watermark.";
  return extra ? `${base}\n\nDesired fill for the masked area: ${extra}` : base;
}

function getProviderKeys() {
  return {
    replicate: String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || "").trim(),
    openai: String(process.env.OPENAI_API_KEY || "").trim(),
    huggingface: String(process.env.HF_API_TOKEN || process.env.HUGGINGFACE_TOKEN || "").trim()
  };
}

function getModels() {
  return {
    replicate: String(process.env.REPLICATE_ERASER_MODEL || "").trim() || DEFAULT_REPLICATE_MODEL,
    openai: String(process.env.OPENAI_ERASER_MODEL || "").trim() || DEFAULT_OPENAI_MODEL,
    huggingface: String(process.env.HF_ERASER_MODEL || "").trim() || DEFAULT_HF_ERASER_MODEL
  };
}

/* Keeps the order the caller asked for, then appends any other configured
   engine so a single failure still produces a result. */
function resolveProvider(requestedEngines, keys) {
  const queue = [];
  for (const engine of requestedEngines) {
    if (keys[engine] && !queue.includes(engine)) queue.push(engine);
  }
  for (const engine of DEFAULT_ENGINES) {
    if (keys[engine] && !queue.includes(engine)) queue.push(engine);
  }
  return queue;
}

/* ---------- HTTP helper ---------- */

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      },
      { once: true }
    );
  });
}

async function requestJson(url, options, signal) {
  const response = await fetch(url, { ...options, signal });
  const text = typeof response.text === "function" ? await response.text() : "";
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, text, data };
}

function errorFromText(text, data) {
  if (data) {
    const nested = data.error && (data.error.message || data.error.detail || data.error);
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object" && nested.message) return String(nested.message);
    if (data.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    if (data.message) return String(data.message);
  }
  return String(text || "").slice(0, 400);
}

/* ---------- response normalization ---------- */

function toDataUrl(base64, mimeType) {
  const clean = String(base64 || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
  if (!clean) return "";
  return `data:${mimeType || "image/png"};base64,${clean}`;
}

function extractImage(data, mimeType) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output === "string" && /^(https?:|data:)/i.test(data.output)) return data.output;
  if (Array.isArray(data.output)) {
    const first = data.output.find((item) => typeof item === "string" && /^(https?:|data:)/i.test(item));
    if (first) return first;
  }
  if (Array.isArray(data.data) && data.data.length) {
    const item = data.data[0];
    if (typeof item === "string") return /^(https?:|data:)/i.test(item) ? item : toDataUrl(item, mimeType);
    if (item && typeof item === "object") {
      if (typeof item.url === "string") return item.url;
      if (typeof item.b64_json === "string") return toDataUrl(item.b64_json, mimeType);
      if (typeof item.image_base64 === "string") return toDataUrl(item.image_base64, mimeType);
    }
  }
  if (typeof data.b64_json === "string") return toDataUrl(data.b64_json, mimeType);
  if (typeof data.image_base64 === "string") return toDataUrl(data.image_base64, mimeType);
  if (typeof data.url === "string") return data.url;
  if (typeof data.image === "string") return data.image;
  return "";
}

/* ---------- providers ---------- */

async function runReplicate(keys, models, payload, signal, deadlineAt) {
  const created = await requestJson(
    `${REPLICATE_URL}/predictions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keys.replicate}`,
        Prefer: "wait"
      },
      body: JSON.stringify({
        version: models.replicate.includes(":") ? models.replicate.split(":")[1] : models.replicate,
        input: {
          image: payload.image,
          mask: payload.mask,
          prompt: payload.prompt
        }
      })
    },
    signal
  );

  if (!created.response.ok) {
    const error = new Error(errorFromText(created.text, created.data) || "رفض Replicate طلب الإزالة.");
    error.transient = TRANSIENT_ERROR.test(error.message) || created.response.status >= 500;
    throw error;
  }

  const direct = extractImage(created.data);
  if (direct) return direct;

  const urls = [created.data?.urls?.get, created.data?.urls?.self].filter((value) => typeof value === "string");
  if (!urls.length) throw new Error("لم يُرجع Replicate نتيجة للمهمة.");

  const pollUrl = urls[0];
  const deadline = Math.min(Date.now() + POLL_BUDGET_MS, deadlineAt);
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS, signal);
    const polled = await requestJson(pollUrl, { headers: { Authorization: `Bearer ${keys.replicate}` } }, signal);
    const status = String(polled.data?.status || "").toLowerCase();
    if (status === "succeeded") {
      const result = extractImage(polled.data);
      if (!result) throw new Error("اكتملت مهمة Replicate بدون صورة.");
      return result;
    }
    if (status === "failed" || status === "canceled") {
      const error = new Error(String(polled.data?.error || "فشلت مهمة الإزالة على Replicate."));
      error.transient = TRANSIENT_ERROR.test(error.message);
      throw error;
    }
  }
  const timeout = new Error("انتهت مهلة انتظار نتيجة الإزالة من Replicate.");
  timeout.transient = true;
  throw timeout;
}

async function runOpenAi(keys, models, payload, signal, _deadlineAt) {
  const form = new FormData();
  form.append("model", models.openai);
  form.append("prompt", payload.prompt);
  form.append("size", "1024x1024");
  form.append("n", "1");
  form.append(
    "image",
    new Blob([Buffer.from(payload.imageBase64, "base64")], { type: payload.imageMime }),
    "source.png"
  );
  form.append(
    "mask",
    new Blob([Buffer.from(payload.maskBase64, "base64")], { type: "image/png" }),
    "mask.png"
  );

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${keys.openai}` },
    body: form,
    signal
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(errorFromText(text, data) || "رفض OpenAI طلب الإزالة.");
    error.transient = TRANSIENT_ERROR.test(error.message) || response.status >= 500;
    throw error;
  }
  const result = extractImage(data, "image/png");
  if (!result) throw new Error("لم يُرجع OpenAI صورة بعد الإزالة.");
  return result;
}

async function runHuggingFace(keys, models, payload, signal, _deadlineAt) {
  const response = await fetch(`${HF_URL}/${models.huggingface}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys.huggingface}`
    },
    body: JSON.stringify({
      inputs: { image: payload.image, mask: payload.mask },
      parameters: { prompt: payload.prompt }
    }),
    signal
  });

  if (!response.ok) {
    const text = typeof response.text === "function" ? await response.text() : "";
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    const error = new Error(errorFromText(text, data) || "رفض Hugging Face طلب الإزالة.");
    error.transient = TRANSIENT_ERROR.test(error.message) || response.status >= 500;
    throw error;
  }

  const contentType = String(response.headers?.get?.("content-type") || "application/json");
  if (/application\/json/i.test(contentType)) {
    const data = await response.json();
    const result = extractImage(data, "image/png");
    if (!result) throw new Error("لم يُرجع Hugging Face صورة بعد الإزالة.");
    return result;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("استجابة Hugging Face فارغة.");
  return toDataUrl(buffer.toString("base64"), "image/png");
}

const RUNNERS = {
  replicate: runReplicate,
  openai: runOpenAi,
  huggingface: runHuggingFace
};

async function callProvider(engine, keys, models, payload, deadlineAt) {
  const remaining = Math.max(1000, deadlineAt - Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(PROVIDER_TIMEOUT_MS, remaining));
  try {
    return await RUNNERS[engine](keys, models, payload, controller.signal, Date.now() + Math.min(PROVIDER_TIMEOUT_MS, remaining));
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error(`انتهت مهلة الاتصال بمحرك ${engine}.`);
      timeout.transient = true;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- handler ---------- */

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Eraser-Access-Code");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "الطريقة غير مدعوم." });

  try {
    const body = parseBody(req);

    const accessError = requireAccessCode(req, body);
    if (accessError) return json(res, 403, { ok: false, code: "ACCESS_DENIED", error: accessError });

    const image = readDataUrl(body.image, "الصورة الأصلية");
    if (image.error) return json(res, 400, { ok: false, code: "INVALID_IMAGE", error: image.error });

    const mask = readDataUrl(body.mask, "قناع التحديد");
    if (mask.error) return json(res, 400, { ok: false, code: "INVALID_MASK", error: mask.error });

    const limit = enforceLimit(req);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return json(res, 429, {
        ok: false,
        code: "RATE_LIMITED",
        retryAfterSeconds: limit.retryAfterSeconds,
        error: "تجاوزت عدد محاولات الإزالة المسموح بها خلال الساعة. حاول لاحقًا."
      });
    }

    const keys = getProviderKeys();
    const engines = resolveProvider(normalizeEngines(body.engine), keys);
    if (!engines.length) {
      return json(res, 503, {
        ok: false,
        code: "ERASER_NOT_CONFIGURED",
        error:
          "لم يتم إعداد محرك إزالة بعد. أضف REPLICATE_API_TOKEN أو OPENAI_API_KEY أو HF_API_TOKEN إلى متغيرات Vercel ثم أعد النشر."
      });
    }

    const models = getModels();
    const payload = {
      image: body.image,
      mask: body.mask,
      imageBase64: image.base64,
      maskBase64: mask.base64,
      imageMime: image.mimeType,
      prompt: buildInpaintPrompt(body.prompt),
      edgeFeather: normalizeEdgeFeather(body.edgeFeather)
    };

    const failures = [];
    const startedAt = Date.now();
    for (const engine of engines) {
      /* Never start an engine that cannot finish inside the request budget. */
      if (Date.now() - startedAt > REQUEST_BUDGET_MS - 8000 && failures.length) break;
      try {
        const resultUrl = await callProvider(engine, keys, models, payload, startedAt + REQUEST_BUDGET_MS);
        return json(res, 200, {
          ok: true,
          provider: engine,
          model: models[engine],
          image: resultUrl,
          fallbackUsed: failures.length > 0,
          attempts: [
            ...failures.map((item) => ({ provider: item.provider, ok: false, error: item.error })),
            { provider: engine, ok: true }
          ]
        });
      } catch (error) {
        console.error(`Eraser provider ${engine} failed:`, error?.message || error);
        failures.push({ provider: engine, error: String(error?.message || "خطأ غير معروف").slice(0, 300) });
        /* Every configured engine gets its turn: one provider rejecting the
           prompt must not hide a working second provider. */
      }
    }

    const transient = failures.some((item) => TRANSIENT_ERROR.test(item.error));
    return json(res, transient ? 504 : 502, {
      ok: false,
      code: transient ? "ERASER_UNREACHABLE" : "ERASER_PROVIDER_ERROR",
      retryable: transient,
      error: failures[0]?.error || "تعذّرت إزالة العنصر عبر المحركات المتاحة.",
      attempts: failures
    });
  } catch (error) {
    console.error("Eraser gateway error:", error);
    return json(res, 500, {
      ok: false,
      code: "ERASER_SERVER_ERROR",
      error: error?.message || "حدث خطأ غير متوقع أثناء إزالة العنصر."
    });
  }
};

module.exports._test = {
  readDataUrl,
  normalizeEngines,
  resolveProvider,
  buildInpaintPrompt,
  normalizeEdgeFeather,
  extractImage,
  requireAccessCode,
  resetRateLimit() {
    requestWindows.clear();
  }
};
