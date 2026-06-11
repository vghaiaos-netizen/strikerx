#!/usr/bin/env node
/**
 * translate.mjs — Translate en.json into 9 target languages using MyMemory free API.
 * Falls back to LibreTranslate if MyMemory fails.
 * Usage: node scripts/translate.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "../artifacts/strikerx/src/locales");

const LANGS = [
  { code: "ru", name: "Russian",    myMemory: "en|ru" },
  { code: "uk", name: "Ukrainian",  myMemory: "en|uk" },
  { code: "be", name: "Belarusian", myMemory: "en|be" },
  { code: "ro", name: "Romanian",   myMemory: "en|ro" },
  { code: "ar", name: "Arabic",     myMemory: "en|ar" },
  { code: "pl", name: "Polish",     myMemory: "en|pl" },
  { code: "bg", name: "Bulgarian",  myMemory: "en|bg" },
  { code: "sr", name: "Serbian",    myMemory: "en|sr" },
  { code: "pt", name: "Portuguese", myMemory: "en|pt" },
];

const en = JSON.parse(readFileSync(join(LOCALES_DIR, "en.json"), "utf8"));

async function translateMyMemory(text, langPair) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`MyMemory HTTP ${r.status}`);
  const d = await r.json();
  if (d.responseStatus !== 200) throw new Error(`MyMemory status ${d.responseStatus}`);
  const t = d.responseData?.translatedText;
  if (!t || t === text) throw new Error("No translation returned");
  return t;
}

async function translateLibre(text, target) {
  const r = await fetch("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: "en", target, format: "text" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`LibreTranslate HTTP ${r.status}`);
  const d = await r.json();
  return d.translatedText;
}

async function translate(text, lang) {
  if (!text || text.trim() === "" || /^\d+$/.test(text)) return text;
  try {
    return await translateMyMemory(text, lang.myMemory);
  } catch (e1) {
    try {
      return await translateLibre(text, lang.code);
    } catch (e2) {
      console.warn(`  [WARN] Both APIs failed for "${text.slice(0, 40)}": ${e2.message}`);
      return text; // keep English as fallback
    }
  }
}

function flattenLeaves(obj, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") result[key] = v;
    else if (typeof v === "object" && v !== null) Object.assign(result, flattenLeaves(v, key));
  }
  return result;
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

async function translateLang(lang) {
  console.log(`\n── ${lang.name} (${lang.code}) ──`);
  const leaves = flattenLeaves(en.translation);
  const keys = Object.keys(leaves);
  const result = { translation: {} };

  let done = 0;
  const sampleKeys = ["nav.home", "common.loading", "games.shot.title"];
  const samples = [];

  for (const key of keys) {
    const original = leaves[key];
    // Skip keys with interpolation placeholders like {{mult}} — preserve as-is
    const translated = original.includes("{{") ? original : await translate(original, lang);
    setNested(result.translation, key, translated);

    if (sampleKeys.includes(key)) {
      samples.push({ key, original, translated });
    }
    done++;
    if (done % 20 === 0) process.stdout.write(`  ${done}/${keys.length}...\r`);
    // Small delay to stay within MyMemory free tier (1 req/sec)
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`  ${keys.length}/${keys.length} strings translated`);
  console.log("  Samples:");
  for (const s of samples) {
    console.log(`    [${s.key}] "${s.original}" → "${s.translated}"`);
  }

  writeFileSync(join(LOCALES_DIR, `${lang.code}.json`), JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`  Written: ${lang.code}.json`);
}

console.log("StrikerX Translation Script — MyMemory free API");
console.log("================================================");

for (const lang of LANGS) {
  await translateLang(lang);
}

console.log("\n✅ All translations complete.");
