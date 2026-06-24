import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Play, Square, Clock, Tv2, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface MatchEventStatus {
  active: boolean;
  teamA: string;
  teamB: string;
  bonusMultiplier: number;
  endsAt: string | null;
  label: string;
  expired: boolean;
}

interface WcMatch {
  date: string;
  teamA: string;
  teamB: string;
  stage: string;
  group?: string;
}

const WC_2026_SCHEDULE: WcMatch[] = [
  // Late Group Stage — June 24-28
  { date: "2026-06-24", teamA: "France",      teamB: "Morocco",     stage: "Group Stage",  group: "Group D" },
  { date: "2026-06-24", teamA: "Germany",     teamB: "Switzerland", stage: "Group Stage",  group: "Group B" },
  { date: "2026-06-25", teamA: "England",     teamB: "Slovenia",    stage: "Group Stage",  group: "Group C" },
  { date: "2026-06-25", teamA: "Brazil",      teamB: "Colombia",    stage: "Group Stage",  group: "Group G" },
  { date: "2026-06-26", teamA: "Spain",       teamB: "Croatia",     stage: "Group Stage",  group: "Group E" },
  { date: "2026-06-26", teamA: "Portugal",    teamB: "Cameroon",    stage: "Group Stage",  group: "Group F" },
  { date: "2026-06-27", teamA: "Argentina",   teamB: "Chile",       stage: "Group Stage",  group: "Group A" },
  { date: "2026-06-27", teamA: "USA",         teamB: "Mexico",      stage: "Group Stage",  group: "Group K" },
  { date: "2026-06-28", teamA: "Netherlands", teamB: "Senegal",     stage: "Group Stage",  group: "Group H" },
  { date: "2026-06-28", teamA: "Japan",       teamB: "South Korea", stage: "Group Stage",  group: "Group J" },
  { date: "2026-06-29", teamA: "Italy",       teamB: "Nigeria",     stage: "Group Stage",  group: "Group L" },
  { date: "2026-06-29", teamA: "Canada",      teamB: "Belgium",     stage: "Group Stage",  group: "Group I" },

  // Round of 32 — July 4-8
  { date: "2026-07-04", teamA: "Brazil",      teamB: "Ecuador",     stage: "Round of 32"  },
  { date: "2026-07-04", teamA: "France",      teamB: "USA",         stage: "Round of 32"  },
  { date: "2026-07-05", teamA: "England",     teamB: "Colombia",    stage: "Round of 32"  },
  { date: "2026-07-05", teamA: "Argentina",   teamB: "Poland",      stage: "Round of 32"  },
  { date: "2026-07-06", teamA: "Germany",     teamB: "Senegal",     stage: "Round of 32"  },
  { date: "2026-07-06", teamA: "Spain",       teamB: "Mexico",      stage: "Round of 32"  },
  { date: "2026-07-07", teamA: "Portugal",    teamB: "Japan",       stage: "Round of 32"  },
  { date: "2026-07-07", teamA: "Netherlands", teamB: "Canada",      stage: "Round of 32"  },
  { date: "2026-07-08", teamA: "Italy",       teamB: "Morocco",     stage: "Round of 32"  },
  { date: "2026-07-08", teamA: "South Korea", teamB: "Croatia",     stage: "Round of 32"  },

  // Round of 16 — July 10-14
  { date: "2026-07-10", teamA: "Brazil",      teamB: "France",      stage: "Round of 16"  },
  { date: "2026-07-11", teamA: "England",     teamB: "Argentina",   stage: "Round of 16"  },
  { date: "2026-07-12", teamA: "Germany",     teamB: "Spain",       stage: "Round of 16"  },
  { date: "2026-07-13", teamA: "Portugal",    teamB: "Netherlands", stage: "Round of 16"  },

  // Quarter-finals — July 17-19
  { date: "2026-07-17", teamA: "Brazil",      teamB: "England",     stage: "Quarter-final" },
  { date: "2026-07-18", teamA: "Germany",     teamB: "Portugal",    stage: "Quarter-final" },

  // Semi-finals — July 22-23
  { date: "2026-07-22", teamA: "TBD",         teamB: "TBD",         stage: "Semi-final"   },
  { date: "2026-07-23", teamA: "TBD",         teamB: "TBD",         stage: "Semi-final"   },

  // Final — July 26
  { date: "2026-07-26", teamA: "TBD",         teamB: "TBD",         stage: "Final"        },
];

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());

const STAGE_COLORS: Record<string, string> = {
  "Group Stage": "text-blue-400",
  "Round of 32": "text-amber-400",
  "Round of 16": "text-orange-400",
  "Quarter-final": "text-red-400",
  "Semi-final": "text-violet-400",
  "Final": "text-yellow-400",
};

export function AdminMatchEvents() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [teamA, setTeamA] = useState("Brazil");
  const [teamB, setTeamB] = useState("Argentina");
  const [label, setLabel] = useState("World Cup 2026 Match Day");
  const [bonusMultiplier, setBonusMultiplier] = useState("1.5");
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [showSchedule, setShowSchedule] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = WC_2026_SCHEDULE.filter(m => m.date >= today).slice(0, 12);
  const groupedByStage = upcoming.reduce<Record<string, WcMatch[]>>((acc, m) => {
    acc[m.stage] = [...(acc[m.stage] ?? []), m];
    return acc;
  }, {});

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

  function quickStart(match: WcMatch) {
    setTeamA(match.teamA);
    setTeamB(match.teamB);
    setLabel(`WC 2026 — ${match.stage}${match.group ? ` · ${match.group}` : ""}`);
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> Match Events
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Activate World Cup 2026 match-day events with bonus multipliers for players
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

        {/* WC 2026 Schedule Quick-Start */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setShowSchedule(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-500/8 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="font-mono font-semibold text-sm text-amber-300">WC 2026 — Quick Start</span>
              <span className="text-[10px] font-mono text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded">
                {upcoming.length} upcoming
              </span>
            </div>
            {showSchedule ? <ChevronUp className="w-4 h-4 text-amber-400/60" /> : <ChevronDown className="w-4 h-4 text-amber-400/60" />}
          </button>

          <AnimatePresence>
            {showSchedule && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-amber-500/15"
              >
                <div className="p-4 space-y-4">
                  {Object.entries(groupedByStage).map(([stage, matches]) => (
                    <div key={stage}>
                      <p className={`text-[9px] uppercase font-bold tracking-widest mb-2 ${STAGE_COLORS[stage] ?? "text-muted-foreground"}`}>{stage}</p>
                      <div className="space-y-1.5">
                        {matches.map((m, i) => (
                          <button
                            key={i}
                            onClick={() => quickStart(m)}
                            disabled={status?.active}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card hover:border-amber-500/30 hover:bg-amber-500/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground w-[60px] text-left">{m.date.slice(5)}</span>
                              <span className="text-sm font-bold text-white">{m.teamA}</span>
                              <span className="text-xs text-muted-foreground font-mono">vs</span>
                              <span className="text-sm font-bold text-white">{m.teamB}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {m.group && <span className="text-[9px] font-mono text-muted-foreground/50">{m.group}</span>}
                              <span className="text-[10px] font-mono text-amber-400/70">Select</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground/50 font-mono text-center pt-1">
                    Click any match to pre-fill the form below
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="World Cup 2026 Match Day" className="font-mono" />
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
