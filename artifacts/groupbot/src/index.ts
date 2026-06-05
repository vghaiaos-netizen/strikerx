/**
 * StrikerX GroupBot — Standalone Telegram bot for community groups.
 *
 * Commands:
 *   /jackpot     — current jackpot pool
 *   /leaderboard — top 5 players by lifetime wagered
 *   /play        — Mini App link
 *   /strikerx    — alias for /play
 *   /stats @username — public stats for a player
 *
 * Auto-broadcasts (jackpot wins, big wins, tournaments) are handled by the
 * API server's embedded groupBot.ts utilities, which call bot.telegram.sendMessage
 * directly without polling. This process handles all incoming commands.
 */

import http from "http";
import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { db, playersTable, jackpotTable, gamesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const TOKEN    = process.env.GROUPBOT_TOKEN;
const APP_LINK = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";

if (!TOKEN) {
  console.error("GROUPBOT_TOKEN is required. Exiting.");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ─── /jackpot ────────────────────────────────────────────────────────────────

bot.command("jackpot", async (ctx) => {
  try {
    const [jackpot] = await db.select().from(jackpotTable).limit(1);
    if (!jackpot) {
      await ctx.reply("🏆 Golden Boot jackpot is warming up. Place a bet to fuel it!");
      return;
    }
    const status  = jackpot.status === "ready" ? "🟢 READY TO DROP" : "🔵 Building";
    const lastWon = jackpot.lastTriggeredAt
      ? `Last won ${Math.floor((Date.now() - jackpot.lastTriggeredAt.getTime()) / 3_600_000)}h ago.`
      : "Never been won yet.";
    await ctx.reply(
      `🏆 <b>Golden Boot Jackpot</b>\n\n` +
      `Pool: <b>${jackpot.currentAmountTon.toFixed(2)} TON</b>\n` +
      `Status: ${status}\n` +
      `${lastWon}\n\nEvery bet contributes. Are you feeling lucky? 🎯`,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🎮 Play Now", url: `https://${APP_LINK}` }]] },
      } as Parameters<typeof ctx.reply>[1]
    );
  } catch {
    await ctx.reply("⚠️ Couldn't fetch jackpot data. Try again shortly.");
  }
});

// ─── /leaderboard ────────────────────────────────────────────────────────────

bot.command("leaderboard", async (ctx) => {
  try {
    const top = await db
      .select({
        username:           playersTable.username,
        tonWageredLifetime: playersTable.tonWageredLifetime,
        vipTier:            playersTable.vipTier,
      })
      .from(playersTable)
      .where(eq(playersTable.isBanned, false))
      .orderBy(desc(playersTable.tonWageredLifetime))
      .limit(5);

    if (top.length === 0) {
      await ctx.reply("No players yet — be the first to top the charts!");
      return;
    }

    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
    const lines  = top.map((p, i) =>
      `${medals[i]} <b>@${p.username}</b> — ${p.tonWageredLifetime.toFixed(1)} TON wagered`
    );

    await ctx.reply(
      `🏟️ <b>StrikerX Leaderboard</b>\n<i>All-time by volume</i>\n\n${lines.join("\n")}\n\nThink you can break in?`,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🎮 Play Now", url: `https://${APP_LINK}` }]] },
      } as Parameters<typeof ctx.reply>[1]
    );
  } catch {
    await ctx.reply("⚠️ Couldn't fetch leaderboard. Try again shortly.");
  }
});

// ─── /play & /strikerx ───────────────────────────────────────────────────────

async function playHandler(ctx: Context): Promise<void> {
  await ctx.reply(
    `⚽ <b>StrikerX Casino</b>\n\nThe only football-themed crypto casino.\nBet with STRIKER tokens, win real TON.\n\n🏆 Golden Boot Jackpot drops randomly\n🎮 4 games: The Shot, Penalty, Minefield, Free Kick\n📈 VIP tiers · Daily streaks · Referral rewards`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🎮 Open StrikerX", url: `https://${APP_LINK}` }]],
      },
    } as Parameters<typeof ctx.reply>[1]
  );
}

bot.command("play",     playHandler);
bot.command("strikerx", playHandler);

// ─── /stats @username ────────────────────────────────────────────────────────

bot.command("stats", async (ctx) => {
  const text  = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const raw   = parts[1] ?? "";
  const target = raw.startsWith("@") ? raw.slice(1) : raw;

  if (!target) {
    await ctx.reply("Usage: /stats @username");
    return;
  }

  try {
    const [player] = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.username, target));

    if (!player) {
      await ctx.reply(`No player found with username @${target}. They might not have joined yet!`);
      return;
    }

    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.playerId, player.id));

    const totalGames  = games.length;
    const totalWon    = games.filter(g => g.outcome !== "loss").length;
    const winRate     = totalGames > 0 ? ((totalWon / totalGames) * 100).toFixed(0) : "0";
    const biggestWin  = totalGames > 0 ? Math.max(...games.map(g => g.winAmount)) : 0;
    const biggestMult = totalGames > 0 ? Math.max(...games.map(g => g.resultMultiplier)) : 0;

    const vipEmoji: Record<string, string> = {
      sunday_league: "⚽", championship: "🏟️", premier_league: "🌟",
      champions_league: "🏆", world_cup: "👑",
    };
    const vipLabel: Record<string, string> = {
      sunday_league: "Sunday League", championship: "Championship",
      premier_league: "Premier League", champions_league: "Champions League", world_cup: "World Cup",
    };

    await ctx.reply(
      `${vipEmoji[player.vipTier] ?? "⚽"} <b>@${player.username}</b>\n` +
      `<i>${vipLabel[player.vipTier] ?? player.vipTier}</i>\n\n` +
      `🎮 Games played: <b>${totalGames}</b>\n` +
      `🎯 Win rate: <b>${winRate}%</b>\n` +
      `💰 Biggest win: <b>${biggestWin.toLocaleString()} STRIKER</b>\n` +
      `⚡ Best multiplier: <b>${biggestMult.toFixed(2)}x</b>\n` +
      `👑 CAPTAIN tokens: <b>${player.captainBalance}</b>`,
      { parse_mode: "HTML" } as Parameters<typeof ctx.reply>[1]
    );
  } catch {
    await ctx.reply("⚠️ Couldn't fetch player stats. Try again shortly.");
  }
});

// ─── Launch ───────────────────────────────────────────────────────────────────

const webhookUrl = process.env.GROUPBOT_WEBHOOK_URL ?? process.env.WEBHOOK_URL;
const port       = parseInt(process.env.PORT ?? "3099", 10);

if (webhookUrl) {
  const webhookPath = "/groupbot/webhook";
  await bot.telegram.setWebhook(`${webhookUrl}${webhookPath}`);
  console.log("GroupBot webhook set:", `${webhookUrl}${webhookPath}`);

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === webhookPath) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as object;
      await bot.handleUpdate(body as Parameters<typeof bot.handleUpdate>[0]);
      res.writeHead(200).end("ok");
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
    } else {
      res.writeHead(404).end("not found");
    }
  });
  server.listen(port, () => console.log(`GroupBot webhook server on :${port}`));
} else {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  bot.launch({ dropPendingUpdates: true });
  console.log("GroupBot polling started");

  // Health endpoint for Railway
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
    })
    .listen(port, () => console.log(`GroupBot health server on :${port}`));
}

// Graceful shutdown
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
