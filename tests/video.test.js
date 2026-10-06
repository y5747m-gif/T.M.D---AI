"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/video");

function createResponse() {
  const result = { status: 200, body: undefined, headers: {} };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
    end() { return this; }
  };
  return { response, result };
}

async function invoke(body, headers = {}) {
  const { response, result } = createResponse();
  await handler({ method: "POST", body, headers }, response);
  return result;
}

function mockFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function rememberEnvironment(t) {
  const before = {
    fetch: global.fetch,
    key: process.env.SEEDANCE_API_KEY,
    ark: process.env.ARK_API_KEY,
    access: process.env.SEEDANCE_ACCESS_CODE,
    rate: process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR
  };
  t.after(() => {
    global.fetch = before.fetch;
    for (const [name, value] of Object.entries({
      SEEDANCE_API_KEY: before.key,
      ARK_API_KEY: before.ark,
      SEEDANCE_ACCESS_CODE: before.access,
      SEEDANCE_MAX_REQUESTS_PER_HOUR: before.rate
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    handler._test.resetRateLimit();
  });
  handler._test.resetRateLimit();
}

test("creates a true 30-second task with the pinned Seedance 2.5 model", async (t) => {
  rememberEnvironment(t);
  process.env.SEEDANCE_API_KEY = "seedance-test-key";
  delete process.env.ARK_API_KEY;
  process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR = "10";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return mockFetchResponse({ id: "cgt-test-30", model: "dreamina-seedance-2-5-260628", status: "queued" }, 200);
  };

  const result = await invoke({
    action: "create",
    prompt: "A cinematic sunrise over a calm ocean, slow camera push in.",
    mode: "text",
    duration: 30,
    ratio: "16:9",
    resolution: "720p",
    generateAudio: true,
    watermark: false,
    references: []
  }, { "x-forwarded-for": "203.0.113.1" });

  assert.equal(result.status, 202);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.task.id, "cgt-test-30");
  assert.equal(request.url, "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks");
  assert.equal(request.options.headers.Authorization, "Bearer seedance-test-key");

  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, "dreamina-seedance-2-5-260628");
  assert.equal(payload.duration, 30);
  assert.equal(payload.ratio, "16:9");
  assert.equal(payload.resolution, "720p");
  assert.equal(payload.return_last_frame, true);
  assert.deepEqual(payload.content, [
    { type: "text", text: "A cinematic sunrise over a calm ocean, slow camera push in." }
  ]);
});

test("maps actual image references into the provider content and prompt mapping", async (t) => {
  rememberEnvironment(t);
  process.env.SEEDANCE_API_KEY = "seedance-test-key";
  process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR = "10";

  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return mockFetchResponse({ id: "cgt-reference", status: "queued" });
  };

  const result = await invoke({
    action: "create",
    prompt: "The traveller walks through the scene.",
    mode: "reference",
    duration: 12,
    ratio: "9:16",
    resolution: "480p",
    references: [
      {
        type: "image",
        source: "data:image/png;base64,AAAA",
        purpose: "Character identity and red coat; preserve the original composition.",
        name: "traveller.png"
      },
      {
        type: "audio",
        source: "https://example.com/ambience.mp3",
        purpose: "Use as quiet desert wind ambience.",
        name: "ambience.mp3"
      }
    ]
  }, { "x-forwarded-for": "203.0.113.2" });

  assert.equal(result.status, 202);
  assert.equal(payload.omni_reference_task_type, "reference");
  assert.match(payload.content[0].text, /@Image 1: Character identity/);
  assert.match(payload.content[0].text, /@Audio 2: Use as quiet/);
  assert.deepEqual(payload.content[1], {
    type: "image_url",
    image_url: { url: "data:image/png;base64,AAAA" },
    role: "reference_image"
  });
  assert.deepEqual(payload.content[2], {
    type: "audio_url",
    audio_url: { url: "https://example.com/ambience.mp3" },
    role: "reference_audio"
  });
});

test("enforces the Seedance 2.5 4–30 second range instead of a legacy 15 second cap", async (t) => {
  rememberEnvironment(t);
  process.env.SEEDANCE_API_KEY = "seedance-test-key";

  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return mockFetchResponse({});
  };

  const result = await invoke({
    action: "create",
    prompt: "A test video",
    mode: "text",
    duration: 31,
    ratio: "16:9",
    resolution: "720p",
    references: []
  }, { "x-forwarded-for": "203.0.113.3" });

  assert.equal(fetchCalled, false);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "INVALID_VIDEO_REQUEST");
  assert.match(result.body.error, /4.*30/);
});

test("uses adaptive ratio and matching source duration for video edit tasks", async (t) => {
  rememberEnvironment(t);
  process.env.SEEDANCE_API_KEY = "seedance-test-key";
  process.env.SEEDANCE_MAX_REQUESTS_PER_HOUR = "10";

  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return mockFetchResponse({ id: "cgt-edit", status: "queued" });
  };

  const result = await invoke({
    action: "create",
    prompt: "Edit the video and replace the sky with a sunset.",
    mode: "edit",
    duration: 18,
    ratio: "16:9",
    resolution: "720p",
    references: [{
      type: "video",
      source: "https://example.com/source.mp4",
      purpose: "Original scene and camera timing."
    }]
  }, { "x-forwarded-for": "203.0.113.4" });

  assert.equal(result.status, 202);
  assert.equal(payload.ratio, "adaptive");
  assert.equal(payload.duration, -1);
  assert.equal(payload.omni_reference_task_type, "edit");
  assert.equal(payload.content[1].role, "reference_video");
});

test("retrieves a completed task with its temporary video URL", async (t) => {
  rememberEnvironment(t);
  process.env.SEEDANCE_API_KEY = "seedance-test-key";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return mockFetchResponse({
      id: "cgt-complete",
      model: "dreamina-seedance-2-5-260628",
      status: "succeeded",
      duration: 30,
      content: {
        video_url: "https://example.com/output.mp4",
        last_frame_url: "https://example.com/last.png"
      }
    });
  };

  const result = await invoke({ action: "status", taskId: "cgt-complete" });
  assert.equal(result.status, 200);
  assert.equal(result.body.task.status, "succeeded");
  assert.equal(result.body.task.videoUrl, "https://example.com/output.mp4");
  assert.equal(result.body.task.lastFrameUrl, "https://example.com/last.png");
  assert.equal(request.url, "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-complete");
  assert.equal(request.options.method, "GET");
});
