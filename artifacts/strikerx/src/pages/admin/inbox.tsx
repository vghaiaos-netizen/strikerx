import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Clock, User } from "lucide-react";

interface InboxEntry {
  id: number;
  playerId: number | null;
  username: string | null;
  message: string | null;
  sentBy: string | null;
  sentAt: string | null;
}

const API = (path: string, token: string) =>
  fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());

export function AdminInbox() {
  const { adminToken } = useAuth();

  const { data: messages = [], isLoading } = useQuery<InboxEntry[]>({
    queryKey: ["admin-inbox"],
    queryFn: () => API("/admin/inbox", adminToken ?? ""),
    refetchInterval: 30_000,
    enabled: !!adminToken,
  });

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" /> Player Inbox Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            History of direct messages sent to players via the GameBot
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl px-4 py-2 text-xs font-mono text-muted-foreground flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5" />
          {messages.length} messages sent total
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-border rounded-xl">
            No messages sent yet. Use the Players page to send a player a DM.
          </div>
        )}

        <div className="space-y-2">
          {messages.map(entry => (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-semibold text-sm">
                      {entry.username ? `@${entry.username}` : `Player #${entry.playerId}`}
                    </span>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      ID: {entry.playerId}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{entry.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {entry.sentAt ? new Date(entry.sentAt).toLocaleString() : "unknown"}
                    </span>
                    <span>sent by {entry.sentBy ?? "admin"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
