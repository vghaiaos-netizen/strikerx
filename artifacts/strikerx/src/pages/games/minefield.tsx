import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStartMinefield, usePickMinefield, useCashoutMinefield } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, CheckCircle2, TrendingUp } from "lucide-react";

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
  { label: "3 mines", mineCount: 3, gridSize: 5, risk: "Easy" },
  { label: "5 mines", mineCount: 5, gridSize: 5, risk: "Medium" },
  { label: "10 mines", mineCount: 10, gridSize: 5, risk: "Hard" },
  { label: "20 mines", mineCount: 20, gridSize: 5, risk: "Insane" },
];
const QUICK_BETS = [50, 100, 500, 1000];

function multColor(m: number) {
  if (m >= 10) return "#f59e0b";
  if (m >= 5) return "#f97316";
  if (m >= 2) return "#22c55e";
  return "#00ff88";
}

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
  const [explodedCell, setExplodedCell] = useState<number | null>(null);
  const [mineFlash, setMineFlash] = useState(false);
  const [picking, setPicking] = useState(false);

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
        minePositions: null,
        status: "active",
        currentMultiplier: res.currentMultiplier ?? 1.0,
        betStriker: amount,
      };
      setSession(sess);
      setExplodedCell(null);
      setCellStates(Array(res.gridSize * res.gridSize).fill("hidden" as CellState));
    } catch (e: unknown) {
      toast({ title: "Failed to start", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handlePick = async (pos: number) => {
    if (!session || session.status !== "active" || cellStates[pos] !== "hidden" || picking) return;
    setPicking(true);
    try {
      const res = await pickMine.mutateAsync({ id: session.id, data: { position: pos } });
      const newStates = [...cellStates];

      if (res.status === "lost") {
        // Mark the clicked cell first
        newStates[pos] = "mine";
        setCellStates([...newStates]);
        setExplodedCell(pos);
        setMineFlash(true);
        setTimeout(() => setMineFlash(false), 700);

        // Reveal other mines with staggered delay
        if (res.minePositions) {
          const otherMines = (res.minePositions as number[]).filter(mp => mp !== pos);
          otherMines.forEach((mp, i) => {
            setTimeout(() => {
              setCellStates(prev => {
                const s = [...prev];
                s[mp] = "mine";
                return s;
              });
            }, 120 + i * 70);
          });
        }

        setSession(prev => prev ? {
          ...prev,
          minePositions: res.minePositions ?? [],
          status: "lost",
          currentMultiplier: 0,
        } : prev);
        toast({ title: "BOOM! Mine hit!", variant: "destructive" });
      } else {
        newStates[pos] = "safe";
        setCellStates(newStates);
        setSession(prev => prev ? {
          ...prev,
          revealedPositions: res.revealedPositions ?? prev.revealedPositions,
          currentMultiplier: res.currentMultiplier ?? prev.currentMultiplier,
          status: res.status as MineSession["status"],
        } : prev);
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      setPicking(false);
    }
  };

  const handleCashout = async () => {
    if (!session || cashingOut) return;
    setCashingOut(true);
    try {
      const res = await cashoutMine.mutateAsync({ id: session.id });
      toast({ title: `Cashed out! +${res.winAmount?.toFixed(0)} STRIKER`, description: `${res.multiplier?.toFixed(2)}×` });
      setSession(prev => prev ? { ...prev, status: "won" } : prev);
    } catch (e: unknown) {
      toast({ title: "Cashout failed", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      setCashingOut(false);
    }
  };

  const isActive = session?.status === "active";
  const safeCount = session?.revealedPositions.length ?? 0;
  const mult = session?.currentMultiplier ?? 1.0;
  const potentialWin = session ? (session.betStriker * mult).toFixed(0) : "0";
  const totalCells = session ? session.gridSize * session.gridSize : 25;
  const color = multColor(mult);

  return (
    <Layout>
      {/* Mine explosion flash */}
      <AnimatePresence>
        {mineFlash && (
          <motion.div
            key="mineflash"
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            style={{ background: "radial-gradient(ellipse at center, #ef444455 0%, transparent 70%)" }}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 border-b border-white/5">
          <Bomb className="w-4 h-4 text-red-400" />
          <span className="font-display font-bold text-xs tracking-[0.2em] text-white">MINEFIELD</span>
          {session && isActive && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[10px] font-mono text-white/35">{safeCount} safe</span>
              <span className="text-[11px] font-mono font-bold" style={{ color }}>
                {mult.toFixed(2)}×
              </span>
            </div>
          )}
        </div>

        {!session ? (
          /* ── Setup screen ── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 gap-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-3">
                <Bomb className="w-7 h-7 text-red-400/70" />
              </div>
              <div className="font-display font-bold text-base text-white/70">Click safe squares</div>
              <div className="text-[11px] font-mono text-white/30 mt-1">Cash out before hitting a mine</div>
            </div>

            {/* Mine preset selector */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => setPreset(i)}
                  className={`py-3 px-3 rounded-xl border font-mono transition-all text-left ${
                    preset === i
                      ? "border-red-400/60 bg-red-400/10 text-red-400"
                      : "border-white/10 text-white/40 hover:border-white/20"
                  }`}>
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">{p.risk} risk · 5×5</div>
                </button>
              ))}
            </div>

            {/* Mine ratio preview */}
            <div className="flex gap-1 flex-wrap justify-center max-w-[200px]">
              {Array.from({ length: 25 }).map((_, i) => {
                const isMine = i < PRESETS[preset].mineCount;
                return (
                  <div key={i} className={`w-6 h-6 rounded flex items-center justify-center ${
                    isMine ? "bg-red-400/20 border border-red-400/30" : "bg-white/5 border border-white/8"
                  }`}>
                    {isMine && <Bomb className="w-3 h-3 text-red-400/60" />}
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] font-mono text-white/25">
              {PRESETS[preset].mineCount} mines · {25 - PRESETS[preset].mineCount} safe squares
            </div>
          </div>
        ) : (
          /* ── Active game ── */
          <div className="flex-1 flex flex-col px-3 py-3 min-h-0 gap-2">

            {/* Multiplier / result display */}
            <AnimatePresence mode="wait">
              {isActive ? (
                <motion.div key="mult"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-1"
                >
                  <div>
                    <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider">Multiplier</div>
                    <motion.div
                      className="font-display font-black text-2xl leading-none"
                      style={{ color, textShadow: `0 0 20px ${color}44`, transition: "color 0.3s" }}
                      animate={safeCount > 0 ? { scale: [1, 1.06, 1] } : {}}
                      transition={{ duration: 0.35 }}
                    >
                      {mult.toFixed(3)}×
                    </motion.div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider">Potential win</div>
                    <div className="font-display font-bold text-xl leading-none text-white/80">
                      {potentialWin} <span className="text-sm text-white/30">STRK</span>
                    </div>
                  </div>
                  {/* Safe progress bar */}
                  <div className="hidden" />
                </motion.div>
              ) : (
                <motion.div key="ended"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-center px-4 py-2.5 rounded-xl border ${
                    session.status === "won"
                      ? "border-[#00ff88]/35 bg-[#00ff88]/10"
                      : "border-red-400/35 bg-red-400/10"
                  }`}
                >
                  <div className={`font-display font-black text-2xl ${
                    session.status === "won" ? "text-[#00ff88]" : "text-red-400"
                  }`}>
                    {session.status === "won" ? "CASHED OUT!" : "BOOM!"}
                  </div>
                  {session.status === "lost" && (
                    <div className="text-[11px] font-mono text-red-400/60 mt-0.5">
                      -{session.betStriker.toFixed(0)} STRIKER
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grid */}
            <div className="flex-1 flex items-center justify-center min-h-0">
              <div
                className="grid gap-1.5 w-full"
                style={{
                  gridTemplateColumns: `repeat(${session.gridSize}, minmax(0, 1fr))`,
                  maxWidth: `${session.gridSize * 58}px`,
                }}
              >
                {Array.from({ length: totalCells }).map((_, i) => {
                  const state = cellStates[i] ?? "hidden";
                  const isExploded = explodedCell === i;
                  const mineRevealIdx = state === "mine" && !isExploded
                    ? (session.minePositions ?? []).indexOf(i)
                    : -1;

                  return (
                    <motion.button
                      key={i}
                      onClick={() => handlePick(i)}
                      disabled={!isActive || state !== "hidden" || picking}
                      whileTap={state === "hidden" && isActive ? { scale: 0.85 } : {}}
                      animate={
                        isExploded ? { x: [-4, 4, -3, 3, -1, 1, 0] } : {}
                      }
                      transition={isExploded ? { duration: 0.45, delay: 0.05 } : {}}
                      className={`
                        aspect-square rounded-xl border flex items-center justify-center
                        transition-colors duration-200 relative overflow-hidden
                        ${state === "hidden" && isActive
                          ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/25 cursor-pointer"
                          : ""}
                        ${state === "safe"
                          ? "bg-[#00ff88]/15 border-[#00ff88]/40 cursor-default"
                          : ""}
                        ${state === "mine"
                          ? "bg-red-400/15 border-red-400/40 cursor-default"
                          : ""}
                        ${state === "hidden" && !isActive
                          ? "bg-white/3 border-white/5 opacity-30 cursor-not-allowed"
                          : ""}
                      `}
                    >
                      <AnimatePresence>
                        {state === "safe" && (
                          <motion.div key="safe"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 1.4, 1], opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="text-[#00ff88]"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </motion.div>
                        )}
                        {state === "mine" && isExploded && (
                          <motion.div key="mine-explode"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 2.2, 1.1, 1], opacity: 1 }}
                            transition={{ duration: 0.45 }}
                            className="text-red-400"
                          >
                            <Bomb className="w-5 h-5" />
                          </motion.div>
                        )}
                        {state === "mine" && !isExploded && (
                          <motion.div key={`mine-${i}`}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              duration: 0.25,
                              delay: mineRevealIdx >= 0 ? 0.12 + mineRevealIdx * 0.07 : 0,
                            }}
                            className="text-red-400/80"
                          >
                            <Bomb className="w-4 h-4" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Mine counter strip */}
            <div className="flex items-center justify-between text-[9px] font-mono text-white/25 px-1">
              <span>{session.mineCount} mines · {totalCells - session.mineCount} safe</span>
              <span>{safeCount} revealed</span>
            </div>
          </div>
        )}

        {/* Control panel */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-3 pb-4 flex flex-col gap-2.5">
          {!session ? (
            <>
              <div className="flex gap-1.5">
                {QUICK_BETS.map(q => (
                  <button key={q} onClick={() => setBetAmount(String(q))}
                    className={`flex-1 text-[11px] font-mono py-1.5 rounded-lg border transition-all ${
                      betAmount === String(q)
                        ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10"
                        : "border-white/8 text-white/30 hover:border-white/20"
                    }`}>
                    {q >= 1000 ? `${q / 1000}k` : q}
                  </button>
                ))}
              </div>
              <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-9 text-sm" />
              <Button onClick={handleStart} disabled={startMine.isPending}
                className="h-11 font-display font-bold tracking-widest bg-red-500 hover:bg-red-400 text-white disabled:opacity-30">
                {startMine.isPending ? "PLACING BET..." : "START GAME"}
              </Button>
            </>
          ) : isActive ? (
            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <div className="text-[9px] font-mono text-white/25 uppercase">Bet</div>
                <div className="font-mono font-bold text-white text-sm">{session.betStriker.toFixed(0)} STRIKER</div>
              </div>
              <motion.div
                animate={safeCount > 0 ? { scale: [1, 1.03, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.9 }}
              >
                <Button onClick={handleCashout} disabled={safeCount === 0 || cashingOut}
                  className="w-full h-11 font-display font-bold tracking-widest text-[#0a0e1a] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30"
                  style={safeCount > 0
                    ? { background: color, boxShadow: `0 0 22px ${color}44`, transition: "background 0.3s, box-shadow 0.3s" }
                    : {}}>
                  {cashingOut ? "CASHING..." : safeCount === 0 ? "PICK FIRST" : `CASHOUT ${mult.toFixed(2)}×`}
                </Button>
              </motion.div>
            </div>
          ) : (
            <Button onClick={() => { setSession(null); setCellStates([]); setExplodedCell(null); }}
              className="h-11 font-display font-bold tracking-widest bg-white/8 hover:bg-white/12 text-white border border-white/10">
              PLAY AGAIN
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
