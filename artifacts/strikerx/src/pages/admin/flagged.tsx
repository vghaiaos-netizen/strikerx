import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { Flag, ShieldBan, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface FlaggedPlayer {
  id: number;
  username: string;
  strikerBalance: number;
  vipTier: string;
  isFlagged: boolean;
  isBanned: boolean;
  lastActive: string | null;
  tonWageredLifetime: number;
}

async function adminFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdminFlagged() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const [players, setPlayers] = useState<FlaggedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<number | null>(null);

  const fetchFlagged = async () => {
    try {
      const data = await adminFetch("/api/admin/flagged", adminToken!);
      setPlayers(data);
    } catch {
      toast({ title: "Failed to load flagged players", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchFlagged(); }, []);

  const handleUnflag = async (id: number) => {
    setActioning(id);
    try {
      await adminFetch(`/api/admin/players/${id}/flag`, adminToken!, {
        method: "POST",
        body: JSON.stringify({ flag: false }),
      });
      toast({ title: "Player unflagged" });
      await fetchFlagged();
    } catch {
      toast({ title: "Failed to unflag", variant: "destructive" });
    } finally {
      setActioning(null);
    }
  };

  const handleBan = async (id: number) => {
    setActioning(id);
    try {
      await adminFetch(`/api/admin/players/${id}/balance`, adminToken!, {
        method: "POST",
        body: JSON.stringify({ isBanned: true, banReason: "Flagged — manual review" }),
      });
      toast({ title: "Player banned" });
      await fetchFlagged();
    } catch {
      toast({ title: "Failed to ban", variant: "destructive" });
    } finally {
      setActioning(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black font-mono text-foreground flex items-center gap-2">
            <Flag size={22} className="text-red-400" />
            Flagged Players
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Players marked for review due to suspicious activity</p>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : players.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <ShieldCheck size={32} className="text-green-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground">No flagged players — all clear</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                {players.length} flagged player{players.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-border">
              {players.map((p) => (
                <div key={p.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono font-bold text-red-400">
                      {p.username.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-foreground">{p.username}</span>
                      {p.isBanned && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-mono">BANNED</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-3">
                      <span>{Number(p.strikerBalance).toLocaleString()} STRK</span>
                      <span>{Number(p.tonWageredLifetime).toFixed(2)} TON wagered</span>
                      <span>Active {timeAgo(p.lastActive)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actioning === p.id}
                      onClick={() => handleUnflag(p.id)}
                      className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                    >
                      <ShieldCheck size={13} className="mr-1.5" />
                      Clear
                    </Button>
                    {!p.isBanned && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actioning === p.id}
                        onClick={() => handleBan(p.id)}
                      >
                        <ShieldBan size={13} className="mr-1.5" />
                        Ban
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
