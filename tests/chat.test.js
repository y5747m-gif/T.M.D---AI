"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/chat");

function createResponse() {
  const result = {
    status: 200,
    body: undefined,
    headers: {}
  };

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

async function invoke(body) {
  const { response, result } = createResponse();
  await handler(
    {
      method: "POST",
      body
    },
    response
  );
  return result;
}

function mockFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return body;
    }
  };
}

test("routes MiniMax M3 through the official MiniMax endpoint", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  });

  process.env.MINIMAX_API_KEY = "minimax-test-key";
  delete process.env.GROQ_API_KEY;

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return mockFetchResponse({
      model: "MiniMax-M3",
      choices: [
        {
          message: {
            content: "إجابة MiniMax"
          }
        }
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28
      }
    });
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [
      {
        role: "user",
        content: "اكتب مثالًا برمجيًا"
      }
    ]
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    reply: "إجابة MiniMax",
    provider: "minimax",
    model: "MiniMax-M3",
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28
    }
  });

  assert.equal(
    request.url,
    "https://api.minimax.io/v1/chat/completions"
  );
  assert.equal(
    request.options.headers.Authorization,
    "Bearer minimax-test-key"
  );

  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, "MiniMax-M3");
  assert.deepEqual(payload.thinking, { type: "disabled" });
  assert.equal(payload.stream, false);
  assert.equal(payload.messages[0].role, "system");
  assert.equal(payload.messages[1].content, "اكتب مثالًا برمجيًا");
});

test("keeps image requests on MiniMax when MiniMax M3 is selected", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
  });

  process.env.MINIMAX_API_KEY = "minimax-image-key";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return mockFetchResponse({
      choices: [{ message: { content: "تحليل الصورة" } }],
      usage: { total_tokens: 12 }
    });
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "ما هذه الصورة؟" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,AAAA"
            }
          }
        ]
      }
    ]
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "minimax");
  assert.equal(request.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(JSON.parse(request.options.body).model, "MiniMax-M3");
});

test("returns a clear error when the MiniMax key is missing", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  let fetchCalled = false;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
  });

  delete process.env.MINIMAX_API_KEY;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(fetchCalled, false);
  assert.equal(result.status, 500);
  assert.equal(result.body.code, "MISSING_MINIMAX_API_KEY");
  assert.match(result.body.error, /MINIMAX_API_KEY/);
});

test("surfaces MiniMax business errors returned with HTTP 200", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
  });

  process.env.MINIMAX_API_KEY = "minimax-test-key";
  global.fetch = async () => mockFetchResponse({
    base_resp: {
      status_code: 1004,
      status_msg: "account balance is insufficient"
    }
  });

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.code, "MINIMAX_API_ERROR");
  assert.equal(result.body.upstreamCode, 1004);
  assert.match(result.body.error, /account balance is insufficient/);
});

test("preserves the existing Groq route for Groq models", async (t) => {
  const previousFetch = global.fetch;
  const previousGroqKey = process.env.GROQ_API_KEY;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  });

  process.env.GROQ_API_KEY = "groq-test-key";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return mockFetchResponse({
      choices: [{ message: { content: "إجابة Groq" } }],
      usage: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7
      }
    });
  };

  const result = await invoke({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "groq");
  assert.equal(
    request.url,
    "https://api.groq.com/openai/v1/chat/completions"
  );
  assert.equal(
    JSON.parse(request.options.body).model,
    "openai/gpt-oss-20b"
  );
});
