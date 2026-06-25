import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/ws-notifications";
import {
  useGetTradingConfig,
  useGetTradingAssets,
  useGetTradingPrices,
  useGetTradingPositionsActive,
  useGetTradingPositions,
  usePostTradingPositions,
  getGetMeQueryKey,
  getGetTradingConfigQueryKey,
  getGetTradingAssetsQueryKey,
  getGetTradingPricesQueryKey,
  getGetTradingPositionsActiveQueryKey,
  getGetTradingPositionsQueryKey,
  useGetDemoPositionsActive,
  useGetDemoPositions,
  usePostDemoPositions,
  getGetDemoPositionsActiveQueryKey,
  getGetDemoPositionsQueryKey,
  useGetMyPortfolio,
  getGetMyPortfolioQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Clock, CheckCircle, XCircle,
  MinusCircle, Zap, Flame, CandlestickChart, LineChart, Coins, FlaskConical, Trophy,
  Bot, Play, Square,
} from "lucide-react";
import { TradingChart } from "@/components/trading-chart";
import { soundManager } from "@/lib/sound";

// ─── Local types ────────────────────────────────────────────────────────────
type ContractType    = "UP_DOWN" | "EVEN_ODD" | "OVER_UNDER" | "IN_OUT";
type TradingCurrency = "TON" | "USDT";

// ─── Constants ────────────────────────────────────────────────────────────────

function secsToLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${secs / 60}m`;
  return `${secs / 3600}h`;
}

const DEFAULT_DURATIONS = [30, 60, 300, 900];

const ASSET_CATEGORIES: Record<string, string[]> = {
  Crypto:      ["BTC", "ETH", "SOL", "BNB", "TON", "XRP", "DOGE", "AVAX", "MATIC"],
  Forex:       ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  Commodities: ["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "COPPER"],
  Indices:     ["SPX", "NDX", "DJI", "DAX", "FTSE", "NKY"],
};

interface AssetMeta { color: string; icon: string; label: string; digits: number; prefix: string }

const ASSET_META: Record<string, AssetMeta> = {
  BTC:    { color: "#f7931a", icon: "₿",   label: "Bitcoin",    digits: 2, prefix: "$" },
  ETH:    { color: "#627eea", icon: "Ξ",   label: "Ethereum",   digits: 2, prefix: "$" },
  SOL:    { color: "#9945ff", icon: "◎",   label: "Solana",     digits: 3, prefix: "$" },
  BNB:    { color: "#f0b90b", icon: "⬡",   label: "BNB",        digits: 2, prefix: "$" },
  TON:    { color: "#0098ea", icon: "◆",   label: "Toncoin",    digits: 4, prefix: "$" },
  XRP:    { color: "#00aae4", icon: "✕",   label: "XRP",        digits: 4, prefix: "$" },
  DOGE:   { color: "#c2a633", icon: "Ð",   label: "Dogecoin",   digits: 5, prefix: "$" },
  AVAX:   { color: "#e84142", icon: "▲",   label: "Avalanche",  digits: 3, prefix: "$" },
  MATIC:  { color: "#8247e5", icon: "M",   label: "Polygon",    digits: 4, prefix: "$" },
  EURUSD: { color: "#0ea5e9", icon: "€$",  label: "EUR/USD",    digits: 5, prefix: "" },
  GBPUSD: { color: "#8b5cf6", icon: "£$",  label: "GBP/USD",    digits: 5, prefix: "" },
  USDJPY: { color: "#f59e0b", icon: "$¥",  label: "USD/JPY",    digits: 3, prefix: "" },
  AUDUSD: { color: "#22d3ee", icon: "A$",  label: "AUD/USD",    digits: 5, prefix: "" },
  USDCHF: { color: "#ef4444", icon: "$₣",  label: "USD/CHF",    digits: 5, prefix: "" },
  XAUUSD: { color: "#f59e0b", icon: "Au",  label: "Gold",       digits: 2, prefix: "$" },
  XAGUSD: { color: "#94a3b8", icon: "Ag",  label: "Silver",     digits: 3, prefix: "$" },
  USOIL:  { color: "#b45309", icon: "WTI", label: "Crude Oil",  digits: 2, prefix: "$" },
  NATGAS: { color: "#059669", icon: "NG",  label: "Nat Gas",    digits: 3, prefix: "$" },
  COPPER: { color: "#d97706", icon: "Cu",  label: "Copper",     digits: 4, prefix: "$" },
  SPX:    { color: "#22c55e", icon: "SP",  label: "S&P 500",    digits: 2, prefix: "" },
  NDX:    { color: "#3b82f6", icon: "NQ",  label: "NASDAQ 100", digits: 2, prefix: "" },
  DJI:    { color: "#0ea5e9", icon: "DJ",  label: "Dow Jones",  digits: 2, prefix: "" },
  DAX:    { color: "#f59e0b", icon: "DX",  label: "DAX 40",     digits: 2, prefix: "" },
  FTSE:   { color: "#ef4444", icon: "FT",  label: "FTSE 100",   digits: 2, prefix: "" },
  NKY:    { color: "#ec4899", icon: "NK",  label: "Nikkei 225", digits: 0, prefix: "" },
};

// Defensively converts any API-returned value (Drizzle numeric returns strings)
function asNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatPrice(symbol: string, price: number | null | undefined): string {
  const n = asNum(price);
  if (!Number.isFinite(n)) return "—";
  const meta = ASSET_META[symbol];
  if (!meta) return `$${n.toFixed(2)}`;
  const formatted = n >= 1000
    ? n.toLocaleString("en-US", { minimumFractionDigits: meta.digits > 2 ? 2 : meta.digits, maximumFractionDigits: meta.digits > 2 ? 2 : meta.digits })
    : n.toFixed(meta.digits);
  return `${meta.prefix}${formatted}`;
}

function fmtChange(pct: number | null | undefined): string {
  const n = asNum(pct);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Asset decimal precision — must mirror server-side ASSET_DECIMAL_PLACES
// Used for EVEN_ODD and OVER_UNDER live P&L calculation
const ASSET_DECIMAL_PLACES: Record<string, number> = {
  BTC: 2, ETH: 2, SOL: 3, BNB: 2, TON: 4,
  XRP: 4, DOGE: 4, AVAX: 3, MATIC: 4,
  EURUSD: 5, GBPUSD: 5, USDJPY: 3, AUDUSD: 5, USDCHF: 5,
  XAUUSD: 2, XAGUSD: 3, USOIL: 2, NATGAS: 3, COPPER: 4,
  SPX: 2, NDX: 2, DAX: 2, FTSE: 2, NKY: 2, DJI: 2,
};

function lastDigitAt(price: number, decimals: number): number {
  return Math.round(Math.abs(price) * Math.pow(10, decimals)) % 10;
}

// Contract type metadata
const CONTRACT_META: Record<ContractType, { label: string; desc: string; btnA: string; btnB: string; dirA: string; dirB: string }> = {
  UP_DOWN:    { label: "Up / Down",    desc: "Will price be higher or lower at expiry?",                   btnA: "UP",   btnB: "DOWN",  dirA: "UP",   dirB: "DOWN"  },
  EVEN_ODD:   { label: "Even / Odd",   desc: "Last decimal digit of exit price: even (0,2,4,6,8) or odd?", btnA: "EVEN", btnB: "ODD",   dirA: "EVEN", dirB: "ODD"   },
  OVER_UNDER: { label: "Over / Under", desc: "Last decimal digit: 5-9 (Over) or 0-4 (Under)?",             btnA: "OVER", btnB: "UNDER", dirA: "OVER", dirB: "UNDER" },
  IN_OUT:     { label: "In / Out",     desc: "Will price stay IN ±0.5% band, or break OUT?",               btnA: "IN",   btnB: "OUT",   dirA: "IN",   dirB: "OUT"   },
};

// ─── Countdown timer ──────────────────────────────────────────────────────────

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

// ─── Position progress bar ────────────────────────────────────────────────────

function PositionProgressBar({ createdAt, expiresAt, isWinning }: { createdAt: string; expiresAt: string; isWinning: boolean | null }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const created = new Date(createdAt).getTime();
    const expires = new Date(expiresAt).getTime();
    const total   = expires - created;
    const update  = () => setProgress(Math.min(100, Math.max(0, (Date.now() - created) / total * 100)));
    update();
    const id = setInterval(update, 800);
    return () => clearInterval(id);
  }, [createdAt, expiresAt]);

  return (
    <div className="h-0.5 bg-white/6 rounded-full overflow-hidden my-1.5">
      <div
        className={`h-full rounded-full transition-colors duration-500 ${
          isWinning === true ? "bg-green-400/80" : isWinning === false ? "bg-red-400/80" : "bg-white/20"
        }`}
        style={{ width: `${progress}%`, transition: "width 0.8s linear" }}
      />
    </div>
  );
}

// ─── Barrier band display ─────────────────────────────────────────────────────

function BarrierBand({ symbol, lowerBarrier, upperBarrier, currentPrice }: {
  symbol: string; lowerBarrier: number | null; upperBarrier: number | null; currentPrice: number | undefined;
}) {
  if (!lowerBarrier || !upperBarrier) return null;
  const isIn = currentPrice ? (currentPrice >= lowerBarrier && currentPrice <= upperBarrier) : null;
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-mono mt-0.5">
      <span className="text-muted-foreground/50">Band:</span>
      <span className="text-muted-foreground">{formatPrice(symbol, lowerBarrier)}</span>
      <span className="text-muted-foreground/30">—</span>
      <span className="text-muted-foreground">{formatPrice(symbol, upperBarrier)}</span>
      {isIn !== null && (
        <span className={`ml-1 font-bold ${isIn ? "text-green-400" : "text-red-400"}`}>{isIn ? "IN" : "OUT"}</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Trading() {
  const { player, token, isBootstrapping } = useAuth();
  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const { subscribeWsEvent } = useNotifications();

  const [category, setCategory]           = useState<"Crypto" | "Forex" | "Commodities" | "Indices">("Crypto");
  const [selectedAsset, setSelected]      = useState("BTC");
  const [chartInterval, setChartInterval] = useState<"1m" | "5m" | "15m" | "30m" | "1h">("1m");
  const [chartMode, setChartMode]         = useState<"candle" | "line">("candle");
  const [duration, setDuration]           = useState(60);
  const [stake, setStake]                 = useState("1");
  const [streak, setStreak]               = useState(0);
  const [tab, setTab]                     = useState<"active" | "history">("active");
  const [priceFlash, setPriceFlash]       = useState<"up" | "down" | "flat">("flat");
  const [contractType, setContractType]   = useState<ContractType>("UP_DOWN");
  const [currency, setCurrency]           = useState<TradingCurrency>("TON");

  const currentPriceRef  = useRef<Record<string, number>>({});
  const prevPriceRef     = useRef<Record<string, number>>({});
  const priceHistoryRef  = useRef<Record<string, number[]>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [aiSignal, setAiSignal] = useState<{
    direction: "UP" | "DOWN" | "NEUTRAL"; confidence: number; reason: string;
    bias?: string; momentum?: string; keyLevel?: number | null;
  } | null>(null);
  const aiSignalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAiAssetRef   = useRef<string>("");

  const isAuthed = !!player;

  // Settlement result overlay — shows on every real trade settlement
  const [settlementResult, setSettlementResult] = useState<{
    outcome: "win" | "loss" | "cancelled";
    symbol: string; direction: string; credit: number; currency: string; streak: number;
  } | null>(null);

  // Trade direction sentiment for current asset (UP_DOWN only)
  const [sentiment, setSentiment] = useState<{ upPct: number; downPct: number; total: number } | null>(null);

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("strikerx_demo_mode") === "true",
  );
  const demoUsdtBalance = parseFloat(String((player as Record<string, unknown>)?.demoUsdtBalance ?? 10000));

  const { data: portfolioData } = useGetMyPortfolio({
    query: { queryKey: getGetMyPortfolioQueryKey(), enabled: isAuthed && isDemoMode, staleTime: 60_000 },
  });
  const demoWinRate   = portfolioData?.demo?.winRate   ?? 0;
  const demoTrades    = portfolioData?.demo?.totalTrades ?? 0;
  const readyForLive  = isDemoMode && demoTrades >= 10 && demoWinRate >= 55;

  const toggleDemo = (v: boolean) => {
    localStorage.setItem("strikerx_demo_mode", String(v));
    setIsDemoMode(v);
  };

  const [screenShake,   setScreenShake]   = useState(false);
  const [tradeLockedIn, setTradeLockedIn] = useState(false);
  const prevStreakRef     = useRef(0);
  const soundThrottleRef = useRef<Record<string, number>>({});

  // AI Auto-Trader panel state
  const [autoConfig, setAutoConfig] = useState<{
    enabled: boolean; riskPreset: "conservative" | "balanced" | "aggressive";
  } | null>(null);
  const [autoLoading,    setAutoLoading]    = useState(false);
  const [sessionTarget,  setSessionTarget]  = useState<number | null>(null);
  const [sessionDone,    setSessionDone]    = useState(0);
  const [sessionWins,    setSessionWins]    = useState(0);
  const sessionDoneRef = useRef(0);
  const [nextCheckIn,    setNextCheckIn]    = useState(60);
  const nextCheckRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: configData } = useGetTradingConfig({ query: { queryKey: getGetTradingConfigQueryKey(), refetchInterval: 60_000 } });
  const { data: pricesData } = useGetTradingPrices({ query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 3000 } });
  const { data: assetsData } = useGetTradingAssets({ query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 15_000 } });

  const availableDurations = configData?.availableDurations ?? DEFAULT_DURATIONS;

  // Stake limits
  const minStake = isDemoMode ? 1 : (configData?.minStakeTon ?? 0.1);
  const maxStake = isDemoMode ? Math.min(1000, demoUsdtBalance > 0 ? demoUsdtBalance : 1000) : (configData?.maxStakeTon ?? 500);

  // 24h changes — now properly typed after codegen
  const changes24h = pricesData?.changes24h ?? {};

  // Quick stake amounts
  const quickStakes: number[] = [0.5, 1, 5, 10].filter((v) => v <= maxStake);

  // Balance for the active currency
  const balance = isDemoMode
    ? demoUsdtBalance
    : currency === "TON"
    ? parseFloat(String(player?.tonBalance ?? 0))
    : parseFloat(String(player?.usdtBalance ?? 0));

  const formatBalance = (v: number) =>
    isDemoMode ? `$${v.toFixed(2)}` : v.toFixed(4);

  const { data: activeData }  = useGetTradingPositionsActive({
    query: { queryKey: getGetTradingPositionsActiveQueryKey(), refetchInterval: isAuthed ? 3000 : false, enabled: isAuthed },
  });
  const { data: historyData } = useGetTradingPositions({
    query: { queryKey: getGetTradingPositionsQueryKey(), refetchInterval: isAuthed ? 10_000 : false, enabled: isAuthed },
  });

  const { data: demoActiveData }  = useGetDemoPositionsActive({
    query: { queryKey: getGetDemoPositionsActiveQueryKey(), refetchInterval: isAuthed && isDemoMode ? 3000 : false, enabled: isAuthed && isDemoMode },
  });
  const { data: demoHistoryData } = useGetDemoPositions(undefined, {
    query: { queryKey: getGetDemoPositionsQueryKey(), refetchInterval: isAuthed && isDemoMode ? 10_000 : false, enabled: isAuthed && isDemoMode },
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

  // WS price_update → instant chart updates + AI signal history
  useEffect(() => {
    return subscribeWsEvent("price_update", (data) => {
      const sym   = String(data.symbol ?? "");
      const price = Number(data.price  ?? 0);
      if (!sym || price <= 0) return;
      currentPriceRef.current[sym] = price;
      setCurrentPrices((prev) => ({ ...prev, [sym]: price }));
      // Keep rolling 30-tick history per asset for AI signal
      const hist = priceHistoryRef.current[sym] ?? [];
      priceHistoryRef.current[sym] = [...hist.slice(-29), price];
    });
  }, [subscribeWsEvent]);

  // Price flash animation
  const selectedPrice = currentPrices[selectedAsset];
  useEffect(() => {
    if (selectedPrice === undefined) return undefined;
    const prev = prevPriceRef.current[selectedAsset];
    if (prev !== undefined && selectedPrice !== prev) {
      setPriceFlash(selectedPrice > prev ? "up" : "down");
      const t = setTimeout(() => setPriceFlash("flat"), 700);
      return () => clearTimeout(t);
    }
    prevPriceRef.current[selectedAsset] = selectedPrice;
    return undefined;
  }, [selectedPrice, selectedAsset]);

  // Price tick sounds — throttled, selected asset only
  useEffect(() => {
    if (priceFlash === "flat") return;
    const now = Date.now();
    const last = soundThrottleRef.current[selectedAsset] ?? 0;
    if (now - last < 1200) return;
    soundThrottleRef.current[selectedAsset] = now;
    soundManager.play(priceFlash === "up" ? "price_up" : "price_down");
  }, [priceFlash, selectedAsset]);

  // AI signal — calls Groq LLM via backend, debounced per asset switch
  useEffect(() => {
    if (aiSignalTimerRef.current) clearTimeout(aiSignalTimerRef.current);

    // Show loading state immediately on asset switch
    if (lastAiAssetRef.current !== selectedAsset) {
      setAiSignal({ direction: "NEUTRAL", confidence: 50, reason: "Analysing market data…" });
      lastAiAssetRef.current = selectedAsset;
    }

    const price   = currentPrices[selectedAsset];
    const hist    = priceHistoryRef.current[selectedAsset] ?? [];
    const chg24h  = asNum(changes24h[selectedAsset]);

    // Wait until we have a price, then debounce 2s to avoid spam
    if (!price) return;

    aiSignalTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/trading/ai-signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol:        selectedAsset,
            currentPrice:  price,
            change24h:     chg24h,
            recentPrices:  hist.slice(-20),
          }),
        });
        if (!r.ok) throw new Error("Signal fetch failed");
        const data = await r.json() as {
          signal: "UP" | "DOWN"; confidence: number; reasoning: string;
          bias?: string; momentum?: string; keyLevel?: number | null;
        };
        setAiSignal({
          direction:  data.signal,
          confidence: data.confidence,
          reason:     data.reasoning,
          bias:       data.bias,
          momentum:   data.momentum,
          keyLevel:   data.keyLevel,
        });
      } catch {
        // Fallback: compute a basic signal from tick history
        const tHist = priceHistoryRef.current[selectedAsset] ?? [];
        if (tHist.length < 4) {
          setAiSignal({ direction: "NEUTRAL", confidence: 50, reason: "Awaiting price data…" });
          return;
        }
        let up = 0, dn = 0;
        for (let i = 1; i < tHist.length; i++) {
          if (tHist[i] > tHist[i - 1]) up++; else if (tHist[i] < tHist[i - 1]) dn++;
        }
        const total = up + dn;
        const score = total > 0 ? (up - dn) / total : 0;
        const conf  = Math.round(50 + Math.abs(score) * 35);
        if (Math.abs(score) < 0.1) setAiSignal({ direction: "NEUTRAL", confidence: 50, reason: "Market consolidating" });
        else if (score > 0) setAiSignal({ direction: "UP",   confidence: conf, reason: `${up}/${total} ticks bullish · 24h ${chg24h >= 0 ? "+" : ""}${chg24h.toFixed(2)}%` });
        else                setAiSignal({ direction: "DOWN", confidence: conf, reason: `${dn}/${total} ticks bearish · 24h ${chg24h >= 0 ? "+" : ""}${chg24h.toFixed(2)}%` });
      }
    }, 2_000);

    return () => { if (aiSignalTimerRef.current) clearTimeout(aiSignalTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, Math.floor(Date.now() / 60_000)]);

  // WS trade_settled → overlay + toast + refresh + streak update
  useEffect(() => {
    return subscribeWsEvent("trade_settled", (data) => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDemoPositionsActiveQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDemoPositionsQueryKey() });

      const newStreak = Number(data.streak ?? 0);
      setStreak(newStreak);

      const outcome   = String(data.outcome ?? "");
      const credit    = Number(data.creditAmount ?? 0);
      const sym       = String(data.assetSymbol ?? "");
      const ccy       = String(data.currency ?? "STRIKER");
      const dir       = String(data.direction ?? "");
      const creditFmt = ccy === "STRIKER" ? `${Math.round(credit).toLocaleString()} STRK` : `${credit.toFixed(4)} ${ccy}`;

      // Sounds + haptic feedback
      if (outcome === "win") {
        soundManager.play('trade_win_epic');
        if (newStreak >= 2 && newStreak > prevStreakRef.current) {
          setTimeout(() => soundManager.play('streak_up'), 900);
        }
      } else if (outcome === "loss") {
        soundManager.play('trade_loss');
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 500);
      }
      prevStreakRef.current = newStreak;

      // Show overlay on real (non-demo) trades
      if (!data.isDemo) {
        setSettlementResult({
          outcome: outcome as "win" | "loss" | "cancelled",
          symbol: sym, direction: dir, credit, currency: ccy, streak: newStreak,
        });
        setTimeout(() => setSettlementResult(null), outcome === "win" ? 4000 : 1800);
      }

      if (outcome === "win") {
        toast({
          title: `WIN  +${creditFmt}`,
          description: newStreak >= 2
            ? `${sym} ${dir} — ${newStreak} in a row!`
            : `${sym} ${dir} — called it`,
        });
      } else if (outcome === "loss") {
        toast({
          title: "Position closed",
          description: `${sym} ${dir} — better luck next time`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Trade refunded", description: `${sym} settled at entry price` });
      }
    });
  }, [subscribeWsEvent, queryClient, toast]);

  // WS deposit_confirmed → balance refresh + celebration toast
  useEffect(() => {
    return subscribeWsEvent("deposit_confirmed", (data) => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      const asset      = String(data.asset ?? "TON");
      const amtReal    = Number(data.amount ?? 0);
      const amtStriker = Number(data.amountStriker ?? 0);
      const precision  = asset === "TON" ? 4 : 2;
      toast({
        title: "Deposit confirmed!",
        description: `+${amtReal.toFixed(precision)} ${asset}  ·  +${Math.round(amtStriker).toLocaleString()} STRK`,
      });
    });
  }, [subscribeWsEvent, queryClient, toast]);

  // WS consolation_boot → BOOT reward toast
  useEffect(() => {
    return subscribeWsEvent("consolation_boot", (data) => {
      const boot   = Number(data.boot ?? 0);
      const streak = Number(data.streak ?? 0);
      toast({
        title: `+${boot} BOOT earned`,
        description: `Consolation for your ${streak}-trade run — keep going!`,
      });
    });
  }, [subscribeWsEvent, toast]);

  // WS trade_sentiment → live market bias for current asset
  useEffect(() => {
    return subscribeWsEvent("trade_sentiment", (data) => {
      if (String(data.symbol ?? "") === selectedAsset) {
        setSentiment({
          upPct:   Number(data.upPct   ?? 50),
          downPct: Number(data.downPct ?? 50),
          total:   Number(data.total   ?? 0),
        });
      }
    });
  }, [subscribeWsEvent, selectedAsset]);

  // Reset sentiment when switching assets
  useEffect(() => {
    setSentiment(null);
  }, [selectedAsset]);

  // Fetch AI auto-trade config when authenticated
  useEffect(() => {
    if (!token) return;
    fetch("/api/trading/auto-trade/config", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((cfg) => {
        if (cfg) setAutoConfig({ enabled: !!cfg.enabled, riskPreset: cfg.riskPreset ?? "balanced" });
        else      setAutoConfig({ enabled: false, riskPreset: "balanced" });
      })
      .catch(() => setAutoConfig({ enabled: false, riskPreset: "balanced" }));
  }, [token]);

  // Countdown timer — ticks down every second when AI trader is active
  useEffect(() => {
    if (nextCheckRef.current) clearInterval(nextCheckRef.current);
    if (autoConfig?.enabled) {
      setNextCheckIn(60);
      nextCheckRef.current = setInterval(() => {
        setNextCheckIn((prev) => (prev <= 1 ? 60 : prev - 1));
      }, 1000);
    }
    return () => { if (nextCheckRef.current) clearInterval(nextCheckRef.current); };
  }, [autoConfig?.enabled]);

  const openPositionMutation = usePostTradingPositions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTradingPositionsQueryKey() });
        soundManager.play('lock_in');
        setTradeLockedIn(true);
        setTimeout(() => setTradeLockedIn(false), 600);
        setTab("active");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to open position";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const demoTradeMut = usePostDemoPositions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDemoPositionsActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDemoPositionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        soundManager.play('lock_in');
        setTradeLockedIn(true);
        setTimeout(() => setTradeLockedIn(false), 600);
        setTab("active");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to open demo position";
        toast({ title: "Demo Error", description: msg, variant: "destructive" });
      },
    },
  });

  const apiAssets       = assetsData?.assets ?? [];
  const activePositions = isDemoMode
    ? (demoActiveData?.positions ?? [])
    : (activeData?.positions ?? []);
  const history = isDemoMode
    ? (demoHistoryData?.positions ?? []).filter((p: { outcome: string }) => p.outcome !== "pending")
    : (historyData?.positions ?? []).filter((p) => p.outcome !== "pending");

  // Countdown tick sounds for active positions in final 10s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isAuthed || activePositions.length === 0) return;
    const id = setInterval(() => {
      const hasUrgent = activePositions.some((p) => {
        const secs = Math.ceil((new Date(p.expiresAt).getTime() - Date.now()) / 1000);
        return secs > 0 && secs <= 10;
      });
      if (hasUrgent) soundManager.play('countdown_tick');
    }, 1000);
    return () => clearInterval(id);
  }, [isAuthed, activePositions.length]);

  const selectedAssetData = apiAssets.find((a) => a.symbol === selectedAsset);
  const basePayoutRatio   = selectedAssetData?.payoutRatio ?? 1.82;
  const streakBoostPct    = streak >= 5 ? 7 : streak >= 4 ? 5 : streak >= 3 ? 3 : streak >= 2 ? 2 : 0;
  const effectivePayout   = streakBoostPct > 0 ? Math.min(1.95, basePayoutRatio + basePayoutRatio * streakBoostPct / 100) : basePayoutRatio;
  const payoutPct         = Math.round((effectivePayout - 1) * 100);
  const stakeNum          = parseFloat(stake) || 0;
  const potentialWin      = parseFloat((stakeNum * effectivePayout).toFixed(4));
  const potentialProfit   = parseFloat((stakeNum * (effectivePayout - 1)).toFixed(4));

  const categorySymbols = ASSET_CATEGORIES[category] ?? [];
  const displayAssets   = categorySymbols
    .map((sym) => apiAssets.find((a) => a.symbol === sym) ?? { symbol: sym, displayName: ASSET_META[sym]?.label ?? sym, payoutRatio: 1.82, minStakeStriker: 10, maxStakeStriker: 10000, minStakeTon: 0.1, maxStakeTon: 500 })
    .filter(Boolean);

  // Handle quick-trade deep-link from home page (sessionStorage params)
  useEffect(() => {
    const sym = sessionStorage.getItem("strikerx_quick_symbol");
    const dir = sessionStorage.getItem("strikerx_quick_dir");
    if (sym) {
      sessionStorage.removeItem("strikerx_quick_symbol");
      sessionStorage.removeItem("strikerx_quick_dir");
      const cat = Object.entries(ASSET_CATEGORIES).find(([, syms]) => syms.includes(sym))?.[0] as "Crypto" | "Forex" | "Commodities" | "Indices" | undefined;
      if (cat) setCategory(cat);
      setSelected(sym);
      setContractType("UP_DOWN");
      if (dir === "DOWN" || dir === "UP") {
        // Pre-focus the stake field and set a sensible default
        setTimeout(() => {
          const stakeInput = document.querySelector<HTMLInputElement>('input[type="number"]');
          stakeInput?.focus();
        }, 300);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCategoryChange = useCallback((cat: "Crypto" | "Forex" | "Commodities" | "Indices") => {
    setCategory(cat);
    const first = ASSET_CATEGORIES[cat]?.[0];
    if (first) setSelected(first);
  }, []);

  const activeForAsset = activePositions.filter((p) => p.assetSymbol === selectedAsset);
  const entryPrice     = activeForAsset[0]?.entryPrice ?? null;
  const expiresAt      = activeForAsset[0]?.expiresAt ?? null;

  // Active direction + live winning status for chart zone highlighting
  const activeDirectionForChart = (activeForAsset[0]?.direction ?? null) as "UP" | "DOWN" | null;
  const firstActivePos = activeForAsset[0];
  let chartIsWinning: boolean | null = null;
  if (firstActivePos && selectedPrice !== undefined) {
    const diff = selectedPrice - (firstActivePos.entryPrice ?? 0);
    if (!firstActivePos.contractType || firstActivePos.contractType === "UP_DOWN") {
      chartIsWinning = firstActivePos.direction === "UP" ? diff > 0 : diff < 0;
    }
  }

  const meta        = ASSET_META[selectedAsset];
  const accentColor = meta?.color ?? "#00ff88";
  const cMeta       = CONTRACT_META[contractType];

  const stakeInvalid = stakeNum > 0 && (stakeNum < minStake || stakeNum > maxStake || stakeNum > balance);

  // ── AI Auto-Trader handlers ──────────────────────────────────────────────

  const handleAutoToggle = async () => {
    if (!token || !autoConfig) return;
    setAutoLoading(true);
    try {
      const next = !autoConfig.enabled;
      await fetch("/api/trading/auto-trade/config", {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: next, riskPreset: autoConfig.riskPreset, assetSymbol: selectedAsset, interval: chartInterval, currency }),
      });
      setAutoConfig((prev) => prev ? { ...prev, enabled: next } : prev);
      toast({ title: next ? "AI Trader enabled" : "AI Trader paused" });
    } catch {
      toast({ title: "Failed to update AI trader", variant: "destructive" });
    } finally {
      setAutoLoading(false);
    }
  };

  const handleAutoRisk = async (preset: "conservative" | "balanced" | "aggressive") => {
    if (!token || !autoConfig) return;
    setAutoConfig((prev) => prev ? { ...prev, riskPreset: preset } : prev);
    try {
      await fetch("/api/trading/auto-trade/config", {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: autoConfig.enabled, riskPreset: preset, assetSymbol: selectedAsset, interval: chartInterval, currency }),
      });
    } catch { /* silent */ }
  };

  const handleStartSession = (n: number) => {
    if (sessionTarget === n) {
      setSessionTarget(null);
      setSessionDone(0);
      setSessionWins(0);
      sessionDoneRef.current = 0;
    } else {
      setSessionTarget(n);
      setSessionDone(0);
      setSessionWins(0);
      sessionDoneRef.current = 0;
    }
  };

  function handleTrade(direction: string) {
    if (!player) { toast({ title: "Not logged in", variant: "destructive" }); return; }
    if (stakeNum <= 0)    { toast({ title: "Enter a stake amount", variant: "destructive" }); return; }
    if (stakeNum < minStake) { toast({ title: `Min stake is ${minStake} ${currency}`, variant: "destructive" }); return; }
    if (stakeNum > balance)  { toast({ title: isDemoMode ? "Insufficient demo balance" : `Insufficient ${currency} balance`, variant: "destructive" }); return; }
    if (isDemoMode) {
      demoTradeMut.mutate({
        data: {
          assetSymbol:          selectedAsset,
          direction,
          contractType,
          stake:                stakeNum,
          contractDurationSecs: duration,
        },
      });
    } else {
      openPositionMutation.mutate({
        data: {
          assetSymbol:          selectedAsset,
          direction:            direction as "UP" | "DOWN" | "EVEN" | "ODD" | "OVER" | "UNDER" | "IN" | "OUT",
          contractType,
          currency,
          stake:                stakeNum,
          contractDurationSecs: duration,
        },
      });
    }
  }

  const selectedChange = changes24h[selectedAsset];

  const formatStakeDisplay = (v: number) => `${v}`;

  const activeMutation  = isDemoMode ? demoTradeMut : openPositionMutation;
  const isStakeDisabled = activeMutation.isPending || stakeNum <= 0 || stakeNum < minStake || stakeNum > maxStake || stakeNum > balance;

  return (
    <Layout>
      <div className="flex flex-col min-h-full pb-4">

        {/* ── Demo mode toggle ──────────────────────────────── */}
        <div className="px-3 pt-2 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FlaskConical size={10} className={isDemoMode ? "text-amber-400" : "text-muted-foreground/50"} />
            <span className={`text-[10px] font-bold ${isDemoMode ? "text-amber-400" : "text-muted-foreground/50"}`}>
              {isDemoMode ? "DEMO MODE" : "REAL MODE"}
            </span>
            {isDemoMode && (
              <span className="text-[9px] font-mono text-amber-300/70 ml-1">${demoUsdtBalance.toFixed(2)} USDT</span>
            )}
          </div>
          <button
            onClick={() => toggleDemo(!isDemoMode)}
            className={`relative w-9 h-4.5 rounded-full transition-colors ${isDemoMode ? "bg-amber-500/40" : "bg-white/10"}`}
            style={{ height: "18px", width: "36px" }}
          >
            <div
              className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${isDemoMode ? "bg-amber-400" : "bg-white/40"}`}
              style={{ [isDemoMode ? "right" : "left"]: "2px" }}
            />
          </button>
        </div>

        {/* ── Category tabs ─────────────────────────────────── */}
        <div className="px-3 pt-3 pb-1 flex gap-1">
          {(["Crypto", "Forex", "Commodities", "Indices"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                category === cat ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"
              }`}
            >
              {cat === "Commodities" ? "Commod." : cat}
            </button>
          ))}
        </div>

        {/* ── Asset selector ────────────────────────────────── */}
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {displayAssets.map((a) => {
              const sym      = a.symbol;
              const aPrice   = currentPrices[sym];
              const aChange  = changes24h[sym];
              const aMeta    = ASSET_META[sym];
              const isActive = sym === selectedAsset;
              return (
                <button
                  key={sym}
                  onClick={() => setSelected(sym)}
                  style={isActive ? { borderColor: aMeta?.color ?? "#00ff88" } : {}}
                  className={`flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all min-w-[62px] ${
                    isActive ? "bg-white/5" : "border-border text-muted-foreground hover:border-white/20"
                  }`}
                >
                  <span style={{ color: isActive ? aMeta?.color : undefined }} className="text-sm font-black leading-none mb-0.5">
                    {aMeta?.icon ?? sym[0]}
                  </span>
                  <span style={{ color: isActive ? aMeta?.color : undefined }} className="font-black text-[10px] leading-none">
                    {sym.length > 6 ? sym.slice(0, 6) : sym}
                  </span>
                  {aPrice ? (
                    <span className="text-[8px] font-mono mt-0.5 text-muted-foreground tabular-nums leading-none">
                      {aPrice >= 1000 ? `$${Math.round(aPrice).toLocaleString()}` : aPrice.toFixed(Math.min(meta?.digits ?? 2, 3))}
                    </span>
                  ) : (
                    <span className="text-[8px] text-muted-foreground/40 mt-0.5 leading-none">—</span>
                  )}
                  {aChange !== undefined && (
                    <span className={`text-[7px] font-bold tabular-nums leading-none mt-0.5 ${aChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtChange(aChange)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Paper-to-live readiness banner ────────────────── */}
        {readyForLive && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-3 mb-2 flex items-center gap-2.5 bg-green-950/50 border border-green-500/30 rounded-xl px-3 py-2.5"
          >
            <Trophy size={14} className="text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-green-300 leading-tight">Ready for real trading?</p>
              <p className="text-[9px] font-mono text-green-400/60 leading-tight">
                {demoWinRate.toFixed(0)}% win rate · {demoTrades} demo trades — solid edge detected
              </p>
            </div>
            <button
              onClick={() => toggleDemo(false)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-green-500/20 border border-green-500/40 text-[9px] font-black text-green-300 hover:bg-green-500/30 transition-colors"
            >
              Go Live
            </button>
          </motion.div>
        )}

        {/* ── Chart panel ───────────────────────────────────── */}
        <div className="px-3 mb-2">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 pt-3 pb-1.5 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase mb-0.5">
                  {meta?.label ?? selectedAsset} · {
                    ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCHF"].includes(selectedAsset) ? "Forex"
                    : ["XAUUSD","XAGUSD","USOIL","NATGAS","COPPER"].includes(selectedAsset) ? "Commodities"
                    : ["SPX","NDX","DJI","DAX","FTSE","NKY"].includes(selectedAsset) ? "Index"
                    : "Crypto"
                  }
                </p>
                <div className="flex items-baseline gap-2">
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
                  {selectedChange !== undefined && selectedPrice && (
                    <div className="flex flex-col items-start">
                      <span className={`text-xs font-bold tabular-nums leading-none ${selectedChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmtChange(selectedChange)}
                      </span>
                      <span className={`text-[9px] font-mono tabular-nums leading-none mt-0.5 ${selectedChange >= 0 ? "text-green-400/50" : "text-red-400/50"}`}>
                        {selectedChange >= 0 ? "+" : ""}{(selectedPrice * selectedChange / 100).toFixed(Math.min(meta?.digits ?? 2, 3))}
                      </span>
                    </div>
                  )}
                </div>
                {/* 24h High / Low row */}
                {selectedPrice && selectedChange !== undefined && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[9px] font-mono">
                      <span className="text-green-400/50">H</span>
                      <span className="text-white/50 tabular-nums">{formatPrice(selectedAsset, selectedPrice * (1 + Math.abs(selectedChange) / 100))}</span>
                    </span>
                    <span className="text-white/10">·</span>
                    <span className="flex items-center gap-1 text-[9px] font-mono">
                      <span className="text-red-400/50">L</span>
                      <span className="text-white/50 tabular-nums">{formatPrice(selectedAsset, selectedPrice * (1 - Math.abs(selectedChange) / 100))}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 ml-2 shrink-0">
                <div
                  className="px-2.5 py-1 rounded-lg text-xs font-black tabular-nums"
                  style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44` }}
                >
                  {payoutPct}% payout
                  {streakBoostPct > 0 && <span className="text-orange-300 ml-1">+{streakBoostPct}%</span>}
                </div>
                <div className="flex gap-1 items-center">
                  {(["1m", "5m", "15m", "30m", "1h"] as const).map((iv) => (
                    <button
                      key={iv}
                      onClick={() => setChartInterval(iv)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                        chartInterval === iv ? "bg-white/15 text-white" : "text-muted-foreground hover:text-white"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                  <button
                    onClick={() => setChartMode((m) => m === "candle" ? "line" : "candle")}
                    className="p-1 rounded text-muted-foreground hover:text-white transition-colors"
                  >
                    {chartMode === "candle" ? <LineChart size={11} /> : <CandlestickChart size={11} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[240px] w-full">
              <TradingChart
                symbol={selectedAsset}
                interval={chartInterval}
                currentPrice={selectedPrice ?? null}
                entryPrice={entryPrice}
                expiresAt={expiresAt}
                chartMode={chartMode}
                token={token}
                activeDirection={activeDirectionForChart}
                isWinning={chartIsWinning}
              />
            </div>
          </div>
        </div>

        {/* ── Streak badge ───────────────────────────────────── */}
        <AnimatePresence>
          {streak >= 2 && (
            <motion.div
              key={streak}
              initial={{ opacity: 0, scale: 0.85, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="px-3 mb-2"
            >
              <motion.div
                className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                style={{
                  background: "linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(234,88,12,0.07) 100%)",
                  borderColor: streak >= 5 ? "#f59e0b" : "#f97316",
                  boxShadow: streak >= 5 ? "0 0 24px rgba(245,158,11,0.18)" : "0 0 14px rgba(249,115,22,0.12)",
                }}
                animate={{ borderColor: streak >= 5 ? ["#f59e0b", "#fcd34d", "#f59e0b"] : ["#f97316", "#fb923c", "#f97316"] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                <div className="flex items-center gap-0.5 shrink-0">
                  {[...Array(Math.min(streak, 5))].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.25, 1], opacity: [0.65, 1, 0.65] }}
                      transition={{ duration: 0.9, delay: i * 0.14, repeat: Infinity }}
                    >
                      <Flame
                        size={i === Math.min(streak, 5) - 1 ? 20 : 15}
                        className={i === Math.min(streak, 5) - 1 ? "text-orange-300" : "text-orange-500/60"}
                      />
                    </motion.div>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-orange-200 leading-none">{streak}×</span>
                    <span className="text-sm font-black text-orange-300/80 uppercase tracking-wider">Win Streak</span>
                  </div>
                  <div className="text-[10px] font-mono text-orange-400/55 mt-0.5">+{streakBoostPct}% payout boost active</div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-xl font-black tabular-nums"
                    style={{ color: streak >= 5 ? "#fcd34d" : "#fb923c" }}
                  >
                    +{streakBoostPct}%
                  </div>
                  <div className="text-[8px] font-mono text-orange-400/40 uppercase tracking-widest">boost</div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AI Signal ─────────────────────────────────────── */}
        {aiSignal && (
          <div className="px-3 mt-2 mb-1">
            <div className={`rounded-xl border px-3 py-2.5 ${
              aiSignal.direction === "UP"
                ? "border-green-500/30 bg-gradient-to-r from-green-500/8 to-green-500/3"
                : aiSignal.direction === "DOWN"
                ? "border-red-500/30 bg-gradient-to-r from-red-500/8 to-red-500/3"
                : "border-border bg-card"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Confidence ring */}
                  <div className="relative w-9 h-9 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="14" fill="none"
                        stroke={aiSignal.direction === "UP" ? "#22c55e" : aiSignal.direction === "DOWN" ? "#ef4444" : "#6b7280"}
                        strokeWidth="3"
                        strokeDasharray={`${(aiSignal.confidence / 100) * 87.96} 87.96`}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 0.6s ease" }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black tabular-nums"
                      style={{ color: aiSignal.direction === "UP" ? "#22c55e" : aiSignal.direction === "DOWN" ? "#ef4444" : "#6b7280" }}>
                      {aiSignal.confidence}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[8px] font-black tracking-widest px-1 py-0.5 rounded ${
                        aiSignal.direction === "UP"   ? "bg-green-500/20 text-green-400"
                        : aiSignal.direction === "DOWN" ? "bg-red-500/20 text-red-400"
                        : "bg-white/10 text-muted-foreground"
                      }`}>AI</span>
                      <span className={`text-xs font-black leading-none ${
                        aiSignal.direction === "UP" ? "text-green-400" : aiSignal.direction === "DOWN" ? "text-red-400" : "text-muted-foreground"
                      }`}>
                        {aiSignal.direction === "NEUTRAL" ? "CONSOLIDATING" : `${aiSignal.direction} SIGNAL`}
                      </span>
                      {aiSignal.momentum && aiSignal.momentum !== "MODERATE" && (
                        <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${
                          aiSignal.momentum === "STRONG" ? "bg-orange-500/20 text-orange-400" : "bg-white/10 text-muted-foreground"
                        }`}>{aiSignal.momentum}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/55 font-mono line-clamp-2">{aiSignal.reason}</p>
                    {aiSignal.keyLevel && (
                      <p className="text-[8px] text-muted-foreground/40 font-mono mt-0.5">
                        Key level: {formatPrice(selectedAsset, aiSignal.keyLevel)}
                      </p>
                    )}
                  </div>
                </div>
                {/* Momentum bars */}
                <div className="flex items-end gap-0.5 h-6 shrink-0">
                  {[0.3, 0.5, 0.65, 0.8, 1].map((h, i) => {
                    const lit = i < Math.ceil((aiSignal.confidence - 50) / 10);
                    return (
                      <div key={i} className="w-1.5 rounded-sm transition-all duration-300"
                        style={{
                          height: `${h * 100}%`,
                          background: lit
                            ? (aiSignal.direction === "UP" ? "#22c55e" : aiSignal.direction === "DOWN" ? "#ef4444" : "#6b7280")
                            : "rgba(255,255,255,0.08)",
                        }} />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Contract type selector ─────────────────────────── */}
        <div className="px-3 mt-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-0.5">Contract Type</p>
          <div className="grid grid-cols-4 gap-1">
            {(["UP_DOWN", "EVEN_ODD", "OVER_UNDER", "IN_OUT"] as ContractType[]).map((ct) => (
              <button
                key={ct}
                onClick={() => setContractType(ct)}
                className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold transition-all leading-tight text-center ${
                  contractType === ct
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-white/20 hover:text-white"
                }`}
              >
                {CONTRACT_META[ct].label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-1 px-0.5">{cMeta.desc}</p>
        </div>

        {/* ── Duration ──────────────────────────────────────── */}
        <div className="px-3 mt-3">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 px-0.5">Contract Duration</p>
          <div className={`grid gap-1.5 ${availableDurations.length <= 4 ? "grid-cols-4" : "grid-cols-5"}`}>
            {availableDurations.map((secs) => (
              <button
                key={secs}
                onClick={() => setDuration(secs)}
                style={duration === secs ? { background: `${accentColor}22`, borderColor: accentColor, color: accentColor } : {}}
                className={`py-2 rounded-lg border text-xs font-bold transition-all ${
                  duration === secs ? "" : "border-border text-muted-foreground hover:border-white/30"
                }`}
              >
                {secsToLabel(secs)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stake ─────────────────────────────────────────── */}
        <div className="px-3 mt-3">
          {/* Currency selector + balance */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              {(["TON", "USDT"] as TradingCurrency[]).map((ccy) => (
                <button
                  key={ccy}
                  onClick={() => { setCurrency(ccy); setStake("1"); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all ${
                    currency === ccy
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-white/20"
                  }`}
                >
                  <Coins size={10} />
                  {ccy}
                </button>
              ))}
            </div>
            {player && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Bal: <span className={`font-bold ${balance > 0 ? "text-white" : "text-red-400"}`}>{formatBalance(balance)}</span>
                </p>
                {balance > 0 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const half = String(Math.max(minStake, parseFloat((balance / 2).toFixed(4))));
                        setStake(half);
                      }}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
                    >
                      ½
                    </button>
                    <button
                      onClick={() => setStake(String(Math.min(maxStake, balance).toFixed(4)))}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
                    >
                      Max
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-1.5 mb-1.5">
            {quickStakes.map((q) => (
              <button
                key={q}
                onClick={() => setStake(String(q))}
                className={`flex-1 py-1.5 rounded-md border text-xs font-bold transition-all ${
                  parseFloat(stake) === q
                    ? "border-white/30 text-white bg-white/5"
                    : "border-border text-muted-foreground hover:text-white hover:border-white/20"
                }`}
              >
                {formatStakeDisplay(q)}
              </button>
            ))}
          </div>

          <Input
            type="number"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Amount"
            className={`font-mono text-base h-11 ${stakeInvalid ? "border-red-500/50" : ""}`}
          />

          {stakeNum > 0 && (
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              {stakeNum < minStake ? (
                <p className="text-[10px] text-red-400">Min: {minStake} {currency}</p>
              ) : stakeNum > maxStake ? (
                <p className="text-[10px] text-red-400">Max: {maxStake} {currency}</p>
              ) : stakeNum > balance ? (
                <p className="text-[10px] text-red-400">Insufficient {currency}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  To win: <span className="text-green-400 font-bold text-xs">+{potentialProfit} {currency}</span>
                </p>
              )}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Zap size={9} className="text-yellow-400" />
                {secsToLabel(duration)}
              </p>
            </div>
          )}

          {balance === 0 && isAuthed && !isDemoMode && (
            <div className="mt-2 flex items-center gap-2 px-0.5">
              <span className="text-[10px] text-amber-400/70 flex-1">No {currency} balance</span>
              <Link href="/deposit">
                <span className="text-[10px] font-bold px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors cursor-pointer">
                  Add Funds
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* ── Market sentiment bar ──────────────────────────── */}
        {contractType === "UP_DOWN" && sentiment && sentiment.total >= 3 && (
          <div className="px-3 mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Market Sentiment</span>
              <span className="text-[9px] text-muted-foreground/40 font-mono">{sentiment.total} active traders</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex bg-white/5">
              <motion.div className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-l-full"
                animate={{ width: `${sentiment.upPct}%` }} transition={{ duration: 0.5 }} />
              <motion.div className="bg-gradient-to-r from-red-400 to-red-600 h-full rounded-r-full"
                animate={{ width: `${sentiment.downPct}%` }} transition={{ duration: 0.5 }} />
            </div>
            <div className="flex justify-between mt-1">
              <div className="flex items-center gap-1">
                <TrendingUp size={8} className="text-green-400" />
                <span className="text-[9px] font-black text-green-400">UP {sentiment.upPct}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-black text-red-400">{sentiment.downPct}% DOWN</span>
                <TrendingDown size={8} className="text-red-400" />
              </div>
            </div>
          </div>
        )}

        {/* ── Trade buttons ─────────────────────────────────── */}
        <div className="px-3 mt-3 grid grid-cols-2 gap-3">
          {/* Button A */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={!isStakeDisabled ? { scale: 1.02 } : {}}
            animate={tradeLockedIn ? { scale: [1, 1.06, 1] } : {}}
            transition={{ duration: 0.25 }}
            onClick={() => handleTrade(cMeta.dirA)}
            disabled={isStakeDisabled}
            className={`h-16 font-black text-white flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 rounded-xl relative overflow-hidden ${
              contractType === "UP_DOWN" ? "bg-green-600 hover:bg-green-500"
              : contractType === "EVEN_ODD" ? "bg-blue-600 hover:bg-blue-500"
              : contractType === "OVER_UNDER" ? "bg-violet-600 hover:bg-violet-500"
              : "bg-teal-600 hover:bg-teal-500"
            }`}
            style={{
              boxShadow: isStakeDisabled ? "none" : contractType === "UP_DOWN"
                ? "0 4px 20px rgba(34,197,94,0.3)" : contractType === "EVEN_ODD"
                ? "0 4px 20px rgba(59,130,246,0.3)" : "0 4px 20px rgba(139,92,246,0.3)",
            }}
          >
            <div className="absolute inset-0 bg-white/8 opacity-0 hover:opacity-100 transition-opacity" />
            {contractType === "UP_DOWN" ? <TrendingUp size={20} /> : <span className="text-lg font-black">{cMeta.btnA[0]}</span>}
            <span className="text-sm font-black">{cMeta.btnA}</span>
            <span className="text-[10px] font-bold opacity-80">
              {stakeNum > 0 && !stakeInvalid ? `+${potentialProfit} ${currency}` : `${payoutPct}%`}
            </span>
          </motion.button>

          {/* Button B */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={!isStakeDisabled ? { scale: 1.02 } : {}}
            animate={tradeLockedIn ? { scale: [1, 1.06, 1] } : {}}
            transition={{ duration: 0.25 }}
            onClick={() => handleTrade(cMeta.dirB)}
            disabled={isStakeDisabled}
            className={`h-16 font-black text-white flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 rounded-xl relative overflow-hidden ${
              contractType === "UP_DOWN" ? "bg-red-600 hover:bg-red-500"
              : contractType === "EVEN_ODD" ? "bg-orange-600 hover:bg-orange-500"
              : contractType === "OVER_UNDER" ? "bg-pink-600 hover:bg-pink-500"
              : "bg-amber-600 hover:bg-amber-500"
            }`}
            style={{
              boxShadow: isStakeDisabled ? "none" : contractType === "UP_DOWN"
                ? "0 4px 20px rgba(239,68,68,0.3)" : contractType === "EVEN_ODD"
                ? "0 4px 20px rgba(249,115,22,0.3)" : "0 4px 20px rgba(236,72,153,0.3)",
            }}
          >
            <div className="absolute inset-0 bg-white/8 opacity-0 hover:opacity-100 transition-opacity" />
            {contractType === "UP_DOWN" ? <TrendingDown size={20} /> : <span className="text-lg font-black">{cMeta.btnB[0]}</span>}
            <span className="text-sm font-black">{cMeta.btnB}</span>
            <span className="text-[10px] font-bold opacity-80">
              {stakeNum > 0 && !stakeInvalid ? `+${potentialProfit} ${currency}` : `${payoutPct}%`}
            </span>
          </motion.button>
        </div>

        {/* ── Potential payout preview ───────────────────────── */}
        {stakeNum > 0 && !stakeInvalid && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="px-3 mt-1.5"
          >
            <div className="rounded-xl border border-white/8 overflow-hidden bg-white/3">
              <div className="grid grid-cols-3 divide-x divide-white/6">
                <div className="px-3 py-2 text-center">
                  <p className="text-[8px] font-mono text-white/30 uppercase tracking-wider mb-0.5">Stake</p>
                  <p className="text-xs font-black font-mono text-white/70">{stake} <span className="text-white/40 text-[9px]">{currency}</span></p>
                </div>
                <div className="px-3 py-2 text-center">
                  <p className="text-[8px] font-mono text-white/30 uppercase tracking-wider mb-0.5">Payout</p>
                  <p className="text-xs font-black font-mono text-white/50">{payoutPct}%{streakBoostPct > 0 ? <span className="text-orange-400 ml-1">+{streakBoostPct}%</span> : ""}</p>
                </div>
                <div className="px-3 py-2 text-center bg-[#00ff88]/5">
                  <p className="text-[8px] font-mono text-[#00ff88]/50 uppercase tracking-wider mb-0.5">Win</p>
                  <p className="text-xs font-black font-mono text-[#00ff88]">+{potentialProfit} <span className="text-[#00ff88]/60 text-[9px]">{currency}</span></p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── AI Auto-Trader panel ──────────────────────────── */}
        {isAuthed && autoConfig && (
          <div className="px-3 mt-3">
            <div className={`rounded-xl border overflow-hidden transition-colors ${
              autoConfig.enabled ? "border-primary/30 bg-primary/5" : "border-white/8 bg-white/3"
            }`}>

              {/* Header row */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <div className={`p-1.5 rounded-lg ${autoConfig.enabled ? "bg-primary/20" : "bg-white/8"}`}>
                  <Bot size={13} className={autoConfig.enabled ? "text-primary" : "text-muted-foreground/60"} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold leading-none ${autoConfig.enabled ? "text-primary" : "text-white/70"}`}>
                    AI Auto-Trader
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 mt-0.5 leading-none font-mono">
                    {autoConfig.enabled
                      ? `Next scan in ${nextCheckIn}s · ${selectedAsset} ${chartInterval}`
                      : "Watches market signals and trades for you"}
                  </p>
                </div>
                {autoConfig.enabled && (
                  <span className="text-[8px] font-black tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30 animate-pulse shrink-0">
                    RUNNING
                  </span>
                )}
              </div>

              {/* Status explanation banner when running */}
              {autoConfig.enabled && (
                <div className="mx-3 mb-2.5 px-2.5 py-2 rounded-lg bg-primary/8 border border-primary/15">
                  <p className="text-[10px] text-primary/80 leading-relaxed">
                    AI is scanning live signals every 60s. When it finds a strong setup it opens a trade automatically — you'll see it appear in <span className="font-bold">Active</span> below.
                  </p>
                  {sessionTarget !== null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (sessionDone / sessionTarget) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-primary/60 tabular-nums shrink-0">
                        {sessionDone}/{sessionTarget} trades · {sessionWins}W
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="px-3 pb-3 flex flex-col gap-2.5">
                {/* Risk presets */}
                <div>
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold mb-1.5">Risk Level</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["conservative", "balanced", "aggressive"] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handleAutoRisk(preset)}
                        className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                          autoConfig.riskPreset === preset
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {preset === "conservative" ? "Safe" : preset === "balanced" ? "Balanced" : "High"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Session target */}
                {!autoConfig.enabled && (
                  <div>
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold mb-1.5">Stop after</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([5, 10, 20, 50] as const).map((n) => (
                        <button
                          key={n}
                          onClick={() => handleStartSession(n)}
                          className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                            sessionTarget === n
                              ? "border-primary/60 bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {n} trades
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* START / STOP button */}
                <button
                  onClick={handleAutoToggle}
                  disabled={autoLoading}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${
                    autoConfig.enabled
                      ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                      : "bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30"
                  }`}
                >
                  {autoLoading ? (
                    <span className="text-[11px]">Updating…</span>
                  ) : autoConfig.enabled ? (
                    <><Square size={12} fill="currentColor" /> Stop AI Trading</>
                  ) : (
                    <><Play size={12} fill="currentColor" /> Start AI Trading</>
                  )}
                </button>

                {!autoConfig.enabled && (
                  <p className="text-[9px] text-muted-foreground/35 text-center leading-relaxed -mt-1">
                    Requires ≥5 completed trades to unlock · scans every 60s
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

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
                  <div className="text-center py-8 text-muted-foreground/50 text-sm">
                    {isBootstrapping ? "Connecting…" : "Open in Telegram to trade"}
                  </div>
                ) : activePositions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No active positions — place a trade above</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activePositions.map((p) => {
                      const livePrice  = currentPrices[p.assetSymbol];
                      const pCType     = (p.contractType ?? "UP_DOWN") as ContractType;
                      const pRaw       = p as unknown as Record<string, unknown>;
                      const pCurrency  = ((pRaw.currency as string | undefined) ?? "TON");
                      const priceDiff  = livePrice && p.entryPrice ? livePrice - p.entryPrice : null;

                      // Live "winning?" logic — matches server determineOutcome exactly
                      let isWinning: boolean | null = null;
                      if (livePrice !== undefined) {
                        if (pCType === "UP_DOWN") {
                          isWinning = priceDiff !== null ? (p.direction === "UP" ? priceDiff > 0 : priceDiff < 0) : null;
                        } else if (pCType === "EVEN_ODD") {
                          const dec = ASSET_DECIMAL_PLACES[p.assetSymbol] ?? 2;
                          const d   = lastDigitAt(livePrice, dec);
                          isWinning = p.direction === "EVEN" ? d % 2 === 0 : d % 2 !== 0;
                        } else if (pCType === "OVER_UNDER") {
                          const dec = ASSET_DECIMAL_PLACES[p.assetSymbol] ?? 2;
                          const d   = lastDigitAt(livePrice, dec);
                          isWinning = p.direction === "OVER" ? d >= 5 : d < 5;
                        } else if (pCType === "IN_OUT" && p.lowerBarrier && p.upperBarrier) {
                          const isIn = livePrice >= p.lowerBarrier && livePrice <= p.upperBarrier;
                          isWinning = p.direction === "IN" ? isIn : !isIn;
                        }
                      }

                      const assetPayout = asNum(apiAssets.find((a) => a.symbol === p.assetSymbol)?.payoutRatio, 1.82);
                      const pRaw2       = p as unknown as Record<string, unknown>;
                      const stake       = asNum((pRaw2.stakeStriker ?? pRaw2.stake) as number | string | undefined);
                      const liveProfit  = isWinning === true
                        ? parseFloat((stake * (assetPayout - 1)).toFixed(pCurrency === "STRIKER" ? 0 : 4))
                        : isWinning === false
                        ? -parseFloat(stake.toFixed(pCurrency === "STRIKER" ? 0 : 4))
                        : null;

                      const dirColor = ["UP","EVEN","OVER","IN"].includes(p.direction) ? "text-green-400 bg-green-500/15" : "text-red-400 bg-red-500/15";

                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`bg-card border rounded-xl px-3 py-2.5 transition-colors ${
                            isWinning === true  ? "border-green-500/30"
                            : isWinning === false ? "border-red-500/30"
                            : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${dirColor}`}>
                                {p.direction}
                              </span>
                              <span className="font-bold text-sm">{p.assetSymbol}</span>
                              <span className="text-[9px] text-muted-foreground/50 font-mono">{pCType.replace("_", "/")}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {stake.toFixed(pCurrency === "STRIKER" ? 0 : 4)} {pCurrency === "STRIKER" ? "STRK" : pCurrency}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={10} className="text-muted-foreground" />
                              <Countdown expiresAt={p.expiresAt} />
                            </div>
                          </div>

                          <PositionProgressBar createdAt={p.createdAt} expiresAt={p.expiresAt} isWinning={isWinning} />

                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-muted-foreground font-mono">{formatPrice(p.assetSymbol, p.entryPrice)}</span>
                            <span className="text-muted-foreground/40">→</span>
                            <span className={`font-mono font-bold ${
                              isWinning === true ? "text-green-400" : isWinning === false ? "text-red-400" : "text-muted-foreground"
                            }`}>
                              {livePrice ? formatPrice(p.assetSymbol, livePrice) : "…"}
                            </span>
                            {liveProfit !== null && (
                              <span className={`ml-auto text-xs font-black tabular-nums px-1.5 py-0.5 rounded ${
                                liveProfit >= 0 ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                              }`}>
                                {liveProfit >= 0 ? "+" : ""}{parseFloat(String(liveProfit)).toFixed(pCurrency === "STRIKER" ? 0 : 4)} {pCurrency === "STRIKER" ? "STRK" : pCurrency}
                              </span>
                            )}
                          </div>

                          {/* IN/OUT barrier band */}
                          {pCType === "IN_OUT" && (
                            <BarrierBand symbol={p.assetSymbol} lowerBarrier={p.lowerBarrier ?? null} upperBarrier={p.upperBarrier ?? null} currentPrice={livePrice} />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {!isAuthed ? (
                  <div className="text-center py-8 text-muted-foreground/50 text-sm">
                    {isBootstrapping ? "Connecting…" : "Open in Telegram to see history"}
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No completed trades yet</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {history.slice(0, 20).map((p) => {
                      const pAny      = p as unknown as Record<string, unknown>;
                      const pCurrency = (pAny.currency as string | undefined) ?? "TON";
                      const hStake    = asNum((pAny.stakeStriker ?? pAny.stake) as number | string | undefined);
                      const hWinAmt   = asNum(p.winAmount);
                      const netPnl    = p.outcome === "win"
                        ? parseFloat((hWinAmt - hStake).toFixed(pCurrency === "STRIKER" ? 0 : 4))
                        : p.outcome === "cancelled"
                        ? 0
                        : -parseFloat(hStake.toFixed(pCurrency === "STRIKER" ? 0 : 4));
                      const ccyLabel = pCurrency === "STRIKER" ? "STRK" : pCurrency;

                      return (
                        <div key={p.id} className="bg-card border border-border rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.outcome === "win"
                              ? <CheckCircle size={13} className="text-green-400 shrink-0" />
                              : p.outcome === "cancelled"
                              ? <MinusCircle size={13} className="text-yellow-400 shrink-0" />
                              : <XCircle size={13} className="text-red-400 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">
                                {p.assetSymbol}{" "}
                                <span className={["UP","EVEN","OVER","IN"].includes(p.direction) ? "text-green-400" : "text-red-400"}>
                                  {p.direction}
                                </span>
                                <span className="text-muted-foreground font-normal text-[10px] ml-1">
                                  {(p.contractType ?? "UP_DOWN").replace("_","/")}
                                </span>
                              </p>
                              <p className="text-[9px] text-muted-foreground font-mono">
                                {formatPrice(p.assetSymbol, p.entryPrice)} → {formatPrice(p.assetSymbol, p.exitPrice ?? p.entryPrice)}
                                <span className="ml-1.5">{new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-black tabular-nums ${
                              netPnl > 0 ? "text-green-400" : netPnl < 0 ? "text-red-400" : "text-yellow-400"
                            }`}>
                              {netPnl > 0 ? `+${parseFloat(String(netPnl)).toFixed(2)}` : netPnl === 0 ? "±0" : parseFloat(String(netPnl)).toFixed(2)}
                            </p>
                            <p className="text-[9px] text-muted-foreground">{ccyLabel}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Trade settlement overlay ──────────────────────── */}
      <AnimatePresence>
        {settlementResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex items-center justify-center ${
              settlementResult.outcome === "win" ? "pointer-events-auto" : "pointer-events-none"
            }`}
            onClick={() => { if (settlementResult.outcome === "win") setSettlementResult(null); }}
          >
            {/* Dark backdrop for wins */}
            {settlementResult.outcome === "win" && (
              <motion.div
                className="absolute inset-0 bg-black/75"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            )}

            {/* Radial glow */}
            {settlementResult.outcome === "win" && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0.2] }}
                transition={{ duration: 0.9 }}
                style={{ background: "radial-gradient(ellipse at center, rgba(0,255,136,0.22) 0%, transparent 65%)" }}
              />
            )}

            {/* Burst particles for wins */}
            {settlementResult.outcome === "win" && (
              <>
                {[...Array(14)].map((_, i) => {
                  const angle = (i * (360 / 14)) * (Math.PI / 180);
                  const dist  = 90 + (i % 3) * 30;
                  return (
                    <motion.div
                      key={i}
                      className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
                      style={{
                        background: i % 3 === 0 ? "#00ff88" : i % 3 === 1 ? "#f59e0b" : "#ffffff",
                        top: "50%", left: "50%",
                        marginTop: -5, marginLeft: -5,
                      }}
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.3 }}
                      transition={{ duration: 0.9, delay: 0.08 + i * 0.025, ease: "easeOut" }}
                    />
                  );
                })}
              </>
            )}

            <motion.div
              initial={{ scale: 0.55, opacity: 0, y: 32 }}
              animate={screenShake
                ? { scale: 1, opacity: 1, y: 0, x: [0, -10, 10, -7, 7, -3, 3, 0] }
                : { scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: -12 }}
              transition={{ type: "spring", stiffness: 360, damping: 24 }}
              className={`relative mx-6 rounded-2xl border px-8 py-7 text-center shadow-2xl ${
                settlementResult.outcome === "win"
                  ? "bg-[#001508]/98 border-green-500/55 shadow-green-500/25"
                  : settlementResult.outcome === "loss"
                  ? "bg-[#150000]/90 border-red-500/25 shadow-red-500/10"
                  : "bg-card border-border"
              }`}
            >
              {settlementResult.outcome === "win" ? (
                <>
                  {/* Trophy icon */}
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: [0, 1.4, 1], rotate: [0, 8, 0] }}
                    transition={{ delay: 0.05, duration: 0.55, type: "spring", stiffness: 280 }}
                    className="flex justify-center mb-3"
                  >
                    <div className="p-4 rounded-full" style={{ background: "rgba(0,255,136,0.14)", boxShadow: "0 0 32px rgba(0,255,136,0.3)" }}>
                      <Trophy size={44} className="text-green-400" />
                    </div>
                  </motion.div>

                  {/* WIN text */}
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.18, type: "spring", stiffness: 320, damping: 20 }}
                    className="text-5xl font-black mb-1 tracking-widest"
                    style={{ color: "#00ff88", textShadow: "0 0 28px rgba(0,255,136,0.55)" }}
                  >
                    WIN
                  </motion.div>

                  {/* Credit amount */}
                  <motion.div
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.32 }}
                    className="text-3xl font-black text-white tabular-nums mb-1"
                  >
                    +{settlementResult.currency === "STRIKER"
                      ? `${Math.round(settlementResult.credit).toLocaleString()} STRK`
                      : `${settlementResult.credit.toFixed(4)} ${settlementResult.currency}`}
                  </motion.div>

                  <div className="text-xs text-green-400/55 font-mono mb-2">
                    {settlementResult.symbol} · {settlementResult.direction}
                  </div>

                  {/* Streak info */}
                  {settlementResult.streak >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45 }}
                      className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-orange-300 bg-orange-500/10 rounded-lg px-3 py-1.5"
                    >
                      {[...Array(Math.min(settlementResult.streak, 4))].map((_, i) => (
                        <Flame key={i} size={11} className="text-orange-400" />
                      ))}
                      {settlementResult.streak}× streak · +{
                        settlementResult.streak >= 5 ? 7 : settlementResult.streak >= 4 ? 5 : settlementResult.streak >= 3 ? 3 : 2
                      }% boost
                    </motion.div>
                  )}

                  {/* Tap to dismiss */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 }}
                    className="mt-5 text-[10px] text-white/25 font-mono uppercase tracking-widest"
                  >
                    Tap anywhere to continue
                  </motion.div>
                </>
              ) : settlementResult.outcome === "loss" ? (
                <>
                  <motion.div
                    initial={{ opacity: 0, scale: 1.4 }}
                    animate={{ opacity: 1, scale: [1.4, 0.9, 1] }}
                    transition={{ duration: 0.4, type: "spring", stiffness: 300 }}
                    className="flex justify-center mb-3"
                  >
                    <div className="p-3 rounded-full" style={{ background: "rgba(239,68,68,0.14)", boxShadow: "0 0 24px rgba(239,68,68,0.25)" }}>
                      <TrendingDown size={40} className="text-red-400" />
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.12, type: "spring", stiffness: 320, damping: 20 }}
                    className="text-5xl font-black mb-1 tracking-widest"
                    style={{ color: "#ef4444", textShadow: "0 0 20px rgba(239,68,68,0.5)" }}
                  >
                    LOSS
                  </motion.div>
                  <motion.div
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="text-2xl font-black text-white/80 tabular-nums mb-1"
                  >
                    -{settlementResult.currency === "STRIKER"
                      ? `${Math.round(settlementResult.credit > 0 ? settlementResult.credit : parseFloat(stake || "0")).toLocaleString()} STRK`
                      : `${(settlementResult.credit > 0 ? settlementResult.credit : parseFloat(stake || "0")).toFixed(4)} ${settlementResult.currency}`}
                  </motion.div>
                  <div className="text-xs text-red-400/45 font-mono mb-0.5">
                    {settlementResult.symbol} · {settlementResult.direction}
                  </div>
                  <div className="text-[10px] text-muted-foreground/35 font-mono mt-1">Next trade could be different</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-black text-yellow-400 mb-1">REFUNDED</div>
                  <div className="text-sm text-muted-foreground">Price settled at entry</div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
