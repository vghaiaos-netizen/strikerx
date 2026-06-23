import { logger } from "./logger";

// ─── Groq Key Pool ──────────────────────────────────────────────────────────────
// Supports up to 5 keys: GROQ_API_KEY_1 … GROQ_API_KEY_5
// Legacy fallback: GROQ_API_KEY (single key, old style).
//
// Rotation strategy: round-robin across all keys.
// On a 429 response, that key cools down for COOL_DOWN_MS before being retried.
// If ALL keys are cooling, the call throws — callers must handle gracefully.
//
// Usage:
//   import { chatCompletion } from "./groqPool";
//   const { content } = await chatCompletion([{ role: "user", content: "..." }]);
//
// Railway setup (add these in the Railway service env vars panel):
//   GROQ_API_KEY_1 = gsk_...   ← first key (already set)
//   GROQ_API_KEY_2 = gsk_...   ← add when you have a second key
//   GROQ_API_KEY_3 = gsk_...   ← and so on up to _5
//
// For Replit dev: set GROQ_API_KEY_1 in the Replit Secrets panel.

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const COOL_DOWN_MS  = 60_000; // 60 s cooldown per key after a 429

interface KeyEntry {
  key:       string;
  coolUntil: number;
  requests:  number;
  errors429: number;
}

let pool:            KeyEntry[] = [];
let currentIndex     = 0;
let poolInitialized  = false;

function initPool(): void {
  if (poolInitialized) return;
  poolInitialized = true;

  const keys: string[] = [];

  // Numbered keys (GROQ_API_KEY_1 … GROQ_API_KEY_5)
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k?.trim()) keys.push(k.trim());
  }

  // Legacy single-key fallback (GROQ_API_KEY) — only used if no numbered keys found
  if (keys.length === 0) {
    const legacy = process.env.GROQ_API_KEY?.trim();
    if (legacy) keys.push(legacy);
  }

  pool = keys.map((key) => ({ key, coolUntil: 0, requests: 0, errors429: 0 }));

  if (pool.length === 0) {
    logger.warn("Groq key pool: no keys configured. Set GROQ_API_KEY_1 in env vars.");
  } else {
    logger.info({ keyCount: pool.length }, "Groq key pool initialized");
  }
}

/** Pick the next available key, skipping any that are still cooling down. */
function pickKey(): KeyEntry | null {
  if (pool.length === 0) return null;
  const now = Date.now();

  for (let i = 0; i < pool.length; i++) {
    const entry = pool[currentIndex % pool.length]!;
    currentIndex = (currentIndex + 1) % pool.length;
    if (entry.coolUntil <= now) return entry;
  }

  return null; // all keys cooling
}

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?:           string;
  temperature?:     number;
  max_tokens?:      number;
  response_format?: { type: "json_object" };
  timeoutMs?:       number;
}

export interface ChatResult {
  content:  string;
  keySlot:  number;
  model:    string;
}

// ─── Main call ─────────────────────────────────────────────────────────────────

/**
 * Make a Groq chat completion using the key pool.
 * Tries each available key in round-robin order.
 * Throws if all keys are exhausted / cooling.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options:  ChatOptions = {},
): Promise<ChatResult> {
  initPool();

  if (pool.length === 0) {
    throw new Error("No Groq API keys configured");
  }

  const model     = options.model     ?? "llama-3.3-70b-versatile";
  const timeoutMs = options.timeoutMs ?? 12_000;

  let lastError: Error = new Error("No Groq keys available");

  // Try up to pool.length attempts so each key gets one shot
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const entry = pickKey();
    if (!entry) break;

    const slot = pool.indexOf(entry);

    try {
      entry.requests++;

      const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${entry.key}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature:     options.temperature    ?? 0.4,
          max_tokens:      options.max_tokens     ?? 400,
          response_format: options.response_format,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429) {
        entry.errors429++;
        entry.coolUntil = Date.now() + COOL_DOWN_MS;
        logger.warn({ slot, coolsInSec: Math.ceil(COOL_DOWN_MS / 1000) }, "Groq 429 — key cooling, trying next");
        lastError = new Error("Rate limited");
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Groq API ${res.status}: ${text}`);
      }

      const json = await res.json() as {
        choices?: { message?: { content?: string } }[];
        model?:   string;
      };

      const content = json.choices?.[0]?.message?.content ?? "";
      logger.info({ slot, model: json.model ?? model, chars: content.length }, "Groq completion OK");
      return { content, keySlot: slot, model: json.model ?? model };

    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        logger.warn({ slot }, "Groq request timed out — trying next key");
        lastError = new Error("Groq request timed out");
        continue;
      }
      if (err instanceof Error && err.message === "Rate limited") continue;
      throw err; // non-retryable error
    }
  }

  throw lastError;
}

// ─── Convenience: generate varied text with a static fallback ──────────────────

/**
 * Ask Groq to generate a short message variation.
 * Returns null (instead of throwing) if all keys are unavailable — callers
 * should fall back to their static template.
 *
 * @param systemPrompt   Persona / tone instructions
 * @param userPrompt     What to generate
 * @param maxTokens      Default 200
 */
export async function generateText(
  systemPrompt: string,
  userPrompt:   string,
  maxTokens     = 200,
): Promise<string | null> {
  try {
    const { content } = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      { temperature: 0.7, max_tokens: maxTokens, timeoutMs: 8_000 },
    );
    return content.trim() || null;
  } catch {
    return null; // all keys busy / not configured — caller uses static fallback
  }
}

// ─── Admin status ──────────────────────────────────────────────────────────────

export interface PoolKeyStatus {
  slot:       number;
  requests:   number;
  errors429:  number;
  cooling:    boolean;
  coolsInSec: number | null;
}

export function getGroqPoolStatus(): {
  keyCount:  number;
  available: number;
  stats:     PoolKeyStatus[];
} {
  initPool();
  const now = Date.now();
  return {
    keyCount:  pool.length,
    available: pool.filter((e) => e.coolUntil <= now).length,
    stats:     pool.map((e, i) => ({
      slot:       i + 1,
      requests:   e.requests,
      errors429:  e.errors429,
      cooling:    e.coolUntil > now,
      coolsInSec: e.coolUntil > now ? Math.ceil((e.coolUntil - now) / 1000) : null,
    })),
  };
}
