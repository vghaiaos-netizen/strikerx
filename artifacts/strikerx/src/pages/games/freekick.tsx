import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePlayFreekick, getGetMeQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

type Risk = "low" | "medium" | "high";

// ── Corrected multipliers — match actual server payouts (FREEKICK_SLOTS × 0.96)
// Server values from gameEngine.ts:
//   low:    [0.49, 0.79, 0.98, 1.18, 1.47, 1.18, 0.98, 0.79, 0.49]
//   medium: [0.11, 0.26, 0.53, 1.05, 2.64, 1.05, 0.53, 0.26, 0.11]
//   high:   [0.03, 0.10, 0.17, 0.66, 3.32, 0.66, 0.17, 0.10, 0.03]
// Payout = value × (1 - 0.04):
const SLOT_MULTS: Record<Risk, number[]> = {
  low:    [0.47, 0.76, 0.94, 1.13, 1.41, 1.13, 0.94, 0.76, 0.47],
  medium: [0.11, 0.25, 0.51, 1.01, 2.53, 1.01, 0.51, 0.25, 0.11],
  high:   [0.03, 0.10, 0.16, 0.63, 3.19, 0.63, 0.16, 0.10, 0.03],
};

function slotColor(m: number): string {
  if (m >= 2.0) return "#f59e0b";
  if (m >= 1.0) return "#22c55e";
  if (m >= 0.5) return "#f59e0b";
  if (m >= 0.1) return "#ef4444";
  return "#374151";
}

const RISK_OPTS: { r: Risk; label: string; color: string }[] = [
  { r: "low",    label: "LOW",  color: "#22c55e" },
  { r: "medium", label: "MED",  color: "#f59e0b" },
  { r: "high",   label: "HIGH", color: "#ef4444" },
];
const QUICK_BETS = [50, 100, 500, 1000];

// ── Board geometry ────────────────────────────────────────────────────────────
const BOARD_PAD_X = 5;       // left padding in SVG
const SLOT_W     = 30;       // each of 9 slots is 30px wide
const BOARD_W    = SLOT_W * 9;     // 270px
const SVG_W      = BOARD_W + BOARD_PAD_X * 2;   // 280
const ROWS       = 8;        // peg rows → 9 final slots
const ROW_H      = 28;       // vertical spacing
const TOP_PAD    = 18;       // y offset for first peg row
const SLOT_Y     = TOP_PAD + ROWS * ROW_H + 10;
const SLOT_H     = 30;
const SVG_H      = SLOT_Y + SLOT_H + 10;

// Ball x-center for slot column c (0-indexed)
function slotCX(c: number) {
  return BOARD_PAD_X + c * SLOT_W + SLOT_W / 2;
}
// Ball y at row r
function rowY(r: number) {
  return TOP_PAD + r * ROW_H;
}

// Peg positions at row r — FIXED: span = (count-1) * SLOT_W
function pegPositions(r: number): { x: number; y: number }[] {
  const count = r + 2;                               // r+2 pegs per row
  const centerX = BOARD_PAD_X + 4.5 * SLOT_W;       // 140
  const span = (count - 1) * SLOT_W;                 // correct: SLOT_W intervals between pegs
  const startX = centerX - span / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * SLOT_W,
    y: rowY(r),
  }));
}

function generatePath(targetSlot: number): number[] {
  const path: number[] = [4]; // start at center column 4
  for (let r = 0; r < ROWS - 1; r++) {
    const cur = path[path.length - 1];
    const remaining = ROWS - 1 - r;
    const needed = targetSlot - cur;
    const p = Math.max(0.08, Math.min(0.92, 0.5 + needed / (remaining * 2.2)));
    const next = cur + (Math.random() < p ? 1 : -1);
    path.push(Math.max(0, Math.min(8, next)));
  }
  path.push(Math.max(0, Math.min(8, targetSlot)));
  return path;
}

interface FKResult { slot: number; multiplier: number; winAmount: number; }

export function FreeKick() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const playFk = usePlayFreekick();

  const [betAmount, setBetAmount] = useState("100");
  const [risk, setRisk] = useState<Risk>("medium");
  const [result, setResult] = useState<FKResult | null>(null);
  const [ballPath, setBallPath] = useState<number[]>([]);
  const [animating, setAnimating] = useState(false);
  const [ballStep, setBallStep] = useState(-1);
  const [litRow, setLitRow] = useState(-1);

  // Cleanup on unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const handleKick = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    setAnimating(true);
    setResult(null);
    setBallPath([]);
    setBallStep(-1);
    setLitRow(-1);

    try {
      const res = await playFk.mutateAsync({ data: { betStriker: amount, riskLevel: risk } });
      const slot = ((res as unknown as Record<string, unknown>).slot as number) ?? 4;
      const path = generatePath(slot);
      setBallPath(path);
      setBallStep(0);

      for (let i = 1; i <= path.length; i++) {
        if (!aliveRef.current) break;
        await new Promise<void>(resolve => setTimeout(resolve, i < path.length ? 155 : 280));
        if (!aliveRef.current) break;
        setBallStep(i);
        // Light up just-passed peg row
        if (i - 1 < ROWS) {
          setLitRow(i - 1);
          setTimeout(() => { if (aliveRef.current) setLitRow(-1); }, 150);
        }
      }

      if (!aliveRef.current) return;
      const fkResult: FKResult = {
        slot,
        multiplier: res.multiplier ?? 1,
        winAmount: res.winAmount ?? 0,
      };
      setResult(fkResult);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (res.winAmount && res.winAmount > 0) {
        toast({ title: `+${res.winAmount.toFixed(0)} STRIKER`, description: `${res.multiplier}× · slot ${slot + 1}` });
      } else {
        toast({ title: `${res.multiplier}×`, description: "Better luck next kick", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      if (aliveRef.current) setAnimating(false);
    }
  };

  const mults = SLOT_MULTS[risk];
  const ballVisible = animating || (result !== null && ballPath.length > 0);
  const ballCol = ballPath[Math.min(ballStep, ballPath.length - 1)] ?? 4;
  const ballCX = slotCX(ballCol);
  const ballCY = ballStep < ROWS ? rowY(Math.max(0, ballStep)) : SLOT_Y + SLOT_H / 2;

  // Trail: 2 previous positions
  const trail1 = ballStep >= 1 ? ballPath[ballStep - 1] ?? ballCol : null;
  const trail2 = ballStep >= 2 ? ballPath[ballStep - 2] ?? ballCol : null;

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 border-b border-white/5">
          <Zap className="w-4 h-4 text-[#f59e0b]" />
          <span className="font-display font-bold text-xs tracking-[0.2em] text-white">FREE KICK</span>
          <span className="ml-auto text-[10px] font-mono text-white/22">Plinko · 9 slots</span>
        </div>

        <div className="flex-1 flex flex-col items-center min-h-0 px-4 py-3 gap-3 overflow-y-auto relative">
          {/* Football field pattern background */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]" 
               style={{ 
                 backgroundImage: `repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 40px)`,
                 maskImage: 'radial-gradient(circle, black, transparent 80%)'
               }} 
          />

          {/* Risk selector */}
          <div className="flex gap-2 w-full max-w-xs z-10">
            {RISK_OPTS.map(({ r, label, color }) => (
              <button key={r}
                onClick={() => { if (!animating) { setRisk(r); setResult(null); setBallPath([]); setBallStep(-1); } }}
                className="flex-1 py-2.5 rounded-xl border-2 font-display font-bold text-xs tracking-widest transition-all relative"
                style={risk === r
                  ? { color, borderColor: color, background: `${color}18` }
                  : { color: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.1)" }}>
                {label}
                {risk === r && (
                  <motion.div 
                    layoutId="risk-underline"
                    className="absolute -bottom-1 left-1/4 right-1/4 h-[2px]"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Plinko SVG */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0 z-10">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              style={{ maxHeight: "min(300px, 42vh)" }}
            >
              <defs>
                <filter id="fk-ball-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="fk-slot-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <radialGradient id="slot-row-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Slot row background */}
              <rect x={BOARD_PAD_X} y={SLOT_Y - 5} width={BOARD_W} height={SLOT_H + 10} fill="url(#slot-row-grad)" rx="10" />

              {/* Pegs */}
              {Array.from({ length: ROWS }).map((_, row) =>
                pegPositions(row).map((peg, col) => {
                  const isLit = litRow === row;
                  return (
                    <g key={`${row}-${col}`}>
                      {isLit && (
                        <circle cx={peg.x} cy={peg.y} r="10" fill="white" opacity="0.15" />
                      )}
                      <circle
                        cx={peg.x} cy={peg.y} r={isLit ? 5 : 3.5}
                        fill={isLit ? "#ffffff" : "rgba(255,255,255,0.28)"}
                        style={{ transition: "all 0.12s" }}
                      />
                      {!isLit && (
                        <circle cx={peg.x - 1} cy={peg.y - 1.5} r="1" fill="white" opacity="0.4" />
                      )}
                    </g>
                  );
                })
              )}

              {/* Slot rectangles */}
              {mults.map((m, i) => {
                const x = BOARD_PAD_X + i * SLOT_W + 1;
                const w = SLOT_W - 2;
                const c = slotColor(m);
                const isWin = result?.slot === i && !animating;
                return (
                  <g key={i}>
                    <motion.rect
                      x={x} y={SLOT_Y} width={w} height={SLOT_H} rx="6"
                      fill={isWin ? c : `${c}1e`}
                      stroke={isWin ? c : `${c}40`}
                      strokeWidth={isWin ? 2 : 0.8}
                      animate={isWin ? { 
                        scale: [1, 1.15, 1],
                        fill: [c, "#ffffff", c],
                        filter: ["blur(0px)", "blur(2px)", "blur(0px)"]
                      } : { scale: 1 }}
                      transition={isWin ? { 
                        duration: 0.6, 
                        repeat: Infinity,
                        repeatType: "reverse"
                      } : { duration: 0.42 }}
                      filter={isWin ? "url(#fk-slot-glow)" : undefined}
                      style={{ transformOrigin: `${x + w / 2}px ${SLOT_Y + SLOT_H / 2}px` }}
                    />
                    <text
                      x={x + w / 2} y={SLOT_Y + SLOT_H * 0.65}
                      textAnchor="middle" fontSize={m >= 2.5 ? "9" : "8"}
                      fontFamily="monospace" fontWeight="bold"
                      fill={isWin ? (m < 0.1 ? "#888" : "#000") : c}
                      opacity={isWin ? 1 : 0.85}
                    >
                      {m.toFixed(m >= 1 ? 1 : 2)}×
                    </text>

                    {/* Landing burst ring */}
                    {isWin && (
                      <motion.circle
                        cx={x + w / 2} cy={SLOT_Y + SLOT_H / 2}
                        r={10}
                        fill="none" stroke={c} strokeWidth="3"
                        initial={{ scale: 0.5, opacity: 0.9 }}
                        animate={{ scale: 4, opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        style={{ transformOrigin: `${x + w / 2}px ${SLOT_Y + SLOT_H / 2}px` }}
                      />
                    )}
                  </g>
                );
              })}

              {/* Ball trail */}
              {ballVisible && animating && trail2 !== null && (
                <circle
                  cx={slotCX(trail2)}
                  cy={ballStep >= 2 ? rowY(Math.max(0, ballStep - 2)) : SLOT_Y + SLOT_H / 2}
                  r="4" fill="white" opacity="0.08"
                />
              )}
              {ballVisible && animating && trail1 !== null && (
                <circle
                  cx={slotCX(trail1)}
                  cy={ballStep >= 1 ? rowY(Math.max(0, ballStep - 1)) : SLOT_Y + SLOT_H / 2}
                  r="5.5" fill="white" opacity="0.15"
                />
              )}

              {/* Ball */}
              {ballVisible && (
                <motion.g
                  key={`ball-${ballStep}`}
                  initial={{ cx: ballCX, cy: ballCY }}
                  animate={{ scale: [1, 0.85, 1] }}
                  transition={{ duration: 0.14 }}
                >
                  <circle cx={ballCX} cy={ballCY} r="7.5"
                    fill="#f5f5f5" filter="url(#fk-ball-glow)" />
                  {/* Football patches */}
                  <circle cx={ballCX - 3} cy={ballCY - 3} r="2" fill="#111" opacity="0.7" />
                  <circle cx={ballCX + 3} cy={ballCY} r="2" fill="#111" opacity="0.7" />
                  <circle cx={ballCX} cy={ballCY + 3} r="2" fill="#111" opacity="0.7" />
                  {/* Highlight */}
                  <circle cx={ballCX - 2} cy={ballCY - 2.5} r="2" fill="white" opacity="0.4" />
                </motion.g>
              )}
            </svg>
          </div>

          {/* Result card */}
          <AnimatePresence>
            {result && !animating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.86, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 24 }}
                className={`w-full max-w-xs text-center px-6 py-3.5 rounded-2xl border ${
                  result.multiplier >= 1
                    ? "border-[#00ff88]/35 bg-[#00ff88]/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className={`font-display font-black leading-none ${
                  result.multiplier >= 1 ? "text-[#00ff88]" : "text-white/35"
                }`} style={{ fontSize: 36 }}>
                  {result.multiplier}×
                </div>
                {result.winAmount > 0 ? (
                  <div className="text-sm font-mono font-bold text-[#00ff88]/65 mt-1.5">
                    +{result.winAmount.toFixed(0)} STRIKER
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-white/22 mt-1">No payout</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bet panel */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-3 pb-4 flex flex-col gap-2.5">
          <div className="flex gap-1.5">
            {QUICK_BETS.map(q => (
              <button key={q} onClick={() => setBetAmount(String(q))}
                className={`flex-1 text-[11px] font-mono py-1.5 rounded-lg border transition-all ${
                  betAmount === String(q)
                    ? "border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10"
                    : "border-white/8 text-white/30 hover:border-white/20"
                }`}>
                {q >= 1000 ? `${q / 1000}k` : q}
              </button>
            ))}
          </div>
          <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
            className="bg-white/5 border-white/10 text-white font-mono font-bold h-9 text-sm"
            disabled={animating} />
          <Button onClick={handleKick} disabled={animating}
            className="h-11 font-display font-bold tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#060a14] disabled:opacity-30 disabled:bg-white/8 disabled:text-white/25">
            <Zap className="w-4 h-4 mr-1.5" />
            {animating ? "FLYING…" : "KICK!"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
