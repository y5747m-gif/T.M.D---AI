"use strict";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL =
  "llama-3.1-8b-instant";

const ALLOWED_MODELS =
  new Set([
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile"
  ]);

module.exports = async function handler(req, res) {

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


  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  if (req.method !== "POST") {

    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });

  }


  const apiKey =
    process.env.GROQ_API_KEY;


  if (!apiKey) {

    return res.status(500).json({
      ok: false,
      error:
        "GROQ_API_KEY غير موجود في Vercel."
    });

  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});


    const messages =
      Array.isArray(body.messages)
        ? body.messages
        : [];


    if (!messages.length) {

      return res.status(400).json({
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

      role: "system",

      content:
        "أنت T.M.D AI، مساعد ذكاء اصطناعي ذكي ومحترف. أجب باللغة العربية عندما يتحدث المستخدم بالعربية، وكن واضحًا ومنظمًا ومباشرًا."

    };


    const finalMessages = [

      systemMessage,

      ...messages

    ];


    const response =
      await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${apiKey}`
          },

          body:
            JSON.stringify({

              model:

                model,

              messages:

                finalMessages,

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


    if (!response.ok) {

      console.error(
        "Groq Error:",
        data
      );


      return res.status(
        response.status
      ).json({

        ok: false,

        error:
          data?.error?.message ||
          "حدث خطأ من Groq.",

        model:
          model

      });

    }


    const reply =
      data?.choices?.[0]?.message?.content;


    if (
      typeof reply !== "string" ||
      !reply.trim()
    ) {

      return res.status(502).json({

        ok: false,

        error:
          "Groq لم يرجع إجابة نصية."

      });

    }


    return res.status(200).json({

      ok: true,

      reply:
        reply.trim(),

      model:
        model

    });


  } catch (error) {

    console.error(
      "T.M.D AI Groq Error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        error?.message ||
        "حدث خطأ أثناء الاتصال بـ Groq."

    });

  }

};
