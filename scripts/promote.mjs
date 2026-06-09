/**
 * StrikerX Production Promote Script
 *
 * Merges `replit` branch → `main` on GitHub.
 * Railway watches `main` and will auto-deploy immediately after merge.
 *
 * Run this ONLY when you are ready to release to production:
 *   node scripts/promote.mjs
 *
 * Workflow:
 *   1. Edit on Replit
 *   2. node scripts/github-push.mjs   ← safe, pushes to `replit` branch only
 *   3. node scripts/promote.mjs       ← merges replit→main, triggers Railway deploy (~3 min)
 */
import { fileURLToPath } from "url";
import path from "path";

const TOKEN = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "").replace(/[^\x20-\x7E]/g, "").trim();
const USERNAME = "vghaiaos-netizen";
const REPO = "strikerx";
const REST = "https://api.github.com";

if (!TOKEN) { console.error("GITHUB_PERSONAL_ACCESS_TOKEN not set"); process.exit(1); }

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function rest(method, url, body) {
  const r = await fetch(`${REST}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

async function run() {
  console.log(`\nPromoting replit → main on github.com/${USERNAME}/${REPO}`);
  console.log("  This WILL trigger a Railway deployment (~3 minutes).");
  console.log("=".repeat(60));

  const { status: authStatus, data: me } = await rest("GET", "/user");
  if (authStatus !== 200) { console.error("Token invalid"); process.exit(1); }
  console.log(`Authenticated as ${me.login}`);

  // Check replit branch exists
  const { status: branchStatus } = await rest("GET", `/repos/${USERNAME}/${REPO}/branches/replit`);
  if (branchStatus !== 200) {
    console.error("'replit' branch not found — run 'node scripts/github-push.mjs' first.");
    process.exit(1);
  }

  // Merge replit → main
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const { status, data } = await rest("POST", `/repos/${USERNAME}/${REPO}/merges`, {
    base: "main",
    head: "replit",
    commit_message: `chore: promote replit → production (${now} UTC)`,
  });

  if (status === 201) {
    console.log(`\nMerge successful — SHA: ${data.sha?.slice(0, 8)}`);
    console.log(`Railway is now deploying. Check progress at:`);
    console.log(`  https://railway.app/dashboard\n`);
  } else if (status === 204) {
    console.log("\nNothing to merge — main is already up-to-date with replit.\n");
  } else if (status === 409) {
    console.error("\nMerge conflict between replit and main.");
    console.error("Resolve manually on GitHub before promoting.\n");
    process.exit(1);
  } else {
    console.error(`\nMerge failed (HTTP ${status}):`, JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
