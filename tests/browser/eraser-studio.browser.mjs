/* DOM-level verification for the Smart Eraser Studio.

   Loads the REAL index.html and the REAL eraser-studio.js inside jsdom and
   drives the UI the way a user would. Rasterisation (canvas pixels) is stubbed,
   because no headless canvas is available in this environment — everything
   else below executes the shipped code paths.

   Run with:  node tests/browser/eraser-studio.browser.mjs
   (not part of `npm test`, which stays dependency-free)
   */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

let failures = 0;
let checks = 0;
function check(label, condition, extra) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
}
function equal(label, actual, expected) {
  check(label, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const html = readFileSync(resolve(root, "index.html"), "utf8");
const studio = readFileSync(resolve(root, "eraser-studio.js"), "utf8");

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (message) => console.log("  [page error]", String(message).slice(0, 160)));

const dom = new JSDOM(html, {
  url: "http://localhost:3000/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
  resources: undefined,
  virtualConsole
});
const { window } = dom;
const { document } = window;

/* --- minimal stand-ins for the raster APIs jsdom does not implement -------- */
const contexts = new Map();
window.__lastMask = null;
class FakeImageData {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}
window.ImageData = FakeImageData;
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  if (contexts.has(this)) return contexts.get(this);
  const canvas = this;
  const ctx = {
    canvas,
    drawImageCalls: 0,
    cleared: 0,
    strokes: 0,
    drawImage(image) {
      this.drawImageCalls += 1;
      if (image && image.naturalWidth && canvas.width) {
        /* pretend the draw resized the canvas to the source */
      }
    },
    clearRect() {
      this.cleared += 1;
    },
    getImageData(x, y, w, h) {
      if (canvas.id === "eraserMask" && window.__lastMask) {
        const copy = new FakeImageData(w, h);
        copy.data.set(window.__lastMask.data.subarray(0, copy.data.length));
        return copy;
      }
      if (canvas.id === "eraserBase") {
        const data = new FakeImageData(w, h);
        for (let index = 0; index < data.data.length; index += 4) {
          data.data[index] = 40;
          data.data[index + 1] = 120;
          data.data[index + 2] = 200;
          data.data[index + 3] = 255;
        }
        return data;
      }
      return new FakeImageData(w, h);
    },
    putImageData(imageData) {
      if (canvas.id === "eraserMask") window.__lastMask = imageData;
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    save() {},
    restore() {},
    beginPath() {},
    arc() {
      this.strokes += 1;
    },
    fill() {},
    set fillStyle(_value) {},
    get fillStyle() {
      return "#000";
    },
    set globalCompositeOperation(value) {
      this.lastComposite = value;
    },
    get globalCompositeOperation() {
      return this.lastComposite || "source-over";
    }
  };
  contexts.set(canvas, ctx);
  return ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = () =>
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAEQQBQSqkzGgAAAAASUVORK5CYII=";
window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
  callback(new window.Blob(["x"], { type: "image/png" }));
};
window.Image = class FakeImage {
  constructor() {
    this.naturalWidth = 640;
    this.naturalHeight = 480;
    this.width = 640;
    this.height = 480;
  }
  set src(_value) {
    window.setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() {
    return this._src || "";
  }
};

/* jsdom reports zero-sized boxes; the stage math needs real numbers. */
const rectFor = (width, height, left = 0, top = 0) => ({
  width,
  height,
  left,
  top,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON() {
    return this;
  }
});

/* --- run the shipped module ---------------------------------------------- */
const script = document.createElement("script");
script.textContent = studio;
document.body.appendChild(script);
document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

const $ = (id) => document.getElementById(id);
const backdrop = $("eraserStudioBackdrop");

/* --- 1. every entry point opens the studio ------------------------------- */
console.log("\n[1] entry points");
const entryIds = ["openEraserStudioBtn", "openEraserFromPlus"];
check("topbar + plus-menu buttons exist", entryIds.every((id) => $(id)));
check("welcome card exists", Boolean(document.querySelector(".welcome-card.card--eraser")));
check("studio starts closed", backdrop.classList.contains("hidden"));

$("openEraserStudioBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("clicking «أداة الإزالة» opens the modal", !backdrop.classList.contains("hidden"));
$("eraserStudioClose").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("the header X closes it", backdrop.classList.contains("hidden"));
document.querySelector(".welcome-card.card--eraser").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("the welcome card opens it", !backdrop.classList.contains("hidden"));

/* --- 2. an image lands on the stage ------------------------------------- */
console.log("\n[2] opening an image");
await window.TMDEraserStudio.openWithImage("data:image/png;base64,AAAA", "vacation.png");
await new Promise((r) => window.setTimeout(r, 10));

equal("stage leaves the empty state", $("eraserStage").dataset.empty, "false");
equal("empty dropzone hidden", $("eraserEmpty").hidden, true);
equal("workspace visible", $("eraserWorkspace").hidden, false);
check("file meta shows name and size", /vacation\.png.*640×480/.test($("eraserFileMeta").textContent), $("eraserFileMeta").textContent);
equal("base canvas sized to the working image", $("eraserBase").width, 640);
equal("mask canvas sized to the working image", $("eraserMask").width, 640);
check("status explains the workflow", /لوّن/.test($("eraserStudioStatus").textContent));

/* --- 3. brush controls -------------------------------------------------- */
console.log("\n[3] brush controls");
$("eraserBrush").value = "86";
$("eraserBrush").dispatchEvent(new window.Event("input", { bubbles: true }));
equal("brush label follows the slider", $("eraserBrushValue").textContent, "86px");
$("eraserHardness").value = "30";
$("eraserHardness").dispatchEvent(new window.Event("input", { bubbles: true }));
equal("hardness label follows the slider", $("eraserHardnessValue").textContent, "30%");

document.querySelector('[data-eraser-mode="restore"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("restore mode activates", document.querySelector('[data-eraser-mode="restore"]').classList.contains("is-active"));
document.querySelector('[data-eraser-mode="erase"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("erase mode activates", document.querySelector('[data-eraser-mode="erase"]').classList.contains("is-active"));

document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "[", bubbles: true }));
check("[ shrinks the brush", window.TMDEraserStudio.state().brush < 86, String(window.TMDEraserStudio.state().brush));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "]", bubbles: true }));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "]", bubbles: true }));
check("] grows it back", window.TMDEraserStudio.state().brush > 80, String(window.TMDEraserStudio.state().brush));

/* --- 4. painting a mask ------------------------------------------------- */
console.log("\n[4] painting");
const mask = $("eraserMask");
mask.getBoundingClientRect = () => rectFor(640, 480);
$("eraserStage").getBoundingClientRect = () => rectFor(700, 520, 10, 10);
const maskCtx = mask.getContext("2d");

function pointer(type, x, y, pressure) {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pressure: pressure === undefined ? 0 : pressure,
    pointerId: 1
  });
  mask.dispatchEvent(event);
}

function stroke(x, y) {
  pointer("pointerdown", x, y, 0.5);
  pointer("pointermove", x + 20, y + 12, 0.6);
  pointer("pointerup", x + 20, y + 12);
}

stroke(120, 120);
check("the brush stamped the mask", maskCtx.strokes > 0, `strokes=${maskCtx.strokes}`);
check("history recorded the stroke", $("eraserUndo").disabled === false);
check("coverage label updated", /%/.test($("eraserCoverage").textContent), $("eraserCoverage").textContent);
check("AI button still locked while the canvas holds no paint", $("eraserAi").disabled === true);

/* The stubbed context cannot rasterise, so seed real painted pixels and keep
   drawing — the buttons must react to a canvas that really has paint on it. */
window.__lastMask = (() => {
  const data = new window.ImageData(640, 480);
  for (let y = 100; y < 200; y += 1) {
    for (let x = 100; x < 260; x += 1) data.data[(y * 640 + x) * 4 + 3] = 255;
  }
  return data;
})();
stroke(140, 140);

check("clear became available", $("eraserClear").disabled === false);
check("AI button unlocked once a mask exists", $("eraserAi").disabled === false);
check("instant-fill button unlocked once a mask exists", $("eraserFill").disabled === false);
check("coverage reports a non-zero share", /(?:[1-9]\d*)%/.test($("eraserCoverage").textContent), $("eraserCoverage").textContent);

/* --- 5. instant local fill runs on the real routine --------------------- */
console.log("\n[5] instant fill");
$("eraserFill").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("result panel opened", $("eraserResult").hidden === false);
equal("result badge names the local engine", $("eraserResultBadge").textContent, "تعبئة فورية محلية");
check("status reports the pixel count", /بكسل/.test($("eraserStudioStatus").textContent), $("eraserStudioStatus").textContent);
equal("compare block shown", $("eraserCompare").hidden, false);

$("eraserCompareRange").value = "35";
$("eraserCompareRange").dispatchEvent(new window.Event("input", { bubbles: true }));
check(
  "compare slider clips the after layer",
  /inset\(0 0 0 35%\)/.test($("eraserCompareAfterWrap").style.clipPath),
  $("eraserCompareAfterWrap").style.clipPath
);
check("compare divider follows", /35%/.test($("eraserCompareDivider").style.insetInlineStart));

/* --- 6. AI removal posts the mask to the server ------------------------- */
console.log("\n[6] AI removal request");
$("eraserEngine").value = "replicate";
$("eraserEngine").dispatchEvent(new window.Event("change", { bubbles: true }));
$("eraserPrompt").value = "keep the brick wall";
$("eraserAccessCode").value = "owner-only";
$("eraserAccessCode").dispatchEvent(new window.Event("input", { bubbles: true }));

let captured = null;
window.fetch = async (url, options) => {
  captured = { url: String(url), options };
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        provider: "replicate",
        model: "cjwbw/la-ma",
        image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAEQQBQSqkzGgAAAAASUVORK5CYII="
      };
    }
  };
};

$("eraserAi").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => window.setTimeout(r, 30));

check("the studio called /api/eraser", captured && captured.url === "/api/eraser", captured && captured.url);
equal("POST only", captured.options.method, "POST");
equal("JSON body", captured.options.headers["Content-Type"], "application/json");
equal("access code rides in a header", captured.options.headers["X-Eraser-Access-Code"], "owner-only");
const sent = JSON.parse(captured.options.body);
check("image is a data URL", /^data:image\//.test(sent.image));
check("mask is a PNG data URL", /^data:image\/png/.test(sent.mask));
equal("chosen engine is forwarded", sent.engine, "replicate");
equal("prompt is forwarded", sent.prompt, "keep the brick wall");
equal("edge feather is forwarded", sent.edgeFeather, 2);
equal("access code is forwarded in the body too", sent.accessCode, "owner-only");

await new Promise((r) => window.setTimeout(r, 30));
check("badge names the provider after success", /replicate/.test($("eraserResultBadge").textContent), $("eraserResultBadge").textContent);
equal("stage marks that a result exists", $("eraserStage").dataset.hasResult, "true");
check("status reports success", $("eraserStudioStatus").dataset.kind === "success", $("eraserStudioStatus").dataset.kind);

/* --- 7. server errors surface instead of vanishing ---------------------- */
console.log("\n[7] error handling");
window.fetch = async () => ({
  ok: false,
  status: 503,
  async json() {
    return { ok: false, code: "ERASER_NOT_CONFIGURED", error: "لم يتم إعداد محرك إزالة بعد." };
  }
});
$("eraserAi").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => window.setTimeout(r, 20));
equal("status turns into an error", $("eraserStudioStatus").dataset.kind, "error");
check("the server message is shown verbatim", /لم يتم إعداد محرك إزالة/.test($("eraserStudioStatus").textContent));
check("the AI button is usable again", $("eraserAi").disabled === false && !$("eraserAi").classList.contains("is-loading"));

/* --- 8. undo / clear / reset ------------------------------------------- */
console.log("\n[8] undo, clear, reset");
const strokesBefore = maskCtx.strokes;
$("eraserUndo").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("undo restores a snapshot", window.__lastMask !== null);
check("redo became available", $("eraserRedo").disabled === false);

$("eraserClear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("clear hid the result panel", $("eraserResult").hidden === true);
equal("clear reset the stage flag", $("eraserStage").dataset.hasResult, "false");

$("eraserReset").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
equal("«صورة جديدة» returns to the empty state", $("eraserStage").dataset.empty, "true");
equal("workspace hidden again", $("eraserWorkspace").hidden, true);
check("AI button disabled without an image", $("eraserAi").disabled === true);
check("no stray strokes after reset", maskCtx.strokes >= strokesBefore);

/* --- 9. Escape closes --------------------------------------------------- */
console.log("\n[9] closing");
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("Escape closes the studio", backdrop.classList.contains("hidden"));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
window.close();
