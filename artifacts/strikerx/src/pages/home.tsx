import { useAuth } from "@/lib/auth";
import { useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { TrendingUp, Target, Bomb, Zap, Trophy, ChevronRight, Tv2, Globe, Gift, Copy, Check, Users, BookOpen, CheckCircle2, Circle, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/lib/ws-notifications";
import { useGetMyReferral } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

interface MatchEvent { active: boolean; teamA: string; teamB: string; bonusMultiplier: number; endsAt: string | null; label: string; }
interface WcTheme { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }
interface RecentWin { id: number; username: string; game: string; bet: number; win: number; mult: number; playedAt: string | null; }
interface CommunityInfo { groupInviteLink: string | null; miniAppLink: string | null; botUsername: string; }
interface TonPrice { usd: number | null; cachedAt: number | null; stale?: boolean; }
interface DailyMission { key: string; title: string; description: string; target: number; progress: number; completed: boolean; }
interface DailyMissionsRow { id: number; missions: DailyMission[]; allCompleted: boolean; bonusClaimed: boolean; bonusStriker: number; date: string; }


const GAMES = [
  { href: "/games/shot",      name: "The Shot",  sub: "Crash",    icon: TrendingUp, color: "#00ff88", bg: "from-[#00ff88]/10" },
  { href: "/games/penalty",   name: "Penalty",   sub: "1.92x",    icon: Target,     color: "#3b82f6", bg: "from-[#3b82f6]/10" },
  { href: "/games/minefield", name: "Minefield", sub: "Compound", icon: Bomb,       color: "#ef4444", bg: "from-[#ef4444]/10" },
  { href: "/games/freekick",  name: "Free Kick", sub: "Plinko",   icon: Zap,        color: "#f59e0b", bg: "from-[#f59e0b]/10" },
];

const SEED_WINS: RecentWin[] = [
  { id: 1, username: "striker_99", game: "shot",      bet: 500,  win: 2840, mult: 5.23, playedAt: null },
  { id: 2, username: "goalie_k",   game: "penalty",   bet: 200,  win: 384,  mult: 1.92, playedAt: null },
  { id: 3, username: "mfield_pro", game: "minefield", bet: 300,  win: 4500, mult: 9.10, playedAt: null },
  { id: 4, username: "fk_beast",   game: "freekick",  bet: 400,  win: 1200, mult: 3.00, playedAt: null },
  { id: 5, username: "captain_x",  game: "shot",      bet: 1000, win: 6800, mult: 6.80, playedAt: null },
];

export function Home() {
  const { t } = useTranslation();
  const { player, token } = useAuth();
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

  const { data: tonPrice } = useQuery<TonPrice>({
    queryKey: ["ton-price"],
    queryFn: async () => { const r = await fetch("/api/public/ton-price"); return r.json() as Promise<TonPrice>; },
    refetchInterval: 90_000,
    staleTime: 60_000,
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

  const timeAgo = (iso: string | null): string => {
    if (!iso) return t('home.justNow');
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('home.justNow');
    if (m < 60) return t('home.mAgo', { m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('home.hAgo', { h });
    return t('home.dAgo', { d: Math.floor(h / 24) });
  };

  const GAME_LABELS: Record<string, string> = {
    penalty: "Penalty", shot: "The Shot", crash: "The Shot",
    minefield: "Minefield", freekick: "Free Kick", free_kick: "Free Kick",
  };

  const waysToEarn = [
    { icon: TrendingUp, color: "#00ff88", titleKey: "home.playAndWin",   subKey: "home.playAndWinDesc" },
    { icon: Gift,       color: "#f59e0b", titleKey: "home.referSquad",   subKey: "home.referSquadDesc" },
    { icon: Zap,        color: "#3b82f6", titleKey: "home.dailyStreak",  subKey: "home.dailyStreakDesc" },
    { icon: Trophy,     color: "#a855f7", titleKey: "home.vipCashback",  subKey: "home.vipCashbackDesc" },
  ];

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
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#e63946]">{t('home.wc2026')}</span>
                  {wcTheme.live ? (
                    <span className="ml-auto text-[10px] font-mono bg-[#e63946]/20 text-[#e63946] border border-[#e63946]/30 rounded-full px-2 py-0.5 animate-pulse">{t('home.live')}</span>
                  ) : (
                    <span className="ml-auto text-[10px] font-mono bg-white/5 text-white/40 border border-white/10 rounded-full px-2 py-0.5">{t('home.comingSoon')}</span>
                  )}
                </div>
                {wcTheme.live ? (
                  <div className="text-center py-1">
                    <div className="font-display font-black text-xl text-white tracking-wide">{t('home.wcTournamentLive')}</div>
                    <div className="text-[11px] font-mono text-white/40 mt-1">{t('home.wcTournamentDesc')}</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 py-1">
                    {[
                      { val: wct.d, labelKey: "home.days" },
                      { val: wct.h, labelKey: "home.hrs" },
                      { val: wct.m, labelKey: "home.min" },
                      { val: wct.s, labelKey: "home.sec" },
                    ].map(({ val, labelKey }) => (
                      <div key={labelKey} className="flex flex-col items-center">
                        <div className="bg-white/8 border border-white/10 rounded-lg w-12 h-10 flex items-center justify-center">
                          <span className="font-display font-black text-lg text-white">{String(val).padStart(2, "0")}</span>
                        </div>
                        <span className="text-[8px] font-mono text-white/30 mt-1 tracking-widest">{t(labelKey)}</span>
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
                  <span className="ml-auto text-[10px] font-mono bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30 rounded-full px-2 py-0.5 animate-pulse">{t('home.live')}</span>
                </div>
                <div className="flex items-center justify-center gap-6 py-2">
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamA}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">{t('home.homeTeam')}</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] font-mono text-white/30">{t('home.vs')}</div>
                    <div className="bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-lg px-2 py-1">
                      <span className="font-display font-black text-sm text-[#00ff88]">{matchEvent.bonusMultiplier}x</span>
                      <span className="text-[9px] font-mono text-[#00ff88]/60 ml-1">{t('home.bonus')}</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono font-black text-xl text-white">{matchEvent.teamB}</div>
                    <div className="text-[9px] font-mono text-white/40 mt-0.5">{t('home.awayTeam')}</div>
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
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#f59e0b]">{t('home.goldenBoot')}</span>
              </div>
              <motion.div className="font-display font-black text-3xl text-white"
                animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                {Number(jackpot?.currentAmountTon ?? 0).toFixed(2)}
                <span className="text-[#f59e0b] ml-1 text-2xl">TON</span>
              </motion.div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {jackpot?.status === "ready" ? t('home.readyToTrigger') : t('home.buildingTo', { target: jackpot?.minimumTrigger ?? 50 })}
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

        {/* ── TON Price Ticker ── */}
        {tonPrice?.usd != null && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex items-center gap-1.5 bg-white/3 border border-white/6 rounded-full px-2.5 py-1">
              <span className="text-[9px] font-mono font-bold text-white/30 uppercase tracking-widest">TON</span>
              <span className="text-[11px] font-mono font-bold text-[#00ff88]">${tonPrice.usd.toFixed(2)}</span>
              {tonPrice.stale && <span className="text-[8px] font-mono text-white/20">~</span>}
            </div>
            {player && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-white/20">
                <span>≈</span>
                <span className="text-white/35">
                  ${(Number((player as Record<string,unknown>)?.strikerBalance ?? 0) / 100 * tonPrice.usd).toFixed(2)} USD
                </span>
              </div>
            )}
          </div>
        )}

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

        {/* ── Daily Missions ── */}
        {missions && (
          <div className="bg-white/3 border border-white/6 rounded-xl overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t('home.dailyMissions')}</span>
              {missions.allCompleted ? (
                <span className="ml-auto text-[9px] font-mono bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25 rounded-full px-2 py-0.5">
                  {missions.bonusClaimed ? t('home.claimed') : `+${missions.bonusStriker} STRIKER`}
                </span>
              ) : (
                <span className="ml-auto text-[9px] font-mono text-white/25">
                  {missions.missions.filter((m: DailyMission) => m.completed).length}/3
                </span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-white/4 px-4 pb-3 gap-0">
              {(missions.missions as DailyMission[]).map((m) => (
                <div key={m.key} className="flex items-center gap-3 py-2">
                  {m.completed
                    ? <CheckCircle2 className="w-4 h-4 text-[#00ff88] flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-white/15 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-[11px] font-semibold ${m.completed ? "text-white/40 line-through" : "text-white"}`}>{m.title}</span>
                    </div>
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

        {/* ── Trading Hero CTA ── */}
        <Link href="/games/trading">
          <motion.div
            whileTap={{ scale: 0.97 }}
            className="relative overflow-hidden rounded-2xl border border-[#00ff88]/30 bg-gradient-to-br from-[#00ff88]/10 via-[#0d1117] to-[#0d1117]/80 p-4 cursor-pointer"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#00ff8818,transparent_60%)]" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/25 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-[#00ff88]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display font-black text-base text-white tracking-tight">Binary Trading</span>
                  <span className="text-[9px] font-mono font-bold bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 rounded-full px-2 py-0.5 tracking-widest">LIVE</span>
                </div>
                <div className="text-[11px] font-mono text-white/40 mt-0.5">Predict BTC · ETH · SOL · BNB · TON</div>
                <div className="text-[10px] font-mono text-[#00ff88]/70 mt-1 font-bold">1.82× payout · Fixed odds · Settle in 30s–15m</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#00ff88]/50 flex-shrink-0" />
            </div>
          </motion.div>
        </Link>

        {/* ── Mini Games (side entertainment) ── */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
              Mini Games
            </div>
            <div className="text-[9px] font-mono text-white/15">· for fun</div>
            {wcTheme?.active && (
              <span className="ml-auto text-[8px] font-mono font-bold bg-[#e63946]/15 text-[#e63946] border border-[#e63946]/20 rounded-full px-1.5 py-0.5 tracking-widest">WC 2026</span>
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
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mb-2.5">{t('home.waysToEarn')}</div>
          <div className="grid grid-cols-2 gap-2">
            {waysToEarn.map(({ icon: Icon, color, titleKey, subKey }) => (
              <Link key={titleKey} href="/loyalty">
                <div className="flex items-start gap-2.5 rounded-xl border border-white/6 bg-white/3 p-3 cursor-pointer hover:border-white/15 transition-colors">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <div>
                    <div className="font-display font-bold text-xs text-white">{t(titleKey)}</div>
                    <div className="text-[9px] font-mono text-white/35 mt-0.5">{t(subKey)}</div>
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
              <div className="font-display font-bold text-sm text-white">{t('home.earnSquad')}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{t('home.referralDesc')}</div>
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
              <ChevronRight className="w-4 h-4 text-white/30" />
            </Link>
          </div>
        </div>

        {/* ── Community CTA ── */}
        {community?.groupInviteLink && (
          <a href={community.groupInviteLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-[#3b82f6]/20 bg-[#3b82f6]/5 p-4 no-underline hover:border-[#3b82f6]/35 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/25 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#3b82f6]" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-sm text-white">{t('home.communityTitle')}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{t('home.communityDesc')}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </a>
        )}

        {/* ── How to Play CTA ── */}
        <Link href="/how-to-play">
          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-4 cursor-pointer hover:border-white/15 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-white/40" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-sm text-white">{t('home.howToPlay')}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{t('home.howToPlayDesc')}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </div>
        </Link>

        {/* ── Recent Winners ── */}
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mb-2.5">{t('home.recentWinners')}</div>
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
