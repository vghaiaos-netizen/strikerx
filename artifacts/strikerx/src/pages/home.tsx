import { useAuth } from "@/lib/auth";
import { useTelegramAuth, useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { TrendingUp, Target, Bomb, Zap, Trophy, ChevronRight, Tv2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/lib/ws-notifications";

interface MatchEvent { active: boolean; teamA: string; teamB: string; bonusMultiplier: number; endsAt: string | null; label: string; }

interface WinEntry { user: string; amount: number; game: string; mult: string; }

// Dev auth bypass — uses Telegram format in dev mode
function useDevAuth() {
  const { player, isLoading, setToken } = useAuth();
  const telegramAuth = useTelegramAuth();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || player || isLoading || localStorage.getItem("strikerx_token")) return;
    tried.current = true;

    const tg = (window as unknown as Record<string, unknown>).Telegram as { WebApp?: { initData?: string } } | undefined;
    const initData = tg?.WebApp?.initData;

    if (initData) {
      telegramAuth.mutate({ data: { initData } }, { onSuccess: d => setToken(d.token) });
    } else if (import.meta.env.DEV) {
      telegramAuth.mutate({ data: { initData: "dev:123456:player_dev" } }, { onSuccess: d => setToken(d.token) });
    }
  }, [player, isLoading]);
}

const GAMES = [
  { href: "/games/shot",      name: "The Shot",   sub: "Crash",    icon: TrendingUp, color: "#00ff88", bg: "from-[#00ff88]/10" },
  { href: "/games/penalty",   name: "Penalty",    sub: "1.92x",    icon: Target,     color: "#3b82f6", bg: "from-[#3b82f6]/10" },
  { href: "/games/minefield", name: "Minefield",  sub: "Compound", icon: Bomb,       color: "#ef4444", bg: "from-[#ef4444]/10" },
  { href: "/games/freekick",  name: "Free Kick",  sub: "Plinko",   icon: Zap,        color: "#f59e0b", bg: "from-[#f59e0b]/10" },
];

// Seed wins shown before any real WS data arrives
const SEED_WINS: WinEntry[] = [
  { user: "striker_99", amount: 2840, game: "The Shot",  mult: "5.23x"  },
  { user: "goalie_k",   amount: 920,  game: "Penalty",   mult: "1.92x"  },
  { user: "mfield_pro", amount: 4500, game: "Minefield", mult: "9.10x"  },
  { user: "fk_beast",   amount: 1200, game: "Free Kick", mult: "12.00x" },
];

export function Home() {
  useDevAuth();

  const { player } = useAuth();
  const { notifications } = useNotifications();
  const [tickerIdx, setTickerIdx] = useState(0);

  const { data: jackpot } = useGetJackpot({
    query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 30000 },
  });

  const { data: matchEvent } = useQuery<MatchEvent>({
    queryKey: ["match-event"],
    queryFn: async () => {
      const res = await fetch("/api/public/match-event");
      return res.json() as Promise<MatchEvent>;
    },
    refetchInterval: 60_000,
  });

  // Build live wins from real WS big_win events; fall back to seed data if none yet
  const liveWins: WinEntry[] = notifications
    .filter(n => n.type === "big_win")
    .slice(0, 10)
    .map(n => ({
      user:   n.username,
      amount: parseInt(n.detail.replace(/[^\d]/g, ""), 10) || 0,
      game:   n.detail.split(" on ")[1] ?? n.message,
      mult:   n.message.split(" hit ")[1] ?? "x",
    }));

  const wins = liveWins.length >= 2 ? liveWins : SEED_WINS;

  useEffect(() => {
    setTickerIdx(0);
  }, [wins.length]);

  useEffect(() => {
    const t = setInterval(() => setTickerIdx(i => (i + 1) % wins.length), 3500);
    return () => clearInterval(t);
  }, [wins.length]);

  const safeIdx = tickerIdx % wins.length;
  const currentWin = wins[safeIdx]!;
  const pct = jackpot?.percentFull ?? 0;

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── Match Event Banner ── */}
        <AnimatePresence>
          {matchEvent?.active && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="relative overflow-hidden rounded-2xl border border-[#3b82f6]/30 bg-gradient-to-br from-[#1e3a5f]/60 via-[#0d1117] to-[#1a2a0f]/40 p-4"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,#3b82f620,transparent_70%)]" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-3">
                  <Tv2 className="w-3.5 h-3.5 text-[#3b82f6]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#3b82f6]">
                    {matchEvent.label}
                  </span>
                  <span className="ml-auto text-[10px] font-mono bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30 rounded-full px-2 py-0.5 animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="flex items-center justify-center gap-6 py-2">
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamA}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">HOME</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] font-mono text-white/30">VS</div>
                    <div className="bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-lg px-2 py-1">
                      <span className="font-display font-black text-sm text-[#00ff88]">{matchEvent.bonusMultiplier}x</span>
                      <span className="text-[9px] font-mono text-[#00ff88]/60 ml-1">BONUS</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamB}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">AWAY</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Jackpot Banner ── */}
        <div className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/20 bg-gradient-to-br from-[#f59e0b]/10 via-[#0d1117] to-[#0d1117] p-4">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#f59e0b]/5 blur-2xl" />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#f59e0b]">Golden Boot</span>
              </div>
              <motion.div
                className="font-display font-black text-3xl text-white"
                animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}
              >
                {Number(jackpot?.currentAmountTon ?? 0).toFixed(2)}
                <span className="text-[#f59e0b] ml-1 text-2xl">TON</span>
              </motion.div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {jackpot?.status === "ready" ? "READY TO TRIGGER" : `Building to ${jackpot?.minimumTrigger ?? 100} TON`}
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

        {/* ── Balance Strip ── */}
        {player && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "STRIKER", val: (player as Record<string,unknown>)?.strikerBalance, color: "#00ff88" },
              { label: "BOOT",    val: (player as Record<string,unknown>)?.bootBalance,    color: "#f59e0b" },
              { label: "CAPTAIN", val: (player as Record<string,unknown>)?.captainBalance, color: "#a855f7" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white/30 mb-1">{label}</div>
                <div className="font-display font-bold text-base" style={{ color }}>
                  {Number(val ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Game Grid ── */}
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mb-2.5">ORIGINALS</div>
          <div className="grid grid-cols-2 gap-3">
            {GAMES.map(({ href, name, sub, icon: Icon, color, bg }) => (
              <Link key={href} href={href}>
                <motion.div whileTap={{ scale: 0.95 }}
                  className={`relative rounded-xl border border-white/8 bg-gradient-to-br ${bg} to-transparent p-4 flex flex-col gap-3 overflow-hidden cursor-pointer`}
                  style={{ boxShadow: `0 0 0 0 ${color}` }}
                  whileHover={{ boxShadow: `0 0 16px ${color}22`, borderColor: `${color}40` }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/30 border border-white/5">
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="font-display font-bold text-sm text-white tracking-tight">{name}</div>
                    <div className="text-[10px] font-mono text-white/30 mt-0.5">{sub}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 absolute bottom-3.5 right-3.5" />
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Live Wins Ticker ── */}
        <div className="bg-white/3 border border-white/6 rounded-xl overflow-hidden">
          <div className="px-3 pt-2.5 pb-0 flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/25">Live Wins</span>
            {liveWins.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse ml-auto mr-1" />
            )}
          </div>
          <div className="relative h-11 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={safeIdx}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center px-3 gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/20 flex items-center justify-center text-[10px] font-mono font-bold text-[#00ff88]">
                  {(currentWin.user[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-white font-semibold">{currentWin.user}</span>
                  <span className="font-mono text-xs text-white/40"> won </span>
                  <span className="font-mono text-xs text-[#00ff88] font-bold">{currentWin.amount.toLocaleString()} STRIKER</span>
                  <span className="font-mono text-[10px] text-white/25"> · {currentWin.game} · {currentWin.mult}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </Layout>
  );
}
