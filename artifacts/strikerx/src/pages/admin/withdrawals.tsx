import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VIP_COLORS: Record<string, string> = {
  sunday_league: "bg-gray-700 text-gray-300", championship: "bg-blue-900 text-blue-300",
  premier_league: "bg-purple-900 text-purple-300", champions_league: "bg-yellow-900 text-yellow-300",
  world_cup: "bg-green-900 text-green-300",
};

interface Withdrawal {
  id: number; playerId: number; username: string; vipTier: string;
  amountStriker: number; amountTon: number; destinationAddress: string;
  currency: string; status: string; reviewedBy?: string; createdAt: string;
}

interface WithdrawalList { withdrawals: Withdrawal[]; total: number; limit: number; offset: number; }

export function AdminWithdrawals() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("under_review");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const { data, isLoading, refetch } = useQuery<WithdrawalList>({
    queryKey: ["/admin/withdrawals", statusFilter, offset],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch(`/api/admin/withdrawals?status=${statusFilter}&limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const action = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const r = await fetch(`/api/admin/withdrawals/${id}/${action}`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_, vars) => { toast({ title: vars.action === "approve" ? "Withdrawal approved" : "Withdrawal rejected and balance refunded" }); refetch(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const statusTabs = [
    { key: "under_review", label: "Pending Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">WITHDRAWALS</h1>
          <p className="text-muted-foreground text-sm mt-1">{data?.total ?? "…"} entries</p>
        </div>
        {statusFilter === "under_review" && (data?.total ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border border-red-800 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-red-400 font-mono text-sm font-bold">{data?.total} pending</span>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6">
        {statusTabs.map(t => (
          <Button key={t.key} size="sm" variant={statusFilter === t.key ? "default" : "outline"} onClick={() => { setStatusFilter(t.key); setOffset(0); }} className="font-mono text-xs">
            {t.label}
          </Button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["ID", "Player", "Amount (STRIKER)", "Amount (TON)", "Destination", "Status", "Date", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              )) : data?.withdrawals.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No withdrawals found</td></tr>
              ) : data?.withdrawals.map(w => (
                <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{w.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium">{w.username}</div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${VIP_COLORS[w.vipTier] ?? "bg-gray-700 text-gray-300"}`}>{w.vipTier.replace("_", " ")}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-yellow-400">{w.amountStriker.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-green-400 font-bold">{w.amountTon.toFixed(4)} TON</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono max-w-32 truncate">{w.destinationAddress}</code>
                      <button onClick={() => navigator.clipboard.writeText(w.destinationAddress)} className="text-muted-foreground hover:text-foreground" title="Copy address">
                        <ExternalLink size={12} />
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground">{w.currency}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "outline"}
                      className={`text-xs font-mono ${w.status === "approved" ? "bg-green-900 text-green-300 hover:bg-green-900" : w.status === "under_review" ? "border-yellow-700 text-yellow-400" : ""}`}>
                      {w.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    {w.reviewedBy && <div className="text-xs text-muted-foreground mt-0.5">by {w.reviewedBy}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(w.createdAt).toLocaleDateString()}<br />
                    <span className="text-muted-foreground/60">{new Date(w.createdAt).toLocaleTimeString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    {w.status === "under_review" ? (
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 bg-green-700 hover:bg-green-600 text-white gap-1" onClick={() => action.mutate({ id: w.id, action: "approve" })} disabled={action.isPending}>
                          <CheckCircle size={13} /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 gap-1" onClick={() => action.mutate({ id: w.id, action: "reject" })} disabled={action.isPending}>
                          <XCircle size={13} /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{w.reviewedBy ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={14} /></Button>
          <Button size="sm" variant="outline" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(offset + limit)}><ChevronRight size={14} /></Button>
        </div>
      </div>
    </AdminLayout>
  );
}
