import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { TrendingUp, TrendingDown, CheckCircle, XCircle, MinusCircle } from "lucide-react";

interface TradingPosition {
  id: number;
  playerId: number;
  assetSymbol: string;
  direction: string;
  stakeStriker: number;
  entryPrice: number;
  exitPrice: number | null;
  payoutRatio: number;
  winAmount: number;
  outcome: string;
  contractDurationSecs: number;
  expiresAt: string;
  settledAt: string | null;
  createdAt: string;
}

interface TradingStats {
  totalPositions: number;
  totalVolume: number;
  totalWinAmount: number;
  houseProfit: number;
  winRate: number;
  openPositions: number;
}

export function AdminTrading() {
  const { adminToken } = useAuth();
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");

  const headers = { Authorization: `Bearer ${adminToken}` };

  const { data: positionsData, isLoading } = useQuery<{ positions: TradingPosition[] }>({
    queryKey: ["admin-trading-positions", assetFilter, outcomeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (assetFilter !== "ALL") params.set("asset", assetFilter);
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      const res = await fetch(`/api/admin/trading/positions?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const { data: statsData } = useQuery<TradingStats>({
    queryKey: ["admin-trading-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/trading/stats", { headers });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const positions = positionsData?.positions ?? [];
  const stats = statsData;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Binary Trading</h1>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Total Positions", value: stats.totalPositions.toLocaleString() },
              { label: "Open", value: stats.openPositions.toLocaleString() },
              { label: "Volume (STRK)", value: Math.round(stats.totalVolume).toLocaleString() },
              { label: "Paid Out (STRK)", value: Math.round(stats.totalWinAmount).toLocaleString() },
              { label: "House Profit (STRK)", value: Math.round(stats.houseProfit).toLocaleString(), highlight: true },
              { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%` },
            ].map(({ label, value, highlight }) => (
              <div key={label} className={`rounded-lg border p-3 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex gap-1">
            {["ALL","BTC","ETH","SOL","BNB","TON"].map((a) => (
              <button
                key={a}
                onClick={() => setAssetFilter(a)}
                className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                  assetFilter === a ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-white/30"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {["ALL","pending","win","loss","cancelled"].map((o) => (
              <button
                key={o}
                onClick={() => setOutcomeFilter(o)}
                className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                  outcomeFilter === o ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-white/30"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {/* Positions table */}
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Player</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Direction</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">Stake</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">Entry</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">Exit</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Outcome</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">P&amp;L</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              ) : positions.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No positions found</td></tr>
              ) : positions.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">#{p.id}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.playerId}</td>
                  <td className="px-4 py-2.5 font-bold">{p.assetSymbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={`flex items-center gap-1 text-xs font-bold ${p.direction === "UP" ? "text-green-400" : "text-red-400"}`}>
                      {p.direction === "UP" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {p.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{p.stakeStriker.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">${p.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {p.exitPrice ? `$${p.exitPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.outcome === "win" ? (
                      <span className="flex items-center gap-1 text-green-400 text-xs font-bold"><CheckCircle size={12} /> WIN</span>
                    ) : p.outcome === "loss" ? (
                      <span className="flex items-center gap-1 text-red-400 text-xs font-bold"><XCircle size={12} /> LOSS</span>
                    ) : p.outcome === "cancelled" ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs font-bold"><MinusCircle size={12} /> CANCELLED</span>
                    ) : (
                      <span className="text-xs font-bold text-yellow-400">OPEN</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {p.outcome === "win" ? (
                      <span className="text-green-400">+{p.winAmount.toLocaleString()}</span>
                    ) : p.outcome === "loss" ? (
                      <span className="text-red-400">-{p.stakeStriker.toLocaleString()}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {p.contractDurationSecs >= 60 ? `${p.contractDurationSecs / 60}m` : `${p.contractDurationSecs}s`}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
