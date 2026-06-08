import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Trophy, Zap, RotateCcw, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface JackpotAdmin {
  currentAmountTon: number;
  status: "building" | "ready";
  minimumTrigger: number;
  seedAmount: number;
  houseCutPct: number;
  lastWinner: string | null;
  lastWinnerId: number | null;
  lastTriggeredAt: string | null;
  percentFull: number;
}

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());

export function AdminJackpot() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [minimumTrigger, setMinimumTrigger] = useState("");
  const [seedAmount, setSeedAmount] = useState("");
  const [houseCutPct, setHouseCutPct] = useState("");
  const [triggerPlayerId, setTriggerPlayerId] = useState("");
  const [resetAmount, setResetAmount] = useState("");

  const { data: jackpot, isLoading } = useQuery<JackpotAdmin>({
    queryKey: ["admin-jackpot"],
    queryFn: () => API("/admin/jackpot", adminToken ?? ""),
    refetchInterval: 10_000,
    enabled: !!adminToken,
  });

  useEffect(() => {
    if (!jackpot) return;
    if (!minimumTrigger) setMinimumTrigger(String(jackpot.minimumTrigger));
    if (!seedAmount) setSeedAmount(String(jackpot.seedAmount));
    if (!houseCutPct) setHouseCutPct(String(jackpot.houseCutPct));
  }, [jackpot]);

  const configMutation = useMutation({
    mutationFn: () => API("/admin/jackpot/config", adminToken ?? "", {
      method: "PATCH",
      body: JSON.stringify({
        minimumTrigger: parseFloat(minimumTrigger),
        seedAmount: parseFloat(seedAmount),
        houseCutPct: parseFloat(houseCutPct),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-jackpot"] });
      toast({ title: "Jackpot config updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const triggerMutation = useMutation({
    mutationFn: () => API("/admin/jackpot/trigger", adminToken ?? "", {
      method: "POST",
      body: JSON.stringify(triggerPlayerId ? { playerId: parseInt(triggerPlayerId) } : {}),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-jackpot"] });
      toast({ title: `Jackpot triggered! ${Number(d.winnerAmount).toFixed(2)} TON paid to ${d.winnerUsername}` });
      setTriggerPlayerId("");
    },
    onError: () => toast({ title: "Trigger failed", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => API("/admin/jackpot/reset", adminToken ?? "", {
      method: "POST",
      body: JSON.stringify(resetAmount ? { amount: parseFloat(resetAmount) } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-jackpot"] });
      toast({ title: "Jackpot pool reset" });
      setResetAmount("");
    },
    onError: () => toast({ title: "Reset failed", variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" /> Golden Boot Jackpot
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor, configure, and manually control the jackpot pool
          </p>
        </div>

        {/* Current State */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : jackpot ? (
          <div className={`rounded-xl border p-6 ${jackpot.status === "ready" ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-card"}`}>
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                className={`w-3 h-3 rounded-full ${jackpot.status === "ready" ? "bg-yellow-400" : "bg-muted-foreground"}`}
                animate={jackpot.status === "ready" ? { opacity: [1, 0.3, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="font-mono font-bold text-sm">
                {jackpot.status === "ready" ? "READY TO TRIGGER" : "BUILDING"}
              </span>
            </div>

            <div className="text-4xl font-mono font-black text-yellow-400 mb-1">
              {Number(jackpot.currentAmountTon).toFixed(2)} TON
            </div>
            <div className="text-xs text-muted-foreground font-mono mb-4">
              {jackpot.percentFull.toFixed(1)}% of {jackpot.minimumTrigger} TON threshold
            </div>

            <div className="bg-black/30 rounded-full h-2 overflow-hidden mb-4">
              <motion.div
                className="h-full bg-gradient-to-r from-yellow-500 to-green-400 rounded-full"
                style={{ width: `${Math.min(jackpot.percentFull, 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">House Cut</div>
                <div className="font-mono font-bold">{jackpot.houseCutPct}%</div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Seed Amount</div>
                <div className="font-mono font-bold">{jackpot.seedAmount} TON</div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Last Winner</div>
                <div className="font-mono font-bold truncate">{jackpot.lastWinner ?? "—"}</div>
              </div>
            </div>

            {jackpot.lastTriggeredAt && (
              <div className="mt-3 text-xs text-muted-foreground font-mono">
                Last triggered: {new Date(jackpot.lastTriggeredAt).toLocaleString()}
              </div>
            )}
          </div>
        ) : null}

        {/* Configuration */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-mono font-semibold text-sm flex items-center gap-2">
            <Settings className="w-4 h-4" /> Configuration
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1">Minimum Trigger (TON)</label>
              <Input type="number" min="1" value={minimumTrigger} onChange={e => setMinimumTrigger(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1">Seed Amount (TON)</label>
              <Input type="number" min="0" step="0.5" value={seedAmount} onChange={e => setSeedAmount(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1">House Cut (%)</label>
              <Input type="number" min="0" max="50" value={houseCutPct} onChange={e => setHouseCutPct(e.target.value)} className="font-mono" />
            </div>
          </div>
          <Button onClick={() => configMutation.mutate()} disabled={configMutation.isPending} className="font-mono gap-2">
            <Settings className="w-4 h-4" /> Save Config
          </Button>
        </div>

        {/* Manual Trigger */}
        <div className="bg-card border border-yellow-500/20 rounded-xl p-5 space-y-4">
          <h2 className="font-mono font-semibold text-sm flex items-center gap-2 text-yellow-400">
            <Zap className="w-4 h-4" /> Manual Trigger
          </h2>
          <p className="text-xs text-muted-foreground">
            Immediately pay out {jackpot ? `${(jackpot.currentAmountTon * (1 - jackpot.houseCutPct / 100)).toFixed(2)} TON` : "the jackpot"} to the specified player and reset the pool. Leave player ID blank to reset without payout.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-mono text-muted-foreground block mb-1">Player ID (optional)</label>
              <Input
                type="number"
                value={triggerPlayerId}
                onChange={e => setTriggerPlayerId(e.target.value)}
                placeholder="Leave blank to skip payout"
                className="font-mono"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
                className="gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-mono font-bold"
              >
                <Zap className="w-4 h-4" /> Trigger
              </Button>
            </div>
          </div>
        </div>

        {/* Reset Pool */}
        <div className="bg-card border border-red-500/20 rounded-xl p-5 space-y-4">
          <h2 className="font-mono font-semibold text-sm flex items-center gap-2 text-red-400">
            <RotateCcw className="w-4 h-4" /> Reset Pool
          </h2>
          <p className="text-xs text-muted-foreground">
            Reset pool to the configured seed amount without paying anyone. Use if the pool needs to be corrected.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-mono text-muted-foreground block mb-1">Override amount (TON) — optional</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={resetAmount}
                onChange={e => setResetAmount(e.target.value)}
                placeholder={`Default: ${jackpot?.seedAmount ?? 10} TON`}
                className="font-mono"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                variant="destructive"
                className="gap-2 font-mono"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
