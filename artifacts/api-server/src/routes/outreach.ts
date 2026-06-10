import { Router, type IRouter } from "express";
import { db, outreachGroupsTable, outreachTemplatesTable, outreachPostsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";
import { getConfig, setConfig } from "../lib/configService";

const router: IRouter = Router();

const OUTREACH_SERVICE_URL = process.env.OUTREACH_SERVICE_URL ?? "http://localhost:8001";

const OUTREACH_CONFIG_KEYS = [
  "outreach_enabled",
  "outreach_join_max_per_day",
  "outreach_join_delay_min_hours",
  "outreach_join_delay_max_hours",
  "outreach_cold_period_hours",
  "outreach_post_cooldown_hours",
  "outreach_platform_name",
  "outreach_promo_url",
];

async function proxyOutreach(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${OUTREACH_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

async function getOutreachServiceHealth(): Promise<{ ok: boolean; connected: boolean; lastTickAt: string | null; tickCount: number }> {
  try {
    const res = await fetch(`${OUTREACH_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.json() as Promise<{ ok: boolean; connected: boolean; lastTickAt: string | null; tickCount: number }>;
  } catch {
    return { ok: false, connected: false, lastTickAt: null, tickCount: 0 };
  }
}

// ── CONFIG ─────────────────────────────────────────────────────────────────

router.get("/admin/outreach/config", requireAdmin, async (_req, res): Promise<void> => {
  const config: Record<string, string> = {};
  await Promise.all(
    OUTREACH_CONFIG_KEYS.map(async key => {
      config[key] = await getConfig(key);
    })
  );
  const health = await getOutreachServiceHealth();
  res.json({ config, service: health });
});

router.patch("/admin/outreach/config", requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  const saved: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!OUTREACH_CONFIG_KEYS.includes(key)) continue;
    await setConfig(key, String(value));
    saved.push(key);
  }
  logger.info({ keys: saved }, "Outreach config updated");
  res.json({ ok: true });
});

// ── GROUPS ─────────────────────────────────────────────────────────────────

router.get("/admin/outreach/groups", requireAdmin, async (_req, res): Promise<void> => {
  const groups = await db
    .select()
    .from(outreachGroupsTable)
    .orderBy(desc(outreachGroupsTable.createdAt));
  res.json(groups);
});

router.post("/admin/outreach/groups", requireAdmin, async (req, res): Promise<void> => {
  const { telegramId, username, title, memberCount } = req.body as {
    telegramId: string;
    username?: string;
    title: string;
    memberCount?: number;
  };
  if (!telegramId || !title) { res.status(400).json({ error: "telegramId and title required" }); return; }

  const existing = await db.select().from(outreachGroupsTable).where(eq(outreachGroupsTable.telegramId, telegramId));
  if (existing.length > 0) {
    res.status(409).json({ error: "Group already in list", group: existing[0] });
    return;
  }

  const [group] = await db.insert(outreachGroupsTable).values({
    telegramId,
    username: username ?? null,
    title,
    memberCount: memberCount ?? 0,
    status: "discovered",
  }).returning();
  res.status(201).json(group);
});

router.patch("/admin/outreach/groups/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { notes, isActive, status } = req.body as { notes?: string; isActive?: boolean; status?: string };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = isActive;
  if (status !== undefined) updates.status = status;
  const [updated] = await db.update(outreachGroupsTable).set(updates).where(eq(outreachGroupsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(updated);
});

router.post("/admin/outreach/groups/:id/queue", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const [group] = await db.select().from(outreachGroupsTable).where(eq(outreachGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (!["discovered", "failed"].includes(group.status)) {
    res.status(409).json({ error: `Cannot queue group with status: ${group.status}` });
    return;
  }
  const [updated] = await db
    .update(outreachGroupsTable)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(outreachGroupsTable.id, id))
    .returning();
  res.json(updated);
});

router.post("/admin/outreach/groups/:id/post-now", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { message } = req.body as { message?: string };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const [group] = await db.select().from(outreachGroupsTable).where(eq(outreachGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const identifier = group.username ?? group.telegramId;
  const result = await proxyOutreach("/post", { identifier, message }) as { ok?: boolean; error?: string };
  if (!result.ok) {
    res.status(502).json({ error: result.error ?? "Post failed" });
    return;
  }

  const now = new Date();
  await db.insert(outreachPostsTable).values({
    groupId: id,
    renderedBody: message,
    status: "sent",
    sentAt: now,
  });
  res.json({ ok: true });
});

router.delete("/admin/outreach/groups/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db
    .update(outreachGroupsTable)
    .set({ status: "removed", isActive: false, updatedAt: new Date() })
    .where(eq(outreachGroupsTable.id, id));
  res.json({ ok: true });
});

// ── SEARCH (proxy to outreach service) ────────────────────────────────────

router.post("/admin/outreach/search", requireAdmin, async (req, res): Promise<void> => {
  const { keyword, limit = 20 } = req.body as { keyword?: string; limit?: number };
  if (!keyword?.trim()) { res.status(400).json({ error: "keyword required" }); return; }
  try {
    const result = await proxyOutreach("/search", { keyword: keyword.trim(), limit });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Outreach search proxy failed");
    res.status(502).json({ error: message });
  }
});

// ── TEMPLATES ──────────────────────────────────────────────────────────────

router.get("/admin/outreach/templates", requireAdmin, async (_req, res): Promise<void> => {
  const templates = await db
    .select()
    .from(outreachTemplatesTable)
    .orderBy(desc(outreachTemplatesTable.createdAt));
  res.json(templates);
});

router.post("/admin/outreach/templates", requireAdmin, async (req, res): Promise<void> => {
  const { name, body } = req.body as { name?: string; body?: string };
  if (!name?.trim() || !body?.trim()) { res.status(400).json({ error: "name and body required" }); return; }
  const [template] = await db.insert(outreachTemplatesTable).values({
    name: name.trim(),
    body: body.trim(),
    isActive: true,
  }).returning();
  res.status(201).json(template);
});

router.patch("/admin/outreach/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { name, body, isActive } = req.body as { name?: string; body?: string; isActive?: boolean };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (body !== undefined) updates.body = body.trim();
  if (isActive !== undefined) updates.isActive = isActive;
  const [updated] = await db.update(outreachTemplatesTable).set(updates).where(eq(outreachTemplatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(updated);
});

router.delete("/admin/outreach/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(outreachTemplatesTable).where(eq(outreachTemplatesTable.id, id));
  res.json({ ok: true });
});

// ── SCHEDULER TICK ────────────────────────────────────────────────────────

router.post("/admin/outreach/tick", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await proxyOutreach("/tick", {});
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Outreach tick proxy failed");
    res.status(502).json({ error: message });
  }
});

// ── POST HISTORY ──────────────────────────────────────────────────────────

router.get("/admin/outreach/posts", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const offset = parseInt(String(req.query.offset ?? "0"));

  const posts = await db
    .select({
      id: outreachPostsTable.id,
      status: outreachPostsTable.status,
      renderedBody: outreachPostsTable.renderedBody,
      sentAt: outreachPostsTable.sentAt,
      error: outreachPostsTable.error,
      groupTitle: outreachGroupsTable.title,
      groupUsername: outreachGroupsTable.username,
      templateName: outreachTemplatesTable.name,
    })
    .from(outreachPostsTable)
    .leftJoin(outreachGroupsTable, eq(outreachPostsTable.groupId, outreachGroupsTable.id))
    .leftJoin(outreachTemplatesTable, eq(outreachPostsTable.templateId, outreachTemplatesTable.id))
    .orderBy(desc(outreachPostsTable.sentAt))
    .limit(limit)
    .offset(offset);

  res.json(posts);
});

export default router;
