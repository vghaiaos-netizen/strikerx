import { useAuth } from "@/lib/auth";
import { useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  TrendingUp, TrendingDown, Target, Bomb, Zap, Trophy, ChevronRight,
  Tv2, Globe, CheckCircle2, Circle, Flame, Gamepad2, BarChart3,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/lib/ws-notifications";
import { useTranslation } from "react-i18next";

interface MatchEvent  { active: boolean; teamA: string; teamB: string; bonusMultiplier: number; endsAt: string | null; label: string; }
interface WcTheme    { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }
interface RecentWin  { id: number; username: string; game: string; bet: number; win: number; mult: number; playedAt: string | null; }
interface PricesResp { prices: Record<string, number>; changes24h: Record<string, number> }

const QUICK_ASSETS = [
  { symbol: "BTC",    label: "Bitcoin",  color: "#f7931a", fmt: (p: number) => `$${Math.round(p).toLocaleString()}` },
  { symbol: "ETH",    label: "Ethereum", color: "#627eea", fmt: (p: number) => `$${p.toFixed(2)}` },
  { symbol: "EURUSD", label: "EUR/USD",  color: "#0ea5e9", fmt: (p: number) => p.toFixed(5) },
];
interface DailyMission    { key: string; title: string; description: string; target: number; progress: number; completed: boolean; }
interface DailyMissionsRow { id: number; missions: DailyMission[]; allCompleted: boolean; bonusClaimed: boolean; bonusStriker: number; date: string; }

const GAMES = [
  { href: "/games/shot",      name: "The Shot",  sub: "Crash game",   icon: TrendingUp, color: "#00ff88", bg: "from-[#00ff88]/10" },
  { href: "/games/penalty",   name: "Penalty",   sub: "1.92× payout", icon: Target,     color: "#3b82f6", bg: "from-[#3b82f6]/10" },
  { href: "/games/minefield", name: "Minefield", sub: "Compound odds", icon: Bomb,       color: "#ef4444", bg: "from-[#ef4444]/10" },
  { href: "/games/freekick",  name: "Free Kick", sub: "Plinko-style",  icon: Zap,        color: "#f59e0b", bg: "from-[#f59e0b]/10" },
];

const SEED_WINS: RecentWin[] = [
  { id: 1, username: "striker_99", game: "shot",      bet: 500,  win: 2840, mult: 5.23, playedAt: null },
  { id: 2, username: "goalie_k",   game: "penalty",   bet: 200,  win: 384,  mult: 1.92, playedAt: null },
  { id: 3, username: "mfield_pro", game: "minefield", bet: 300,  win: 4500, mult: 9.10, playedAt: null },
  { id: 4, username: "captain_x",  game: "shot",      bet: 1000, win: 6800, mult: 6.80, playedAt: null },
];

const GAME_LABELS: Record<string, string> = {
  penalty: "Penalty", shot: "The Shot", crash: "The Shot",
  minefield: "Minefield", freekick: "Free Kick", free_kick: "Free Kick",
};

export function Home() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { notifications } = useNotifications();
  const [wcCountdownSecs, setWcCountdownSecs] = useState(0);
  const wcTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: jackpot }    = useGetJackpot({ query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 30_000 } });
  const { data: matchEvent } = useQuery<MatchEvent>({
    queryKey: ["match-event"],
    queryFn: async () => { const r = await fetch("/api/public/match-event"); return r.json() as Promise<MatchEvent>; },
    refetchInterval: 60_000,
  });
  const { data: wcTheme } = useQuery<WcTheme>({
    queryKey: ["wc-theme"],
    queryFn: async () => { const r = await fetch("/api/public/wc-theme"); return r.json() as Promise<WcTheme>; },
    refetchInterval: 300_000,
    staleTime: 60_000,
  });
  const { data: dbWins } = useQuery<RecentWin[]>({
    queryKey: ["recent-wins"],
    queryFn: async () => { const r = await fetch("/api/public/recent-wins"); return r.json() as Promise<RecentWin[]>; },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const [, navigate] = useLocation();

  const { data: pricesData } = useQuery<PricesResp>({
    queryKey: ["home-prices"],
    queryFn:  async () => { const r = await fetch("/api/trading/prices"); return r.json() as Promise<PricesResp>; },
    refetchInterval: 5_000,
    staleTime:       3_000,
  });

  const { data: missions } = useQuery<DailyMissionsRow>({
    queryKey: ["daily-missions"],
    queryFn: async () => {
      const r = await fetch("/api/players/me/missions", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Not authed");
      return r.json() as Promise<DailyMissionsRow>;
    },
    enabled: !!token,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (wcTheme?.countdown && wcTheme.kickOff) {
      const end = new Date(wcTheme.kickOff).getTime();
      setWcCountdownSecs(Math.max(0, Math.floor((end - Date.now()) / 1000)));
      if (wcTimerRef.current) clearInterval(wcTimerRef.current);
      wcTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setWcCountdownSecs(remaining);
        if (remaining === 0 && wcTimerRef.current) clearInterval(wcTimerRef.current);
      }, 1000);
    }
    return () => { if (wcTimerRef.current) clearInterval(wcTimerRef.current); };
  }, [wcTheme]);

  const wsWins: RecentWin[] = notifications
    .filter((n) => n.type === "big_win")
    .slice(0, 5)
    .map((n, i) => ({
      id: -i - 1, username: n.username,
      game: n.detail.split(" on ")[1] ?? "shot",
      bet: 0,
      win: parseInt(n.detail.replace(/[^\d]/g, ""), 10) || 0,
      mult: parseFloat(n.message.split(" hit ")[1] ?? "1") || 1,
      playedAt: new Date(n.at).toISOString(),
    }));

  const allWins = [...wsWins, ...(dbWins ?? [])].slice(0, 8);
  const wins    = allWins.length >= 3 ? allWins : SEED_WINS;
  const pct     = jackpot?.percentFull ?? 0;

  const wct = (() => {
    const s = wcCountdownSecs;
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  })();

  const timeAgo = (iso: string | null) => {
    if (!iso) return t("home.justNow");
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("home.justNow");
    if (m < 60) return t("home.mAgo", { m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("home.hAgo", { h });
    return t("home.dAgo", { d: Math.floor(h / 24) });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Gamepad2 size={18} className="text-primary" />
          <h1 className="font-black text-lg tracking-tight">Games</h1>
        </div>

        {/* ── World Cup 2026 Banner ── */}
        <AnimatePresence>
          {wcTheme?.active && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="relative overflow-hidden rounded-2xl border border-[#e63946]/30 bg-gradient-to-br from-[#1d3557]/70 via-[#0d1117] to-[#1a0a0a]/60 p-4"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#e6394620,transparent_55%)]" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-3.5 h-3.5 text-[#e63946]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#e63946]">{t("home.wc2026")}</span>
                  {wcTheme.live
                    ? <span className="ml-auto text-[10px] font-mono bg-[#e63946]/20 text-[#e63946] border border-[#e63946]/30 rounded-full px-2 py-0.5 animate-pulse">{t("home.live")}</span>
                    : <span className="ml-auto text-[10px] font-mono bg-white/5 text-white/40 border border-white/10 rounded-full px-2 py-0.5">{t("home.comingSoon")}</span>}
                </div>
                {wcTheme.live ? (
                  <div className="text-center py-1">
                    <div className="font-black text-xl text-white">{t("home.wcTournamentLive")}</div>
                    <div className="text-[11px] font-mono text-white/40 mt-1">{t("home.wcTournamentDesc")}</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 py-1">
                    {[{ v: wct.d, k: "home.days" }, { v: wct.h, k: "home.hrs" }, { v: wct.m, k: "home.min" }, { v: wct.s, k: "home.sec" }].map(({ v, k }) => (
                      <div key={k} className="flex flex-col items-center">
                        <div className="bg-white/8 border border-white/10 rounded-lg w-12 h-10 flex items-center justify-center">
                          <span className="font-black text-lg text-white">{String(v).padStart(2, "0")}</span>
                        </div>
                        <span className="text-[8px] font-mono text-white/30 mt-1 tracking-widest">{t(k)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Match Event Banner ── */}
        <AnimatePresence>
          {matchEvent?.active && (
            <motion.div
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="relative overflow-hidden rounded-2xl border border-[#3b82f6]/30 bg-gradient-to-br from-[#1e3a5f]/60 via-[#0d1117] to-[#1a2a0f]/40 p-4"
            >
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-3">
                  <Tv2 className="w-3.5 h-3.5 text-[#3b82f6]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#3b82f6]">{matchEvent.label}</span>
                  <span className="ml-auto text-[10px] font-mono bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30 rounded-full px-2 py-0.5 animate-pulse">{t("home.live")}</span>
                </div>
                <div className="flex items-center justify-center gap-6 py-2">
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamA}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">{t("home.homeTeam")}</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] font-mono text-white/30">{t("home.vs")}</div>
                    <div className="bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-lg px-2 py-1">
                      <span className="font-black text-sm text-[#00ff88]">{matchEvent.bonusMultiplier}×</span>
                      <span className="text-[9px] font-mono text-[#00ff88]/60 ml-1">{t("home.bonus")}</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamB}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">{t("home.awayTeam")}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Quick Trade Panel ── */}
        <div className="bg-white/3 border border-white/6 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-[#00ff88]" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">Quick Trade</span>
            <span className="ml-auto text-[9px] font-mono text-white/20">1m · 82% payout</span>
          </div>
          <div className="flex flex-col divide-y divide-white/4 pb-1">
            {QUICK_ASSETS.map(({ symbol, label, color, fmt }) => {
              const price   = pricesData?.prices[symbol];
              const change  = pricesData?.changes24h[symbol];
              return (
                <div key={symbol} className="flex items-center gap-3 px-4 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black" style={{ color }}>{symbol}</span>
                      <span className="text-[9px] text-white/25 font-mono">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[11px] font-bold text-white/80 tabular-nums">
                        {price ? fmt(price) : "—"}
                      </span>
                      {change !== undefined && (
                        <span className={`text-[9px] font-mono font-bold tabular-nums ${change >= 0 ? "text-[#00ff88]" : "text-red-400"}`}>
                          {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        sessionStorage.setItem("strikerx_quick_symbol", symbol);
                        sessionStorage.setItem("strikerx_quick_dir", "UP");
                        navigate("/");
                      }}
                      className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg bg-green-600/20 border border-green-500/30 text-[10px] font-black text-green-400 hover:bg-green-600/30 transition-colors"
                    >
                      <TrendingUp className="w-2.5 h-2.5" />
                      UP
                    </button>
                    <button
                      onClick={() => {
                        sessionStorage.setItem("strikerx_quick_symbol", symbol);
                        sessionStorage.setItem("strikerx_quick_dir", "DOWN");
                        navigate("/");
                      }}
                      className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg bg-red-600/20 border border-red-500/30 text-[10px] font-black text-red-400 hover:bg-red-600/30 transition-colors"
                    >
                      <TrendingDown className="w-2.5 h-2.5" />
                      DOWN
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Game Cards ── */}
        <div className="grid grid-cols-2 gap-3">
          {GAMES.map(({ href, name, sub, icon: Icon, color, bg }) => (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.95 }}
                className={`relative rounded-xl border border-white/8 bg-gradient-to-br ${bg} to-transparent p-4 flex flex-col gap-3 overflow-hidden cursor-pointer`}
                whileHover={{ boxShadow: `0 0 16px ${color}22`, borderColor: `${color}40` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/30 border border-white/5">
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <div className="font-bold text-sm text-white tracking-tight">{name}</div>
                  <div className="text-[10px] font-mono text-white/30 mt-0.5">{sub}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/20 absolute bottom-3.5 right-3.5" />
              </motion.div>
            </Link>
          ))}
        </div>

        {/* ── Jackpot Banner ── */}
        <div className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/20 bg-gradient-to-br from-[#f59e0b]/10 via-[#0d1117] to-[#0d1117] p-4">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#f59e0b]/5 blur-2xl" />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#f59e0b]">{t("home.goldenBoot")}</span>
              </div>
              <motion.div className="font-black text-3xl text-white" animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                {Number(jackpot?.currentAmountTon ?? 0).toFixed(2)}
                <span className="text-[#f59e0b] ml-1 text-2xl">TON</span>
              </motion.div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {jackpot?.status === "ready" ? t("home.readyToTrigger") : t("home.buildingTo", { target: jackpot?.minimumTrigger ?? 50 })}
              </div>
            </div>
            <div className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase ${jackpot?.status === "ready" ? "bg-[#f59e0b]/20 text-[#f59e0b]" : "bg-white/5 text-white/30"}`}>
              {jackpot?.status ?? "building"}
            </div>
          </div>
          <div className="mt-3 bg-black/30 rounded-full h-1.5 overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-[#f59e0b] to-[#00ff88] rounded-full"
              style={{ width: `${Math.min(pct, 100)}%` }}
              animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>

        {/* ── Daily Missions ── */}
        {missions && (
          <div className="bg-white/3 border border-white/6 rounded-xl overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t("home.dailyMissions")}</span>
              {missions.allCompleted ? (
                <span className="ml-auto text-[9px] font-mono bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25 rounded-full px-2 py-0.5">
                  {missions.bonusClaimed ? t("home.claimed") : `+${missions.bonusStriker} STRIKER`}
                </span>
              ) : (
                <span className="ml-auto text-[9px] font-mono text-white/25">
                  {missions.missions.filter((m: DailyMission) => m.completed).length}/3
                </span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-white/4 px-4 pb-3">
              {(missions.missions as DailyMission[]).map((m) => (
                <div key={m.key} className="flex items-center gap-3 py-2">
                  {m.completed
                    ? <CheckCircle2 className="w-4 h-4 text-[#00ff88] flex-shrink-0" />
                    : <Circle      className="w-4 h-4 text-white/15 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className={`font-mono text-[11px] font-semibold ${m.completed ? "text-white/40 line-through" : "text-white"}`}>{m.title}</span>
                    <div className="text-[9px] font-mono text-white/25 mt-0.5">{m.description}</div>
                  </div>
                  {!m.completed && m.target > 1 && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[10px] font-mono text-white/35">{m.progress}/{m.target}</div>
                      <div className="w-14 h-1 bg-white/8 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-[#00ff88] rounded-full" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Winners ── */}
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mb-2.5">{t("home.recentWinners")}</div>
          <div className="flex flex-col gap-1.5">
            {wins.map((w) => (
              <div key={w.id} className="flex items-center gap-2.5 bg-white/3 border border-white/5 rounded-xl px-3 py-2">
                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-3 h-3 text-white/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] font-bold text-white/70 truncate">{w.username}</div>
                  <div className="text-[9px] font-mono text-white/25">{GAME_LABELS[w.game] ?? w.game}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-[11px] font-bold text-[#00ff88]">+{w.win.toLocaleString()}</div>
                  <div className="text-[9px] font-mono text-white/25">{w.mult.toFixed(2)}× · {timeAgo(w.playedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
