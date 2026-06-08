import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Plus, ToggleLeft, ToggleRight, Users, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Affiliate {
  id: number;
  code: string;
  name: string;
  commissionRate: number;
  totalEarned: number;
  totalReferred: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());

export function AdminAffiliates() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [notes, setNotes] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: affiliates = [], isLoading } = useQuery<Affiliate[]>({
    queryKey: ["admin-affiliates"],
    queryFn: () => API("/admin/affiliates", adminToken ?? ""),
    enabled: !!adminToken,
  });

  const createMutation = useMutation({
    mutationFn: () => API("/admin/affiliates", adminToken ?? "", {
      method: "POST",
      body: JSON.stringify({ code: code.toUpperCase(), name, commissionRate: parseFloat(commissionRate) / 100, notes: notes || undefined }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-affiliates"] });
      setShowForm(false); setCode(""); setName(""); setNotes("");
      toast({ title: "Affiliate code created" });
    },
    onError: (err: unknown) => toast({ title: "Failed to create", description: String(err), variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      API(`/admin/affiliates/${id}`, adminToken ?? "", { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-affiliates"] }),
  });

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(`https://t.me/StrykkerXBot/StrikerX?startapp=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const totalReferred = affiliates.reduce((s, a) => s + a.totalReferred, 0);
  const totalEarned = affiliates.reduce((s, a) => s + a.totalEarned, 0);
  const active = affiliates.filter(a => a.isActive).length;

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
              <Link2 className="w-6 h-6 text-primary" /> Affiliates
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage influencer and affiliate codes
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2 font-mono">
            <Plus className="w-4 h-4" /> New Code
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Codes", value: active, color: "text-green-400" },
            { label: "Total Referred", value: totalReferred, color: "text-primary" },
            { label: "Total Earned (STRIKER)", value: totalEarned.toLocaleString(), color: "text-yellow-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
              <div className={`font-mono font-black text-2xl ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
            <h2 className="font-mono font-semibold text-sm">Create Affiliate Code</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Code (uppercase)</label>
                <Input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                  placeholder="CREATOR123" className="font-mono" />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Name / Creator</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Creator" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Commission Rate (%)</label>
                <Input type="number" min="0" max="50" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className="font-mono" />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Notes (optional)</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instagram influencer..." className="font-mono" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !code || !name}
                className="gap-2 font-mono">
                <Plus className="w-4 h-4" /> Create
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} className="font-mono">Cancel</Button>
            </div>
          </div>
        )}

        {/* Affiliate List */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : affiliates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-border rounded-xl">
            No affiliate codes yet. Create your first one above.
          </div>
        ) : (
          <div className="space-y-2">
            {affiliates.map(affiliate => (
              <div key={affiliate.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-4 ${affiliate.isActive ? "border-border" : "border-border/50 opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{affiliate.code}</span>
                    <span className="text-muted-foreground text-sm">— {affiliate.name}</span>
                    {!affiliate.isActive && (
                      <span className="text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5">INACTIVE</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground font-mono">
                    <span><Users className="w-3 h-3 inline mr-1" />{affiliate.totalReferred} referred</span>
                    <span>{(affiliate.commissionRate * 100).toFixed(0)}% commission</span>
                    <span>{affiliate.totalEarned.toLocaleString()} STRIKER earned</span>
                    {affiliate.notes && <span className="text-white/40 italic">{affiliate.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(affiliate.code)}
                    className="h-8 w-8 p-0 border-white/10">
                    {copiedCode === affiliate.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: affiliate.id, isActive: !affiliate.isActive })}
                    className="h-8 px-2">
                    {affiliate.isActive
                      ? <ToggleRight className="w-4 h-4 text-green-400" />
                      : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
