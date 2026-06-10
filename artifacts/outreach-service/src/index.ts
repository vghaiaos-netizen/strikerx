import express from "express";
import type { Request, Response } from "express";
import pino from "pino";
import { initClient, isConnected } from "./client.js";
import { searchGroups, joinGroupByIdentifier, sendMessageToGroup } from "./discovery.js";
import { startScheduler, runSchedulerTick, getSchedulerStatus } from "./scheduler.js";

const logger = pino({ name: "outreach-service" });
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "8001", 10);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, connected: isConnected(), ...getSchedulerStatus() });
});

app.post("/search", async (req: Request, res: Response): Promise<void> => {
  if (!isConnected()) { res.status(503).json({ error: "Telegram client not connected — set OUTREACH_API_ID, OUTREACH_API_HASH, OUTREACH_SESSION_STRING" }); return; }
  const { keyword, limit = 20 } = req.body as { keyword?: string; limit?: number };
  if (!keyword?.trim()) { res.status(400).json({ error: "keyword required" }); return; }
  try {
    const results = await searchGroups(keyword.trim(), limit);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/join", async (req: Request, res: Response): Promise<void> => {
  if (!isConnected()) { res.status(503).json({ error: "Telegram client not connected" }); return; }
  const { identifier } = req.body as { identifier?: string };
  if (!identifier) { res.status(400).json({ error: "identifier required" }); return; }
  try {
    await joinGroupByIdentifier(identifier);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/post", async (req: Request, res: Response): Promise<void> => {
  if (!isConnected()) { res.status(503).json({ error: "Telegram client not connected" }); return; }
  const { identifier, message } = req.body as { identifier?: string; message?: string };
  if (!identifier || !message) { res.status(400).json({ error: "identifier and message required" }); return; }
  try {
    await sendMessageToGroup(identifier, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/tick", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await runSchedulerTick();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function main() {
  await initClient();
  startScheduler();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "Outreach service listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Outreach service startup failed");
  process.exit(1);
});
