"use strict";

/*
 * ============================================================
 * T.M.D AI
 * Groq Vision API
 *
 * T.M.D AI -> /api/image -> Groq Vision
 *
 * لا يوجد OpenAI API Key
 * ============================================================
 */

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";


const VISION_MODEL =
  process.env.GROQ_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";


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
   * GROQ KEY
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
     * BODY
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


    const image =
      body.image ||
      body.imageUrl ||
      body.dataUrl;


    const prompt =
      typeof body.prompt === "string" &&
      body.prompt.trim()

        ? body.prompt.trim()

        : "حلل هذه الصورة بالتفصيل، واشرح العناصر والنصوص والمعلومات المهمة الموجودة فيها.";


    /*
     * ========================================================
     * VALIDATE IMAGE
     * ========================================================
     */

    if (
      typeof image !== "string" ||
      !image.trim()
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          error:
            "لم يتم إرسال صورة."

        });

    }


    /*
     * ========================================================
     * VALIDATE DATA URL
     * ========================================================
     */

    if (
      !image.startsWith(
        "data:image/"
      )
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          error:
            "صيغة الصورة غير صحيحة. يجب إرسال Data URL للصورة."

        });

    }


    /*
     * ========================================================
     * LIMIT IMAGE SIZE
     * ========================================================
     */

    const approximateBytes =
      Math.floor(
        (
          image.length *
          3
        ) / 4
      );


    if (
      approximateBytes >
      12 * 1024 * 1024
    ) {

      return res
        .status(413)
        .json({

          ok: false,

          error:
            "حجم الصورة كبير جدًا. حاول إرسال صورة أصغر."

        });

    }


    /*
     * ========================================================
     * GROQ VISION MESSAGE
     * ========================================================
     */

    const messages = [

      {

        role:
          "system",

        content:
          `
أنت T.M.D AI Vision، مساعد متخصص في تحليل الصور.

تعليماتك:

- حلل الصورة المرسلة فقط.
- لا تدّعي رؤية شيء غير موجود في الصورة.
- اذكر النصوص الظاهرة إذا كان من الممكن قراءتها.
- صف العناصر المهمة بوضوح.
- إذا طلب المستخدم استخراج معلومات من الصورة، حاول استخراجها بدقة.
- إذا كانت الصورة غير واضحة، أخبر المستخدم بذلك.
- أجب بالعربية إذا كان المستخدم يتحدث بالعربية.
          `.trim()

      },

      {

        role:
          "user",

        content: [

          {

            type:
              "text",

            text:
              prompt

          },

          {

            type:
              "image_url",

            image_url: {

              url:
                image

            }

          }

        ]

      }

    ];


    /*
     * ========================================================
     * REQUEST GROQ
     * ========================================================
     */

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

              model:
                VISION_MODEL,

              messages:
                messages,

              temperature:
                0.3,

              max_tokens:
                4096

            })

        }
      );


    /*
     * ========================================================
     * READ RESPONSE
     * ========================================================
     */

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    /*
     * ========================================================
     * GROQ ERROR
     * ========================================================
     */

    if (!response.ok) {

      console.error(
        "Groq Vision Error:",
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

            "حدث خطأ أثناء تحليل الصورة بواسطة Groq.",

          model:
            VISION_MODEL

        });

    }


    /*
     * ========================================================
     * REPLY
     * ========================================================
     */

    const reply =
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
        "Groq Vision returned no text:",
        data
      );


      return res
        .status(502)
        .json({

          ok: false,

          error:
            "لم يرجع Groq نتيجة لتحليل الصورة."

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
          VISION_MODEL

      });


  } catch (error) {

    /*
     * ========================================================
     * UNEXPECTED ERROR
     * ========================================================
     */

    console.error(
      "T.M.D AI Vision Error:",
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        error:
          error?.message ||

          "حدث خطأ غير متوقع أثناء تحليل الصورة."

      });

  }

};
