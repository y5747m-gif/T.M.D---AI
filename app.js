"use strict";

/*
============================================================
T.M.D AI
Professional Frontend
Groq Only
============================================================

المسارات:

المحادثة:
Browser -> /api/chat -> Groq

الصور:
Browser -> /api/image -> Groq Vision

الملفات:
Browser -> قراءة الملف محليًا -> /api/chat -> Groq

لا يوجد OpenAI.
============================================================
*/


/* =========================================================
   STATE
========================================================= */

const state = {

  messages: loadJSON(
    "tmd_messages",
    []
  ),

  conversations: loadJSON(
    "tmd_conversations",
    []
  ),

  theme:
    localStorage.getItem(
      "tmd_theme"
    ) || "dark",

  model:
    localStorage.getItem(
      "tmd_model"
    ) || "llama-3.1-8b-instant",

  busy: false,

  controller: null,

  selectedImage: null,

  selectedDocument: null,

  imageMode: "analyze"

};


/* =========================================================
   HELPERS
========================================================= */

function loadJSON(
  key,
  fallback
) {

  try {

    const value =
      localStorage.getItem(
        key
      );

    if (!value) {
      return fallback;
    }

    const parsed =
      JSON.parse(value);

    return parsed ?? fallback;

  } catch {

    return fallback;

  }

}


function $(id) {

  return document.getElementById(
    id
  );

}


/* =========================================================
   ELEMENTS
========================================================= */

const chat =
  $("chat");

const welcome =
  $("welcome");

const input =
  $("input");

const send =
  $("send");

const sidebar =
  $("sidebar");

const historyList =
  $("history");

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

const removeAttachment =
  $("removeAttachment");

const newChat =
  $("newChat");

const openSidebar =
  $("openSidebar");

const closeSidebar =
  $("closeSidebar");

const settingsBtn =
  $("settingsBtn");

const modalBackdrop =
  $("modalBackdrop");

const modalClose =
  $("modalClose");

const modelSelect =
  $("modelSelect");

const modelSelectSettings =
  $("modelSelectSettings");

const themeSelect =
  $("themeSelect");

const themeTop =
  $("themeTop");

const themeTopDesktop =
  $("themeTopDesktop");

const toastElement =
  $("toast");


/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_MODEL =
  "llama-3.1-8b-instant";

const ALLOWED_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile"
];

const MAX_DOCUMENT_SIZE =
  15 * 1024 * 1024;

const MAX_IMAGE_SIZE =
  20 * 1024 * 1024;


/* =========================================================
   SAVE
========================================================= */

function save() {

  localStorage.setItem(
    "tmd_messages",
    JSON.stringify(
      state.messages
    )
  );

  localStorage.setItem(
    "tmd_conversations",
    JSON.stringify(
      state.conversations
    )
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

let toastTimer = null;


function toast(
  message
) {

  if (!toastElement) {
    return;
  }

  toastElement.textContent =
    message;

  toastElement.classList.add(
    "show"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(
      () => {

        toastElement.classList.remove(
          "show"
        );

      },
      3000
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
  value
) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => {

      const map = {

        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#039;"

      };

      return map[
        character
      ];

    }
  );

}


/* =========================================================
   FORMAT MESSAGE
========================================================= */

function formatMessage(
  text
) {

  let value =
    escapeHTML(
      text
    );


  /*
   * Code blocks
   */

  value =
    value.replace(
      /```(?:[\w+-]+)?\n?([\s\S]*?)```/g,
      (_, code) => {

        return `
          <pre class="code-block">
            <code>${code}</code>
          </pre>
        `;

      }
    );


  /*
   * Inline code
   */

  value =
    value.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>'
    );


  /*
   * Bold
   */

  value =
    value.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );


  /*
   * Line breaks
   */

  value =
    value.replace(
      /\n/g,
      "<br>"
    );


  return value;

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

function setTheme(
  theme
) {

  if (
    theme !== "light" &&
    theme !== "dark"
  ) {

    theme =
      "dark";

  }


  state.theme =
    theme;


  document.documentElement.dataset.theme =
    theme;

  document.body.dataset.theme =
    theme;


  if (themeSelect) {

    themeSelect.value =
      theme;

  }


  save();

}


/* =========================================================
   THEME BUTTON
========================================================= */

function toggleTheme() {

  setTheme(

    state.theme === "dark"
      ? "light"
      : "dark"

  );

}


/* =========================================================
   MODEL
========================================================= */

function setModel(
  model
) {

  if (
    !ALLOWED_MODELS.includes(
      model
    )
  ) {

    model =
      DEFAULT_MODEL;

  }


  state.model =
    model;


  if (modelSelect) {

    modelSelect.value =
      model;

  }


  if (modelSelectSettings) {

    modelSelectSettings.value =
      model;

  }


  save();

}


/* =========================================================
   PLUS MENU
========================================================= */

function openPlusMenu() {

  if (!plusMenu) {
    return;
  }

  plusMenu.classList.remove(
    "hidden"
  );

  plusButton?.setAttribute(
    "aria-expanded",
    "true"
  );

}


function closePlusMenu() {

  if (!plusMenu) {
    return;
  }

  plusMenu.classList.add(
    "hidden"
  );

  plusButton?.setAttribute(
    "aria-expanded",
    "false"
  );

}


/* =========================================================
   ATTACHMENT
========================================================= */

function clearAttachment() {

  state.selectedImage =
    null;

  state.selectedDocument =
    null;


  if (imageInput) {

    imageInput.value =
      "";

  }


  if (documentInput) {

    documentInput.value =
      "";

  }


  if (attachmentPreview) {

    attachmentPreview.classList.add(
      "hidden"
    );

  }

}


function formatBytes(
  bytes
) {

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
      `${type === "image" ? "صورة" : "ملف"} • ${formatBytes(file.size)}`;

  }

}


/* =========================================================
   ADD MESSAGE
========================================================= */

function addMessage(
  role,
  content,
  meta = ""
) {

  if (!chat) {
    return null;
  }


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
            ? `<span>${escapeHTML(meta)}</span>`
            : ""
        }

      </div>


      <div class="msg-content">

        ${formatMessage(content)}

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
            "application/json",

          "Accept":
            "application/json"

        },

        body:
          JSON.stringify({

            model:
              state.model,

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


  if (!response.ok) {

    throw new Error(

      data?.error ||

      `خطأ من الخادم: ${response.status}`

    );

  }


  if (
    data?.ok !== true
  ) {

    throw new Error(

      data?.error ||

      "فشل الاتصال بـ Groq."

    );

  }


  const reply =
    data?.reply ||
    data?.message;


  if (
    typeof reply !== "string" ||
    !reply.trim()
  ) {

    throw new Error(
      "لم يرجع Groq أي إجابة."
    );

  }


  return reply.trim();

}


/* =========================================================
   GROQ VISION
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
            "application/json",

          "Accept":
            "application/json"

        },

        body:
          JSON.stringify({

            image:
              dataUrl,

            prompt:
              prompt ||
              "حلل هذه الصورة بالتفصيل."

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

    throw new Error(

      data?.error ||

      `خطأ في تحليل الصورة: ${response.status}`

    );

  }


  if (
    data?.ok !== true
  ) {

    throw new Error(

      data?.error ||

      "فشل تحليل الصورة."

    );

  }


  const reply =
    data?.reply ||
    data?.message;


  if (
    typeof reply !== "string" ||
    !reply.trim()
  ) {

    throw new Error(
      "لم يرجع Groq نتيجة للصورة."
    );

  }


  return reply.trim();

}


/* =========================================================
   FILE -> TEXT
========================================================= */

async function readFileAsText(
  file
) {

  const name =
    file.name.toLowerCase();


  /*
   * Text / Code
   */

  if (
    /\.(txt|md|js|jsx|ts|tsx|json|html|htm|css|scss|py|java|c|cpp|h|hpp|php|sql|xml|csv|yaml|yml|log)$/i
      .test(name)
  ) {

    return await file.text();

  }


  /*
   * DOCX
   */

  if (
    name.endsWith(
      ".docx"
    )
  ) {

    if (
      typeof window.mammoth ===
      "undefined"
    ) {

      throw new Error(
        "مكتبة قراءة Word غير محملة."
      );

    }


    const result =
      await window.mammoth.extractRawText({

        arrayBuffer:
          await file.arrayBuffer()

      });


    return result.value || "";

  }


  /*
   * PDF
   */

  if (
    name.endsWith(
      ".pdf"
    )
  ) {

    return await readPDF(
      file
    );

  }


  throw new Error(
    "صيغة الملف غير مدعومة حاليًا."
  );

}


/* =========================================================
   PDF READER
========================================================= */

async function readPDF(
  file
) {

  /*
   * PDF.js قد يكون محملًا
   * من index.html.
   */

  if (
    typeof window.pdfjsLib ===
    "undefined"
  ) {

    throw new Error(
      "قارئ PDF غير محمل. أضف PDF.js إلى index.html."
    );

  }


  const bytes =
    new Uint8Array(
      await file.arrayBuffer()
    );


  const pdf =
    await window.pdfjsLib
      .getDocument({
        data: bytes
      })
      .promise;


  const pages = [];


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    const page =
      await pdf.getPage(
        pageNumber
      );


    const content =
      await page.getTextContent();


    const text =
      content.items
        .map(
          item =>
            item.str || ""
        )
        .join(" ");


    pages.push(
      `### الصفحة ${pageNumber}\n${text}`
    );

  }


  return pages.join(
    "\n\n"
  );

}


/* =========================================================
   DOCUMENT PROMPT
========================================================= */

function createDocumentPrompt(
  file,
  text,
  userRequest
) {

  const MAX_TEXT =
    45000;


  let content =
    text;


  if (
    content.length >
    MAX_TEXT
  ) {

    content =
      content.slice(
        0,
        MAX_TEXT
      ) +

      "\n\n[تم اختصار جزء من الملف بسبب حجمه.]";

  }


  return `

أنت تقوم بتحليل ملف أرسله المستخدم إلى T.M.D AI.

اسم الملف:
${file.name}

نوع الملف:
${file.type || "غير محدد"}

محتوى الملف:
----------------------------

${content}

----------------------------

طلب المستخدم:
${
  userRequest ||
  "حلل الملف واذكر أهم المعلومات الموجودة فيه."
}

قواعد مهمة:
- اعتمد على محتوى الملف.
- لا تخترع معلومات غير موجودة.
- إذا لم تجد الإجابة في الملف، قل ذلك بوضوح.
- إذا طلب المستخدم تلخيصًا، قدم تلخيصًا منظمًا.
- إذا طلب استخراج معلومات، استخرجها بوضوح.
- أجب بالعربية إذا كان المستخدم يتحدث بالعربية.

`;

}


/* =========================================================
   FILE -> DATA URL
========================================================= */

function fileToDataURL(
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
   AUTO RESIZE INPUT
========================================================= */

function autoResize() {

  if (!input) {
    return;
  }


  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      180
    ) + "px";

}


/* =========================================================
   SEND BUTTON STATE
========================================================= */

function setSendingState(
  sending
) {

  if (!send) {
    return;
  }


  if (sending) {

    send.classList.add(
      "stop"
    );

    send.setAttribute(
      "aria-label",
      "إيقاف"
    );

    send.textContent =
      "■";

  } else {

    send.classList.remove(
      "stop"
    );

    send.setAttribute(
      "aria-label",
      "إرسال"
    );

    send.textContent =
      "↑";

  }

}


/* =========================================================
   HANDLE SEND
========================================================= */

async function handleSend() {

  /*
   * إذا كان يرسل بالفعل
   * الضغط يصبح إيقاف.
   */

  if (state.busy) {

    if (
      state.controller
    ) {

      state.controller.abort();

    }

    return;

  }


  const text =
    input
      ? input.value.trim()
      : "";


  /*
   * لا يوجد محتوى.
   */

  if (
    !text &&
    !state.selectedImage &&
    !state.selectedDocument
  ) {

    return;

  }


  state.busy =
    true;


  setSendingState(
    true
  );


  const userText =
    text ||

    (
      state.selectedImage
        ? "حلل هذه الصورة."
        : "حلل هذا الملف."
    );


  /*
   * إظهار رسالة المستخدم.
   */

  addMessage(

    "user",

    userText,

    state.selectedImage?.name ||
    state.selectedDocument?.name ||
    ""

  );


  /*
   * تنظيف خانة الكتابة
   * فورًا حتى لا تبقى الرسالة معلقة.
   */

  if (input) {

    input.value =
      "";

    autoResize();

  }


  /*
   * رسالة انتظار.
   */

  const assistantMessage =
    addMessage(
      "assistant",
      "جاري المعالجة…"
    );


  try {

    let reply = "";


    /* =====================================================
       IMAGE
    ===================================================== */

    if (
      state.selectedImage
    ) {

      const file =
        state.selectedImage;


      if (
        file.size >
        MAX_IMAGE_SIZE
      ) {

        throw new Error(
          "حجم الصورة أكبر من 20MB."
        );

      }


      const dataUrl =
        await fileToDataURL(
          file
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
       DOCUMENT
    ===================================================== */

    else if (
      state.selectedDocument
    ) {

      const file =
        state.selectedDocument;


      if (
        file.size >
        MAX_DOCUMENT_SIZE
      ) {

        throw new Error(
          "حجم الملف أكبر من 15MB."
        );

      }


      const extractedText =
        await readFileAsText(
          file
        );


      if (
        !extractedText.trim()
      ) {

        throw new Error(
          "لم أستطع استخراج نص من الملف."
        );

      }


      const prompt =
        createDocumentPrompt(
          file,
          extractedText,
          userText
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


    /*
     * عرض الرد.
     */

    if (
      assistantMessage
    ) {

      const content =
        assistantMessage.querySelector(
          ".msg-content"
        );


      if (content) {

        content.innerHTML =
          formatMessage(
            reply
          );

      }

    }


    save();


  } catch (error) {

    /*
     * إلغاء الطلب.
     */

    if (
      error?.name ===
      "AbortError"
    ) {

      if (
        assistantMessage
      ) {

        const content =
          assistantMessage.querySelector(
            ".msg-content"
          );


        if (content) {

          content.textContent =
            "تم إيقاف الطلب.";

        }

      }

      return;

    }


    console.error(
      "T.M.D AI Error:",
      error
    );


    const message =
      error?.message ||
      "حدث خطأ غير متوقع.";


    if (
      assistantMessage
    ) {

      const content =
        assistantMessage.querySelector(
          ".msg-content"
        );


      if (content) {

        content.innerHTML = `

          <span class="error-text">

            ${escapeHTML(message)}

          </span>

        `;

      }

    }


    toast(
      message
    );

  } finally {

    clearAttachment();


    state.busy =
      false;


    state.controller =
      null;


    setSendingState(
      false
    );


    scrollBottom();

  }

}


/* =========================================================
   RENDER HISTORY
========================================================= */

function renderHistory() {

  if (!historyList) {
    return;
  }


  historyList.innerHTML =
    "";


  const conversations =
    [
      ...state.conversations
    ].reverse();


  if (
    !conversations.length
  ) {

    historyList.innerHTML = `

      <div class="empty-history">

        لا توجد محادثات محفوظة

      </div>

    `;

    return;

  }


  conversations.forEach(
    conversation => {

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "history-item";


      button.textContent =
        conversation.title ||
        "محادثة جديدة";


      button.addEventListener(
        "click",
        () => {

          loadConversation(
            conversation
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
   LOAD CONVERSATION
========================================================= */

function loadConversation(
  conversation
) {

  if (!chat) {
    return;
  }


  chat
    .querySelectorAll(
      ".message"
    )
    .forEach(
      element =>
        element.remove()
    );


  if (welcome) {

    welcome.style.display =
      "none";

  }


  const messages =
    Array.isArray(
      conversation.messages
    )
      ? conversation.messages
      : [];


  state.messages =
    [
      ...messages
    ];


  messages.forEach(
    message => {

      addMessage(
        message.role,
        message.content
      );

    }
  );


  save();


  sidebar?.classList.remove(
    "open"
  );

}


/* =========================================================
   NEW CHAT
========================================================= */

function startNewChat() {

  /*
   * حفظ المحادثة الحالية.
   */

  if (
    state.messages.length
  ) {

    const firstUser =
      state.messages.find(
        message =>
          message.role ===
          "user"
      );


    const title =
      String(
        firstUser?.content ||
        "محادثة جديدة"
      ).slice(
        0,
        60
      );


    state.conversations.push({

      id:
        Date.now(),

      title:
        title,

      messages:
        [
          ...state.messages
        ]

    });

  }


  state.messages =
    [];


  if (chat) {

    chat
      .querySelectorAll(
        ".message"
      )
      .forEach(
        element =>
          element.remove()
      );

  }


  if (welcome) {

    welcome.style.display =
      "";

  }


  clearAttachment();

  renderHistory();

  save();


  input?.focus();

}


/* =========================================================
   EVENT: SEND
========================================================= */

send?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    handleSend();

  }
);


/* =========================================================
   EVENT: ENTER
========================================================= */

input?.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
        "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      handleSend();

    }

  }
);


input?.addEventListener(
  "input",
  autoResize
);


/* =========================================================
   EVENT: PLUS
========================================================= */

plusButton?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    event.stopPropagation();


    if (
      plusMenu?.classList.contains(
        "hidden"
      )
    ) {

      openPlusMenu();

    } else {

      closePlusMenu();

    }

  }
);


/* =========================================================
   CLOSE PLUS OUTSIDE
========================================================= */

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

analyzeDocumentButton?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    closePlusMenu();

    documentInput?.click();

  }
);


/* =========================================================
   DOCUMENT INPUT
========================================================= */

documentInput?.addEventListener(
  "change",
  () => {

    const file =
      documentInput.files?.[0];


    if (!file) {
      return;
    }


    state.selectedDocument =
      file;


    state.selectedImage =
      null;


    showAttachment(
      file,
      "document"
    );


    toast(
      `تم إرفاق الملف: ${file.name}`
    );

  }
);


/* =========================================================
   IMAGE ANALYSIS BUTTON
========================================================= */

addImageButton?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    state.imageMode =
      "analyze";

    closePlusMenu();

    imageInput?.click();

  }
);


/* =========================================================
   IMAGE EDIT BUTTON
========================================================= */

imageEditButton?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    state.imageMode =
      "edit";

    closePlusMenu();

    imageInput?.click();

  }
);


/* =========================================================
   IMAGE INPUT
========================================================= */

imageInput?.addEventListener(
  "change",
  () => {

    const file =
      imageInput.files?.[0];


    if (!file) {
      return;
    }


    if (
      !file.type.startsWith(
        "image/"
      )
    ) {

      toast(
        "الملف المحدد ليس صورة."
      );

      imageInput.value =
        "";

      return;

    }


    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {

      toast(
        "حجم الصورة أكبر من 20MB."
      );

      imageInput.value =
        "";

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
      "تم إرفاق الصورة. اكتب طلبك ثم اضغط إرسال."
    );

  }
);


/* =========================================================
   REMOVE ATTACHMENT
========================================================= */

removeAttachment?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    clearAttachment();

  }
);


/* =========================================================
   NEW CHAT BUTTON
========================================================= */

newChat?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    startNewChat();

  }
);


/* =========================================================
   SIDEBAR OPEN
========================================================= */

openSidebar?.addEventListener(
  "click",
  () => {

    sidebar?.classList.add(
      "open"
    );

  }
);


/* =========================================================
   SIDEBAR CLOSE
========================================================= */

closeSidebar?.addEventListener(
  "click",
  () => {

    sidebar?.classList.remove(
      "open"
    );

  }
);


/* =========================================================
   SETTINGS
========================================================= */

settingsBtn?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    modalBackdrop?.classList.remove(
      "hidden"
    );

  }
);


/* =========================================================
   CLOSE SETTINGS
========================================================= */

modalClose?.addEventListener(
  "click",
  () => {

    modalBackdrop?.classList.add(
      "hidden"
    );

  }
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
   MODEL SELECT
========================================================= */

modelSelect?.addEventListener(
  "change",
  event => {

    setModel(
      event.target.value
    );

  }
);


modelSelectSettings?.addEventListener(
  "change",
  event => {

    setModel(
      event.target.value
    );

  }
);


/* =========================================================
   THEME
========================================================= */

themeSelect?.addEventListener(
  "change",
  event => {

    setTheme(
      event.target.value
    );

  }
);


themeTop?.addEventListener(
  "click",
  toggleTheme
);


themeTopDesktop?.addEventListener(
  "click",
  toggleTheme
);


/* =========================================================
   INITIALIZE MODEL
========================================================= */

if (
  !ALLOWED_MODELS.includes(
    state.model
  )
) {

  state.model =
    DEFAULT_MODEL;

}


/* =========================================================
   INITIALIZE UI
========================================================= */

setTheme(
  state.theme
);


setModel(
  state.model
);


renderHistory();


autoResize();


/* =========================================================
   RESTORE CURRENT CHAT
========================================================= */

if (
  state.messages.length &&
  chat
) {

  if (welcome) {

    welcome.style.display =
      "none";

  }


  state.messages.forEach(
    message => {

      addMessage(
        message.role,
        message.content
      );

    }
  );

}


/* =========================================================
   READY
========================================================= */

console.log(
  "T.M.D AI loaded successfully — Groq Only"
);
