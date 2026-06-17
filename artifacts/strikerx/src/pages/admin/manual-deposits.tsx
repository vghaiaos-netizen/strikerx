import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Smartphone, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface ManualDeposit {
  id: number; playerId: number; username: string; telegramId: string;
  method: string; phoneNumber?: string; amountKes?: number; reference: string;
  note?: string; status: string; amountStriker?: number; confirmedBy?: string;
  confirmedAt?: string; rejectReason?: string; createdAt: string;
}
interface DepositList { deposits: ManualDeposit[]; total: number; limit: number; offset: number; }

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
  confirmed: "bg-green-900/40 text-green-300 border-green-700",
  rejected: "bg-red-900/40 text-red-300 border-red-700",
};

const METHOD_ICON: Record<string, typeof Smartphone> = { mpesa: Smartphone, bank: FileText };

export function AdminManualDeposits() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmStriker, setConfirmStriker] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const limit = 25;

  const { data, isLoading, refetch } = useQuery<DepositList>({
    queryKey: ["/admin/manual-deposits", statusFilter, offset],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch(`/api/admin/manual-deposits?status=${statusFilter}&limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 10_000,
  });

  const confirm = useMutation({
    mutationFn: async ({ id, amountStriker }: { id: number; amountStriker: number }) => {
      const r = await fetch(`/api/admin/manual-deposits/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountStriker }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_, { amountStriker }) => {
      toast({ title: `Deposit confirmed — ${amountStriker.toLocaleString()} STRIKER credited` });
      setConfirmId(null); setConfirmStriker("");
      refetch(); qc.invalidateQueries({ queryKey: ["/admin/manual-deposits"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await fetch(`/api/admin/manual-deposits/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Deposit rejected" });
      setRejectId(null); setRejectReason("");
      refetch();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const STATUS_TABS = [
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">MANUAL DEPOSITS</h1>
          <p className="text-muted-foreground text-sm mt-1">M-Pesa & manual payment confirmations</p>
        </div>
        <div className="flex items-center gap-3">
          {statusFilter === "pending" && (data?.total ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-950/50 border border-yellow-800 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-mono text-sm font-bold">{data?.total} pending</span>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} className="font-mono text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map(t => (
          <Button key={t.key} size="sm" variant={statusFilter === t.key ? "default" : "outline"}
            onClick={() => { setStatusFilter(t.key); setOffset(0); }} className="font-mono text-xs">
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {!isLoading && data?.deposits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CheckCircle className="w-12 h-12 mb-4 opacity-20" />
          <p className="font-mono">No {statusFilter === "all" ? "" : statusFilter} deposits</p>
        </div>
      )}

      <div className="space-y-3">
        <AnimatePresence>
          {data?.deposits.map((d, i) => {
            const MethodIcon = METHOD_ICON[d.method] ?? FileText;
            const isConfirming = confirmId === d.id;
            const isRejecting = rejectId === d.id;
            const kesStrikerEstimate = d.amountKes ? Math.floor(d.amountKes / 1.3) : 0;

            return (
              <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d.method === "mpesa" ? "bg-green-950/50 border border-green-800" : "bg-blue-950/50 border border-blue-800"}`}>
                        <MethodIcon className={`w-5 h-5 ${d.method === "mpesa" ? "text-green-400" : "text-blue-400"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-foreground">@{d.username}</span>
                          <Badge variant="outline" className={`text-[10px] font-mono border ${STATUS_COLORS[d.status] ?? ""}`}>
                            {d.status}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{d.method}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="font-mono text-[11px] text-muted-foreground">#{d.playerId}</span>
                          {d.phoneNumber && <span className="font-mono text-[11px] text-muted-foreground">{d.phoneNumber}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-lg text-foreground">
                        {d.amountKes ? `KES ${d.amountKes.toLocaleString()}` : "—"}
                      </div>
                      {d.amountStriker && d.amountStriker > 0 ? (
                        <div className="text-xs font-mono text-green-400">+{d.amountStriker.toLocaleString()} SKR</div>
                      ) : (
                        <div className="text-xs font-mono text-muted-foreground">≈ {kesStrikerEstimate.toLocaleString()} SKR</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Reference</div>
                      <div className="font-mono text-sm font-bold text-primary tracking-widest">{d.reference}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Submitted</div>
                      <div className="font-mono text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</div>
                    </div>
                    {d.note && (
                      <div className="col-span-2">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Notes</div>
                        <div className="font-mono text-xs text-muted-foreground">{d.note}</div>
                      </div>
                    )}
                    {d.rejectReason && (
                      <div className="col-span-2">
                        <div className="text-[10px] font-mono text-red-400 uppercase tracking-wider mb-0.5">Reject Reason</div>
                        <div className="font-mono text-xs text-red-300">{d.rejectReason}</div>
                      </div>
                    )}
                    {d.confirmedBy && (
                      <div className="col-span-2 text-[10px] font-mono text-muted-foreground">
                        Processed by {d.confirmedBy} at {d.confirmedAt ? new Date(d.confirmedAt).toLocaleString() : "—"}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {d.status === "pending" && (
                    <div className="mt-3 pt-3 border-t border-border">
                      {!isConfirming && !isRejecting && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => { setConfirmId(d.id); setConfirmStriker(String(kesStrikerEstimate)); setRejectId(null); }}
                            className="flex-1 bg-green-700 hover:bg-green-600 text-white font-mono text-xs h-9">
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Confirm & Credit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setRejectId(d.id); setConfirmId(null); }}
                            className="flex-1 border-red-800 text-red-400 hover:bg-red-950 font-mono text-xs h-9">
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />Reject
                          </Button>
                        </div>
                      )}

                      <AnimatePresence>
                        {isConfirming && (
                          <motion.div key="confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-mono text-green-400 mb-2">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Set STRIKER amount to credit (auto-calculated from KES)
                            </div>
                            <div className="flex gap-2">
                              <Input type="number" value={confirmStriker} onChange={e => setConfirmStriker(e.target.value)}
                                className="font-mono text-sm font-bold h-9 flex-1" placeholder="STRIKER to credit" />
                              <Button size="sm" onClick={() => confirm.mutate({ id: d.id, amountStriker: parseFloat(confirmStriker) })}
                                disabled={confirm.isPending || !confirmStriker}
                                className="bg-green-700 hover:bg-green-600 text-white font-mono text-xs h-9 px-4">
                                {confirm.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}
                                className="font-mono text-xs h-9 px-3">Cancel</Button>
                            </div>
                          </motion.div>
                        )}
                        {isRejecting && (
                          <motion.div key="reject" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            className="space-y-2">
                            <div className="flex gap-2">
                              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                className="font-mono text-sm h-9 flex-1" placeholder="Reason (optional)" />
                              <Button size="sm" onClick={() => reject.mutate({ id: d.id, reason: rejectReason })}
                                disabled={reject.isPending}
                                className="bg-red-800 hover:bg-red-700 text-white font-mono text-xs h-9 px-4">
                                {reject.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Reject"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejectId(null)}
                                className="font-mono text-xs h-9 px-3">Cancel</Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setOffset(o => Math.max(0, o - limit))} className="font-mono text-xs">
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />Prev
          </Button>
          <span className="font-mono text-sm text-muted-foreground">Page {currentPage} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setOffset(o => o + limit)} className="font-mono text-xs">
            Next<ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}
    </AdminLayout>
  );
}
