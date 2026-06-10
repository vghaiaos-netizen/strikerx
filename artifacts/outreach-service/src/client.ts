import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import pino from "pino";

const logger = pino({ name: "outreach:client" });

let _client: TelegramClient | null = null;
let _connected = false;

export async function initClient(): Promise<void> {
  const apiIdRaw = process.env.OUTREACH_API_ID ?? "";
  const apiHash = process.env.OUTREACH_API_HASH ?? "";
  const sessionString = process.env.OUTREACH_SESSION_STRING ?? "";

  const apiId = parseInt(apiIdRaw, 10);

  if (!apiId || !apiHash || !sessionString) {
    logger.warn(
      "OUTREACH_API_ID / OUTREACH_API_HASH / OUTREACH_SESSION_STRING not set — " +
      "outreach service running in disconnected mode (all Telegram actions will return 503)"
    );
    return;
  }

  try {
    const session = new StringSession(sessionString);
    _client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 3,
      useWSS: false,
    });
    await _client.connect();
    _connected = true;
    logger.info("GramJS client connected successfully");
  } catch (err) {
    logger.error({ err }, "GramJS client failed to connect — running disconnected");
    _client = null;
    _connected = false;
  }
}

export function getClient(): TelegramClient | null {
  return _connected ? _client : null;
}

export function isConnected(): boolean {
  return _connected;
}

export async function disconnectClient(): Promise<void> {
  if (_client && _connected) {
    await _client.disconnect();
    _connected = false;
    logger.info("GramJS client disconnected");
  }
}
