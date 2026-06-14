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
import { TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, MinusCircle, Zap } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine, Tooltip } from "recharts";

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

const ASSET_ICONS: Record<string, string> = {
  BTC: "₿",
  ETH: "Ξ",
  SOL: "◎",
  BNB: "⬡",
  TON: "💎",
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
    <span className={`font-mono text-xs tabular-nums ${remaining < 10 ? "text-red-400 animate-pulse" : "text-muted-foreground"}`}>
      {mins > 0 ? `${mins}m ` : ""}{secs.toString().padStart(2, "0")}s
    </span>
  );
}

interface PricePoint { t: number; v: number; }

export function Trading() {
  const { player } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subscribeWsEvent } = useNotifications();

  const [selectedAsset, setSelectedAsset] = useState("BTC");
  const [duration, setDuration] = useState(60);
  const [stake, setStake] = useState("100");
  const [tab, setTab] = useState<"active" | "history">("active");

  const selectedAssetRef = useRef(selectedAsset);
  useEffect(() => { selectedAssetRef.current = selectedAsset; }, [selectedAsset]);

  // Price chart buffer — keyed by symbol, last 80 points
  const priceBufferRef = useRef<Record<string, PricePoint[]>>({});
  const [chartVersion, setChartVersion] = useState(0);

  const prevPriceRef = useRef<Record<string, number>>({});
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | "flat">("flat");

  const isAuthed = !!player;

  const { data: pricesData } = useGetTradingPrices({ query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 2000 } });
  const { data: assetsData } = useGetTradingAssets({ query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 15_000 } });
  const { data: activeData } = useGetTradingPositionsActive({
    query: { queryKey: getGetTradingPositionsActiveQueryKey(), refetchInterval: isAuthed ? 3000 : false, enabled: isAuthed },
  });
  const { data: historyData } = useGetTradingPositions({
    query: { queryKey: getGetTradingPositionsQueryKey(), refetchInterval: isAuthed ? 10_000 : false, enabled: isAuthed },
  });

  // Push a price point into the buffer for a given symbol
  const pushPrice = useCallback((symbol: string, price: number) => {
    const buf = priceBufferRef.current[symbol] ?? [];
    const last = buf[buf.length - 1];
    if (last && Math.abs(last.v - price) < 0.000001) return; // dedupe exact same value
    priceBufferRef.current[symbol] = [...buf, { t: Date.now(), v: price }].slice(-80);
    if (symbol === selectedAssetRef.current) {
      setChartVersion((c) => c + 1);
    }
  }, []);

  // Subscribe to WS price_update for instant chart updates (no polling delay)
  useEffect(() => {
    return subscribeWsEvent("price_update", (data) => {
      const sym = String(data.symbol ?? "");
      const price = Number(data.price ?? 0);
      if (sym && price > 0) pushPrice(sym, price);
    });
  }, [subscribeWsEvent, pushPrice]);

  // Fallback: also seed from REST poll (catches up if WS hasn't connected yet)
  useEffect(() => {
    if (!pricesData?.prices) return;
    Object.entries(pricesData.prices).forEach(([sym, price]) => {
      if (typeof price === "number" && price > 0) pushPrice(sym, price);
    });
  }, [pricesData, pushPrice]);

  // Subscribe to trade_settled for instant win/loss toast (no waiting for next poll)
  useEffect(() => {
    return subscribeWsEvent("trade_settled", (data) => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });
      const outcome = String(data.outcome ?? "");
      const credit = Number(data.creditAmount ?? 0);
      const sym = String(data.assetSymbol ?? "");
      if (outcome === "win") {
        toast({
          title: `WIN! +${Math.round(credit).toLocaleString()} STRK`,
          description: `${sym} ${data.direction} settled — you called it right`,
        });
      } else if (outcome === "loss") {
        toast({
          title: "Position closed",
          description: `${sym} ${data.direction} — better luck next trade`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Trade refunded", description: `${sym} settled at the same price` });
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

  const prices = pricesData?.prices ?? {};
  const assets = assetsData?.assets ?? [];
  const activePositions = activeData?.positions ?? [];
  const history = (historyData?.positions ?? []).filter((p) => p.outcome !== "pending");

  const currentPrice = prices[selectedAsset];
  const prevPrice = prevPriceRef.current[selectedAsset];

  // Price direction flash + prev tracking
  useEffect(() => {
    if (currentPrice === undefined) return undefined;
    if (prevPrice !== undefined && currentPrice !== prevPrice) {
      setPriceFlash(currentPrice > prevPrice ? "up" : "down");
    }
    const t1 = setTimeout(() => setPriceFlash("flat"), 800);
    const t2 = setTimeout(() => { prevPriceRef.current[selectedAsset] = currentPrice; }, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentPrice, selectedAsset, prevPrice]);

  const selectedAssetData = assets.find((a) => a.symbol === selectedAsset);
  const payoutRatio = selectedAssetData?.payoutRatio ?? 1.82;
  const stakeNum = parseFloat(stake) || 0;
  const potentialWin = (stakeNum * payoutRatio).toFixed(0);
  const accentColor = ASSET_COLORS[selectedAsset] ?? "#00ff88";

  // Chart data for selected asset
  const chartData = priceBufferRef.current[selectedAsset] ?? [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _chartVersion = chartVersion; // read to trigger re-render
  const chartTrend = chartData.length >= 2
    ? chartData[chartData.length - 1].v >= chartData[0].v ? "up" : "down"
    : "flat";
  const chartColor = chartTrend === "up" ? "#22c55e" : chartTrend === "down" ? "#ef4444" : accentColor;
  const chartMin = chartData.length > 0 ? Math.min(...chartData.map((d) => d.v)) * 0.9999 : 0;
  const chartMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.v)) * 1.0001 : 1;

  // Active positions for this asset (for entry price reference line)
  const activeForAsset = activePositions.filter((p) => p.assetSymbol === selectedAsset);

  function handleTrade(direction: "UP" | "DOWN") {
    if (!player) { toast({ title: "Not logged in", variant: "destructive" }); return; }
    if (stakeNum <= 0) { toast({ title: "Enter a stake amount", variant: "destructive" }); return; }
    openPositionMutation.mutate({
      data: { assetSymbol: selectedAsset, direction, stakeStriker: stakeNum, contractDurationSecs: duration },
    });
  }

  const formatPrice = (p: number) =>
    p > 1000
      ? `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${p.toFixed(4)}`;

  const fallbackAssets = ["BTC", "ETH", "SOL", "BNB", "TON"].map((s) => ({ symbol: s, displayName: s, payoutRatio: 1.82, binanceSymbol: "", minStakeStriker: 10, maxStakeStriker: 10000, currentPrice: null }));
  const displayAssets = assets.length > 0 ? assets : fallbackAssets;

  return (
    <Layout>
      <div className="flex flex-col min-h-full pb-4">

        {/* ── Asset selector ───────────────────────────────── */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {displayAssets.map((a) => {
              const sym = a.symbol;
              const aPrice = prices[sym];
              const aBuf = priceBufferRef.current[sym] ?? [];
              const aTrend = aBuf.length >= 2
                ? aBuf[aBuf.length - 1].v > aBuf[0].v ? "up" : aBuf[aBuf.length - 1].v < aBuf[0].v ? "down" : "flat"
                : "flat";
              const isActive = sym === selectedAsset;
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedAsset(sym)}
                  style={isActive ? { borderColor: ASSET_COLORS[sym] ?? "#00ff88" } : {}}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-bold transition-all min-w-[68px] ${
                    isActive ? "bg-white/5" : "border-border text-muted-foreground hover:border-white/20"
                  }`}
                >
                  <span style={{ color: isActive ? (ASSET_COLORS[sym] ?? "#00ff88") : undefined }}
                    className="text-sm font-black">{ASSET_ICONS[sym] ?? sym[0]}</span>
                  <span style={{ color: isActive ? (ASSET_COLORS[sym] ?? "#00ff88") : undefined }}
                    className="font-black">{sym}</span>
                  {aPrice ? (
                    <span className={`text-[9px] font-mono mt-0.5 ${
                      aTrend === "up" ? "text-green-400" : aTrend === "down" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {aPrice > 1000
                        ? `$${Math.round(aPrice).toLocaleString()}`
                        : `$${aPrice.toFixed(2)}`}
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground mt-0.5">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Price chart ──────────────────────────────────── */}
        <div className="px-3 mb-1">
          <div className="relative rounded-xl overflow-hidden border border-border bg-card">
            {/* Price header */}
            <div className="px-4 pt-3 pb-1 flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">{selectedAsset}/USDT · Binance live</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${selectedAsset}-${currentPrice?.toFixed(2)}`}
                    initial={{ opacity: 0.6, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`text-3xl font-mono font-black tabular-nums tracking-tight mt-0.5 transition-colors duration-300 ${
                      priceFlash === "up" ? "text-green-400"
                      : priceFlash === "down" ? "text-red-400"
                      : "text-white"
                    }`}
                  >
                    {currentPrice ? formatPrice(currentPrice) : (
                      <span className="text-muted-foreground text-xl animate-pulse">Connecting…</span>
                    )}
                  </motion.p>
                </AnimatePresence>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  chartTrend === "up"
                    ? "bg-green-500/15 border-green-500/30 text-green-400"
                    : chartTrend === "down"
                    ? "bg-red-500/15 border-red-500/30 text-red-400"
                    : "bg-white/5 border-white/10 text-muted-foreground"
                }`}>
                  {chartTrend === "up" ? <TrendingUp size={10} /> : chartTrend === "down" ? <TrendingDown size={10} /> : null}
                  {chartTrend === "up" ? "UP" : chartTrend === "down" ? "DOWN" : "FLAT"}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Payout <span className="text-white font-bold">{payoutRatio}×</span>
                </p>
              </div>
            </div>

            {/* Recharts area chart */}
            <div className="h-[130px] w-full px-0">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`grad-${selectedAsset}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[chartMin, chartMax]} hide />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const val = Number(payload[0]?.value ?? 0);
                        return (
                          <div className="bg-card border border-border rounded px-2 py-1 text-[10px] font-mono text-white shadow-lg">
                            {formatPrice(val)}
                          </div>
                        );
                      }}
                    />
                    {/* Entry price reference lines for active positions */}
                    {activeForAsset.map((p) => (
                      <ReferenceLine
                        key={p.id}
                        y={p.entryPrice}
                        stroke={p.direction === "UP" ? "#22c55e" : "#ef4444"}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        opacity={0.6}
                      />
                    ))}
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={chartColor}
                      strokeWidth={2}
                      fill={`url(#grad-${selectedAsset})`}
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[11px] text-muted-foreground animate-pulse">Loading price data…</p>
                </div>
              )}
            </div>

            {/* Chart time label */}
            {chartData.length > 1 && (
              <p className="text-[9px] text-muted-foreground text-right px-4 pb-2 font-mono">
                {chartData.length} ticks · live
              </p>
            )}
          </div>
        </div>

        {/* ── Duration selector ────────────────────────────── */}
        <div className="px-3 mt-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-0.5">Contract Duration</p>
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

        {/* ── Stake input ───────────────────────────────────── */}
        <div className="px-3 mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Stake (STRK)</p>
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

        {/* ── UP / DOWN buttons ─────────────────────────────── */}
        <div className="px-3 mt-3 grid grid-cols-2 gap-3">
          <Button
            className="h-16 text-xl font-black bg-green-600 hover:bg-green-500 active:scale-95 text-white flex flex-col gap-0.5 disabled:opacity-40 transition-transform"
            onClick={() => handleTrade("UP")}
            disabled={openPositionMutation.isPending || !stakeNum}
          >
            <TrendingUp size={22} />
            <span className="text-xs font-bold">UP · {payoutRatio}×</span>
          </Button>
          <Button
            className="h-16 text-xl font-black bg-red-600 hover:bg-red-500 active:scale-95 text-white flex flex-col gap-0.5 disabled:opacity-40 transition-transform"
            onClick={() => handleTrade("DOWN")}
            disabled={openPositionMutation.isPending || !stakeNum}
          >
            <TrendingDown size={22} />
            <span className="text-xs font-bold">DOWN · {payoutRatio}×</span>
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
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Log in via Telegram to trade
                  </div>
                ) : activePositions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No active positions — place a trade above
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activePositions.map((p) => {
                      const livePrice = prices[p.assetSymbol];
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
                            isWinning === true ? "border-green-500/40" : isWinning === false ? "border-red-500/40" : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                                p.direction === "UP" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                              }`}>
                                {p.direction === "UP" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {p.direction}
                              </div>
                              <div>
                                <p className="text-xs font-bold">
                                  {p.assetSymbol}
                                  <span className="text-muted-foreground font-normal"> @ {formatPrice(p.entryPrice)}</span>
                                </p>
                                <p className="text-[10px] text-muted-foreground">{p.stakeStriker.toLocaleString()} STRK stake</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 justify-end text-muted-foreground">
                                <Clock size={11} />
                                <Countdown expiresAt={p.expiresAt} />
                              </div>
                              {livePrice && (
                                <p className={`text-[10px] font-mono font-bold mt-0.5 ${
                                  isWinning ? "text-green-400" : "text-red-400"
                                }`}>
                                  {formatPrice(livePrice)}
                                  {priceDiff !== null && (
                                    <span className="ml-1">
                                      ({priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(2)})
                                    </span>
                                  )}
                                </p>
                              )}
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
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Log in via Telegram to see history
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No settled trades yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {history.slice(0, 20).map((p) => (
                      <div
                        key={p.id}
                        className={`bg-card border rounded-xl px-3 py-2.5 flex items-center justify-between ${
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
                              <span className={p.direction === "UP" ? "text-green-400" : "text-red-400"}>
                                {p.direction}
                              </span>
                              <span className="text-muted-foreground font-normal">
                                {" "}· {DURATIONS.find((d) => d.secs === p.contractDurationSecs)?.label ?? `${p.contractDurationSecs}s`}
                              </span>
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {formatPrice(p.entryPrice)}
                              {p.exitPrice ? ` → ${formatPrice(p.exitPrice)}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {p.outcome === "win" ? (
                            <p className="text-green-400 font-bold text-sm">+{p.winAmount.toLocaleString()}</p>
                          ) : p.outcome === "loss" ? (
                            <p className="text-red-400 font-bold text-sm">−{p.stakeStriker.toLocaleString()}</p>
                          ) : (
                            <p className="text-muted-foreground font-bold text-sm">Refunded</p>
                          )}
                          <p className="text-[9px] text-muted-foreground">STRK</p>
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
