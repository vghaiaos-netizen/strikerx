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

export function sendJackpotWin(telegramId: string, amount: number, game: string): void {
  sendMessage(
    telegramId,
    `🏆 <b>JACKPOT!</b> You just won <b>${amount.toLocaleString()} STRIKER</b> on ${game}! Check your balance.`,
  ).catch((err) => logger.warn({ err, telegramId }, "sendJackpotWin failed"));
}

export function sendAchievementUnlocked(telegramId: string, achievementName: string, reward: number): void {
  const rewardText = reward > 0 ? ` +${reward.toLocaleString()} STRIKER credited.` : "";
  sendMessage(
    telegramId,
    `🎖️ <b>Achievement unlocked:</b> ${achievementName}!${rewardText}`,
  ).catch((err) => logger.warn({ err, telegramId }, "sendAchievementUnlocked failed"));
}
