"use strict";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL = "llama-3.1-8b-instant";

const ALLOWED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "qwen/qwen3.6-27b"
]);

const VISION_MODEL = "qwen/qwen3.6-27b";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "GROQ_API_KEY غير موجود في Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const incomingMessages =
      Array.isArray(body.messages)
        ? body.messages
        : [];

    let requestedModel =
      typeof body.model === "string"
        ? body.model.trim()
        : DEFAULT_MODEL;

    let model =
      ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : DEFAULT_MODEL;

    /*
     * =========================================================
     * تنظيف الرسائل
     * =========================================================
     *
     * مهم جدًا:
     * Groq لا يقبل خصائص الواجهة مثل:
     *
     * imagePreview
     * selectedImage
     * imageName
     * fileName
     * preview
     *
     * لذلك نقوم بتحويلها إلى صيغة Groq الصحيحة.
     */

    let hasImage = false;

    const cleanedMessages = incomingMessages.map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const role =
        message.role === "assistant"
          ? "assistant"
          : "user";

      /*
       * -------------------------------------------------------
       * إذا كانت الرسالة تحتوي على imagePreview
       * -------------------------------------------------------
       */

      const imagePreview =
        typeof message.imagePreview === "string"
          ? message.imagePreview
          : null;

      if (
        role === "user" &&
        imagePreview &&
        imagePreview.startsWith("data:image/")
      ) {
        hasImage = true;

        const text =
          typeof message.content === "string"
            ? message.content
            : "";

        return {
          role: "user",
          content: [
            {
              type: "text",
              text:
                text.trim() ||
                "حلل هذه الصورة بالتفصيل."
            },
            {
              type: "image_url",
              image_url: {
                url: imagePreview
              }
            }
          ]
        };
      }

      /*
       * -------------------------------------------------------
       * الرسائل النصية العادية
       * -------------------------------------------------------
       */

      if (typeof message.content === "string") {
        return {
          role,
          content: message.content
        };
      }

      /*
       * -------------------------------------------------------
       * إذا كان content بصيغة multimodal
       * -------------------------------------------------------
       */

      if (Array.isArray(message.content)) {
        const safeContent = [];

        for (const item of message.content) {
          if (!item || typeof item !== "object") {
            continue;
          }

          if (
            item.type === "text" &&
            typeof item.text === "string"
          ) {
            safeContent.push({
              type: "text",
              text: item.text
            });
          }

          if (
            item.type === "image_url" &&
            item.image_url &&
            typeof item.image_url.url === "string"
          ) {
            hasImage = true;

            safeContent.push({
              type: "image_url",
              image_url: {
                url: item.image_url.url
              }
            });
          }
        }

        if (safeContent.length) {
          return {
            role,
            content: safeContent
          };
        }
      }

      return {
        role,
        content: ""
      };
    });

    const finalMessages = [
      {
        role: "system",
        content: `
أنت T.M.D AI، مساعد ذكاء اصطناعي محترف.

التعليمات:

- أجب باللغة العربية عندما يتحدث المستخدم بالعربية.
- كن واضحًا ومنظمًا ومباشرًا.
- استخدم Markdown عند الحاجة.
- حلل الصور المرسلة إليك بدقة.
- إذا كانت هناك صورة، اعتمد على محتواها المرئي.
- لا تدّعي رؤية شيء غير موجود في الصورة.
- عند طلب تحليل صورة، صف المحتوى والتفاصيل المهمة بوضوح.
- عند التعامل مع الأكواد، قدم كودًا واضحًا وقابلًا للنسخ.
- لا تكشف مفاتيح API أو الأسرار.
        `.trim()
      },
      ...cleanedMessages.filter(Boolean)
    ];

    /*
     * =========================================================
     * إذا كانت هناك صورة نستخدم موديل Vision
     * =========================================================
     */

    if (hasImage) {
      model = VISION_MODEL;
    }

    /*
     * =========================================================
     * إرسال الطلب إلى Groq
     * =========================================================
     */

    const response = await fetch(GROQ_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq API Error:", data);

      return res.status(response.status).json({
        ok: false,
        error:
          data?.error?.message ||
          "حدث خطأ أثناء الاتصال بخدمة Groq.",
        model
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content;

    if (
      typeof reply !== "string" ||
      !reply.trim()
    ) {
      console.error(
        "Groq returned no text:",
        data
      );

      return res.status(502).json({
        ok: false,
        error: "لم يرجع Groq أي إجابة نصية."
      });
    }

    return res.status(200).json({
      ok: true,
      reply: reply.trim(),
      model,
      vision: hasImage
    });

  } catch (error) {
    console.error(
      "T.M.D AI / Groq Error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "حدث خطأ غير متوقع."
    });
  }
};
