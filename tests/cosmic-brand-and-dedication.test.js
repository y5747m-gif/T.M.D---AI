"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("applies Aso AI and آسو إي آي branding over the cosmic purple starry theme", () => {
  const indexHtml = readRepoFile("index.html");
  const styleCss = readRepoFile("style.css");
  const appJs = readRepoFile("app.js");
  const chatApi = readRepoFile("api/chat.js");
  const dedicationCss = readRepoFile("dedication.css");
  const faviconSvg = readRepoFile("favicon.svg");
  const logoMonoSvg = readRepoFile("images/logo-mono.svg");
  const manifestJson = JSON.parse(readRepoFile("manifest.json"));

  // Bilingual brand presence: Aso AI + آسو إي آي
  assert.match(indexHtml, /Aso AI/);
  assert.match(indexHtml, /آسو إي آي/);
  assert.match(indexHtml, /cosmic-logo cosmic-logo--sm/);
  assert.match(indexHtml, /cosmic-logo cosmic-logo--hero/);
  assert.match(indexHtml, /data-preset="animated-stars"/);
  assert.doesNotMatch(indexHtml, /mythic-space-layer/i);
  assert.doesNotMatch(indexHtml, /T\.M\.D/);

  // Cosmic purple & starlight tokens (zero Spartan crimson)
  assert.match(styleCss, /--color-primary:\s*#9d4edd/i);
  assert.match(styleCss, /--color-secondary:\s*#00f2fe/i);
  assert.match(styleCss, /\.cosmic-logo--hero/);
  assert.match(styleCss, /\.cosmos-nebula/);
  assert.doesNotMatch(styleCss, /#ff5f6d|#e0554e|#bb3a3f|224,\s*85,\s*78|255,\s*95,\s*109/i);

  assert.match(appJs, /class StarfieldEngine/);
  assert.match(appJs, /tmd_user_bg_settings_v5/);
  assert.match(appJs, /preset:\s*"animated-stars"/);
  assert.match(appJs, /Aso AI \(آسو إي آي\)/);
  assert.doesNotMatch(appJs, /mythicSigils/);

  assert.match(chatApi, /اسمك الرسمي بالإنجليزية "Aso AI" وبالعربية "آسو إي آي"/);

  assert.match(dedicationCss, /rgba\(157,\s*78,\s*221/);
  assert.match(dedicationCss, /\.dedication-constellation/);
  assert.doesNotMatch(dedicationCss, /255,\s*95,\s*109/);

  assert.match(faviconSvg, />ASO<\/text>/);
  assert.match(faviconSvg, />آسو إي آي<\/text>/);
  assert.match(faviconSvg, /#7f00ff|#9d4edd/i);
  assert.match(logoMonoSvg, />ASO<\/text>/);
  assert.match(logoMonoSvg, />آسو إي آي<\/text>/);

  assert.equal(manifestJson.name, "Aso AI — آسو إي آي");
  assert.equal(manifestJson.theme_color, "#060713");

  for (const rel of [
    "index.html",
    "style.css",
    "dedication.css",
    "page.css",
    "app.js",
    "floating-assistant.js",
    "eraser-studio.js",
    "pwa.js",
    "service-worker.js",
    "about.html",
    "faq.html",
    "privacy.html",
    "404.html",
    "manifest.json",
    "web.webmanifest",
    "assistant.html",
    "assistant.webmanifest"
  ]) {
    const content = readRepoFile(rel);
    assert.doesNotMatch(content, /sparta/i, `${rel} must not contain SPARTA branding`);
  }

  for (const rel of ["about.html", "faq.html", "privacy.html", "404.html", "assistant.html"]) {
    const content = readRepoFile(rel);
    assert.match(content, /Aso AI|Aso\b/);
    assert.match(content, /آسو إي آي/);
  }
});

test("every asset listed in service-worker APP_SHELL exists on disk", () => {
  const sw = readRepoFile("service-worker.js");
  const match = sw.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, "APP_SHELL array must exist in service-worker.js");

  const urls = Array.from(match[1].matchAll(/"([^"]+)"/g), (m) => m[1]);
  assert.ok(urls.length >= 20, "APP_SHELL should list core shell assets");

  for (const url of urls) {
    const fileRel = url === "/" ? "index.html" : url.replace(/^\//, "");
    assert.ok(
      fs.existsSync(path.join(ROOT, fileRel)),
      `Precached asset ${url} (${fileRel}) must exist in repository`
    );
  }
});

test("preserves all platform features and public attribution", () => {
  const indexHtml = readRepoFile("index.html");

  for (const requiredId of [
    "starsCanvas",
    "seedanceStudioBackdrop",
    "openEraserStudioBtn",
    "eraserStudioBackdrop",
    "bgCustomizerModalBackdrop",
    "modeWheel",
    "dailyMission",
    "dedicationTrigger",
    "dedicationModalBackdrop"
  ]) {
    assert.match(indexHtml, new RegExp(`id="${requiredId}"`), `index.html must preserve #${requiredId}`);
  }

  assert.match(indexHtml, /من معتصم عمرو الى M/);
  assert.match(indexHtml, /video-studio\.js/);
  assert.match(indexHtml, /eraser-studio\.js/);
  assert.match(indexHtml, /floating-assistant\.js/);
  assert.match(indexHtml, /pwa\.js/);
});

test("dedication love letter has corrected Arabic spelling and phrasing", () => {
  const indexHtml = readRepoFile("index.html");
  const modalStart = indexHtml.indexOf('id="dedicationModalBackdrop"');
  assert.ok(modalStart !== -1, "dedicationModalBackdrop must exist");
  const modalEnd = indexHtml.indexOf('id="developerModalBackdrop"', modalStart);
  const modalHtml = indexHtml.slice(modalStart, modalEnd);

  // Corrected classical/refined Arabic forms
  assert.match(modalHtml, /رسالة خاصة · إلى ملك وحدها/);
  assert.match(modalHtml, /إلى <span>ملك<\/span>/);
  assert.match(modalHtml, /أحبكِ حبًا شديدًا جدًا/);
  assert.match(modalHtml, /لا أريدكِ أن تفارقيني طوال حياتي/);
  assert.match(modalHtml, /تُذكّركِ بي دائمًا/);
  assert.match(modalHtml, /أو حدث لي أي شيء/);
  assert.match(modalHtml, /أحبكِ يا ملك… اليوم، وغدًا، وطوال عمري\./);
  assert.match(modalHtml, /<strong>ياسين<\/strong>/);

  // Old spelling/colloquial errors must be absent
  assert.doesNotMatch(modalHtml, /تفرّقيني|تفارقني/);
  assert.doesNotMatch(modalHtml, /تفتّكريني بيّا|تذكرك بيا/);
  assert.doesNotMatch(modalHtml, /حصللي|حصل لي/);
  assert.doesNotMatch(modalHtml, /بحبك حب شديد|بحبك قوي/);
});
