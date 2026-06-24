import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, CheckCircle, ArrowRight, Zap } from "lucide-react";
import LanguagePicker from "./language-picker";
import { saveLangLocally, getLangDir, type LangCode } from "@/i18n";
import { useTranslation } from "react-i18next";

type Step = "language" | "demo" | "result";
type Direction = "UP" | "DOWN";

const FAKE_PRICE = 67_420.15;
const STAKE = 100;
const WIN_AMOUNT = 82;

function PriceDisplay() {
  const [price, setPrice] = useState(FAKE_PRICE);
  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => +(p + (Math.random() - 0.48) * 12).toFixed(2));
    }, 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center">
      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-1">BTC / USD</div>
      <div className="font-mono font-black text-3xl text-white tabular-nums">
        ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function DemoStep({ onResult }: { onResult: (dir: Direction) => void }) {
  const [picked, setPicked] = useState<Direction | null>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const handlePick = (dir: Direction) => {
    if (picked) return;
    setPicked(dir);
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / 2500) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onResult(dir);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <motion.div
      key="demo"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="flex flex-col gap-5"
    >
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/25 mb-3">
          <Zap className="w-3 h-3 text-[#00ff88]" />
          <span className="text-[11px] font-mono font-bold text-[#00ff88] tracking-wider">DEMO TRADE</span>
        </div>
        <h2 className="text-white font-black text-xl tracking-tight leading-tight">
          Predict the market.<br />
          <span className="text-[#00ff88]">Win up to 82%.</span>
        </h2>
        <p className="text-white/40 text-xs font-mono mt-2">
          You have <span className="text-white font-bold">{STAKE} STRIKER</span> to practice with.
          Will BTC go UP or DOWN?
        </p>
      </div>

      {/* Price card */}
      <div className="bg-white/4 border border-white/10 rounded-2xl p-4">
        <PriceDisplay />
        <div className="flex justify-between mt-3 text-[10px] font-mono text-white/25">
          <span>1 MIN CONTRACT</span>
          <span>STAKE: {STAKE} SKR</span>
        </div>
      </div>

      {/* Pick buttons */}
      {!picked ? (
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => handlePick("UP")}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl border border-[#00ff88]/30 bg-[#00ff88]/8 hover:bg-[#00ff88]/15 transition-all"
          >
            <TrendingUp className="w-6 h-6 text-[#00ff88]" />
            <span className="font-display font-black text-sm text-[#00ff88] tracking-wider">UP</span>
            <span className="text-[10px] font-mono text-white/30">Price rises</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => handlePick("DOWN")}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl border border-red-400/30 bg-red-400/8 hover:bg-red-400/15 transition-all"
          >
            <TrendingDown className="w-6 h-6 text-red-400" />
            <span className="font-display font-black text-sm text-red-400 tracking-wider">DOWN</span>
            <span className="text-[10px] font-mono text-white/30">Price falls</span>
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-white/50">
            <div
              className={`flex items-center gap-1 font-bold ${picked === "UP" ? "text-[#00ff88]" : "text-red-400"}`}
            >
              {picked === "UP" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {picked} selected
            </div>
            <span>· Settling contract…</span>
          </div>
          <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="h-full bg-[#00ff88] rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] font-mono text-white/25">
            {Math.round((progress / 100) * 2.5).toFixed(1)}s remaining…
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ResultStep({ direction, onContinue }: { direction: Direction; onContinue: () => void }) {
  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-5 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-[#00ff88]/15 border-2 border-[#00ff88]/40 flex items-center justify-center"
      >
        <CheckCircle className="w-10 h-10 text-[#00ff88]" />
      </motion.div>

      <div>
        <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-1">Contract Settled</div>
        <div className="font-black text-4xl text-[#00ff88] tabular-nums">+{WIN_AMOUNT} SKR</div>
        <div className="text-white/40 text-xs font-mono mt-1">
          BTC went <span className={direction === "UP" ? "text-[#00ff88]" : "text-red-400"}>{direction}</span>
          {" "}— your prediction was correct.
        </div>
      </div>

      <div className="bg-white/4 border border-white/10 rounded-2xl p-4 w-full text-left">
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
          <div>
            <div className="text-white/30 text-[9px] mb-0.5">STAKED</div>
            <div className="text-white font-bold">{STAKE}</div>
          </div>
          <div>
            <div className="text-white/30 text-[9px] mb-0.5">PAYOUT</div>
            <div className="text-[#00ff88] font-bold">82%</div>
          </div>
          <div>
            <div className="text-white/30 text-[9px] mb-0.5">PROFIT</div>
            <div className="text-[#00ff88] font-bold">+{WIN_AMOUNT}</div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-white font-bold text-base">Ready to earn for real?</p>
        <p className="text-white/40 text-xs font-mono mt-1">
          Deposit STRIKER tokens and start trading with real payouts.
        </p>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onContinue}
        className="w-full h-12 rounded-2xl bg-[#00ff88] text-[#060a14] font-black tracking-widest flex items-center justify-center gap-2 hover:bg-[#00ff88]/90 transition-colors"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
      >
        MAKE A DEPOSIT
        <ArrowRight className="w-4 h-4" />
      </motion.button>

      <button
        onClick={onContinue}
        className="text-white/25 text-xs font-mono hover:text-white/50 transition-colors"
      >
        Skip for now
      </button>
    </motion.div>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [, navigate] = useLocation();
  const { i18n } = useTranslation();
  const [step, setStep] = useState<Step>("language");
  const [demoDirection, setDemoDirection] = useState<Direction | null>(null);

  const handleLangSelect = (code: LangCode) => {
    saveLangLocally(code);
    i18n.changeLanguage(code);
    document.documentElement.dir = getLangDir(code);
    document.documentElement.lang = code;
    setStep("demo");
  };

  const handleDemoResult = (dir: Direction) => {
    setDemoDirection(dir);
    setStep("result");
  };

  const handleComplete = () => {
    try { localStorage.setItem("strikerx_onboarded", "1"); } catch { /* ignore */ }
    onComplete();
    navigate("/deposit");
  };

  return (
    <div className="min-h-screen bg-[#060a14] flex flex-col items-center justify-center px-6 py-8"
      style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        {/* Logo — shown on all steps */}
        <AnimatePresence mode="wait">
          {step !== "result" && (
            <motion.div
              key="logo"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center mb-6"
            >
              <div className="font-black text-2xl tracking-widest text-[#00ff88]"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                STRIKERX
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === "language" && (
            <motion.div key="lang" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LanguagePicker onSelect={handleLangSelect} />
            </motion.div>
          )}

          {step === "demo" && (
            <DemoStep key="demo" onResult={handleDemoResult} />
          )}

          {step === "result" && demoDirection && (
            <ResultStep key="result" direction={demoDirection} onContinue={handleComplete} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
