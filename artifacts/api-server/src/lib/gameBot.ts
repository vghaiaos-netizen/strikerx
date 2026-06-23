import { Telegraf, Markup } from "telegraf";
import { logger } from "./logger";

let gameBot: Telegraf | null = null;
const MINI_APP_LINK = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";

/**
 * Returns the direct HTTPS URL of the Mini App web app.
 * Telegram webApp inline-keyboard buttons require a real HTTPS URL —
 * t.me short-links only work for Menu Buttons and share links, NOT webApp buttons.
 */
function getAppUrl(): string {
  const domain =
    process.env.WEBHOOK_DOMAIN ??
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ??
    process.env.RAILWAY_PUBLIC_DOMAIN ??
    process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return `https://t.me/StrykkerXBot/StrikerX`;
}

export function getGameBot(): Telegraf | null {
  if (!gameBot && process.env.GAMEBOT_TOKEN) {
    gameBot = new Telegraf(process.env.GAMEBOT_TOKEN);
  }
  return gameBot;
}

export async function initGameBot(): Promise<void> {
  const bot = getGameBot();
  if (!bot) {
    logger.warn("GAMEBOT_TOKEN not set — GameBot disabled");
    return;
  }

  // /start command — personalised greeting + DB lookup
  bot.command("start", async (ctx) => {
    const firstName  = ctx.from?.first_name ?? "Player";
    const telegramId = String(ctx.from?.id ?? "");
    const startParam = (ctx.message as { text: string }).text?.split(" ")[1];

    let miniAppUrl = getAppUrl();
    if (startParam) miniAppUrl += `?startapp=${startParam}`;

    let groupInviteLink: string | null = null;
    try {
      const { getConfig } = await import("./configService.js");
      const link = await getConfig("telegram_group_invite_link");
      if (link) groupInviteLink = link;
    } catch { /* non-fatal */ }

    // Look up existing account
    let existingPlayer: { strikerBalance: number; tonBalance: number; vipTier: string } | null = null;
    if (telegramId) {
      try {
        const { db, playersTable } = await import("@workspace/db");
        const { eq }               = await import("drizzle-orm");
        const [row] = await db
          .select({ strikerBalance: playersTable.strikerBalance, tonBalance: playersTable.tonBalance, vipTier: playersTable.vipTier })
          .from(playersTable)
          .where(eq(playersTable.telegramId, telegramId));
        if (row) existingPlayer = row as { strikerBalance: number; tonBalance: number; vipTier: string };
      } catch { /* non-fatal — treat as new */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buttons: any[][] = [
      [Markup.button.webApp(existingPlayer ? "Open StrikerX" : "Create Account & Play", miniAppUrl)],
      [Markup.button.callback("My Balance", "balance")],
    ];
    if (groupInviteLink) {
      buttons.push([Markup.button.url("Join Community", groupInviteLink)]);
    }

    let message: string;
    if (existingPlayer) {
      const striker = parseFloat(String(existingPlayer.strikerBalance)).toLocaleString(undefined, { maximumFractionDigits: 0 });
      const ton     = parseFloat(String(existingPlayer.tonBalance)).toFixed(2);
      const vip     = existingPlayer.vipTier.replace(/_/g, " ").toUpperCase();
      message = `Welcome back, ${firstName}!\n\nYour ID: ${telegramId}\n\nBalance:\nSTRIKER ${striker}  |  TON ${ton}\nVIP: ${vip}\n\nPredictions are live — WC2026 edition.\nTap to continue trading.`;
    } else {
      message = `Welcome to StrikerX, ${firstName}!\n\nYour Telegram ID ${telegramId} is ready.\n\nBinary predictions on crypto, forex & commodities.\n500 STRIKER welcome bonus when you sign up.\n\nRefer friends and earn 10% forever — your link is in the Profile tab.`;
    }

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  });

  // /balance command
  bot.command("balance", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));

      if (!player) {
        await ctx.reply("No account found. Use /start to create your account.");
        return;
      }

      await ctx.reply(
        `Your Balance:\n\nSTRIKER: ${player.strikerBalance.toFixed(2)}\nBOOT: ${player.bootBalance.toFixed(0)}\nCAPTAIN: ${player.captainBalance.toFixed(0)}\n\nVIP Tier: ${player.vipTier.replace(/_/g, " ").toUpperCase()}`,
        Markup.inlineKeyboard([[Markup.button.webApp("Open StrikerX", getAppUrl())]])
      );
    } catch (err) {
      logger.error({ err }, "Balance command error");
      await ctx.reply("Error fetching balance. Try again later.");
    }
  });

  // /deposit command
  bot.command("deposit", async (ctx) => {
    await ctx.reply(
      "Deposit funds directly in the Mini App. We accept TON, USDT, BNB, and SOL.",
      Markup.inlineKeyboard([[Markup.button.webApp("Deposit Now", getAppUrl())]])
    );
  });

  // /withdraw command
  bot.command("withdraw", async (ctx) => {
    await ctx.reply(
      "Withdraw your winnings directly in the Mini App.",
      Markup.inlineKeyboard([[Markup.button.webApp("Withdraw Now", getAppUrl())]])
    );
  });

  // /stats command
  bot.command("stats", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable, gamesTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));

      if (!player) {
        await ctx.reply("No account found. Use /start to create your account.");
        return;
      }

      const games = await db.select().from(gamesTable).where(eq(gamesTable.playerId, player.id));
      const wins = games.filter((g) => g.outcome !== "loss");
      const biggestMultiplier = Math.max(0, ...games.map((g) => g.resultMultiplier));

      await ctx.reply(
        `Your Stats:\n\nTotal Games: ${games.length}\nWin Rate: ${games.length > 0 ? Math.round((wins.length / games.length) * 100) : 0}%\nBiggest Multiplier: ${biggestMultiplier.toFixed(2)}x\nStreak: ${player.streakDays} days`
      );
    } catch (err) {
      logger.error({ err }, "Stats command error");
      await ctx.reply("Error fetching stats.");
    }
  });

  // /streak command
  bot.command("streak", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));

      if (!player) {
        await ctx.reply("No account found. Use /start to create your account.");
        return;
      }

      const milestones = [3, 7, 14, 21, 30];
      const nextMilestone = milestones.find((m) => m > player.streakDays) ?? 30;
      await ctx.reply(
        `Your Streak: ${player.streakDays} days\nNext milestone: Day ${nextMilestone}\n\nClaim your daily reward in the Mini App!`,
        Markup.inlineKeyboard([[Markup.button.webApp("Claim Streak", getAppUrl())]])
      );
    } catch (err) {
      logger.error({ err }, "Streak command error");
      await ctx.reply("Error fetching streak.");
    }
  });

  // /vip command
  bot.command("vip", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));

      if (!player) {
        await ctx.reply("No account found. Use /start to create your account.");
        return;
      }

      const tiers = {
        sunday_league: { name: "Sunday League", next: 50, cashback: "0%" },
        championship: { name: "Championship", next: 200, cashback: "2% weekly" },
        premier_league: { name: "Premier League", next: 500, cashback: "5% weekly" },
        champions_league: { name: "Champions League", next: 1000, cashback: "8% weekly" },
        world_cup: { name: "World Cup", next: null, cashback: "8% weekly + 15% referral" },
      };

      const tier = tiers[player.vipTier as keyof typeof tiers];
      const nextText = tier.next ? `\nNext tier at ${tier.next} TON wagered` : "\nMax VIP tier achieved!";

      await ctx.reply(
        `VIP Status: ${tier.name}\nTotal Wagered: ${player.tonWageredLifetime.toFixed(2)} TON\nCashback: ${tier.cashback}${nextText}`
      );
    } catch (err) {
      await ctx.reply("Error fetching VIP info.");
    }
  });

  // /referral command
  bot.command("referral", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));

      if (!player) {
        await ctx.reply("No account found. Use /start to create your account.");
        return;
      }

      const refLink = `https://t.me/StrykkerXBot?start=${player.referralCode}`;
      await ctx.reply(
        `Your Referral Code: ${player.referralCode}\n\nYour Link:\n${refLink}\n\nEarn 10% of every bet your recruits make. Forever.`
      );
    } catch (err) {
      await ctx.reply("Error fetching referral info.");
    }
  });

  // /leaderboard command
  bot.command("leaderboard", async (ctx) => {
    await ctx.reply(
      "View the full leaderboard in the Mini App.",
      Markup.inlineKeyboard([[Markup.button.webApp("View Leaderboard", getAppUrl())]])
    );
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `StrikerX Commands:\n\n/start — Open the Mini App\n/balance — Check your balance\n/deposit — Deposit funds\n/withdraw — Withdraw winnings\n/stats — Your game statistics\n/streak — Daily streak status\n/vip — VIP tier info\n/referral — Your referral link\n/leaderboard — View rankings\n/help — This message`
    );
  });

  // Callback query for balance button
  bot.action("balance", async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from?.id);
    try {
      const { db, playersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [player] = await db.select().from(playersTable).where(eq(playersTable.telegramId, telegramId));
      if (player) {
        await ctx.reply(`STRIKER: ${player.strikerBalance.toFixed(2)} | BOOT: ${player.bootBalance.toFixed(0)} | CAPTAIN: ${player.captainBalance.toFixed(0)}`);
      }
    } catch (err) {
      logger.error({ err }, "Balance callback error");
    }
  });

  // Register bot commands so they appear in the "/" menu inside Telegram
  await bot.telegram.setMyCommands([
    { command: "start",       description: "Open StrikerX Mini App" },
    { command: "balance",     description: "Check your token balances" },
    { command: "deposit",     description: "Deposit TON / USDT / BNB / SOL" },
    { command: "withdraw",    description: "Withdraw your winnings" },
    { command: "stats",       description: "Your game statistics" },
    { command: "streak",      description: "Daily streak status and rewards" },
    { command: "vip",         description: "Your VIP tier and cashback info" },
    { command: "referral",    description: "Get your referral link" },
    { command: "leaderboard", description: "View the leaderboard" },
    { command: "help",        description: "List all commands" },
  ]).catch((err) => logger.warn({ err }, "setMyCommands failed — non-fatal"));

  // Set the persistent Menu Button — this is the always-visible button in the
  // Telegram chat input bar. Users never need to type anything; one tap opens the app.
  // setChatMenuButton with no chat_id sets it globally for all users of this bot.
  await bot.telegram.setChatMenuButton({
    menuButton: {
      type: "web_app",
      text: "Open StrikerX",
      web_app: { url: getAppUrl() },
    },
  }).catch((err) => logger.warn({ err }, "setChatMenuButton failed — non-fatal"));

  // Webhook registration is handled centrally in app.ts after all bots are initialized.
  // Here we just clear any stale webhook/polling state so Telegram stops queuing updates.
  await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});

  logger.info("GameBot initialized");
}
