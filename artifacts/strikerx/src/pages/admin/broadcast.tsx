import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEMPLATES = [
  { label: "Big Win Alert", message: "🏆 Someone just hit a massive win on StrikerX! Join the action now — your next win could be even bigger." },
  { label: "Jackpot Alert", message: "🚨 The Golden Boot jackpot is about to blow! Get in the game NOW before someone else claims it." },
  { label: "Weekend Promo", message: "⚽ Weekend Special: Double STRIKER rewards on all games this weekend only! Don't miss out." },
  { label: "New Feature", message: "🆕 We've just launched something amazing on StrikerX. Open the app to check it out!" },
  { label: "Maintenance Notice", message: "🔧 StrikerX will undergo brief maintenance tonight. Your balance is safe. Back soon!" },
];

export function AdminBroadcast() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");

  const broadcast = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ message, buttonText: buttonText || undefined, buttonUrl: buttonUrl || undefined }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Broadcast sent", description: "Message sent to all group members via GroupBot." });
      setMessage("");
      setButtonText("");
      setButtonUrl("");
    },
    onError: (e: Error) => toast({ title: "Broadcast failed", description: e.message + " (Is GROUPBOT_TOKEN configured?)", variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-mono font-bold text-primary">BROADCAST</h1>
        <p className="text-muted-foreground text-sm mt-1">Send messages to all users via GroupBot</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
              <Radio size={16} /> Compose Message
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Enter your broadcast message here…"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <div className="text-xs text-muted-foreground mt-1">{message.length} characters</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Button Text (optional)</label>
                  <Input value={buttonText} onChange={e => setButtonText(e.target.value)} placeholder="e.g. Play Now" className="bg-background border-border font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Button URL (optional)</label>
                  <Input value={buttonUrl} onChange={e => setButtonUrl(e.target.value)} placeholder="https://t.me/…" className="bg-background border-border font-mono text-sm" />
                </div>
              </div>

              {/* Preview */}
              {message && (
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">Preview</div>
                  <div className="text-sm whitespace-pre-wrap text-foreground">{message}</div>
                  {buttonText && (
                    <div className="mt-3">
                      <span className="inline-block bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded font-mono">{buttonText}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full gap-2 font-mono"
                onClick={() => broadcast.mutate()}
                disabled={!message.trim() || broadcast.isPending}
              >
                <Send size={16} />
                {broadcast.isPending ? "Sending…" : "Send Broadcast"}
              </Button>
            </div>
          </div>
        </div>

        {/* Templates */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-mono font-bold text-foreground mb-4 text-sm uppercase tracking-wider">Templates</h2>
            <div className="space-y-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setMessage(t.message)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="text-sm font-mono font-medium text-foreground mb-1">{t.label}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{t.message}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-2">
            <div className="font-mono font-bold text-foreground text-sm">Important Notes</div>
            <p>Messages are sent via the GroupBot to the configured Telegram group.</p>
            <p>GroupBot must be configured with a valid token and added to the target group.</p>
            <p>All broadcasts are logged in the Audit Log.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
