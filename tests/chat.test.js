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

test("surfaces generic MiniMax business errors returned with HTTP 200", async (t) => {
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
  global.fetch = async () => mockFetchResponse({
    base_resp: {
      status_code: 1002,
      status_msg: "rate limit reached"
    }
  });

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.code, "MINIMAX_API_ERROR");
  assert.equal(result.body.upstreamCode, 1002);
  assert.match(result.body.error, /rate limit reached/);
});

test("detects the insufficient-balance wording even with an unexpected code", async (t) => {
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

  process.env.MINIMAX_API_KEY = "minimax-empty-balance-key";
  delete process.env.GROQ_API_KEY;

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

  assert.equal(result.body.code, "MINIMAX_INSUFFICIENT_BALANCE");
  assert.equal(result.body.upstreamCode, 1004);
  assert.match(result.body.error, /account balance is insufficient/);
  assert.match(result.body.error, /platform\.minimax\.io/);
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

test("falls back to Groq when MiniMax balance is empty (402 / 1008)", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousFallbackFlag = process.env.MINIMAX_GROQ_FALLBACK;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
    if (previousFallbackFlag === undefined) delete process.env.MINIMAX_GROQ_FALLBACK;
    else process.env.MINIMAX_GROQ_FALLBACK = previousFallbackFlag;
  });

  process.env.MINIMAX_API_KEY = "minimax-empty-balance-key";
  process.env.GROQ_API_KEY = "groq-rescue-key";
  delete process.env.MINIMAX_GROQ_FALLBACK;

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("minimax")) {
      return mockFetchResponse(
        {
          base_resp: {
            status_code: 1008,
            status_msg: "insufficient balance"
          }
        },
        402
      );
    }
    return mockFetchResponse({
      choices: [{ message: { content: "رد Groq البديل" } }],
      usage: { total_tokens: 9 }
    });
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(calls[0].url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(calls[1].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[1].options.headers.Authorization, "Bearer groq-rescue-key");

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.provider, "groq");
  assert.equal(result.body.reply, "رد Groq البديل");
  assert.ok([ "openai/gpt-oss-120b", "openai/gpt-oss-20b" ].includes(result.body.model));
  assert.equal(result.body.notice.type, "billing");
  assert.match(result.body.notice.text, /MiniMax/);
});

test("explains the billing cause when MiniMax fails and no Groq key exists", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousFallbackFlag = process.env.MINIMAX_GROQ_FALLBACK;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
    if (previousFallbackFlag === undefined) delete process.env.MINIMAX_GROQ_FALLBACK;
    else process.env.MINIMAX_GROQ_FALLBACK = previousFallbackFlag;
  });

  process.env.MINIMAX_API_KEY = "minimax-empty-balance-key";
  delete process.env.GROQ_API_KEY;
  delete process.env.MINIMAX_GROQ_FALLBACK;

  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return mockFetchResponse(
      {
        base_resp: {
          status_code: 1008,
          status_msg: "insufficient balance"
        }
      },
      402
    );
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 402);
  assert.equal(result.body.code, "MINIMAX_INSUFFICIENT_BALANCE");
  assert.match(result.body.error, /insufficient balance/);
  assert.match(result.body.error, /MINIMAX_API_KEY/);
  assert.equal(result.body.upstreamCode, 1008);
  assert.equal(result.body.notice.type, "billing");
  assert.match(result.body.notice.text, /GROQ_API_KEY/);
});

test("honours MINIMAX_GROQ_FALLBACK=false and keeps the billing error", async (t) => {
  const previousFetch = global.fetch;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousFallbackFlag = process.env.MINIMAX_GROQ_FALLBACK;

  t.after(() => {
    global.fetch = previousFetch;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
    if (previousFallbackFlag === undefined) delete process.env.MINIMAX_GROQ_FALLBACK;
    else process.env.MINIMAX_GROQ_FALLBACK = previousFallbackFlag;
  });

  process.env.MINIMAX_API_KEY = "minimax-empty-balance-key";
  process.env.GROQ_API_KEY = "groq-rescue-key";
  process.env.MINIMAX_GROQ_FALLBACK = "false";

  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return mockFetchResponse(
      {
        base_resp: {
          status_code: 1008,
          status_msg: "insufficient balance"
        }
      },
      402
    );
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 402);
  assert.equal(result.body.code, "MINIMAX_INSUFFICIENT_BALANCE");
  assert.equal(result.body.notice, undefined);
});

test("also falls back when MiniMax reports the empty balance with HTTP 200", async (t) => {
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

  process.env.MINIMAX_API_KEY = "minimax-empty-balance-key";
  process.env.GROQ_API_KEY = "groq-rescue-key";

  global.fetch = async (url) => {
    if (url.includes("minimax")) {
      return mockFetchResponse({
        base_resp: {
          status_code: 1008,
          status_msg: "insufficient balance"
        }
      });
    }
    return mockFetchResponse({
      choices: [{ message: { content: "رد Groq البديل" } }]
    });
  };

  const result = await invoke({
    model: "MiniMax-M3",
    messages: [{ role: "user", content: "مرحبًا" }]
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "groq");
  assert.equal(result.body.reply, "رد Groq البديل");
  assert.equal(result.body.notice.type, "billing");
});
