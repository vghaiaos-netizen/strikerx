import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/wsServer";
import { startCrashEngine } from "./lib/crashEngine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// WebSocket server (crash game)
initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");

  // Start crash engine after server is ready
  startCrashEngine().catch((err) => logger.error({ err }, "Crash engine failed to start"));
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
