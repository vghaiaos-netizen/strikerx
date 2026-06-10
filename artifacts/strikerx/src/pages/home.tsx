import { useAuth } from "@/lib/auth";
import { useTelegramAuth, useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { TrendingUp, Target, Bomb, Zap, Trophy, ChevronRight, Tv2, Globe, Gift, Copy, Check, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/lib/ws-notifications";
import { useGetMyReferral } from "@workspace/api-client-react";

interface MatchEvent { active: boolean; teamA: string; teamB: string; bonusMultiplier: number; endsAt: string | null; label: string; }
interface WcTheme { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }
interface RecentWin { id: number; username: string; game: string; bet: number; win: number; mult: number; playedAt: string | null; }
interface CommunityInfo { groupInviteLink: string | null; miniAppLink: string | null; botUsername: string; }

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
  { href: "/games/shot",      name: "The Shot",  sub: "Crash",    icon: TrendingUp, color: "#00ff88", bg: "from-[#00ff88]/10" },
  { href: "/games/penalty",   name: "Penalty",   sub: "1.92x",    icon: Target,     color: "#3b82f6", bg: "from-[#3b82f6]/10" },
  { href: "/games/minefield", name: "Minefield", sub: "Compound", icon: Bomb,       color: "#ef4444", bg: "from-[#ef4444]/10" },
  { href: "/games/freekick",  name: "Free Kick", sub: "Plinko",   icon: Zap,        color: "#f59e0b", bg: "from-[#f59e0b]/10" },
];

const GAME_LABELS: Record<string, string> = {
  penalty: "Penalty", shot: "The Shot", crash: "The Shot",
  minefield: "Minefield", freekick: "Free Kick", free_kick: "Free Kick",
};

const SEED_WINS: RecentWin[] = [
  { id: 1, username: "striker_99", game: "shot",      bet: 500,  win: 2840, mult: 5.23, playedAt: null },
  { id: 2, username: "goalie_k",   game: "penalty",   bet: 200,  win: 384,  mult: 1.92, playedAt: null },
  { id: 3, username: "mfield_pro", game: "minefield", bet: 300,  win: 4500, mult: 9.10, playedAt: null },
  { id: 4, username: "fk_beast",   game: "freekick",  bet: 400,  win: 1200, mult: 3.00, playedAt: null },
  { id: 5, username: "captain_x",  game: "shot",      bet: 1000, win: 6800, mult: 6.80, playedAt: null },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "just now";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Home() {
  useDevAuth();
  const { player } = useAuth();
  const { notifications } = useNotifications();
  const [wcCountdownSecs, setWcCountdownSecs] = useState(0);
  const wcTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const { data: jackpot } = useGetJackpot({
    query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 30000 },
  });
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
  const { data: referral } = useGetMyReferral();
  const { data: community } = useQuery<CommunityInfo>({
    queryKey: ["community"],
    queryFn: async () => { const r = await fetch("/api/public/community"); return r.json() as Promise<CommunityInfo>; },
    staleTime: 300_000,
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

  // Merge live WS wins + DB wins, deduplicate, take top 8
  const wsWins: RecentWin[] = notifications
    .filter(n => n.type === "big_win")
    .slice(0, 5)
    .map((n, i) => ({
      id: -i - 1,
      username: n.username,
      game: n.detail.split(" on ")[1] ?? "shot",
      bet: 0,
      win: parseInt(n.detail.replace(/[^\d]/g, ""), 10) || 0,
      mult: parseFloat(n.message.split(" hit ")[1] ?? "1") || 1,
      playedAt: new Date(n.at).toISOString(),
    }));

  const allWins: RecentWin[] = [...wsWins, ...(dbWins ?? [])].slice(0, 8);
  const wins = allWins.length >= 3 ? allWins : SEED_WINS;

  const pct = jackpot?.percentFull ?? 0;

  const formatWcCountdown = (secs: number) => {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return { d, h, m, s };
  };
  const wct = formatWcCountdown(wcCountdownSecs);

  const copyCode = () => {
    const code = referral?.code ?? "";
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── World Cup 2026 Banner ── */}
        <AnimatePresence>
          {wcTheme?.active && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="relative overflow-hidden rounded-2xl border border-[#e63946]/30 bg-gradient-to-br from-[#1d3557]/70 via-[#0d1117] to-[#1a0a0a]/60 p-4"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#e6394620,transparent_55%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,#ffd70010,transparent_55%)]" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-3.5 h-3.5 text-[#e63946]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#e63946]">World Cup 2026</span>
                  {wcTheme.live ? (
                    <span className="ml-auto text-[10px] font-mono bg-[#e63946]/20 text-[#e63946] border border-[#e63946]/30 rounded-full px-2 py-0.5 animate-pulse">LIVE</span>
                  ) : (
                    <span className="ml-auto text-[10px] font-mono bg-white/5 text-white/40 border border-white/10 rounded-full px-2 py-0.5">COMING SOON</span>
                  )}
                </div>
                {wcTheme.live ? (
                  <div className="text-center py-1">
                    <div className="font-display font-black text-xl text-white tracking-wide">THE TOURNAMENT IS LIVE</div>
                    <div className="text-[11px] font-mono text-white/40 mt-1">Play all games for a chance at the ultimate jackpot</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 py-1">
                    {[{ val: wct.d, label: "DAYS" },{ val: wct.h, label: "HRS" },{ val: wct.m, label: "MIN" },{ val: wct.s, label: "SEC" }].map(({ val, label }) => (
                      <div key={label} className="flex flex-col items-center">
                        <div className="bg-white/8 border border-white/10 rounded-lg w-12 h-10 flex items-center justify-center">
                          <span className="font-display font-black text-lg text-white">{String(val).padStart(2, "0")}</span>
                        </div>
                        <span className="text-[8px] font-mono text-white/30 mt-1 tracking-widest">{label}</span>
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
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,#3b82f620,transparent_70%)]" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-3">
                  <Tv2 className="w-3.5 h-3.5 text-[#3b82f6]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#3b82f6]">{matchEvent.label}</span>
                  <span className="ml-auto text-[10px] font-mono bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30 rounded-full px-2 py-0.5 animate-pulse">LIVE</span>
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
              <motion.div className="font-display font-black text-3xl text-white"
                animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                {Number(jackpot?.currentAmountTon ?? 0).toFixed(2)}
                <span className="text-[#f59e0b] ml-1 text-2xl">TON</span>
              </motion.div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {jackpot?.status === "ready" ? "READY TO TRIGGER" : `Building to ${jackpot?.minimumTrigger ?? 50} TON`}
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
          <div className="flex items-center gap-2 mb-2.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
              {wcTheme?.active ? "WC ORIGINALS" : "ORIGINALS"}
            </div>
            {wcTheme?.active && (
              <span className="text-[8px] font-mono font-bold bg-[#e63946]/15 text-[#e63946] border border-[#e63946]/20 rounded-full px-1.5 py-0.5 tracking-widest">2026</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GAMES.map(({ href, name, sub, icon: Icon, color, bg }) => (
              <Link key={href} href={href}>
                <motion.div whileTap={{ scale: 0.95 }}
                  className={`relative rounded-xl border border-white/8 bg-gradient-to-br ${bg} to-transparent p-4 flex flex-col gap-3 overflow-hidden cursor-pointer`}
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

        {/* ── Ways to Earn ── */}
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mb-2.5">Ways to Earn TON</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: TrendingUp, color: "#00ff88", title: "Play & Win",     sub: "All 4 games earn STRIKER" },
              { icon: Gift,       color: "#f59e0b", title: "Refer Squad",    sub: "10% of friends' wins forever" },
              { icon: Zap,        color: "#3b82f6", title: "Daily Streak",   sub: "Bonus STRIKER every day" },
              { icon: Trophy,     color: "#a855f7", title: "VIP Cashback",   sub: "Up to 15% back on losses" },
            ].map(({ icon: Icon, color, title, sub }) => (
              <Link key={title} href="/loyalty">
                <div className="flex items-start gap-2.5 rounded-xl border border-white/6 bg-white/3 p-3 cursor-pointer hover:border-white/15 transition-colors">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <div>
                    <div className="font-display font-bold text-xs text-white">{title}</div>
                    <div className="text-[9px] font-mono text-white/35 mt-0.5">{sub}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Referral CTA ── */}
        <div className="relative overflow-hidden rounded-xl border border-[#00ff88]/20 bg-[#00ff88]/5 p-4">
          <div className="absolute right-0 top-0 w-24 h-24 bg-[#00ff88]/8 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/25 flex items-center justify-center flex-shrink-0">
              <Gift className="w-4 h-4 text-[#00ff88]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm text-white">Earn with your Squad</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">Get 10% of friends' wins forever</div>
              {referral?.code && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="font-mono text-[11px] text-[#00ff88] font-bold tracking-widest">{referral.code}</span>
                  <button onClick={copyCode} className="p-0.5">
                    {codeCopied ? <Check className="w-3 h-3 text-[#00ff88]" /> : <Copy className="w-3 h-3 text-white/30" />}
                  </button>
                </div>
              )}
            </div>
            <Link href="/loyalty">
              <div className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono text-[#00ff88]/70 hover:text-[#00ff88] transition-colors cursor-pointer">
                View <ChevronRight className="w-3 h-3" />
              </div>
            </Link>
          </div>
        </div>

        {/* ── Community Card ── */}
        {community?.groupInviteLink && (
          <motion.a
            href={community.groupInviteLink}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/5 p-4 flex items-center gap-3 cursor-pointer hover:border-[#3b82f6]/50 transition-all no-underline"
          >
            <div className="absolute right-0 top-0 w-20 h-20 bg-[#3b82f6]/8 rounded-full blur-2xl" />
            <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/25 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#3b82f6]" />
            </div>
            <div className="flex-1 min-w-0 relative">
              <div className="font-display font-bold text-sm text-white">Join the Community</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">Big-win alerts · jackpot updates · live chat</div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono text-[#3b82f6]/70 relative">
              Join <ChevronRight className="w-3 h-3" />
            </div>
          </motion.a>
        )}

        {/* ── Recent Winners ── */}
        <div className="bg-white/3 border border-white/6 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">Recent Winners</span>
            {wsWins.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse ml-auto" />
            )}
          </div>
          <div className="flex flex-col divide-y divide-white/4">
            <AnimatePresence initial={false}>
              {wins.slice(0, 6).map((w, i) => (
                <motion.div key={w.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="w-7 h-7 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/20 flex items-center justify-center text-[10px] font-mono font-bold text-[#00ff88] flex-shrink-0">
                    {(w.username[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-white font-semibold truncate">{w.username}</span>
                      <span className="text-[10px] font-mono text-white/25 flex-shrink-0">{GAME_LABELS[w.game.toLowerCase()] ?? w.game}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-[#00ff88] font-bold">{w.win.toLocaleString(undefined, { maximumFractionDigits: 0 })} STRK</span>
                      <span className="text-[9px] font-mono text-white/25">{w.mult.toFixed(2)}x · {timeAgo(w.playedAt)}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </Layout>
  );
}
