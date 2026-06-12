/**
 * Translate all missing keys in locale files using MyMemory API (free, no key required).
 * Processes all languages in parallel for speed.
 * Usage: node scripts/translate-locales.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dir, "../artifacts/strikerx/src/locales");

const LANGS = [
  { code: "ru", mm: "en|ru" },
  { code: "uk", mm: "en|uk" },
  { code: "be", mm: "en|be" },
  { code: "ro", mm: "en|ro" },
  { code: "ar", mm: "en|ar" },
  { code: "pl", mm: "en|pl" },
  { code: "bg", mm: "en|bg" },
  { code: "sr", mm: "en|sr" },
  { code: "pt", mm: "en|pt" },
];

const NO_TRANSLATE = new Set([
  "1 TON = 100 STRK", "110 STRK = 1 TON", "STRIKER", "STRK", "TON", "VIP",
]);

function shouldSkip(text) {
  return NO_TRANSLATE.has(text.trim()) || /^\{\{[^}]+\}\}$/.test(text.trim());
}

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function setNested(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNested(obj, path) {
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

async function translateText(text, langPair) {
  if (!text || !text.trim() || shouldSkip(text)) return text;

  const placeholders = [];
  const sanitized = text.replace(/\{\{[^}]+\}\}/g, (m) => {
    const idx = placeholders.length;
    placeholders.push(m);
    return `__PH${idx}__`;
  });

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sanitized)}&langpair=${langPair}&de=translate@strikerx.app`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return text;
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      let translated = data.responseData.translatedText;
      placeholders.forEach((ph, i) => {
        translated = translated.replace(new RegExp(`__PH${i}__`, "g"), ph);
      });
      return translated;
    }
  } catch {
    // fallback
  }
  return text;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Translate one language — processes all missing keys sequentially with minimal delay
async function processLang({ code, mm }) {
  const enPath = join(LOCALES_DIR, "en.json");
  const targetPath = join(LOCALES_DIR, `${code}.json`);

  const en = JSON.parse(readFileSync(enPath, "utf8"));
  let target;
  try { target = JSON.parse(readFileSync(targetPath, "utf8")); }
  catch { target = { translation: {} }; }

  const enFlat = flatten(en.translation, "translation");
  const missing = Object.entries(enFlat).filter(
    ([key]) => getNested(target, key) === undefined
  );

  if (missing.length === 0) {
    console.log(`[${code}] ✓ All keys present`);
    return;
  }

  console.log(`[${code}] → ${missing.length} keys to translate`);
  let done = 0;

  for (const [key, enText] of missing) {
    if (typeof enText !== "string") { setNested(target, key, enText); continue; }
    const result = await translateText(enText, mm);
    setNested(target, key, result);
    done++;
    await sleep(80); // minimal rate-limit delay
  }

  writeFileSync(targetPath, JSON.stringify(target, null, 2) + "\n", "utf8");
  console.log(`[${code}] ✅ done (${done} translated)`);
}

// Run all languages in parallel (4 at a time to avoid rate limits)
async function main() {
  console.log("🔤 Translating missing locale keys via MyMemory API…\n");

  // Split into groups of 3 and process in parallel batches
  const batchSize = 3;
  for (let i = 0; i < LANGS.length; i += batchSize) {
    const batch = LANGS.slice(i, i + batchSize);
    await Promise.all(batch.map(processLang));
    if (i + batchSize < LANGS.length) await sleep(200);
  }

  console.log("\n✅ All locales updated!");
}

main().catch(console.error);
