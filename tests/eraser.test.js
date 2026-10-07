"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/eraser");

function createResponse() {
  const result = { status: 200, body: undefined, headers: {} };
  const response = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
  return { response, result };
}

async function invoke(body, headers = {}) {
  const { response, result } = createResponse();
  await handler({ method: "POST", body, headers }, response);
  return result;
}

/* 2x2 red PNG — real base64, so the data-URL parser exercises a real payload. */
const PIXELS =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAEQQBQSqkzGgAAAAASUVORK5CYII=";

function rememberEnvironment(t) {
  const before = {
    fetch: global.fetch,
    replicate: process.env.REPLICATE_API_TOKEN,
    openai: process.env.OPENAI_API_KEY,
    hf: process.env.HF_API_TOKEN,
    access: process.env.ERASER_ACCESS_CODE
  };
  t.after(() => {
    global.fetch = before.fetch;
    const restore = {
      REPLICATE_API_TOKEN: before.replicate,
      OPENAI_API_KEY: before.openai,
      HF_API_TOKEN: before.hf,
      ERASER_ACCESS_CODE: before.access
    };
    for (const [name, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    handler._test.resetRateLimit();
  });
  handler._test.resetRateLimit();
}

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || "application/json" },
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    }
  };
}

test("rejects a request without a source image", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  const result = await invoke({ mask: PIXELS });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "INVALID_IMAGE");
});

test("rejects a mask that is not a data URL", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  const result = await invoke({ image: PIXELS, mask: "https://example.com/mask.png" });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "INVALID_MASK");
});

test("refuses an oversized payload instead of hitting the body limit", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  const huge = `data:image/png;base64,${"A".repeat(13_000_000)}`;
  const result = await invoke({ image: huge, mask: PIXELS });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "INVALID_IMAGE");
});

test("reports a clear 503 when no eraser engine is configured", async (t) => {
  rememberEnvironment(t);
  delete process.env.REPLICATE_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HF_API_TOKEN;
  const result = await invoke({ image: PIXELS, mask: PIXELS });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "ERASER_NOT_CONFIGURED");
  assert.match(result.body.error, /REPLICATE_API_TOKEN/);
});

test("enforces the optional access code with a constant-time compare", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  process.env.ERASER_ACCESS_CODE = "owner-only";
  const denied = await invoke({ image: PIXELS, mask: PIXELS, accessCode: "wrong" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "ACCESS_DENIED");

  global.fetch = async () => jsonResponse({ output: "https://example.com/out.png" });
  const allowed = await invoke({ image: PIXELS, mask: PIXELS, accessCode: "owner-only" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.ok, true);
});

test("sends the mask convention Replicate expects: white = remove", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  delete process.env.OPENAI_API_KEY;
  delete process.env.HF_API_TOKEN;

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ output: ["https://example.com/cleaned.png"], status: "succeeded" });
  };

  const result = await invoke({ image: PIXELS, mask: PIXELS, prompt: "wooden wall" });
  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "replicate");
  assert.equal(result.body.image, "https://example.com/cleaned.png");
  assert.equal(result.body.fallbackUsed, false);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.replicate.com/v1/predictions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer r8-test");
  assert.equal(calls[0].options.headers.Prefer, "wait");

  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.version, "922c7bb67b87ec32cbc9fd1cccfd22930270f625b445c39cc0c793cc17b5e3d");
  assert.equal(sent.input.image, PIXELS);
  assert.equal(sent.input.mask, PIXELS);
  assert.match(sent.input.prompt, /Remove the masked object completely/);
  assert.match(sent.input.prompt, /wooden wall/);
});

test("polls an asynchronous Replicate prediction until it succeeds", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  delete process.env.OPENAI_API_KEY;
  delete process.env.HF_API_TOKEN;

  let polls = 0;
  global.fetch = async (url) => {
    if (String(url).endsWith("/predictions")) {
      return jsonResponse({ status: "starting", urls: { get: "https://api.replicate.com/v1/predictions/abc" } });
    }
    polls += 1;
    if (polls < 2) return jsonResponse({ status: "processing" });
    return jsonResponse({ status: "succeeded", output: "https://example.com/async.png" });
  };

  const result = await invoke({ image: PIXELS, mask: PIXELS });
  assert.equal(result.status, 200);
  assert.equal(result.body.image, "https://example.com/async.png");
  assert.ok(polls >= 2, "expected at least two status polls");
});

test("falls back to OpenAI when the first engine rejects the job", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.HF_API_TOKEN;

  const forms = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("replicate.com")) {
      return jsonResponse({ detail: "model not available on this plan" }, 422);
    }
    forms.push({ url: String(url), body: options.body });
    return jsonResponse({ data: [{ b64_json: "aGVsbG8=" }] });
  };

  const result = await invoke({ image: PIXELS, mask: PIXELS });
  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "openai");
  assert.equal(result.body.fallbackUsed, true);
  assert.equal(result.body.image, "data:image/png;base64,aGVsbG8=");
  assert.equal(result.body.attempts.length, 2);
  assert.equal(result.body.attempts[0].provider, "replicate");
  assert.equal(result.body.attempts[0].ok, false);

  assert.equal(forms.length, 1);
  assert.equal(forms[0].url, "https://api.openai.com/v1/images/edits");
  assert.equal(forms[0].body.get("model"), "gpt-image-1");
  assert.ok(forms[0].body.get("image") instanceof Blob, "OpenAI edits needs a binary image part");
  assert.ok(forms[0].body.get("mask") instanceof Blob, "OpenAI edits needs a binary mask part");
});

test("honours an explicit engine choice and skips the others", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  process.env.HF_API_TOKEN = "hf-test";

  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ data: [{ url: "https://example.com/hf.png" }] });
  };

  const result = await invoke({ image: PIXELS, mask: PIXELS, engine: "huggingface" });
  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "huggingface");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/api-inference\.huggingface\.co\/models\//);
});

test("returns 502 with every attempt when all engines fail", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.HF_API_TOKEN;

  global.fetch = async (url) => {
    if (String(url).includes("replicate.com")) return jsonResponse({ detail: "prompt rejected by moderation" }, 400);
    return jsonResponse({ error: { message: "mask must be a PNG with transparency" } }, 400);
  };

  const result = await invoke({ image: PIXELS, mask: PIXELS });
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "ERASER_PROVIDER_ERROR");
  assert.equal(result.body.attempts.length, 2);
  assert.equal(result.body.retryable, false);
});

test("rate limits a single IP within the hour", async (t) => {
  rememberEnvironment(t);
  process.env.REPLICATE_API_TOKEN = "r8-test";
  process.env.ERASER_MAX_REQUESTS_PER_HOUR = "2";
  delete process.env.OPENAI_API_KEY;
  delete process.env.HF_API_TOKEN;
  global.fetch = async () => jsonResponse({ output: "https://example.com/out.png" });

  const headers = { "x-forwarded-for": "203.0.113.9" };
  assert.equal((await invoke({ image: PIXELS, mask: PIXELS }, headers)).status, 200);
  assert.equal((await invoke({ image: PIXELS, mask: PIXELS }, headers)).status, 200);
  const blocked = await invoke({ image: PIXELS, mask: PIXELS }, headers);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, "RATE_LIMITED");
  assert.ok(blocked.body.retryAfterSeconds > 0);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);
});

test("unit helpers keep the mask semantics and prompt wording stable", () => {
  const parsed = handler._test.readDataUrl(PIXELS, "الصورة");
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.mimeType, "image/png");

  assert.equal(handler._test.normalizeEdgeFeather("999"), 24);
  assert.equal(handler._test.normalizeEdgeFeather("abc"), 2);

  assert.deepEqual(handler._test.normalizeEngines(""), ["replicate", "openai", "huggingface"]);
  assert.deepEqual(handler._test.normalizeEngines("openai, bogus"), ["openai"]);

  /* Only engines that actually have a key may enter the queue, in caller order. */
  const queue = handler._test.resolveProvider(["openai", "replicate"], {
    openai: "k",
    replicate: "k",
    huggingface: ""
  });
  assert.deepEqual(queue, ["openai", "replicate"]);

  const prompt = handler._test.buildInpaintPrompt("");
  assert.match(prompt, /No new objects, no people, no text/);

  assert.equal(handler._test.extractImage({ data: [{ b64_json: "QUJD" }] }, "image/png"), "data:image/png;base64,QUJD");
  assert.equal(handler._test.extractImage({ output: ["https://x/y.png"] }), "https://x/y.png");
});
