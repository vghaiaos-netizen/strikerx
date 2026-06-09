import { logger } from "../lib/logger";

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? process.env.GAMEBOT_TOKEN ?? null;
}

async function sendMessage(telegramId: string, text: string): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

export function sendJackpotWin(telegramId: string, amountTon: number, game: string): void {
  sendMessage(
    telegramId,
    `<b>JACKPOT!</b> You just won the Golden Boot — <b>${amountTon.toFixed(2)} TON</b> on ${game}! Check your balance.`,
  ).catch((err) => logger.warn({ err, telegramId }, "sendJackpotWin failed"));
}

export function sendAchievementUnlocked(telegramId: string, achievementTitle: string, rarity: string): void {
  const rarityLabel: Record<string, string> = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "LEGENDARY",
  };
  sendMessage(
    telegramId,
    `<b>Achievement unlocked:</b> ${achievementTitle}\n<i>${rarityLabel[rarity] ?? rarity}</i> — open StrikerX to see your collection.`,
  ).catch((err) => logger.warn({ err, telegramId }, "sendAchievementUnlocked failed"));
}

export function sendReactivationDM(telegramId: string, daysSince: number): void {
  const lines =
    daysSince >= 14
      ? `It's been a while! Your STRIKER balance is waiting — come back and claim your daily streak bonus.`
      : `You haven't played in ${daysSince} days. Your streak bonus is ready to claim — don't let it expire!`;
  sendMessage(telegramId, lines).catch((err) =>
    logger.warn({ err, telegramId }, "sendReactivationDM failed"),
  );
}
