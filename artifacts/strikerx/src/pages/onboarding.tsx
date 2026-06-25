import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import {
  TrendingUp, TrendingDown, CheckCircle, XCircle,
  ArrowRight, Zap, SkipForward, Trophy, Target,
  BarChart2, Cpu, Flame, Gift, ChevronRight, Sparkles,
} from "lucide-react";
import LanguagePicker from "./language-picker";
import { saveLangLocally, getLangDir, type LangCode } from "@/i18n";
import { useTranslation } from "react-i18next";

// ─── Config ───────────────────────────────────────────────────────────────────
const TOTAL_TRADES   = 3;
const STAKE_USD      = 100;
const WIN_PCT        = 0.82;
const WIN_PAYOUT     = Math.round(STAKE_USD * WIN_PCT);
const START_BALANCE  = 1_000;
const SETTLE_SECS    = 5;

const DEMO_ASSETS = [
  { symbol: "BTC/USD",  base: 67_420.15, volatility: 200,  decimals: 2 },
  { symbol: "ETH/USD",  base:  3_582.40, volatility:  40,  decimals: 2 },
  { symbol: "GOLD/USD", base:  2_346.80, volatility:  12,  decimals: 2 },
  { symbol: "EUR/USD",  base:     1.0847, volatility: 0.002, decimals: 4 },
  { symbol: "SOL/USD",  base:   179.45,  volatility:   3,  decimals: 2 },
];

// Trade 0 is always scripted to win — hook the user on the first try
function makeOutcomes(): boolean[] {
  return [true, Math.random() < 0.5, Math.random() < 0.55];
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candle { open: number; high: number; low: number; close: number; }
interface CompletedTrade { asset: string; direction: "UP" | "DOWN"; won: boolean; pnl: number; }
type TradePhase = "pick" | "settling" | "result";
type OnboardStep = "splash" | "language" | "value" | "trading" | "summary";

// ─── Haptics ──────────────────────────────────────────────────────────────────
const haptic = {
  tap:     () => (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred("light"),
  medium:  () => (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium"),
  win:     () => (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  loss:    () => (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

// ─── Candle helpers ───────────────────────────────────────────────────────────
function makeCandle(prev: number, vol: number, dec: number, bias = 0): Candle {
  const open  = prev;
  const drift = (Math.random() - 0.5 + bias * 0.3) * vol;
  const close = parseFloat((open + drift).toFixed(dec));
  const wick  = Math.abs(drift) * (0.4 + Math.random());
  const high  = Math.max(open, close) + wick * Math.random();
  const low   = Math.min(open, close) - wick * Math.random();
  return { open, high: parseFloat(high.toFixed(dec)), low: parseFloat(low.toFixed(dec)), close };
}

function generateHistory(base: number, vol: number, dec: number, count = 22): Candle[] {
  const candles: Candle[] = [];
  let price = base * (0.97 + Math.random() * 0.06);
  for (let i = 0; i < count; i++) {
    const c = makeCandle(price, vol, dec);
    candles.push(c);
    price = c.close;
  }
  return candles;
}

function fmt2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── MiniChart ────────────────────────────────────────────────────────────────
function MiniChart({
  candles,
  entryPrice,
  exitPrice,
  direction,
}: {
  candles: Candle[];
  entryPrice?: number;
  exitPrice?: number;
  direction?: "UP" | "DOWN";
}) {
  const W = 288, H = 110;
  const pad = { t: 10, b: 10, l: 6, r: 6 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  if (!candles.length) return null;

  const allP = candles.flatMap(c => [c.high, c.low]);
  if (entryPrice) allP.push(entryPrice);
  if (exitPrice)  allP.push(exitPrice);
  const minP = Math.min(...allP);
  const maxP = Math.max(...allP);
  const range = maxP - minP || 1;

  const toY = (p: number) => pad.t + ((maxP - p) / range) * ch;
  const slotW = cw / candles.length;
  const bodyW = Math.max(2, slotW * 0.65);
  const toX  = (i: number) => pad.l + i * slotW + slotW / 2;

  const entryY = entryPrice != null ? toY(entryPrice) : null;
  const exitY  = exitPrice  != null ? toY(exitPrice)  : null;
  const dirColor = direction === "UP" ? "#00ff88" : "#f87171";

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* subtle grid */}
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t}
          x1={pad.l} y1={pad.t + t * ch}
          x2={W - pad.r} y2={pad.t + t * ch}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}
        />
      ))}

      {/* candles */}
      {candles.map((c, i) => {
        const x     = toX(i);
        const isUp  = c.close >= c.open;
        const col   = isUp ? "#00ff88" : "#f87171";
        const bodyT = toY(Math.max(c.open, c.close));
        const bodyB = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyB - bodyT);
        const isLast = i === candles.length - 1;
        return (
          <g key={i} opacity={isLast ? 1 : 0.8}>
            <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)}
              stroke={col} strokeWidth={0.6} />
            <rect
              x={x - bodyW / 2} y={bodyT}
              width={bodyW} height={bodyH}
              fill={isUp ? col : "transparent"}
              stroke={col} strokeWidth={0.8}
            />
          </g>
        );
      })}

      {/* entry line */}
      {entryY != null && (
        <g>
          <line
            x1={pad.l} y1={entryY}
            x2={W - pad.r} y2={entryY}
            stroke={dirColor} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.9}
          />
          <rect x={pad.l} y={entryY - 8} width={42} height={14} rx={2}
            fill={dirColor} opacity={0.15} />
          <text x={pad.l + 3} y={entryY + 4}
            fontSize={7.5} fontFamily="monospace" fill={dirColor} fontWeight="bold">
            ENTRY
          </text>
        </g>
      )}

      {/* exit dot + line */}
      {exitY != null && exitPrice != null && entryPrice != null && (
        <g>
          <line
            x1={pad.l} y1={exitY}
            x2={W - pad.r} y2={exitY}
            stroke={exitPrice >= entryPrice ? "#00ff88" : "#f87171"}
            strokeWidth={0.8} strokeDasharray="2 4" opacity={0.55}
          />
          <circle cx={toX(candles.length - 1)} cy={exitY} r={4.5}
            fill={exitPrice >= entryPrice ? "#00ff88" : "#f87171"} opacity={0.95} />
        </g>
      )}
    </svg>
  );
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);

  const letters = "STRIKERX".split("");

  return (
    <motion.div
      className="fixed inset-0 bg-[#060a14] flex flex-col items-center justify-center overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Stadium light beams */}
      {["-30deg", "0deg", "30deg"].map((angle, i) => (
        <motion.div
          key={i}
          className="absolute top-0 left-1/2 w-px"
          style={{
            height: "70vh",
            transformOrigin: "top center",
            transform: `translateX(-50%) rotate(${angle})`,
            background: `linear-gradient(to bottom, rgba(0,255,136,0.18), transparent)`,
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.8, delay: i * 0.12 }}
        />
      ))}

      {/* Radial glow */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(0,255,136,0.07) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />

      {/* Logo */}
      <div className="relative flex flex-col items-center gap-5">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.2 }}
          className="w-16 h-16 rounded-2xl border border-[#00ff88]/30 bg-[#00ff88]/8 flex items-center justify-center"
        >
          <Zap className="w-8 h-8 text-[#00ff88]" />
        </motion.div>

        <div className="flex gap-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {letters.map((l, i) => (
            <motion.span
              key={i}
              className="text-4xl font-black tracking-widest text-[#00ff88]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.055, duration: 0.25 }}
            >
              {l}
            </motion.span>
          ))}
        </div>

        <motion.p
          className="text-xs font-mono text-white/35 tracking-[0.25em] uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.5 }}
        >
          Predict · Win · Repeat
        </motion.p>
      </div>
    </motion.div>
  );
}

// ─── Value Cards ──────────────────────────────────────────────────────────────
const MOCK_MARKETS = [
  { symbol: "BTC/USD", price: "67,420.15", change: "+2.4%" },
  { symbol: "ETH/USD", price: "3,582.40",  change: "+1.8%" },
  { symbol: "GOLD/USD",price: "2,346.80",  change: "+0.6%" },
  { symbol: "EUR/USD", price: "1.0847",    change: "-0.3%" },
  { symbol: "SOL/USD", price: "179.45",    change: "+4.1%" },
];

function MarketsCard() {
  const [prices, setPrices] = useState(MOCK_MARKETS.map(m => m.price));
  const [dirs, setDirs]     = useState(MOCK_MARKETS.map(() => "up" as "up" | "down"));

  useEffect(() => {
    const id = setInterval(() => {
      const idx = Math.floor(Math.random() * MOCK_MARKETS.length);
      setDirs(d => d.map((v, i) => i === idx ? (Math.random() > 0.4 ? "up" : "down") : v));
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-2 mb-1">
        <BarChart2 className="w-4 h-4 text-[#00ff88]" />
        <span className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">30+ Live Markets</span>
      </div>
      {MOCK_MARKETS.map((m, i) => (
        <motion.div
          key={m.symbol}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07 }}
          className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/8"
        >
          <span className="text-[11px] font-mono font-bold text-white/70">{m.symbol}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-black tabular-nums transition-colors duration-300 ${
              dirs[i] === "up" ? "text-[#00ff88]" : "text-red-400"
            }`}>${m.price}</span>
            <span className={`text-[10px] font-mono ${m.change.startsWith("+") ? "text-[#00ff88]/70" : "text-red-400/70"}`}>
              {m.change}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function PayoutCard() {
  const controls = useAnimation();
  useEffect(() => {
    const run = async () => {
      await controls.start({ width: "0%" });
      await new Promise(r => setTimeout(r, 300));
      await controls.start({ width: "82%", transition: { duration: 1.4, ease: "easeOut" } });
    };
    run();
    const id = setInterval(run, 3500);
    return () => clearInterval(id);
  }, [controls]);

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-[#f59e0b]" />
        <span className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Fixed-Odds Payout</span>
      </div>
      <div className="bg-white/4 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div className="text-center">
          <div className="text-5xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            1.82<span className="text-[#00ff88]">×</span>
          </div>
          <div className="text-[11px] font-mono text-white/35 mt-1">guaranteed payout ratio</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[10px] font-mono text-white/30">
            <span>0×</span><span>1.82×</span><span>2×</span>
          </div>
          <div className="h-3 rounded-full bg-white/8 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#00ff88]/70 to-[#00ff88]"
              animate={controls}
              style={{ width: "0%" }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {[["Stake $100", "→ Win $182"], ["Settle time", "~5 seconds"]].map(([label, val]) => (
            <div key={label} className="bg-white/3 rounded-xl p-2.5 text-center">
              <div className="text-[9px] font-mono text-white/30 uppercase">{label}</div>
              <div className="text-xs font-mono font-bold text-white mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EdgeCard() {
  const [streakCount, setStreakCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStreakCount(s => s < 5 ? s + 1 : 0), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-[#a78bfa]" />
        <span className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Your Edge</span>
      </div>

      {/* AI Signal card */}
      <div className="bg-gradient-to-br from-[#a78bfa]/10 to-transparent border border-[#a78bfa]/20 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#a78bfa]" />
            <span className="text-[11px] font-mono font-bold text-[#a78bfa]">AI Signal · BTC/USD</span>
          </div>
          <span className="text-[9px] font-mono text-white/30">LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20">
            <TrendingUp className="w-4 h-4 text-[#00ff88]" />
            <span className="text-sm font-black text-[#00ff88]">UP</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-mono text-white/40">Confidence</div>
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-4 h-1.5 rounded-full ${i < 4 ? "bg-[#00ff88]" : "bg-white/15"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Win streak */}
      <div className="bg-gradient-to-br from-[#f59e0b]/10 to-transparent border border-[#f59e0b]/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span className="text-[11px] font-mono font-bold text-[#f59e0b]">Win Streak Bonus</span>
        </div>
        <div className="flex gap-1.5 mb-2">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i < streakCount ? [1, 1.3, 1] : 1 }}
              transition={{ duration: 0.3 }}
              className={`flex-1 h-8 rounded-lg flex items-center justify-center ${
                i < streakCount
                  ? "bg-[#f59e0b]/20 border border-[#f59e0b]/40"
                  : "bg-white/4 border border-white/8"
              }`}
            >
              {i < streakCount
                ? <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
                : <span className="text-[10px] font-mono text-white/20">{i + 1}</span>
              }
            </motion.div>
          ))}
        </div>
        <div className="text-[10px] font-mono text-white/35">5-win streak → 1.95× payout boost</div>
      </div>
    </div>
  );
}

function ValueCards({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const cards = [
    { id: "markets", content: <MarketsCard /> },
    { id: "payout",  content: <PayoutCard /> },
    { id: "edge",    content: <EdgeCard /> },
  ];

  useEffect(() => {
    const t = setTimeout(() => {
      if (idx < cards.length - 1) setIdx(i => i + 1);
    }, 3200);
    return () => clearTimeout(t);
  }, [idx, cards.length]);

  const advance = () => {
    haptic.tap();
    if (idx < cards.length - 1) { setIdx(i => i + 1); }
    else { onDone(); }
  };

  const isLast = idx === cards.length - 1;

  return (
    <div className="flex flex-col gap-4 w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={cards[idx].id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.28 }}
        >
          {cards[idx].content}
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => { haptic.tap(); setIdx(i); }}
            className={`rounded-full transition-all ${i === idx ? "w-5 h-1.5 bg-[#00ff88]" : "w-1.5 h-1.5 bg-white/20"}`}
          />
        ))}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={advance}
        className={`w-full h-12 rounded-2xl font-black tracking-widest flex items-center justify-center gap-2 transition-all ${
          isLast
            ? "bg-[#00ff88] text-[#060a14] hover:bg-[#00ff88]/90"
            : "bg-white/6 border border-white/12 text-white/70 hover:bg-white/10"
        }`}
        style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
      >
        {isLast ? (
          <><Zap className="w-4 h-4" />TRY A DEMO TRADE</>
        ) : (
          <>NEXT<ChevronRight className="w-4 h-4" /></>
        )}
      </motion.button>
    </div>
  );
}

// ─── Trading Session ──────────────────────────────────────────────────────────
function TradingSession({
  onSkip,
  onDone,
}: {
  onSkip: (c: CompletedTrade[], b: number) => void;
  onDone: (c: CompletedTrade[], b: number) => void;
}) {
  const outcomesRef = useRef(makeOutcomes());
  const [tradeIdx, setTradeIdx]   = useState(0);
  const [phase, setPhase]         = useState<TradePhase>("pick");
  const [balance, setBalance]     = useState(START_BALANCE);
  const [direction, setDirection] = useState<"UP" | "DOWN" | null>(null);
  const [countdown, setCountdown] = useState(SETTLE_SECS);
  const [completed, setCompleted] = useState<CompletedTrade[]>([]);
  const [entryPrice, setEntryPrice] = useState<number | undefined>();
  const [exitPrice, setExitPrice]   = useState<number | undefined>();

  const assetDef  = DEMO_ASSETS[tradeIdx % DEMO_ASSETS.length];
  const outcome   = outcomesRef.current[tradeIdx];

  // Candle history: generated once per trade
  const candlesRef = useRef<Candle[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Initialize/reset candles for each trade
  useEffect(() => {
    const hist = generateHistory(assetDef.base, assetDef.volatility, assetDef.decimals, 22);
    candlesRef.current = hist;
    setCandles([...hist]);
    setEntryPrice(undefined);
    setExitPrice(undefined);
    setDirection(null);
  }, [tradeIdx, assetDef.base, assetDef.volatility, assetDef.decimals]);

  // Live candle tick during "pick" phase
  useEffect(() => {
    if (phase !== "pick") return;
    const id = setInterval(() => {
      const last = candlesRef.current[candlesRef.current.length - 1];
      const updated: Candle = {
        ...last,
        close: parseFloat((last.close + (Math.random() - 0.49) * assetDef.volatility * 0.15).toFixed(assetDef.decimals)),
      };
      updated.high = Math.max(updated.high, updated.close);
      updated.low  = Math.min(updated.low,  updated.close);
      const next = [...candlesRef.current.slice(0, -1), updated];
      candlesRef.current = next;
      setCandles([...next]);
    }, 700);
    return () => clearInterval(id);
  }, [phase, assetDef.volatility, assetDef.decimals]);

  // Settle phase: add new candles + countdown
  useEffect(() => {
    if (phase !== "settling") return;
    setCountdown(SETTLE_SECS);

    const bias = outcome ? (direction === "UP" ? 0.65 : -0.65) : (direction === "UP" ? -0.65 : 0.65);

    const cdId = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(cdId); return 0; }
        // Add a new candle each tick
        const last = candlesRef.current[candlesRef.current.length - 1];
        const newC = makeCandle(last.close, assetDef.volatility * 0.8, assetDef.decimals, bias);
        const next = [...candlesRef.current.slice(-24), newC];
        candlesRef.current = next;
        setCandles([...next]);
        return c - 1;
      });
    }, 1000);

    const settleId = setTimeout(() => {
      clearInterval(cdId);
      const lastClose = candlesRef.current[candlesRef.current.length - 1].close;
      setExitPrice(lastClose);
      const won = outcome;
      const pnl = won ? WIN_PAYOUT : -STAKE_USD;
      setBalance(b => b + pnl);
      setCompleted(prev => [...prev, { asset: assetDef.symbol, direction: direction!, won, pnl }]);
      setPhase("result");
      if (won) haptic.win(); else haptic.loss();
    }, SETTLE_SECS * 1000);

    return () => { clearInterval(cdId); clearTimeout(settleId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Auto-advance after result
  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(() => {
      if (tradeIdx >= TOTAL_TRADES - 1) {
        onDone(completed, balance);
      } else {
        setTradeIdx(i => i + 1);
        setPhase("pick");
      }
    }, 2000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleDirection = (dir: "UP" | "DOWN") => {
    haptic.medium();
    const ep = candlesRef.current[candlesRef.current.length - 1].close;
    setEntryPrice(ep);
    setDirection(dir);
    setPhase("settling");
  };

  const currentPrice = candles.length ? candles[candles.length - 1].close : assetDef.base;
  const won = phase === "result" && outcome;
  const dirColor = direction === "UP" ? "#00ff88" : "#f87171";

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="flex flex-col gap-3"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/30">
          <Zap className="w-2.5 h-2.5 text-[#f59e0b]" />
          <span className="text-[9px] font-mono font-black text-[#f59e0b] tracking-widest">DEMO MODE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/30">
            Trade <span className="text-white/60 font-bold">{tradeIdx + 1}</span>/{TOTAL_TRADES}
          </span>
          <button
            onClick={() => { haptic.tap(); onSkip(completed, balance); }}
            className="flex items-center gap-1 text-[10px] font-mono text-white/25 hover:text-white/55 transition-colors"
          >
            <SkipForward className="w-3 h-3" />Skip
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: TOTAL_TRADES }).map((_, i) => {
          const t = completed[i];
          return (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
              i < completed.length
                ? t.won ? "bg-[#00ff88]" : "bg-red-400"
                : i === tradeIdx ? "bg-white/40" : "bg-white/10"
            }`} />
          );
        })}
      </div>

      {/* Balance */}
      <div className="bg-white/4 border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between">
        <div>
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-0.5">Demo Balance</div>
          <div className="font-mono font-black text-xl text-white tabular-nums">${fmt2(balance)}</div>
        </div>
        {balance !== START_BALANCE && (
          <div className={`text-right text-sm font-mono font-black tabular-nums ${balance > START_BALANCE ? "text-[#00ff88]" : "text-red-400"}`}>
            {balance > START_BALANCE ? "+" : ""}{fmt2(balance - START_BALANCE)}
          </div>
        )}
      </div>

      {/* Asset header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-mono font-bold text-white/60">{assetDef.symbol}</span>
        <span className={`font-mono font-black text-base tabular-nums transition-colors duration-300 ${
          phase === "pick" ? "text-white" : direction === "UP" ? "text-[#00ff88]" : "text-red-400"
        }`}>
          ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: assetDef.decimals, maximumFractionDigits: assetDef.decimals })}
        </span>
      </div>

      {/* Chart */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-3 overflow-hidden">
        <MiniChart
          candles={candles}
          entryPrice={entryPrice}
          exitPrice={exitPrice}
          direction={direction ?? undefined}
        />
      </div>

      {/* Phase content */}
      <AnimatePresence mode="wait">
        {phase === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-2">
            <div className="text-[10px] font-mono text-white/25 text-center uppercase tracking-wider">
              Stake ${STAKE_USD} · Win ${STAKE_USD + WIN_PAYOUT} · Duration {SETTLE_SECS}s
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["UP", "DOWN"] as const).map(dir => (
                <motion.button
                  key={dir}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDirection(dir)}
                  className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all ${
                    dir === "UP"
                      ? "border-[#00ff88]/30 bg-[#00ff88]/8 hover:bg-[#00ff88]/16"
                      : "border-red-400/30 bg-red-400/8 hover:bg-red-400/16"
                  }`}
                >
                  {dir === "UP"
                    ? <TrendingUp  className="w-6 h-6 text-[#00ff88]" />
                    : <TrendingDown className="w-6 h-6 text-red-400" />}
                  <span className={`font-display font-black text-sm tracking-wider ${
                    dir === "UP" ? "text-[#00ff88]" : "text-red-400"
                  }`}>{dir}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "settling" && (
          <motion.div key="settling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between px-1">
              <div className={`flex items-center gap-1.5 text-xs font-mono font-bold`} style={{ color: dirColor }}>
                {direction === "UP"
                  ? <TrendingUp className="w-3.5 h-3.5" />
                  : <TrendingDown className="w-3.5 h-3.5" />}
                {direction} · Settling…
              </div>
              <div className="text-lg font-mono font-black text-white tabular-nums">
                {countdown}s
              </div>
            </div>
            <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: dirColor }}
                initial={{ width: "0%" }}
                animate={{ width: `${((SETTLE_SECS - countdown) / SETTLE_SECS) * 100}%` }}
                transition={{ duration: 0.9, ease: "linear" }}
              />
            </div>
          </motion.div>
        )}

        {phase === "result" && (
          <motion.div key="result"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2 py-3"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                won
                  ? "bg-[#00ff88]/15 border-2 border-[#00ff88]/40"
                  : "bg-red-400/15 border-2 border-red-400/40"
              }`}
            >
              {won
                ? <CheckCircle className="w-7 h-7 text-[#00ff88]" />
                : <XCircle    className="w-7 h-7 text-red-400" />}
            </motion.div>
            <div className={`font-black text-2xl tabular-nums ${won ? "text-[#00ff88]" : "text-red-400"}`}>
              {won ? `+$${WIN_PAYOUT}` : `-$${STAKE_USD}`}
            </div>
            <div className="text-[10px] font-mono text-white/30">
              {won ? "Contract won · 82% payout" : "Contract lost · Market moved against you"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Summary Screen ───────────────────────────────────────────────────────────
function SummaryScreen({
  completed,
  finalBalance,
  onContinue,
}: {
  completed: CompletedTrade[];
  finalBalance: number;
  onContinue: () => void;
}) {
  const wins   = completed.filter(t => t.won).length;
  const losses = completed.filter(t => !t.won).length;
  const profit = finalBalance - START_BALANCE;
  const isPos  = profit >= 0;
  const wr     = completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0;
  const streakCount = completed.reduce((max, _, i, arr) => {
    let streak = 0;
    for (let j = i; j < arr.length && arr[j].won; j++) streak++;
    return Math.max(max, streak);
  }, 0);

  return (
    <motion.div
      key="summary"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-4"
    >
      {/* Trophy */}
      <div className="flex flex-col items-center gap-2 text-center pt-2">
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 250, damping: 16, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-[#f59e0b]/15 border-2 border-[#f59e0b]/30 flex items-center justify-center"
        >
          <Trophy className="w-8 h-8 text-[#f59e0b]" />
        </motion.div>
        <div className="font-black text-xl text-white">Demo Session Complete</div>
        <div className="text-xs font-mono text-white/35">Here's how you traded</div>
      </div>

      {/* Final balance */}
      <div className="bg-white/4 border border-white/10 rounded-2xl px-4 py-4 text-center">
        <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">Final Balance</div>
        <div className="font-mono font-black text-3xl text-white tabular-nums">${fmt2(finalBalance)}</div>
        {completed.length > 0 && (
          <div className={`mt-1.5 font-mono font-black text-base tabular-nums ${isPos ? "text-[#00ff88]" : "text-red-400"}`}>
            {isPos ? "+" : ""}{fmt2(profit)}{" "}
            <span className="text-xs font-normal">({isPos ? "+" : ""}{((profit / START_BALANCE) * 100).toFixed(1)}%)</span>
          </div>
        )}
      </div>

      {/* Stats */}
      {completed.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Trades",   value: String(completed.length) },
            { label: "Win Rate", value: `${wr}%` },
            { label: "W / L",    value: `${wins} / ${losses}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
              <div className="text-[8px] font-mono text-white/30 uppercase tracking-wider mb-1">{label}</div>
              <div className="font-black text-sm text-white">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trade log */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-1">
          {completed.map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/3 border border-white/6">
              <span className="text-[9px] font-mono text-white/25 w-4">#{i + 1}</span>
              <span className="text-[10px] font-mono text-white/50 flex-1">{t.asset}</span>
              <span className={`text-[9px] font-mono font-bold flex items-center gap-0.5 ${t.direction === "UP" ? "text-[#00ff88]" : "text-red-400"}`}>
                {t.direction === "UP" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {t.direction}
              </span>
              <span className={`text-[10px] font-mono font-black tabular-nums ${t.won ? "text-[#00ff88]" : "text-red-400"}`}>
                {t.won ? `+$${WIN_PAYOUT}` : `-$${STAKE_USD}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Streak teaser */}
      {streakCount >= 2 && (
        <div className="bg-gradient-to-br from-[#f59e0b]/10 to-transparent border border-[#f59e0b]/20 rounded-2xl p-3 flex items-center gap-3">
          <Flame className="w-5 h-5 text-[#f59e0b] shrink-0" />
          <div>
            <div className="text-xs font-bold text-[#f59e0b]">{streakCount}-trade streak!</div>
            <div className="text-[10px] font-mono text-white/40 leading-tight mt-0.5">
              Real mode: a 5-win streak boosts your payout to 1.95×
            </div>
          </div>
        </div>
      )}

      {/* Welcome bonus banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-[#00ff88]/12 to-[#00ff88]/4 border border-[#00ff88]/25 rounded-2xl p-4 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-[#00ff88]/15 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-[#00ff88]" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-black text-white">500 STRIKER Welcome Bonus</div>
          <div className="text-[10px] font-mono text-white/45 leading-snug mt-0.5">
            Free tokens credited on your first deposit. Start real trading instantly.
          </div>
        </div>
        <Sparkles className="w-4 h-4 text-[#00ff88]/50 shrink-0" />
      </motion.div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => { haptic.medium(); onContinue(); }}
        className="w-full h-12 rounded-2xl bg-[#00ff88] text-[#060a14] font-black tracking-widest flex items-center justify-center gap-2 hover:bg-[#00ff88]/90 transition-colors"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
      >
        START TRADING
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
}

// ─── OnboardingFlow ───────────────────────────────────────────────────────────
export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [, navigate] = useLocation();
  const { i18n }     = useTranslation();
  const [step, setStep] = useState<OnboardStep>("splash");
  const [summaryData, setSummaryData] = useState<{ completed: CompletedTrade[]; balance: number }>({
    completed: [], balance: START_BALANCE,
  });

  const handleLangSelect = (code: LangCode) => {
    saveLangLocally(code);
    i18n.changeLanguage(code);
    document.documentElement.dir  = getLangDir(code);
    document.documentElement.lang = code;
    setStep("value");
  };

  const handleDone = (completed: CompletedTrade[], balance: number) => {
    setSummaryData({ completed, balance });
    setStep("summary");
  };

  const handleSkip = (completed: CompletedTrade[], balance: number) => {
    setSummaryData({ completed, balance });
    setStep("summary");
  };

  const handleComplete = () => {
    try { localStorage.setItem("strikerx_onboarded", "1"); } catch { /* ignore */ }
    onComplete();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#060a14] overflow-y-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      <AnimatePresence mode="wait">
        {step === "splash" && (
          <SplashScreen key="splash" onDone={() => setStep("language")} />
        )}

        {step === "language" && (
          <motion.div key="language" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LanguagePicker onSelect={handleLangSelect} />
          </motion.div>
        )}

        {step !== "splash" && step !== "language" && (
          <motion.div
            key="inner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-start px-5 py-6 min-h-screen"
          >
            <div className="w-full max-w-sm">
              {step !== "summary" && (
                <div className="text-center mb-5">
                  <div className="font-black text-xl tracking-widest text-[#00ff88]"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    STRIKERX
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === "value" && (
                  <motion.div key="value" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <ValueCards onDone={() => setStep("trading")} />
                  </motion.div>
                )}

                {step === "trading" && (
                  <TradingSession key="trading" onSkip={handleSkip} onDone={handleDone} />
                )}

                {step === "summary" && (
                  <SummaryScreen
                    key="summary"
                    completed={summaryData.completed}
                    finalBalance={summaryData.balance}
                    onContinue={handleComplete}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
