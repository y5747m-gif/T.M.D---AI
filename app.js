"use strict";

const state = {
  messages: JSON.parse(localStorage.getItem("tmd_messages") || "[]"),
  conversations: JSON.parse(localStorage.getItem("tmd_conversations") || "[]"),
  theme: localStorage.getItem("tmd_theme") || "dark",
  model: localStorage.getItem("tmd_model") || "llama-3.1-8b-instant",
  busy: false,
  controller: null,
  selectedImage: null,
  selectedDocument: null,
  imageMode: "analyze"
};

const $ = s => document.querySelector(s);
const chat = $("#chat");
const welcome = $("#welcome");
const input = $("#input");
const send = $("#send");
const historyList = $("#history");
const sidebar = $("#sidebar");
const plusButton = $("#plusButton");
const plusMenu = $("#plusMenu");
const analyzeDocumentButton = $("#analyzeDocumentButton");
const addImageButton = $("#addImageButton");
const imageEditButton = $("#imageEditButton");
const imageInput = $("#imageInput");
const documentInput = $("#documentInput");
const imagePreviewContainer = $("#imagePreviewContainer");
const imagePreview = $("#imagePreview");
const imageFileName = $("#imageFileName");
const imageModeLabel = $("#imageModeLabel");
const removeImage = $("#removeImage");

function save() {
  localStorage.setItem("tmd_messages", JSON.stringify(state.messages));
  localStorage.setItem("tmd_conversations", JSON.stringify(state.conversations));
  localStorage.setItem("tmd_theme", state.theme);
  localStorage.setItem("tmd_model", state.model);
}

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function formatText(text) {
  let result = esc(text);
  result = result.replace(/```([\w+-]*)\n?([\s\S]*?)```/g,
    (_, lang, code) => `<pre><code>${code}</code></pre>`);
  result = result.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\n/g, "<br>");
  return result;
}

function render() {
  if (!chat) return;
  chat.innerHTML = "";

  if (!state.messages.length) {
    chat.appendChild(welcome);
    if (welcome) welcome.style.display = "";
  }

  state.messages.forEach(message => {
    const row = document.createElement("div");
    row.className = `message-row ${message.role === "user" ? "user" : "assistant"}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (message.role === "user" && message.imagePreview) {
      const img = document.createElement("img");
      img.src = message.imagePreview;
      img.className = "message-image";
      img.alt = "الصورة المرفقة";
      bubble.appendChild(img);
    }

    if (message.fileName) {
      const file = document.createElement("div");
      file.className = "message-file";
      file.textContent = `📄 ${message.fileName}`;
      bubble.appendChild(file);
    }

    if (message.content) {
      const text = document.createElement("div");
      text.innerHTML = message.role === "assistant"
        ? formatText(message.content)
        : esc(message.content).replace(/\n/g, "<br>");
      bubble.appendChild(text);
    }

    row.appendChild(bubble);
    chat.appendChild(row);
  });

  chat.scrollTop = chat.scrollHeight;
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = "";
  state.conversations.slice(-20).reverse().forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.textContent = item.title || "محادثة جديدة";
    button.addEventListener("click", () => {
      if (Array.isArray(item.messages)) {
        state.messages = item.messages;
        save();
        render();
      }
    });
    historyList.appendChild(button);
  });
}

function updateModelUI() {
  const select = $("#modelSelect");
  const modelName = $("#modelName");
  if (select) select.value = state.model;
  if (modelName) {
    const names = {
      "llama-3.1-8b-instant": "T.M.D Fast · Llama 3.1 8B",
      "llama-3.3-70b-versatile": "T.M.D Pro · Llama 3.3 70B",
      "meta-llama/llama-4-scout-17b-16e-instruct": "T.M.D Vision · Llama 4 Scout"
    };
    modelName.textContent = names[state.model] || "T.M.D AI";
  }
}

function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  document.body.classList.toggle("light", state.theme === "light");
  const select = $("#themeSelect");
  if (select) select.value = state.theme;
  save();
}

function resetAttachment() {
  state.selectedImage = null;
  state.selectedDocument = null;
  if (imageInput) imageInput.value = "";
  if (documentInput) documentInput.value = "";
  if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
  if (imagePreview) imagePreview.src = "";
  if (imageFileName) imageFileName.textContent = "";
  if (imageModeLabel) imageModeLabel.textContent = "";
}

function showMenu(show) {
  if (!plusMenu || !plusButton) return;
  plusMenu.classList.toggle("hidden", !show);
  plusButton.setAttribute("aria-expanded", String(show));
}

function showImagePreview(file, dataUrl) {
  if (!imagePreviewContainer) return;
  imagePreview.src = dataUrl;
  imageFileName.textContent = file.name;
  imageModeLabel.textContent = state.imageMode === "edit" ? "تعديل بالذكاء الاصطناعي" : "تحليل الصورة";
  imagePreviewContainer.classList.remove("hidden");
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractDocument(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".js") ||
      name.endsWith(".json") || name.endsWith(".html") || name.endsWith(".css") ||
      name.endsWith(".py") || name.endsWith(".csv")) {
    return await file.text();
  }

  if (name.endsWith(".pdf")) {
    if (!window.pdfjsLib && window.pdfjsReady) await window.pdfjsReady;
    if (!window.pdfjsLib) throw new Error("مكتبة PDF غير متاحة. أعد تحميل الصفحة.");
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(" "));
    }
    return pages.map((text, i) => `--- الصفحة ${i + 1} ---\n${text}`).join("\n\n");
  }

  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("مكتبة DOCX غير متاحة. أعد تحميل الصفحة.");
    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  throw new Error("نوع الملف غير مدعوم.");
}

async function handleDocument(file) {
  if (!file) return;
  const allowed = /\.(txt|js|json|html|css|py|md|csv|pdf|docx)$/i.test(file.name);
  if (!allowed) {
    toast("الملف غير مدعوم. استخدم PDF أو DOCX أو TXT أو ملفات الأكواد.");
    return;
  }

  try {
    toast("جاري قراءة الملف...");
    const text = await extractDocument(file);
    if (!text.trim()) {
      toast("لم يتم العثور على نص قابل للقراءة داخل الملف.");
      return;
    }

    state.selectedDocument = {
      name: file.name,
      text: text.slice(0, 120000)
    };
    state.selectedImage = null;
    if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
    toast("تم تجهيز الملف للتحليل.");
    input.focus();
  } catch (error) {
    console.error(error);
    toast(error.message || "تعذر قراءة الملف.");
  }
}

async function handleImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("اختر صورة صحيحة.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("حجم الصورة يجب ألا يتجاوز 5MB.");
    return;
  }

  try {
    const dataUrl = await readAsDataURL(file);
    state.selectedImage = { name: file.name, dataUrl };
    state.selectedDocument = null;
    showImagePreview(file, dataUrl);
    toast(state.imageMode === "edit" ? "الصورة جاهزة للتعديل." : "الصورة جاهزة للتحليل.");
    input.focus();
  } catch {
    toast("تعذر قراءة الصورة.");
  }
}

async function sendMessage() {
  if (state.busy) return;

  const text = input.value.trim();
  const hasImage = !!state.selectedImage;
  const hasDocument = !!state.selectedDocument;

  if (!text && !hasImage && !hasDocument) return;

  state.busy = true;
  send.disabled = true;

  const userMessage = {
    role: "user",
    content: text || (hasDocument ? `حلل هذا الملف: ${state.selectedDocument.name}` : "حلل هذه الصورة."),
    fileName: hasDocument ? state.selectedDocument.name : undefined,
    imagePreview: hasImage ? state.selectedImage.dataUrl : undefined
  };

  state.messages.push(userMessage);
  const document = state.selectedDocument;
  const image = state.selectedImage;
  input.value = "";
  resetAttachment();
  render();

  const apiMessage = {
    role: "user",
    content: document
      ? `${text || "حلل الملف المرفق بالتفصيل."}\n\nمحتوى الملف (${document.name}):\n\n${document.text}`
      : text || "حلل الصورة المرفقة."
  };

  if (image) {
    apiMessage.content = [
      { type: "text", text: text || (state.imageMode === "edit" ? "أريد تعديل هذه الصورة." : "حلل هذه الصورة بالتفصيل.") },
      { type: "image_url", image_url: { url: image.dataUrl } }
    ];
  }

  const history = state.messages.slice(-12).map(message => ({
    role: message.role,
    content: message.content
  }));

  history[history.length - 1] = apiMessage;

  const loading = document.createElement("div");
  loading.className = "message-row assistant";
  loading.innerHTML = '<div class="message-bubble">جاري التفكير…</div>';
  chat.appendChild(loading);
  chat.scrollTop = chat.scrollHeight;

  try {
    state.controller = new AbortController();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: state.controller.signal,
      body: JSON.stringify({
        model: image ? "meta-llama/llama-4-scout-17b-16e-instruct" : state.model,
        messages: history
      })
    });

    const data = await response.json().catch(() => ({}));
    loading.remove();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "تعذر الحصول على رد من Groq.");
    }

    state.messages.push({
      role: "assistant",
      content: data.reply
    });

    state.conversations.push({
      title: userMessage.content.slice(0, 60),
      messages: [...state.messages]
    });
    save();
    render();
  } catch (error) {
    loading.remove();
    if (error.name !== "AbortError") {
      state.messages.push({
        role: "assistant",
        content: `حدث خطأ: ${error.message}`
      });
      render();
    }
  } finally {
    state.busy = false;
    state.controller = null;
    send.disabled = false;
    input.focus();
  }
}

plusButton?.addEventListener("click", event => {
  event.stopPropagation();
  showMenu(plusMenu.classList.contains("hidden"));
});

document.addEventListener("click", event => {
  if (!event.target.closest(".plus-menu-wrapper")) showMenu(false);
});

analyzeDocumentButton?.addEventListener("click", () => {
  showMenu(false);
  documentInput?.click();
});

addImageButton?.addEventListener("click", () => {
  state.imageMode = "analyze";
  showMenu(false);
  imageInput?.click();
});

imageEditButton?.addEventListener("click", () => {
  state.imageMode = "edit";
  showMenu(false);
  imageInput?.click();
});

documentInput?.addEventListener("change", () => handleDocument(documentInput.files?.[0]));
imageInput?.addEventListener("change", () => handleImage(imageInput.files?.[0]));
removeImage?.addEventListener("click", resetAttachment);

send?.addEventListener("click", sendMessage);
input?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
input?.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});

$("#modelSelect")?.addEventListener("change", event => {
  state.model = event.target.value;
  save();
  updateModelUI();
});

$("#themeSelect")?.addEventListener("change", event => setTheme(event.target.value));
$("#themeTop")?.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));

$("#newChat")?.addEventListener("click", () => {
  if (state.messages.length) {
    state.conversations.push({
      title: state.messages.find(m => m.role === "user")?.content?.slice(0, 60) || "محادثة",
      messages: [...state.messages]
    });
  }
  state.messages = [];
  resetAttachment();
  save();
  render();
  input.focus();
});

$("#openSidebar")?.addEventListener("click", () => sidebar?.classList.add("open"));
$("#closeSidebar")?.addEventListener("click", () => sidebar?.classList.remove("open"));
$("#settingsBtn")?.addEventListener("click", () => $("#modalBackdrop")?.classList.remove("hidden"));
$("#modalClose")?.addEventListener("click", () => $("#modalBackdrop")?.classList.add("hidden"));
$("#modalBackdrop")?.addEventListener("click", event => {
  if (event.target.id === "modalBackdrop") event.currentTarget.classList.add("hidden");
});

setTheme(state.theme);
updateModelUI();
render();
