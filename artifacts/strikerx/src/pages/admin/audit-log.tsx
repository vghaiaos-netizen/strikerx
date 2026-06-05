import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AuditEntry {
  id: number; action: string; targetPlayerId?: number; targetUsername?: string;
  value?: string; performedBy: string; createdAt: string;
}
interface AuditList { logs: AuditEntry[]; total: number; }

const ACTION_COLORS: Record<string, string> = {
  update_player: "bg-blue-900 text-blue-300",
  approve_withdrawal: "bg-green-900 text-green-300",
  reject_withdrawal: "bg-red-900 text-red-300",
  adjust_balance: "bg-purple-900 text-purple-300",
  update_config: "bg-yellow-900 text-yellow-300",
  bulk_config_update: "bg-yellow-900 text-yellow-300",
  broadcast: "bg-cyan-900 text-cyan-300",
  jackpot_seed: "bg-orange-900 text-orange-300",
  create_tournament: "bg-pink-900 text-pink-300",
  end_tournament: "bg-gray-700 text-gray-300",
  ban_player: "bg-red-900 text-red-300",
};

export function AdminAuditLog() {
  const { adminToken } = useAuth();
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const { data, isLoading } = useQuery<AuditList>({
    queryKey: ["/admin/audit-log", offset],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch(`/api/admin/audit-log?limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">AUDIT LOG</h1>
          <p className="text-muted-foreground text-sm mt-1">All admin actions — immutable record</p>
        </div>
        <span className="text-xs text-muted-foreground font-mono">{data?.total ?? "…"} total entries</span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Time", "Action", "Target Player", "Value", "Performed By"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              )) : data?.logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No audit entries yet</td></tr>
              ) : data?.logs.map(l => (
                <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleDateString()}<br />
                    <span className="text-muted-foreground/60">{new Date(l.createdAt).toLocaleTimeString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${ACTION_COLORS[l.action] ?? "bg-gray-700 text-gray-300"}`}>
                      {l.action.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {l.targetUsername ? (
                      <div>
                        <div className="font-medium">{l.targetUsername}</div>
                        <div className="text-xs text-muted-foreground">id:{l.targetPlayerId}</div>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                    <div className="truncate font-mono">{l.value ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{l.performedBy}</td>
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
