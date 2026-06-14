import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/ws-notifications";
import {
  useGetTradingAssets,
  useGetTradingPrices,
  useGetTradingPositionsActive,
  useGetTradingPositions,
  usePostTradingPositions,
  getGetMeQueryKey,
  getGetTradingAssetsQueryKey,
  getGetTradingPricesQueryKey,
  getGetTradingPositionsActiveQueryKey,
  getGetTradingPositionsQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Clock, CheckCircle, XCircle,
  MinusCircle, Zap, Flame, CandlestickChart, LineChart,
} from "lucide-react";
import { TradingChart } from "@/components/trading-chart";

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS = [
  { label: "30s",  secs: 30  },
  { label: "1m",   secs: 60  },
  { label: "5m",   secs: 300 },
  { label: "15m",  secs: 900 },
];

const QUICK_STAKES = [50, 100, 500, 1000];

const ASSET_CATEGORIES: Record<string, string[]> = {
  Crypto:      ["BTC", "ETH", "SOL", "BNB", "TON"],
  Forex:       ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  Commodities: ["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "COPPER"],
};

interface AssetMeta { color: string; icon: string; label: string; digits: number; prefix: string }

const ASSET_META: Record<string, AssetMeta> = {
  BTC:    { color: "#f7931a", icon: "₿",   label: "Bitcoin",     digits: 2, prefix: "$" },
  ETH:    { color: "#627eea", icon: "Ξ",   label: "Ethereum",    digits: 2, prefix: "$" },
  SOL:    { color: "#9945ff", icon: "◎",   label: "Solana",      digits: 3, prefix: "$" },
  BNB:    { color: "#f0b90b", icon: "⬡",   label: "BNB",         digits: 2, prefix: "$" },
  TON:    { color: "#0098ea", icon: "◆",   label: "Toncoin",     digits: 4, prefix: "$" },
  EURUSD: { color: "#0ea5e9", icon: "€$",  label: "EUR/USD",     digits: 5, prefix: "" },
  GBPUSD: { color: "#8b5cf6", icon: "£$",  label: "GBP/USD",     digits: 5, prefix: "" },
  USDJPY: { color: "#f59e0b", icon: "$¥",  label: "USD/JPY",     digits: 3, prefix: "" },
  AUDUSD: { color: "#22d3ee", icon: "A$",  label: "AUD/USD",     digits: 5, prefix: "" },
  USDCHF: { color: "#ef4444", icon: "$₣",  label: "USD/CHF",     digits: 5, prefix: "" },
  XAUUSD: { color: "#f59e0b", icon: "Au",  label: "Gold",        digits: 2, prefix: "$" },
  XAGUSD: { color: "#94a3b8", icon: "Ag",  label: "Silver",      digits: 3, prefix: "$" },
  USOIL:  { color: "#b45309", icon: "WTI", label: "Crude Oil",   digits: 2, prefix: "$" },
  NATGAS: { color: "#059669", icon: "NG",  label: "Nat Gas",     digits: 3, prefix: "$" },
  COPPER: { color: "#d97706", icon: "Cu",  label: "Copper",      digits: 4, prefix: "$" },
};

function formatPrice(symbol: string, price: number): string {
  const meta = ASSET_META[symbol];
  if (!meta) return `$${price.toFixed(2)}`;
  const formatted = price >= 1000
    ? price.toLocaleString("en-US", { minimumFractionDigits: meta.digits > 2 ? 2 : meta.digits, maximumFractionDigits: meta.digits > 2 ? 2 : meta.digits })
    : price.toFixed(meta.digits);
  return `${meta.prefix}${formatted}`;
}

// ─── Countdown timer ─────────────────────────────────────────────────────────

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
    <span className={`font-mono text-xs tabular-nums ${remaining < 10 ? "text-red-400 animate-pulse" : "text-muted-foreground"}`}>
      {mins > 0 ? `${mins}m ` : ""}{secs.toString().padStart(2, "0")}s
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Trading() {
  const { player, token } = useAuth();
  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const { subscribeWsEvent } = useNotifications();

  const [category, setCategory]     = useState<"Crypto" | "Forex" | "Commodities">("Crypto");
  const [selectedAsset, setSelected] = useState("BTC");
  const [interval, setInterval]     = useState<"1m" | "5m" | "15m">("1m");
  const [chartMode, setChartMode]   = useState<"candle" | "line">("candle");
  const [duration, setDuration]     = useState(60);
  const [stake, setStake]           = useState("100");
  const [streak, setStreak]         = useState(0);
  const [tab, setTab]               = useState<"active" | "history">("active");
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | "flat">("flat");

  const currentPriceRef = useRef<Record<string, number>>({});
  const prevPriceRef    = useRef<Record<string, number>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  const isAuthed = !!player;

  const { data: pricesData }  = useGetTradingPrices({ query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 3000 } });
  const { data: assetsData }  = useGetTradingAssets({ query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 15_000 } });
  const { data: activeData }  = useGetTradingPositionsActive({
    query: { queryKey: getGetTradingPositionsActiveQueryKey(), refetchInterval: isAuthed ? 3000 : false, enabled: isAuthed },
  });
  const { data: historyData } = useGetTradingPositions({
    query: { queryKey: getGetTradingPositionsQueryKey(), refetchInterval: isAuthed ? 10_000 : false, enabled: isAuthed },
  });

  // Seed current prices from REST poll
  useEffect(() => {
    if (!pricesData?.prices) return;
    const next: Record<string, number> = { ...currentPriceRef.current };
    Object.entries(pricesData.prices).forEach(([sym, p]) => {
      if (typeof p === "number" && p > 0) next[sym] = p;
    });
    currentPriceRef.current = next;
    setCurrentPrices({ ...next });
  }, [pricesData]);

  // WS price_update → instant chart updates
  useEffect(() => {
    return subscribeWsEvent("price_update", (data) => {
      const sym   = String(data.symbol ?? "");
      const price = Number(data.price  ?? 0);
      if (!sym || price <= 0) return;
      currentPriceRef.current[sym] = price;
      setCurrentPrices((prev) => ({ ...prev, [sym]: price }));
    });
  }, [subscribeWsEvent]);

  // Price flash animation
  const selectedPrice = currentPrices[selectedAsset];
  useEffect(() => {
    if (selectedPrice === undefined) return;
    const prev = prevPriceRef.current[selectedAsset];
    if (prev !== undefined && selectedPrice !== prev) {
      setPriceFlash(selectedPrice > prev ? "up" : "down");
      const t = setTimeout(() => setPriceFlash("flat"), 700);
      return () => clearTimeout(t);
    }
    prevPriceRef.current[selectedAsset] = selectedPrice;
  }, [selectedPrice, selectedAsset]);

  // WS trade_settled → toast + refresh + streak update
  useEffect(() => {
    return subscribeWsEvent("trade_settled", (data) => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });

      const newStreak = Number(data.streak ?? 0);
      setStreak(newStreak);

      const outcome = String(data.outcome ?? "");
      const credit  = Number(data.creditAmount ?? 0);
      const sym     = String(data.assetSymbol ?? "");

      if (outcome === "win") {
        toast({
          title: `WIN! +${Math.round(credit).toLocaleString()} STRK`,
          description: newStreak >= 2
            ? `${sym} ${data.direction} — ${newStreak} in a row!`
            : `${sym} ${data.direction} — you called it right`,
        });
      } else if (outcome === "loss") {
        toast({
          title: "Position closed",
          description: `${sym} ${data.direction} — better luck next trade`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Trade refunded", description: `${sym} settled at entry price` });
      }
    });
  }, [subscribeWsEvent, queryClient, toast]);

  const openPositionMutation = usePostTradingPositions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });
        setTab("active");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to open position";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const apiAssets      = assetsData?.assets ?? [];
  const activePositions = activeData?.positions ?? [];
  const history        = (historyData?.positions ?? []).filter((p) => p.outcome !== "pending");

  // Derive payout for selected asset (with possible streak boost)
  const selectedAssetData = apiAssets.find((a) => a.symbol === selectedAsset);
  const basePayoutRatio   = selectedAssetData?.payoutRatio ?? 1.82;
  const streakBoostPct    = streak >= 5 ? 7 : streak >= 4 ? 5 : streak >= 3 ? 3 : streak >= 2 ? 2 : 0;
  const effectivePayout   = streakBoostPct > 0 ? Math.min(1.95, basePayoutRatio + basePayoutRatio * streakBoostPct / 100) : basePayoutRatio;
  const payoutPct         = Math.round((effectivePayout - 1) * 100);
  const stakeNum          = parseFloat(stake) || 0;
  const potentialWin      = (stakeNum * effectivePayout).toFixed(0);

  // Assets available per current category that exist in the API
  const categorySymbols = ASSET_CATEGORIES[category] ?? [];
  const displayAssets   = categorySymbols
    .map((sym) => apiAssets.find((a) => a.symbol === sym) ?? { symbol: sym, displayName: ASSET_META[sym]?.label ?? sym, payoutRatio: 1.82, minStakeStriker: 10, maxStakeStriker: 10000 })
    .filter(Boolean);

  // Auto-select first asset when switching category
  const handleCategoryChange = useCallback((cat: "Crypto" | "Forex" | "Commodities") => {
    setCategory(cat);
    const first = ASSET_CATEGORIES[cat]?.[0];
    if (first) setSelected(first);
  }, []);

  // Active position for selected asset (for entry price line on chart)
  const activeForAsset = activePositions.filter((p) => p.assetSymbol === selectedAsset);
  const entryPrice     = activeForAsset[0]?.entryPrice ?? null;

  const meta         = ASSET_META[selectedAsset];
  const accentColor  = meta?.color ?? "#00ff88";

  function handleTrade(direction: "UP" | "DOWN") {
    if (!player) { toast({ title: "Not logged in", variant: "destructive" }); return; }
    if (stakeNum <= 0) { toast({ title: "Enter a stake amount", variant: "destructive" }); return; }
    openPositionMutation.mutate({
      data: { assetSymbol: selectedAsset, direction, stakeStriker: stakeNum, contractDurationSecs: duration },
    });
  }

  return (
    <Layout>
      <div className="flex flex-col min-h-full pb-4">

        {/* ── Category tabs ─────────────────────────────────── */}
        <div className="px-3 pt-3 pb-1 flex gap-1">
          {(["Crypto", "Forex", "Commodities"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                category === cat ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Asset selector ────────────────────────────────── */}
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {displayAssets.map((a) => {
              const sym    = a.symbol;
              const aPrice = currentPrices[sym];
              const aMeta  = ASSET_META[sym];
              const isActive = sym === selectedAsset;
              return (
                <button
                  key={sym}
                  onClick={() => setSelected(sym)}
                  style={isActive ? { borderColor: aMeta?.color ?? "#00ff88" } : {}}
                  className={`flex-shrink-0 flex flex-col items-center px-2.5 py-2 rounded-xl border text-xs font-bold transition-all min-w-[64px] ${
                    isActive ? "bg-white/5" : "border-border text-muted-foreground hover:border-white/20"
                  }`}
                >
                  <span style={{ color: isActive ? aMeta?.color : undefined }} className="text-sm font-black">
                    {aMeta?.icon ?? sym[0]}
                  </span>
                  <span style={{ color: isActive ? aMeta?.color : undefined }} className="font-black text-[10px]">
                    {sym.length > 6 ? sym.slice(0, 6) : sym}
                  </span>
                  {aPrice ? (
                    <span className="text-[8px] font-mono mt-0.5 text-muted-foreground tabular-nums">
                      {aPrice >= 1000 ? `$${Math.round(aPrice).toLocaleString()}` : aPrice.toFixed(meta?.digits ?? 2 > 3 ? 3 : meta?.digits ?? 2)}
                    </span>
                  ) : (
                    <span className="text-[8px] text-muted-foreground/50 mt-0.5">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chart panel ───────────────────────────────────── */}
        <div className="px-3 mb-2">
          <div className="rounded-xl border border-border bg-card overflow-hidden">

            {/* Chart header */}
            <div className="px-4 pt-3 pb-1.5 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase mb-0.5">
                  {meta?.label ?? selectedAsset} · {
                    ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCHF"].includes(selectedAsset) ? "Forex"
                    : ["XAUUSD","XAGUSD","USOIL","NATGAS","COPPER"].includes(selectedAsset) ? "Commodities"
                    : "Crypto"
                  }
                </p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${selectedAsset}-${(selectedPrice ?? 0).toFixed(2)}`}
                    initial={{ opacity: 0.5, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.12 }}
                    className={`text-2xl font-mono font-black tabular-nums tracking-tight transition-colors duration-300 ${
                      priceFlash === "up" ? "text-green-400"
                      : priceFlash === "down" ? "text-red-400"
                      : "text-white"
                    }`}
                  >
                    {selectedPrice
                      ? formatPrice(selectedAsset, selectedPrice)
                      : <span className="text-muted-foreground text-base animate-pulse">Connecting…</span>
                    }
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="flex flex-col items-end gap-1.5 ml-2 shrink-0">
                {/* Payout badge */}
                <div
                  className="px-2.5 py-1 rounded-lg text-xs font-black tabular-nums"
                  style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44` }}
                >
                  {payoutPct}% payout
                  {streakBoostPct > 0 && <span className="text-orange-300 ml-1">+{streakBoostPct}%</span>}
                </div>

                {/* Controls */}
                <div className="flex gap-1">
                  {/* Interval */}
                  {(["1m", "5m", "15m"] as const).map((iv) => (
                    <button
                      key={iv}
                      onClick={() => setInterval(iv)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                        interval === iv ? "bg-white/15 text-white" : "text-muted-foreground hover:text-white"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                  {/* Chart mode */}
                  <button
                    onClick={() => setChartMode((m) => m === "candle" ? "line" : "candle")}
                    className="p-1 rounded text-muted-foreground hover:text-white transition-colors"
                    title={chartMode === "candle" ? "Switch to line" : "Switch to candles"}
                  >
                    {chartMode === "candle" ? <LineChart size={11} /> : <CandlestickChart size={11} />}
                  </button>
                </div>
              </div>
            </div>

            {/* lightweight-charts chart */}
            <div className="h-[190px] w-full">
              <TradingChart
                symbol={selectedAsset}
                interval={interval}
                currentPrice={selectedPrice ?? null}
                entryPrice={entryPrice}
                chartMode={chartMode}
                token={token}
              />
            </div>
          </div>
        </div>

        {/* ── Streak badge ───────────────────────────────────── */}
        {streak >= 2 && (
          <div className="px-3 mb-1">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/25">
              <Flame size={14} className="text-orange-400 shrink-0" />
              <span className="text-xs font-bold text-orange-300">{streak}× win streak</span>
              <span className="text-[10px] text-orange-400/70 ml-1">— +{streakBoostPct}% payout boost active</span>
            </div>
          </div>
        )}

        {/* ── Duration ──────────────────────────────────────── */}
        <div className="px-3 mt-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-0.5">Contract Duration</p>
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

        {/* ── Stake ─────────────────────────────────────────── */}
        <div className="px-3 mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Stake (STRK)</p>
            {player && (
              <p className="text-[10px] text-muted-foreground">
                Bal: <span className="text-white font-bold">{Math.round(player.strikerBalance ?? 0).toLocaleString()}</span>
              </p>
            )}
          </div>
          <div className="flex gap-1.5 mb-1.5">
            {QUICK_STAKES.map((q) => (
              <button
                key={q}
                onClick={() => setStake(String(q))}
                className={`flex-1 py-1.5 rounded-md border text-xs font-bold transition-all ${
                  stake === String(q)
                    ? "border-white/30 text-white bg-white/5"
                    : "border-border text-muted-foreground hover:text-white hover:border-white/20"
                }`}
              >
                {q >= 1000 ? `${q / 1000}k` : q}
              </button>
            ))}
          </div>
          <Input
            type="number"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Custom amount"
            className="font-mono text-base h-11"
          />
          {stakeNum > 0 && (
            <div className="flex items-center justify-between mt-1 px-0.5">
              <p className="text-[10px] text-muted-foreground">
                To win: <span className="text-green-400 font-bold text-xs">+{Number(potentialWin).toLocaleString()} STRK</span>
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Zap size={9} className="text-yellow-400" />
                Settle in {DURATIONS.find((d) => d.secs === duration)?.label}
              </p>
            </div>
          )}
        </div>

        {/* ── Trade buttons ─────────────────────────────────── */}
        <div className="px-3 mt-3 grid grid-cols-2 gap-3">
          <Button
            className="h-16 text-xl font-black bg-green-600 hover:bg-green-500 active:scale-95 text-white flex flex-col gap-0.5 disabled:opacity-40 transition-transform"
            onClick={() => handleTrade("UP")}
            disabled={openPositionMutation.isPending || !stakeNum}
          >
            <TrendingUp size={22} />
            <span className="text-xs font-bold">UP · {payoutPct}%</span>
          </Button>
          <Button
            className="h-16 text-xl font-black bg-red-600 hover:bg-red-500 active:scale-95 text-white flex flex-col gap-0.5 disabled:opacity-40 transition-transform"
            onClick={() => handleTrade("DOWN")}
            disabled={openPositionMutation.isPending || !stakeNum}
          >
            <TrendingDown size={22} />
            <span className="text-xs font-bold">DOWN · {payoutPct}%</span>
          </Button>
        </div>

        {/* ── Positions ─────────────────────────────────────── */}
        <div className="px-3 mt-4">
          <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1">
            <button
              onClick={() => setTab("active")}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                tab === "active" ? "bg-card text-white shadow" : "text-muted-foreground"
              }`}
            >
              Active {activePositions.length > 0 && (
                <span className="ml-1 bg-primary/20 text-primary rounded-full px-1.5 py-0.5 text-[9px]">
                  {activePositions.length}
                </span>
              )}
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
                {!isAuthed ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Log in via Telegram to trade</div>
                ) : activePositions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No active positions — place a trade above</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activePositions.map((p) => {
                      const livePrice = currentPrices[p.assetSymbol];
                      const priceDiff = livePrice && p.entryPrice ? livePrice - p.entryPrice : null;
                      const isWinning = priceDiff !== null
                        ? (p.direction === "UP" ? priceDiff > 0 : priceDiff < 0)
                        : null;
                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`bg-card border rounded-xl px-3 py-3 ${
                            isWinning === true ? "border-green-500/30"
                            : isWinning === false ? "border-red-500/30"
                            : "border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {p.direction === "UP"
                                ? <TrendingUp size={14} className="text-green-400 shrink-0" />
                                : <TrendingDown size={14} className="text-red-400 shrink-0" />}
                              <span className="font-bold text-sm">{p.assetSymbol}</span>
                              <span className={`text-xs font-bold ${p.direction === "UP" ? "text-green-400" : "text-red-400"}`}>
                                {p.direction}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock size={11} className="text-muted-foreground" />
                              <Countdown expiresAt={p.expiresAt} />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                            <div>Stake <span className="text-white font-bold">{p.stakeStriker.toLocaleString()}</span></div>
                            <div>Entry <span className="text-white font-mono">{formatPrice(p.assetSymbol, p.entryPrice)}</span></div>
                            <div>
                              Now{" "}
                              <span className={`font-mono font-bold ${isWinning === true ? "text-green-400" : isWinning === false ? "text-red-400" : "text-muted-foreground"}`}>
                                {livePrice ? formatPrice(p.assetSymbol, livePrice) : "…"}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {!isAuthed ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Log in via Telegram to see history</div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No completed trades yet</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {history.slice(0, 20).map((p) => (
                      <div key={p.id} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {p.outcome === "win"
                            ? <CheckCircle size={14} className="text-green-400 shrink-0" />
                            : p.outcome === "cancelled"
                            ? <MinusCircle size={14} className="text-yellow-400 shrink-0" />
                            : <XCircle size={14} className="text-red-400 shrink-0" />}
                          <div>
                            <p className="text-xs font-bold">{p.assetSymbol} <span className={p.direction === "UP" ? "text-green-400" : "text-red-400"}>{p.direction}</span></p>
                            <p className="text-[9px] text-muted-foreground font-mono">{new Date(p.createdAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-bold tabular-nums ${p.outcome === "win" ? "text-green-400" : p.outcome === "cancelled" ? "text-yellow-400" : "text-red-400"}`}>
                            {p.outcome === "win"
                              ? `+${Math.round(p.winAmount).toLocaleString()}`
                              : p.outcome === "cancelled"
                              ? `±0`
                              : `-${Math.round(p.stakeStriker).toLocaleString()}`}
                            {" STRK"}
                          </p>
                          <p className="text-[9px] text-muted-foreground">{Math.round(p.stakeStriker).toLocaleString()} staked</p>
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
