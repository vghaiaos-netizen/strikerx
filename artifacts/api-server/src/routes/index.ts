import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import playersRouter from "./players";
import gamesRouter from "./games";
import paymentsRouter from "./payments";
import jackpotRouter from "./jackpot";
import leaderboardRouter from "./leaderboard";
import adminRouter from "./admin";
import botsRouter from "./bots";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(playersRouter);
router.use(gamesRouter);
router.use(paymentsRouter);
router.use(jackpotRouter);
router.use(leaderboardRouter);
router.use(adminRouter);
router.use(botsRouter);

export default router;
