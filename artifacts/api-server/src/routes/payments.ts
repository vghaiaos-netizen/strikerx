import { Router, type IRouter } from "express";
import { db, playersTable, transactionsTable, withdrawalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { strikerToTon, tonToStriker } from "../lib/gameEngine";
import { broadcastWithdrawal } from "../lib/groupBot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /payments/deposit
router.post("/payments/deposit", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { currency } = req.body as { currency: string };

  const validCurrencies = ["TON", "USDT_TON", "USDT_TRC20", "BNB", "SOL"];
  if (!validCurrencies.includes(currency)) {
    res.status(400).json({ error: "Invalid currency" });
    return;
  }

  const cryptobotToken = process.env.CRYPTOBOT_TOKEN;
  if (!cryptobotToken) {
    res.status(503).json({ error: "Payment system not configured" });
    return;
  }

  // Map internal currency to CryptoBot asset
  const assetMap: Record<string, string> = {
    TON: "TON",
    USDT_TON: "USDT",
    USDT_TRC20: "USDT",
    BNB: "BNB",
    SOL: "SOL",
  };
  const asset = assetMap[currency] ?? "TON";
  const minDepositTon = parseFloat(process.env.MIN_DEPOSIT_TON ?? "0.5");

  try {
    const response = await fetch("https://pay.crypt.bot/api/createInvoice", {
      method: "POST",
      headers: {
        "Crypto-Pay-API-Token": cryptobotToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        asset,
        amount: minDepositTon.toString(),
        description: `StrikerX deposit — Player #${playerId}`,
        payload: JSON.stringify({ playerId, currency }),
        expires_in: 3600, // 1 hour
        paid_btn_name: "openBot",
        paid_btn_url: `https://${process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX"}`,
      }),
    });

    const data = (await response.json()) as { ok: boolean; result?: { invoice_id: string; bot_invoice_url: string; pay_url: string; expiration_date: string }; error?: unknown };

    if (!data.ok || !data.result) {
      req.log.error({ error: data.error }, "CryptoBot invoice creation failed");
      res.status(502).json({ error: "Failed to create payment invoice" });
      return;
    }

    const expiresAt = data.result.expiration_date ?? new Date(Date.now() + 3600000).toISOString();

    // Record pending transaction
    await db.insert(transactionsTable).values({
      playerId,
      type: "deposit",
      amountStriker: 0, // Will be updated on webhook
      currency,
      status: "pending",
      externalId: data.result.invoice_id,
    });

    res.json({
      invoiceId: data.result.invoice_id,
      payLink: data.result.pay_url ?? data.result.bot_invoice_url,
      currency,
      expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create CryptoBot invoice");
    res.status(502).json({ error: "Payment service unavailable" });
  }
});

// POST /payments/withdraw
router.post("/payments/withdraw", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { amountStriker, destinationAddress, currency = "TON" } = req.body as {
    amountStriker: number;
    destinationAddress: string;
    currency: string;
  };

  const minWithdraw = parseFloat(process.env.MIN_WITHDRAW_STRIKER ?? "1000");
  if (!amountStriker || amountStriker < minWithdraw) {
    res.status(400).json({ error: `Minimum withdrawal is ${minWithdraw} STRIKER` });
    return;
  }

  if (!destinationAddress) {
    res.status(400).json({ error: "Destination address required" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (player.strikerBalance < amountStriker) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Check wager requirement for bonus funds
  const wagerRequired = parseFloat(process.env.WELCOME_BONUS_STRIKER ?? "500") * parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10");
  if (player.strikerWageredSinceBonus < wagerRequired) {
    const remaining = wagerRequired - player.strikerWageredSinceBonus;
    res.status(400).json({ error: `Wager requirement not met. ${remaining.toFixed(0)} STRIKER remaining to wager.` });
    return;
  }

  const amountTon = strikerToTon(amountStriker);

  // Check if this needs manual review (new account)
  const reviewThreshold = parseFloat(process.env.NEW_ACCOUNT_REVIEW_THRESHOLD ?? "1");
  const requiresReview = !player.firstWithdrawalReviewed;
  const status = requiresReview ? "under_review" : "pending";

  // Deduct balance immediately
  await db
    .update(playersTable)
    .set({ strikerBalance: player.strikerBalance - amountStriker })
    .where(eq(playersTable.id, playerId));

  const [withdrawal] = await db
    .insert(withdrawalsTable)
    .values({
      playerId,
      amountStriker,
      amountTon,
      destinationAddress,
      currency,
      status,
    })
    .returning();

  await db.insert(transactionsTable).values({
    playerId,
    type: "withdrawal",
    amountStriker: -amountStriker,
    amountTon: -amountTon,
    currency,
    status: requiresReview ? "pending" : "completed",
  });

  if (!requiresReview) {
    // Auto-process via CryptoBot
    processCryptoBotTransfer(withdrawal.id, playerId, amountTon, destinationAddress, player.username).catch((err) =>
      logger.error({ err }, "Failed to process withdrawal transfer")
    );
  }

  res.json({
    id: withdrawal.id,
    status: withdrawal.status,
    amountStriker,
    amountTon,
    requiresReview,
  });
});

async function processCryptoBotTransfer(withdrawalId: number, playerId: number, amountTon: number, address: string, username: string) {
  const cryptobotToken = process.env.CRYPTOBOT_TOKEN;
  if (!cryptobotToken) return;

  try {
    const response = await fetch("https://pay.crypt.bot/api/transfer", {
      method: "POST",
      headers: {
        "Crypto-Pay-API-Token": cryptobotToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: playerId,
        asset: "TON",
        amount: amountTon.toString(),
        spend_id: `withdrawal_${withdrawalId}`,
        comment: "StrikerX withdrawal",
      }),
    });

    const data = (await response.json()) as { ok: boolean; result?: { transfer_id: string } };

    const newStatus = data.ok ? "completed" : "failed";
    await db
      .update(withdrawalsTable)
      .set({ status: newStatus, externalTransferId: data.result?.transfer_id })
      .where(eq(withdrawalsTable.id, withdrawalId));

    if (data.ok) {
      broadcastWithdrawal(username, amountTon).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "CryptoBot transfer failed");
    await db.update(withdrawalsTable).set({ status: "failed" }).where(eq(withdrawalsTable.id, withdrawalId));
  }
}

// POST /payments/webhook/cryptobot
router.post("/payments/webhook/cryptobot", async (req, res): Promise<void> => {
  // Verify the request comes from CryptoBot by checking the API token header
  const incomingToken = req.headers["crypto-pay-api-token"] as string | undefined;
  const expectedToken = process.env.CRYPTOBOT_TOKEN;
  if (!expectedToken || incomingToken !== expectedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as {
    update_type?: string;
    payload?: {
      invoice_id?: string;
      amount?: string;
      asset?: string;
      payload?: string;
      status?: string;
    };
  };

  if (payload.update_type !== "invoice_paid" || payload.payload?.status !== "paid") {
    res.json({ ok: true });
    return;
  }

  const invoicePayload = payload.payload?.payload;
  if (!invoicePayload) {
    res.json({ ok: true });
    return;
  }

  try {
    const { playerId, currency } = JSON.parse(invoicePayload) as { playerId: number; currency: string };
    const amount = parseFloat(payload.payload?.amount ?? "0");
    const asset = payload.payload?.asset ?? "TON";

    // Convert to TON equivalent (simplified — 1:1 for TON, approximate for others)
    const tonRates: Record<string, number> = {
      TON: 1,
      USDT: 0.2, // Approximate: 1 USDT ≈ 0.2 TON (adjust based on real rates)
      BNB: 20,
      SOL: 5,
    };
    const tonEquivalent = amount * (tonRates[asset] ?? 1);
    const strikerAmount = tonToStriker(tonEquivalent);

    // Credit player
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (player) {
      await db
        .update(playersTable)
        .set({
          strikerBalance: player.strikerBalance + strikerAmount,
          strikerWageredSinceBonus: 0, // Reset wager progress on new deposit
        })
        .where(eq(playersTable.id, playerId));

      // Update pending transaction
      await db
        .update(transactionsTable)
        .set({
          amountStriker: strikerAmount,
          amountTon: tonEquivalent,
          status: "completed",
          exchangeRateAtTime: tonRates[asset] ?? 1,
        })
        .where(eq(transactionsTable.externalId, payload.payload?.invoice_id ?? ""));

      logger.info({ playerId, strikerAmount, currency }, "Deposit credited");
    }
  } catch (err) {
    logger.error({ err }, "Failed to process CryptoBot webhook");
  }

  res.json({ ok: true });
});

export default router;
