"use strict";


const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";


const DEFAULT_MODEL =
  "llama-3.1-8b-instant";


const ALLOWED_MODELS =
  new Set([

    "llama-3.1-8b-instant",

    "llama-3.3-70b-versatile",

    "meta-llama/llama-4-scout-17b-16e-instruct"

  ]);


module.exports =
  async function handler(
    req,
    res
  ) {


    res.setHeader(
      "Cache-Control",
      "no-store"
    );


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


    if (
      req.method === "OPTIONS"
    ) {

      return res
        .status(204)
        .end();

    }


    if (
      req.method !== "POST"
    ) {

      return res
        .status(405)
        .json({

          ok: false,

          error:
            "Method Not Allowed"

        });

    }


    /*
     * GROQ ONLY
     */

    const apiKey =
      process.env.GROQ_API_KEY;


    if (!apiKey) {

      return res
        .status(500)
        .json({

          ok: false,

          error:
            "GROQ_API_KEY غير موجود في Vercel."

        });

    }


    try {

      const body =
        typeof req.body === "string"

          ? JSON.parse(
              req.body || "{}"
            )

          : (
              req.body || {}
            );


      const messages =
        Array.isArray(
          body.messages
        )

          ? body.messages

          : [];


      if (
        !messages.length
      ) {

        return res
          .status(400)
          .json({

            ok: false,

            error:
              "لم يتم إرسال أي رسالة."

          });

      }


      const requestedModel =
        typeof body.model === "string"

          ? body.model.trim()

          : DEFAULT_MODEL;


      const model =
        ALLOWED_MODELS.has(
          requestedModel
        )

          ? requestedModel

          : DEFAULT_MODEL;


      const systemMessage = {

        role:
          "system",

        content:
          `
أنت T.M.D AI، مساعد ذكاء اصطناعي احترافي يعمل عبر Groq.

أجب باللغة العربية عندما يتحدث المستخدم بالعربية.

كن واضحًا ومباشرًا ومنظمًا.

استخدم Markdown عند الحاجة.

عند تحليل محتوى ملف:
- اعتمد على المحتوى المرسل.
- لا تخترع معلومات.
- إذا كانت الإجابة غير موجودة في المحتوى أخبر المستخدم.

عند التعامل مع الأكواد:
- اشرح الكود بوضوح.
- قدم الكود الصحيح عند الحاجة.

لا تكشف مفاتيح API أو أسرار الخادم.
          `.trim()

      };


      const response =
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

                model,

                messages: [
                  systemMessage,
                  ...messages
                ],

                temperature:
                  0.7,

                max_tokens:
                  4096

              })

          }
        );


      const data =
        await response
          .json()
          .catch(
            () => ({})
          );


      if (
        !response.ok
      ) {

        console.error(
          "GROQ ERROR:",
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
              "حدث خطأ في Groq.",

            model

          });

      }


      const reply =
        data?.choices?.[0]
          ?.message
          ?.content;


      if (
        typeof reply !==
          "string" ||
        !reply.trim()
      ) {

        return res
          .status(502)
          .json({

            ok: false,

            error:
              "Groq لم يرجع إجابة."

          });

      }


      return res
        .status(200)
        .json({

          ok: true,

          reply:
            reply.trim(),

          model

        });


    } catch (error) {

      console.error(
        "TMD GROQ ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          error:
            error?.message ||
            "حدث خطأ أثناء الاتصال بـ Groq."

        });

    }

  };
