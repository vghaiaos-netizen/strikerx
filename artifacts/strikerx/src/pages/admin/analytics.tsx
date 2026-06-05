import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";

interface Analytics {
  days: number;
  dailyRevenue: Array<{ date: string; revenue: number; volume: number; newPlayers: number; games: number }>;
  totalRevenue: number; totalVolume: number; playerGrowth: number;
  gameBreakdown: Record<string, { count: number; volume: number }>;
  vipDistribution: Record<string, number>;
  topPlayers: Array<{ id: number; username: string; tonWageredLifetime: number; vipTier: string }>;
  revenueBreakdown: { houseEdge: number; spread: number; jackpotHouseCut: number; tournamentRake: number };
}

const GAME_LABELS: Record<string, string> = { shot: "The Shot", penalty: "Penalty", minefield: "Minefield", freekick: "Free Kick" };
const GAME_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];
const VIP_COLORS: Record<string, string> = {
  sunday_league: "#6b7280", championship: "#3b82f6", premier_league: "#8b5cf6",
  champions_league: "#f59e0b", world_cup: "#22c55e",
};
const VIP_LABELS: Record<string, string> = {
  sunday_league: "Sunday League", championship: "Championship", premier_league: "Premier League",
  champions_league: "Champions League", world_cup: "World Cup",
};

export function AdminAnalytics() {
  const { adminToken } = useAuth();
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/admin/analytics", days],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch(`/api/admin/analytics?days=${days}`, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const pieData = data ? Object.entries(data.vipDistribution).filter(([, v]) => v > 0).map(([k, v]) => ({ name: VIP_LABELS[k] ?? k, value: v, color: VIP_COLORS[k] })) : [];
  const gamePieData = data ? Object.entries(data.gameBreakdown).map(([k, v]) => ({ name: GAME_LABELS[k] ?? k, count: v.count, volume: parseFloat(v.volume.toFixed(4)) })) : [];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">ANALYTICS</h1>
          <p className="text-muted-foreground text-sm mt-1">Revenue, volume, and player metrics</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map(d => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)} className="font-mono text-xs">{d}d</Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse mb-6">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-card rounded-xl border border-border" />)}
        </div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: `${days}d Revenue`, value: `${data.totalRevenue.toFixed(4)} TON`, color: "text-yellow-400" },
              { label: `${days}d Volume`, value: `${data.totalVolume.toFixed(4)} TON`, color: "text-green-400" },
              { label: "New Players", value: data.playerGrowth.toLocaleString(), color: "text-blue-400" },
              { label: "Total Games", value: data.dailyRevenue.reduce((s, d) => s + d.games, 0).toLocaleString(), color: "text-purple-400" },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border p-5 rounded-xl">
                <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">{k.label}</div>
                <div className={`text-2xl font-mono font-bold ${k.color}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Revenue & Volume Chart */}
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Revenue & Volume (TON) — {days} days</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.dailyRevenue}>
                <defs>
                  <linearGradient id="aVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Area type="monotone" dataKey="volume" name="Volume (TON)" stroke="#22c55e" fill="url(#aVol)" strokeWidth={2} />
                <Area type="monotone" dataKey="revenue" name="Revenue (TON)" stroke="#f59e0b" fill="url(#aRev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Player & Games Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">New Players per Day</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="newPlayers" name="New Players" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Games Played per Day</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="games" name="Games" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Game Breakdown & VIP Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
              <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Game Breakdown ({days}d)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gamePieData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" stroke="#6b7280" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" name="Games Played" radius={[0, 4, 4, 0]}>
                    {gamePieData.map((_, i) => <Cell key={i} fill={GAME_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">VIP Distribution</h2>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1.5">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /><span className="text-muted-foreground">{d.name}</span></div>
                        <span className="font-mono font-bold">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div className="text-muted-foreground text-sm text-center mt-10">No players yet</div>}
            </div>
          </div>

          {/* Top Players Table */}
          {data.topPlayers.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground">Top 10 Players by Volume</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Rank", "Username", "TON Wagered Lifetime", "VIP Tier"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.topPlayers.map((p, i) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-6 py-3 font-mono font-bold text-primary">#{i + 1}</td>
                      <td className="px-6 py-3 font-mono font-medium">{p.username}</td>
                      <td className="px-6 py-3 font-mono text-green-400">{p.tonWageredLifetime.toFixed(4)} TON</td>
                      <td className="px-6 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded-full font-mono" style={{ background: VIP_COLORS[p.vipTier] + "33", color: VIP_COLORS[p.vipTier] }}>{VIP_LABELS[p.vipTier] ?? p.vipTier}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </AdminLayout>
  );
}
