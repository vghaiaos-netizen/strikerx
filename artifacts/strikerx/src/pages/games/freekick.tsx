import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePlayFreekick } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

type Risk = "low" | "medium" | "high";

// 9 slots — multipliers per risk level
const SLOT_MULTS: Record<Risk, number[]> = {
  low:    [0.5,  1.0, 1.2, 1.5, 2.0, 1.5, 1.2, 1.0, 0.5],
  medium: [0.2,  0.5, 1.0, 2.0, 5.0, 2.0, 1.0, 0.5, 0.2],
  high:   [0.0,  0.2, 0.5, 1.5, 12.0,1.5, 0.5, 0.2, 0.0],
};

const SLOT_COLORS: Record<Risk, string[]> = {
  low:    ["#f59e0b","#22c55e","#22c55e","#00ff88","#00ff88","#00ff88","#22c55e","#22c55e","#f59e0b"],
  medium: ["#ef4444","#f59e0b","#22c55e","#00ff88","#f59e0b","#00ff88","#22c55e","#f59e0b","#ef4444"],
  high:   ["#374151","#ef4444","#f59e0b","#22c55e","#f59e0b","#22c55e","#f59e0b","#ef4444","#374151"],
};

const RISK_OPTS: { r: Risk; label: string; color: string }[] = [
  { r: "low",    label: "LOW",    color: "#22c55e" },
  { r: "medium", label: "MED",    color: "#f59e0b" },
  { r: "high",   label: "HIGH",   color: "#ef4444" },
];

const QUICK_BETS = [50, 100, 500, 1000];

// Board geometry — fixed coordinate system
// 9 slots of 30px each = 270px total board width
const BOARD_W = 270;
const SLOT_W = 30;          // BOARD_W / 9
const BOARD_PAD_X = 5;      // padding inside SVG
const SVG_W = BOARD_W + BOARD_PAD_X * 2;   // 280
const ROWS = 8;              // peg rows → 9 final slots (ROWS + 1)
const ROW_H = 28;            // vertical spacing between peg rows
const TOP_PAD = 18;          // y offset for first peg row
const SLOT_Y = TOP_PAD + ROWS * ROW_H + 10;  // y position of slot tops
const SLOT_H = 26;           // slot rectangle height
const SVG_H = SLOT_Y + SLOT_H + 8;

// Ball x-center for slot column c (0-indexed, 0 = far left)
function slotCenterX(c: number) {
  return BOARD_PAD_X + c * SLOT_W + SLOT_W / 2;
}

// Ball y for peg row r (0 = first row, ROWS = after last row = slot level)
function rowY(r: number) {
  return TOP_PAD + r * ROW_H;
}

// Peg positions for row r — triangular layout:
// Row r has (r + 1) pegs. Pegs sit at the BOUNDARIES between slot columns.
// Peg c at row r: x = BOARD_PAD_X + (c + 0.5 + (9 - r - 1) / 2) * SLOT_W
// Simplified: centre the r+1 pegs symmetrically within 9 slots
function pegPositions(r: number): { x: number; y: number }[] {
  const count = r + 2; // row r has r+2 pegs (gives r+1 gaps → ball in gap 0..r+1)
  // Pegs span from slot boundary (centerX - r*SLOT_W/2) to (centerX + r*SLOT_W/2)
  const centerX = BOARD_PAD_X + 4.5 * SLOT_W; // center of 9-slot board
  const span = r * SLOT_W;
  const startX = centerX - span / 2;
  const y = rowY(r);
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (span / Math.max(r, 1)),
    y,
  }));
}

// Generate ball path: column values (0–8) from center→targetSlot over ROWS steps
function generatePath(targetSlot: number): number[] {
  const path: number[] = [4]; // start at center column
  for (let r = 0; r < ROWS - 1; r++) {
    const cur = path[path.length - 1];
    const remaining = ROWS - 1 - r;
    const needed = targetSlot - cur;
    const p = Math.max(0.08, Math.min(0.92, 0.5 + needed / (remaining * 2.2)));
    const next = cur + (Math.random() < p ? 1 : -1);
    path.push(Math.max(0, Math.min(8, next)));
  }
  // Force final position to target
  path.push(Math.max(0, Math.min(8, targetSlot)));
  return path;
}

interface FreekickResult { slot: number; multiplier: number; winAmount: number; }

export function FreeKick() {
  const { toast } = useToast();
  const playFk = usePlayFreekick();

  const [betAmount, setBetAmount] = useState("100");
  const [risk, setRisk] = useState<Risk>("medium");
  const [result, setResult] = useState<FreekickResult | null>(null);
  const [ballPath, setBallPath] = useState<number[]>([]);
  const [animating, setAnimating] = useState(false);
  const [ballStep, setBallStep] = useState(-1); // current animation step (-1 = not started)

  const handleKick = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    setAnimating(true);
    setResult(null);
    setBallPath([]);
    setBallStep(-1);

    try {
      const res = await playFk.mutateAsync({ data: { betStriker: amount, riskLevel: risk } });
      const slot = ((res as unknown as Record<string, unknown>).slot as number) ?? 4;
      const path = generatePath(slot);
      setBallPath(path);
      setBallStep(0);

      // Step the ball through the path
      for (let i = 1; i <= path.length; i++) {
        await new Promise<void>(resolve => setTimeout(resolve, i < path.length ? 160 : 300));
        setBallStep(i);
      }

      const r: FreekickResult = {
        slot,
        multiplier: res.multiplier ?? 1,
        winAmount: res.winAmount ?? 0,
      };
      setResult(r);

      if (res.winAmount && res.winAmount > 0) {
        toast({ title: `+${res.winAmount.toFixed(0)} STRIKER`, description: `${res.multiplier}× at slot ${slot + 1}` });
      } else {
        toast({ title: `${res.multiplier}×`, description: "Better luck next time", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      setAnimating(false);
    }
  };

  const slotMults = SLOT_MULTS[risk];
  const slotColors = SLOT_COLORS[risk];

  // Current ball position
  const ballVisible = animating || (result !== null && ballPath.length > 0);
  const ballCol = ballPath[Math.min(ballStep, ballPath.length - 1)] ?? 4;
  const ballCX = slotCenterX(ballCol);
  const ballCY = ballStep < ROWS ? rowY(Math.max(0, ballStep)) : SLOT_Y + SLOT_H / 2;

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 border-b border-white/5">
          <Zap className="w-4 h-4 text-[#f59e0b]" />
          <span className="font-display font-bold text-xs tracking-[0.2em] text-white">FREE KICK</span>
          <span className="ml-auto text-[10px] font-mono text-white/25">Plinko · 9 slots</span>
        </div>

        <div className="flex-1 flex flex-col items-center min-h-0 px-4 py-3 gap-3 overflow-hidden">

          {/* Risk selector */}
          <div className="flex gap-2 w-full max-w-xs">
            {RISK_OPTS.map(({ r, label, color }) => (
              <button key={r}
                onClick={() => { if (!animating) { setRisk(r); setResult(null); setBallPath([]); } }}
                className="flex-1 py-2 rounded-xl border-2 font-display font-bold text-xs tracking-widest transition-all"
                style={risk === r
                  ? { color, borderColor: color, background: `${color}18` }
                  : { color: "rgba(255,255,255,0.3)", borderColor: "rgba(255,255,255,0.1)" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Plinko board */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              style={{ maxHeight: "340px" }}
            >
              <defs>
                <filter id="fk-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="fk-slotglow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Pegs — triangular layout */}
              {Array.from({ length: ROWS }).map((_, row) => (
                pegPositions(row).map((peg, col) => (
                  <circle
                    key={`peg-${row}-${col}`}
                    cx={peg.x}
                    cy={peg.y}
                    r="3.5"
                    fill="rgba(255,255,255,0.18)"
                  />
                ))
              ))}

              {/* Slot rectangles */}
              {slotMults.map((m, i) => {
                const x = BOARD_PAD_X + i * SLOT_W + 1;
                const w = SLOT_W - 2;
                const isWin = result?.slot === i;
                const c = slotColors[i];
                return (
                  <g key={i}>
                    <motion.rect
                      x={x} y={SLOT_Y} width={w} height={SLOT_H} rx="3"
                      fill={isWin ? c : `${c}22`}
                      stroke={isWin ? c : `${c}45`}
                      strokeWidth={isWin ? 1.5 : 1}
                      animate={isWin ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35 }}
                      filter={isWin ? "url(#fk-slotglow)" : undefined}
                      style={{ transformOrigin: `${x + w / 2}px ${SLOT_Y + SLOT_H / 2}px` }}
                    />
                    <text
                      x={x + w / 2}
                      y={SLOT_Y + SLOT_H * 0.63}
                      textAnchor="middle"
                      fontSize={m >= 10 ? "8.5" : "8"}
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={isWin ? (m === 0 ? "#555" : "#000") : c}
                    >
                      {m === 0 ? "0×" : `${m}×`}
                    </text>
                  </g>
                );
              })}

              {/* Ball */}
              {ballVisible && (
                <motion.circle
                  key={`ball-${ballStep}`}
                  cx={ballCX}
                  cy={ballCY}
                  r="7.5"
                  fill="#f59e0b"
                  filter="url(#fk-glow)"
                  initial={{ cx: ballCX, cy: ballCY, scale: 1 }}
                  animate={{ scale: [1, 0.85, 1] }}
                  transition={{ duration: 0.15 }}
                />
              )}
              {ballVisible && (
                <motion.circle
                  key={`ball-mark-${ballStep}`}
                  cx={ballCX}
                  cy={ballCY}
                  r="3.5"
                  fill="rgba(0,0,0,0.4)"
                  initial={{ cx: ballCX, cy: ballCY }}
                />
              )}
            </svg>
          </div>

          {/* Result card */}
          <AnimatePresence>
            {result && !animating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className={`w-full max-w-xs text-center px-6 py-3 rounded-2xl border ${
                  result.multiplier >= 1
                    ? "border-[#00ff88]/35 bg-[#00ff88]/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className={`font-display font-black text-3xl leading-none ${
                  result.multiplier >= 1 ? "text-[#00ff88]" : "text-white/40"
                }`}>
                  {result.multiplier}×
                </div>
                {result.winAmount > 0 && (
                  <div className="text-sm font-mono text-[#00ff88]/70 mt-1">
                    +{result.winAmount.toFixed(0)} STRIKER
                  </div>
                )}
                {result.multiplier === 0 && (
                  <div className="text-[11px] font-mono text-white/25 mt-1">No payout</div>
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
            className="h-11 font-display font-bold tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#060a14] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30">
            <Zap className="w-4 h-4 mr-1.5" />
            {animating ? "FLYING..." : "KICK!"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
