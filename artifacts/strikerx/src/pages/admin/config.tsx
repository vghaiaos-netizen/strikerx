import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, Eye, EyeOff, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ConfigEntry {
  key: string; value: string; category: string; label: string;
  description?: string; isSecret: boolean; isRestartRequired: boolean; updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game Settings", payment: "Payment & Rates", jackpot: "Jackpot",
  vip: "VIP Tiers", referral: "Referrals", bot: "Bots & Integrations",
  security: "Security & Auth", platform: "Platform",
};

const CATEGORY_ICONS: Record<string, string> = {
  game: "🎮", payment: "💰", jackpot: "🏆", vip: "⭐",
  referral: "🤝", bot: "🤖", security: "🔒", platform: "⚙️",
};

export function AdminConfig() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: configs, isLoading } = useQuery<ConfigEntry[]>({
    queryKey: ["/admin/config"],
    enabled: !!adminToken,
    queryFn: async () => {
      const r = await fetch("/api/admin/config", { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  useEffect(() => {
    if (configs) {
      const initial: Record<string, string> = {};
      configs.forEach(c => { initial[c.key] = c.value; });
      setEdits(initial);
    }
  }, [configs]);

  const saveAll = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const r = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(updates),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved", description: "All changes have been applied." });
      queryClient.invalidateQueries({ queryKey: ["/admin/config"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const saveKey = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const r = await fetch(`/api/admin/config/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ value }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_, { key }) => {
      toast({ title: `Saved: ${key}` });
      queryClient.invalidateQueries({ queryKey: ["/admin/config"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const grouped = configs ? configs.reduce<Record<string, ConfigEntry[]>>((acc, c) => {
    if (!acc[c.category]) acc[c.category] = [];
    acc[c.category].push(c);
    return acc;
  }, {}) : {};

  const categories = Object.keys(grouped).sort();
  const displayCategory = activeCategory ?? categories[0] ?? null;
  const displayConfigs = displayCategory ? (grouped[displayCategory] ?? []) : [];

  const hasChanges = configs ? configs.some(c => edits[c.key] !== c.value && edits[c.key] !== "••••••••") : false;

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-mono font-bold text-primary">CONFIG</h1>
          <p className="text-muted-foreground text-sm mt-1">All platform settings — changes take effect within 15 seconds</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/admin/config"] })}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          {hasChanges && (
            <Button size="sm" onClick={() => saveAll.mutate(edits)} disabled={saveAll.isPending}>
              <Save size={14} className="mr-1" />
              {saveAll.isPending ? "Saving…" : "Save All Changes"}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-xl border border-border" />)}</div>
      ) : (
        <div className="flex gap-6">
          {/* Category Sidebar */}
          <div className="w-52 flex-shrink-0">
            <div className="space-y-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${displayCategory === cat ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <span>{CATEGORY_ICONS[cat] ?? "⚙️"}</span>
                  <span className="font-mono text-xs">{CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className={`ml-auto text-xs px-1.5 rounded-full ${displayCategory === cat ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{grouped[cat]?.length ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Config Panel */}
          <div className="flex-1">
            {displayCategory && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{CATEGORY_ICONS[displayCategory] ?? "⚙️"}</span>
                    <h2 className="font-mono font-bold text-foreground">{CATEGORY_LABELS[displayCategory] ?? displayCategory}</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">{displayConfigs.length} settings</span>
                </div>

                <div className="divide-y divide-border">
                  {displayConfigs.map(c => {
                    const isEdited = edits[c.key] !== c.value && edits[c.key] !== "••••••••";
                    const showingSecret = showSecrets.has(c.key);
                    const displayValue = c.isSecret && !showingSecret ? edits[c.key] : edits[c.key];

                    return (
                      <div key={c.key} className={`px-6 py-4 ${isEdited ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-sm font-medium text-foreground">{c.label}</label>
                              {c.isSecret && <Lock size={12} className="text-yellow-500" />}
                              {c.isRestartRequired && (
                                <Badge className="text-xs bg-orange-950 text-orange-400 hover:bg-orange-950 border-orange-800">Requires Restart</Badge>
                              )}
                              {isEdited && <Badge className="text-xs bg-primary/20 text-primary hover:bg-primary/20">Unsaved</Badge>}
                            </div>
                            {c.description && <p className="text-xs text-muted-foreground mb-2">{c.description}</p>}
                            <code className="text-xs text-muted-foreground/60 font-mono">{c.key}</code>
                          </div>
                          <div className="flex items-center gap-2 min-w-64">
                            <div className="relative flex-1">
                              <Input
                                type={c.isSecret && !showingSecret ? "password" : "text"}
                                value={displayValue ?? ""}
                                onChange={e => setEdits(prev => ({ ...prev, [c.key]: e.target.value }))}
                                className="bg-background border-border font-mono text-sm pr-8"
                                placeholder={c.isSecret ? "Enter new value to change…" : ""}
                              />
                              {c.isSecret && (
                                <button onClick={() => toggleSecret(c.key)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                  {showingSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                            <Button size="sm" variant={isEdited ? "default" : "outline"} className="px-3"
                              onClick={() => saveKey.mutate({ key: c.key, value: edits[c.key] ?? "" })}
                              disabled={!isEdited || saveKey.isPending}>
                              <Save size={13} />
                            </Button>
                          </div>
                        </div>
                        {c.isRestartRequired && isEdited && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-400">
                            <AlertTriangle size={12} />
                            This setting requires a server restart to take full effect.
                          </div>
                        )}
                        {c.key === "session_secret" && isEdited && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                            <AlertTriangle size={12} />
                            <strong>WARNING:</strong> Changing the JWT secret will immediately invalidate ALL active user sessions. All players will be logged out.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {hasChanges && (
                  <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end">
                    <Button onClick={() => saveAll.mutate(edits)} disabled={saveAll.isPending}>
                      <Save size={14} className="mr-2" />
                      {saveAll.isPending ? "Saving…" : "Save All Changes"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
