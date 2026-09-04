"use strict";

/* =========================================================
   T.M.D AI
   Frontend
   Groq Only
   ========================================================= */

const state = {

  messages:
    JSON.parse(
      localStorage.getItem("tmd_messages") || "[]"
    ),

  conversations:
    JSON.parse(
      localStorage.getItem("tmd_conversations") || "[]"
    ),

  theme:
    localStorage.getItem("tmd_theme") || "dark",

  model:
    localStorage.getItem("tmd_model") ||
    "llama-3.1-8b-instant",

  busy: false,

  controller: null,

  selectedImage: null,

  selectedDocument: null,

  imageMode: "analyze"

};


/* =========================================================
   ELEMENTS
   ========================================================= */

const $ = id =>
  document.getElementById(id);


const chat =
  $("chat");

const welcome =
  $("welcome");

const input =
  $("input");

const send =
  $("send");

const historyList =
  $("history");

const sidebar =
  $("sidebar");

const plusButton =
  $("plusButton");

const plusMenu =
  $("plusMenu");

const analyzeDocumentButton =
  $("analyzeDocumentButton");

const addImageButton =
  $("addImageButton");

const imageEditButton =
  $("imageEditButton");

const imageInput =
  $("imageInput");

const documentInput =
  $("documentInput");

const attachmentPreview =
  $("attachmentPreview");

const attachmentIcon =
  $("attachmentIcon");

const attachmentName =
  $("attachmentName");

const attachmentMeta =
  $("attachmentMeta");


/* =========================================================
   SAVE
   ========================================================= */

function save() {

  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(state.messages)
  );

  localStorage.setItem(
    "tmd_conversations",
    JSON.stringify(state.conversations)
  );

  localStorage.setItem(
    "tmd_theme",
    state.theme
  );

  localStorage.setItem(
    "tmd_model",
    state.model
  );

}


/* =========================================================
   TOAST
   ========================================================= */

function toast(message) {

  const el =
    $("toast");

  if (!el) return;

  el.textContent =
    message;

  el.classList.add(
    "show"
  );

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () =>
        el.classList.remove(
          "show"
        ),
      3000
    );

}


/* =========================================================
   ESCAPE
   ========================================================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );

}


/* =========================================================
   FORMAT TEXT
   ========================================================= */

function formatText(text) {

  let s =
    esc(text);

  s =
    s.replace(
      /```([\w+-]*)\n?([\s\S]*?)```/g,
      (_, language, code) =>
        `<pre><code>${code}</code></pre>`
    );

  s =
    s.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>'
    );

  s =
    s.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );

  s =
    s.replace(
      /\n/g,
      "<br>"
    );

  return s;

}


/* =========================================================
   SCROLL
   ========================================================= */

function scrollBottom() {

  requestAnimationFrame(
    () => {

      if (chat) {

        chat.scrollTop =
          chat.scrollHeight;

      }

    }
  );

}


/* =========================================================
   THEME
   ========================================================= */

function setTheme(theme) {

  state.theme =
    theme;

  document.documentElement.dataset.theme =
    theme;

  document.body.dataset.theme =
    theme;

  const select =
    $("themeSelect");

  if (select) {

    select.value =
      theme;

  }

  save();

}


/* =========================================================
   PLUS MENU
   ========================================================= */

function closePlusMenu() {

  if (!plusMenu) return;

  plusMenu.classList.add(
    "hidden"
  );

  plusButton?.setAttribute(
    "aria-expanded",
    "false"
  );

}


function openPlusMenu() {

  if (!plusMenu) return;

  plusMenu.classList.remove(
    "hidden"
  );

  plusButton?.setAttribute(
    "aria-expanded",
    "true"
  );

}


/* =========================================================
   ATTACHMENT
   ========================================================= */

function resetAttachment() {

  state.selectedImage =
    null;

  state.selectedDocument =
    null;

  if (attachmentPreview) {

    attachmentPreview.classList.add(
      "hidden"
    );

  }

  if (imageInput) {

    imageInput.value =
      "";

  }

  if (documentInput) {

    documentInput.value =
      "";

  }

}


function formatBytes(bytes) {

  if (
    !bytes ||
    bytes < 1024
  ) {

    return `${bytes || 0} B`;

  }

  if (
    bytes <
    1024 * 1024
  ) {

    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;

  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;

}


function showAttachment(
  file,
  type
) {

  if (!attachmentPreview) {
    return;
  }

  attachmentPreview.classList.remove(
    "hidden"
  );

  if (attachmentIcon) {

    attachmentIcon.textContent =
      type === "image"
        ? "🖼️"
        : "📄";

  }

  if (attachmentName) {

    attachmentName.textContent =
      file.name;

  }

  if (attachmentMeta) {

    attachmentMeta.textContent =
      `${
        type === "image"
          ? "صورة"
          : "ملف"
      } · ${formatBytes(file.size)}`;

  }

}


/* =========================================================
   MESSAGE
   ========================================================= */

function addMessage(
  role,
  content,
  meta = ""
) {

  if (welcome) {

    welcome.style.display =
      "none";

  }

  const article =
    document.createElement(
      "article"
    );

  article.className =
    `message ${role}`;

  article.innerHTML = `

    <div class="msg-avatar">
      ${
        role === "user"
          ? "أنت"
          : "T"
      }
    </div>

    <div class="msg-body">

      <div class="msg-label">

        ${
          role === "user"
            ? "أنت"
            : "T.M.D AI"
        }

        ${
          meta
            ? `<span>${esc(meta)}</span>`
            : ""
        }

      </div>

      <div class="msg-content">
        ${formatText(content)}
      </div>

    </div>

  `;

  chat.appendChild(
    article
  );

  scrollBottom();

  return article;

}


/* =========================================================
   GROQ CHAT
   ========================================================= */

async function sendText(
  messages
) {

  const controller =
    new AbortController();

  state.controller =
    controller;


  const response =
    await fetch(
      "/api/chat",
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            model:
              state.model ||
              "llama-3.1-8b-instant",

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
    "لم تصل نتيجة من Groq."
  );

}


/* =========================================================
   IMAGE
   ========================================================= */

async function analyzeImage(
  dataUrl,
  prompt
) {

  const response =
    await fetch(
      "/api/image",
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            image:
              dataUrl,

            prompt:
              prompt ||
              "حلل الصورة بالتفصيل."

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
    !response.ok ||
    !data.ok
  ) {

    throw new Error(
      data.error ||
      "تعذر تحليل الصورة."
    );

  }


  return (
    data.reply ||
    data.message ||
    "لم تصل نتيجة تحليل الصورة."
  );

}


/* =========================================================
   FILE READER
   ========================================================= */

async function readFileAsText(
  file
) {

  const name =
    file.name.toLowerCase();


  /* TXT / CODE */

  if (
    /\.(txt|md|js|json|html|htm|css|py|csv|xml|yaml|yml|log)$/i
      .test(name)
  ) {

    return await file.text();

  }


  /* DOCX */

  if (
    name.endsWith(".docx")
  ) {

    if (!window.mammoth) {

      throw new Error(
        "قارئ Word غير متوفر."
      );

    }

    const result =
      await mammoth.extractRawText({

        arrayBuffer:
          await file.arrayBuffer()

      });

    return result.value;

  }


  /* PDF */

  if (
    name.endsWith(".pdf")
  ) {

    return await readPdf(
      file
    );

  }


  throw new Error(
    "صيغة الملف غير مدعومة."
  );

}


/* =========================================================
   PDF
   ========================================================= */

async function readPdf(
  file
) {

  if (!window.pdfjsLib) {

    if (window.pdfjsReady) {

      await window.pdfjsReady;

    }

  }


  if (!window.pdfjsLib) {

    throw new Error(
      "قارئ PDF غير متوفر."
    );

  }


  const pdf =
    await window.pdfjsLib
      .getDocument({

        data:
          new Uint8Array(
            await file.arrayBuffer()
          )

      })
      .promise;


  const pages =
    [];


  for (
    let i = 1;
    i <= pdf.numPages;
    i++
  ) {

    const page =
      await pdf.getPage(i);

    const text =
      await page.getTextContent();


    pages.push(

      `### الصفحة ${i}\n` +

      text.items
        .map(
          item =>
            item.str
        )
        .join(" ")

    );

  }


  return pages.join(
    "\n\n"
  );

}


/* =========================================================
   FILE PROMPT
   ========================================================= */

function buildDocumentPrompt(
  userText,
  fileName,
  text
) {

  const max =
    45000;

  const clipped =
    text.length > max
      ? text.slice(
          0,
          max
        ) +
        "\n\n[تم اختصار باقي الملف بسبب الحجم]"
      : text;


  return `

لديك ملف مرفق اسمه:

${fileName}

محتوى الملف:

--------------------

${clipped}

--------------------

طلب المستخدم:

${
  userText ||
  "حلل الملف واذكر أهم المعلومات الموجودة فيه."
}

اعتمد على محتوى الملف فقط.
إذا لم تجد المعلومة المطلوبة، أخبر المستخدم بذلك.

`;

}


/* =========================================================
   DATA URL
   ========================================================= */

function fileToDataUrl(
  file
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const reader =
        new FileReader();

      reader.onload =
        () =>
          resolve(
            reader.result
          );

      reader.onerror =
        () =>
          reject(
            new Error(
              "تعذر قراءة الصورة."
            )
          );

      reader.readAsDataURL(
        file
      );

    }
  );

}


/* =========================================================
   SEND
   ========================================================= */

async function handleSend() {

  /* STOP */

  if (state.busy) {

    state.controller?.abort();

    return;

  }


  const raw =
    input.value.trim();


  /* EMPTY */

  if (
    !raw &&
    !state.selectedImage &&
    !state.selectedDocument
  ) {

    return;

  }


  state.busy =
    true;


  send.classList.add(
    "stop"
  );

  send.textContent =
    "■";


  const userText =
    raw ||
    (
      state.selectedImage
        ? "حلل هذه الصورة."
        : "حلل هذا الملف."
    );


  /* SHOW USER MESSAGE */

  addMessage(
    "user",
    userText,
    state.selectedDocument?.name ||
    state.selectedImage?.name ||
    ""
  );


  /* CLEAR INPUT */

  input.value =
    "";

  autoResize();


  const typing =
    addMessage(
      "assistant",
      "جاري التحليل…"
    );


  try {

    let reply;


    /* =====================================================
       DOCUMENT
       ===================================================== */

    if (
      state.selectedDocument
    ) {

      const file =
        state.selectedDocument;


      if (
        file.size >
        15 * 1024 * 1024
      ) {

        throw new Error(
          "حجم الملف أكبر من 15MB."
        );

      }


      const text =
        await readFileAsText(
          file
        );


      if (
        !text.trim()
      ) {

        throw new Error(
          "لم أستطع استخراج نص من الملف."
        );

      }


      const prompt =
        buildDocumentPrompt(
          userText,
          file.name,
          text
        );


      const messages = [

        ...state.messages,

        {
          role:
            "user",

          content:
            prompt

        }

      ];


      reply =
        await sendText(
          messages
        );


      state.messages.push(

        {
          role:
            "user",

          content:
            userText

        },

        {
          role:
            "assistant",

          content:
            reply

        }

      );

    }


    /* =====================================================
       IMAGE
       ===================================================== */

    else if (
      state.selectedImage
    ) {

      const dataUrl =
        await fileToDataUrl(
          state.selectedImage
        );


      reply =
        await analyzeImage(
          dataUrl,
          userText
        );


      state.messages.push(

        {
          role:
            "user",

          content:
            userText

        },

        {
          role:
            "assistant",

          content:
            reply

        }

      );

    }


    /* =====================================================
       NORMAL CHAT
       ===================================================== */

    else {

      state.messages.push({

        role:
          "user",

        content:
          userText

      });


      reply =
        await sendText(
          state.messages
        );


      state.messages.push({

        role:
          "assistant",

        content:
          reply

      });

    }


    /* SHOW RESPONSE */

    typing
      .querySelector(
        ".msg-content"
      )
      .innerHTML =
        formatText(
          reply
        );


    save();

  }


  catch (error) {

    if (
      error.name !==
      "AbortError"
    ) {

      const message =
        error.message ||
        "حدث خطأ غير متوقع.";


      typing
        .querySelector(
          ".msg-content"
        )
        .innerHTML =

          `<span class="error-text">
            ${esc(message)}
          </span>`;


      toast(
        message
      );

    }

  }


  finally {

    resetAttachment();

    state.busy =
      false;

    state.controller =
      null;


    send.classList.remove(
      "stop"
    );

    send.textContent =
      "↑";


    scrollBottom();

  }

}


/* =========================================================
   RESIZE
   ========================================================= */

function autoResize() {

  if (!input) return;

  input.style.height =
    "auto";

  input.style.height =
    Math.min(
      input.scrollHeight,
      180
    ) + "px";

}


/* =========================================================
   SEND BUTTON
   ========================================================= */

if (send) {

  send.addEventListener(
    "click",
    handleSend
  );

}


/* =========================================================
   ENTER
   ========================================================= */

if (input) {

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        handleSend();

      }

    }
  );


  input.addEventListener(
    "input",
    autoResize
  );

}


/* =========================================================
   PLUS
   ========================================================= */

if (plusButton) {

  plusButton.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      if (
        plusMenu.classList.contains(
          "hidden"
        )
      ) {

        openPlusMenu();

      } else {

        closePlusMenu();

      }

    }
  );

}


document.addEventListener(
  "click",
  event => {

    if (
      !event.target.closest(
        ".plus-menu-wrapper"
      )
    ) {

      closePlusMenu();

    }

  }
);


/* =========================================================
   DOCUMENT BUTTON
   ========================================================= */

if (analyzeDocumentButton) {

  analyzeDocumentButton.addEventListener(
    "click",
    () => {

      closePlusMenu();

      documentInput?.click();

    }
  );

}


if (documentInput) {

  documentInput.addEventListener(
    "change",
    () => {

      const file =
        documentInput.files?.[0];

      if (!file) return;


      state.selectedDocument =
        file;

      state.selectedImage =
        null;


      showAttachment(
        file,
        "document"
      );


      toast(
        "تم إرفاق الملف. اكتب طلبك ثم اضغط إرسال."
      );

    }
  );

}


/* =========================================================
   IMAGE BUTTON
   ========================================================= */

if (addImageButton) {

  addImageButton.addEventListener(
    "click",
    () => {

      state.imageMode =
        "analyze";

      closePlusMenu();

      imageInput?.click();

    }
  );

}


if (imageEditButton) {

  imageEditButton.addEventListener(
    "click",
    () => {

      state.imageMode =
        "edit";

      closePlusMenu();

      imageInput?.click();

    }
  );

}


if (imageInput) {

  imageInput.addEventListener(
    "change",
    () => {

      const file =
        imageInput.files?.[0];

      if (!file) return;


      if (
        file.size >
        20 * 1024 * 1024
      ) {

        toast(
          "الصورة أكبر من 20MB."
        );

        return;

      }


      state.selectedImage =
        file;

      state.selectedDocument =
        null;


      showAttachment(
        file,
        "image"
      );


      toast(
        "تم إرفاق الصورة."
      );

    }
  );

}


/* =========================================================
   REMOVE ATTACHMENT
   ========================================================= */

const removeAttachment =
  $("removeAttachment");

if (removeAttachment) {

  removeAttachment.addEventListener(
    "click",
    resetAttachment
  );

}


/* =========================================================
   NEW CHAT
   ========================================================= */

const newChat =
  $("newChat");

if (newChat) {

  newChat.addEventListener(
    "click",
    () => {

      if (
        state.messages.length
      ) {

        state.conversations.push({

          id:
            Date.now(),

          title:
            String(
              state.messages.find(
                m =>
                  m.role === "user"
              )?.content ||
              "محادثة جديدة"
            ).slice(
              0,
              55
            ),

          messages:
            state.messages.slice(
              -50
            )

        });

      }


      state.messages =
        [];


      chat
        .querySelectorAll(
          ".message"
        )
        .forEach(
          el =>
            el.remove()
        );


      if (welcome) {

        welcome.style.display =
          "flex";

      }


      resetAttachment();

      save();

      input?.focus();

    }
  );

}


/* =========================================================
   SIDEBAR
   ========================================================= */

const openSidebar =
  $("openSidebar");

if (openSidebar) {

  openSidebar.addEventListener(
    "click",
    () =>
      sidebar.classList.add(
        "open"
      )
  );

}


const closeSidebar =
  $("closeSidebar");

if (closeSidebar) {

  closeSidebar.addEventListener(
    "click",
    () =>
      sidebar.classList.remove(
        "open"
      )
  );

}


/* =========================================================
   SETTINGS
   ========================================================= */

const settingsBtn =
  $("settingsBtn");

const modalBackdrop =
  $("modalBackdrop");

const modalClose =
  $("modalClose");


settingsBtn?.addEventListener(
  "click",
  () =>
    modalBackdrop?.classList.remove(
      "hidden"
    )
);


modalClose?.addEventListener(
  "click",
  () =>
    modalBackdrop?.classList.add(
      "hidden"
    )
);


modalBackdrop?.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      modalBackdrop
    ) {

      modalBackdrop.classList.add(
        "hidden"
      );

    }

  }
);


/* =========================================================
   THEME
   ========================================================= */

const themeTop =
  $("themeTop");

themeTop?.addEventListener(
  "click",
  () => {

    setTheme(
      state.theme === "dark"
        ? "light"
        : "dark"
    );

  }
);


const themeSelect =
  $("themeSelect");

themeSelect?.addEventListener(
  "change",
  event =>
    setTheme(
      event.target.value
    )
);


/* =========================================================
   MODEL
   ========================================================= */

const modelSelect =
  $("modelSelect");


if (modelSelect) {

  /*
   * إصلاح موديل قديم أو غير موجود
   */

  const validModels = [

    "llama-3.1-8b-instant",

    "llama-3.3-70b-versatile"

  ];


  if (
    !validModels.includes(
      state.model
    )
  ) {

    state.model =
      "llama-3.1-8b-instant";

  }


  modelSelect.value =
    state.model;


  modelSelect.addEventListener(
    "change",
    event => {

      const value =
        event.target.value;


      if (
        validModels.includes(
          value
        )
      ) {

        state.model =
          value;

        save();

        toast(
          "تم تغيير نموذج Groq."
        );

      }

    }
  );

}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

  if (!historyList) {
    return;
  }


  historyList.innerHTML =
    "";


  const list =
    [
      ...state.conversations
    ].reverse();


  if (!list.length) {

    historyList.innerHTML = `

      <div class="empty-history">
        لا توجد محادثات محفوظة
      </div>

    `;

    return;

  }


  list.forEach(
    conversation => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "history-item";

      button.type =
        "button";


      button.textContent =
        conversation.title ||
        "محادثة جديدة";


      button.addEventListener(
        "click",
        () => {

          chat
            .querySelectorAll(
              ".message"
            )
            .forEach(
              el =>
                el.remove()
            );


          if (welcome) {

            welcome.style.display =
              "none";

          }


          (
            conversation.messages ||
            []
          ).forEach(
            message =>
              addMessage(
                message.role,
                message.content
              )
          );


          state.messages =
            [
              ...(conversation.messages ||
                [])
            ];


          sidebar?.classList.remove(
            "open"
          );

        }
      );


      historyList.appendChild(
        button
      );

    }
  );

}


/* =========================================================
   INIT
   ========================================================= */

setTheme(
  state.theme
);

renderHistory();

autoResize();

input?.focus();


console.log(
  "T.M.D AI loaded successfully - Groq Only"
);
