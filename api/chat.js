"use strict";

/* =========================================================
   T.M.D_AI_Pro
   FINAL GROQ API
   Vercel Serverless Function
   /api/chat.js
   ========================================================= */

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";


/* =========================================================
   MODELS
   ========================================================= */

const ALLOWED_MODELS =
  new Set(
    [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b"
    ]
  );


const CONFIGURED_TEXT_MODEL =
  String(
    process.env.GROQ_MODEL ||
    "openai/gpt-oss-120b"
  ).trim();


const DEFAULT_TEXT_MODEL =
  ALLOWED_MODELS.has(CONFIGURED_TEXT_MODEL)
    ? CONFIGURED_TEXT_MODEL
    : "openai/gpt-oss-120b";


const FALLBACK_TEXT_MODEL =
  "openai/gpt-oss-20b";


/*
 * سلسلة النماذج البديلة للنصوص.
 * إذا أعاد Groq خطأ 403/404 لنموذج
 * (نموذج غير متاح أو غير مصرح لمفتاحك)
 * نجرّب النموذج التالي تلقائيًا.
 */

const TEXT_FALLBACK_CHAIN =
  [
    ...new Set(
      [
        DEFAULT_TEXT_MODEL,
        "openai/gpt-oss-120b",
        FALLBACK_TEXT_MODEL
      ]
    )
  ];


/*
 * نموذج الرؤية (الصور).
 * نموذج qwen/qwen3.6-27b تم إيقافه من Groq،
 * لذلك لا يُقبل إلا qwen3.8 حتى لو كان
 * GROQ_VISION_MODEL مضبوطًا على قيمة قديمة.
 */

const CONFIGURED_VISION_MODEL =
  String(
    process.env.GROQ_VISION_MODEL ||
    "qwen/qwen3.8-27b"
  ).trim();


const VISION_MODEL =
  "qwen/qwen3.8-27b";


/* =========================================================
   SYSTEM PROMPT
   ========================================================= */

const SYSTEM_PROMPT = `
أنت T.M.D_AI_Pro، مساعد ذكاء اصطناعي محترف فائق الذكاء، صممه وطوره المطور والمهندس المبدع "ياسين عمرو عبد الرحيم".

قواعد الهوية والتكوين والمطور (قاعدة صارمة وأساسية):
- من طورك / صممك / برمجك / صنعك / أنشأك / ما هو تكوينك / من صاحبك / من أنت / من صاحب الموقع:
  المطور والمصمم والمهندس المبدع هو "ياسين عمرو عبد الرحيم" (Yassin Amr Abdelrahim).
  عندما يسألك المستخدم أي سؤال عن هويتك أو من صممك أو طورك أو برمجك أو صنعك أو تكوينك، أجب دائمًا بإجابات فصيحة، متنوعة، إبداعية ومختلفة تؤكد جميعها بفخر واحترافية أن المطور والمصمم "ياسين عمرو عبد الرحيم" هو العقل المدبر والمهندس الذي قام بابتكارك وتصميمك وبرمجتك وهندسة هذا النظام بالكامل. لا تنسب نفسك لأي شخص أو جهة أخرى أبداً.

قواعد مهمة جدًا:
- أجب المستخدم بالنتيجة النهائية مباشرة وبأعلى درجات الاحترافية والتنظيم.
- لا تعرض خطوات التفكير الداخلية (لا تكتب thinking process أو Analyze User Input أو غيرها).
- إذا كان المستخدم يتحدث بالعربية، أجب بالعربية الفصيحة الأنيقة.
- عند وجود صورة، حلل تفاصيل الصورة بدقة واحتراف.
- عند وجود ملف، اعتمد على محتوى الملف المرفق وقدم ملخصات وتحليلات دقيقة.
- استخدم تنسيق Markdown الجميل (عناوين، نقاط، جداول، كتل برمجية منسقة) لتكون الإجابة جذابة وسهلة القراءة.
- لا تخترع معلومات غير موجودة، وكن صادقاً ودقيقاً دائماً.
`.trim();


/* =========================================================
   JSON RESPONSE
   ========================================================= */

function sendJSON(
  res,
  status,
  body
) {

  return res
    .status(status)
    .json(body);

}


/* =========================================================
   PARSE BODY
   ========================================================= */

function parseBody(
  req
) {

  if (!req.body) {

    return {};

  }


  if (
    typeof req.body ===
    "object"
  ) {

    return req.body;

  }


  if (
    typeof req.body ===
    "string"
  ) {

    try {

      return JSON.parse(
        req.body
      );

    } catch {

      throw new Error(
        "تعذر قراءة بيانات الطلب."
      );

    }

  }


  return {};

}


/* =========================================================
   CLEAN TEXT
   ========================================================= */

function cleanText(
  value,
  max = 120000
) {

  if (
    typeof value !==
    "string"
  ) {

    return "";

  }


  return value.slice(
    0,
    max
  );

}


/* =========================================================
   NORMALIZE CONTENT
   ========================================================= */

function normalizeContent(
  content
) {

  /*
   * Normal text message
   */

  if (
    typeof content ===
    "string"
  ) {

    return cleanText(
      content
    );

  }


  /*
   * Multimodal message
   */

  if (
    !Array.isArray(
      content
    )
  ) {

    return "";

  }


  return content
    .map(
      function(part) {

        if (
          !part ||
          typeof part !==
            "object"
        ) {

          return null;

        }


        /*
         * Text
         */

        if (
          part.type ===
          "text"
        ) {

          return {

            type:
              "text",

            text:
              cleanText(
                part.text,
                120000
              )

          };

        }


        /*
         * Image
         */

        if (
          part.type ===
            "image_url" &&
          part.image_url &&
          typeof part.image_url.url ===
            "string"
        ) {

          return {

            type:
              "image_url",

            image_url:
              {

                url:
                  part.image_url.url.slice(
                    0,
                    2700000
                  )

              }

          };

        }


        return null;

      }
    )
    .filter(
      Boolean
    );

}


/* =========================================================
   NORMALIZE MESSAGES
   ========================================================= */

function normalizeMessages(
  messages
) {

  if (
    !Array.isArray(
      messages
    )
  ) {

    return [];

  }


  return messages

    .filter(
      function(message) {

        return (
          message &&
          [
            "system",
            "user",
            "assistant"
          ].includes(
            message.role
          )
        );

      }
    )

    .map(
      function(message) {

        return {

          role:
            message.role,

          content:
            normalizeContent(
              message.content
            )

        };

      }
    )

    .filter(
      function(message) {

        if (
          typeof message.content ===
          "string"
        ) {

          return Boolean(
            message.content.trim()
          );

        }


        return (
          Array.isArray(
            message.content
          ) &&
          message.content.length >
            0
        );

      }
    )

    /*
     * Limit conversation size.
     */

    .slice(
      -24
    );

}


/* =========================================================
   DETECT IMAGE
   ========================================================= */

function containsImage(
  messages
) {

  return messages.some(
    function(message) {

      return (
        Array.isArray(
          message.content
        ) &&
        message.content.some(
          function(part) {

            return (
              part?.type ===
              "image_url"
            );

          }
        )
      );

    }
  );

}


/* =========================================================
   CLEAN REPLY
   ========================================================= */

function cleanReply(
  text
) {

  if (
    typeof text !==
    "string"
  ) {

    return "";

  }


  let result =
    text;


  /*
   * Explicit reasoning blocks
   */

  result =
    result.replace(
      /<think>[\s\S]*?<\/think>/gi,
      ""
    );


  result =
    result.replace(
      /<analysis>[\s\S]*?<\/analysis>/gi,
      ""
    );


  result =
    result.replace(
      /<thinking>[\s\S]*?<\/thinking>/gi,
      ""
    );


  /*
   * Unclosed reasoning blocks
   */

  result =
    result.replace(
      /<think>[\s\S]*$/gi,
      ""
    );


  result =
    result.replace(
      /<analysis>[\s\S]*$/gi,
      ""
    );


  /*
   * Common leaked reasoning headings
   */

  result =
    result.replace(
      /^\s*(reasoning|analysis|thoughts?)\s*:\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(here(?:'|’)s a thinking process)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(let me think)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(analyze user input)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(identify key requirements)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(formulate response)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(check against constraints)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(final output generation)\s*:?\s*/i,
      ""
    );


  result =
    result.replace(
      /^\s*(output generation)\s*:?\s*/i,
      ""
    );


  /*
   * Remove leftover tags
   */

  result =
    result.replace(
      /<\/?(?:think|analysis|thinking)>/gi,
      ""
    );


  /*
   * Clean blank lines
   */

  result =
    result.replace(
      /\n{3,}/g,
      "\n\n"
    );


  return result.trim();

}


/* =========================================================
   CALL GROQ
   ========================================================= */

async function callGroq(
  apiKey,
  model,
  messages
) {

  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...messages
    ],
    temperature: 0.35,
    max_completion_tokens: 1200,
    stream: false
  };

  if (
    model === "openai/gpt-oss-20b" ||
    model === "openai/gpt-oss-120b"
  ) {
    payload.reasoning_format = "hidden";
  }

  if (
    model === "qwen/qwen3.8-27b"
  ) {
    payload.reasoning_effort = "none";
  }

  return fetch(
    GROQ_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    }
  );

}


/* =========================================================
   ERROR EXPLANATION
   ترجمة أخطاء Groq إلى رسائل عربية واضحة
   تشرح السبب والحل بدل إظهار رمز 403 فقط.
   ========================================================= */

function explainGroqError(
  status,
  model,
  hasImage,
  groqMessage
) {

  const detail = groqMessage
    ? `\n\nتفاصيل Groq: ${groqMessage}`
    : "";


  switch (
    status
  ) {

    case 401:

      return (
        "مفتاح Groq غير صالح أو منتهي (401). " +
        "أنشئ مفتاحًا جديدًا من console.groq.com " +
        "ثم حدّث GROQ_API_KEY في إعدادات Vercel وأعد النشر." +
        detail
      );


    case 403:

      if (
        hasImage
      ) {

        return (
          "النموذج المستخدم لتحليل الصور غير متاح لمفتاح Groq الحالي (403 — صلاحيات غير كافية). " +
          "افتح console.groq.com وفعّل الوصول إلى نموذج " +
          model +
          " من Model Permissions، أو حدّث GROQ_VISION_MODEL في إعدادات Vercel ثم أعد النشر." +
          detail
        );

      }


      return (
        "مفتاح Groq لا يملك صلاحية استخدام النموذج المطلوب (403). " +
        "افتح console.groq.com وتحقق من Model Permissions، " +
        "أو أنشئ مفتاح API جديدًا وحدّث GROQ_API_KEY في Vercel ثم أعد النشر." +
        detail
      );


    case 413:

      return (
        "حجم الطلب كبير جدًا (413). " +
        "أرسل صورة أصغر حجمًا أو قلّل طول الرسالة وحاول مجددًا." +
        detail
      );


    case 429:

      return (
        "تم تجاوز حدود استخدام Groq مؤقتًا (429). " +
        "انتظر دقيقة واحدة ثم أعد إرسال الرسالة." +
        detail
      );


    case 400:

      return (
        "رفض Groq الطلب (400). " +
        "قد يكون النموذج غير متاح أو محتوى الطلب غير مدعوم. " +
        "حاول تغيير النموذج من الإعدادات وإعادة المحاولة." +
        detail
      );


    default:

      if (
        status >= 500
      ) {

        return (
          "خدمة Groq تواجه مشكلة مؤقتة (" +
          status +
          "). أعد إرسال الرسالة بعد لحظات." +
          detail
        );

      }


      return (
        "حدث خطأ أثناء الاتصال بخدمة Groq (" +
        (status || "غير معروف") +
        ")." +
        detail
      );

  }

}


/* =========================================================
   MAIN HANDLER
   ========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {

    /*
     * Disable caching.
     */

    res.setHeader(
      "Cache-Control",
      "no-store"
    );


    /*
     * CORS
     */

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );


    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );


    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );


    /*
     * OPTIONS
     */

    if (
      req.method ===
      "OPTIONS"
    ) {

      return res
        .status(204)
        .end();

    }


    /*
     * POST only
     */

    if (
      req.method !==
      "POST"
    ) {

      return sendJSON(
        res,
        405,
        {

          ok:
            false,

          code:
            "METHOD_NOT_ALLOWED",

          error:
            "Method Not Allowed"

        }
      );

    }


    /*
     * API KEY
     */

    const apiKey =
      String(
        process.env.GROQ_API_KEY ||
        ""
      ).trim();


    if (!apiKey) {

      console.error(
        "GROQ_API_KEY is missing."
      );


      return sendJSON(
        res,
        500,
        {

          ok:
            false,

          code:
            "MISSING_GROQ_API_KEY",

          error:
            "مفتاح Groq غير موجود في Vercel. أضف GROQ_API_KEY ثم اعمل Redeploy."

        }
      );

    }


    try {

      /*
       * Parse request
       */

      const body =
        parseBody(
          req
        );


      /*
       * Messages
       */

      const messages =
        normalizeMessages(
          body.messages
        );


      if (
        !messages.length
      ) {

        return sendJSON(
          res,
          400,
          {

            ok:
              false,

            code:
              "EMPTY_MESSAGES",

            error:
              "لم يتم إرسال أي رسالة."

          }
        );

      }


      /*
       * Requested model
       */

      const requestedModel =
        typeof body.model ===
          "string" &&
        body.model.trim()
          ? body.model.trim()
          : DEFAULT_TEXT_MODEL;


      /*
       * Detect image
       */

      const hasImage =
        containsImage(
          messages
        );


      /*
       * Choose model
       */

      let model;


      if (
        hasImage
      ) {

        /*
         * Images always use Vision.
         */

        model =
          VISION_MODEL;

      } else {

        model =
          ALLOWED_MODELS.has(
            requestedModel
          )
            ? requestedModel
            : DEFAULT_TEXT_MODEL;

      }


      /*
       * Build the model candidate chain.
       *
       * لأي سبب — نموذج محذوف، أو غير مصرّح
       * لمفتاحك (403) — نجرّب النموذج التالي
       * في السلسلة بدل إظهار خطأ 403 للمستخدم.
       */

      const candidates = hasImage
        ? [VISION_MODEL]
        : [
            ...new Set(
              [
                model,
                ...TEXT_FALLBACK_CHAIN
              ]
            )
          ];


      /*
       * Call Groq through the fallback chain.
       */

      let response = null;
      let data = {};
      let usedModel = "";

      for (
        let i = 0;
        i < candidates.length;
        i++
      ) {

        usedModel = candidates[i];

        response =
          await callGroq(
            apiKey,
            usedModel,
            messages
          );

        data =
          await response
            .json()
            .catch(
              () => ({})
            );


        /*
         * Retry a single rate-limited request
         * using Groq's Retry-After header.
         */

        if (
          response.status === 429
        ) {

          const retryAfter =
            Math.min(
              8,
              Math.max(
                1,
                Number(
                  response.headers.get(
                    "retry-after"
                  )
                ) || 2
              )
            );

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                retryAfter * 1000
              )
          );

          response =
            await callGroq(
              apiKey,
              usedModel,
              messages
            );

          data =
            await response
              .json()
              .catch(
                () => ({})
              );

        }


        /*
         * Success — stop here.
         */

        if (
          response.ok
        ) {
          break;
        }


        /*
         * Model unavailable (403 / 404 / 400):
         * try the next candidate in the chain.
         */

        const canFallback =
          i < candidates.length - 1 &&
          [
            400,
            403,
            404
          ].includes(
            response.status
          );

        if (
          canFallback
        ) {

          console.warn(
            `Groq model ${usedModel} unavailable (HTTP ${response.status}). Falling back to ${candidates[i + 1]}.`
          );

          continue;

        }


        /*
         * Non-recoverable error — stop.
         */

        break;

      }


      /*
       * API error — return a clear Arabic
       * message that explains the cause and
       * the exact fix, instead of a bare 403.
       */

      if (
        !response.ok
      ) {

        const groqMessage =
          data?.error?.message ||
          data?.error?.error?.message ||
          "";


        const friendlyMessage =
          explainGroqError(
            response.status,
            usedModel,
            hasImage,
            groqMessage
          );


        console.error(
          "Groq API Error",
          {
            status:
              response.status,

            model:
              usedModel,

            message:
              groqMessage
          }
        );


        return sendJSON(
          res,
          response.status >=
            400
            ? response.status
            : 502,
          {

            ok:
              false,

            code:
              "GROQ_API_ERROR",

            error:
              friendlyMessage,

            detail:
              groqMessage ||
              undefined,

            upstreamStatus:
              response.status,

            model:
              usedModel

          }
        );

      }


      /*
       * Extract response
       */

      const rawReply =
        data
          ?.choices
          ?.[0]
          ?.message
          ?.content;


      const reply =
        cleanReply(
          rawReply
        );


      /*
       * Empty response
       */

      if (
        !reply
      ) {

        return sendJSON(
          res,
          502,
          {

            ok:
              false,

            code:
              "EMPTY_GROQ_REPLY",

            error:
              "لم يرجع Groq إجابة نصية.",

            model:
              usedModel

          }
        );

      }


      /*
       * Success
       */

      return sendJSON(
        res,
        200,
        {

          ok:
            true,

          reply,

          model:
            usedModel

        }
      );


    } catch (
      error
    ) {

      console.error(
        "T.M.D_AI_Pro /api/chat error",
        error
      );


      return sendJSON(
        res,
        500,
        {

          ok:
            false,

          code:
            "SERVER_ERROR",

          error:
            error?.message ||
            "حدث خطأ غير متوقع في الخادم."

        }
      );

    }

  };
