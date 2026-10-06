"use strict";

/* ===========================================================================
   Seedance 2.5 Studio — browser controller

   Generation is asynchronous. The browser starts a task through /api/video,
   stores only the task metadata locally, and resumes polling after a reload.
   Provider keys never enter this file or the browser.
   =========================================================================== */

(function () {
  const STORAGE_KEY = "tmd_seedance_2_5_jobs_v1";
  const POLL_MS = 8000;
  const MAX_RETRIES = 3;
  const MAX_IMAGE_DIRECT_BYTES = 1_900_000;
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif", "image/heic", "image/heif", "image/tiff"]);

  const state = {
    references: [],
    jobs: [],
    busy: false,
    polling: false,
    accessCode: ""
  };

  const el = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function emitToast(message, type) {
    if (window.TMDAI && typeof window.TMDAI.showToast === "function") {
      window.TMDAI.showToast(message, type);
      return;
    }
    if (el.status) el.status.textContent = message;
  }

  function setStatus(message, kind) {
    if (!el.status) return;
    el.status.textContent = String(message || "");
    el.status.dataset.kind = kind || "";
  }

  function safeReadJobs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return value
        .filter((job) => job && typeof job.id === "string")
        .slice(0, 12)
        .map((job) => ({
          id: job.id,
          status: String(job.status || "queued"),
          mode: String(job.mode || "text"),
          prompt: String(job.prompt || "").slice(0, 400),
          createdAt: Number(job.createdAt) || Date.now(),
          duration: Number.isFinite(Number(job.duration)) ? Number(job.duration) : undefined,
          videoUrl: typeof job.videoUrl === "string" ? job.videoUrl : "",
          lastFrameUrl: typeof job.lastFrameUrl === "string" ? job.lastFrameUrl : "",
          error: job.error && typeof job.error === "object" ? job.error : null,
          retryCount: Math.max(0, Math.min(MAX_RETRIES, Number(job.retryCount) || 0)),
          retryPayload: null
        }));
    } catch (error) {
      console.warn("Unable to restore Seedance jobs:", error);
      return [];
    }
  }

  function saveJobs() {
    try {
      const serializable = state.jobs.slice(0, 12).map((job) => ({
        id: job.id,
        status: job.status,
        mode: job.mode,
        prompt: job.prompt,
        createdAt: job.createdAt,
        duration: job.duration,
        videoUrl: job.videoUrl,
        lastFrameUrl: job.lastFrameUrl,
        error: job.error,
        retryCount: job.retryCount
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.warn("Unable to save Seedance jobs:", error);
    }
  }

  function escapeText(value) {
    return String(value || "");
  }

  function formatTime(timestamp) {
    try {
      return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
    } catch {
      return "الآن";
    }
  }

  function titleForMode(mode) {
    const labels = {
      text: "نص إلى فيديو",
      "first-frame": "صورة إلى فيديو — إطار بداية",
      "first-last": "إطار بداية ونهاية",
      reference: "فيديو بالمراجع",
      edit: "تعديل فيديو",
      extend: "تمديد فيديو"
    };
    return labels[mode] || "فيديو";
  }

  function statusLabel(status) {
    const labels = {
      queued: "في قائمة الانتظار",
      running: "قيد التوليد",
      succeeded: "اكتمل",
      failed: "فشل",
      cancelled: "أُلغي",
      expired: "انتهت المهمة"
    };
    return labels[status] || status || "قيد التحقق";
  }

  function isPending(status) {
    return status === "queued" || status === "running";
  }

  function setModalOpen(open) {
    if (!el.backdrop) return;
    el.backdrop.classList.toggle("hidden", !open);
    if (open) {
      updateModeUI();
      renderReferences();
      renderJobs();
      requestAnimationFrame(() => el.prompt?.focus());
    }
  }

  function setSourceUI() {
    const type = el.referenceType?.value || "image";
    const fromFile = el.referenceSourceMode?.value === "file";
    const canUseFile = type === "image";

    if (el.referenceSourceMode) {
      Array.from(el.referenceSourceMode.options).forEach((option) => {
        option.disabled = option.value === "file" && !canUseFile;
      });
      if (!canUseFile && fromFile) el.referenceSourceMode.value = "url";
    }

    const useFile = canUseFile && el.referenceSourceMode?.value === "file";
    el.referenceFileWrap?.classList.toggle("hidden", !useFile);
    el.referenceUrlWrap?.classList.toggle("hidden", useFile);
    if (el.referenceFile) el.referenceFile.accept = "image/jpeg,image/png,image/webp,image/bmp,image/gif,image/heic,image/heif,image/tiff";
    if (el.referenceSourceHint) {
      el.referenceSourceHint.textContent = useFile
        ? "الصورة تُضغط محليًا عند الحاجة ثم تُرسل كمرجع فعلي مع طلب الفيديو؛ لا تُحفظ في محادثاتك."
        : type === "video"
          ? "الصق رابط HTTPS عامًا أو asset:// لفيديو MP4/MOV. لا يمكن رفع فيديو كبير عبر وظيفة Vercel."
          : type === "audio"
            ? "الصق رابط HTTPS عامًا أو asset:// لملف WAV/MP3."
            : "الصق رابط HTTPS عامًا أو asset:// لصورة مرجعية.";
    }
  }

  function updateModeUI() {
    const mode = el.mode?.value || "text";
    const ratioLocked = ["first-frame", "first-last", "edit", "extend"].includes(mode);
    const editMode = mode === "edit";

    if (ratioLocked && el.ratio) el.ratio.value = "adaptive";
    if (el.ratio) el.ratio.disabled = ratioLocked;
    if (el.duration) el.duration.disabled = editMode;
    if (editMode && el.durationLabel) el.durationLabel.textContent = "يطابق الفيديو المصدر";
    else updateDurationLabel();

    if (el.modeRule) {
      const rules = {
        text: "نص فقط — اختر من 4 إلى 30 ثانية. لا تضف مراجع في هذا الوضع.",
        "first-frame": "أضف صورة واحدة فقط. يحافظ النموذج على نسبة إطار البداية تلقائيًا.",
        "first-last": "أضف صورتين فقط: الأولى بداية والثانية نهاية. النسبة تكيفية تلقائيًا.",
        reference: "أضف مراجع حقيقية: حتى 30 صورة و10 فيديوهات و10 أصوات، بإجمالي 50 مرجعًا.",
        edit: "أضف فيديوً مرجعيًا. المدة والنسبة تتبعان الفيديو المصدر تلقائيًا.",
        extend: "أضف فيديوً مرجعيًا واستمر في قصته. النسبة تتبع الفيديو المصدر تلقائيًا."
      };
      el.modeRule.textContent = rules[mode] || "";
    }

    if (el.addReferenceButton) {
      el.addReferenceButton.textContent = mode === "text" ? "أضف مرجعًا بعد تغيير الوضع" : "إضافة مرجع فعلي";
      el.addReferenceButton.disabled = mode === "text";
    }
    setSourceUI();
  }

  function updateDurationLabel() {
    const duration = clampDuration(el.duration?.value ?? 30);
    if (el.durationLabel) el.durationLabel.textContent = `${duration} ثانية`;
  }

  function validateRefForMode(reference, mode, onAdd) {
    const images = state.references.filter((item) => item.type === "image");
    const videos = state.references.filter((item) => item.type === "video");
    const audio = state.references.filter((item) => item.type === "audio");

    if (state.references.length >= 50) return "وصلت إلى الحد الأقصى: 50 مرجعًا.";
    if (reference.type === "image" && images.length >= 30) return "الحد الأقصى هو 30 صورة.";
    if (reference.type === "video" && videos.length >= 10) return "الحد الأقصى هو 10 فيديوهات.";
    if (reference.type === "audio" && audio.length >= 10) return "الحد الأقصى هو 10 مقاطع صوتية.";
    if (mode === "text") return "اختر وضع الإطار أو المراجع أولًا.";
    if ((mode === "first-frame" || mode === "first-last") && reference.type !== "image") return "أوضاع الإطار تقبل صورًا فقط.";
    if (mode === "first-frame" && state.references.length >= 1) return "وضع إطار البداية يقبل صورة واحدة فقط.";
    if (mode === "first-last" && state.references.length >= 2) return "وضع البداية والنهاية يقبل صورتين فقط.";
    if ((mode === "edit" || mode === "extend") && onAdd && reference.type !== "video" && !videos.length) {
      return "أضف الفيديو المرجعي أولًا في وضع التعديل أو التمديد.";
    }
    return "";
  }

  async function imageToDataURL(file) {
    if (!file || !imageTypes.has(file.type.toLowerCase())) {
      throw new Error("اختر صورة بصيغة مدعومة.");
    }
    if (file.size <= MAX_IMAGE_DIRECT_BYTES || file.type === "image/gif") {
      const direct = await readFileAsDataURL(file);
      if (direct.length <= 2_750_000) return direct;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const target = new Image();
        target.onload = () => resolve(target);
        target.onerror = () => reject(new Error("تعذر فتح الصورة المرجعية."));
        target.src = objectUrl;
      });
      const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const scale = Math.min(1, 1800 / Math.max(1, longest));
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.drawImage(image, 0, 0, width, height);
      let quality = 0.88;
      let result = canvas.toDataURL("image/jpeg", quality);
      while (result.length > 2_700_000 && quality > 0.42) {
        quality -= 0.08;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      if (result.length > 2_700_000) {
        throw new Error("الصورة كبيرة جدًا للإرسال المباشر. استخدم رابط HTTPS عامًا للصورة بدلًا منها.");
      }
      return result;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
      reader.readAsDataURL(file);
    });
  }

  async function addReference() {
    const mode = el.mode?.value || "text";
    const type = el.referenceType?.value || "image";
    const purpose = String(el.referencePurpose?.value || "").trim();
    const sourceMode = el.referenceSourceMode?.value || "url";
    let source = "";
    let name = "";

    if (!purpose) {
      setStatus("اكتب دور هذا المرجع بوضوح حتى يُرسل كخريطة مرجعية صريحة للنموذج.", "error");
      el.referencePurpose?.focus();
      return;
    }

    try {
      if (type === "image" && sourceMode === "file") {
        const file = el.referenceFile?.files?.[0];
        if (!file) throw new Error("اختر صورة مرجعية أولًا.");
        setStatus("يجري تجهيز الصورة المرجعية محليًا…", "info");
        source = await imageToDataURL(file);
        name = file.name;
      } else {
        source = String(el.referenceUrl?.value || "").trim();
        name = source.startsWith("asset://") ? source : source.split("/").pop() || "رابط مرجعي";
        if (!source) throw new Error("الصق رابط المرجع أولًا.");
        if (!(source.startsWith("https://") || source.startsWith("asset://"))) {
          throw new Error("استخدم رابط HTTPS عامًا أو asset://.");
        }
      }

      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, source, name, purpose };
      const validation = validateRefForMode(item, mode, true);
      if (validation) throw new Error(validation);
      state.references.push(item);
      if (el.referenceFile) el.referenceFile.value = "";
      if (el.referenceUrl) el.referenceUrl.value = "";
      if (el.referencePurpose) el.referencePurpose.value = "";
      setStatus("تمت إضافة المرجع وسيُرسل فعليًا مع طلب الفيديو.", "success");
      renderReferences();
    } catch (error) {
      setStatus(error?.message || "تعذرت إضافة المرجع.", "error");
    }
  }

  function renderReferences() {
    if (!el.references) return;
    el.references.innerHTML = "";
    const mode = el.mode?.value || "text";
    if (!state.references.length) {
      const empty = document.createElement("p");
      empty.className = "seedance-empty-references";
      empty.textContent = mode === "text" ? "لا يحتاج وضع النص فقط إلى مراجع." : "لم تتم إضافة مراجع بعد.";
      el.references.appendChild(empty);
      return;
    }

    state.references.forEach((reference, index) => {
      const item = document.createElement("article");
      item.className = "seedance-reference";
      const role = mode === "first-frame"
        ? "إطار البداية"
        : mode === "first-last"
          ? (index === 0 ? "إطار البداية" : "إطار النهاية")
          : reference.type === "image" ? "صورة مرجعية" : reference.type === "video" ? "فيديو مرجعي" : "صوت مرجعي";

      const icon = document.createElement("span");
      icon.className = "seedance-reference__icon";
      icon.textContent = reference.type === "image" ? "▧" : reference.type === "video" ? "▶" : "♪";
      const copy = document.createElement("div");
      copy.className = "seedance-reference__copy";
      const title = document.createElement("strong");
      title.textContent = `${role} ${index + 1}`;
      const name = document.createElement("span");
      name.textContent = reference.name || "مرجع";
      const mapping = document.createElement("small");
      mapping.textContent = reference.purpose;
      copy.append(title, name, mapping);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "seedance-reference__remove";
      remove.textContent = "إزالة";
      remove.setAttribute("aria-label", `إزالة المرجع ${index + 1}`);
      remove.addEventListener("click", () => {
        state.references.splice(index, 1);
        renderReferences();
      });
      item.append(icon, copy, remove);
      el.references.appendChild(item);
    });
  }

  function clampDuration(value) {
    const seconds = Math.round(Number(value));
    if (!Number.isFinite(seconds)) return 30;
    return Math.min(30, Math.max(4, seconds));
  }

  function buildPayload() {
    const mode = el.mode?.value || "text";
    const duration = clampDuration(el.duration?.value ?? 30);
    if (mode === "reference" && !state.references.length) throw new Error("أضف مرجعًا فعليًا واحدًا على الأقل.");
    if (mode === "first-frame" && (state.references.length !== 1 || state.references[0].type !== "image")) {
      throw new Error("أضف صورة واحدة فقط لإطار البداية.");
    }
    if (mode === "first-last" && (state.references.length !== 2 || state.references.some((item) => item.type !== "image"))) {
      throw new Error("أضف صورتين فقط لإطاري البداية والنهاية.");
    }
    if ((mode === "edit" || mode === "extend") && !state.references.some((item) => item.type === "video")) {
      throw new Error("أضف رابط فيديو مرجعيًا فعليًا أولًا.");
    }
    if (mode === "text" && state.references.length) throw new Error("أزل المراجع أو غيّر وضع الإنشاء.");

    const prompt = String(el.prompt?.value || "").trim();
    if (!prompt) throw new Error("اكتب وصف الفيديو بالإنجليزية أولًا.");
    if (prompt.length > 6000) throw new Error("وصف الفيديو طويل جدًا.");
    if (!el.rights?.checked) throw new Error("أكد أن لديك الحقوق والتفويض لاستخدام كل مرجع قبل الإرسال.");

    return {
      action: "create",
      prompt,
      mode,
      duration,
      ratio: el.ratio?.value || "16:9",
      resolution: el.resolution?.value || "720p",
      generateAudio: Boolean(el.generateAudio?.checked),
      watermark: Boolean(el.watermark?.checked),
      returnLastFrame: true,
      references: state.references.map((reference) => ({
        type: reference.type,
        source: reference.source,
        purpose: reference.purpose,
        name: reference.name
      })),
      accessCode: state.accessCode
    };
  }

  async function callVideo(payload) {
    const response = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `تعذر الاتصال بخدمة الفيديو (${response.status}).`);
      error.code = data.code;
      error.retryable = data.retryable === true;
      error.retryAfterSeconds = data.retryAfterSeconds;
      error.fallback = data.fallback;
      throw error;
    }
    return data;
  }

  async function createVideo() {
    if (state.busy) return;
    try {
      const payload = buildPayload();
      state.busy = true;
      el.generate?.setAttribute("aria-busy", "true");
      el.generate && (el.generate.disabled = true);
      setStatus("تم إرسال المهمة إلى Seedance 2.5. سيتابع الاستوديو الحالة تلقائيًا.", "info");
      const data = await callVideo(payload);
      const task = data.task;
      const job = {
        id: task.id,
        status: task.status || "queued",
        mode: payload.mode,
        prompt: payload.prompt,
        createdAt: Date.now(),
        duration: task.duration,
        videoUrl: task.videoUrl || "",
        lastFrameUrl: task.lastFrameUrl || "",
        error: task.error || null,
        retryCount: 0,
        retryPayload: payload
      };
      state.jobs.unshift(job);
      state.jobs = state.jobs.slice(0, 12);
      saveJobs();
      renderJobs();
      const notes = Array.isArray(data.notes) ? data.notes.filter((note) => note?.message) : [];
      if (notes.length) {
        setStatus(notes.map((note) => note.message).join(" "), "info");
      } else {
        setStatus("بدأت المهمة دون حدّ قديم قدره 15 ثانية — يمكن للنموذج إنشاء حتى 30 ثانية في طلب واحد.", "success");
      }
      emitToast("بدأ إنشاء فيديو Seedance 2.5.", "success");
      schedulePoll(800);
    } catch (error) {
      let message = error?.message || "تعذر بدء مهمة الفيديو.";
      if (error?.code === "SEEDANCE_DURATION_CAPPED" && error.fallback?.segments?.length) {
        const segments = error.fallback.segments.join(" + ");
        message = `طبقة الخدمة ما زالت تفرض حدًا قديمًا، لكن النموذج يدعم 30 ثانية. أنتج المقطع على جزأين (${segments} ثانية) ثم استخدم وضع "تمديد" على الجزء الأول للحصول على 30 ثانية متصلة.`;
      }
      setStatus(message, "error");
      emitToast(message, "error");
    } finally {
      state.busy = false;
      el.generate?.removeAttribute("aria-busy");
      if (el.generate) el.generate.disabled = false;
    }
  }

  function makeButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderJobs() {
    if (!el.jobs) return;
    el.jobs.innerHTML = "";
    if (!state.jobs.length) {
      const empty = document.createElement("p");
      empty.className = "seedance-empty-jobs";
      empty.textContent = "ستظهر مهام الفيديو ونتائجها هنا. تبقى المهمة تعمل في مزوّد الفيديو حتى لو أغلقت النافذة.";
      el.jobs.appendChild(empty);
      return;
    }

    state.jobs.forEach((job) => {
      const card = document.createElement("article");
      card.className = `seedance-job seedance-job--${job.status}`;
      const header = document.createElement("div");
      header.className = "seedance-job__header";
      const title = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = titleForMode(job.mode);
      const time = document.createElement("span");
      time.textContent = formatTime(job.createdAt);
      title.append(label, time);
      const status = document.createElement("span");
      status.className = "seedance-job__status";
      status.textContent = statusLabel(job.status);
      header.append(title, status);
      card.appendChild(header);

      const prompt = document.createElement("p");
      prompt.className = "seedance-job__prompt";
      prompt.textContent = escapeText(job.prompt);
      card.appendChild(prompt);

      if (job.error?.message) {
        const error = document.createElement("p");
        error.className = "seedance-job__error";
        error.textContent = job.error.message;
        card.appendChild(error);
      }

      if (job.videoUrl) {
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = job.videoUrl;
        video.className = "seedance-job__video";
        card.appendChild(video);
      }

      const actions = document.createElement("div");
      actions.className = "seedance-job__actions";
      if (isPending(job.status)) {
        actions.appendChild(makeButton("تحديث الحالة", "seedance-action", () => refreshJob(job)));
        if (job.status === "queued") actions.appendChild(makeButton("إلغاء", "seedance-action seedance-action--quiet", () => cancelJob(job)));
      }
      if (job.videoUrl) {
        const download = document.createElement("a");
        download.className = "seedance-action";
        download.href = job.videoUrl;
        download.target = "_blank";
        download.rel = "noopener noreferrer";
        download.textContent = "فتح / تنزيل MP4";
        actions.appendChild(download);
        actions.appendChild(makeButton("تمديد هذا الفيديو", "seedance-action seedance-action--quiet", () => prepareExtension(job)));
      }
      if (job.status === "failed" && job.retryPayload && job.retryCount < MAX_RETRIES) {
        actions.appendChild(makeButton(`إعادة المحاولة (${job.retryCount + 1}/${MAX_RETRIES})`, "seedance-action seedance-action--quiet", () => retryJob(job, false)));
      }
      if (job.lastFrameUrl) {
        const frame = document.createElement("a");
        frame.className = "seedance-last-frame";
        frame.href = job.lastFrameUrl;
        frame.target = "_blank";
        frame.rel = "noopener noreferrer";
        frame.textContent = "فتح إطار النهاية";
        actions.appendChild(frame);
      }
      if (actions.childNodes.length) card.appendChild(actions);

      const expiry = document.createElement("small");
      expiry.className = "seedance-job__expiry";
      expiry.textContent = job.videoUrl ? "رابط النتيجة مؤقت؛ نزّل الفيديو قبل انتهاء صلاحيته." : "المهمة مستضافة لدى مزود الفيديو وتُفحص تلقائيًا.";
      card.appendChild(expiry);
      el.jobs.appendChild(card);
    });
  }

  async function refreshJob(job) {
    try {
      const data = await callVideo({ action: "status", taskId: job.id, accessCode: state.accessCode });
      applyTask(job, data.task);
      saveJobs();
      renderJobs();
      if (job.status === "failed") await maybeAutoRetry(job);
    } catch (error) {
      setStatus(error?.message || "تعذر تحديث حالة المهمة.", "error");
    }
  }

  function applyTask(job, task) {
    job.status = task.status || job.status;
    job.duration = task.duration ?? job.duration;
    job.videoUrl = task.videoUrl || job.videoUrl;
    job.lastFrameUrl = task.lastFrameUrl || job.lastFrameUrl;
    job.error = task.error || null;
  }

  async function cancelJob(job) {
    try {
      await callVideo({ action: "cancel", taskId: job.id, accessCode: state.accessCode });
      job.status = "cancelled";
      saveJobs();
      renderJobs();
      setStatus("أُلغيت المهمة الموجودة في قائمة الانتظار.", "success");
    } catch (error) {
      setStatus(error?.message || "تعذر إلغاء المهمة.", "error");
    }
  }

  async function maybeAutoRetry(job) {
    const detail = String(job.error?.message || "");
    const retryable = /timeout|temporar|internal|service unavailable|rate limit/i.test(detail);
    if (retryable && job.retryPayload && job.retryCount < MAX_RETRIES) {
      await retryJob(job, true);
    }
  }

  async function retryJob(job, automatic) {
    if (!job.retryPayload || state.busy) return;
    try {
      state.busy = true;
      const data = await callVideo(job.retryPayload);
      job.id = data.task.id;
      job.status = data.task.status || "queued";
      job.videoUrl = "";
      job.lastFrameUrl = "";
      job.error = null;
      job.retryCount += 1;
      saveJobs();
      renderJobs();
      setStatus(automatic ? "أُعيدت محاولة المهمة تلقائيًا بسبب خطأ مؤقت." : "أُعيد إرسال مهمة الفيديو.", "info");
      schedulePoll(800);
    } catch (error) {
      job.retryCount += 1;
      job.error = { code: error?.code || "RETRY_FAILED", message: error?.message || "فشلت إعادة المحاولة." };
      saveJobs();
      renderJobs();
      if (!automatic) setStatus(job.error.message, "error");
    } finally {
      state.busy = false;
    }
  }

  function schedulePoll(wait = POLL_MS) {
    window.clearTimeout(schedulePoll.timer);
    if (!state.jobs.some((job) => isPending(job.status))) return;
    schedulePoll.timer = window.setTimeout(pollPendingJobs, wait);
  }

  async function pollPendingJobs() {
    if (state.polling) return;
    const pending = state.jobs.filter((job) => isPending(job.status));
    if (!pending.length) return;
    state.polling = true;
    try {
      for (const job of pending) {
        await refreshJob(job);
      }
    } finally {
      state.polling = false;
      schedulePoll();
    }
  }

  function prepareExtension(job) {
    if (!job.videoUrl) return;
    setModalOpen(true);
    if (el.mode) el.mode.value = "extend";
    updateModeUI();
    if (el.referenceType) el.referenceType.value = "video";
    if (el.referenceSourceMode) el.referenceSourceMode.value = "url";
    setSourceUI();
    if (el.referenceUrl) el.referenceUrl.value = job.videoUrl;
    if (el.referencePurpose) el.referencePurpose.value = "Continue the story, motion, timing, and camera language of this source video.";
    if (el.prompt && !el.prompt.value.trim()) {
      el.prompt.value = "Continue the source video naturally with coherent character motion, scene continuity, and camera movement.";
    }
    setStatus("أُلصق رابط الفيديو الناتج كمرجع للتمديد. اضغط «إضافة مرجع فعلي» ثم أنشئ المهمة.", "info");
  }

  function bindEvents() {
    document.querySelectorAll("[data-open-seedance-studio]").forEach((button) => {
      button.addEventListener("click", () => setModalOpen(true));
    });
    el.close?.addEventListener("click", () => setModalOpen(false));
    el.backdrop?.addEventListener("click", (event) => {
      if (event.target === el.backdrop) setModalOpen(false);
    });
    el.mode?.addEventListener("change", updateModeUI);
    el.duration?.addEventListener("input", updateDurationLabel);
    el.referenceType?.addEventListener("change", setSourceUI);
    el.referenceSourceMode?.addEventListener("change", setSourceUI);
    el.addReferenceButton?.addEventListener("click", addReference);
    el.generate?.addEventListener("click", createVideo);
    el.accessCode?.addEventListener("input", () => { state.accessCode = String(el.accessCode.value || ""); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.backdrop?.classList.contains("hidden")) setModalOpen(false);
    });
  }

  function cacheElements() {
    el.backdrop = byId("seedanceStudioBackdrop");
    el.close = byId("seedanceStudioClose");
    el.status = byId("seedanceStudioStatus");
    el.mode = byId("seedanceMode");
    el.modeRule = byId("seedanceModeRule");
    el.prompt = byId("seedancePrompt");
    el.duration = byId("seedanceDuration");
    el.durationLabel = byId("seedanceDurationLabel");
    el.ratio = byId("seedanceRatio");
    el.resolution = byId("seedanceResolution");
    el.generateAudio = byId("seedanceGenerateAudio");
    el.watermark = byId("seedanceWatermark");
    el.rights = byId("seedanceRights");
    el.accessCode = byId("seedanceAccessCode");
    el.referenceType = byId("seedanceReferenceType");
    el.referenceSourceMode = byId("seedanceReferenceSourceMode");
    el.referenceFileWrap = byId("seedanceReferenceFileWrap");
    el.referenceUrlWrap = byId("seedanceReferenceUrlWrap");
    el.referenceFile = byId("seedanceReferenceFile");
    el.referenceUrl = byId("seedanceReferenceUrl");
    el.referencePurpose = byId("seedanceReferencePurpose");
    el.referenceSourceHint = byId("seedanceReferenceSourceHint");
    el.addReferenceButton = byId("seedanceAddReference");
    el.references = byId("seedanceReferences");
    el.generate = byId("seedanceGenerate");
    el.jobs = byId("seedanceJobs");
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    if (!el.backdrop) return;
    state.jobs = safeReadJobs();
    bindEvents();
    updateDurationLabel();
    updateModeUI();
    renderReferences();
    renderJobs();
    schedulePoll(1500);
  });

  window.TMDSeedanceStudio = {
    open() { setModalOpen(true); },
    jobs: () => state.jobs.map((job) => ({ ...job, retryPayload: undefined })),
    refresh: pollPendingJobs
  };
})();
