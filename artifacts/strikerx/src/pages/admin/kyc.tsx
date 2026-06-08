import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserCheck, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface KycEntry {
  id: number;
  playerId: number;
  username: string | null;
  status: string;
  fullName: string | null;
  country: string | null;
  docType: string | null;
  reviewNote: string | null;
  vipTier: string | null;
  tonWageredLifetime: number | null;
  createdAt: string | null;
}

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  verified: "bg-green-500/15 text-green-400 border-green-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function AdminKyc() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: entries = [], isLoading } = useQuery<KycEntry[]>({
    queryKey: ["admin-kyc"],
    queryFn: () => API("/admin/kyc", adminToken ?? ""),
    refetchInterval: 30_000,
    enabled: !!adminToken,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      API(`/admin/kyc/${id}/review`, adminToken ?? "", {
        method: "POST",
        body: JSON.stringify({ action, reviewNote }),
      }),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setExpandedId(null);
      setReviewNote("");
      toast({ title: action === "approve" ? "KYC approved" : "KYC rejected" });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  const pending = entries.filter(e => e.status === "pending");
  const reviewed = entries.filter(e => e.status !== "pending");

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-primary" /> KYC Queue
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review identity verification submissions
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending", value: entries.filter(e => e.status === "pending").length, color: "text-yellow-400" },
            { label: "Verified", value: entries.filter(e => e.status === "verified").length, color: "text-green-400" },
            { label: "Rejected", value: entries.filter(e => e.status === "rejected").length, color: "text-red-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
              <div className={`font-mono font-black text-2xl ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Pending Queue */}
        <div>
          <h2 className="font-mono font-semibold text-sm mb-3 text-yellow-400">
            Pending Review ({pending.length})
          </h2>
          {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
          {!isLoading && pending.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm bg-card border border-border rounded-xl">
              No pending KYC submissions
            </div>
          )}
          <div className="space-y-2">
            {pending.map(entry => (
              <div key={entry.id} className="bg-card border border-yellow-500/20 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex-1 text-left">
                    <div className="font-mono font-semibold text-sm">@{entry.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.fullName} · {entry.country} · {entry.docType?.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}
                  </div>
                  {expandedId === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {expandedId === entry.id && (
                  <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">VIP Tier:</span> <span className="font-mono">{entry.vipTier}</span></div>
                      <div><span className="text-muted-foreground">TON Wagered:</span> <span className="font-mono">{(entry.tonWageredLifetime ?? 0).toFixed(2)} TON</span></div>
                      <div><span className="text-muted-foreground">Player ID:</span> <span className="font-mono">{entry.playerId}</span></div>
                      <div><span className="text-muted-foreground">Doc Type:</span> <span className="font-mono">{entry.docType}</span></div>
                    </div>
                    <div>
                      <label className="text-xs font-mono text-muted-foreground block mb-1">Review Note (optional)</label>
                      <Input value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                        placeholder="Reason for rejection, or leave blank for approval" className="font-mono text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewMutation.mutate({ id: entry.id, action: "approve" })}
                        disabled={reviewMutation.isPending}
                        className="flex-1 gap-1.5 bg-green-500 hover:bg-green-600 text-black font-mono">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button size="sm" onClick={() => reviewMutation.mutate({ id: entry.id, action: "reject" })}
                        disabled={reviewMutation.isPending}
                        variant="destructive" className="flex-1 gap-1.5 font-mono">
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Reviewed */}
        {reviewed.length > 0 && (
          <div>
            <h2 className="font-mono font-semibold text-sm mb-3 text-muted-foreground">
              Recently Reviewed
            </h2>
            <div className="space-y-1.5">
              {reviewed.slice(0, 20).map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm">@{entry.username}</span>
                    <span className="text-xs text-muted-foreground ml-2">{entry.fullName}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[entry.status] ?? ""}`}>
                    {entry.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
