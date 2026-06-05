import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePlayPenalty } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Target } from "lucide-react";

type Direction = "left" | "center" | "right";
const QUICK_BETS = [50, 100, 500, 1000];
const ZONES: { dir: Direction; label: string }[] = [
  { dir: "left", label: "LEFT" },
  { dir: "center", label: "CENTER" },
  { dir: "right", label: "RIGHT" },
];

interface KickResult {
  win: boolean;
  direction: Direction;
  keeperDirection: Direction;
  multiplier: number;
  winAmount: number;
}

export function Penalty() {
  const { toast } = useToast();
  const playPenalty = usePlayPenalty();
  const [betAmount, setBetAmount] = useState("100");
  const [selected, setSelected] = useState<Direction | null>(null);
  const [result, setResult] = useState<KickResult | null>(null);
  const [kicking, setKicking] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]);

  const handleKick = async () => {
    if (!selected) { toast({ title: "Pick a zone first!", variant: "destructive" }); return; }
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    setKicking(true); setResult(null);
    try {
      const res = await playPenalty.mutateAsync({ data: { betStriker: amount, direction: selected } });
      const r: KickResult = {
        win: res.outcome === "win",
        direction: selected,
        keeperDirection: ((res as unknown as Record<string, unknown>).keeperDirection as Direction) ?? "center",
        multiplier: res.multiplier ?? 1.92,
        winAmount: res.winAmount ?? 0,
      };
      setResult(r);
      setHistory(h => [r.win, ...h].slice(0, 10));
      if (r.win) toast({ title: `GOAL! +${r.winAmount.toFixed(0)} STRIKER`, description: `${r.multiplier}x` });
      else toast({ title: "SAVED!", description: "The keeper got it", variant: "destructive" });
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message ?? "Request failed", variant: "destructive" });
    }
    setKicking(false);
  };

  const keeperX = result?.keeperDirection === "left" ? 67 : result?.keeperDirection === "right" ? 253 : 160;

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#0a0e1a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/5">
          <Target className="w-4 h-4 text-blue-400" />
          <span className="font-display font-bold text-sm tracking-widest text-white">PENALTY</span>
          <span className="ml-auto text-xs font-mono text-white/30">1.92x payout</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-5 min-h-0">
          {/* Goal + animation */}
          <div className="w-full max-w-[320px]">
            <svg viewBox="0 0 320 160" className="w-full">
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f2d0f" /><stop offset="100%" stopColor="#0a1a0a" />
                </linearGradient>
              </defs>
              <rect x="0" y="90" width="320" height="70" fill="url(#pg)" />
              <rect x="20" y="20" width="280" height="100" fill="none" stroke="#ffffff18" strokeWidth="2" />
              {[1,2,3,4,5,6,7].map(i => <line key={i} x1={20+i*280/8} y1="20" x2={20+i*280/8} y2="120" stroke="#ffffff07" strokeWidth="1" />)}
              {[1,2,3,4].map(i => <line key={i} x1="20" y1={20+i*25} x2="300" y2={20+i*25} stroke="#ffffff07" strokeWidth="1" />)}
              <line x1="113" y1="20" x2="113" y2="120" stroke="#ffffff15" strokeWidth="1" strokeDasharray="4 3" />
              <line x1="207" y1="20" x2="207" y2="120" stroke="#ffffff15" strokeWidth="1" strokeDasharray="4 3" />
              {ZONES.map(({ dir }, i) => {
                const xs = [20,113,207][i]; const ws = [93,94,93][i];
                const sel = selected === dir; const res = result?.direction === dir;
                return <rect key={dir} x={xs} y="20" width={ws} height="100"
                  fill={sel ? "#00ff8812" : res && result?.win ? "#22c55e12" : res ? "#ef444412" : "transparent"}
                  stroke={sel ? "#00ff88" : res && result?.win ? "#22c55e" : res ? "#ef4444" : "transparent"}
                  strokeWidth="1.5" style={{ transition: "all 0.2s" }} />;
              })}
              {/* Keeper */}
              <AnimatePresence>
                {result && (
                  <motion.g initial={{ x: 160 }} animate={{ x: keeperX }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                    <circle cx="0" cy="82" r="16" fill={result.win ? "#ef444466" : "#22c55e66"} />
                    <text x="0" y="88" textAnchor="middle" fontSize="18">🧤</text>
                  </motion.g>
                )}
              </AnimatePresence>
              {/* Ball */}
              <AnimatePresence>
                {kicking && (
                  <motion.circle r="8" fill="white"
                    initial={{ cx: 160, cy: 155 }}
                    animate={{ cx: selected === "left" ? 67 : selected === "right" ? 253 : 160, cy: 68 }}
                    transition={{ duration: 0.35, ease: "easeOut" }} />
                )}
                {result && !kicking && (
                  <motion.circle cx={result.direction === "left" ? 67 : result.direction === "right" ? 253 : 160}
                    cy="68" r="8" fill={result.win ? "#00ff88" : "white"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                )}
              </AnimatePresence>
            </svg>
          </div>

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`text-center px-8 py-3 rounded-xl border ${result.win ? "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]" : "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]"}`}>
                <div className="font-display font-black text-3xl">{result.win ? "GOAL!" : "SAVED!"}</div>
                {result.win && <div className="text-sm font-mono mt-0.5">+{result.winAmount.toFixed(0)} STRIKER @ {result.multiplier}x</div>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Zone picker */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[320px]">
            {ZONES.map(({ dir, label }) => (
              <button key={dir} onClick={() => { if (!kicking && !result) setSelected(dir); }} disabled={kicking || !!result}
                className={`py-3.5 rounded-lg border font-display font-bold text-xs tracking-widest transition-all ${selected === dir ? "border-[#00ff88] bg-[#00ff88]/15 text-[#00ff88]" : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"}`}>
                {label}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="flex gap-1.5">
              {history.map((w, i) => (
                <div key={i} className={`w-5 h-5 rounded text-[9px] font-mono flex items-center justify-center font-bold ${w ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ef4444]/20 text-[#ef4444]"}`}>{w ? "G" : "S"}</div>
              ))}
            </div>
          )}
        </div>

        {/* Bet panel */}
        <div className="border-t border-white/5 bg-[#0d1117] px-4 pt-3 pb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            {QUICK_BETS.map(q => (
              <button key={q} onClick={() => setBetAmount(String(q))}
                className={`flex-1 text-xs font-mono py-1.5 rounded border ${betAmount === String(q) ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10" : "border-white/10 text-white/40 hover:border-white/25"}`}>{q}</button>
            ))}
          </div>
          <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
            className="bg-white/5 border-white/10 text-white font-mono font-bold h-10 text-sm" placeholder="Bet (STRIKER)" />
          {result ? (
            <Button onClick={() => { setResult(null); setSelected(null); }}
              className="h-11 font-display font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white">KICK AGAIN</Button>
          ) : (
            <Button onClick={handleKick} disabled={!selected || kicking}
              className="h-11 font-display font-bold tracking-widest bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-25 disabled:bg-white/10">
              {kicking ? "SHOOTING..." : selected ? `SHOOT ${selected.toUpperCase()}` : "SELECT A ZONE"}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
