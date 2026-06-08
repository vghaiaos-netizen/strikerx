import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Play, Square, Clock, Tv2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface MatchEventStatus {
  active: boolean;
  teamA: string;
  teamB: string;
  bonusMultiplier: number;
  endsAt: string | null;
  label: string;
  expired: boolean;
}

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());

export function AdminMatchEvents() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [teamA, setTeamA] = useState("Brazil");
  const [teamB, setTeamB] = useState("Argentina");
  const [label, setLabel] = useState("World Cup Match Day");
  const [bonusMultiplier, setBonusMultiplier] = useState("1.5");
  const [durationMinutes, setDurationMinutes] = useState("120");

  const { data: status, isLoading } = useQuery<MatchEventStatus>({
    queryKey: ["admin-match-events"],
    queryFn: () => API("/admin/match-events/status", adminToken ?? ""),
    refetchInterval: 15_000,
    enabled: !!adminToken,
  });

  const startMutation = useMutation({
    mutationFn: () => API("/admin/match-events/start", adminToken ?? "", {
      method: "POST",
      body: JSON.stringify({ teamA, teamB, label, bonusMultiplier: parseFloat(bonusMultiplier), durationMinutes: parseInt(durationMinutes) }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-match-events"] }); toast({ title: "Match event started" }); },
    onError: () => toast({ title: "Failed to start", variant: "destructive" }),
  });

  const endMutation = useMutation({
    mutationFn: () => API("/admin/match-events/end", adminToken ?? "", { method: "POST", body: "{}" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-match-events"] }); toast({ title: "Match event ended" }); },
    onError: () => toast({ title: "Failed to end", variant: "destructive" }),
  });

  const formatCountdown = (endsAt: string | null) => {
    if (!endsAt) return null;
    const remaining = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> Match Events
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Activate World Cup match-day events with bonus multipliers for players
          </p>
        </div>

        {/* Current Status */}
        <div className={`rounded-xl border p-5 ${status?.active ? "border-green-500/30 bg-green-500/5" : "border-border bg-card"}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-2.5 h-2.5 rounded-full ${status?.active ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
            <span className="font-mono font-semibold text-sm">{status?.active ? "MATCH EVENT LIVE" : "NO ACTIVE EVENT"}</span>
          </div>

          {status?.active && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-4 py-4">
                <div className="text-center">
                  <div className="font-mono font-black text-2xl text-white">{status.teamA}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">HOME</div>
                </div>
                <div className="flex flex-col items-center">
                  <Tv2 className="w-5 h-5 text-primary mb-1" />
                  <span className="text-xs font-mono text-muted-foreground">VS</span>
                  <span className="text-[10px] font-mono text-green-400 mt-1">{status.bonusMultiplier}x bonus</span>
                </div>
                <div className="text-center">
                  <div className="font-mono font-black text-2xl text-white">{status.teamB}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">AWAY</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-background rounded-lg px-3 py-2">
                  <span className="text-muted-foreground text-xs">Label</span>
                  <div className="font-mono font-semibold">{status.label}</div>
                </div>
                <div className="bg-background rounded-lg px-3 py-2">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Remaining</span>
                  <div className="font-mono font-semibold text-green-400">{formatCountdown(status.endsAt)}</div>
                </div>
              </div>

              <Button onClick={() => endMutation.mutate()} disabled={endMutation.isPending}
                variant="destructive" className="w-full gap-2">
                <Square className="w-4 h-4" /> End Match Event
              </Button>
            </div>
          )}

          {!isLoading && !status?.active && (
            <p className="text-sm text-muted-foreground">Configure and start a new match event below.</p>
          )}
        </div>

        {/* Start New Event */}
        {!status?.active && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-mono font-semibold text-sm">Start Match Event</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Team A (Home)</label>
                <Input value={teamA} onChange={e => setTeamA(e.target.value)} placeholder="Brazil" className="font-mono" />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Team B (Away)</label>
                <Input value={teamB} onChange={e => setTeamB(e.target.value)} placeholder="Argentina" className="font-mono" />
              </div>
            </div>

            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1">Event Label</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="World Cup Match Day" className="font-mono" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Bonus Multiplier</label>
                <Input type="number" step="0.1" min="1" max="5" value={bonusMultiplier}
                  onChange={e => setBonusMultiplier(e.target.value)} className="font-mono" />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">Duration (minutes)</label>
                <Input type="number" min="15" max="480" value={durationMinutes}
                  onChange={e => setDurationMinutes(e.target.value)} className="font-mono" />
              </div>
            </div>

            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !teamA || !teamB}
              className="w-full gap-2 bg-green-500 hover:bg-green-600 text-black font-mono font-bold">
              <Play className="w-4 h-4" /> Start Match Event
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
