import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import {
  useGetMyPortfolio,
  useGetMyPortfolioChart,
  useGetTradingPositions,
  getGetTradingPositionsQueryKey,
  useGetTradingLeaderboard,
  useGetMyAchievements,
  useGetMyStreak,
  useClaimStreakReward,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, TrendingUp, TrendingDown, Trophy, Flame,
  CheckCircle, XCircle, MinusCircle, ChevronUp, ChevronDown, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const VIP_COLORS: Record<string, string> = {
  sunday_league: "#6b7280", championship: "#3b82f6",
  premier_league: "#22c55e", champions_league: "#f59e0b", world_cup: "#a855f7",
};
const RARITY_COLORS: Record<string, string> = {
  common: "#6b7280", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b",
};

function PnlBadge({ value, small }: { value: number; small?: boolean }) {
  const pos = value >= 0;
  return (
    <span className={`font-mono font-black tabular-nums ${small ? "text-sm" : "text-xl"} ${pos ? "text-green-400" : "text-red-400"}`}>
      {pos ? "+" : ""}{value.toFixed(2)}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 flex-1 min-w-0">
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">{label}</p>
      <p className="font-black text-base tabular-nums truncate">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Simple SVG sparkline for cumulative P&L
function PnlSparkline({ points }: { points: { date: string; pnl: number }[] }) {
  if (points.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Not enough data yet</div>;

  let cum = 0;
  const cumPoints = points.map((p) => { cum += p.pnl; return cum; });
  const min = Math.min(...cumPoints, 0);
  const max = Math.max(...cumPoints, 0.01);
  const range = max - min;

  const W = 300; const H = 80;
  const pts = cumPoints.map((v, i) => ({
    x: (i / (cumPoints.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;

  const lastY = pts[pts.length - 1]?.y ?? H / 2;
  const isPositive = cum >= 0;
  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div className="h-24 w-full relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#pnlGrad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
        {/* Zero line */}
        <line x1="0" y1={H - ((0 - min) / range) * H} x2={W} y2={H - ((0 - min) / range) * H} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" strokeDasharray="4,4" />
      </svg>
      {/* Current value label */}
      <div className="absolute top-1 right-1 text-[10px] font-mono font-bold" style={{ color }}>
        {cum >= 0 ? "+" : ""}{cum.toFixed(2)}
      </div>
    </div>
  );
}

function WinLossDonut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return (
    <div className="w-16 h-16 rounded-full border-4 border-white/8 flex items-center justify-center">
      <span className="text-[9px] text-muted-foreground">—</span>
    </div>
  );
  const winPct = wins / total;
  const r = 22; const circ = 2 * Math.PI * r;
  const winArc = winPct * circ;
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 48 48" className="w-16 h-16 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(239,68,68,0.25)" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="#22c55e" strokeWidth="5"
          strokeDasharray={`${winArc} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-black text-white">{Math.round(winPct * 100)}%</span>
        <span className="text-[7px] text-muted-foreground leading-none">WR</span>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { data: portfolio } = useGetMyPortfolio();
  const { data: chart }     = useGetMyPortfolioChart({ query: { staleTime: 60_000 } });

  const at = portfolio?.allTime;
  const td = portfolio?.today;
  const tw = portfolio?.thisWeek;

  const periodData = [
    { label: "Today",     netPnl: td?.netPnl ?? 0,  trades: td?.totalTrades ?? 0, wins: td?.wins ?? 0, losses: (td?.totalTrades ?? 0) - (td?.wins ?? 0) },
    { label: "This Week", netPnl: tw?.netPnl ?? 0,  trades: tw?.totalTrades ?? 0, wins: tw?.wins ?? 0, losses: (tw?.totalTrades ?? 0) - (tw?.wins ?? 0) },
    { label: "All Time",  netPnl: at?.netPnl ?? 0,  trades: at?.totalTrades ?? 0, wins: at?.wins ?? 0, losses: at?.losses ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Win/loss donut + key stats hero row */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
        <WinLossDonut wins={at?.wins ?? 0} losses={at?.losses ?? 0} />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2">All-Time Performance</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <div className="text-[8px] text-muted-foreground">Total Trades</div>
              <div className="font-black text-sm">{at?.totalTrades ?? 0}</div>
            </div>
            <div>
              <div className="text-[8px] text-muted-foreground">Net P&L</div>
              <div className={`font-black text-sm tabular-nums ${(at?.netPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {(at?.netPnl ?? 0) >= 0 ? "+" : ""}{(at?.netPnl ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[8px] text-muted-foreground">Best Win</div>
              <div className="font-black text-sm text-green-400">+{(at?.biggestWin ?? 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[8px] text-muted-foreground">Win Streak</div>
              <div className="font-black text-sm text-orange-400">{at?.currentStreak ?? 0}×</div>
            </div>
          </div>
        </div>
      </div>

      {/* Period P&L cards */}
      <div className="grid grid-cols-3 gap-2">
        {periodData.map(({ label, netPnl, trades, wins, losses }) => {
          const isPos = netPnl >= 0;
          const total = wins + losses;
          const wr = total > 0 ? Math.round((wins / total) * 100) : null;
          return (
            <motion.div key={label}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-card border rounded-xl px-3 py-2.5 relative overflow-hidden ${
                netPnl > 0 ? "border-green-500/25" : netPnl < 0 ? "border-red-500/20" : "border-border"
              }`}>
              {netPnl !== 0 && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at bottom left, ${isPos ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.05)"} 0%, transparent 70%)` }} />
              )}
              <p className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold mb-1 relative z-10">{label}</p>
              <div className={`font-black text-base tabular-nums relative z-10 flex items-center gap-1 ${isPos ? "text-green-400" : netPnl < 0 ? "text-red-400" : "text-white"}`}>
                {isPos && netPnl > 0 ? <TrendingUp size={10} /> : netPnl < 0 ? <TrendingDown size={10} /> : null}
                {isPos && netPnl > 0 ? "+" : ""}{netPnl.toFixed(2)}
              </div>
              <div className="relative z-10 mt-0.5 space-y-0.5">
                <p className="text-[8px] text-muted-foreground">{trades} trades</p>
                {wr !== null && <p className="text-[8px] font-bold text-green-400/70">{wr}% WR</p>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* P&L chart */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Cumulative P&L</p>
          <p className="text-[8px] text-muted-foreground/50 font-mono">30 days</p>
        </div>
        <PnlSparkline points={chart?.points ?? []} />
      </div>

      {/* Volume stat */}
      <div className="flex gap-2">
        <StatCard label="Volume" value={(at?.volume ?? 0).toFixed(2)} sub="total staked" />
        <StatCard label="Wins"   value={at?.wins ?? 0}   sub={`${at?.winRate ?? 0}% rate`} />
        <StatCard label="Losses" value={at?.losses ?? 0} sub="positions" />
      </div>

      {at?.totalTrades === 0 && (
        <div className="text-center py-6">
          <TrendingUp size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No trades yet</p>
          <Link href="/">
            <Button size="sm" className="mt-3">Start Trading</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function TradesTab() {
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");
  const { data: tradeData } = useGetTradingPositions({
    query: { queryKey: getGetTradingPositionsQueryKey(), refetchInterval: 15_000 },
  });
  const positions = tradeData?.positions ?? [];
  const filtered = filter === "all" ? positions : positions.filter((p) => p.outcome === filter);

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["all", "win", "loss"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold capitalize transition-colors ${
              filter === f ? "bg-card text-white shadow" : "text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No {filter === "all" ? "" : filter} trades yet</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.slice(0, 50).map((p) => {
            const ccy     = p.currency ?? "TON";
            const pnl     = p.outcome === "win"
              ? parseFloat(String(p.winAmount)) - parseFloat(String(p.stakeStriker))
              : p.outcome === "cancelled" ? 0 : -parseFloat(String(p.stakeStriker));
            const ccyLabel = ccy === "STRIKER" ? "STRK" : ccy;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2">
                <div className="shrink-0">
                  {p.outcome === "win" ? <CheckCircle size={13} className="text-green-400" />
                  : p.outcome === "cancelled" ? <MinusCircle size={13} className="text-yellow-400" />
                  : <XCircle size={13} className="text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">
                    {p.assetSymbol}{" "}
                    <span className={["UP","EVEN","OVER","IN"].includes(p.direction) ? "text-green-400" : "text-red-400"}>
                      {p.direction}
                    </span>
                    {" "}<span className="text-muted-foreground font-normal text-[10px]">{(p.contractType ?? "UP_DOWN").replace("_","/")} · {p.currency ?? "TON"}</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground font-mono">
                    {new Date(p.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black tabular-nums ${pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-yellow-400"}`}>
                    {pnl > 0 ? `+${pnl.toFixed(2)}` : pnl === 0 ? "±0" : pnl.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">{ccyLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeaderboardTab() {
  const [period, setPeriod] = useState<"week" | "month" | "alltime">("week");
  const { data } = useGetTradingLeaderboard({ period }, { query: { refetchInterval: 60_000 } });
  const entries = data?.entries ?? [];
  const { player } = useAuth();
  const myId = (player as Record<string, unknown>)?.id as number | undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["week", "month", "alltime"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-bold capitalize transition-colors ${period === p ? "bg-card text-white shadow" : "text-muted-foreground"}`}
          >
            {p === "alltime" ? "All Time" : p === "week" ? "7 Days" : "30 Days"}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No data yet for this period</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.slice(0, 50).map((e) => {
            const isMe = e.playerId === myId;
            return (
              <div
                key={e.playerId}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${isMe ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}
              >
                <span className="text-xs font-black text-muted-foreground w-5 text-center">{e.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{e.username} {isMe && <span className="text-primary text-[10px]">(you)</span>}</p>
                  <p className="text-[9px] text-muted-foreground">{e.totalTrades} trades · {e.winRate}% win</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black tabular-nums ${e.netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {e.netPnl >= 0 ? "+" : ""}{e.netPnl.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">P&L</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AchievementsTab() {
  const { data }  = useGetMyAchievements();
  const { data: streak } = useGetMyStreak();
  const claimStreak = useClaimStreakReward();
  const { toast } = useToast();

  const canClaim = streak?.canClaim ?? false;

  async function handleClaim() {
    try {
      await claimStreak.mutateAsync(undefined);
      toast({ title: "Streak reward claimed!" });
    } catch {
      toast({ title: "Could not claim reward", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Daily streak */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame size={14} className="text-orange-400" />
            <span className="text-sm font-bold">Daily Streak</span>
          </div>
          <span className="font-black text-orange-400">{streak?.streakDays ?? 0} days</span>
        </div>
        {canClaim && (
          <Button size="sm" className="w-full" onClick={handleClaim} disabled={claimStreak.isPending}>
            Claim Daily Reward
          </Button>
        )}
        {!canClaim && (
          <p className="text-[10px] text-muted-foreground">Come back tomorrow to claim your streak reward</p>
        )}
      </div>

      {/* Achievements */}
      <div className="flex flex-col gap-1.5">
        {(data?.achievements ?? []).map((a) => (
          <div key={a.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
            a.unlocked ? "border-border bg-card" : "border-border/40 bg-card/40 opacity-60"
          }`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: `${RARITY_COLORS[a.rarity] ?? "#6b7280"}20`, color: RARITY_COLORS[a.rarity] ?? "#6b7280" }}>
              {a.unlocked ? <Trophy size={14} /> : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold">{a.title}</p>
              <p className="text-[9px] text-muted-foreground truncate">{a.description}</p>
            </div>
            {a.unlocked && <CheckCircle size={12} className="text-green-400 shrink-0" />}
          </div>
        ))}
        {(data?.achievements ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No achievements yet — start trading!</div>
        )}
      </div>
    </div>
  );
}

const TABS = ["Overview", "Trades", "Leaderboard", "Achievements"] as const;

export function Portfolio() {
  const [tab, setTab] = useState<typeof TABS[number]>("Overview");
  const { player } = useAuth();

  return (
    <Layout>
      <div className="flex flex-col pb-6">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <PieChart size={18} className="text-primary" />
            <h1 className="font-black text-lg tracking-tight">Portfolio</h1>
          </div>
          {!player && (
            <p className="text-xs text-muted-foreground">Open in Telegram to see your portfolio</p>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 px-4 mb-4 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
                tab === t ? "border-primary text-white" : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {tab === "Overview"      && <OverviewTab />}
              {tab === "Trades"        && <TradesTab />}
              {tab === "Leaderboard"   && <LeaderboardTab />}
              {tab === "Achievements"  && <AchievementsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  );
}
