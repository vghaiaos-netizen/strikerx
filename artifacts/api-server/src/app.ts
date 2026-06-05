import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { initGameBot } from "./lib/gameBot";
import { initGroupBotScheduler } from "./lib/groupBot";
import { db, jackpotTable } from "@workspace/db";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Initialize bots and jackpot in background
(async () => {
  try {
    // Ensure jackpot row exists
    const existing = await db.select().from(jackpotTable).limit(1);
    if (existing.length === 0) {
      const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
      await db.insert(jackpotTable).values({ currentAmountTon: seedAmount, status: "building" });
      logger.info("Jackpot initialized");
    }
  } catch (err) {
    logger.error({ err }, "Failed to initialize jackpot");
  }

  // Start bots
  Promise.all([
    initGameBot().catch((err) => logger.error({ err }, "GameBot init failed")),
    initGroupBotScheduler().catch((err) => logger.error({ err }, "GroupBot init failed")),
  ]);
})();

export default app;
