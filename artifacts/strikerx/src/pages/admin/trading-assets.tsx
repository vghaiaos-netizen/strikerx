import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Save, RefreshCw } from "lucide-react";

interface TradingAsset {
  id: number;
  symbol: string;
  displayName: string;
  binanceSymbol: string;
  enabled: boolean;
  payoutRatio: number;
  minStakeStriker: number;
  maxStakeStriker: number;
  sortOrder: number;
  currentPrice?: number | null;
}

interface AssetEdit {
  enabled: boolean;
  payoutRatio: string;
  minStakeStriker: string;
  maxStakeStriker: string;
}

const ASSET_CATEGORY: Record<string, string> = {
  BTC: "Crypto", ETH: "Crypto", SOL: "Crypto", BNB: "Crypto", TON: "Crypto",
  XRP: "Crypto", DOGE: "Crypto", AVAX: "Crypto", MATIC: "Crypto",
  EURUSD: "Forex", GBPUSD: "Forex", USDJPY: "Forex", AUDUSD: "Forex", USDCHF: "Forex",
  XAUUSD: "Commodities", XAGUSD: "Commodities", USOIL: "Commodities", NATGAS: "Commodities", COPPER: "Commodities",
  SPX: "Indices", NDX: "Indices", DJI: "Indices", DAX: "Indices", FTSE: "Indices", NKY: "Indices",
};

const CATEGORY_COLOR: Record<string, string> = {
  Crypto: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Forex: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  Commodities: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
  Indices: "bg-green-500/15 text-green-400 border-green-500/25",
};

export function AdminTradingAssets() {
  const { adminToken } = useAuth();
  const { toast }      = useToast();
  const queryClient    = useQueryClient();

  const [edits, setEdits] = useState<Record<string, AssetEdit>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<{ assets: TradingAsset[] }>({
    queryKey: ["admin-trading-assets"],
    queryFn: async () => {
      const r = await fetch("/api/admin/trading/assets", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!r.ok) throw new Error("Failed to fetch assets");
      return r.json() as Promise<{ assets: TradingAsset[] }>;
    },
    enabled: !!adminToken,
  });

  const assets = data?.assets ?? [];

  function getEdit(asset: TradingAsset): AssetEdit {
    return edits[asset.symbol] ?? {
      enabled:         asset.enabled,
      payoutRatio:     String(asset.payoutRatio),
      minStakeStriker: String(asset.minStakeStriker),
      maxStakeStriker: String(asset.maxStakeStriker),
    };
  }

  function setField(symbol: string, asset: TradingAsset, field: keyof AssetEdit, value: string | boolean) {
    setEdits((prev) => ({
      ...prev,
      [symbol]: { ...getEdit(asset), [field]: value },
    }));
  }

  async function saveAsset(asset: TradingAsset) {
    const edit = getEdit(asset);
    setSaving((s) => new Set(s).add(asset.symbol));
    try {
      const body = {
        enabled:         edit.enabled,
        payoutRatio:     parseFloat(edit.payoutRatio),
        minStakeStriker: parseFloat(edit.minStakeStriker),
        maxStakeStriker: parseFloat(edit.maxStakeStriker),
      };
      if (isNaN(body.payoutRatio) || isNaN(body.minStakeStriker) || isNaN(body.maxStakeStriker)) {
        toast({ title: "Invalid values", description: "All numeric fields must be valid numbers", variant: "destructive" });
        return;
      }
      const r = await fetch(`/api/admin/trading/assets/${encodeURIComponent(asset.symbol)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json() as { error?: string };
        throw new Error(err.error ?? "Update failed");
      }
      toast({ title: "Saved", description: `${asset.symbol} updated` });
      setEdits((prev) => { const n = { ...prev }; delete n[asset.symbol]; return n; });
      await queryClient.invalidateQueries({ queryKey: ["admin-trading-assets"] });
    } catch (err) {
      toast({ title: "Error", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(asset.symbol); return n; });
    }
  }

  function isDirty(asset: TradingAsset): boolean {
    if (!edits[asset.symbol]) return false;
    const e = edits[asset.symbol];
    return (
      e.enabled !== asset.enabled ||
      parseFloat(e.payoutRatio) !== asset.payoutRatio ||
      parseFloat(e.minStakeStriker) !== asset.minStakeStriker ||
      parseFloat(e.maxStakeStriker) !== asset.maxStakeStriker
    );
  }

  const grouped: Record<string, TradingAsset[]> = {};
  for (const asset of assets) {
    const cat = ASSET_CATEGORY[asset.symbol] ?? "Other";
    (grouped[cat] ??= []).push(asset);
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Trading Assets</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure payout ratios, stakes, and availability for each tradable asset.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">Loading assets…</div>
        ) : (
          Object.entries(grouped).map(([category, catAssets]) => (
            <div key={category} className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">{category}</h2>
              <div className="space-y-3">
                {catAssets.map((asset) => {
                  const edit    = getEdit(asset);
                  const dirty   = isDirty(asset);
                  const isSaving = saving.has(asset.symbol);
                  return (
                    <div
                      key={asset.symbol}
                      className={`bg-card border rounded-xl p-4 transition-colors ${dirty ? "border-primary/40" : "border-border"}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base">{asset.symbol}</span>
                            <span className="text-muted-foreground text-sm">{asset.displayName}</span>
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${CATEGORY_COLOR[category] ?? ""}`}>
                              {category}
                            </span>
                          </div>
                          {asset.currentPrice != null && (
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              ${asset.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{edit.enabled ? "Enabled" : "Disabled"}</span>
                          <Switch
                            checked={edit.enabled}
                            onCheckedChange={(v) => setField(asset.symbol, asset, "enabled", v)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Payout Ratio</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="1.01"
                            max="1.99"
                            value={edit.payoutRatio}
                            onChange={(e) => setField(asset.symbol, asset, "payoutRatio", e.target.value)}
                            className="font-mono text-sm h-9"
                          />
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            = {Math.round((parseFloat(edit.payoutRatio || "0") - 1) * 100)}% profit
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Min Stake (STRK)</label>
                          <Input
                            type="number"
                            min="1"
                            value={edit.minStakeStriker}
                            onChange={(e) => setField(asset.symbol, asset, "minStakeStriker", e.target.value)}
                            className="font-mono text-sm h-9"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Max Stake (STRK)</label>
                          <Input
                            type="number"
                            min="1"
                            value={edit.maxStakeStriker}
                            onChange={(e) => setField(asset.symbol, asset, "maxStakeStriker", e.target.value)}
                            className="font-mono text-sm h-9"
                          />
                        </div>
                      </div>

                      {dirty && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => saveAsset(asset)}
                            disabled={isSaving}
                            className="gap-1.5"
                          >
                            {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                            Save {asset.symbol}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
