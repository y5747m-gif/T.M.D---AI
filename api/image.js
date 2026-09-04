"use strict";


const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";


const VISION_MODEL =
  "meta-llama/llama-4-scout-17b-16e-instruct";


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
            "استخدم POST."

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


      const image =
        String(
          body.image || ""
        );


      const prompt =
        String(
          body.prompt || ""
        ).trim() ||

        "حلل هذه الصورة بالتفصيل، واشرح ما يظهر فيها واقرأ النصوص الواضحة داخلها.";


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
              "لم يتم إرسال صورة صحيحة."

          });

      }


      if (
        image.length >
        20 * 1024 * 1024
      ) {

        return res
          .status(413)
          .json({

            ok: false,

            error:
              "الصورة كبيرة جدًا. استخدم صورة أصغر."

          });

      }


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

                messages: [

                  {

                    role:
                      "system",

                    content:
                      `
أنت T.M.D AI ومتخصص في تحليل الصور.

حلل الصورة بدقة.

اقرأ النصوص الظاهرة بقدر الإمكان.

أجب عن طلب المستخدم.

لا تخترع معلومات غير موجودة في الصورة.

الإجابة تكون نصية ومنظمة.
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

                ],

                temperature:
                  0.3,

                max_tokens:
                  2048

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
          "GROQ VISION ERROR:",
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
              "فشل تحليل الصورة."

          });

      }


      const text =
        data?.choices?.[0]
          ?.message
          ?.content;


      if (
        typeof text !==
          "string" ||
        !text.trim()
      ) {

        return res
          .status(502)
          .json({

            ok: false,

            error:
              "لم يرجع Groq تحليلًا للصورة."

          });

      }


      return res
        .status(200)
        .json({

          ok: true,

          message:
            text.trim(),

          model:
            VISION_MODEL

        });


    } catch (error) {

      console.error(
        "TMD IMAGE ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          error:
            error?.message ||
            "حدث خطأ أثناء تحليل الصورة."

        });

    }

  };
