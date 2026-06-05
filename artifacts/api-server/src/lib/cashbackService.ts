import { db, playersTable, transactionsTable, vipCashbackTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const VIP_CASHBACK_RATES: Record<string, number> = {
  sunday_league: 0,
  championship: 0.02,
  premier_league: 0.05,
  champions_league: 0.08,
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
  const [year, week] = period.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year!, 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const start = new Date(startOfWeek1);
  start.setUTCDate(startOfWeek1.getUTCDate() + (week! - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

export async function getCashbackStatus(playerId: number) {
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) throw new Error("Player not found");

  const period = getISOWeek(new Date());
  const rate = VIP_CASHBACK_RATES[player.vipTier] ?? 0;
  const { start, end } = getWeekBounds(period);

  const [existing] = await db
    .select()
    .from(vipCashbackTable)
    .where(and(eq(vipCashbackTable.playerId, playerId), eq(vipCashbackTable.period, period)));

  if (existing?.paidAt) {
    return {
      period,
      vipTier: player.vipTier,
      cashbackRate: rate,
      estimatedLossesStriker: existing.lossesTon * parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100"),
      pendingStriker: 0,
      claimedThisPeriod: true,
      canClaim: false,
      nextClaimAt: null as string | null,
    };
  }

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.playerId, playerId),
        gte(transactionsTable.createdAt, start),
        lte(transactionsTable.createdAt, end),
      ),
    );

  const totalBet = txs.filter(t => t.type === "bet").reduce((s, t) => s + Math.abs(t.amountStriker), 0);
  const totalWon = txs.filter(t => t.type === "win").reduce((s, t) => s + t.amountStriker, 0);
  const netLossStriker = Math.max(0, totalBet - totalWon);
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const lossesTon = netLossStriker / depositRate;
  const pendingStriker = Math.floor(netLossStriker * rate);

  return {
    period,
    vipTier: player.vipTier,
    cashbackRate: rate,
    estimatedLossesStriker: netLossStriker,
    pendingStriker,
    claimedThisPeriod: false,
    canClaim: rate > 0 && pendingStriker >= 1,
    nextClaimAt: end.toISOString(),
    lossesTon,
  };
}

export async function claimCashback(playerId: number) {
  const status = await getCashbackStatus(playerId);

  if (!status.canClaim) {
    throw new Error(
      status.claimedThisPeriod
        ? "Already claimed this week"
        : status.cashbackRate === 0
          ? "Cashback not available at your VIP tier"
          : "No cashback available yet",
    );
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) throw new Error("Player not found");

  const { period, pendingStriker } = status;
  const lossesTon = (status as { lossesTon?: number }).lossesTon ?? 0;

  const [existing] = await db
    .select()
    .from(vipCashbackTable)
    .where(and(eq(vipCashbackTable.playerId, playerId), eq(vipCashbackTable.period, period)));

  if (existing) {
    await db
      .update(vipCashbackTable)
      .set({ paidAt: new Date(), cashbackStriker: pendingStriker, lossesTon })
      .where(eq(vipCashbackTable.id, existing.id));
  } else {
    await db.insert(vipCashbackTable).values({
      playerId,
      period,
      lossesTon,
      cashbackStriker: pendingStriker,
      paidAt: new Date(),
    });
  }

  const newBalance = player.strikerBalance + pendingStriker;
  await db.update(playersTable).set({ strikerBalance: newBalance }).where(eq(playersTable.id, playerId));

  await db.insert(transactionsTable).values({
    playerId,
    type: "cashback",
    amountStriker: pendingStriker,
    status: "completed",
  });

  return { claimedStriker: pendingStriker, newBalance, period };
}
