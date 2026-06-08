import { Router, type IRouter } from "express";
import { db, affiliatesTable, playersTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /admin/affiliates — list all affiliate codes
router.get("/admin/affiliates", requireAdmin, async (_req, res): Promise<void> => {
  const affiliates = await db
    .select()
    .from(affiliatesTable)
    .orderBy(desc(affiliatesTable.createdAt));

  res.json(affiliates.map(a => ({
    id: a.id,
    code: a.code,
    name: a.name,
    ownerId: a.ownerId,
    commissionRate: a.commissionRate,
    totalEarned: a.totalEarned,
    totalReferred: a.totalReferred,
    isActive: a.isActive,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  })));
});

// POST /admin/affiliates — create new affiliate code
router.post("/admin/affiliates", requireAdmin, async (req, res): Promise<void> => {
  const { code, name, commissionRate = 0.10, notes, ownerId } = req.body as {
    code: string;
    name: string;
    commissionRate?: number;
    notes?: string;
    ownerId?: number;
  };

  if (!code || !name) {
    res.status(400).json({ error: "code and name are required" });
    return;
  }

  const upperCode = code.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (!upperCode) {
    res.status(400).json({ error: "Invalid code format" });
    return;
  }

  try {
    const [affiliate] = await db
      .insert(affiliatesTable)
      .values({ code: upperCode, name, commissionRate, notes, ownerId: ownerId ?? null })
      .returning();

    logger.info({ code: upperCode, name }, "Affiliate code created");
    res.json(affiliate);
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? "");
    if (msg.includes("unique")) {
      res.status(409).json({ error: "Code already exists" });
    } else {
      logger.error({ err }, "Failed to create affiliate");
      res.status(500).json({ error: "Internal error" });
    }
  }
});

// PATCH /admin/affiliates/:id — update affiliate
router.patch("/admin/affiliates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { isActive, commissionRate, notes } = req.body as {
    isActive?: boolean;
    commissionRate?: number;
    notes?: string;
  };

  const updates: Partial<{ isActive: boolean; commissionRate: number; notes: string }> = {};
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if (typeof commissionRate === "number") updates.commissionRate = commissionRate;
  if (notes !== undefined) updates.notes = notes;

  await db.update(affiliatesTable).set(updates).where(eq(affiliatesTable.id, id));
  res.json({ ok: true });
});

// GET /admin/affiliates/:code/players — players who used this code
router.get("/admin/affiliates/:code/players", requireAdmin, async (req, res): Promise<void> => {
  const code = String(req.params.code ?? "").toUpperCase();

  const players = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      strikerBalance: playersTable.strikerBalance,
      tonWageredLifetime: playersTable.tonWageredLifetime,
      createdAt: playersTable.createdAt,
    })
    .from(playersTable)
    .where(eq(playersTable.affiliateCode, code))
    .orderBy(desc(playersTable.createdAt))
    .limit(100);

  res.json(players.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

export default router;
