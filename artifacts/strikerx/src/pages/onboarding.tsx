import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, CheckCircle, XCircle,
  ArrowRight, Zap, SkipForward, Trophy, Target,
} from "lucide-react";
import LanguagePicker from "./language-picker";
import { saveLangLocally, getLangDir, type LangCode } from "@/i18n";
import { useTranslation } from "react-i18next";

// ─── Config ──────────────────────────────────────────────────────────────────

const TOTAL_TRADES   = 3;
const STAKE_USD      = 100;
const WIN_PCT        = 0.82;
const WIN_PAYOUT     = Math.round(STAKE_USD * WIN_PCT); // $82
const TON_RATE       = 7;                               // 1 TON = $7 (fixed for demo)
const START_BALANCE  = 1_000;
const SETTLE_MS      = 2500;
const RESULT_MS      = 1600;

const DEMO_ASSETS = [
  { symbol: "BTC/USD",  base: 67_420.15, step: 110 },
  { symbol: "ETH/USD",  base: 3_582.40,  step: 18  },
  { symbol: "XRP/USD",  base: 0.6124,    step: 0.0025 },
  { symbol: "EUR/USD",  base: 1.0847,    step: 0.0004 },
  { symbol: "GOLD/USD", base: 2_346.80,  step: 6   },
  { symbol: "BNB/USD",  base: 594.20,    step: 3   },
  { symbol: "SOL/USD",  base: 179.45,    step: 1.4 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** All outcomes random — no scripted results. Markets are honest. */
function makeOutcomes(): boolean[] {
  return Array.from({ length: TOTAL_TRADES }, () => Math.random() < 0.5);
}

function fmt(usd: number) {
  return usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTon(usd: number) {
  return (usd / TON_RATE).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPrice(n: number) {
  if (n < 1) return n.toFixed(4);
  if (n < 10) return n.toFixed(3);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DemoBadge() {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/30">
      <Zap className="w-2.5 h-2.5 text-[#f59e0b]" />
      <span className="text-[9px] font-mono font-black text-[#f59e0b] tracking-widest">DEMO MODE</span>
    </div>
  );
}

function BalanceBar({ usd }: { usd: number }) {
  const delta = usd - START_BALANCE;
  const isPos = delta >= 0;
  return (
    <div className="bg-white/4 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
      <div>
        <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-0.5">Demo Balance</div>
        <div className="font-mono font-black text-2xl text-white tabular-nums">${fmt(usd)}</div>
        <div className="text-[10px] font-mono text-white/30 mt-0.5">≈ {fmtTon(usd)} TON</div>
      </div>
      {delta !== 0 && (
        <div className={`text-right text-sm font-mono font-black tabular-nums ${isPos ? "text-[#00ff88]" : "text-red-400"}`}>
          {isPos ? "+" : ""}{fmt(delta)}
          <div className="text-[9px] font-normal text-white/30 mt-0.5">
            {isPos ? "+" : ""}{((delta / START_BALANCE) * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

function LivePrice({ asset }: { asset: typeof DEMO_ASSETS[0] }) {
  const [price, setPrice] = useState(asset.base);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const prev = useRef(asset.base);

  useEffect(() => {
    setPrice(asset.base);
    prev.current = asset.base;
  }, [asset.symbol, asset.base]);

  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => {
        const next = +(p + (Math.random() - 0.48) * asset.step).toFixed(
          asset.base < 1 ? 4 : asset.base < 10 ? 3 : 2
        );
        setDir(next >= prev.current ? "up" : "down");
        prev.current = next;
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [asset.base, asset.step]);

  return (
    <div className="flex items-center justify-between">
      <div className="text-xs font-mono font-bold text-white/60">{asset.symbol}</div>
      <div className={`font-mono font-black text-xl tabular-nums transition-colors duration-300 ${
        dir === "up" ? "text-[#00ff88]" : dir === "down" ? "text-red-400" : "text-white"
      }`}>
        ${fmtPrice(price)}
      </div>
    </div>
  );
}

// ─── Full Demo Session ────────────────────────────────────────────────────────

interface CompletedTrade {
  asset: string;
  direction: "UP" | "DOWN";
  won: boolean;
  pnl: number;
}

type Phase = "pick" | "settling" | "result";

interface TradingSessionProps {
  onSkip: (completed: CompletedTrade[], balance: number) => void;
  onDone: (completed: CompletedTrade[], balance: number) => void;
}

function TradingSession({ onSkip, onDone }: TradingSessionProps) {
  const outcomesRef = useRef(makeOutcomes());
  const [tradeIdx, setTradeIdx]       = useState(0);
  const [phase, setPhase]             = useState<Phase>("pick");
  const [balance, setBalance]         = useState(START_BALANCE);
  const [direction, setDirection]     = useState<"UP" | "DOWN" | null>(null);
  const [progress, setProgress]       = useState(0);
  const [completed, setCompleted]     = useState<CompletedTrade[]>([]);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const asset = DEMO_ASSETS[tradeIdx % DEMO_ASSETS.length];
  const outcome = outcomesRef.current[tradeIdx];

  const settle = useCallback((dir: "UP" | "DOWN") => {
    setDirection(dir);
    setPhase("settling");
    setProgress(0);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const pct = Math.min(100, ((now - startRef.current) / SETTLE_MS) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Show result
        const won = outcome;
        const pnl = won ? WIN_PAYOUT : -STAKE_USD;
        setBalance((b) => b + pnl);
        setCompleted((prev) => [
          ...prev,
          { asset: asset.symbol, direction: dir, won, pnl },
        ]);
        setPhase("result");
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [outcome, asset.symbol]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Auto-advance after result
  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(() => {
      if (tradeIdx >= TOTAL_TRADES - 1) {
        onDone(completed.concat(), balance);
      } else {
        setTradeIdx((i) => i + 1);
        setPhase("pick");
        setDirection(null);
        setProgress(0);
      }
    }, RESULT_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const won = phase === "result" && outcome;
  const pnl = won ? WIN_PAYOUT : -STAKE_USD;

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="flex flex-col gap-3"
    >
      {/* Top bar: badge + counter + skip */}
      <div className="flex items-center justify-between">
        <DemoBadge />
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/30">
            Trade <span className="text-white/60 font-bold">{tradeIdx + 1}</span> / {TOTAL_TRADES}
          </span>
          <button
            onClick={() => onSkip(completed, balance)}
            className="flex items-center gap-1 text-[10px] font-mono text-white/25 hover:text-white/60 transition-colors"
          >
            <SkipForward className="w-3 h-3" />
            Skip
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: TOTAL_TRADES }).map((_, i) => {
          const t = completed[i];
          return (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${
                i < completed.length
                  ? t.won ? "bg-[#00ff88]" : "bg-red-400"
                  : i === tradeIdx
                  ? "bg-white/40"
                  : "bg-white/10"
              }`}
            />
          );
        })}
      </div>

      {/* Balance */}
      <BalanceBar usd={balance} />

      {/* Price card */}
      <div className="bg-white/4 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-2">
        <LivePrice asset={asset} />
        <div className="flex justify-between text-[10px] font-mono text-white/25">
          <span>STAKE: ${STAKE_USD}</span>
          <span>PAYOUT: {Math.round(WIN_PCT * 100)}% (+${WIN_PAYOUT})</span>
        </div>
      </div>

      {/* Phase: pick */}
      <AnimatePresence mode="wait">
        {phase === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => settle("UP")}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl border border-[#00ff88]/30 bg-[#00ff88]/8 hover:bg-[#00ff88]/15 transition-all"
            >
              <TrendingUp className="w-6 h-6 text-[#00ff88]" />
              <span className="font-display font-black text-sm text-[#00ff88] tracking-wider">UP</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => settle("DOWN")}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl border border-red-400/30 bg-red-400/8 hover:bg-red-400/15 transition-all"
            >
              <TrendingDown className="w-6 h-6 text-red-400" />
              <span className="font-display font-black text-sm text-red-400 tracking-wider">DOWN</span>
            </motion.button>
          </motion.div>
        )}

        {/* Phase: settling */}
        {phase === "settling" && (
          <motion.div key="settling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 py-2">
            <div className={`flex items-center gap-1.5 text-xs font-mono font-bold ${
              direction === "UP" ? "text-[#00ff88]" : "text-red-400"
            }`}>
              {direction === "UP"
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />}
              {direction} · Settling contract…
            </div>
            <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
              <motion.div className="h-full bg-[#00ff88] rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </motion.div>
        )}

        {/* Phase: result */}
        {phase === "result" && (
          <motion.div key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2 py-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                won
                  ? "bg-[#00ff88]/15 border-2 border-[#00ff88]/40"
                  : "bg-red-400/15 border-2 border-red-400/40"
              }`}
            >
              {won
                ? <CheckCircle className="w-7 h-7 text-[#00ff88]" />
                : <XCircle className="w-7 h-7 text-red-400" />}
            </motion.div>
            <div className="text-center">
              <div className={`font-black text-2xl tabular-nums ${won ? "text-[#00ff88]" : "text-red-400"}`}>
                {won ? `+$${WIN_PAYOUT}` : `-$${STAKE_USD}`}
              </div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {won ? "Contract won · 82% payout" : "Contract lost · Prediction incorrect"}
              </div>
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
  const wins   = completed.filter((t) => t.won).length;
  const losses = completed.filter((t) => !t.won).length;
  const profit = finalBalance - START_BALANCE;
  const isPos  = profit >= 0;
  const wr     = completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0;

  return (
    <motion.div
      key="summary"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-4"
    >
      {/* Badge */}
      <div className="flex justify-center">
        <DemoBadge />
      </div>

      {/* Trophy */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-16 h-16 rounded-full bg-[#f59e0b]/15 border-2 border-[#f59e0b]/30 flex items-center justify-center">
          <Trophy className="w-8 h-8 text-[#f59e0b]" />
        </div>
        <div className="font-black text-xl text-white">Demo Session Complete</div>
        <div className="text-xs font-mono text-white/40">Here's how you did</div>
      </div>

      {/* Final balance */}
      <div className="bg-white/4 border border-white/10 rounded-2xl px-4 py-4 text-center">
        <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">Final Demo Balance</div>
        <div className="font-mono font-black text-3xl text-white tabular-nums">${fmt(finalBalance)}</div>
        <div className="text-[10px] font-mono text-white/30 mt-0.5">≈ {fmtTon(finalBalance)} TON</div>
        {completed.length > 0 && (
          <div className={`mt-2 font-mono font-black text-base tabular-nums ${isPos ? "text-[#00ff88]" : "text-red-400"}`}>
            {isPos ? "+" : ""}{fmt(profit)}&nbsp;
            <span className="text-xs font-normal">({isPos ? "+" : ""}{((profit / START_BALANCE) * 100).toFixed(1)}%)</span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      {completed.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Trades",    value: completed.length },
            { label: "Win Rate",  value: `${wr}%` },
            { label: "W / L",     value: `${wins} / ${losses}` },
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
              <span className="text-[9px] font-mono text-white/30 w-5 shrink-0">#{i + 1}</span>
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

      {/* Reality check */}
      <div className="bg-gradient-to-br from-[#00ff88]/8 to-transparent border border-[#00ff88]/20 rounded-2xl p-4 text-center">
        <Target className="w-5 h-5 text-[#00ff88] mx-auto mb-2" />
        <div className="text-sm font-bold text-white">You understand the basics</div>
        <div className="text-[11px] font-mono text-white/40 mt-1 leading-relaxed">
          Real trading uses TON or USDT. Outcomes depend entirely on live market price — no scripts.
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onContinue}
        className="w-full h-12 rounded-2xl bg-[#00ff88] text-[#060a14] font-black tracking-widest flex items-center justify-center gap-2 hover:bg-[#00ff88]/90 transition-colors"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
      >
        START TRADING
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
}

// ─── Top-level Onboarding Flow ────────────────────────────────────────────────

type Step = "language" | "trading" | "summary";

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [, navigate] = useLocation();
  const { i18n } = useTranslation();
  const [step, setStep] = useState<Step>("language");
  const [summaryData, setSummaryData] = useState<{
    completed: CompletedTrade[];
    balance: number;
  }>({ completed: [], balance: START_BALANCE });

  const handleLangSelect = (code: LangCode) => {
    saveLangLocally(code);
    i18n.changeLanguage(code);
    document.documentElement.dir = getLangDir(code);
    document.documentElement.lang = code;
    setStep("trading");
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
    <div
      className="min-h-screen bg-[#060a14] flex flex-col items-center justify-start px-5 py-6 overflow-y-auto"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo — hide on summary */}
        {step !== "summary" && (
          <div className="text-center mb-5">
            <div
              className="font-black text-xl tracking-widest text-[#00ff88]"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              STRIKERX
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === "language" && (
            <motion.div key="lang" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LanguagePicker onSelect={handleLangSelect} />
            </motion.div>
          )}

          {step === "trading" && (
            <TradingSession
              key="trading"
              onSkip={handleSkip}
              onDone={handleDone}
            />
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
    </div>
  );
}
