/* ================= GROQ CHAT ================= */

async function sendText(messages) {

  const controller =
    new AbortController();

  state.controller =
    controller;

  const model =
    state.model ||
    "llama-3.1-8b-instant";

  const response =
    await fetch(
      "/api/chat",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            model:

              model,

            messages:

              messages

          }),

        signal:
          controller.signal
      }
    );


  const data =
    await response
      .json()
      .catch(
        () => ({})
      );


  if (
    !response.ok ||
    !data.ok
  ) {

    throw new Error(

      data.error ||

      `تعذر الاتصال بـ Groq (${response.status})`

    );

  }


  return (

    data.reply ||

    data.message ||

    "لم تصل نتيجة من النموذج."

  );

}
