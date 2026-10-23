"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/* --- Minimal dependency-free DOM harness to run floating-assistant.js in Node --- */
function createFakeElement(tag) {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];

  const node = {
    tagName: String(tag || "div").toUpperCase(),
    dataset: {},
    style: {},
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    scrollTop: 0,
    scrollHeight: 40,
    videoWidth: 0,
    videoHeight: 0,
    srcObject: null,
    children,
    ownerDocument: null,
    classList: {
      add(...names) { names.forEach((n) => n && classes.add(n)); },
      remove(...names) { names.forEach((n) => classes.delete(n)); },
      toggle(name, force) {
        const shouldAdd = typeof force === "boolean" ? force : !classes.has(name);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
      contains(name) { return classes.has(name); }
    },
    set className(val) {
      classes.clear();
      String(val || "").split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    get className() {
      return Array.from(classes).join(" ");
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(child) {
      children.push(child);
      return child;
    },
    remove() {},
    focus() {},
    click() {
      const fns = listeners.get("click") || [];
      fns.forEach((fn) => fn({ preventDefault() {} }));
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    getBoundingClientRect() {
      return { left: 300, top: 600, width: 62, height: 168 };
    },
    set innerHTML(html) {
      this._html = String(html || "");
      children.length = 0;
      const dataElRegex = /<([a-z0-9]+)\b[^>]*\bdata-el="([^"]+)"[^>]*>/gi;
      let match;
      while ((match = dataElRegex.exec(this._html)) !== null) {
        const child = createFakeElement(match[1]);
        child.dataset.el = match[2];
        if (/\bhidden\b/i.test(match[0])) child.hidden = true;
        const spanChild = createFakeElement("span");
        child._spanChild = spanChild;
        children.push(child);
      }
    },
    get innerHTML() {
      return this._html || "";
    },
    querySelectorAll(selector) {
      if (selector === "[data-el]") {
        return children.filter((c) => c.dataset && c.dataset.el);
      }
      return [];
    },
    querySelector(selector) {
      if (selector === "span") return this._spanChild || createFakeElement("span");
      const m = selector.match(/^\[data-el=([^\]]+)\]$/);
      if (m) return children.find((c) => c.dataset.el === m[1]) || createFakeElement("span");
      return createFakeElement("span");
    }
  };
  return node;
}

function bootAssistantEnv({ android = true, fetchHandler = null } = {}) {
  const bridgeCalls = {
    auraStates: [],
    expanded: [],
    dockHeights: [],
    spoken: [],
    baselineMarked: 0
  };

  const storage = new Map();
  const body = createFakeElement("body");
  if (android) body.classList.add("tmd-assistant-page");

  const doc = {
    body,
    documentElement: createFakeElement("html"),
    styleSheets: [],
    createElement(tag) {
      const el = createFakeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  body.ownerDocument = doc;

  const prevWindow = global.window;
  const prevDoc = global.document;
  const prevStorage = global.localStorage;
  const prevRaf = global.requestAnimationFrame;
  const prevCaf = global.cancelAnimationFrame;
  const prevFetch = global.fetch;

  const winObj = {
    location: {
      href: android
        ? "https://t-m-d-ai.vercel.app/__tmd-local/assistant.html?android=1"
        : "https://t-m-d-ai.vercel.app/",
      search: android ? "?android=1" : ""
    },
    innerWidth: 412,
    innerHeight: 915,
    screen: { width: 412, height: 915, availWidth: 412, availHeight: 915 },
    navigator: { mediaDevices: {} },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false }),
    TmdAndroid: android
      ? {
          isNativeApp: () => true,
          setAuraState: (mode) => bridgeCalls.auraStates.push(mode),
          setOverlayExpanded: (v) => bridgeCalls.expanded.push(v),
          setDockHeightDp: (h) => bridgeCalls.dockHeights.push(h),
          speakText: (t) => bridgeCalls.spoken.push(t),
          stopSpeaking: () => {},
          getLatestScreenshot: () => "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/",
          getFrameChangePercent: () => 25,
          markFrameBaseline: () => { bridgeCalls.baselineMarked += 1; },
          startScreenShare: () => {},
          stopScreenShare: () => {}
        }
      : undefined
  };

  global.window = winObj;
  global.document = doc;
  global.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
  };
  global.requestAnimationFrame = (cb) => { cb(); return 1; };
  global.cancelAnimationFrame = () => {};
  if (fetchHandler) global.fetch = fetchHandler;

  const modulePath = require.resolve("../floating-assistant.js");
  delete require.cache[modulePath];
  require(modulePath);

  const api = winObj.__tmdFloatingAssistant;
  const cleanup = () => {
    api._test.destroy();
    global.window = prevWindow;
    global.document = prevDoc;
    global.localStorage = prevStorage;
    global.requestAnimationFrame = prevRaf;
    global.cancelAnimationFrame = prevCaf;
    global.fetch = prevFetch;
  };

  return { api, winObj, doc, bridgeCalls, cleanup };
}

test("new Prism-Aura logo SVG generates unique gradient IDs and valid vector asset exists", () => {
  const svgFile = fs.readFileSync(path.join(ROOT, "images/aura-bubble-logo.svg"), "utf8");
  assert.match(svgFile, /<svg\b[^>]*viewBox="0 0 160 160"/);
  assert.match(svgFile, /auraRing/);
  assert.match(svgFile, /auraStar/);

  const env = bootAssistantEnv({ android: false });
  try {
    const first = env.api._test.auraLogoSVG();
    const second = env.api._test.auraLogoSVG();
    assert.match(first, /tmdAuraRing_/);
    assert.notEqual(first, second, "each rendered logo instance must use unique SVG gradient IDs");
  } finally {
    env.cleanup();
  }
});

test("tapping the bubble ignites screen-edge colorful aura and opens transparent bottom chat dock", () => {
  const env = bootAssistantEnv({ android: true });
  try {
    const { api, bridgeCalls } = env;
    assert.equal(api.state.open, false);
    assert.equal(api.state.aura.classList.contains("is-active"), false);

    api.open();

    assert.equal(api.state.open, true);
    assert.equal(api.state.aura.classList.contains("is-active"), true, "screen-edge glow must activate immediately");
    assert.equal(api.state.aura.classList.contains("is-burst"), true, "initial tap burst glow must trigger");
    assert.equal(api.state.win.classList.contains("is-open"), true, "bottom chat dock must open");
    assert.equal(api.state.fab.classList.contains("is-open-hidden"), true, "bubble morphs into bottom dock");
    assert.ok(bridgeCalls.auraStates.includes("burst"), "native Android AmbientEdgeGlowView must receive burst state");
    assert.ok(bridgeCalls.expanded.includes(true), "native Android overlay must expand to bottom dock");
    assert.ok(bridgeCalls.dockHeights.some((h) => h >= 128), "native Android dock height must sync");

    api.close();

    assert.equal(api.state.open, false);
    assert.equal(api.state.aura.classList.contains("is-active"), false);
    assert.equal(bridgeCalls.auraStates.at(-1), "hidden");
    assert.equal(bridgeCalls.expanded.at(-1), false);
  } finally {
    env.cleanup();
  }
});

test("16x16 live broadcast frame signature detects screen changes accurately", () => {
  const env = bootAssistantEnv({ android: false });
  try {
    const { signatureFromRGBA, signatureDiffPercent } = env.api._test;
    const darkFrame = new Uint8ClampedArray(16 * 16 * 4);
    const brightFrame = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < brightFrame.length; i += 4) {
      brightFrame[i] = 230;
      brightFrame[i + 1] = 240;
      brightFrame[i + 2] = 255;
      brightFrame[i + 3] = 255;
    }
    const sigDark1 = signatureFromRGBA(darkFrame, 16, 16);
    const sigDark2 = signatureFromRGBA(darkFrame, 16, 16);
    const sigBright = signatureFromRGBA(brightFrame, 16, 16);

    assert.equal(signatureDiffPercent(sigDark1, sigDark2), 0, "identical screen frames must report 0% diff");
    assert.ok(signatureDiffPercent(sigDark1, sigBright) >= 80, "changed screen scene must report strong diff");
  } finally {
    env.cleanup();
  }
});

test("live screen broadcast attaches live screen frame to vision model and speaks Arabic response", async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, reply: "أرى شاشة هاتفك الآن، يمكنك المتابعة." };
      }
    };
  };

  const env = bootAssistantEnv({ android: true, fetchHandler: fakeFetch });
  try {
    const { api, winObj, bridgeCalls } = env;
    winObj.tmdAndroidScreenShareStarted();
    assert.equal(api.isLiveBroadcast(), true, "live screen broadcast state must be active");

    await api.ask("ماذا يظهر أمامي؟");

    assert.ok(requests.length >= 1, "must send vision request to /api/chat");
    const sent = requests[0].body;
    assert.equal(sent.model, "qwen/qwen3.8-27b", "live screen broadcast must use vision model");
    const lastMsg = sent.messages.at(-1);
    assert.ok(Array.isArray(lastMsg.content), "multimodal payload must include text + live screen image");
    assert.equal(lastMsg.content[1].type, "image_url");
    assert.match(lastMsg.content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.ok(bridgeCalls.spoken.some((s) => s.includes("أرى شاشة هاتفك")), "native Android TTS must speak reply");
    assert.ok(bridgeCalls.baselineMarked >= 1, "baseline frame must update after live analysis");
  } finally {
    env.cleanup();
  }
});

test("CSS and Android native sources enforce 100% transparent background, edge aura, and APK assets", () => {
  const css = fs.readFileSync(path.join(ROOT, "floating-assistant.css"), "utf8");
  assert.match(css, /\.tmd-edge-aura\b/, "CSS must include screen-edge colorful aura");
  assert.match(css, /background:\s*transparent\s*!important/, "assistant container must remain transparent");

  const stylesXml = fs.readFileSync(
    path.join(ROOT, "android-app/app/src/main/res/values/styles.xml"),
    "utf8"
  );
  assert.match(stylesXml, /android:windowIsTranslucent">true</);
  assert.match(stylesXml, /@android:color\/transparent/);

  const manifest = fs.readFileSync(
    path.join(ROOT, "android-app/app/src/main/AndroidManifest.xml"),
    "utf8"
  );
  assert.match(manifest, /@mipmap\/ic_launcher/);
  assert.match(manifest, /\.BootReceiver/);

  const overlayJava = fs.readFileSync(
    path.join(ROOT, "android-app/app/src/main/java/ai/tmd/assistant/OverlayService.java"),
    "utf8"
  );
  assert.match(overlayJava, /AmbientEdgeGlowView/);
  assert.match(overlayJava, /setAuraState/);
  assert.match(overlayJava, /setDockHeightDp/);
  assert.match(overlayJava, /speakText/);
  assert.match(overlayJava, /getFrameChangePercent/);

  const expectedCredit = "من معتصم عمرو الى M";
  for (const rel of [
    "floating-assistant.js",
    "assistant.html",
    "index.html",
    "api/chat.js",
    "app.js",
    "android-app/app/src/main/java/ai/tmd/assistant/MainActivity.java"
  ]) {
    const content = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(content.includes(expectedCredit), `${rel} must contain designer signature "${expectedCredit}"`);
  }
});
