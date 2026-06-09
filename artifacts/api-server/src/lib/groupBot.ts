import { Telegraf } from "telegraf";
import { logger } from "./logger";

let groupBot: Telegraf | null = null;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID ?? process.env.GROUP_CHAT_ID;
const MINI_APP_LINK = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";

export function getGroupBot(): Telegraf | null {
  if (!groupBot && process.env.GROUPBOT_TOKEN) {
    groupBot = new Telegraf(process.env.GROUPBOT_TOKEN);
  }
  return groupBot;
}

async function sendToGroup(text: string, inlineButton?: { text: string; url: string }): Promise<void> {
  const bot = getGroupBot();
  if (!bot || !GROUP_CHAT_ID) return;

  try {
    const extra = inlineButton
      ? { reply_markup: { inline_keyboard: [[{ text: inlineButton.text, url: inlineButton.url }]] } }
      : {};
    await bot.telegram.sendMessage(GROUP_CHAT_ID, text, { parse_mode: "HTML", ...extra });
  } catch (err) {
    logger.error({ err }, "Failed to send GroupBot message");
  }
}

export async function broadcastWelcome(username: string, jackpotAmount: number): Promise<void> {
  const text = `Welcome to StrikerX @${username}!\nThe stadium is LIVE. Golden Boot: <b>${jackpotAmount.toFixed(2)} TON</b>\nYour 500 STRIKER welcome bonus is waiting.`;
  await sendToGroup(text, { text: "Claim & Play", url: `https://${MINI_APP_LINK}` });
}

export async function broadcastBigWin(username: string, betStriker: number, winStriker: number, game: string): Promise<void> {
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = (betStriker / depositRate).toFixed(2);
  const winTon = (winStriker / depositRate).toFixed(2);
  const multiplier = (winStriker / betStriker).toFixed(2);
  const text = `GOOOAL!\n@${username} just turned <b>${betTon} TON</b> into <b>${winTon} TON</b>\non <b>${game}</b> at ${multiplier}x!\nCan you beat it?`;
  await sendToGroup(text, { text: "Play Now", url: `https://${MINI_APP_LINK}` });
}

export async function broadcastJackpot(username: string, amountTon: number): Promise<void> {
  const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
  const text = `GOLDEN BOOT CLAIMED!\n@${username} just won <b>${amountTon.toFixed(2)} TON</b>!\nNew Golden Boot starting at ${seedAmount} TON now.`;
  await sendToGroup(text, { text: "Play Now", url: `https://${MINI_APP_LINK}` });
}

export async function broadcastWithdrawal(username: string, amountTon: number): Promise<void> {
  const text = `@${username} just cashed out <b>${amountTon.toFixed(2)} TON</b>.\nReal money. Real fast.`;
  await sendToGroup(text, { text: "Open Casino", url: `https://${MINI_APP_LINK}` });
}

export async function broadcastJackpotUpdate(): Promise<void> {
  try {
    // Import here to avoid circular deps
    const { db, jackpotTable } = await import("@workspace/db");
    const [jackpot] = await db.select().from(jackpotTable).limit(1);
    if (!jackpot) return;

    const lastWon = jackpot.lastTriggeredAt
      ? Math.floor((Date.now() - jackpot.lastTriggeredAt.getTime()) / 3600000)
      : null;

    const text = `Golden Boot Jackpot: <b>${jackpot.currentAmountTon.toFixed(2)} TON</b>\nGrowing with every kick.${lastWon !== null ? ` Last won ${lastWon}h ago.` : ""}`;
    await sendToGroup(text, { text: "Take Your Shot", url: `https://${MINI_APP_LINK}` });
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
    const { desc, eq } = await import("drizzle-orm");
    const [jackpot] = await db.select().from(jackpotTable).limit(1);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayGames = await db.select().from(gamesTable).limit(500);
    const bestGame = yesterdayGames.sort((a, b) => b.resultMultiplier - a.resultMultiplier)[0];
    let topScorerLine = "";
    if (bestGame) {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, bestGame.playerId));
      if (player) {
        topScorerLine = `\nYesterday's top scorer: @${player.username} (${bestGame.resultMultiplier.toFixed(2)}x)`;
      }
    }

    const text = `Match Day at StrikerX!${topScorerLine}\nGolden Boot: <b>${jackpot?.currentAmountTon.toFixed(2) ?? "0"} TON</b>\nYour move.`;
    await sendToGroup(text, { text: "Open Casino", url: `https://${MINI_APP_LINK}` });
  } catch (err) {
    logger.error({ err }, "Failed to broadcast morning message");
  }
}

export async function initGroupBotScheduler(): Promise<void> {
  const bot = getGroupBot();
  if (!bot) {
    logger.warn("GROUPBOT_TOKEN not set — GroupBot disabled");
    return;
  }

  // Set up bot commands for admin
  bot.command("stats", async (ctx) => {
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { sql } = await import("drizzle-orm");
      const [count] = await db.select({ count: sql`COUNT(*)` }).from(playersTable);
      ctx.reply(`Players: ${count?.count ?? 0}`);
    } catch (err) {
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

  // Webhook registration is handled centrally in app.ts after all bots are initialized.
  await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
  logger.info("GroupBot scheduler initialized");

  // Schedule jackpot broadcasts every 30 minutes
  setInterval(() => {
    broadcastJackpotUpdate().catch((err) => logger.error({ err }, "Scheduled jackpot broadcast failed"));
  }, 30 * 60 * 1000);

  // Schedule morning message at 9am UTC
  const scheduleDaily = () => {
    const now = new Date();
    const next9am = new Date();
    next9am.setUTCHours(9, 0, 0, 0);
    if (next9am <= now) next9am.setDate(next9am.getDate() + 1);
    const msUntil = next9am.getTime() - now.getTime();
    setTimeout(() => {
      broadcastMorningMessage().catch(() => {});
      setInterval(() => broadcastMorningMessage().catch(() => {}), 24 * 60 * 60 * 1000);
    }, msUntil);
  };
  scheduleDaily();

  logger.info("GroupBot scheduler initialized");
}
