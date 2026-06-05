import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trophy, StopCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Tournament {
  id: number; type: string; prizePoolTon: number; status: string;
  startTime: string; endTime: string; entryFeeBoots?: number;
}

const TYPE_LABELS: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", flash: "Flash", special: "Special Event",
};

export function AdminTournaments() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ type: "daily", prizePoolTon: "10", durationHours: "24", entryFeeBoots: "" });

  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ["/admin/tournaments"],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch("/api/admin/tournaments", { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          type: form.type,
          prizePoolTon: parseFloat(form.prizePoolTon),
          durationHours: parseInt(form.durationHours),
          entryFeeBoots: form.entryFeeBoots ? parseInt(form.entryFeeBoots) : undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Tournament created" });
      queryClient.invalidateQueries({ queryKey: ["/admin/tournaments"] });
      setCreateOpen(false);
      setForm({ type: "daily", prizePoolTon: "10", durationHours: "24", entryFeeBoots: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const endTournament = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/tournaments/${id}/end`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Tournament ended" });
      queryClient.invalidateQueries({ queryKey: ["/admin/tournaments"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const active = tournaments?.filter(t => t.status === "active") ?? [];
  const past = tournaments?.filter(t => t.status !== "active") ?? [];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">TOURNAMENTS</h1>
          <p className="text-muted-foreground text-sm mt-1">Launch and manage competitive tournaments</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 font-mono">
          <Plus size={16} /> Launch Tournament
        </Button>
      </div>

      {/* Active Tournaments */}
      {active.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-green-400 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Active
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map(t => <TournamentCard key={t.id} t={t} onEnd={() => endTournament.mutate(t.id)} />)}
          </div>
        </div>
      )}

      {/* Past Tournaments */}
      <div>
        <h2 className="font-mono font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3">History</h2>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)}</div>
        ) : past.length === 0 && active.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            <Trophy size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-mono">No tournaments yet. Launch your first one!</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {["ID", "Type", "Prize Pool", "Entry Fee", "Duration", "Status", "Ended"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {past.map(t => {
                  const duration = Math.round((new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 3600000);
                  return (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{t.id}</td>
                      <td className="px-4 py-3 font-mono font-medium">{TYPE_LABELS[t.type] ?? t.type}</td>
                      <td className="px-4 py-3 font-mono text-green-400">{t.prizePoolTon} TON</td>
                      <td className="px-4 py-3 font-mono text-xs">{t.entryFeeBoots ? `${t.entryFeeBoots} BOOT` : "Free"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{duration}h</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs text-muted-foreground">{t.status}</Badge></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.endTime).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary">Launch Tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Type</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <Button key={k} size="sm" variant={form.type === k ? "default" : "outline"} onClick={() => setForm(f => ({ ...f, type: k }))} className="font-mono text-xs">{v}</Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Prize Pool (TON)</label>
                <Input value={form.prizePoolTon} onChange={e => setForm(f => ({ ...f, prizePoolTon: e.target.value }))} className="bg-background border-border font-mono" type="number" min="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Duration (hours)</label>
                <Input value={form.durationHours} onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))} className="bg-background border-border font-mono" type="number" min="1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Entry Fee BOOT (optional)</label>
              <Input value={form.entryFeeBoots} onChange={e => setForm(f => ({ ...f, entryFeeBoots: e.target.value }))} placeholder="Leave blank for free entry" className="bg-background border-border font-mono" type="number" min="0" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 font-mono" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Launching…" : "Launch Tournament"}
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function TournamentCard({ t, onEnd }: { t: Tournament; onEnd: () => void }) {
  const now = new Date();
  const end = new Date(t.endTime);
  const msLeft = end.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000));
  const minsLeft = Math.max(0, Math.floor((msLeft % 3600000) / 60000));

  return (
    <div className="bg-card border border-green-800/40 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-mono font-bold text-foreground">{TYPE_LABELS[t.type] ?? t.type} Tournament</div>
          <div className="text-xs text-muted-foreground mt-0.5">#{t.id} · Started {new Date(t.startTime).toLocaleDateString()}</div>
        </div>
        <Badge className="bg-green-900 text-green-300 hover:bg-green-900 font-mono text-xs">LIVE</Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/30 rounded-lg p-2.5 text-center">
          <div className="text-lg font-mono font-bold text-green-400">{t.prizePoolTon}</div>
          <div className="text-xs text-muted-foreground">TON Prize</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2.5 text-center">
          <div className="text-lg font-mono font-bold text-yellow-400">{t.entryFeeBoots ?? "Free"}</div>
          <div className="text-xs text-muted-foreground">Entry</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2.5 text-center">
          <div className="text-lg font-mono font-bold text-blue-400">{hoursLeft}h {minsLeft}m</div>
          <div className="text-xs text-muted-foreground">Remaining</div>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full gap-1.5 text-red-400 border-red-800 hover:bg-red-950" onClick={onEnd}>
        <StopCircle size={14} /> End Tournament
      </Button>
    </div>
  );
}
