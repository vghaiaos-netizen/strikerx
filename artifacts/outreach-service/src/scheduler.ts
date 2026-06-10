import {
  db,
  outreachGroupsTable,
  outreachTemplatesTable,
  outreachPostsTable,
  appConfigTable,
} from "./db.js";
import { eq, and, isNotNull, lt, desc, count, gte } from "drizzle-orm";
import { joinGroupByIdentifier, sendMessageToGroup } from "./discovery.js";
import { isConnected } from "./client.js";
import pino from "pino";

const logger = pino({ name: "outreach:scheduler" });

let lastTickAt: Date | null = null;
let tickCount = 0;
let schedulerRunning = false;

async function getConfig(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key));
  return row?.value ?? "";
}

async function getConfigFloat(key: string, fallback: number): Promise<number> {
  const v = parseFloat(await getConfig(key));
  return isNaN(v) ? fallback : v;
}

async function getConfigInt(key: string, fallback: number): Promise<number> {
  return Math.round(await getConfigFloat(key, fallback));
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

async function processColdPeriods(): Promise<void> {
  const now = new Date();

  await db
    .update(outreachGroupsTable)
    .set({ status: "ready", updatedAt: now })
    .where(
      and(
        eq(outreachGroupsTable.status, "joined"),
        lt(outreachGroupsTable.coldPeriodEndsAt, now)
      )
    );

  await db
    .update(outreachGroupsTable)
    .set({ status: "ready", updatedAt: now })
    .where(
      and(
        eq(outreachGroupsTable.status, "cooldown"),
        lt(outreachGroupsTable.cooldownEndsAt, now)
      )
    );
}

async function processJoinQueue(): Promise<number> {
  const maxPerDay = await getConfigInt("outreach_join_max_per_day", 3);
  const minDelayHours = await getConfigFloat("outreach_join_delay_min_hours", 2);
  const maxDelayHours = await getConfigFloat("outreach_join_delay_max_hours", 8);
  const coldPeriodHours = await getConfigFloat("outreach_cold_period_hours", 24);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ value: joinedToday }] = await db
    .select({ value: count() })
    .from(outreachGroupsTable)
    .where(
      and(
        eq(outreachGroupsTable.status, "joined"),
        gte(outreachGroupsTable.joinedAt, todayStart)
      )
    );

  if (Number(joinedToday) >= maxPerDay) {
    logger.debug({ joinedToday, maxPerDay }, "Daily join limit reached");
    return 0;
  }

  const [lastJoined] = await db
    .select()
    .from(outreachGroupsTable)
    .where(isNotNull(outreachGroupsTable.joinedAt))
    .orderBy(desc(outreachGroupsTable.joinedAt))
    .limit(1);

  if (lastJoined?.joinedAt) {
    const hoursSinceLast = (Date.now() - lastJoined.joinedAt.getTime()) / 3_600_000;
    const requiredDelay = minDelayHours + Math.random() * (maxDelayHours - minDelayHours);
    if (hoursSinceLast < requiredDelay) {
      logger.debug({ hoursSinceLast: hoursSinceLast.toFixed(2), requiredDelay: requiredDelay.toFixed(2) }, "Join delay not elapsed");
      return 0;
    }
  }

  const queued = await db
    .select()
    .from(outreachGroupsTable)
    .where(eq(outreachGroupsTable.status, "queued"))
    .limit(10);

  if (queued.length === 0) return 0;

  const group = queued[Math.floor(Math.random() * queued.length)];
  const now = new Date();
  const coldPeriodEndsAt = new Date(now.getTime() + coldPeriodHours * 3_600_000);

  await db
    .update(outreachGroupsTable)
    .set({ status: "joining", updatedAt: now })
    .where(eq(outreachGroupsTable.id, group.id));

  try {
    const identifier = group.username ?? group.telegramId;
    await joinGroupByIdentifier(identifier);
    await db
      .update(outreachGroupsTable)
      .set({
        status: "joined",
        joinedAt: now,
        coldPeriodEndsAt,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(outreachGroupsTable.id, group.id));
    logger.info({ groupId: group.id, title: group.title }, "Group joined");
    return 1;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(outreachGroupsTable)
      .set({ status: "failed", lastError: error, updatedAt: now })
      .where(eq(outreachGroupsTable.id, group.id));
    logger.error({ err, groupId: group.id }, "Join failed");
    return 0;
  }
}

async function processPostQueue(): Promise<number> {
  const cooldownHours = await getConfigFloat("outreach_post_cooldown_hours", 48);
  const platformName = (await getConfig("outreach_platform_name")) || "StrikerX";
  const promoUrl = (await getConfig("outreach_promo_url")) || process.env.MINI_APP_LINK || "";

  const readyGroups = await db
    .select()
    .from(outreachGroupsTable)
    .where(
      and(
        eq(outreachGroupsTable.status, "ready"),
        eq(outreachGroupsTable.isActive, true)
      )
    )
    .limit(5);

  if (readyGroups.length === 0) return 0;

  const [activeTemplate] = await db
    .select()
    .from(outreachTemplatesTable)
    .where(eq(outreachTemplatesTable.isActive, true))
    .orderBy(desc(outreachTemplatesTable.updatedAt))
    .limit(1);

  if (!activeTemplate) {
    logger.debug("No active template — post queue skipped");
    return 0;
  }

  const vars = { platform: platformName, promo_url: promoUrl };
  const rendered = renderTemplate(activeTemplate.body, vars);
  let posted = 0;

  for (const group of readyGroups) {
    const now = new Date();
    const cooldownEndsAt = new Date(now.getTime() + cooldownHours * 3_600_000);
    const identifier = group.username ?? group.telegramId;

    try {
      await sendMessageToGroup(identifier, rendered);
      await db
        .update(outreachGroupsTable)
        .set({ status: "cooldown", lastPostedAt: now, cooldownEndsAt, lastError: null, updatedAt: now })
        .where(eq(outreachGroupsTable.id, group.id));
      await db.insert(outreachPostsTable).values({
        groupId: group.id,
        templateId: activeTemplate.id,
        renderedBody: rendered,
        status: "sent",
        sentAt: now,
      });
      logger.info({ groupId: group.id, title: group.title }, "Message posted");
      posted++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const isFloodWait = error.toLowerCase().includes("flood");
      await db.insert(outreachPostsTable).values({
        groupId: group.id,
        templateId: activeTemplate.id,
        renderedBody: rendered,
        status: isFloodWait ? "flood_waited" : "failed",
        sentAt: now,
        error,
      });
      await db
        .update(outreachGroupsTable)
        .set({
          status: isFloodWait ? "cooldown" : group.status,
          cooldownEndsAt: isFloodWait ? new Date(now.getTime() + 3_600_000) : group.cooldownEndsAt,
          lastError: error,
          updatedAt: now,
        })
        .where(eq(outreachGroupsTable.id, group.id));
      logger.warn({ err, groupId: group.id, isFloodWait }, "Post failed");
    }
  }

  return posted;
}

export async function runSchedulerTick(): Promise<{ joined: number; posted: number }> {
  if (!isConnected()) return { joined: 0, posted: 0 };

  const enabled = await getConfig("outreach_enabled");
  if (enabled !== "true") return { joined: 0, posted: 0 };

  lastTickAt = new Date();
  tickCount++;
  logger.info({ tick: tickCount }, "Scheduler tick running");

  await processColdPeriods();
  const joined = await processJoinQueue();
  const posted = await processPostQueue();

  logger.info({ joined, posted }, "Scheduler tick completed");
  return { joined, posted };
}

export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    lastTickAt: lastTickAt?.toISOString() ?? null,
    tickCount,
  };
}

export function startScheduler(): void {
  schedulerRunning = true;
  const INTERVAL_MS = 30 * 60 * 1000;
  logger.info({ intervalMinutes: 30 }, "Scheduler started");
  void runSchedulerTick();
  setInterval(() => { void runSchedulerTick(); }, INTERVAL_MS);
}
