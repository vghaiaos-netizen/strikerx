import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /public/rate-event — public rate event status (no auth required)
router.get("/public/rate-event", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const active = await getConfig("rate_event_active").catch(() => "false");
    const depositRate = await getConfig("rate_event_deposit_rate").catch(() => "100");
    const endsAt = await getConfig("rate_event_ends_at").catch(() => "");
    const now = Date.now();
    const isExpired = endsAt ? new Date(endsAt).getTime() < now : false;

    res.json({
      active: active === "true" && !isExpired,
      depositRate: parseFloat(depositRate) || 100,
      endsAt: endsAt || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get rate event status");
    res.json({ active: false, depositRate: 100, endsAt: null });
  }
});

// GET /public/match-event — active World Cup / match event
router.get("/public/match-event", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const active = await getConfig("match_event_active").catch(() => "false");
    const teamA = await getConfig("match_event_team_a").catch(() => "");
    const teamB = await getConfig("match_event_team_b").catch(() => "");
    const bonusMultiplier = await getConfig("match_event_bonus_multiplier").catch(() => "1.0");
    const endsAt = await getConfig("match_event_ends_at").catch(() => "");
    const label = await getConfig("match_event_label").catch(() => "Match Day");
    const now = Date.now();
    const isExpired = endsAt ? new Date(endsAt).getTime() < now : false;

    res.json({
      active: active === "true" && !isExpired,
      teamA: teamA || "",
      teamB: teamB || "",
      bonusMultiplier: parseFloat(bonusMultiplier) || 1.0,
      endsAt: endsAt || null,
      label: label || "",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get match event status");
    res.json({ active: false, teamA: "", teamB: "", bonusMultiplier: 1.0, endsAt: null, label: "" });
  }
});

// GET /public/wc-theme — World Cup 2026 theme status
router.get("/public/wc-theme", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const override = await getConfig("wc_edition_active").catch(() => "");
    const kickOff = await getConfig("wc_kick_off").catch(() => "2026-06-11T16:00:00.000Z");
    const wcEnd = await getConfig("wc_edition_ends").catch(() => "2026-07-20T00:00:00.000Z");

    const now = Date.now();
    const kickOffMs = new Date(kickOff || "2026-06-11T16:00:00.000Z").getTime();
    const endMs = new Date(wcEnd || "2026-07-20T00:00:00.000Z").getTime();

    const dateActive = now >= kickOffMs && now <= endMs;
    const active = override === "true" || dateActive;
    const countdown = now < kickOffMs;
    const live = now >= kickOffMs && now <= endMs;

    res.json({
      active: active || countdown,
      live,
      countdown,
      kickOff: kickOff || "2026-06-11T16:00:00.000Z",
      endsAt: wcEnd || "2026-07-20T00:00:00.000Z",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get WC theme status");
    res.json({ active: false, live: false, countdown: false, kickOff: null, endsAt: null });
  }
});

// GET /public/recent-wins — last 20 big wins for the live winners feed (no auth)
router.get("/public/recent-wins", async (_req, res): Promise<void> => {
  try {
    const { db, gamesTable, playersTable } = await import("@workspace/db");
    const { desc, eq } = await import("drizzle-orm");

    const wins = await db
      .select({
        id:         gamesTable.id,
        username:   playersTable.username,
        gameType:   gamesTable.gameType,
        betStriker: gamesTable.betStriker,
        winAmount:  gamesTable.winAmount,
        multiplier: gamesTable.resultMultiplier,
        playedAt:   gamesTable.createdAt,
      })
      .from(gamesTable)
      .innerJoin(playersTable, eq(gamesTable.playerId, playersTable.id))
      .where(eq(gamesTable.outcome, "win"))
      .orderBy(desc(gamesTable.createdAt))
      .limit(20);

    res.json(wins.map(w => ({
      id:        w.id,
      username:  w.username,
      game:      w.gameType,
      bet:       parseFloat(String(w.betStriker)),
      win:       parseFloat(String(w.winAmount)),
      mult:      parseFloat(String(w.multiplier ?? 1)),
      playedAt:  w.playedAt,
    })));
  } catch (err) {
    logger.error({ err }, "Failed to get recent wins");
    res.json([]);
  }
});

// GET /public/ton-price — TON/USD price, cached 60 seconds (CoinGecko free API)
router.get("/public/ton-price", async (_req, res): Promise<void> => {
  try {
    const { getConfig, setConfig } = await import("../lib/configService");
    const tsStr = await getConfig("ton_price_cached_at").catch(() => "");
    const cachedPrice = await getConfig("ton_price_usd").catch(() => "");
    const isStale = !tsStr || !cachedPrice || Date.now() - Number(tsStr) > 60_000;

    if (!isStale) {
      res.json({ usd: parseFloat(cachedPrice), cachedAt: Number(tsStr) });
      return;
    }

    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const d = await r.json() as { "the-open-network"?: { usd?: number } };
    const usd = d["the-open-network"]?.usd;
    if (!usd) throw new Error("Missing price data");

    await setConfig("ton_price_usd", String(usd));
    await setConfig("ton_price_cached_at", String(Date.now()));

    res.json({ usd, cachedAt: Date.now() });
  } catch (err) {
    logger.warn({ err }, "TON price fetch failed — returning cached or fallback");
    const cached = await import("../lib/configService")
      .then(m => m.getConfig("ton_price_usd"))
      .catch(() => "0");
    res.json({ usd: parseFloat(cached) || null, cachedAt: null, stale: true });
  }
});

// GET /public/community — group invite link + bot username (no auth required)
router.get("/public/community", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const groupInviteLink = await getConfig("telegram_group_invite_link").catch(() => "");
    const miniAppLink = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";
    res.json({
      groupInviteLink: groupInviteLink || null,
      miniAppLink,
      botUsername: "StrykkerXBot",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get community info");
    res.json({ groupInviteLink: null, miniAppLink: null, botUsername: "StrykkerXBot" });
  }
});

export default router;
