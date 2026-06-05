import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePlayFreekick } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

type Risk = "low" | "medium" | "high";

// Slot multipliers per risk level (9 slots)
const SLOT_MULTS: Record<Risk, number[]> = {
  low:    [0.5,  1.0, 1.2, 1.5, 2.0, 1.5, 1.2, 1.0, 0.5],
  medium: [0.2,  0.5, 1.0, 2.0, 5.0, 2.0, 1.0, 0.5, 0.2],
  high:   [0.0,  0.2, 0.5, 1.5, 12.0,1.5, 0.5, 0.2, 0.0],
};

const SLOT_COLORS: Record<Risk, string[]> = {
  low:    ["#f59e0b","#22c55e","#22c55e","#22c55e","#00ff88","#22c55e","#22c55e","#22c55e","#f59e0b"],
  medium: ["#ef4444","#f59e0b","#22c55e","#00ff88","#f59e0b","#00ff88","#22c55e","#f59e0b","#ef4444"],
  high:   ["#1f2937","#ef4444","#f59e0b","#22c55e","#f59e0b","#22c55e","#f59e0b","#ef4444","#1f2937"],
};

const RISK_OPTS: { r: Risk; label: string; color: string }[] = [
  { r: "low",    label: "LOW",    color: "#22c55e" },
  { r: "medium", label: "MED",    color: "#f59e0b" },
  { r: "high",   label: "HIGH",   color: "#ef4444" },
];

const QUICK_BETS = [50, 100, 500, 1000];
const ROWS = 8;

interface FreekickResult { slot: number; multiplier: number; winAmount: number; }

export function FreeKick() {
  const { toast } = useToast();
  const playFk = usePlayFreekick();

  const [betAmount, setBetAmount] = useState("100");
  const [risk, setRisk] = useState<Risk>("medium");
  const [result, setResult] = useState<FreekickResult | null>(null);
  const [ballPath, setBallPath] = useState<number[]>([]);
  const [animating, setAnimating] = useState(false);

  const generatePath = (targetSlot: number, rows: number): number[] => {
    // Build a peg path from top to target slot
    const path: number[] = [4]; // start center (0-8)
    for (let r = 0; r < rows - 1; r++) {
      const cur = path[path.length - 1];
      // Bias toward target
      const remaining = rows - 1 - r;
      const needed = targetSlot - cur;
      const p = Math.max(0.1, Math.min(0.9, 0.5 + needed / (remaining * 2)));
      path.push(cur + (Math.random() < p ? 1 : -1));
    }
    // Force final to target slot
    path.push(Math.max(0, Math.min(8, targetSlot)));
    return path;
  };

  const handleKick = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    setAnimating(true);
    setResult(null);
    setBallPath([]);

    try {
      const res = await playFk.mutateAsync({ data: { betStriker: amount, riskLevel: risk } });
      const slot = ((res as unknown as Record<string, unknown>).slot as number) ?? 4;
      const path = generatePath(slot, ROWS);
      setBallPath(path);

      setTimeout(() => {
        const r: FreekickResult = { slot, multiplier: res.multiplier ?? 1, winAmount: res.winAmount ?? 0 };
        setResult(r);
        setAnimating(false);
        if (res.outcome === "win") toast({ title: `+${res.winAmount?.toFixed(0)} STRIKER`, description: `${res.multiplier}x at slot ${slot + 1}` });
        else toast({ title: "No win this time", description: `${res.multiplier}x multiplier`, variant: "destructive" });
      }, ROWS * 200 + 400);
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
      setAnimating(false);
    }
  };

  const slotMults = SLOT_MULTS[risk];
  const slotColors = SLOT_COLORS[risk];

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#0a0e1a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/5">
          <Zap className="w-4 h-4 text-[#f59e0b]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">FREE KICK</span>
          <span className="ml-auto text-xs font-mono text-white/30">Plinko-style</span>
        </div>

        <div className="flex-1 flex flex-col items-center min-h-0 px-4 py-3 gap-3 overflow-hidden">
          {/* Risk selector */}
          <div className="flex gap-2 w-full">
            {RISK_OPTS.map(({ r, label, color }) => (
              <button key={r} onClick={() => { if (!animating) setRisk(r); }}
                className={`flex-1 py-2 rounded-lg border font-display font-bold text-xs tracking-widest transition-all ${risk === r ? "border-current" : "border-white/10 text-white/40 hover:border-white/25"}`}
                style={{ color: risk === r ? color : undefined, borderColor: risk === r ? color : undefined, background: risk === r ? `${color}15` : undefined }}>
                {label}
              </button>
            ))}
          </div>

          {/* Plinko board */}
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 max-h-[360px]">
            <svg viewBox="0 0 280 300" className="w-full h-full" style={{ maxHeight: "320px" }}>
              {/* Pegs */}
              {Array.from({ length: ROWS }).map((_, row) => {
                const pegsInRow = row + 2;
                const startX = 140 - (pegsInRow - 1) * 14;
                return Array.from({ length: pegsInRow }).map((_, col) => {
                  const x = startX + col * 28;
                  const y = 20 + row * 32;
                  return <circle key={`${row}-${col}`} cx={x} cy={y} r="3" fill="#ffffff20" />;
                });
              })}

              {/* Ball animation */}
              <AnimatePresence>
                {(animating || result) && ballPath.length > 0 && (
                  <motion.circle r="7" fill="#f59e0b"
                    initial={{ cx: 140, cy: 0 }}
                    animate={{
                      cx: ballPath.map((slot, i) => {
                        const pegsInRow = i + 2;
                        const startX = 140 - (pegsInRow - 1) * 14;
                        return startX + slot * 28;
                      }),
                      cy: ballPath.map((_, i) => 20 + i * 32),
                    }}
                    transition={{ duration: ROWS * 0.18, ease: "linear" }}
                    filter="url(#glow)"
                  />
                )}
              </AnimatePresence>

              {/* Glow filter */}
              <defs>
                <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>

              {/* Slot multipliers */}
              {slotMults.map((mult, i) => {
                const totalW = 280;
                const slotW = totalW / 9;
                const x = i * slotW + slotW / 2;
                const isWinner = result?.slot === i;
                return (
                  <g key={i}>
                    <rect x={i * slotW + 2} y="270" width={slotW - 4} height="28" rx="3"
                      fill={isWinner ? slotColors[i] : `${slotColors[i]}20`}
                      stroke={isWinner ? slotColors[i] : `${slotColors[i]}40`} strokeWidth="1" />
                    <text x={x} y="289" textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="bold"
                      fill={isWinner ? "#000" : slotColors[i]}>
                      {mult}x
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Result */}
          <AnimatePresence>
            {result && !animating && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className={`text-center px-6 py-2 rounded-xl border ${result.multiplier >= 1 ? "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]" : "border-white/10 bg-white/5 text-white/40"}`}>
                <div className="font-display font-black text-2xl">{result.multiplier}x</div>
                {result.winAmount > 0 && <div className="text-sm font-mono">+{result.winAmount.toFixed(0)} STRIKER</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bet panel */}
        <div className="border-t border-white/5 bg-[#0d1117] px-4 pt-3 pb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            {QUICK_BETS.map(q => (
              <button key={q} onClick={() => setBetAmount(String(q))}
                className={`flex-1 text-xs font-mono py-1.5 rounded border ${betAmount === String(q) ? "border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10" : "border-white/10 text-white/40 hover:border-white/25"}`}>{q}</button>
            ))}
          </div>
          <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
            className="bg-white/5 border-white/10 text-white font-mono font-bold h-10 text-sm" placeholder="Bet (STRIKER)" />
          <Button onClick={handleKick} disabled={animating}
            className="h-11 font-display font-bold tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30">
            <Zap className="w-4 h-4 mr-1.5" />
            {animating ? "FLYING..." : "KICK!"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
