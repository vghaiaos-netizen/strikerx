import { Router, type IRouter } from "express";
import { db, playersTable, kycVerificationsTable, auditLogTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /players/me/kyc — player submits KYC request
router.post("/players/me/kyc", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { fullName, country, docType } = req.body as {
    fullName: string;
    country: string;
    docType: string;
  };

  if (!fullName || !country || !docType) {
    res.status(400).json({ error: "fullName, country, and docType are required" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (player.kycStatus === "verified") {
    res.status(400).json({ error: "Already verified" });
    return;
  }

  // Check for existing pending submission
  const [existing] = await db
    .select()
    .from(kycVerificationsTable)
    .where(and(eq(kycVerificationsTable.playerId, playerId), eq(kycVerificationsTable.status, "pending")));

  if (existing) {
    res.status(400).json({ error: "KYC verification already pending" });
    return;
  }

  await db.insert(kycVerificationsTable).values({
    playerId,
    status: "pending",
    fullName,
    country,
    docType,
  });

  await db.update(playersTable).set({ kycStatus: "pending" }).where(eq(playersTable.id, playerId));

  // Notify admin via GroupBot (fire-and-forget)
  import("../lib/groupBot").then(({ broadcastMessage }) => {
    broadcastMessage(
      `New KYC submission from @${player.username} (ID: ${playerId})\nName: ${fullName}, Country: ${country}, Doc: ${docType}`,
    ).catch(() => {});
  }).catch(() => {});

  logger.info({ playerId, fullName }, "KYC submitted");
  res.json({ status: "pending", message: "KYC submitted successfully. Review typically takes 24-48 hours." });
});

// GET /players/me/kyc — get player's KYC status
router.get("/players/me/kyc", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const [verification] = await db
    .select()
    .from(kycVerificationsTable)
    .where(eq(kycVerificationsTable.playerId, playerId))
    .orderBy(desc(kycVerificationsTable.createdAt))
    .limit(1);

  res.json({
    status: player.kycStatus,
    submittedAt: verification?.createdAt?.toISOString() ?? null,
    reviewedAt: verification?.reviewedAt?.toISOString() ?? null,
    reviewNote: verification?.reviewNote ?? null,
  });
});

// GET /admin/kyc — list pending KYC verifications
router.get("/admin/kyc", requireAdmin, async (_req, res): Promise<void> => {
  const verifications = await db
    .select({
      id: kycVerificationsTable.id,
      playerId: kycVerificationsTable.playerId,
      status: kycVerificationsTable.status,
      fullName: kycVerificationsTable.fullName,
      country: kycVerificationsTable.country,
      docType: kycVerificationsTable.docType,
      reviewNote: kycVerificationsTable.reviewNote,
      createdAt: kycVerificationsTable.createdAt,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      tonWageredLifetime: playersTable.tonWageredLifetime,
    })
    .from(kycVerificationsTable)
    .leftJoin(playersTable, eq(kycVerificationsTable.playerId, playersTable.id))
    .orderBy(desc(kycVerificationsTable.createdAt))
    .limit(100);

  res.json(verifications.map(v => ({ ...v, createdAt: v.createdAt?.toISOString() ?? null })));
});

// POST /admin/kyc/:id/review — approve or reject a KYC submission
router.post("/admin/kyc/:id/review", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { action, reviewNote } = req.body as { action: "approve" | "reject"; reviewNote?: string };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be approve or reject" });
    return;
  }

  const [kyc] = await db.select().from(kycVerificationsTable).where(eq(kycVerificationsTable.id, id));
  if (!kyc) {
    res.status(404).json({ error: "KYC submission not found" });
    return;
  }

  const newStatus = action === "approve" ? "verified" : "rejected";

  await db.update(kycVerificationsTable).set({
    status: newStatus,
    reviewNote: reviewNote ?? null,
    reviewedBy: "admin",
    reviewedAt: new Date(),
  }).where(eq(kycVerificationsTable.id, id));

  await db.update(playersTable).set({ kycStatus: newStatus }).where(eq(playersTable.id, kyc.playerId));

  await db.insert(auditLogTable).values({
    adminAction: `kyc_${action}`,
    targetPlayerId: kyc.playerId,
    newValue: reviewNote ?? action,
    performedBy: "admin",
  });

  // Notify player via GameBot
  import("../lib/gameBot").then(({ getGameBot }) => {
    const bot = getGameBot();
    if (!bot) return;
    const msg = action === "approve"
      ? "Your identity verification has been approved! You can now withdraw over 100 TON."
      : `Your identity verification was not approved. Reason: ${reviewNote ?? "Please resubmit with clearer documents."}`;
    import("@workspace/db").then(({ db: dbInner, playersTable: pt }) => {
      import("drizzle-orm").then(({ eq: eqInner }) => {
        dbInner.select({ telegramId: pt.telegramId }).from(pt).where(eqInner(pt.id, kyc.playerId)).then(([p]) => {
          if (p) bot.telegram.sendMessage(p.telegramId, msg).catch(() => {});
        });
      });
    });
  }).catch(() => {});

  logger.info({ id, action, playerId: kyc.playerId }, "KYC reviewed");
  res.json({ ok: true, status: newStatus });
});

export default router;
