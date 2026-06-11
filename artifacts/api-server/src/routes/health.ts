import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public diagnostic endpoint — no secrets exposed, only presence flags
router.get("/debug/config", (_req, res) => {
  const tok = process.env.GAMEBOT_TOKEN ?? "";
  const jwtSet = !!(process.env.JWT_SECRET && process.env.JWT_SECRET !== "dev-secret-change-in-prod");
  res.json({
    env: process.env.NODE_ENV,
    gamebotToken: { set: tok.length > 0, length: tok.length },
    groupbotToken: { set: !!(process.env.GROUPBOT_TOKEN?.trim()) },
    jwtSecret: { set: jwtSet },
    adminCreds: { set: !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) },
    cryptobotToken: { set: !!(process.env.CRYPTOBOT_TOKEN?.trim()) },
    railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN ?? null,
  });
});

export default router;
