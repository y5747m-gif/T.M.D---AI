"use strict";

/* ===========================================================================
   SPARTA AI — Smart Eraser Studio (أداة الإزالة الذكية)

   A ChatGPT/Astra-styled object-removal workspace:
     • paint the area to remove with a soft brush (pointer + stylus pressure)
     • instant local fill for a same-second preview (no network, no keys)
     • AI removal through /api/eraser, which keeps every provider key server-side
     • before/after compare slider, download, or send the result to the chat

   The mask leaves this file as a black/white PNG where white = remove,
   matching what the upstream inpainting models expect.
   =========================================================================== */

(function () {
  const MAX_WORKING_EDGE = 1600; /* longest side we edit; keeps payloads under Vercel's body limit */
  const MAX_DATA_URL_CHARS = 2_600_000;
  /* 1600² RGBA is ~10 MB per snapshot, so history is deliberately short. */
  const HISTORY_LIMIT = 12;
  const MIN_BRUSH = 4;
  const MAX_BRUSH = 220;

  const ENGINES = {
    auto: "تلقائي (الأسرع المتاح)",
    replicate: "Replicate — LaMa",
    openai: "OpenAI — gpt-image-1",
    huggingface: "Hugging Face — Inference"
  };

  const state = {
    image: null,
    fileName: "",
    width: 0,
    height: 0,
    brush: 54,
    hardness: 62,
    mode: "erase",
    engine: "auto",
    edgeFeather: 2,
    painting: false,
    strokeActive: false,
    lastPoint: null,
    busy: false,
    result: null,
    compare: 50,
    undoStack: [],
    redoStack: [],
    accessCode: ""
  };

  const el = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function toast(message, type) {
    if (window.TMDAI && typeof window.TMDAI.showToast === "function") {
      window.TMDAI.showToast(message, type);
      return;
    }
    setStatus(message, type === "error" ? "error" : "info");
  }

  function setStatus(message, kind) {
    if (!el.status) return;
    el.status.textContent = String(message || "");
    el.status.dataset.kind = kind || "";
  }

  function setBusy(busy, message) {
    state.busy = busy;
    if (el.stage) el.stage.dataset.busy = busy ? "true" : "false";
    if (el.aiButton) {
      el.aiButton.disabled = busy || !state.image || !hasMask();
      el.aiButton.classList.toggle("is-loading", busy);
    }
    if (el.fillButton) el.fillButton.disabled = busy || !state.image || !hasMask();
    if (busy && message) setStatus(message, "info");
  }

  /* ---------------- canvas plumbing ---------------- */

  function contextOf(canvas) {
    return canvas.getContext("2d", { willReadFrequently: true });
  }

  /* Canvases are shown at an exact integer fit inside the stage, so a CSS
     pixel maps 1:1 to the brush size the slider advertises. */
  function layoutStage() {
    if (!el.stage || !el.stack || !state.width || !state.height) return;
    if (el.backdrop && el.backdrop.classList.contains("hidden")) return; /* no real box yet */
    const rect = el.stage.getBoundingClientRect();
    const availableWidth = Math.max(80, rect.width - 28);
    const availableHeight = Math.max(80, rect.height - 28);
    const scale = Math.min(availableWidth / state.width, availableHeight / state.height, 1);
    const width = Math.max(1, Math.round(state.width * scale));
    const height = Math.max(1, Math.round(state.height * scale));
    el.stack.style.width = `${width}px`;
    el.stack.style.height = `${height}px`;
    state.displayScale = width / state.width;
  }

  function resizeCanvases(width, height) {
    [el.base, el.image, el.mask, el.after, el.compareBefore, el.compareAfter].forEach((canvas) => {
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
    });
    state.width = width;
    state.height = height;
    layoutStage();
  }

  function loadImageFromSource(source, name, anonymous) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      /* Remote provider URLs need CORS permission before we can read pixels. */
      if (anonymous) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("تعذر فتح الصورة."));
      image.src = source;
      if (name) state.fileName = String(name);
    });
  }

  async function openImage(source, name) {
    let image;
    try {
      image = await loadImageFromSource(source, name);
    } catch (error) {
      toast(error.message || "تعذر قراءة الصورة.", "error");
      return;
    }

    const scale = Math.min(1, MAX_WORKING_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    resizeCanvases(width, height);
    state.image = image;
    state.result = null;
    state.undoStack = [];
    state.redoStack = [];

    contextOf(el.base).drawImage(image, 0, 0, width, height);
    contextOf(el.image).drawImage(image, 0, 0, width, height);
    contextOf(el.mask).clearRect(0, 0, width, height);
    contextOf(el.after).clearRect(0, 0, width, height);
    if (el.compareBefore) {
      contextOf(el.compareBefore).clearRect(0, 0, width, height);
      contextOf(el.compareBefore).drawImage(image, 0, 0, width, height);
    }
    if (el.compareAfter) contextOf(el.compareAfter).clearRect(0, 0, width, height);

    if (el.stage) el.stage.dataset.empty = "false";
    if (el.emptyState) el.emptyState.hidden = true;
    if (el.workspace) el.workspace.hidden = false;
    if (el.resultPanel) el.resultPanel.hidden = true;
    if (el.fileMeta) {
      el.fileMeta.textContent = `${state.fileName || "صورة"} · ${width}×${height}`;
    }
    updateCompare(0);
    updateHistoryButtons();
    setBusy(false);
    setStatus("لوّن فوق العنصر الذي تريد إخفاءه، ثم اختر تعبئة فورية أو إزالة بالذكاء الاصطناعي.", "info");
  }

  async function handleFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      toast("الملف المحدد ليس صورة صالحة.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => openImage(String(reader.result || ""), file.name);
    reader.onerror = () => toast("تعذر قراءة الصورة.", "error");
    reader.readAsDataURL(file);
  }

  /* ---------------- mask painting ---------------- */

  function hasMask() {
    if (!state.image || !el.mask) return false;
    const data = contextOf(el.mask).getImageData(0, 0, state.width, state.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 8) return true;
    }
    return false;
  }

  function maskCoveragePercent() {
    if (!state.image || !el.mask) return 0;
    const data = contextOf(el.mask).getImageData(0, 0, state.width, state.height).data;
    let painted = 0;
    let total = 0;
    for (let index = 3; index < data.length; index += 4) {
      total += 1;
      if (data[index] > 8) painted += 1;
    }
    return total ? Math.round((painted / total) * 100) : 0;
  }

  function pushHistory() {
    if (!el.mask) return;
    const snapshot = contextOf(el.mask).getImageData(0, 0, state.width, state.height);
    state.undoStack.push(snapshot);
    if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function restore(snapshot) {
    contextOf(el.mask).putImageData(snapshot, 0, 0);
    renderMask();
    updateHistoryButtons();
    setBusy(state.busy);
  }

  function undo() {
    if (!state.undoStack.length) return;
    const current = contextOf(el.mask).getImageData(0, 0, state.width, state.height);
    state.redoStack.push(current);
    restore(state.undoStack.pop());
  }

  function redo() {
    if (!state.redoStack.length) return;
    const current = contextOf(el.mask).getImageData(0, 0, state.width, state.height);
    state.undoStack.push(current);
    restore(state.redoStack.pop());
  }

  function updateHistoryButtons() {
    if (el.undoButton) el.undoButton.disabled = !state.undoStack.length || state.busy;
    if (el.redoButton) el.redoButton.disabled = !state.redoStack.length || state.busy;
    if (el.clearButton) el.clearButton.disabled = !hasMask() || state.busy;
    if (el.coverage) el.coverage.textContent = `${maskCoveragePercent()}% من الصورة محدّد`;
    setBusy(state.busy);
  }

  function brushRadius(event) {
    const pressure = Number(event && event.pressure);
    const factor = Number.isFinite(pressure) && pressure > 0 ? 0.55 + pressure * 0.45 : 1;
    return Math.max(1, (state.brush / 2) * factor);
  }

  function pointFromEvent(event) {
    const rect = el.mask.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = state.width / rect.width;
    const scaleY = state.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function stamp(point, radius) {
    const ctx = contextOf(el.mask);
    ctx.globalCompositeOperation = state.mode === "erase" ? "source-over" : "destination-out";
    const hardness = Math.max(0, Math.min(1, state.hardness / 100));
    if (hardness >= 0.99) {
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const gradient = ctx.createRadialGradient(point.x, point.y, radius * hardness, point.x, point.y, Math.max(radius, 1));
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(radius, 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function stampLine(from, to, radius) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, radius * 0.28);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let index = 0; index <= steps; index += 1) {
      const ratio = index / steps;
      stamp({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }, radius);
    }
  }

  function renderMask() {
    if (!el.mask || !state.width) return;
    const alpha = contextOf(el.mask).getImageData(0, 0, state.width, state.height);
    const pixels = alpha.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const strength = pixels[index + 3];
      pixels[index] = 240;
      pixels[index + 1] = 68;
      pixels[index + 2] = 68;
      pixels[index + 3] = Math.round(strength * 0.55);
    }
    contextOf(el.mask).putImageData(alpha, 0, 0);
  }

  function startStroke(event) {
    if (!state.image || state.busy) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    pushHistory();
    state.painting = true;
    state.strokeActive = true;
    state.lastPoint = point;
    stamp(point, brushRadius(event));
    renderMask();
    try {
      el.mask.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is a nicety, not a requirement */
    }
  }

  function moveStroke(event) {
    const point = pointFromEvent(event);
    moveCursor(event);
    if (!state.painting || !point) return;
    event.preventDefault();
    const radius = brushRadius(event);
    stampLine(state.lastPoint || point, point, radius);
    state.lastPoint = point;
    renderMask();
  }

  function endStroke(event) {
    if (!state.painting) return;
    state.painting = false;
    state.strokeActive = false;
    state.lastPoint = null;
    if (event && event.pointerId !== undefined) {
      try {
        el.mask.releasePointerCapture(event.pointerId);
      } catch {
        /* nothing to release */
      }
    }
    updateHistoryButtons();
  }

  function moveCursor(event) {
    if (!el.stage || !el.cursor) return;
    const rect = el.stage.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    el.stage.dataset.cursorInside = inside ? "true" : "false";
    if (!inside) return;
    const scale = state.displayScale || 1;
    const size = Math.max(10, state.brush * scale);
    el.cursor.style.width = `${size}px`;
    el.cursor.style.height = `${size}px`;
    el.cursor.style.transform = `translate3d(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px, 0)`;
    el.cursor.dataset.mode = state.mode;
  }

  /* ---------------- instant local fill ---------------- */

  /* Pure pixel routine so it can be unit-tested without a browser canvas.
     Grows known pixels inward across the masked region: every pass turns the
     current boundary of the hole into an average of its known neighbours. */
  function diffuseIntoMask(source, target, maskAlpha, width, height, maxPasses) {
    const pixels = width * height;
    const isMask = new Uint8Array(pixels);
    let queue = [];
    let masked = 0;

    for (let pixel = 0; pixel < pixels; pixel += 1) {
      if (maskAlpha[pixel * 4 + 3] <= 8) continue;
      isMask[pixel] = 1;
      masked += 1;
      const x = pixel % width;
      const y = (pixel / width) | 0;
      const touchesKnown =
        (x > 0 && !isMask[pixel - 1]) ||
        (x < width - 1 && !isMask[pixel + 1]) ||
        (y > 0 && !isMask[pixel - width]) ||
        (y < height - 1 && !isMask[pixel + width]);
      if (touchesKnown) queue.push(pixel);
    }

    if (!masked) return { filled: 0, passes: 0 };

    const limit = Math.max(8, Math.min(1200, maxPasses || 400));
    let filled = 0;
    let passes = 0;

    while (queue.length && passes < limit) {
      const next = [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const pixel = queue[cursor];
        const x = pixel % width;
        const y = (pixel / width) | 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighbour = ny * width + nx;
            if (isMask[neighbour]) continue;
            const offset = neighbour * 4;
            r += source[offset];
            g += source[offset + 1];
            b += source[offset + 2];
            count += 1;
          }
        }
        if (!count) {
          /* No known neighbour yet — retry on the next pass. */
          next.push(pixel);
          continue;
        }
        const offset = pixel * 4;
        source[offset] = r / count;
        source[offset + 1] = g / count;
        source[offset + 2] = b / count;
        source[offset + 3] = 255;
        target[offset] = source[offset];
        target[offset + 1] = source[offset + 1];
        target[offset + 2] = source[offset + 2];
        target[offset + 3] = 255;
        isMask[pixel] = 0;
        filled += 1;
      }
      queue = next;
      passes += 1;
    }

    return { filled, passes, unfilled: masked - filled };
  }

  function fillMaskedRegion(maxPasses) {
    const width = state.width;
    const height = state.height;
    const maskData = contextOf(el.mask).getImageData(0, 0, width, height).data;
    const baseData = contextOf(el.base).getImageData(0, 0, width, height);
    const source = baseData.data;
    const out = contextOf(el.image).getImageData(0, 0, width, height);

    const result = diffuseIntoMask(source, out.data, maskData, width, height, maxPasses);
    if (!result.filled) return null;

    contextOf(el.image).putImageData(out, 0, 0);
    contextOf(el.after).clearRect(0, 0, width, height);
    contextOf(el.after).drawImage(el.image, 0, 0);
    if (el.compareAfter) {
      contextOf(el.compareAfter).clearRect(0, 0, width, height);
      contextOf(el.compareAfter).drawImage(el.image, 0, 0);
    }
    return result;
  }

  function applyInstantFill() {
    if (!state.image || !hasMask()) return;
    const startedAt = performance.now();
    const result = fillMaskedRegion(600);
    if (!result) {
      toast("حدّد مساحة أكبر قليلًا حتى تتمكن التعبئة من إيجاد حواف.", "error");
      return;
    }
    if (result.unfilled > 0) {
      setStatus(`بقيت ${result.unfilled} بكسل معزولة بلا حواف — وسّع التحديد قليلًا أو استخدم الإزالة بالذكاء الاصطناعي.`, "info");
    }
    state.result = { source: "local", dataUrl: el.image.toDataURL("image/png") };
    showResult("local");
    setStatus(
      `تمت التعبئة الفورية محليًا خلال ${Math.round(performance.now() - startedAt)}ms (${result.filled} بكسل) — بدون إرسال لأي خادم.`,
      "success"
    );
  }

  /* ---------------- AI removal ---------------- */

  function buildMaskDataUrl() {
    const canvas = document.createElement("canvas");
    canvas.width = state.width;
    canvas.height = state.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const painted = contextOf(el.mask).getImageData(0, 0, state.width, state.height);
    const pixels = painted.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const on = pixels[index + 3] > 8 ? 255 : 0;
      pixels[index] = on;
      pixels[index + 1] = on;
      pixels[index + 2] = on;
      pixels[index + 3] = 255;
    }
    ctx.putImageData(painted, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function baseImageDataUrl() {
    let dataUrl = el.base.toDataURL("image/jpeg", 0.92);
    if (dataUrl.length > MAX_DATA_URL_CHARS) dataUrl = el.base.toDataURL("image/jpeg", 0.72);
    return dataUrl;
  }

  async function removeWithAi() {
    if (!state.image) {
      toast("أضف صورة أولًا.", "error");
      return;
    }
    if (!hasMask()) {
      toast("لوّن أولًا فوق العنصر الذي تريد إزالته.", "error");
      return;
    }
    if (state.busy) return;

    const image = baseImageDataUrl();
    const mask = buildMaskDataUrl();
    if (image.length + mask.length > 9_000_000) {
      toast("الصورة كبيرة جدًا للإرسال. صغّرها أو اقصصها ثم أعد المحاولة.", "error");
      return;
    }

    setBusy(true, "جارٍ إرسال القناع إلى محرك الإزالة… قد يستغرق الأمر حتى دقيقة.");
    try {
      const response = await fetch("/api/eraser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(state.accessCode ? { "X-Eraser-Access-Code": state.accessCode } : {})
        },
        body: JSON.stringify({
          image,
          mask,
          prompt: el.prompt ? el.prompt.value : "",
          engine: state.engine === "auto" ? undefined : state.engine,
          edgeFeather: state.edgeFeather,
          accessCode: state.accessCode || undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const message = data.error || `فشل الطلب (${response.status}).`;
        setStatus(message, "error");
        toast(message, "error");
        setBusy(false);
        return;
      }

      state.result = { source: data.provider || "ai", dataUrl: String(data.image || ""), model: data.model || "" };
      await renderAiResult();
      showResult(data.provider || "ai");
      const fallbackNote = data.fallbackUsed ? " (تم التحويل تلقائيًا إلى محرك بديل)" : "";
      setStatus(`تمت الإزالة عبر ${data.provider || "المحرك"}${fallbackNote}. قارن النتيجة أو نزّلها.`, "success");
    } catch (error) {
      setStatus(error?.message || "تعذر الوصول إلى خدمة الإزالة.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* The provider works at its own size, so the returned image is composited
     back through the mask. Unpainted pixels stay exactly as in the original. */
  async function renderAiResult() {
    if (!state.result || !/^data:|^https?:/i.test(state.result.dataUrl)) return;
    const remote = /^https?:/i.test(state.result.dataUrl);
    const providerImage = await loadImageFromSource(state.result.dataUrl, null, remote);
    const ctx = contextOf(el.image);
    ctx.drawImage(providerImage, 0, 0, state.width, state.height);

    /* Keep the untouched pixels byte-identical to the source image. */
    let merged;
    try {
      merged = ctx.getImageData(0, 0, state.width, state.height);
    } catch (error) {
      /* A cross-origin provider URL without CORS headers taints the canvas.
         Fall back to the provider image as-is instead of losing the result. */
      console.warn("Eraser: cannot read provider pixels, using provider output directly.", error);
      contextOf(el.after).clearRect(0, 0, state.width, state.height);
      contextOf(el.after).drawImage(el.image, 0, 0);
      if (el.compareAfter) {
        contextOf(el.compareAfter).clearRect(0, 0, state.width, state.height);
        contextOf(el.compareAfter).drawImage(el.image, 0, 0);
      }
      return;
    }
    const original = contextOf(el.base).getImageData(0, 0, state.width, state.height);
    const painted = contextOf(el.mask).getImageData(0, 0, state.width, state.height).data;
    for (let index = 0; index < merged.data.length; index += 4) {
      if (painted[index + 3] > 8) continue;
      merged.data[index] = original.data[index];
      merged.data[index + 1] = original.data[index + 1];
      merged.data[index + 2] = original.data[index + 2];
      merged.data[index + 3] = original.data[index + 3];
    }
    ctx.putImageData(merged, 0, 0);

    contextOf(el.after).clearRect(0, 0, state.width, state.height);
    contextOf(el.after).drawImage(el.image, 0, 0);
    if (el.compareAfter) {
      contextOf(el.compareAfter).clearRect(0, 0, state.width, state.height);
      contextOf(el.compareAfter).drawImage(el.image, 0, 0);
    }
  }

  /* ---------------- result panel ---------------- */

  function showResult(source) {
    if (!el.resultPanel) return;
    el.resultPanel.hidden = false;
    if (el.stage) el.stage.dataset.hasResult = "true";
    if (el.compareBlock) el.compareBlock.hidden = false;
    if (el.resultBadge) {
      el.resultBadge.textContent =
        source === "local" ? "تعبئة فورية محلية" : `إزالة بالذكاء الاصطناعي · ${source}`;
    }
    updateCompare(state.compare);
  }

  function updateCompare(percent) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    state.compare = value;
    if (el.compareAfterWrap) el.compareAfterWrap.style.clipPath = `inset(0 0 0 ${value}%)`;
    if (el.compareDivider) el.compareDivider.style.insetInlineStart = `${value}%`;
    if (el.compareRange) el.compareRange.value = String(value);
  }

  function downloadResult() {
    if (!el.after || !state.result) {
      toast("لا توجد نتيجة بعد.", "error");
      return;
    }
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.download = `sparta-eraser-${stamp}.png`;
    link.href = el.after.toDataURL("image/png");
    link.click();
    toast("تم تنزيل الصورة بعد الإزالة.");
  }

  /* Reuses the composer's own attachment pipeline (app.js listens to #imageInput
     change), so no chat internals are duplicated here. */
  function sendToChat() {
    const app = window.TMDAI;
    const input = byId("imageInput");
    if (!app || !input || !el.after || !state.result) {
      toast("تعذر نقل النتيجة إلى المحادثة.", "error");
      return;
    }
    el.after.toBlob((blob) => {
      if (!blob) {
        toast("تعذر تجهيز النتيجة.", "error");
        return;
      }
      const file = new File([blob], "sparta-eraser-result.png", { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setModalOpen(false);
      toast("أُرفقت النتيجة في المحادثة — اكتب تعليماتك ثم أرسل.");
    }, "image/png");
  }

  function resetAll() {
    state.image = null;
    state.result = null;
    state.undoStack = [];
    state.redoStack = [];
    if (el.base) contextOf(el.base).clearRect(0, 0, state.width, state.height);
    if (el.image) contextOf(el.image).clearRect(0, 0, state.width, state.height);
    if (el.mask) contextOf(el.mask).clearRect(0, 0, state.width, state.height);
    if (el.after) contextOf(el.after).clearRect(0, 0, state.width, state.height);
    if (el.compareBefore) contextOf(el.compareBefore).clearRect(0, 0, state.width, state.height);
    if (el.compareAfter) contextOf(el.compareAfter).clearRect(0, 0, state.width, state.height);
    if (el.stage) el.stage.dataset.empty = "true";
    if (el.emptyState) el.emptyState.hidden = false;
    if (el.workspace) el.workspace.hidden = true;
    if (el.resultPanel) el.resultPanel.hidden = true;
    if (el.fileInput) el.fileInput.value = "";
    updateHistoryButtons();
    setStatus("اختر صورة للبدء.", "");
  }

  /* ---------------- modal ---------------- */

  function setModalOpen(open) {
    if (!el.backdrop) return;
    el.backdrop.classList.toggle("hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      /* The stage only has real dimensions once the modal is visible. */
      requestAnimationFrame(layoutStage);
      if (window.TMDAI && typeof window.TMDAI.closePlusMenu === "function") window.TMDAI.closePlusMenu();
      const source = window.TMDAI?.state?.selectedImage;
      if (!state.image && source?.dataURL) {
        openImage(source.dataURL, source.name || "صورة المحادثة");
      } else if (!state.image) {
        setStatus("اختر صورة للبدء.", "");
      }
    }
  }

  function updateBrushUi() {
    if (el.brushValue) el.brushValue.textContent = `${state.brush}px`;
    if (el.hardnessValue) el.hardnessValue.textContent = `${state.hardness}%`;
    if (el.cursor) el.cursor.dataset.mode = state.mode;
    document.querySelectorAll("[data-eraser-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.eraserMode === state.mode);
      button.setAttribute("aria-pressed", String(button.dataset.eraserMode === state.mode));
    });
    setBusy(state.busy);
  }

  function bindEvents() {
    document.querySelectorAll("[data-open-eraser-studio]").forEach((button) => {
      button.addEventListener("click", () => setModalOpen(true));
    });

    el.close?.addEventListener("click", () => setModalOpen(false));
    el.closeFooter?.addEventListener("click", () => setModalOpen(false));
    el.backdrop?.addEventListener("click", (event) => {
      if (event.target === el.backdrop) setModalOpen(false);
    });

    el.pickButton?.addEventListener("click", () => el.fileInput?.click());
    el.replaceButton?.addEventListener("click", () => el.fileInput?.click());
    el.fileInput?.addEventListener("change", (event) => handleFile(event.target.files?.[0]));
    el.dropzone?.addEventListener("click", () => el.fileInput?.click());
    ["dragenter", "dragover"].forEach((type) => {
      el.dropzone?.addEventListener(type, (event) => {
        event.preventDefault();
        el.dropzone.classList.add("is-over");
      });
      el.stage?.addEventListener(type, (event) => event.preventDefault());
    });
    ["dragleave", "drop"].forEach((type) => {
      el.dropzone?.addEventListener(type, (event) => {
        event.preventDefault();
        el.dropzone.classList.remove("is-over");
      });
    });
    el.dropzone?.addEventListener("drop", (event) => {
      event.preventDefault();
      handleFile(event.dataTransfer?.files?.[0]);
    });
    el.stage?.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    el.mask?.addEventListener("pointerdown", startStroke);
    el.mask?.addEventListener("pointermove", moveStroke);
    el.mask?.addEventListener("pointerup", endStroke);
    el.mask?.addEventListener("pointercancel", endStroke);
    el.mask?.addEventListener("pointerleave", endStroke);
    el.stage?.addEventListener("pointermove", moveCursor);
    el.stage?.addEventListener("pointerleave", () => {
      if (el.stage) el.stage.dataset.cursorInside = "false";
    });

    el.brushRange?.addEventListener("input", () => {
      state.brush = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, Number(el.brushRange.value) || MIN_BRUSH));
      updateBrushUi();
    });
    el.hardnessRange?.addEventListener("input", () => {
      state.hardness = Math.max(0, Math.min(100, Number(el.hardnessRange.value) || 0));
      updateBrushUi();
    });
    document.querySelectorAll("[data-eraser-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.eraserMode === "restore" ? "restore" : "erase";
        updateBrushUi();
      });
    });

    el.undoButton?.addEventListener("click", undo);
    el.redoButton?.addEventListener("click", redo);
    el.clearButton?.addEventListener("click", () => {
      if (!state.image) return;
      pushHistory();
      contextOf(el.mask).clearRect(0, 0, state.width, state.height);
      contextOf(el.image).drawImage(el.base, 0, 0, state.width, state.height);
      contextOf(el.after).clearRect(0, 0, state.width, state.height);
      state.result = null;
      if (el.resultPanel) el.resultPanel.hidden = true;
      if (el.compareBlock) el.compareBlock.hidden = true;
      if (el.stage) el.stage.dataset.hasResult = "false";
      updateHistoryButtons();
      setStatus("أُعيدت الصورة إلى أصلها. لوّن من جديد.", "info");
    });
    el.fillButton?.addEventListener("click", applyInstantFill);
    el.aiButton?.addEventListener("click", removeWithAi);
    el.engineSelect?.addEventListener("change", () => {
      state.engine = String(el.engineSelect.value || "auto");
    });
    el.edgeRange?.addEventListener("input", () => {
      state.edgeFeather = Math.max(0, Math.min(24, Number(el.edgeRange.value) || 0));
      if (el.edgeValue) el.edgeValue.textContent = `${state.edgeFeather}px`;
    });
    el.accessCode?.addEventListener("input", () => {
      state.accessCode = String(el.accessCode.value || "");
    });
    el.compareRange?.addEventListener("input", () => updateCompare(Number(el.compareRange.value)));
    el.downloadButton?.addEventListener("click", downloadResult);
    el.toChatButton?.addEventListener("click", sendToChat);
    el.resetButton?.addEventListener("click", resetAll);
    el.closeResultButton?.addEventListener("click", () => {
      if (el.resultPanel) el.resultPanel.hidden = true;
      if (el.compareBlock) el.compareBlock.hidden = true;
      if (el.stage) el.stage.dataset.hasResult = "false";
      contextOf(el.image).drawImage(el.base, 0, 0, state.width, state.height);
    });

    document.addEventListener("keydown", (event) => {
      if (!el.backdrop || el.backdrop.classList.contains("hidden")) return;
      const target = event.target;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(String(target.tagName || ""));
      if (event.key === "Escape") {
        setModalOpen(false);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey) return;
      if (event.key === "[") {
        state.brush = Math.max(MIN_BRUSH, state.brush - 6);
        if (el.brushRange) el.brushRange.value = String(state.brush);
        updateBrushUi();
      } else if (event.key === "]") {
        state.brush = Math.min(MAX_BRUSH, state.brush + 6);
        if (el.brushRange) el.brushRange.value = String(state.brush);
        updateBrushUi();
      } else if (event.key.toLowerCase() === "e") {
        state.mode = "erase";
        updateBrushUi();
      } else if (event.key.toLowerCase() === "r") {
        state.mode = "restore";
        updateBrushUi();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (!el.backdrop || el.backdrop.classList.contains("hidden")) return;
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      const key = String(event.key || "").toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "enter") {
        event.preventDefault();
        removeWithAi();
      }
    });
  }

  function cacheElements() {
    el.backdrop = byId("eraserStudioBackdrop");
    el.close = byId("eraserStudioClose");
    el.status = byId("eraserStudioStatus");
    el.stage = byId("eraserStage");
    el.stack = byId("eraserStack");
    el.workspace = byId("eraserWorkspace");
    el.emptyState = byId("eraserEmpty");
    el.dropzone = byId("eraserDropzone");
    el.pickButton = byId("eraserPick");
    el.replaceButton = byId("eraserReplace");
    el.fileInput = byId("eraserFile");
    el.fileMeta = byId("eraserFileMeta");
    el.base = byId("eraserBase");
    el.image = byId("eraserImage");
    el.mask = byId("eraserMask");
    el.after = byId("eraserAfter");
    el.compareBefore = byId("eraserCompareBefore");
    el.compareAfter = byId("eraserCompareAfter");
    el.compareAfterWrap = byId("eraserCompareAfterWrap");
    el.compareDivider = byId("eraserCompareDivider");
    el.compareBlock = byId("eraserCompare");
    el.compareRange = byId("eraserCompareRange");
    el.cursor = byId("eraserCursor");
    el.brushRange = byId("eraserBrush");
    el.brushValue = byId("eraserBrushValue");
    el.hardnessRange = byId("eraserHardness");
    el.hardnessValue = byId("eraserHardnessValue");
    el.undoButton = byId("eraserUndo");
    el.redoButton = byId("eraserRedo");
    el.clearButton = byId("eraserClear");
    el.fillButton = byId("eraserFill");
    el.aiButton = byId("eraserAi");
    el.engineSelect = byId("eraserEngine");
    el.edgeRange = byId("eraserEdge");
    el.edgeValue = byId("eraserEdgeValue");
    el.prompt = byId("eraserPrompt");
    el.accessCode = byId("eraserAccessCode");
    el.coverage = byId("eraserCoverage");
    el.resultPanel = byId("eraserResult");
    el.resultBadge = byId("eraserResultBadge");
    el.downloadButton = byId("eraserDownload");
    el.toChatButton = byId("eraserToChat");
    el.resetButton = byId("eraserReset");
    el.closeResultButton = byId("eraserResultClose");
    el.closeFooter = byId("eraserCloseFooter");
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    if (!el.backdrop) return;
    bindEvents();
    updateBrushUi();
    updateHistoryButtons();
    if (el.stage) el.stage.dataset.empty = "true";
    window.addEventListener("resize", () => {
      if (el.backdrop && !el.backdrop.classList.contains("hidden")) layoutStage();
    });
  });

  window.TMDEraserStudio = {
    /* Exported for the Node test-suite; the browser never calls it directly. */
    _test: { diffuseIntoMask },
    open() {
      setModalOpen(true);
    },
    close() {
      setModalOpen(false);
    },
    openWithImage(dataUrl, name) {
      setModalOpen(true);
      if (dataUrl) openImage(dataUrl, name);
    },
    state: () => ({ ...state, undoStack: undefined, redoStack: undefined })
  };
})();
