import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { Zap, Clock, TrendingUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface RateEventStatus {
  active: boolean;
  depositRate: number;
  endsAt: string | null;
  expired: boolean;
}

async function adminFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return <span>{remaining}</span>;
}

export function AdminRateEvents() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<RateEventStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [depositRate, setDepositRate] = useState("120");
  const [durationMinutes, setDurationMinutes] = useState("60");

  const fetchStatus = async () => {
    try {
      const data = await adminFetch("/api/admin/rate-events/status", adminToken!);
      setStatus(data);
    } catch (e) {
      toast({ title: "Failed to load status", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchStatus(); }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      await adminFetch("/api/admin/rate-events/start", adminToken!, {
        method: "POST",
        body: JSON.stringify({ depositRate: Number(depositRate), durationMinutes: Number(durationMinutes) }),
      });
      toast({ title: "Rate event started!", description: `${depositRate} STRIKER/TON for ${durationMinutes} minutes` });
      await fetchStatus();
    } catch (e) {
      toast({ title: "Failed to start rate event", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      await adminFetch("/api/admin/rate-events/end", adminToken!, { method: "POST" });
      toast({ title: "Rate event ended" });
      await fetchStatus();
    } catch (e) {
      toast({ title: "Failed to end rate event", variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black font-mono text-foreground">Rate Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Launch limited-time STRIKER deposit bonus windows to drive urgency</p>
        </div>

        {/* Current Status */}
        {loading ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">Loading...</div>
        ) : status && (
          <div className={`rounded-xl border p-6 ${status.active ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${status.active ? "bg-green-400 animate-pulse" : "bg-muted"}`} />
                <h2 className="font-bold font-mono text-lg">{status.active ? "Rate Event ACTIVE" : "No Active Rate Event"}</h2>
              </div>
              {status.active && (
                <Button onClick={handleEnd} disabled={ending} variant="destructive" size="sm">
                  <Square size={14} className="mr-1.5" />
                  {ending ? "Ending..." : "Stop Event"}
                </Button>
              )}
            </div>
            {status.active && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="bg-black/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground font-mono mb-1">DEPOSIT RATE</p>
                  <p className="text-2xl font-black text-green-400">{status.depositRate}</p>
                  <p className="text-[11px] text-muted-foreground">STRIKER per TON</p>
                </div>
                <div className="bg-black/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground font-mono mb-1">BOOST</p>
                  <p className="text-2xl font-black text-yellow-400">+{((status.depositRate / 100 - 1) * 100).toFixed(0)}%</p>
                  <p className="text-[11px] text-muted-foreground">vs standard rate</p>
                </div>
                <div className="bg-black/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground font-mono mb-1">ENDS IN</p>
                  <p className="text-2xl font-black text-amber-400">
                    {status.endsAt ? <CountdownTimer endsAt={status.endsAt} /> : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">remaining</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Launch New Event */}
        {!status?.active && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="font-bold font-mono text-base flex items-center gap-2">
              <Zap size={16} className="text-yellow-400" />
              Launch Rate Event
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
                  <TrendingUp size={11} className="inline mr-1" />
                  Deposit Rate (STRIKER/TON)
                </label>
                <input
                  type="number"
                  value={depositRate}
                  onChange={e => setDepositRate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary"
                  min="101"
                  max="200"
                  step="5"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Standard: 100 STRIKER/TON</p>
              </div>
              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
                  <Clock size={11} className="inline mr-1" />
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary"
                  min="5"
                  max="1440"
                  step="15"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Max 24 hours (1440 min)</p>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-mono">
                Players will see: <strong>{depositRate} STRIKER</strong> for every 1 TON deposited — {((Number(depositRate) / 100 - 1) * 100).toFixed(0)}% bonus vs standard rate.
                Event runs for <strong>{durationMinutes} minutes</strong>.
              </p>
            </div>

            <Button onClick={handleStart} disabled={starting} className="w-full">
              <Zap size={14} className="mr-2" />
              {starting ? "Starting..." : "Launch Rate Event"}
            </Button>
          </div>
        )}

        {/* History / Notes */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-mono font-bold text-muted-foreground uppercase tracking-wider mb-3">How It Works</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-green-400">•</span>Players depositing during the event receive the boosted rate</li>
            <li className="flex gap-2"><span className="text-green-400">•</span>A banner appears on the deposit page showing the limited-time rate</li>
            <li className="flex gap-2"><span className="text-green-400">•</span>The event auto-expires after the set duration</li>
            <li className="flex gap-2"><span className="text-green-400">•</span>All rate events are logged in the Audit Log</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
