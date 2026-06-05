import { Router, type IRouter } from "express";

const router: IRouter = Router();

// GET /healthz — minimal liveness check (legacy)
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /health — Railway health check + version info
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

export default router;
