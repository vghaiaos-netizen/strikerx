import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  useGetTradingAssets,
  useGetTradingPrices,
  useGetTradingPositionsActive,
  useGetTradingPositions,
  usePostTradingPositions,
  getGetMeQueryKey,
  getGetTradingPositionsActiveQueryKey,
  getGetTradingPositionsQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Clock, Zap, CheckCircle, XCircle, MinusCircle } from "lucide-react";

const DURATIONS = [
  { label: "30s", secs: 30 },
  { label: "1m",  secs: 60 },
  { label: "5m",  secs: 300 },
  { label: "15m", secs: 900 },
];

const QUICK_STAKES = [50, 100, 500, 1000];

const ASSET_COLORS: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
  BNB: "#f0b90b",
  TON: "#0098ea",
};

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
    setRemaining(calc());
    const t = setInterval(() => setRemaining(calc()), 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <span className={`font-mono text-xs tabular-nums ${remaining < 10 ? "text-red-400" : "text-muted-foreground"}`}>
      {mins > 0 ? `${mins}m ` : ""}{secs.toString().padStart(2, "0")}s
    </span>
  );
}

export function Trading() {
  const { player } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAsset, setSelectedAsset] = useState("BTC");
  const [duration, setDuration] = useState(60);
  const [stake, setStake] = useState("100");
  const [tab, setTab] = useState<"active" | "history">("active");
  const prevPriceRef = useRef<Record<string, number>>({});

  const isAuthed = !!player;

  // Poll prices every 2 seconds (no auth needed)
  const { data: pricesData } = useGetTradingPrices({
    query: { refetchInterval: 2000 },
  });

  // Assets list (no auth needed, refreshes rarely)
  const { data: assetsData } = useGetTradingAssets({
    query: { refetchInterval: 15_000 },
  });

  // Active positions — only poll when authenticated, every 3s
  const { data: activeData } = useGetTradingPositionsActive({
    query: { refetchInterval: isAuthed ? 3000 : false, enabled: isAuthed },
  });

  // Settled history — only poll when authenticated, every 10s
  const { data: historyData } = useGetTradingPositions({
    query: { refetchInterval: isAuthed ? 10_000 : false, enabled: isAuthed },
  });

  const openPosition = usePostTradingPositions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });
        toast({ title: "Position opened", description: `${selectedDir === "UP" ? "UP" : "DOWN"} ${stake} STRK on ${selectedAsset}` });
        setSelectedDir(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to open position";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const [selectedDir, setSelectedDir] = useState<"UP" | "DOWN" | null>(null);

  const prices = pricesData?.prices ?? {};
  const assets = assetsData?.assets ?? [];
  const activePositions = activeData?.positions ?? [];
  const history = (historyData?.positions ?? []).filter((p) => p.outcome !== "pending");

  const currentPrice = prices[selectedAsset];
  const prevPrice = prevPriceRef.current[selectedAsset];
  const priceDir = currentPrice && prevPrice
    ? currentPrice > prevPrice ? "up"
    : currentPrice < prevPrice ? "down"
    : "flat"
    : "flat";

  // Track previous price for colour flash
  useEffect(() => {
    if (currentPrice !== undefined) {
      const timer = setTimeout(() => {
        prevPriceRef.current[selectedAsset] = currentPrice;
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentPrice, selectedAsset]);

  const selectedAssetData = assets.find((a) => a.symbol === selectedAsset);
  const payoutRatio = selectedAssetData?.payoutRatio ?? 1.82;
  const stakeNum = parseFloat(stake) || 0;
  const potentialWin = (stakeNum * payoutRatio).toFixed(0);

  function handleTrade(direction: "UP" | "DOWN") {
    if (!player) { toast({ title: "Not logged in", variant: "destructive" }); return; }
    if (stakeNum <= 0) { toast({ title: "Enter a stake amount", variant: "destructive" }); return; }
    setSelectedDir(direction);
    openPosition.mutate({
      data: {
        assetSymbol: selectedAsset,
        direction,
        stakeStriker: stakeNum,
        contractDurationSecs: duration,
      },
    });
  }

  const accentColor = ASSET_COLORS[selectedAsset] ?? "#00ff88";

  return (
    <Layout>
      <div className="flex flex-col min-h-full pb-4">

        {/* Asset selector */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(assets.length > 0 ? assets : ["BTC","ETH","SOL","BNB","TON"].map((s) => ({ symbol: s, displayName: s, payoutRatio: 1.82 }))).map((a) => {
              const sym = typeof a === "string" ? a : a.symbol;
              const aPrice = prices[sym];
              const isActive = sym === selectedAsset;
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedAsset(sym)}
                  style={isActive ? { borderColor: ASSET_COLORS[sym] ?? "#00ff88", color: ASSET_COLORS[sym] ?? "#00ff88" } : {}}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    isActive
                      ? "bg-white/5"
                      : "border-border text-muted-foreground hover:border-white/30"
                  }`}
                >
                  <span>{sym}</span>
                  {aPrice && (
                    <span className="text-[9px] font-mono font-normal text-muted-foreground">
                      ${aPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price display */}
        <div className="px-4 py-3 bg-card mx-3 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">{selectedAsset}/USDT · Binance</span>
            <div className={`flex items-center gap-1 text-xs font-bold ${priceDir === "up" ? "text-green-400" : priceDir === "down" ? "text-red-400" : "text-muted-foreground"}`}>
              {priceDir === "up" ? <TrendingUp size={12} /> : priceDir === "down" ? <TrendingDown size={12} /> : null}
              <span>{priceDir === "up" ? "UP" : priceDir === "down" ? "DOWN" : "—"}</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedAsset}-${currentPrice?.toFixed(2)}`}
              initial={{ opacity: 0.5, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`text-3xl font-mono font-black tracking-tight ${
                priceDir === "up" ? "text-green-400"
                : priceDir === "down" ? "text-red-400"
                : "text-white"
              }`}
            >
              {currentPrice
                ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: currentPrice > 10 ? 2 : 4, maximumFractionDigits: currentPrice > 10 ? 2 : 4 })}`
                : <span className="text-muted-foreground text-xl animate-pulse">Connecting…</span>
              }
            </motion.div>
          </AnimatePresence>

          <div className="text-[10px] text-muted-foreground mt-1">
            Payout <span className="text-white font-bold">{payoutRatio}×</span> · Settle in{" "}
            <span className="text-white font-bold">{DURATIONS.find((d) => d.secs === duration)?.label}</span>
          </div>
        </div>

        {/* Duration selector */}
        <div className="px-3 mt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-1">Contract Duration</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d.secs}
                onClick={() => setDuration(d.secs)}
                style={duration === d.secs ? { background: `${accentColor}22`, borderColor: accentColor, color: accentColor } : {}}
                className={`py-2 rounded-lg border text-xs font-bold transition-all ${
                  duration === d.secs ? "" : "border-border text-muted-foreground hover:border-white/30"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stake input */}
        <div className="px-3 mt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-1">Stake (STRK)</p>
          <div className="flex gap-1.5 mb-1.5">
            {QUICK_STAKES.map((q) => (
              <button
                key={q}
                onClick={() => setStake(String(q))}
                className="flex-1 py-1.5 rounded-md bg-muted text-xs font-bold text-muted-foreground hover:text-white hover:bg-muted/80 transition-colors"
              >
                {q.toLocaleString()}
              </button>
            ))}
          </div>
          <Input
            type="number"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Amount"
            className="font-mono text-base h-11"
          />
          {stakeNum > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Win: <span className="text-green-400 font-bold">{Number(potentialWin).toLocaleString()} STRK</span>
              {" "}· Balance: <span className="font-bold">{Math.round(player?.strikerBalance ?? 0).toLocaleString()}</span>
            </p>
          )}
        </div>

        {/* UP / DOWN buttons */}
        <div className="px-3 mt-3 grid grid-cols-2 gap-3">
          <Button
            className="h-14 text-lg font-black bg-green-600 hover:bg-green-500 text-white flex flex-col gap-0.5 disabled:opacity-50"
            onClick={() => handleTrade("UP")}
            disabled={openPosition.isPending || !stakeNum}
          >
            <TrendingUp size={20} />
            <span className="text-xs font-bold">UP · {payoutRatio}×</span>
          </Button>
          <Button
            className="h-14 text-lg font-black bg-red-600 hover:bg-red-500 text-white flex flex-col gap-0.5 disabled:opacity-50"
            onClick={() => handleTrade("DOWN")}
            disabled={openPosition.isPending || !stakeNum}
          >
            <TrendingDown size={20} />
            <span className="text-xs font-bold">DOWN · {payoutRatio}×</span>
          </Button>
        </div>

        {/* Positions tabs */}
        <div className="px-3 mt-4">
          <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1">
            <button
              onClick={() => setTab("active")}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                tab === "active" ? "bg-card text-white shadow" : "text-muted-foreground"
              }`}
            >
              Active {activePositions.length > 0 && `(${activePositions.length})`}
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                tab === "history" ? "bg-card text-white shadow" : "text-muted-foreground"
              }`}
            >
              History
            </button>
          </div>

          <AnimatePresence mode="wait">
            {tab === "active" ? (
              <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {activePositions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No active positions
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activePositions.map((p) => (
                      <div key={p.id} className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${
                              p.direction === "UP" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {p.direction === "UP" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {p.direction}
                          </div>
                          <div>
                            <p className="text-xs font-bold">{p.assetSymbol} <span className="text-muted-foreground font-normal">@ ${p.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></p>
                            <p className="text-[10px] text-muted-foreground">{p.stakeStriker.toLocaleString()} STRK</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock size={12} />
                          <Countdown expiresAt={p.expiresAt} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No trade history yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {history.slice(0, 20).map((p) => (
                      <div
                        key={p.id}
                        className={`bg-card border rounded-lg px-3 py-2.5 flex items-center justify-between ${
                          p.outcome === "win" ? "border-green-500/30" : p.outcome === "loss" ? "border-red-500/30" : "border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {p.outcome === "win" ? (
                            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                          ) : p.outcome === "loss" ? (
                            <XCircle size={16} className="text-red-400 flex-shrink-0" />
                          ) : (
                            <MinusCircle size={16} className="text-muted-foreground flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-bold">
                              {p.assetSymbol}{" "}
                              <span className={`${p.direction === "UP" ? "text-green-400" : "text-red-400"}`}>
                                {p.direction}
                              </span>
                              <span className="text-muted-foreground font-normal"> · {DURATIONS.find((d) => d.secs === p.contractDurationSecs)?.label ?? `${p.contractDurationSecs}s`}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Entry ${p.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              {p.exitPrice ? ` → $${p.exitPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {p.outcome === "win" ? (
                            <p className="text-green-400 font-bold text-sm">+{p.winAmount.toLocaleString()} STRK</p>
                          ) : p.outcome === "loss" ? (
                            <p className="text-red-400 font-bold text-sm">-{p.stakeStriker.toLocaleString()} STRK</p>
                          ) : (
                            <p className="text-muted-foreground font-bold text-sm">Refunded</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  );
}
