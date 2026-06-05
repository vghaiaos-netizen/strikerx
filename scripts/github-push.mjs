/**
 * StrikerX GitHub Push Script — Trees API version
 * Fetches all existing SHAs via git tree, then updates each file correctly.
 * Run: node scripts/github-push.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const USERNAME = "vghaiaos-netizen";
const REPO = "strikerx";

if (!TOKEN) { console.error("GITHUB_PERSONAL_ACCESS_TOKEN not set"); process.exit(1); }

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function gh(method, url, body) {
  const r = await fetch(`https://api.github.com${url}`, {
    method, headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

async function ensureRepo() {
  const { status } = await gh("GET", `/repos/${USERNAME}/${REPO}`);
  if (status === 200) { console.log("   Repo exists"); return; }
  const { status: cs, data } = await gh("POST", "/user/repos", {
    name: REPO, description: "StrikerX — Football Telegram Mini App Casino",
    private: false, auto_init: true,
  });
  if (cs === 201) { console.log(`   Created ${data.full_name}`); await new Promise(r => setTimeout(r, 2000)); }
  else { console.error("   Create failed:", JSON.stringify(data).slice(0, 200)); process.exit(1); }
}

// Build map of path -> sha for all existing files in the repo
async function fetchAllShas() {
  // Get default branch HEAD
  const { status: rs, data: repo } = await gh("GET", `/repos/${USERNAME}/${REPO}`);
  if (rs !== 200) return new Map();
  const branch = repo.default_branch;

  const { status: bs, data: branchData } = await gh("GET", `/repos/${USERNAME}/${REPO}/branches/${branch}`);
  if (bs !== 200) return new Map();

  const treeSha = branchData.commit?.commit?.tree?.sha;
  if (!treeSha) return new Map();

  const { status: ts, data: treeData } = await gh("GET", `/repos/${USERNAME}/${REPO}/git/trees/${treeSha}?recursive=1`);
  if (ts !== 200) return new Map();

  const map = new Map();
  for (const item of treeData.tree ?? []) {
    if (item.type === "blob") map.set(item.path, item.sha);
  }
  console.log(`   Loaded ${map.size} existing file SHAs`);
  return map;
}

async function pushFile(relPath, fullPath, existingSha) {
  let content;
  try { content = fs.readFileSync(fullPath).toString("base64"); }
  catch { return { ok: false, reason: "read-error" }; }

  const url = `/repos/${USERNAME}/${REPO}/contents/${relPath}`;
  const body = { message: `sync: ${relPath}`, content };
  if (existingSha) body.sha = existingSha;

  const { status, data } = await gh("PUT", url, body);
  if (status === 200 || status === 201) return { ok: true };

  // If we got a conflict and didn't have a SHA (new file race), try fetching SHA
  if ((status === 409 || status === 422) && !existingSha) {
    const { status: gs, data: gd } = await gh("GET", url);
    const sha = gs === 200 ? gd.sha : null;
    if (!sha) return { ok: false, reason: `${status}-no-sha` };
    const { status: s2 } = await gh("PUT", url, { ...body, sha });
    return (s2 === 200 || s2 === 201) ? { ok: true } : { ok: false, reason: `retry-${s2}` };
  }

  return { ok: false, reason: `${status}: ${String(data?.message ?? "").slice(0, 80)}` };
}

const SKIP_DIRS = new Set(["node_modules",".git","dist","build",".local",".agents",".cache","generated"]);
const SKIP_EXTS = new Set([".tsbuildinfo",".lock",".log",".map"]);
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);
const ALLOW_ROOTS = new Set(["artifacts","lib","docs","scripts","package.json","pnpm-workspace.yaml","tsconfig.json","tsconfig.base.json","replit.md",".gitignore","railway.toml","render.yaml"]);

function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...walk(full, rel)); continue; }
    if (SKIP_FILES.has(e.name)) continue;
    if (SKIP_EXTS.has(path.extname(e.name).toLowerCase())) continue;
    if (!ALLOW_ROOTS.has(rel.split("/")[0])) continue;
    try { if (fs.statSync(full).size > 400_000) { console.log(`  Skip large: ${rel}`); continue; } }
    catch { continue; }
    out.push({ rel, full });
  }
  return out;
}

async function run() {
  console.log(`\nSyncing to github.com/${USERNAME}/${REPO}\n${"=".repeat(48)}`);

  const { status, data: me } = await gh("GET", "/user");
  if (status !== 200) { console.error("Token invalid:", me.message); process.exit(1); }
  console.log(`Authenticated as ${me.login}`);

  await ensureRepo();

  // Prefetch all existing SHAs
  const existingShas = await fetchAllShas();

  // Push README
  await gh("PUT", `/repos/${USERNAME}/${REPO}/contents/README.md`, {
    message: "docs: README",
    content: Buffer.from("# StrikerX\n\nFootball-themed Telegram Mini App casino. Stack: Node.js/Express, PostgreSQL/Drizzle ORM, React/Vite/TailwindCSS, Telegraf bots, CryptoBot payments, WebSocket crash game.\n\n## Setup\n```bash\npnpm install\npnpm --filter @workspace/db run push\npnpm --filter @workspace/api-server run dev\npnpm --filter @workspace/strikerx run dev\n```\n\nSee `docs/AGENT_HANDOFF.md` for full setup guide.\n").toString("base64"),
    ...(existingShas.get("README.md") ? { sha: existingShas.get("README.md") } : {}),
  });

  const files = walk(ROOT);
  console.log(`\nFound ${files.length} source files to push\n`);

  let ok = 0, fail = 0;
  const CONCURRENCY = 3;
  const errors = [];

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(f => pushFile(f.rel, f.full, existingShas.get(f.rel))));

    for (let j = 0; j < results.length; j++) {
      if (results[j].ok) { ok++; }
      else { fail++; errors.push(`${batch[j].rel}: ${results[j].reason}`); }
    }

    if ((Math.floor(i / CONCURRENCY) + 1) % 10 === 0 || i + CONCURRENCY >= files.length) {
      console.log(`  Progress: ${Math.min(i + CONCURRENCY, files.length)}/${files.length} — ${ok} ok, ${fail} failed`);
    }
    // Throttle
    if (i > 0 && i % 30 === 0) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${"=".repeat(48)}`);
  console.log(`Pushed ${ok}/${files.length} files`);
  if (errors.length) {
    console.log(`\nFailed ${errors.length} files:`);
    errors.slice(0, 30).forEach(e => console.log("  -", e));
  }
  console.log(`\nhttps://github.com/${USERNAME}/${REPO}\n`);
}

run().catch(e => { console.error(e); process.exit(1); });
