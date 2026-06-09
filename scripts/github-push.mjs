/**
 * StrikerX GitHub Push Script — GraphQL createCommitOnBranch
 *
 * Pushes all Replit source files directly to `main` on GitHub.
 * Railway watches `main` and will auto-deploy after each push (~3 min).
 *
 * Run: node scripts/github-push.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOKEN = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "").replace(/[^\x20-\x7E]/g, "").trim();
const USERNAME = "vghaiaos-netizen";
const REPO = "strikerx";
const TARGET_BRANCH = "main"; // Railway watches main — pushes here trigger a deploy
const GRAPHQL = "https://api.github.com/graphql";
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

async function graphql(query, variables) {
  const r = await fetch(GRAPHQL, {
    method: "POST",
    headers: { ...H, Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

async function getBranchOid(branch) {
  const { data } = await graphql(`
    query { repository(owner: "${USERNAME}", name: "${REPO}") {
      ref(qualifiedName: "refs/heads/${branch}") { target { oid } }
    }}
  `, {});
  return data?.repository?.ref?.target?.oid ?? null;
}

async function getDefaultBranchOid() {
  const { data } = await graphql(`
    query { repository(owner: "${USERNAME}", name: "${REPO}") {
      defaultBranchRef { target { oid } }
    }}
  `, {});
  return data?.repository?.defaultBranchRef?.target?.oid ?? null;
}

async function ensureBranch() {
  let oid = await getBranchOid(TARGET_BRANCH);
  if (oid) {
    console.log(`  Branch '${TARGET_BRANCH}' exists (${oid.slice(0, 8)}...)`);
    return oid;
  }
  // Create branch from main HEAD
  const mainOid = await getDefaultBranchOid();
  if (!mainOid) { console.error("Could not get main HEAD"); process.exit(1); }
  const { status, data } = await rest("POST", `/repos/${USERNAME}/${REPO}/git/refs`, {
    ref: `refs/heads/${TARGET_BRANCH}`,
    sha: mainOid,
  });
  if (status === 201) {
    console.log(`  Created branch '${TARGET_BRANCH}' from main (${mainOid.slice(0, 8)}...)`);
    return mainOid;
  }
  console.error("  Failed to create branch:", JSON.stringify(data).slice(0, 200));
  process.exit(1);
}

async function commitBatch(files, headOid, batchNum) {
  const additions = files.map(f => ({
    path: f.rel,
    contents: fs.readFileSync(f.full).toString("base64"),
  }));

  const mutation = `
    mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit { oid url }
      }
    }
  `;

  const variables = {
    input: {
      branch: { repositoryNameWithOwner: `${USERNAME}/${REPO}`, branchName: TARGET_BRANCH },
      message: { headline: `chore: sync ${files.length} files (batch ${batchNum})` },
      fileChanges: { additions },
      expectedHeadOid: headOid,
    },
  };

  const res = await graphql(mutation, variables);

  if (res.errors) {
    console.error(`  Batch ${batchNum} failed:`, JSON.stringify(res.errors).slice(0, 200));
    return null;
  }

  const newOid = res.data?.createCommitOnBranch?.commit?.oid;
  if (!newOid) {
    console.error(`  Batch ${batchNum} no commit oid:`, JSON.stringify(res).slice(0, 200));
    return null;
  }

  return newOid;
}

const SKIP_DIRS = new Set(["node_modules",".git","dist","build",".local",".agents",".cache","generated"]);
const SKIP_EXTS = new Set([".tsbuildinfo",".lock",".log",".map"]);
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);
const ALLOW_ROOTS = new Set(["artifacts","lib","docs","scripts","package.json","pnpm-workspace.yaml","tsconfig.json","tsconfig.base.json","replit.md",".gitignore","railway.json","Dockerfile",".npmrc",".dockerignore"]);

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
    try {
      const stat = fs.statSync(full);
      if (stat.size > 350_000) { console.log(`  Skip large (${(stat.size/1024).toFixed(0)}KB): ${rel}`); return out; }
    } catch { continue; }
    out.push({ rel, full });
  }
  return out;
}

async function run() {
  console.log(`\nSyncing Replit → github.com/${USERNAME}/${REPO}:${TARGET_BRANCH}`);
  console.log("  Railway will auto-deploy from main (~3 min after push completes)");
  console.log("=".repeat(60));

  const { status, data: me } = await rest("GET", "/user");
  if (status !== 200) { console.error("Token invalid"); process.exit(1); }
  console.log(`Authenticated as ${me.login}`);

  let headOid = await ensureBranch();

  const files = walk(ROOT);
  console.log(`\nFound ${files.length} files — pushing in batches of 50\n`);

  const BATCH_SIZE = 50;
  let pushed = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} files)... `);

    const newOid = await commitBatch(batch, headOid, batchNum);
    if (newOid) {
      headOid = newOid;
      pushed += batch.length;
      console.log(`done (${newOid.slice(0, 8)})`);
    } else {
      console.log(`retrying individually...`);
      for (const f of batch) {
        const oid = await commitBatch([f], headOid, `${batchNum}r`);
        if (oid) { headOid = oid; pushed++; }
        else console.log(`  SKIP: ${f.rel}`);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (i + BATCH_SIZE < files.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pushed ${pushed}/${files.length} files to main`);
  console.log(`https://github.com/${USERNAME}/${REPO}/tree/main`);
  console.log(`Railway is deploying now — check https://railway.app/dashboard (~3 min)\n`);
}

run().catch(e => { console.error(e); process.exit(1); });
