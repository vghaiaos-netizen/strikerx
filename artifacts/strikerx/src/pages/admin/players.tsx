import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Ban, Flag, ChevronLeft, ChevronRight, Edit, Plus, Minus, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function useAdminFetch<T>(path: string, params?: Record<string, string>, enabled = true) {
  const { adminToken } = useAuth();
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return useQuery<T>({
    queryKey: [path, params],
    enabled: !!adminToken && enabled,
    queryFn: async () => {
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
}

const VIP_LABELS: Record<string, string> = {
  sunday_league: "Sunday League", championship: "Championship",
  premier_league: "Premier League", champions_league: "Champions League", world_cup: "World Cup",
};
const VIP_COLORS: Record<string, string> = {
  sunday_league: "bg-gray-700 text-gray-300", championship: "bg-blue-900 text-blue-300",
  premier_league: "bg-purple-900 text-purple-300", champions_league: "bg-yellow-900 text-yellow-300",
  world_cup: "bg-green-900 text-green-300",
};

interface Player {
  id: number; telegramId: string; username: string; firstName?: string; lastName?: string;
  strikerBalance: number; bootBalance: number; captainBalance: number;
  vipTier: string; tonWageredLifetime: number; strikerWageredSinceBonus?: number; streakDays: number;
  isBanned: boolean; isFlagged: boolean; banReason?: string;
  totalGames: number; totalDepositedStriker: number; totalWithdrawnStriker: number;
  referralCode: string; referredBy?: string; lastActive?: string; createdAt: string;
  recentGames?: any[]; recentTransactions?: any[];
}

interface PlayerList {
  players: Player[]; total: number; limit: number; offset: number;
}

export function AdminPlayers() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [filterBanned, setFilterBanned] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustCurrency, setAdjustCurrency] = useState<"striker" | "boot" | "captain">("striker");
  const [adjustReason, setAdjustReason] = useState("");
  const limit = 25;

  const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
  if (search) params.search = search;
  if (filterFlagged) params.flagged = "true";
  if (filterBanned) params.banned = "true";

  const { data, isLoading, refetch } = useAdminFetch<PlayerList>("/admin/players", params);

  const { data: detail, isLoading: detailLoading } = useAdminFetch<Player>(
    `/admin/players/${selectedPlayer?.id}`,
    undefined,
    !!selectedPlayer && detailOpen
  );

  const patchPlayer = useMutation({
    mutationFn: async (update: Partial<Player> & { id: number }) => {
      const { id, ...body } = update;
      const r = await fetch(`/api/admin/players/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { toast({ title: "Player updated" }); refetch(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const adjustBalance = useMutation({
    mutationFn: async ({ id, delta, currency, reason }: { id: number; delta: number; currency: string; reason: string }) => {
      const r = await fetch(`/api/admin/players/${id}/adjust-balance`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ delta, currency, reason }) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (d) => { toast({ title: `Balance adjusted: ${d.previousBalance} → ${d.newBalance}` }); refetch(); setAdjustOpen(false); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); setOffset(0); };
  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">PLAYERS</h1>
          <p className="text-muted-foreground text-sm mt-1">{data?.total?.toLocaleString() ?? "…"} total players</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-64">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search username…" value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9 bg-background border-border font-mono text-sm" />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <Button size="sm" variant={filterFlagged ? "default" : "outline"} onClick={() => { setFilterFlagged(!filterFlagged); setFilterBanned(false); setOffset(0); }}>
          <Flag size={14} className="mr-1" /> Flagged
        </Button>
        <Button size="sm" variant={filterBanned ? "destructive" : "outline"} onClick={() => { setFilterBanned(!filterBanned); setFilterFlagged(false); setOffset(0); }}>
          <Ban size={14} className="mr-1" /> Banned
        </Button>
        {(search || filterFlagged || filterBanned) && (
          <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); setFilterFlagged(false); setFilterBanned(false); setOffset(0); }}>Clear</Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["ID", "Username", "STRIKER", "VIP", "Wagered (TON)", "Games", "Status", "Joined", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              )) : data?.players.map(p => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium text-foreground">{p.username}</div>
                    <div className="text-xs text-muted-foreground">@{p.telegramId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-green-400">{p.strikerBalance.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${VIP_COLORS[p.vipTier]}`}>{VIP_LABELS[p.vipTier] ?? p.vipTier}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.tonWageredLifetime.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.totalGames}</td>
                  <td className="px-4 py-3">
                    {p.isBanned && <Badge variant="destructive" className="text-xs mr-1">BANNED</Badge>}
                    {p.isFlagged && <Badge className="text-xs bg-yellow-900 text-yellow-300 hover:bg-yellow-900 mr-1">FLAGGED</Badge>}
                    {!p.isBanned && !p.isFlagged && <Badge variant="outline" className="text-xs text-green-400 border-green-800">OK</Badge>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setSelectedPlayer(p); setDetailOpen(true); }}>
                        <Eye size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setSelectedPlayer(p); setAdjustOpen(true); }}>
                        <Edit size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${p.isBanned ? "text-green-400" : "text-red-400"}`}
                        onClick={() => patchPlayer.mutate({ id: p.id, isBanned: !p.isBanned, banReason: p.isBanned ? "" : "Banned by admin" })}>
                        <Ban size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${p.isFlagged ? "text-foreground" : "text-yellow-400"}`}
                        onClick={() => patchPlayer.mutate({ id: p.id, isFlagged: !p.isFlagged })}>
                        <Flag size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">Page {currentPage} of {totalPages} · {data?.total ?? 0} players</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="outline" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(offset + limit)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* Player Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary">{detail?.username ?? selectedPlayer?.username}</DialogTitle>
          </DialogHeader>
          {detailLoading ? <div className="animate-pulse space-y-3"><div className="h-20 bg-muted rounded" /><div className="h-20 bg-muted rounded" /></div> : detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "STRIKER", value: detail.strikerBalance.toLocaleString(), color: "text-green-400" },
                  { label: "BOOT", value: detail.bootBalance.toLocaleString(), color: "text-blue-400" },
                  { label: "CAPTAIN", value: detail.captainBalance.toLocaleString(), color: "text-yellow-400" },
                ].map(b => (
                  <div key={b.label} className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className={`text-xl font-mono font-bold ${b.color}`}>{b.value}</div>
                    <div className="text-xs text-muted-foreground">{b.label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Telegram ID", detail.telegramId], ["VIP Tier", VIP_LABELS[detail.vipTier] ?? detail.vipTier],
                  ["TON Wagered", `${detail.tonWageredLifetime.toFixed(4)} TON`], ["Streak Days", String(detail.streakDays)],
                  ["Total Games", String(detail.totalGames)], ["Referral Code", detail.referralCode],
                  ["Referred By", detail.referredBy ?? "—"], ["Last Active", detail.lastActive ? new Date(detail.lastActive).toLocaleString() : "—"],
                  ["Joined", new Date(detail.createdAt).toLocaleString()], ["Wager Since Bonus", `${detail.strikerWageredSinceBonus?.toFixed(0) ?? 0} STRK`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-muted/20 rounded p-2">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="font-mono font-medium text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {detail.recentGames && detail.recentGames.length > 0 && (
                <div>
                  <div className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Games</div>
                  <div className="space-y-1">
                    {detail.recentGames.slice(0, 5).map(g => (
                      <div key={g.id} className="flex justify-between text-xs bg-muted/20 rounded px-3 py-1.5">
                        <span className="text-muted-foreground uppercase">{g.gameType}</span>
                        <span className="font-mono">Bet: {g.betStriker}</span>
                        <span className={`font-mono ${g.winAmount > g.betStriker ? "text-green-400" : "text-red-400"}`}>
                          {g.winAmount > g.betStriker ? `+${(g.winAmount - g.betStriker).toFixed(0)}` : `-${(g.betStriker - g.winAmount).toFixed(0)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant={detail.isBanned ? "outline" : "destructive"} onClick={() => patchPlayer.mutate({ id: detail.id, isBanned: !detail.isBanned })}>
                  {detail.isBanned ? "Unban" : "Ban Player"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => patchPlayer.mutate({ id: detail.id, isFlagged: !detail.isFlagged })}>
                  {detail.isFlagged ? "Unflag" : "Flag Player"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setDetailOpen(false); setAdjustOpen(true); }}>
                  Adjust Balance
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary">Adjust Balance — {selectedPlayer?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Currency</label>
              <div className="flex gap-2">
                {(["striker", "boot", "captain"] as const).map(c => (
                  <Button key={c} size="sm" variant={adjustCurrency === c ? "default" : "outline"} onClick={() => setAdjustCurrency(c)} className="flex-1 font-mono uppercase text-xs">{c}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Amount (negative to deduct)</label>
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" className="w-8 h-8 p-0 text-red-400" onClick={() => setAdjustDelta(d => String((parseFloat(d || "0") - 100)))}><Minus size={14} /></Button>
                <Input value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} placeholder="e.g. 500 or -200" className="bg-background border-border font-mono text-center" />
                <Button size="sm" variant="outline" className="w-8 h-8 p-0 text-green-400" onClick={() => setAdjustDelta(d => String((parseFloat(d || "0") + 100)))}><Plus size={14} /></Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Reason (for audit log)</label>
              <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Bonus credit, compensation" className="bg-background border-border font-mono" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => selectedPlayer && adjustBalance.mutate({ id: selectedPlayer.id, delta: parseFloat(adjustDelta) || 0, currency: adjustCurrency, reason: adjustReason })} disabled={!adjustDelta || adjustBalance.isPending}>
                {adjustBalance.isPending ? "Applying…" : "Apply Adjustment"}
              </Button>
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
