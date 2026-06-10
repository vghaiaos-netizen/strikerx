import { Api } from "telegram";
import pino from "pino";
import { getClient } from "./client.js";

const logger = pino({ name: "outreach:discovery" });

export interface DiscoveredGroup {
  telegramId: string;
  username: string | null;
  title: string;
  memberCount: number;
}

export async function searchGroups(keyword: string, limit = 20): Promise<DiscoveredGroup[]> {
  const client = getClient();
  if (!client) throw new Error("Telegram client not connected");

  const result = await client.invoke(
    new Api.contacts.Search({ q: keyword, limit })
  );

  const groups: DiscoveredGroup[] = [];

  for (const chat of result.chats) {
    if (chat instanceof Api.Channel) {
      groups.push({
        telegramId: String(chat.id),
        username: chat.username ?? null,
        title: chat.title,
        memberCount: chat.participantsCount ?? 0,
      });
    } else if (chat instanceof Api.Chat) {
      groups.push({
        telegramId: String(chat.id),
        username: null,
        title: chat.title,
        memberCount: chat.participantsCount ?? 0,
      });
    }
  }

  logger.info({ keyword, found: groups.length }, "Group search completed");
  return groups;
}

export async function joinGroupByIdentifier(identifier: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error("Telegram client not connected");

  const entity = await client.getInputEntity(identifier);
  await client.invoke(
    new Api.channels.JoinChannel({ channel: entity as Api.TypeInputChannel })
  );
  logger.info({ identifier }, "Joined group via MTProto");
}

export async function sendMessageToGroup(identifier: string, message: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error("Telegram client not connected");

  await client.sendMessage(identifier, { message });
  logger.info({ identifier }, "Message sent to group");
}
