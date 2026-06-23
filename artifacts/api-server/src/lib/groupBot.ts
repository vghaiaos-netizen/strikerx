import { Telegraf } from "telegraf";
import { logger } from "./logger";
import { generateText } from "./groqPool";

let groupBot: Telegraf | null = null;
let schedulerInitialized = false;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the group chat ID — config table takes priority over env var. */
async function getGroupChatId(): Promise<string | null> {
  try {
    const { getConfig } = await import("./configService.js");
    const fromConfig = await getConfig("telegram_group_id");
    if (fromConfig) return fromConfig;
  } catch {
    // fall through to env var
  }
  return process.env.TELEGRAM_GROUP_ID ?? process.env.GROUP_CHAT_ID ?? null;
}

function getAppUrl(): string {
  const link = process.env.MINI_APP_LINK;
  if (link) return link.startsWith("http") ? link : `https://${link}`;
  return "https://t.me/StrykkerXBot/StrikerX";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getGroupBot(): Telegraf | null {
  if (!groupBot && process.env.GROUPBOT_TOKEN) {
    groupBot = new Telegraf(process.env.GROUPBOT_TOKEN);
  }
  return groupBot;
}

async function sendToGroup(text: string, inlineButton?: { text: string; url: string }): Promise<void> {
  const bot    = getGroupBot();
  const chatId = await getGroupChatId();
  if (!bot || !chatId) return;

  try {
    const extra = inlineButton
      ? { reply_markup: { inline_keyboard: [[{ text: inlineButton.text, url: inlineButton.url }]] } }
      : {};
    await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML", ...extra });
  } catch (err) {
    logger.error({ err }, "Failed to send GroupBot message");
  }
}

// ─── AI-enhanced text generation ──────────────────────────────────────────────
// Each broadcast can optionally call Groq to produce a varied message.
// If Groq is unavailable/all keys cooling, we fall back to the static template.
// Timeout is 8 s so the broadcast never blocks more than a fraction of a second
// over the static path.

const GROUPBOT_PERSONA = `You are the official announcer for StrikerX, a football-themed crypto trading platform.
Write punchy, exciting Telegram announcements in English. Stadium atmosphere. No emojis — use plain text.
Keep messages under 100 words. Never mention bet amounts in exact numbers unless told to.
Respond with only the announcement text — no quotes, no explanations.`;

async function aiText(prompt: string, fallback: string): Promise<string> {
  const result = await generateText(GROUPBOT_PERSONA, prompt, 150);
  return result ?? fallback;
}

// ─── Existing broadcasts (preserved + optionally AI-enhanced) ─────────────────

export async function broadcastWelcome(username: string, jackpotAmount: number): Promise<void> {
  const safe = escapeHtml(username);
  const text = `Welcome to StrikerX @${safe}!\nThe stadium is LIVE. Golden Boot: <b>${jackpotAmount.toFixed(2)} TON</b>\nYour 500 STRIKER welcome bonus is waiting.`;
  await sendToGroup(text, { text: "Claim &amp; Play", url: getAppUrl() });
}

export async function broadcastBigWin(username: string, betStriker: number, winStriker: number, game: string): Promise<void> {
  const safe       = escapeHtml(username);
  const safeGame   = escapeHtml(game);
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon     = (betStriker / depositRate).toFixed(2);
  const winTon     = (winStriker / depositRate).toFixed(2);
  const multiplier = (winStriker / betStriker).toFixed(2);

  const staticText = `GOOOAL!\n@${safe} just turned <b>${betTon} TON</b> into <b>${winTon} TON</b>\non <b>${safeGame}</b> at ${multiplier}x!\nCan you beat it?`;
  const aiPrompt   = `Player @${safe} just won ${winTon} TON from ${betTon} TON (${multiplier}x) playing ${safeGame}. Write an exciting stadium-style announcement.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Play Now", url: getAppUrl() });
}

export async function broadcastJackpot(username: string, amountTon: number): Promise<void> {
  const safe        = escapeHtml(username);
  const seedAmount  = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");

  const staticText = `GOLDEN BOOT CLAIMED!\n@${safe} just won <b>${amountTon.toFixed(2)} TON</b>!\nNew Golden Boot starting at ${seedAmount} TON now.`;
  const aiPrompt   = `Player @${safe} just won the jackpot: ${amountTon.toFixed(2)} TON. Write an exciting Golden Boot jackpot announcement for the StrikerX Telegram channel.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Play Now", url: getAppUrl() });
}

export async function broadcastWithdrawal(username: string, amountTon: number): Promise<void> {
  const safe = escapeHtml(username);
  const text = `@${safe} just cashed out <b>${amountTon.toFixed(2)} TON</b>.\nReal money. Real fast.`;
  await sendToGroup(text, { text: "Open Casino", url: getAppUrl() });
}

export async function broadcastJackpotUpdate(): Promise<void> {
  try {
    const { db, jackpotTable } = await import("@workspace/db");
    const [jackpot] = await db.select().from(jackpotTable).limit(1);
    if (!jackpot) return;

    const lastWon = jackpot.lastTriggeredAt
      ? Math.floor((Date.now() - jackpot.lastTriggeredAt.getTime()) / 3600000)
      : null;

    const text = `Golden Boot Jackpot: <b>${jackpot.currentAmountTon.toFixed(2)} TON</b>\nGrowing with every kick.${lastWon !== null ? ` Last won ${lastWon}h ago.` : ""}`;
    await sendToGroup(text, { text: "Take Your Shot", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast jackpot update");
  }
}

export async function broadcastMessage(message: string, buttonText?: string, buttonUrl?: string): Promise<void> {
  const button = buttonText && buttonUrl ? { text: buttonText, url: buttonUrl } : undefined;
  await sendToGroup(message, button);
}

export async function broadcastMorningMessage(): Promise<void> {
  try {
    const { db, jackpotTable, gamesTable, playersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [jackpot] = await db.select().from(jackpotTable).limit(1);

    const yesterdayGames = await db.select().from(gamesTable).limit(500);
    const bestGame       = yesterdayGames.sort((a, b) => b.resultMultiplier - a.resultMultiplier)[0];
    let topScorerLine    = "";
    let topScorerName    = "";

    if (bestGame) {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, bestGame.playerId));
      if (player) {
        topScorerName  = player.username;
        topScorerLine  = `\nYesterday's top scorer: @${escapeHtml(player.username)} (${bestGame.resultMultiplier.toFixed(2)}x)`;
      }
    }

    const jackpotAmt = jackpot?.currentAmountTon.toFixed(2) ?? "0";
    const staticText = `Match Day at StrikerX!${topScorerLine}\nGolden Boot: <b>${jackpotAmt} TON</b>\nYour move.`;
    const aiPrompt   = `Write a morning hype message for the StrikerX Telegram community. ${topScorerName ? `Yesterday's top scorer was @${topScorerName}.` : ""} The jackpot is currently ${jackpotAmt} TON. Stadium atmosphere, short, punchy.`;

    const text = await aiText(aiPrompt, staticText);
    await sendToGroup(text, { text: "Open Casino", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast morning message");
  }
}

// ─── New broadcasts ────────────────────────────────────────────────────────────

/** Trading terminal big win — fires when a position settles above threshold. */
export async function broadcastTradingBigWin(
  username: string,
  assetSymbol: string,
  winAmount: number,
  currency: string,
): Promise<void> {
  const safe      = escapeHtml(username);
  const safeAsset = escapeHtml(assetSymbol);
  const amt       = currency === "STRIKER"
    ? `${Math.round(winAmount).toLocaleString()} STRIKER`
    : `${winAmount.toFixed(4)} ${currency}`;

  const staticText = `Precision trade!\n@${safe} just won <b>${amt}</b> on <b>${safeAsset}</b>.\nBinary trading — called it.`;
  const aiPrompt   = `Trader @${safe} just won ${amt} on a ${safeAsset} binary prediction. Short stadium announcement for the StrikerX channel.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Trade Now", url: getAppUrl() });
}

/** Trading win streak milestone — fires at 3, 5, 10 consecutive wins. */
export async function broadcastTradingStreak(
  username: string,
  streakCount: number,
  assetSymbol: string,
): Promise<void> {
  const safe      = escapeHtml(username);
  const safeAsset = escapeHtml(assetSymbol);

  const staticText = `${streakCount} in a row!\n@${safe} is on a <b>${streakCount}-trade win streak</b> on <b>${safeAsset}</b>.\nCan anyone match it?`;
  const aiPrompt   = `Trader @${safe} just hit a ${streakCount}-trade consecutive win streak on ${safeAsset}. Write a short, hype stadium announcement.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Start Trading", url: getAppUrl() });
}

/** Tournament created by admin. */
export async function broadcastTournamentStart(
  name: string,
  prizePoolTon: number,
  endTimeISO: string,
): Promise<void> {
  const safeName = escapeHtml(name);
  const endsDate = new Date(endTimeISO);
  const endsStr  = endsDate.toUTCString().replace(" GMT", " UTC");

  const text = `Tournament LIVE: <b>${safeName}</b>\nPrize pool: <b>${prizePoolTon.toFixed(2)} TON</b>\nEnds: ${endsStr}\nTop your multiplier to win.`;
  await sendToGroup(text, { text: "Enter Now", url: getAppUrl() });
}

/** Tournament ended, winner known. prizeStriker = top prize in STRIKER. */
export async function broadcastTournamentEnd(
  winnerUsername: string,
  prizeStriker: number,
): Promise<void> {
  const safe       = escapeHtml(winnerUsername);
  const staticText = `Tournament over! @${safe} wins the championship with <b>${Math.round(prizeStriker).toLocaleString()} STRIKER</b> in prize money.\nNext tournament coming soon.`;
  const aiPrompt   = `The StrikerX tournament just ended. @${safe} won ${Math.round(prizeStriker).toLocaleString()} STRIKER. Write a brief, exciting announcement.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Play Now", url: getAppUrl() });
}

/** Player advanced to a new VIP tier. */
export async function broadcastVIPPromotion(username: string, newTier: string): Promise<void> {
  const safe      = escapeHtml(username);
  const tierLabel = newTier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const text      = `@${safe} has been promoted to <b>${escapeHtml(tierLabel)}</b>.\nBigger cashbacks. Bigger stakes.`;
  await sendToGroup(text, { text: "Check VIP Perks", url: getAppUrl() });
}

/** Epic or legendary achievement unlocked. */
export async function broadcastRareAchievement(username: string, achievementTitle: string): Promise<void> {
  const safe  = escapeHtml(username);
  const title = escapeHtml(achievementTitle);
  const text  = `Achievement unlocked!\n@${safe} just earned <b>${title}</b>.\nRare badge. Rare player.`;
  await sendToGroup(text, { text: "See Achievements", url: getAppUrl() });
}

/** Admin activated a rate event (bonus STRIKER deposit window). */
export async function broadcastRateEvent(depositRate: number, durationMinutes: number): Promise<void> {
  const hours = durationMinutes >= 60 ? `${Math.round(durationMinutes / 60)}h` : `${durationMinutes}m`;

  const staticText = `RATE EVENT LIVE!\nDeposit now and get <b>${depositRate} STRIKER per TON</b> for the next <b>${hours}</b>.\nLimited window — don't miss it.`;
  const aiPrompt   = `StrikerX is running a deposit bonus event: ${depositRate} STRIKER per TON for ${hours}. Write a short, urgent announcement.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Deposit Now", url: getAppUrl() });
}

/** Admin activated a match event (bonus multiplier). */
export async function broadcastMatchEvent(teamA: string, teamB: string, multiplier: number): Promise<void> {
  const safeA  = escapeHtml(teamA);
  const safeB  = escapeHtml(teamB);
  const mxText = multiplier > 1 ? ` <b>${multiplier}x</b> bonus on all trades` : "";

  const staticText = `Match Day LIVE: <b>${safeA} vs ${safeB}</b>${mxText}.\nPredictions are open. Play the match.`;
  const aiPrompt   = `Match event: ${teamA} vs ${teamB} with a ${multiplier}x bonus multiplier active on StrikerX. Short, exciting announcement.`;

  const text = await aiText(aiPrompt, staticText);
  await sendToGroup(text, { text: "Trade the Match", url: getAppUrl() });
}

// ─── Scheduled broadcasts ──────────────────────────────────────────────────────

/** Daily leaderboard shoutout — top 3 traders by P&L today. */
async function broadcastDailyLeaderboard(): Promise<void> {
  try {
    const { db, tradingPositionsTable, playersTable } = await import("@workspace/db");
    const { eq, desc, gte, sql } = await import("drizzle-orm");

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const rows = await db
      .select({
        username:  playersTable.username,
        totalWon:  sql<number>`COALESCE(SUM(${tradingPositionsTable.winAmount}),0)`,
      })
      .from(tradingPositionsTable)
      .leftJoin(playersTable, eq(tradingPositionsTable.playerId, playersTable.id))
      .where(gte(tradingPositionsTable.settledAt, todayStart))
      .groupBy(playersTable.username)
      .orderBy(desc(sql`COALESCE(SUM(${tradingPositionsTable.winAmount}),0)`))
      .limit(3);

    if (rows.length === 0) return;

    const medals = ["1st", "2nd", "3rd"];
    const lines  = rows
      .map((r, i) => `${medals[i]} @${escapeHtml(r.username ?? "?")} — ${Number(r.totalWon).toFixed(2)} won`)
      .join("\n");

    const text = `Today's top traders:\n${lines}\nKeep trading to claim the top spot.`;
    await sendToGroup(text, { text: "Start Trading", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast daily leaderboard");
  }
}

/** Evening recap — 9pm UTC. Activity summary for the day. */
async function broadcastEveningRecap(): Promise<void> {
  try {
    const { db, tradingPositionsTable, gamesTable, playersTable } = await import("@workspace/db");
    const { gte, eq, sql } = await import("drizzle-orm");

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [tradingStats] = await db
      .select({
        tradeCount:  sql<number>`COUNT(*)`,
        winCount:    sql<number>`SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END)`,
        totalPayout: sql<number>`COALESCE(SUM(win_amount),0)`,
      })
      .from(tradingPositionsTable)
      .where(gte(tradingPositionsTable.createdAt, todayStart));

    const [gameStats] = await db
      .select({ gameCount: sql<number>`COUNT(*)` })
      .from(gamesTable)
      .where(gte(gamesTable.createdAt, todayStart));

    const tradeCount  = Number(tradingStats?.tradeCount  ?? 0);
    const winCount    = Number(tradingStats?.winCount    ?? 0);
    const totalPayout = Number(tradingStats?.totalPayout ?? 0);
    const gameCount   = Number(gameStats?.gameCount   ?? 0);

    if (tradeCount === 0 && gameCount === 0) return;

    const winRate   = tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0;
    const staticText = `Evening recap:\n<b>${tradeCount}</b> trades, <b>${winRate}%</b> win rate\n<b>${totalPayout.toFixed(2)}</b> paid out\n<b>${gameCount}</b> casino rounds\n\nTomorrow starts fresh.`;

    const aiPrompt = `End of day recap: ${tradeCount} binary trades today, ${winRate}% win rate, ${totalPayout.toFixed(2)} paid out, ${gameCount} casino games. Write a short, engaged recap for the StrikerX Telegram channel.`;
    const text     = await aiText(aiPrompt, staticText);

    await sendToGroup(text, { text: "Trade Tomorrow", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast evening recap");
  }
}

/** Weekly wrap — Sunday 8pm UTC. Week-in-review stats + hype. */
async function broadcastWeeklyWrap(): Promise<void> {
  try {
    const { db, tradingPositionsTable, playersTable } = await import("@workspace/db");
    const { eq, desc, gte, sql } = await import("drizzle-orm");

    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const [stats] = await db
      .select({
        tradeCount:  sql<number>`COUNT(*)`,
        totalPayout: sql<number>`COALESCE(SUM(win_amount),0)`,
        uniqueTraders: sql<number>`COUNT(DISTINCT player_id)`,
      })
      .from(tradingPositionsTable)
      .where(gte(tradingPositionsTable.createdAt, weekStart));

    const tradeCount    = Number(stats?.tradeCount     ?? 0);
    const totalPayout   = Number(stats?.totalPayout    ?? 0);
    const uniqueTraders = Number(stats?.uniqueTraders  ?? 0);

    if (tradeCount === 0) return;

    const staticText = `Week in review:\n<b>${tradeCount.toLocaleString()}</b> trades executed\n<b>${totalPayout.toFixed(2)}</b> paid out to winners\n<b>${uniqueTraders}</b> active traders\n\nNew week starts now. Your move.`;
    const aiPrompt   = `Weekly StrikerX stats: ${tradeCount} trades, ${totalPayout.toFixed(2)} paid out, ${uniqueTraders} traders active. Write a hype weekly wrap announcement.`;

    const text = await aiText(aiPrompt, staticText);
    await sendToGroup(text, { text: "Start Trading", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast weekly wrap");
  }
}

// ─── AI market commentary (twice daily) ────────────────────────────────────────

async function broadcastAIMarketCommentary(): Promise<void> {
  try {
    const { getAllPrices, get24hChanges } = await import("./binanceFeed.js");
    const prices  = getAllPrices();
    const changes = get24hChanges();

    const topAssets = ["BTC", "ETH", "SOL", "TON", "EURUSD", "XAUUSD"]
      .filter((s) => prices[s])
      .slice(0, 4)
      .map((s) => `${s}: $${prices[s]?.toFixed(2) ?? "?"} (${(changes[s] ?? 0) >= 0 ? "+" : ""}${(changes[s] ?? 0).toFixed(2)}%)`)
      .join(", ");

    if (!topAssets) return;

    const aiPrompt = `StrikerX market update. Current prices: ${topAssets}. Write a brief 2-sentence market commentary for a football-themed crypto trading platform. Professional but stadium-energetic.`;

    const commentary = await generateText(GROUPBOT_PERSONA, aiPrompt, 120);
    if (!commentary) return;

    await sendToGroup(`Market Update:\n${commentary}`, { text: "Trade Now", url: getAppUrl() });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast AI market commentary");
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export async function initGroupBotScheduler(): Promise<void> {
  if (schedulerInitialized) {
    logger.warn("GroupBot scheduler already initialized — skipping duplicate call");
    return;
  }

  const bot = getGroupBot();
  if (!bot) {
    logger.warn("GROUPBOT_TOKEN not set — GroupBot disabled");
    return;
  }

  schedulerInitialized = true;

  // ── Admin commands ──────────────────────────────────────────────────────────

  bot.command("stats", async (ctx) => {
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { sql } = await import("drizzle-orm");
      const [count] = await db.select({ count: sql`COUNT(*)` }).from(playersTable);
      ctx.reply(`Players: ${count?.count ?? 0}`);
    } catch {
      ctx.reply("Error fetching stats");
    }
  });

  bot.command("jackpot", async (ctx) => {
    await broadcastJackpotUpdate();
    ctx.reply("Jackpot announcement sent");
  });

  bot.command("broadcast", async (ctx) => {
    const message = ctx.message.text.replace("/broadcast ", "");
    if (message && message !== "/broadcast") {
      await broadcastMessage(message);
      ctx.reply("Broadcast sent");
    }
  });

  // /trade — live prices + CTA
  bot.command("trade", async (ctx) => {
    try {
      const { getAllPrices } = await import("./binanceFeed.js");
      const prices = getAllPrices();
      const lines  = ["BTC", "ETH", "SOL", "TON"]
        .filter((s) => prices[s])
        .map((s) => `${s}: $${prices[s]?.toFixed(2) ?? "?"}`)
        .join(" | ");
      ctx.reply(`Live prices: ${lines}\n\nOpen StrikerX to trade.`, {
        reply_markup: { inline_keyboard: [[{ text: "Open StrikerX", url: getAppUrl() }]] },
      });
    } catch {
      ctx.reply("Prices temporarily unavailable.");
    }
  });

  // /top5 — today's top 5 traders by total won
  bot.command("top5", async (ctx) => {
    try {
      const { db, tradingPositionsTable, playersTable } = await import("@workspace/db");
      const { eq, desc, gte, sql } = await import("drizzle-orm");
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const rows = await db
        .select({
          username: playersTable.username,
          totalWon: sql<number>`COALESCE(SUM(${tradingPositionsTable.winAmount}),0)`,
        })
        .from(tradingPositionsTable)
        .leftJoin(playersTable, eq(tradingPositionsTable.playerId, playersTable.id))
        .where(gte(tradingPositionsTable.settledAt, todayStart))
        .groupBy(playersTable.username)
        .orderBy(desc(sql`COALESCE(SUM(${tradingPositionsTable.winAmount}),0)`))
        .limit(5);

      if (rows.length === 0) {
        ctx.reply("No trades settled today yet.");
        return;
      }
      const medals = ["1.", "2.", "3.", "4.", "5."];
      const lines  = rows.map((r, i) => `${medals[i]} @${r.username ?? "?"} — ${Number(r.totalWon).toFixed(2)} won`).join("\n");
      ctx.reply(`Today's top traders:\n${lines}`);
    } catch {
      ctx.reply("Error fetching leaderboard.");
    }
  });

  // /promo — show active rate / match event
  bot.command("promo", async (ctx) => {
    try {
      const { getConfig } = await import("./configService.js");
      const rateActive  = await getConfig("rate_event_active").catch(() => "false");
      const matchActive = await getConfig("match_event_active").catch(() => "false");

      const lines: string[] = [];

      if (rateActive === "true") {
        const rate   = await getConfig("rate_event_deposit_rate").catch(() => "100");
        const endsAt = await getConfig("rate_event_ends_at").catch(() => "");
        lines.push(`Rate Event LIVE: ${rate} STRIKER/TON${endsAt ? ` until ${new Date(endsAt).toUTCString()}` : ""}`);
      }

      if (matchActive === "true") {
        const teamA = await getConfig("match_event_team_a").catch(() => "");
        const teamB = await getConfig("match_event_team_b").catch(() => "");
        const mult  = await getConfig("match_event_bonus_multiplier").catch(() => "1.0");
        if (teamA && teamB) lines.push(`Match Event: ${teamA} vs ${teamB} (${mult}x bonus)`);
      }

      ctx.reply(lines.length > 0 ? lines.join("\n") : "No active promotions right now.");
    } catch {
      ctx.reply("Error fetching promotions.");
    }
  });

  // Webhook is registered centrally in app.ts — just clear stale state here
  await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});

  // ── Scheduled jobs ──────────────────────────────────────────────────────────

  // Jackpot update — every 4 hours
  setInterval(() => {
    broadcastJackpotUpdate().catch((err) => logger.error({ err }, "Scheduled jackpot broadcast failed"));
  }, 4 * 60 * 60 * 1000);

  // AI market commentary — twice daily (9am and 3pm UTC)
  const scheduleMarketCommentary = () => {
    const scheduleNextAt = (targetHourUTC: number) => {
      const now  = new Date();
      const next = new Date();
      next.setUTCHours(targetHourUTC, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      setTimeout(() => {
        broadcastAIMarketCommentary().catch(() => {});
        setInterval(() => broadcastAIMarketCommentary().catch(() => {}), 24 * 60 * 60 * 1000);
      }, next.getTime() - now.getTime());
    };
    scheduleNextAt(9);   // 9am UTC
    scheduleNextAt(15);  // 3pm UTC
  };
  scheduleMarketCommentary();

  // Morning message — 9am UTC daily
  const scheduleMorning = () => {
    const now     = new Date();
    const next9am = new Date();
    next9am.setUTCHours(9, 0, 0, 0);
    if (next9am <= now) next9am.setUTCDate(next9am.getUTCDate() + 1);
    setTimeout(() => {
      broadcastMorningMessage().catch(() => {});
      setInterval(() => broadcastMorningMessage().catch(() => {}), 24 * 60 * 60 * 1000);
    }, next9am.getTime() - now.getTime());
  };
  scheduleMorning();

  // Daily leaderboard shoutout — 12pm UTC
  const scheduleDailyLeaderboard = () => {
    const now      = new Date();
    const next12   = new Date();
    next12.setUTCHours(12, 0, 0, 0);
    if (next12 <= now) next12.setUTCDate(next12.getUTCDate() + 1);
    setTimeout(() => {
      broadcastDailyLeaderboard().catch(() => {});
      setInterval(() => broadcastDailyLeaderboard().catch(() => {}), 24 * 60 * 60 * 1000);
    }, next12.getTime() - now.getTime());
  };
  scheduleDailyLeaderboard();

  // Evening recap — 9pm UTC daily
  const scheduleEveningRecap = () => {
    const now    = new Date();
    const next21 = new Date();
    next21.setUTCHours(21, 0, 0, 0);
    if (next21 <= now) next21.setUTCDate(next21.getUTCDate() + 1);
    setTimeout(() => {
      broadcastEveningRecap().catch(() => {});
      setInterval(() => broadcastEveningRecap().catch(() => {}), 24 * 60 * 60 * 1000);
    }, next21.getTime() - now.getTime());
  };
  scheduleEveningRecap();

  // Weekly wrap — Sunday 8pm UTC
  const scheduleWeeklyWrap = () => {
    const now          = new Date();
    const nextSunday   = new Date();
    const daysUntilSun = (7 - nextSunday.getUTCDay()) % 7 || 7;
    nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilSun);
    nextSunday.setUTCHours(20, 0, 0, 0);
    setTimeout(() => {
      broadcastWeeklyWrap().catch(() => {});
      setInterval(() => broadcastWeeklyWrap().catch(() => {}), 7 * 24 * 60 * 60 * 1000);
    }, nextSunday.getTime() - now.getTime());
  };
  scheduleWeeklyWrap();

  logger.info("GroupBot scheduler initialized (morning, noon leaderboard, 9am/3pm market commentary, 9pm recap, Sunday weekly wrap)");
}
