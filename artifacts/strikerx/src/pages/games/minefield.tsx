import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStartMinefield, usePickMinefield, useCashoutMinefield } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, TrendingUp, Shield } from "lucide-react";

type CellState = "hidden" | "safe" | "mine";

interface MineSession {
  id: number;
  gridSize: number;
  mineCount: number;
  revealedPositions: number[];
  minePositions: number[] | null;
  status: "active" | "won" | "lost";
  currentMultiplier: number;
  betStriker: number;
}

const PRESETS = [
  { label: "3 mines", mineCount: 3, gridSize: 5 },
  { label: "5 mines", mineCount: 5, gridSize: 5 },
  { label: "10 mines", mineCount: 10, gridSize: 5 },
  { label: "20 mines", mineCount: 20, gridSize: 5 },
];

export function Minefield() {
  const { toast } = useToast();
  const startMine = useStartMinefield();
  const pickMine = usePickMinefield();
  const cashoutMine = useCashoutMinefield();

  const [betAmount, setBetAmount] = useState("100");
  const [preset, setPreset] = useState(0);
  const [session, setSession] = useState<MineSession | null>(null);
  const [cellStates, setCellStates] = useState<CellState[]>([]);
  const [cashingOut, setCashingOut] = useState(false);

  const QUICK_BETS = [50, 100, 500, 1000];

  const handleStart = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    const { mineCount, gridSize } = PRESETS[preset];
    try {
      const res = await startMine.mutateAsync({ data: { betStriker: amount, gridSize, mineCount } });
      const sess: MineSession = {
        id: res.id,
        gridSize: res.gridSize,
        mineCount: res.mineCount,
        revealedPositions: res.revealedPositions ?? [],
        minePositions: res.minePositions ?? null,
        status: (res.status as MineSession["status"]) ?? "active",
        currentMultiplier: res.currentMultiplier ?? 1.0,
        betStriker: amount,
      };
      setSession(sess);
      setCellStates(Array(res.gridSize * res.gridSize).fill("hidden" as CellState));
    } catch (e: unknown) {
      toast({ title: "Failed to start", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handlePick = async (pos: number) => {
    if (!session || session.status !== "active" || cellStates[pos] !== "hidden") return;
    try {
      const res = await pickMine.mutateAsync({ id: session.id, data: { position: pos } });
      const newStates = [...cellStates];
      if (res.status === "lost" && res.minePositions) {
        res.minePositions.forEach((mp: number) => { newStates[mp] = "mine"; });
        newStates[pos] = "mine";
      } else {
        newStates[pos] = "safe";
      }
      setCellStates(newStates);
      setSession(prev => prev ? {
        ...prev,
        revealedPositions: res.revealedPositions ?? prev.revealedPositions,
        minePositions: res.minePositions ?? prev.minePositions,
        status: res.status as MineSession["status"],
        currentMultiplier: res.currentMultiplier ?? prev.currentMultiplier,
      } : prev);

      if (res.status === "lost") {
        toast({ title: "BOOM! Mine hit!", description: "Better luck next time", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleCashout = async () => {
    if (!session) return;
    setCashingOut(true);
    try {
      const res = await cashoutMine.mutateAsync({ id: session.id });
      toast({ title: `Cashed out! +${res.winAmount?.toFixed(0)} STRIKER`, description: `${res.multiplier?.toFixed(2)}x` });
      setSession(prev => prev ? { ...prev, status: "won" } : prev);
    } catch (e: unknown) {
      toast({ title: "Cashout failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
    setCashingOut(false);
  };

  const isActive = session?.status === "active";
  const safeCount = session ? session.revealedPositions.length : 0;
  const potentialWin = session ? (session.betStriker * session.currentMultiplier).toFixed(0) : "0";
  const totalCells = session ? session.gridSize * session.gridSize : 25;

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#0a0e1a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/5">
          <Bomb className="w-4 h-4 text-red-400" />
          <span className="font-display font-bold text-sm tracking-widest text-white">MINEFIELD</span>
          {session && isActive && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs font-mono text-white/40">{safeCount} safe</span>
              <span className="text-xs font-mono text-[#00ff88] font-bold">{session.currentMultiplier.toFixed(2)}x</span>
            </div>
          )}
        </div>

        {/* Game area */}
        {!session ? (
          // Setup screen
          <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
            <div className="text-center">
              <Bomb className="w-12 h-12 text-red-400/50 mx-auto mb-3" />
              <div className="font-display font-bold text-lg text-white/70">Click safe squares</div>
              <div className="text-xs font-mono text-white/30 mt-1">Cash out before hitting a mine</div>
            </div>

            {/* Mine presets */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => setPreset(i)}
                  className={`py-3 rounded-lg border font-mono text-xs font-bold transition-all ${preset === i ? "border-red-400/60 bg-red-400/10 text-red-400" : "border-white/10 text-white/40 hover:border-white/25"}`}>
                  <Bomb className="w-3 h-3 inline mr-1" />{p.label}
                </button>
              ))}
            </div>

            <div className="text-xs font-mono text-white/30 text-center">5×5 grid · {PRESETS[preset].mineCount} mines hidden</div>
          </div>
        ) : (
          // Active game
          <div className="flex-1 flex flex-col items-center justify-between px-4 py-4 min-h-0">
            {/* Multiplier display */}
            {isActive && (
              <div className="text-center mb-3">
                <div className="text-xs font-mono text-white/30 uppercase tracking-wider">Potential Win</div>
                <motion.div className="font-display font-black text-3xl text-[#00ff88]"
                  animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 0.6 }}>
                  {potentialWin} <span className="text-lg text-white/40">STRIKER</span>
                </motion.div>
                <div className="text-xs font-mono text-white/30">{session.currentMultiplier.toFixed(3)}x multiplier</div>
              </div>
            )}

            {(session.status === "won" || session.status === "lost") && (
              <div className={`text-center mb-3 px-6 py-2 rounded-xl border ${session.status === "won" ? "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]" : "border-red-400/30 bg-red-400/10 text-red-400"}`}>
                <div className="font-display font-black text-xl">{session.status === "won" ? "CASHED OUT!" : "BOOM!"}</div>
              </div>
            )}

            {/* Grid */}
            <div className="flex-1 flex items-center justify-center w-full min-h-0">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${session.gridSize}, minmax(0, 1fr))`, width: "100%", maxWidth: `${session.gridSize * 54}px` }}
              >
                {Array.from({ length: totalCells }).map((_, i) => {
                  const state = cellStates[i] ?? "hidden";
                  return (
                    <motion.button
                      key={i}
                      onClick={() => handlePick(i)}
                      disabled={!isActive || state !== "hidden"}
                      whileTap={state === "hidden" && isActive ? { scale: 0.88 } : {}}
                      className={`aspect-square rounded-lg border flex items-center justify-center text-lg font-bold transition-all cursor-pointer disabled:cursor-not-allowed
                        ${state === "hidden" && isActive ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/25 hover:shadow-[0_0_8px_rgba(0,255,136,0.15)]" : ""}
                        ${state === "safe" ? "bg-[#00ff88]/15 border-[#00ff88]/40" : ""}
                        ${state === "mine" ? "bg-red-400/15 border-red-400/40" : ""}
                        ${state === "hidden" && !isActive ? "bg-white/3 border-white/5 opacity-40" : ""}
                      `}
                    >
                      <AnimatePresence>
                        {state === "safe" && (
                          <motion.div key="safe" initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[#00ff88]">
                            <Shield className="w-4 h-4" />
                          </motion.div>
                        )}
                        {state === "mine" && (
                          <motion.div key="mine" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} className="text-red-400">
                            <Bomb className="w-4 h-4" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Mine counter */}
            <div className="flex items-center gap-4 mt-3 text-xs font-mono">
              <span className="text-white/30">{session.mineCount} mines · {totalCells - session.mineCount} safe</span>
              <span className="text-white/30">{safeCount} revealed</span>
            </div>
          </div>
        )}

        {/* Control panel */}
        <div className="border-t border-white/5 bg-[#0d1117] px-4 pt-3 pb-4 flex flex-col gap-3">
          {!session ? (
            <>
              <div className="flex gap-2">
                {QUICK_BETS.map(q => (
                  <button key={q} onClick={() => setBetAmount(String(q))}
                    className={`flex-1 text-xs font-mono py-1.5 rounded border ${betAmount === String(q) ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10" : "border-white/10 text-white/40 hover:border-white/25"}`}>{q}</button>
                ))}
              </div>
              <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-10 text-sm" placeholder="Bet (STRIKER)" />
              <Button onClick={handleStart} disabled={startMine.isPending}
                className="h-11 font-display font-bold tracking-widest bg-red-500 hover:bg-red-400 text-white disabled:opacity-30">
                {startMine.isPending ? "PLACING BET..." : "START GAME"}
              </Button>
            </>
          ) : isActive ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-mono text-white/30 uppercase">Bet</div>
                <div className="font-mono font-bold text-white">{session.betStriker.toFixed(0)} STRIKER</div>
              </div>
              <motion.div animate={safeCount > 0 ? { scale: [1, 1.02, 1] } : {}} transition={{ repeat: Infinity, duration: 1 }}>
                <Button onClick={handleCashout} disabled={safeCount === 0 || cashingOut}
                  className="w-full h-12 font-display font-bold tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30">
                  {cashingOut ? "CASHING..." : safeCount === 0 ? "PICK FIRST" : `CASHOUT ${session.currentMultiplier.toFixed(2)}x`}
                </Button>
              </motion.div>
            </div>
          ) : (
            <Button onClick={() => { setSession(null); setCellStates([]); }}
              className="h-11 font-display font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white">PLAY AGAIN</Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
