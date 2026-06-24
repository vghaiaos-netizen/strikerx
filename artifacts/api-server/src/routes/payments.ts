import { Router, type IRouter } from "express";
import { createHash, createHmac } from "crypto";
import { db, playersTable, transactionsTable, withdrawalsTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { strikerToTon, tonToStriker } from "../lib/gameEngine";
import { logger } from "../lib/logger";
import { processCryptoBotTransfer } from "../lib/cryptobotService";
import { getPrice } from "../lib/binanceFeed";
import { broadcastToPlayer } from "../lib/wsServer";

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

  const assetMap: Record<string, string> = {
    TON: "TON",
    USDT_TON: "USDT",
    USDT_TRC20: "USDT",
    BNB: "BNB",
    SOL: "SOL",
  };
  const asset = assetMap[currency] ?? "TON";
  const minDepositTon = parseFloat(process.env.MIN_DEPOSIT_TON ?? "5");

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
        expires_in: 3600,
        paid_btn_name: "openBot",
        paid_btn_url: process.env.WEBHOOK_DOMAIN
          ? `https://${process.env.WEBHOOK_DOMAIN}`
          : process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
            : process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : `https://t.me/StrykkerXBot/StrikerX`,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      result?: { invoice_id: string; bot_invoice_url: string; pay_url: string; expiration_date: string };
      error?: unknown;
    };

    if (!data.ok || !data.result) {
      req.log.error({ error: data.error }, "CryptoBot invoice creation failed");
      res.status(502).json({ error: "Failed to create payment invoice" });
      return;
    }

    const expiresAt = data.result.expiration_date ?? new Date(Date.now() + 3600000).toISOString();

    await db.insert(transactionsTable).values({
      playerId,
      type: "deposit",
      amountStriker: 0,
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

  // KYC gate for large withdrawals
  const kycThresholdTon = parseFloat(process.env.KYC_THRESHOLD_TON ?? "100");
  const amountTonCheck = strikerToTon(amountStriker);
  if (amountTonCheck >= kycThresholdTon && player.kycStatus !== "verified") {
    res.status(403).json({
      error: `Withdrawals over ${kycThresholdTon} TON require identity verification (KYC). Submit your verification in the Profile page.`,
      requiresKyc: true,
    });
    return;
  }

  if (parseFloat(String(player.strikerBalance)) < amountStriker) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  const wagerRequired = parseFloat(process.env.WELCOME_BONUS_STRIKER ?? "500") * parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10");
  if (player.strikerWageredSinceBonus < wagerRequired) {
    const remaining = wagerRequired - player.strikerWageredSinceBonus;
    res.status(400).json({ error: `Wager requirement not met. ${remaining.toFixed(0)} STRIKER remaining to wager.` });
    return;
  }

  const amountTon = strikerToTon(amountStriker);
  // All withdrawals require admin approval — auto-release is disabled for safety at launch
  const requiresReview = true;
  const status = "under_review";

  // Atomic deduction — prevents double-withdrawal race condition
  const [deducted] = await db
    .update(playersTable)
    .set({ strikerBalance: sql`${playersTable.strikerBalance} - ${amountStriker}` })
    .where(sql`${playersTable.id} = ${playerId} AND ${playersTable.strikerBalance} >= ${amountStriker}`)
    .returning();

  if (!deducted) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  const [withdrawal] = await db
    .insert(withdrawalsTable)
    .values({ playerId, amountStriker, amountTon, destinationAddress, currency, status })
    .returning();

  await db.insert(transactionsTable).values({
    playerId,
    type: "withdrawal",
    amountStriker: -amountStriker,
    amountTon: -amountTon,
    currency,
    status: "pending",
  });

  if (!requiresReview) {
    processCryptoBotTransfer(
      withdrawal.id,
      parseInt(player.telegramId, 10),
      amountTon,
      destinationAddress,
      player.username,
    ).catch((err) => logger.error({ err }, "Failed to process withdrawal transfer"));
  }

  res.json({ id: withdrawal.id, status: withdrawal.status, amountStriker, amountTon, requiresReview });
});

// POST /payments/webhook/cryptobot
router.post("/payments/webhook/cryptobot", async (req, res): Promise<void> => {
  const cryptobotToken = process.env.CRYPTOBOT_TOKEN ?? "";

  // Require valid HMAC-SHA256 signature from CryptoBot (production guard)
  const incomingSignature = req.headers["crypto-pay-api-signature"];
  if (cryptobotToken) {
    if (!incomingSignature) {
      logger.warn("CryptoBot webhook received with no signature — rejecting");
      res.status(401).json({ error: "Missing signature" });
      return;
    }
    const secret = createHash("sha256").update(cryptobotToken).digest();
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expectedSignature = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expectedSignature !== incomingSignature) {
      logger.warn("CryptoBot webhook signature mismatch");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
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

    // Use live prices for accurate TON equivalence.
    // Fallback constants are conservative minimums in case feed isn't ready yet.
    const liveTon = getPrice("TON") ?? 1.72;
    const liveBnb = getPrice("BNB") ?? 600;
    const liveSol = getPrice("SOL") ?? 67;
    const tonRates: Record<string, number> = {
      TON:  1,
      USDT: 1 / liveTon,            // 1 USDT ≈ 1/tonUsdPrice TON
      BNB:  liveBnb / liveTon,      // 1 BNB  ≈ bnbUsdPrice/tonUsdPrice TON
      SOL:  liveSol / liveTon,      // 1 SOL  ≈ solUsdPrice/tonUsdPrice TON
    };
    const tonEquivalent = amount * (tonRates[asset] ?? 1);

    // Apply rate event bonus if active
    let depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
    try {
      const { getConfig } = await import("../lib/configService");
      const rateEventActive = await getConfig("rate_event_active").catch(() => "false");
      const rateEventEndsAt = await getConfig("rate_event_ends_at").catch(() => "");
      const isExpired = rateEventEndsAt ? new Date(rateEventEndsAt).getTime() < Date.now() : false;
      if (rateEventActive === "true" && !isExpired) {
        const eventRate = parseFloat(await getConfig("rate_event_deposit_rate").catch(() => String(depositRate)));
        if (eventRate > depositRate) depositRate = eventRate;
      }
    } catch { /* use default */ }

    const strikerAmount = Math.floor(tonEquivalent * depositRate);

    // Credit the real-asset wallet balance (used for trading)
    const isUsdt = asset === "USDT";
    const realAmount = isUsdt ? amount : tonEquivalent; // USDT credited as USDT, all others as TON-equivalent

    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (player) {
      await db
        .update(playersTable)
        .set({
          // Real wallet for trading
          ...(isUsdt
            ? { usdtBalance: sql`${playersTable.usdtBalance} + ${realAmount}` }
            : { tonBalance: sql`${playersTable.tonBalance} + ${realAmount}` }
          ),
          // STRIKER for casino games
          strikerBalance: sql`${playersTable.strikerBalance} + ${strikerAmount}`,
        })
        .where(eq(playersTable.id, playerId));

      await db
        .update(transactionsTable)
        .set({
          amountStriker: strikerAmount,
          amountTon: tonEquivalent,
          status: "completed",
          exchangeRateAtTime: tonRates[asset] ?? 1,
        })
        .where(eq(transactionsTable.externalId, payload.payload?.invoice_id ?? ""));

      logger.info({ playerId, strikerAmount, realAmount, asset, currency, depositRate }, "Deposit credited");

      // Push real-time confirmation to the player's WebSocket connection
      broadcastToPlayer(playerId, "deposit_confirmed", {
        amount:         realAmount,
        amountStriker:  strikerAmount,
        asset,
        isUsdt,
        tonEquivalent,
        at: Date.now(),
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to process CryptoBot webhook");
  }

  res.json({ ok: true });
});

// ── MANUAL DEPOSIT ───────────────────────────────────────────────────────────
// Player submits a manual deposit request (M-Pesa / bank) after paying externally.
// Admin must confirm before balance is credited.
router.post("/payments/deposit/manual", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { method = "mpesa", phoneNumber, amountKes, reference, note } = req.body as {
    method?: string;
    phoneNumber?: string;
    amountKes?: number;
    reference?: string;
    note?: string;
  };

  if (!reference || reference.trim().length < 4) {
    res.status(400).json({ error: "Reference code is required (minimum 4 characters)" });
    return;
  }
  if (!amountKes || amountKes <= 0) {
    res.status(400).json({ error: "Amount in KES is required" });
    return;
  }
  if (method === "mpesa" && !phoneNumber) {
    res.status(400).json({ error: "Phone number is required for M-Pesa deposits" });
    return;
  }

  const { manualDepositsTable } = await import("@workspace/db");

  // Prevent duplicate reference codes from the same player
  const existing = await db
    .select({ id: manualDepositsTable.id })
    .from(manualDepositsTable)
    .where(and(eq(manualDepositsTable.playerId, playerId), eq(manualDepositsTable.reference, reference.trim().toUpperCase())))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "This reference code has already been submitted" });
    return;
  }

  const [deposit] = await db.insert(manualDepositsTable).values({
    playerId,
    method: method ?? "mpesa",
    phoneNumber: phoneNumber?.trim(),
    amountKes: amountKes,
    reference: reference.trim().toUpperCase(),
    note: note?.trim() || null,
    status: "pending",
  }).returning();

  req.log.info({ playerId, method, reference: deposit.reference, amountKes }, "Manual deposit submitted");

  res.json({
    id: deposit.id,
    status: "pending",
    reference: deposit.reference,
    message: "Your deposit is under review. Balance will be credited once confirmed by our team.",
  });
});

// ── PESAPAL STK PUSH ─────────────────────────────────────────────────────────
router.post("/payments/deposit/mpesa", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { phoneNumber, amountKes } = req.body as { phoneNumber: string; amountKes: number };

  if (!phoneNumber || !amountKes || amountKes <= 0) {
    res.status(400).json({ error: "Phone number and amount required" });
    return;
  }

  const { isPesapalConfigured, pesapalStkPush } = await import("../lib/pesapalService");
  if (!isPesapalConfigured()) {
    res.status(503).json({ error: "M-Pesa payments are not yet configured", fallback: true });
    return;
  }

  const domain = process.env.WEBHOOK_DOMAIN
    ?? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
    ?? process.env.RAILWAY_PUBLIC_DOMAIN
    ?? process.env.REPLIT_DEV_DOMAIN
    ?? "localhost:8000";

  const reference = `SX-${playerId}-${Date.now()}`;
  const result = await pesapalStkPush({
    phoneNumber,
    amountKes,
    reference,
    description: `StrikerX deposit — Player #${playerId}`,
    callbackUrl: `https://${domain}/api/payments/webhook/pesapal`,
    notificationId: process.env.PESAPAL_IPN_ID ?? "",
  });

  if (!result) {
    res.status(502).json({ error: "M-Pesa STK push failed. Please try manual deposit." });
    return;
  }

  const { manualDepositsTable } = await import("@workspace/db");
  await db.insert(manualDepositsTable).values({
    playerId,
    method: "mpesa",
    phoneNumber: phoneNumber.trim(),
    amountKes,
    reference,
    note: `Pesapal orderTrackingId: ${result.orderTrackingId}`,
    status: "pending",
  });

  res.json({ orderTrackingId: result.orderTrackingId, reference, message: "Check your phone for the M-Pesa STK push prompt." });
});

// ── PESAPAL IPN WEBHOOK ───────────────────────────────────────────────────────
router.post("/payments/webhook/pesapal", async (req, res): Promise<void> => {
  const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body as {
    OrderTrackingId?: string;
    OrderMerchantReference?: string;
    OrderNotificationType?: string;
  };

  if (OrderNotificationType !== "IPNCHANGE" || !OrderTrackingId) {
    res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId: OrderTrackingId, orderMerchantReference: OrderMerchantReference });
    return;
  }

  const { pesapalGetTransactionStatus } = await import("../lib/pesapalService");
  const status = await pesapalGetTransactionStatus(OrderTrackingId);
  if (!status || status.status !== "COMPLETED") {
    res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId: OrderTrackingId, orderMerchantReference: OrderMerchantReference });
    return;
  }

  const { manualDepositsTable } = await import("@workspace/db");
  const [deposit] = await db
    .select()
    .from(manualDepositsTable)
    .where(eq(manualDepositsTable.reference, OrderMerchantReference ?? ""))
    .limit(1);

  if (deposit && deposit.status === "pending") {
    const amountKes = status.amount ?? deposit.amountKes ?? 0;
    const KES_TO_TON = parseFloat(process.env.KES_TO_TON ?? "0.00055");
    const tonEquivalent = amountKes * KES_TO_TON;
    const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
    const strikerAmount = Math.floor(tonEquivalent * depositRate);

    await db.update(manualDepositsTable)
      .set({ status: "confirmed", confirmedBy: "pesapal-ipn", confirmedAt: new Date(), amountStriker: strikerAmount })
      .where(eq(manualDepositsTable.id, deposit.id));

    await db.update(playersTable)
      .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${strikerAmount}`, tonBalance: sql`${playersTable.tonBalance} + ${tonEquivalent}` })
      .where(eq(playersTable.id, deposit.playerId));

    await db.insert(transactionsTable).values({
      playerId: deposit.playerId,
      type: "deposit",
      amountStriker: strikerAmount,
      amountTon: tonEquivalent,
      currency: "KES_MPESA",
      status: "completed",
      externalId: OrderTrackingId,
    });

    broadcastToPlayer(deposit.playerId, "deposit_confirmed", { amount: tonEquivalent, amountStriker: strikerAmount, asset: "MPESA", at: Date.now() });
    logger.info({ playerId: deposit.playerId, strikerAmount, amountKes }, "Pesapal IPN deposit credited");
  }

  res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId: OrderTrackingId, orderMerchantReference: OrderMerchantReference });
});

// ── MY DEPOSIT HISTORY ────────────────────────────────────────────────────────
router.get("/payments/my-deposits", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { manualDepositsTable } = await import("@workspace/db");

  const [cryptoDeposits, manualDeposits] = await Promise.all([
    db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.playerId, playerId), eq(transactionsTable.type, "deposit")))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(20),
    db.select().from(manualDepositsTable)
      .where(eq(manualDepositsTable.playerId, playerId))
      .orderBy(desc(manualDepositsTable.createdAt))
      .limit(20),
  ]);

  res.json({ cryptoDeposits, manualDeposits });
});

export default router;
