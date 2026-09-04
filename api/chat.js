"use strict";

/*
 * ============================================================
 * T.M.D AI
 * Groq Chat API
 *
 * T.M.D AI -> /api/chat -> Groq
 *
 * OpenAI غير مستخدم.
 * ============================================================
 */

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL =
  process.env.GROQ_MODEL ||
  "llama-3.1-8b-instant";

const FALLBACK_MODEL =
  "llama-3.3-70b-versatile";

const ALLOWED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile"
]);


module.exports = async function handler(req, res) {

  /*
   * ==========================================================
   * CORS
   * ==========================================================
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

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  /*
   * ==========================================================
   * OPTIONS
   * ==========================================================
   */

  if (req.method === "OPTIONS") {

    return res
      .status(204)
      .end();

  }


  /*
   * ==========================================================
   * POST ONLY
   * ==========================================================
   */

  if (req.method !== "POST") {

    return res
      .status(405)
      .json({

        ok: false,

        error:
          "Method Not Allowed"

      });

  }


  /*
   * ==========================================================
   * GROQ API KEY
   * ==========================================================
   */

  const apiKey =
    process.env.GROQ_API_KEY;


  if (!apiKey) {

    console.error(
      "GROQ_API_KEY is missing."
    );

    return res
      .status(500)
      .json({

        ok: false,

        error:
          "GROQ_API_KEY غير موجود في Vercel."

      });

  }


  try {

    /*
     * ========================================================
     * REQUEST BODY
     * ========================================================
     */

    const body =
      typeof req.body === "string"

        ? JSON.parse(
            req.body || "{}"
          )

        : (
            req.body || {}
          );


    /*
     * ========================================================
     * MESSAGES
     * ========================================================
     */

    const messages =
      Array.isArray(
        body.messages
      )

        ? body.messages

        : [];


    if (!messages.length) {

      return res
        .status(400)
        .json({

          ok: false,

          error:
            "لم يتم إرسال أي رسالة."

        });

    }


    /*
     * ========================================================
     * MODEL
     * ========================================================
     */

    let requestedModel =
      typeof body.model === "string"

        ? body.model.trim()

        : DEFAULT_MODEL;


    if (
      !ALLOWED_MODELS.has(
        requestedModel
      )
    ) {

      requestedModel =
        DEFAULT_MODEL;

    }


    /*
     * ========================================================
     * SYSTEM MESSAGE
     * ========================================================
     */

    const systemMessage = {

      role: "system",

      content:
        `
أنت T.M.D AI، مساعد ذكاء اصطناعي ذكي ومحترف.

تعليماتك:

- أجب باللغة العربية عندما يتحدث المستخدم بالعربية.
- كن واضحًا ومنظمًا ومباشرًا.
- استخدم العناوين والقوائم عند الحاجة.
- عند التعامل مع الأكواد، اشرحها بطريقة مفهومة.
- لا تدّعي أنك قرأت ملفًا أو صورة لم يتم إرسالها.
- لا تخترع معلومات غير موجودة في المحتوى المرسل.
- ساعد المستخدم في البرمجة والتصميم وتحليل المحتوى.
        `.trim()

    };


    /*
     * ========================================================
     * FINAL MESSAGES
     * ========================================================
     */

    const finalMessages = [

      systemMessage,

      ...messages

    ];


    /*
     * ========================================================
     * GROQ REQUEST
     * ========================================================
     */

    let response =
      await fetch(
        GROQ_URL,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${apiKey}`

          },

          body:
            JSON.stringify({

              model:
                requestedModel,

              messages:
                finalMessages,

              temperature:
                0.7,

              max_tokens:
                4096

            })

        }
      );


    /*
     * ========================================================
     * RESPONSE
     * ========================================================
     */

    let data =
      await response
        .json()
        .catch(
          () => ({})
        );


    /*
     * ========================================================
     * FALLBACK MODEL
     * ========================================================
     *
     * إذا رفض Groq الموديل الأول،
     * نحاول بالموديل الاحتياطي.
     * ========================================================
     */

    if (
      !response.ok &&
      requestedModel !== FALLBACK_MODEL &&
      (
        response.status === 400 ||
        response.status === 404
      )
    ) {

      console.warn(
        "Trying fallback Groq model."
      );


      response =
        await fetch(
          GROQ_URL,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${apiKey}`

            },

            body:
              JSON.stringify({

                model:
                  FALLBACK_MODEL,

                messages:
                  finalMessages,

                temperature:
                  0.7,

                max_tokens:
                  4096

              })

          }
        );


      data =
        await response
          .json()
          .catch(
            () => ({})
          );

    }


    /*
     * ========================================================
     * GROQ ERROR
     * ========================================================
     */

    if (!response.ok) {

      console.error(
        "Groq API Error:",
        data
      );


      return res
        .status(
          response.status
        )
        .json({

          ok: false,

          error:
            data?.error?.message ||

            "حدث خطأ أثناء الاتصال بخدمة Groq.",

          model:
            requestedModel

        });

    }


    /*
     * ========================================================
     * EXTRACT REPLY
     * ========================================================
     */

    const reply =
      data
        ?.choices
        ?.at?.(0)
        ?.message
        ?.content
      ??
      data
        ?.choices
        ?.[0]
        ?.message
        ?.content;


    /*
     * ========================================================
     * EMPTY RESPONSE
     * ========================================================
     */

    if (
      typeof reply !== "string" ||
      !reply.trim()
    ) {

      console.error(
        "Groq returned no text:",
        data
      );


      return res
        .status(502)
        .json({

          ok: false,

          error:
            "لم يرجع Groq أي إجابة نصية."

        });

    }


    /*
     * ========================================================
     * SUCCESS
     * ========================================================
     */

    return res
      .status(200)
      .json({

        ok: true,

        reply:
          reply.trim(),

        model:
          data?.model ||
          requestedModel

      });


  } catch (error) {

    /*
     * ========================================================
     * UNEXPECTED ERROR
     * ========================================================
     */

    console.error(
      "T.M.D AI / Groq Error:",
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        error:
          error?.message ||

          "حدث خطأ غير متوقع أثناء الاتصال بـ Groq."

      });

  }

};
