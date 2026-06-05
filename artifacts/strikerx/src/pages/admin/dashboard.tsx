import { AdminLayout } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Users, TrendingUp, AlertTriangle, Clock, Trophy, Gamepad2, BarChart3, ArrowLeftRight } from "lucide-react";

function useAdminFetch<T>(path: string, params?: Record<string, string>) {
  const { adminToken } = useAuth();
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return useQuery<T>({
    queryKey: [path, params],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

interface Overview {
  playersOnline: number; totalPlayers: number; newSignupsToday: number; newSignupsWeek: number;
  flaggedPlayers: number; bannedPlayers: number; pendingWithdrawals: number;
  todayVolumeTon: number; todayProfitTon: number; weekVolumeTon: number; weekProfitTon: number;
  jackpotAmount: number; jackpotStatus: string; totalGamesAllTime: number; activeTournaments: number;
}

interface Analytics {
  dailyRevenue: Array<{ date: string; revenue: number; volume: number; newPlayers: number; games: number }>;
  gameBreakdown: Record<string, { count: number; volume: number }>;
  vipDistribution: Record<string, number>;
  totalRevenue: number; totalVolume: number; playerGrowth: number;
}

const VIP_COLORS: Record<string, string> = {
  sunday_league: "#6b7280",
  championship: "#3b82f6",
  premier_league: "#8b5cf6",
  champions_league: "#f59e0b",
  world_cup: "#22c55e",
};

const VIP_LABELS: Record<string, string> = {
  sunday_league: "Sunday League",
  championship: "Championship",
  premier_league: "Premier League",
  champions_league: "Champions League",
  world_cup: "World Cup",
};

const GAME_LABELS: Record<string, string> = {
  shot: "The Shot", penalty: "Penalty", minefield: "Minefield", freekick: "Free Kick",
};

export function AdminDashboard() {
  const { data: overview, isLoading } = useAdminFetch<Overview>("/admin/overview");
  const { data: analytics } = useAdminFetch<Analytics>("/admin/analytics", { days: "14" });

  const pieData = analytics ? Object.entries(analytics.vipDistribution).filter(([, v]) => v > 0).map(([k, v]) => ({ name: VIP_LABELS[k] ?? k, value: v, color: VIP_COLORS[k] })) : [];
  const gamePieData = analytics ? Object.entries(analytics.gameBreakdown).filter(([, v]) => v.count > 0).map(([k, v]) => ({ name: GAME_LABELS[k] ?? k, value: v.count })) : [];
  const GAME_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">DASHBOARD</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time platform overview</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live — auto-refreshes every 30s
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 bg-card rounded-xl border border-border" />)}
        </div>
      ) : overview ? (
        <>
          {/* Primary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Users size={18} />} title="Total Players" value={overview.totalPlayers.toLocaleString()} sub={`+${overview.newSignupsToday} today · +${overview.newSignupsWeek} week`} color="blue" />
            <StatCard icon={<TrendingUp size={18} />} title="Today Volume" value={`${overview.todayVolumeTon.toFixed(3)} TON`} sub={`Profit: ${overview.todayProfitTon.toFixed(3)} TON`} color="green" />
            <StatCard icon={<BarChart3 size={18} />} title="Week Volume" value={`${overview.weekVolumeTon.toFixed(3)} TON`} sub={`Profit: ${overview.weekProfitTon.toFixed(3)} TON`} color="purple" />
            <StatCard icon={<Trophy size={18} />} title="Jackpot Pool" value={`${overview.jackpotAmount.toFixed(2)} TON`} sub={`Status: ${overview.jackpotStatus}`} color="gold" />
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<Gamepad2 size={18} />} title="Total Games" value={overview.totalGamesAllTime.toLocaleString()} sub="All time" color="blue" />
            <StatCard icon={<ArrowLeftRight size={18} />} title="Pending Withdrawals" value={overview.pendingWithdrawals.toString()} sub="Awaiting review" color={overview.pendingWithdrawals > 0 ? "red" : "green"} />
            <StatCard icon={<AlertTriangle size={18} />} title="Flagged Players" value={overview.flaggedPlayers.toString()} sub={`${overview.bannedPlayers} banned`} color={overview.flaggedPlayers > 0 ? "red" : "green"} />
            <StatCard icon={<Clock size={18} />} title="Online Now" value={`~${overview.playersOnline}`} sub={`${overview.activeTournaments} active tournament(s)`} color="green" />
          </div>
        </>
      ) : null}

      {/* Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider">14-Day Revenue & Volume (TON)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={analytics.dailyRevenue}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
                <Area type="monotone" dataKey="volume" name="Volume" stroke="#22c55e" fill="url(#volGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f59e0b" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider">VIP Distribution</h2>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /><span className="text-muted-foreground">{d.name}</span></div>
                      <span className="font-mono font-bold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="text-muted-foreground text-sm text-center mt-8">No players yet</div>}
          </div>
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider">Game Popularity</h2>
            {gamePieData.length > 0 ? (
              <div className="space-y-3">
                {gamePieData.map((d, i) => {
                  const total = gamePieData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? (d.value / total * 100).toFixed(1) : "0";
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-mono text-foreground">{d.value.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GAME_COLORS[i] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-muted-foreground text-sm">No games played yet</div>}
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider">Revenue Breakdown</h2>
            <div className="space-y-4">
              {[
                { label: "House Edge (4%)", value: analytics.totalRevenue, color: "#22c55e" },
                { label: "TON Spread (est.)", value: analytics.totalVolume * 0.01, color: "#3b82f6" },
                { label: "Tournament Rake", value: 0, color: "#8b5cf6" },
                { label: "Jackpot House Cut", value: 0, color: "#f59e0b" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: item.color }} />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">{item.value.toFixed(4)} TON</span>
                </div>
              ))}
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-mono font-bold text-sm">Total Revenue ({analytics.dailyRevenue.length}d)</span>
                <span className="font-mono font-bold text-primary">{(analytics.totalRevenue + analytics.totalVolume * 0.01).toFixed(4)} TON</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon, title, value, sub, color }: { icon: React.ReactNode; title: string; value: string; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400", green: "text-green-400", purple: "text-purple-400",
    gold: "text-yellow-400", red: "text-red-400",
  };
  return (
    <div className="bg-card border border-border p-5 rounded-xl flex flex-col gap-2 hover:border-primary/50 transition-colors">
      <div className="flex items-center gap-2">
        <div className={colorMap[color ?? "blue"]}>{icon}</div>
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{title}</span>
      </div>
      <span className={`text-2xl font-mono font-bold ${colorMap[color ?? "blue"]}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
