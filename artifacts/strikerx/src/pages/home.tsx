import { useAuth } from "@/lib/auth";
import { useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  TrendingUp, TrendingDown, Target, Bomb, Zap, Trophy, ChevronRight,
  Tv2, Globe, Flame, BarChart3, CheckCircle2, Circle, Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/lib/ws-notifications";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchEvent  { active: boolean; teamA: string; teamB: string; bonusMultiplier: number; endsAt: string | null; label: string; }
interface WcTheme    { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }
interface RecentWin  { id: number; username: string; game: string; bet: number; win: number; mult: number; playedAt: string | null; }
interface PricesResp { prices: Record<string, number>; changes24h: Record<string, number>; }
interface DailyMission    { key: string; title: string; description: string; target: number; progress: number; completed: boolean; }
interface DailyMissionsRow { id: number; missions: DailyMission[]; allCompleted: boolean; bonusClaimed: boolean; bonusStriker: number; date: string; }

// ─── Static data ──────────────────────────────────────────────────────────────
const QUICK_ASSETS = [
  { symbol: "BTC",    label: "Bitcoin",  color: "#f7931a", fmt: (p: number) => `$${Math.round(p).toLocaleString()}` },
  { symbol: "ETH",    label: "Ethereum", color: "#627eea", fmt: (p: number) => `$${p.toFixed(2)}` },
  { symbol: "EURUSD", label: "EUR/USD",  color: "#0ea5e9", fmt: (p: number) => p.toFixed(5) },
];

const GAMES = [
  { href: "/games/shot",      name: "The Shot",  sub: "Crash game",    icon: TrendingUp, color: "#00ff88", bg: "from-[#00ff88]/10" },
  { href: "/games/penalty",   name: "Penalty",   sub: "1.92× payout",  icon: Target,     color: "#3b82f6", bg: "from-[#3b82f6]/10" },
  { href: "/games/minefield", name: "Minefield", sub: "Compound odds", icon: Bomb,       color: "#ef4444", bg: "from-[#ef4444]/10" },
  { href: "/games/freekick",  name: "Free Kick", sub: "Plinko-style",  icon: Zap,        color: "#f59e0b", bg: "from-[#f59e0b]/10" },
];

const GAME_LABELS: Record<string, string> = {
  penalty: "Penalty", shot: "The Shot", crash: "The Shot",
  minefield: "Minefield", freekick: "Free Kick", free_kick: "Free Kick",
};

const SEED_WINS: RecentWin[] = [
  { id: 1, username: "striker_99", game: "shot",      bet: 500,  win: 2840, mult: 5.23, playedAt: null },
  { id: 2, username: "goalie_k",   game: "penalty",   bet: 200,  win: 384,  mult: 1.92, playedAt: null },
  { id: 3, username: "mfield_pro", game: "minefield", bet: 300,  win: 4500, mult: 9.10, playedAt: null },
  { id: 4, username: "captain_x",  game: "shot",      bet: 1000, win: 6800, mult: 6.80, playedAt: null },
];

// ─── Home ─────────────────────────────────────────────────────────────────────
export function Home() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { notifications } = useNotifications();
  const [wcCountdownSecs, setWcCountdownSecs] = useState(0);
  const wcTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: jackpot }    = useGetJackpot({ query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 30_000 } });
  const { data: matchEvent } = useQuery<MatchEvent>({
    queryKey: ["match-event"],
    queryFn: async () => (await fetch("/api/public/match-event")).json() as Promise<MatchEvent>,
    refetchInterval: 60_000,
  });
  const { data: wcTheme } = useQuery<WcTheme>({
    queryKey: ["wc-theme"],
    queryFn: async () => (await fetch("/api/public/wc-theme")).json() as Promise<WcTheme>,
    refetchInterval: 300_000, staleTime: 60_000,
  });
  const { data: dbWins } = useQuery<RecentWin[]>({
    queryKey: ["recent-wins"],
    queryFn: async () => (await fetch("/api/public/recent-wins")).json() as Promise<RecentWin[]>,
    refetchInterval: 30_000, staleTime: 20_000,
  });
  const { data: pricesData } = useQuery<PricesResp>({
    queryKey: ["home-prices"],
    queryFn: async () => (await fetch("/api/trading/prices")).json() as Promise<PricesResp>,
    refetchInterval: 5_000, staleTime: 3_000,
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
    enabled: !!token, refetchInterval: 120_000, staleTime: 60_000,
  });

  useEffect(() => {
    if (wcTheme?.countdown && wcTheme.kickOff) {
      const end = new Date(wcTheme.kickOff).getTime();
      setWcCountdownSecs(Math.max(0, Math.floor((end - Date.now()) / 1000)));
      if (wcTimerRef.current) clearInterval(wcTimerRef.current);
      wcTimerRef.current = setInterval(() => {
        const rem = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setWcCountdownSecs(rem);
        if (rem === 0 && wcTimerRef.current) clearInterval(wcTimerRef.current);
      }, 1000);
    }
    return () => { if (wcTimerRef.current) clearInterval(wcTimerRef.current); };
  }, [wcTheme]);

  const wsWins: RecentWin[] = notifications
    .filter(n => n.type === "big_win")
    .slice(0, 5)
    .map((n, i) => ({
      id: -i - 1, username: n.username,
      game: n.detail.split(" on ")[1] ?? "shot",
      bet: 0,
      win: parseInt(n.detail.replace(/[^\d]/g, ""), 10) || 0,
      mult: parseFloat(n.message.split(" hit ")[1] ?? "1") || 1,
      playedAt: new Date(n.at).toISOString(),
    }));

  const allWins = [...wsWins, ...(dbWins ?? [])].slice(0, 6);
  const wins    = allWins.length >= 3 ? allWins : SEED_WINS;
  const pct     = jackpot?.percentFull ?? 0;

  const wct = (() => {
    const s = wcCountdownSecs;
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  })();

  const timeAgo = (iso: string | null) => {
    if (!iso) return "just now";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const missionsCompleted = missions?.missions.filter(m => m.completed).length ?? 0;
  const missionsDone = missions?.allCompleted;

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── LIVE BAR (WC countdown or Match event — only one at a time) ── */}
        <AnimatePresence>
          {(wcTheme?.active || matchEvent?.active) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative overflow-hidden rounded-2xl border p-4"
              style={matchEvent?.active
                ? { borderColor: "#3b82f640", background: "linear-gradient(135deg, #1e3a5f50, #0d1117 60%)" }
                : { borderColor: "#e6394640", background: "linear-gradient(135deg, #1d355750, #0d1117 60%)" }
              }
            >
              {matchEvent?.active ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Tv2 className="w-3.5 h-3.5 text-[#3b82f6]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#3b82f6]">{matchEvent.label}</span>
                    <span className="ml-auto text-[10px] font-mono bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30 rounded-full px-2 py-0.5 animate-pulse">
                      LIVE
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-5 py-1">
                    <div className="text-center">
                      <div className="font-black text-lg text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{matchEvent.teamA}</div>
                      <div className="text-[8px] font-mono text-white/30 mt-0.5">HOME</div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[9px] font-mono text-white/25">vs</div>
                      <div className="bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-lg px-2.5 py-1">
                        <span className="font-black text-sm text-[#00ff88]">{matchEvent.bonusMultiplier}×</span>
                        <span className="text-[8px] font-mono text-[#00ff88]/50 ml-1">bonus</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-black text-lg text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{matchEvent.teamB}</div>
                      <div className="text-[8px] font-mono text-white/30 mt-0.5">AWAY</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-3.5 h-3.5 text-[#e63946]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#e63946]">World Cup 2026</span>
                    <span className="ml-auto text-[10px] font-mono bg-white/5 text-white/40 border border-white/10 rounded-full px-2 py-0.5">
                      {wcTheme?.live ? "LIVE" : "COMING SOON"}
                    </span>
                  </div>
                  {!wcTheme?.live && wcCountdownSecs > 0 && (
                    <div className="flex items-center justify-center gap-3 py-1">
                      {[{ v: wct.d, k: "D" }, { v: wct.h, k: "H" }, { v: wct.m, k: "M" }, { v: wct.s, k: "S" }].map(({ v, k }) => (
                        <div key={k} className="flex flex-col items-center gap-1">
                          <div className="bg-white/8 border border-white/10 rounded-xl w-11 h-10 flex items-center justify-center">
                            <span className="font-black text-base text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                              {String(v).padStart(2, "0")}
                            </span>
                          </div>
                          <span className="text-[7px] font-mono text-white/25 tracking-widest">{k}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {wcTheme?.live && (
                    <div className="text-center font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      Tournament is Live!
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── QUICK PRICES ── */}
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ASSETS.map(({ symbol, label, color, fmt }) => {
            const price   = pricesData?.prices?.[symbol] ?? 0;
            const change  = pricesData?.changes24h?.[symbol] ?? 0;
            const isUp    = change >= 0;
            return (
              <Link key={symbol} href={`/markets?asset=${symbol}`}>
                <motion.div
                  whileTap={{ scale: 0.96 }}
                  className="bg-white/3 border border-white/8 rounded-xl p-3 cursor-pointer hover:border-white/15 transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
                    <div className={`flex items-center gap-0.5 ${isUp ? "text-[#00ff88]" : "text-red-400"}`}>
                      {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      <span className="text-[8px] font-mono font-bold">{Math.abs(change).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="font-black text-xs text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {price ? fmt(price) : "—"}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>

        {/* ── TRADE CTA ── */}
        <Link href="/markets">
          <motion.div
            whileTap={{ scale: 0.97 }}
            className="relative overflow-hidden rounded-2xl border border-[#00ff88]/25 bg-gradient-to-br from-[#00ff88]/10 via-[#0d1117] to-[#0d1117] p-4 cursor-pointer"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#00ff8812,transparent_55%)]" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-3.5 h-3.5 text-[#00ff88]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#00ff88]/70">Binary Trading</span>
                </div>
                <div className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Open Terminal</div>
                <div className="text-[10px] font-mono text-white/30 mt-0.5">Crypto · Forex · Commodities · 82% payout</div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#00ff88]/40 shrink-0" />
            </div>
          </motion.div>
        </Link>

        {/* ── GAME CARDS ── */}
        <div className="grid grid-cols-2 gap-2.5">
          {GAMES.map(({ href, name, sub, icon: Icon, color, bg }) => (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.96 }}
                className={`relative rounded-xl border border-white/8 bg-gradient-to-br ${bg} to-transparent p-4 flex flex-col gap-3 overflow-hidden cursor-pointer group`}
                whileHover={{ borderColor: `${color}50` }}
                transition={{ duration: 0.15 }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `radial-gradient(ellipse at top left, ${color}08, transparent 60%)` }} />
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-black/30 border border-white/5 relative z-10">
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="relative z-10">
                  <div className="font-bold text-sm text-white">{name}</div>
                  <div className="text-[10px] font-mono text-white/30 mt-0.5">{sub}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/15 absolute bottom-3.5 right-3.5" />
              </motion.div>
            </Link>
          ))}
        </div>

        {/* ── JACKPOT ── */}
        <div className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/20 bg-gradient-to-br from-[#f59e0b]/10 via-[#0d1117] to-[#0d1117] p-4">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#f59e0b]/5 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#f59e0b]/70">Golden Boot</span>
              </div>
              <motion.div
                className="font-black text-3xl text-white tabular-nums"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {Number(jackpot?.currentAmountTon ?? 0).toFixed(2)}
                <span className="text-[#f59e0b] ml-1.5 text-2xl">TON</span>
              </motion.div>
              <div className="text-[9px] font-mono text-white/25 mt-0.5">
                {jackpot?.status === "ready"
                  ? "Ready to trigger!"
                  : `Building to ${jackpot?.minimumTrigger ?? 50} TON`}
              </div>
            </div>
            <div className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase ${
              jackpot?.status === "ready" ? "bg-[#f59e0b]/20 text-[#f59e0b]" : "bg-white/5 text-white/25"
            }`}>
              {jackpot?.status ?? "building"}
            </div>
          </div>
          <div className="mt-3 bg-black/30 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#00ff88]"
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>

        {/* ── DAILY MISSIONS ── */}
        {missions && (
          <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-white/5">
              <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Daily Missions</span>
              {missionsDone ? (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="ml-auto text-[9px] font-mono bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25 rounded-full px-2 py-0.5"
                >
                  {missions.bonusClaimed ? "Claimed" : `+${missions.bonusStriker} SKR`}
                </motion.span>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {missions.missions.map((m, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full"
                        style={{ background: m.completed ? "#00ff88" : "rgba(255,255,255,0.1)" }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-white/20">{missionsCompleted}/3</span>
                </div>
              )}
            </div>
            <div className="flex flex-col divide-y divide-white/4 px-4 pb-3 pt-1">
              {(missions.missions as DailyMission[]).map((m) => (
                <div key={m.key} className="flex items-center gap-3 py-2.5">
                  {m.completed
                    ? <CheckCircle2 className="w-4 h-4 text-[#00ff88] shrink-0" />
                    : <Circle      className="w-4 h-4 text-white/12 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className={`font-mono text-[11px] font-semibold ${m.completed ? "text-white/30 line-through" : "text-white/80"}`}>
                      {m.title}
                    </span>
                    {!m.completed && (
                      <div className="text-[9px] font-mono text-white/20 mt-0.5">{m.description}</div>
                    )}
                  </div>
                  {!m.completed && m.target > 1 && (
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] font-mono text-white/30 tabular-nums">{m.progress}/{m.target}</div>
                      <div className="w-12 h-1 bg-white/6 rounded-full mt-1 overflow-hidden">
                        <motion.div
                          className="h-full bg-[#00ff88] rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(m.progress / m.target) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RECENT WINNERS ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Users className="w-3 h-3 text-white/25" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/25">Recent Winners</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {wins.map((w, i) => {
              const gameColor = w.game.includes("shot") || w.game.includes("crash") ? "#00ff88"
                : w.game.includes("penalty") ? "#3b82f6"
                : w.game.includes("mine") ? "#ef4444"
                : "#f59e0b";
              const GameIcon = w.game.includes("shot") || w.game.includes("crash") ? TrendingUp
                : w.game.includes("penalty") ? Target
                : w.game.includes("mine") ? Bomb
                : Zap;
              return (
                <motion.div
                  key={w.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-2.5 bg-white/2 border border-white/5 rounded-xl px-3 py-2.5"
                >
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${gameColor}12`, border: `1px solid ${gameColor}25` }}>
                    <GameIcon className="w-3 h-3" style={{ color: gameColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] font-bold text-white/65 truncate">{w.username}</div>
                    <div className="text-[9px] font-mono text-white/20">{GAME_LABELS[w.game] ?? w.game} · {timeAgo(w.playedAt)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[11px] font-bold text-[#00ff88]">+{w.win.toLocaleString()}</div>
                    <div className="text-[9px] font-mono text-white/25">{w.mult.toFixed(2)}×</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </Layout>
  );
}
