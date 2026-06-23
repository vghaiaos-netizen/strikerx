import {
  db,
  tournamentsTable,
  tournamentEntriesTable,
  playersTable,
  transactionsTable,
  vipCashbackTable,
} from "@workspace/db";
import { eq, lt, and, desc, gte, lte, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { broadcastToAll } from "./wsServer";
import { getConfig, setConfig } from "./configService";
import { sendReactivationDM } from "../services/telegramNotify";

const PRIZE_DISTRIBUTION = [0.5, 0.25, 0.15, 0.07, 0.03];

const VIP_CASHBACK_RATES: Record<string, number> = {
  sunday_league: 0,
  championship: 0.02,
  premier_league: 0.03,
  champions_league: 0.05,
  world_cup: 0.08,
};

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getWeekBounds(period: string): { start: Date; end: Date } {
  const [yearStr, weekStr] = period.split("-W");
  const year = parseInt(yearStr ?? "2024", 10);
  const week = parseInt(weekStr ?? "1", 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const start = new Date(startOfWeek1);
  start.setUTCDate(startOfWeek1.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

// ── Tournament auto-end ────────────────────────────────────────────────────────

async function processTournamentEnds() {
  const now = new Date();
  const expired = await db
    .select()
    .from(tournamentsTable)
    .where(and(eq(tournamentsTable.status, "active"), lt(tournamentsTable.endTime, now)));

  for (const tournament of expired) {
    try {
      const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

      const entries = await db
        .select()
        .from(tournamentEntriesTable)
        .where(eq(tournamentEntriesTable.tournamentId, tournament.id))
        .orderBy(desc(tournamentEntriesTable.bestMultiplier));

      await db.update(tournamentsTable).set({ status: "ended" }).where(eq(tournamentsTable.id, tournament.id));

      for (let i = 0; i < Math.min(entries.length, PRIZE_DISTRIBUTION.length); i++) {
        const entry = entries[i]!;
        const prizeTon = tournament.prizePoolTon * (PRIZE_DISTRIBUTION[i] ?? 0);
        const prizeStriker = Math.floor(prizeTon * depositRate);
        if (prizeStriker <= 0) continue;

        const [player] = await db.select().from(playersTable).where(eq(playersTable.id, entry.playerId));
        if (!player) continue;

        await db.update(playersTable)
          .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${prizeStriker}` })
          .where(eq(playersTable.id, entry.playerId));

        await db.insert(transactionsTable).values({
          playerId: entry.playerId,
          type: "bonus",
          amountStriker: prizeStriker,
          status: "completed",
        });
      }

      broadcastToAll("tournament_ended", {
        tournamentId: tournament.id,
        type: tournament.type,
        prizePoolTon: tournament.prizePoolTon,
        winnerId: entries[0]?.playerId ?? null,
        at: Date.now(),
      });

      // GroupBot tournament end announcement (fire-and-forget)
      if (entries[0]) {
        const topEntry    = entries[0];
        const topPrizeTon = tournament.prizePoolTon * (PRIZE_DISTRIBUTION[0] ?? 0);
        const topPrize    = Math.floor(topPrizeTon * depositRate);
        db.select({ username: playersTable.username })
          .from(playersTable)
          .where(eq(playersTable.id, topEntry.playerId))
          .then(([p]) => {
            if (p) {
              import("./groupBot.js").then(({ broadcastTournamentEnd }) => {
                broadcastTournamentEnd(p.username, topPrize).catch(() => {});
              }).catch(() => {});
            }
          }).catch(() => {});
      }

      logger.info({ tournamentId: tournament.id, entrants: entries.length }, "Tournament auto-ended and prizes paid");
    } catch (err) {
      logger.error({ err, tournamentId: tournament.id }, "Failed to auto-end tournament");
    }
  }
}

// ── Tournament live leaderboard broadcast ──────────────────────────────────────

async function broadcastTournamentLeaderboards() {
  const now = new Date();
  const active = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"));

  for (const tournament of active) {
    try {
      const entries = await db
        .select({
          playerId: tournamentEntriesTable.playerId,
          username: playersTable.username,
          vipTier: playersTable.vipTier,
          score: tournamentEntriesTable.bestMultiplier,
        })
        .from(tournamentEntriesTable)
        .leftJoin(playersTable, eq(tournamentEntriesTable.playerId, playersTable.id))
        .where(eq(tournamentEntriesTable.tournamentId, tournament.id))
        .orderBy(desc(tournamentEntriesTable.bestMultiplier))
        .limit(10);

      const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
      const leaderboard = entries.map((e, i) => ({
        rank: i + 1,
        playerId: e.playerId,
        username: e.username ?? "Unknown",
        score: e.score,
        prize: Math.floor(tournament.prizePoolTon * (PRIZE_DISTRIBUTION[i] ?? 0) * depositRate),
      }));

      broadcastToAll("tournament_leaderboard", {
        tournamentId: tournament.id,
        type: tournament.type,
        endsAt: tournament.endTime.toISOString(),
        leaderboard,
        at: Date.now(),
      });
    } catch (err) {
      logger.error({ err, tournamentId: tournament.id }, "Failed to broadcast tournament leaderboard");
    }
  }
}

// ── Weekly cashback auto-payout ────────────────────────────────────────────────

async function processWeeklyCashback() {
  logger.info("Running weekly cashback auto-payout");
  const now = new Date();
  const period = getISOWeek(now);
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

  const eligible = await db
    .select()
    .from(playersTable)
    .where(
      // Skip sunday_league — they earn 0% cashback; filter in DB to avoid loading every player
      sql`${playersTable.vipTier} != 'sunday_league'`
    );

  for (const player of eligible) {
    const rate = VIP_CASHBACK_RATES[player.vipTier] ?? 0;
    if (rate === 0) continue;

    try {
      const [existing] = await db
        .select()
        .from(vipCashbackTable)
        .where(and(eq(vipCashbackTable.playerId, player.id), eq(vipCashbackTable.period, period)));

      if (existing?.paidAt) continue;

      const { start, end } = getWeekBounds(period);

      const txs = await db
        .select()
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.playerId, player.id),
            gte(transactionsTable.createdAt, start),
            lte(transactionsTable.createdAt, end),
          ),
        );

      const totalBet = txs.filter(t => t.type === "bet").reduce((s, t) => s + Math.abs(t.amountStriker), 0);
      const totalWon = txs.filter(t => t.type === "win").reduce((s, t) => s + t.amountStriker, 0);
      const netLossStriker = Math.max(0, totalBet - totalWon);
      const pendingStriker = Math.floor(netLossStriker * rate);
      const lossesTon = netLossStriker / depositRate;

      if (pendingStriker < 1) continue;

      if (existing) {
        await db.update(vipCashbackTable)
          .set({ paidAt: now, cashbackStriker: pendingStriker, lossesTon })
          .where(eq(vipCashbackTable.id, existing.id));
      } else {
        await db.insert(vipCashbackTable).values({
          playerId: player.id,
          period,
          lossesTon,
          cashbackStriker: pendingStriker,
          paidAt: now,
        });
      }

      await db.update(playersTable)
        .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${pendingStriker}` })
        .where(eq(playersTable.id, player.id));

      await db.insert(transactionsTable).values({
        playerId: player.id,
        type: "cashback",
        amountStriker: pendingStriker,
        status: "completed",
      });

      logger.info({ playerId: player.id, username: player.username, pendingStriker }, "Auto cashback paid");
    } catch (err) {
      logger.error({ err, playerId: player.id }, "Failed to auto-pay cashback for player");
    }
  }

  logger.info("Weekly cashback auto-payout complete");
}

// ── Rate event auto-expiry ─────────────────────────────────────────────────────

async function processRateEventExpiry() {
  try {
    const active = await getConfig("rate_event_active").catch(() => "false");
    if (active !== "true") return;
    const endsAt = await getConfig("rate_event_ends_at").catch(() => "");
    if (!endsAt) return;
    if (new Date(endsAt).getTime() < Date.now()) {
      await setConfig("rate_event_active", "false");
      logger.info("Rate event expired — auto-disabled");
    }
  } catch (err) {
    logger.error({ err }, "Rate event expiry check failed");
  }
}

// ── Reactivation DMs ───────────────────────────────────────────────────────────

async function processReactivationDMs() {
  try {
    const now = new Date();
    const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const eightDaysAgo  = new Date(now.getTime() - 8  * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo  = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    // 7-day inactive players (last active between 7 and 8 days ago)
    const sevenDay = await db
      .select({ telegramId: playersTable.telegramId })
      .from(playersTable)
      .where(
        and(
          isNotNull(playersTable.telegramId),
          sql`${playersTable.lastActive} <= ${sevenDaysAgo} AND ${playersTable.lastActive} > ${eightDaysAgo}`,
        ),
      );

    for (const p of sevenDay) {
      if (p.telegramId) sendReactivationDM(p.telegramId, 7);
    }

    // 14-day inactive players (last active between 14 and 15 days ago)
    const fourteenDay = await db
      .select({ telegramId: playersTable.telegramId })
      .from(playersTable)
      .where(
        and(
          isNotNull(playersTable.telegramId),
          sql`${playersTable.lastActive} <= ${fourteenDaysAgo} AND ${playersTable.lastActive} > ${fifteenDaysAgo}`,
        ),
      );

    for (const p of fourteenDay) {
      if (p.telegramId) sendReactivationDM(p.telegramId, 14);
    }

    if (sevenDay.length + fourteenDay.length > 0) {
      logger.info({ sevenDay: sevenDay.length, fourteenDay: fourteenDay.length }, "Reactivation DMs sent");
    }
  } catch (err) {
    logger.error({ err }, "Reactivation DM job failed");
  }
}

// ── Scheduler entrypoint ───────────────────────────────────────────────────────

export function startScheduler() {
  logger.info("Scheduler started");

  // Tournament ends — every 60 seconds
  processTournamentEnds().catch(() => {});
  setInterval(() => { processTournamentEnds().catch(() => {}); }, 60_000);

  // Tournament live leaderboard — every 30 seconds
  setInterval(() => { broadcastTournamentLeaderboards().catch(() => {}); }, 30_000);

  // Rate event auto-expiry — every 60 seconds
  processRateEventExpiry().catch(() => {});
  setInterval(() => { processRateEventExpiry().catch(() => {}); }, 60_000);

  // Reactivation DMs — every 24 hours
  setInterval(() => { processReactivationDMs().catch(() => {}); }, 24 * 60 * 60 * 1000);

  // Weekly cashback auto-payout — every Sunday at 00:05 UTC
  const scheduleWeeklyCashback = () => {
    const now = new Date();
    const nextSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysUntilSunday = (7 - nextSunday.getUTCDay()) % 7 || 7;
    nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(0, 5, 0, 0);
    const msUntil = nextSunday.getTime() - Date.now();
    setTimeout(() => {
      processWeeklyCashback().catch((err) => logger.error({ err }, "Weekly cashback failed"));
      setInterval(() => {
        processWeeklyCashback().catch((err) => logger.error({ err }, "Weekly cashback failed"));
      }, 7 * 24 * 60 * 60 * 1000);
    }, msUntil);
    logger.info({ nextRun: nextSunday.toISOString() }, "Weekly cashback scheduled");
  };
  scheduleWeeklyCashback();
}
