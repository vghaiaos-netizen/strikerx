import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStartMinefield, usePickMinefield, useCashoutMinefield, getGetMeQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, CheckCircle2, Zap } from "lucide-react";
import { soundManager } from "@/lib/sound";
import { useTranslation } from "react-i18next";

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
  { label: "3 mines",  mineCount: 3,  gridSize: 5, risk: "Easy" },
  { label: "5 mines",  mineCount: 5,  gridSize: 5, risk: "Medium" },
  { label: "10 mines", mineCount: 10, gridSize: 5, risk: "Hard" },
  { label: "20 mines", mineCount: 20, gridSize: 5, risk: "Insane" },
];
const QUICK_BETS = [50, 100, 500, 1000];
const BURST_ANGLES = [0, 60, 120, 180, 240, 300];

// Replicate server formula for next-pick multiplier preview
function nextMultiplier(gridSize: number, mineCount: number, safePicks: number): number {
  const houseEdge = 0.04;
  const total = gridSize * gridSize;
  let mult = 1.0;
  for (let i = 0; i < safePicks; i++) {
    const remaining = total - i;
    const safe = remaining - mineCount;
    if (safe <= 0) break;
    mult *= (remaining / safe) * (1 - houseEdge);
  }
  return parseFloat(mult.toFixed(3));
}

function multColor(m: number) {
  if (m >= 10) return "#f59e0b";
  if (m >= 5)  return "#f97316";
  if (m >= 2)  return "#22c55e";
  return "#00ff88";
}

export function Minefield() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const startMine = useStartMinefield();
  const pickMine  = usePickMinefield();
  const cashoutMine = useCashoutMinefield();

  const [betAmount, setBetAmount] = useState("100");
  const [preset, setPreset] = useState(0);
  const [autoCashoutAt, setAutoCashoutAt] = useState("");
  const [session, setSession] = useState<MineSession | null>(null);
  const [cellStates, setCellStates] = useState<CellState[]>([]);
  const [cashingOut, setCashingOut] = useState(false);
  const [explodedCell, setExplodedCell] = useState<number | null>(null);
  const [mineFlash, setMineFlash] = useState(false);
  const [picking, setPicking] = useState(false);
  const [lastSafePick, setLastSafePick] = useState<number | null>(null);
  const gridShakeRef = useRef(0); // bump to trigger shake
  const [gridShake, setGridShake] = useState(0);

  const handleStart = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    const { mineCount, gridSize } = PRESETS[preset];
    try {
      const res = await startMine.mutateAsync({ data: { betStriker: amount, gridSize, mineCount } });
      setSession({
        id: res.id, gridSize: res.gridSize, mineCount: res.mineCount,
        revealedPositions: res.revealedPositions ?? [],
        minePositions: null, status: "active",
        currentMultiplier: res.currentMultiplier ?? 1.0,
        betStriker: amount,
      });
      setExplodedCell(null);
      setLastSafePick(null);
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
        newStates[pos] = "mine";
        setCellStates([...newStates]);
        setExplodedCell(pos);
        setMineFlash(true);
        setTimeout(() => setMineFlash(false), 700);
        soundManager.play("crash");
        gridShakeRef.current += 1;
        setGridShake(gridShakeRef.current);

        if (res.minePositions) {
          const others = (res.minePositions as number[]).filter(mp => mp !== pos);
          others.forEach((mp, i) => {
            setTimeout(() => {
              setCellStates(prev => { const s = [...prev]; s[mp] = "mine"; return s; });
            }, 100 + i * 65);
          });
        }
        setSession(prev => prev ? {
          ...prev, minePositions: res.minePositions ?? [],
          status: "lost", currentMultiplier: 0,
        } : prev);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "BOOM! Mine hit!", variant: "destructive" });
      } else {
        newStates[pos] = "safe";
        setCellStates(newStates);
        setLastSafePick(pos);
        setTimeout(() => setLastSafePick(null), 420);
        soundManager.play("safe_pick");

        const newMult = res.currentMultiplier ?? session.currentMultiplier;
        setSession(prev => prev ? {
          ...prev,
          revealedPositions: res.revealedPositions ?? prev.revealedPositions,
          currentMultiplier: newMult,
          status: res.status as MineSession["status"],
        } : prev);

        // Auto-cashout check
        const autoTarget = parseFloat(autoCashoutAt);
        if (!isNaN(autoTarget) && autoTarget > 1 && newMult >= autoTarget && res.status === "active") {
          const sid = session.id;
          setTimeout(async () => {
            try {
              setCashingOut(true);
              const co = await cashoutMine.mutateAsync({ id: sid });
              toast({ title: `Auto cashed out! +${co.winAmount?.toFixed(0)} STRIKER`, description: `${co.multiplier?.toFixed(2)}×` });
              setSession(p => p ? { ...p, status: "won" } : p);
            } catch { /* manual cashout still possible */ }
            finally { setCashingOut(false); }
          }, 60);
        }
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      setPicking(false);
    }
  };

  const handleRandomPick = async () => {
    if (!session || !isActive || picking) return;
    const hidden = Array.from({ length: totalCells }, (_, i) => i).filter(i => (cellStates[i] ?? "hidden") === "hidden");
    if (hidden.length === 0) return;
    const randIdx = Math.floor(Math.random() * hidden.length);
    await handlePick(hidden[randIdx]);
  };

  const handleCashout = async () => {
    if (!session || cashingOut) return;
    setCashingOut(true);
    try {
      const res = await cashoutMine.mutateAsync({ id: session.id });
      toast({ title: `+${res.winAmount?.toFixed(0)} STRIKER`, description: `${res.multiplier?.toFixed(2)}×` });
      setSession(p => p ? { ...p, status: "won" } : p);
      soundManager.play("cashout");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      toast({ title: "Cashout failed", description: (e as { message?: string })?.message, variant: "destructive" });
    } finally {
      setCashingOut(false);
    }
  };

  const isActive = session?.status === "active";
  const safeCount = session?.revealedPositions.length ?? 0;
  const mult = session?.currentMultiplier ?? 1.0;
  const totalCells = session ? session.gridSize * session.gridSize : 25;
  const safeCellsLeft = session ? totalCells - session.mineCount - safeCount : 0;
  const hiddenLeft = session ? totalCells - safeCount : 0;
  const safeProb = hiddenLeft > 0 ? Math.round((safeCellsLeft / hiddenLeft) * 100) : 0;
  const nextMult = session
    ? nextMultiplier(session.gridSize, session.mineCount, safeCount + 1)
    : 0;
  const potentialWin = session ? (session.betStriker * mult).toFixed(0) : "0";
  const color = multColor(mult);
  const tensionAlpha = isActive && mult >= 3 ? Math.min(0.12, (mult - 3) * 0.02) : 0;

  const multGlow = mult >= 5 
    ? "text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" 
    : mult >= 2 
      ? "text-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.3)]" 
      : "text-[#00ff88] shadow-[0_0_8px_rgba(0,255,136,0.2)]";

  return (
    <Layout>
      {/* Explosion flash */}
      <AnimatePresence>
        {mineFlash && (
          <motion.div key="mf" className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.65 }}
            style={{ background: "radial-gradient(ellipse at center, #ef444455 0%, transparent 70%)" }} />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 border-b border-white/5">
          <Bomb className="w-4 h-4 text-red-400" />
          <span className="font-display font-bold text-xs tracking-[0.2em] text-white">{t('games.minefield.title')}</span>
          {session && isActive && (
            <div className="ml-auto flex items-center gap-3">
              {mult > 5 && (
                <motion.span 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse"
                >
                  DANGER
                </motion.span>
              )}
              <span className="text-[10px] font-mono text-white/25">{safeProb}% safe next</span>
              <span className={`text-[11px] font-mono font-bold transition-all duration-300 ${multGlow}`} style={{ color }}>{mult.toFixed(3)}×</span>
            </div>
          )}
        </div>

        {!session ? (
          /* ── Setup ── */
          <div className="flex-1 flex flex-col items-center px-4 py-4 gap-4 overflow-y-auto min-h-0">
            <div className="text-center relative">
              <div className="relative w-20 h-20 mx-auto mb-4">
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-500/20"
                  animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                />
                <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30 flex items-center justify-center">
                  <Bomb className="w-10 h-10 text-red-500" />
                </div>
              </div>
              <div className="font-display font-bold text-lg text-white">{t('games.minefield.setupTitle')}</div>
              <div className="text-[12px] font-mono text-white/40 mt-1">{t('games.minefield.setupSub')}</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 w-full max-w-[320px]">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => setPreset(i)}
                  className={`py-3.5 px-4 rounded-xl border font-mono transition-all text-left relative overflow-hidden ${
                    preset === i
                      ? "border-red-400/60 bg-red-400/10 text-red-400 shadow-[0_0_15px_rgba(248,113,113,0.1)]"
                      : "border-white/10 text-white/38 hover:border-white/22 bg-white/5"
                  }`}>
                  <div className="text-sm font-bold">{p.label}</div>
                  <div className="text-[10px] opacity-55 mt-0.5">{p.risk} risk · 5×5</div>
                  {preset === i && (
                    <motion.div 
                      layoutId="preset-active"
                      className="absolute inset-0 bg-gradient-to-r from-red-400/5 to-transparent pointer-events-none" 
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Mine ratio preview */}
            <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
              <div className="flex gap-1.5 flex-wrap justify-center max-w-[210px]">
                {Array.from({ length: 25 }).map((_, i) => {
                  const isMine = i < PRESETS[preset].mineCount;
                  return (
                    <div key={i} className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-300 ${
                      isMine 
                        ? "bg-red-400/10 border border-red-400/40 shadow-[inset_0_0_8px_rgba(248,113,113,0.2)]" 
                        : "bg-[#00ff88]/5 border border-[#00ff88]/20"
                    }`}>
                      {isMine && <Bomb className="w-3.5 h-3.5 text-red-400/80" />}
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] font-mono text-white/40 mt-3 text-center">
                {PRESETS[preset].mineCount} MINES · {25 - PRESETS[preset].mineCount} SAFE
              </div>
            </div>

            {/* Auto-cashout setting */}
            <div className="w-full max-w-[320px]">
              <label className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-2 px-1">
                Auto cash out at × (optional)
              </label>
              <Input
                type="number" step="0.1" placeholder="e.g. 3.00"
                value={autoCashoutAt}
                onChange={e => setAutoCashoutAt(e.target.value)}
                className="bg-white/5 border-white/10 text-white/80 font-mono h-11 text-sm rounded-xl focus:border-red-400/50 transition-colors"
              />
            </div>
          </div>
        ) : (
          /* ── Active / ended game ── */
          <div className="flex-1 flex flex-col px-3 py-2 min-h-0 gap-2">

            {/* Multiplier row */}
            <AnimatePresence mode="wait">
              {isActive ? (
                <motion.div key="mult"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-end justify-between px-1"
                >
                  <div>
                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">Current Payout</div>
                    <motion.div
                      className="font-display font-black leading-none drop-shadow-2xl"
                      style={{ 
                        fontSize: "clamp(32px,12vw,48px)", 
                        color, 
                        textShadow: `0 0 30px ${color}55`, 
                        transition: "color 0.3s, text-shadow 0.3s" 
                      }}
                      animate={safeCount > 0 ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {mult.toFixed(3)}×
                    </motion.div>
                    <div className="text-[11px] font-mono text-white/30 mt-1 flex items-center gap-1.5">
                      <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">{session.betStriker.toFixed(0)}</span>
                      <span className="text-white/20">×</span>
                      <span className="text-white/50">{mult.toFixed(3)}</span>
                      <span className="text-white/20">=</span>
                      <span className="text-[#00ff88] font-bold">{potentialWin}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-white/30 uppercase">Next pick</div>
                    <div className="text-lg font-mono font-black" style={{ color }}>→ {nextMult.toFixed(3)}×</div>
                    <div className="text-[11px] font-mono text-white/30">{safeProb}% safe</div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="ended"
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-center px-4 py-3 rounded-2xl border-2 shadow-lg ${
                    session.status === "won"
                      ? "border-[#00ff88]/50 bg-[#00ff88]/10 shadow-[#00ff88]/10"
                      : "border-red-500/50 bg-red-500/10 shadow-red-500/10"
                  }`}
                >
                  <div className={`font-display font-black text-3xl tracking-tighter ${
                    session.status === "won" ? "text-[#00ff88] drop-shadow-[0_0_10px_#00ff8855]" : "text-red-500 drop-shadow-[0_0_10px_#ef444455]"
                  }`}>
                    {session.status === "won" ? "CASHED OUT!" : "BOOM!"}
                  </div>
                  {session.status === "lost" && (
                    <div className="text-xs font-mono text-red-400/70 mt-1 font-bold">
                      -{session.betStriker.toFixed(0)} STRIKER
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grid */}
            <div className="flex-1 flex items-center justify-center min-h-0 relative">
              {/* Tension overlay */}
              <AnimatePresence>
                {tensionAlpha > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ 
                      opacity: [tensionAlpha, tensionAlpha * 1.5, tensionAlpha],
                    }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 pointer-events-none rounded-2xl"
                    style={{ 
                      background: `radial-gradient(ellipse at center, rgba(239,68,68,${tensionAlpha}) 0%, transparent 80%)`,
                      boxShadow: `inset 0 0 ${mult * 8}px rgba(239,68,68,${Math.min(0.25, tensionAlpha * 3)})`
                    }} 
                  />
                )}
              </AnimatePresence>

              <motion.div
                key={`grid-${gridShake}`}
                animate={session.status === "lost"
                  ? { x: [-6, 6, -5, 5, -3, 3, -1, 1, 0] }
                  : { x: 0 }}
                transition={{ duration: 0.48 }}
                className="w-full p-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${session.gridSize}, minmax(0,1fr))`,
                  gap: "8px",
                  maxWidth: `${session.gridSize * 64}px`,
                  margin: "0 auto",
                }}
              >
                {Array.from({ length: totalCells }).map((_, i) => {
                  const state = cellStates[i] ?? "hidden";
                  const isExploded = explodedCell === i;
                  const mineIdx = state === "mine" && !isExploded
                    ? (session.minePositions ?? []).indexOf(i) : -1;
                  const isBurst = lastSafePick === i;

                  return (
                    <motion.button
                      key={i}
                      onClick={() => handlePick(i)}
                      disabled={!isActive || state !== "hidden" || picking}
                      whileTap={state === "hidden" && isActive ? { scale: 0.85 } : {}}
                      animate={isExploded ? { x: [-4, 4, -3, 3, -1, 1, 0] } : {}}
                      transition={isExploded ? { duration: 0.42, delay: 0.04 } : {}}
                      className={`
                        aspect-square rounded-2xl border-2 flex items-center justify-center
                        relative overflow-hidden transition-all duration-300 shadow-sm
                        ${state === "hidden" && isActive 
                          ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#00ff88]/35 cursor-pointer" 
                          : ""}
                        ${state === "safe"  
                          ? "bg-[#00ff88]/20 border-[#00ff88]/55 shadow-[inset_0_0_12px_rgba(0,255,136,0.2)]" 
                          : ""}
                        ${state === "mine"  
                          ? "bg-red-500/25 border-red-500/65 shadow-[inset_0_0_15px_rgba(239,68,68,0.3)]" 
                          : ""}
                        ${state === "hidden" && !isActive 
                          ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed" 
                          : ""}
                      `}
                    >
                      {/* Hidden cell highlight */}
                      {state === "hidden" && (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-60 pointer-events-none" />
                      )}

                      <AnimatePresence>
                        {state === "safe" && (
                          <motion.div key="safe"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 1.5, 1], opacity: 1 }}
                            transition={{ duration: 0.28 }}
                            className="text-[#00ff88] drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">
                            <CheckCircle2 className="w-6 h-6" />
                          </motion.div>
                        )}
                        {state === "mine" && isExploded && (
                          <motion.div key="mine-explode"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 2.4, 1.1, 1], opacity: 1 }}
                            transition={{ duration: 0.42 }}
                            className="text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]">
                            <Bomb className="w-7 h-7" />
                          </motion.div>
                        )}
                        {state === "mine" && !isExploded && (
                          <motion.div key={`mine-${i}`}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.22, delay: mineIdx >= 0 ? 0.1 + mineIdx * 0.065 : 0 }}
                            className="text-red-400/80">
                            <Bomb className="w-5 h-5" />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Safe pick particle burst */}
                      {isBurst && BURST_ANGLES.map(angle => (
                        <motion.div
                          key={angle}
                          className="absolute w-2 h-2 rounded-full bg-[#00ff88] pointer-events-none"
                          style={{ top: "calc(50% - 4px)", left: "calc(50% - 4px)", zIndex: 20 }}
                          initial={{ x: 0, y: 0, opacity: 1 }}
                          animate={{
                            x: Math.cos(angle * Math.PI / 180) * 25,
                            y: Math.sin(angle * Math.PI / 180) * 25,
                            opacity: 0,
                          }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      ))}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>

            {/* Footer strip */}
            <div className="flex items-center justify-between text-[10px] font-mono text-white/30 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {session.mineCount} MINES
              </span>
              <span className="text-white/10">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> {totalCells - session.mineCount} SAFE
              </span>
              <span className="text-white/10">|</span>
              <span className="text-white/50">{safeCount} REVEALED</span>
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
                {startMine.isPending ? "PLACING BET…" : t('games.minefield.startGame')}
              </Button>
            </>
          ) : isActive ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] font-mono text-white/22 uppercase tracking-wider">Your bet</div>
                  <div className="font-mono font-bold text-white">{session.betStriker.toFixed(0)} STRIKER</div>
                  {autoCashoutAt && parseFloat(autoCashoutAt) > 1 && (
                    <div className="text-[9px] font-mono text-yellow-400/55 mt-0.5">
                      <Zap className="w-2.5 h-2.5 inline mr-0.5" />
                      Auto at {parseFloat(autoCashoutAt).toFixed(2)}×
                    </div>
                  )}
                </div>
                <Button onClick={handleRandomPick} disabled={picking || cashingOut}
                  variant="outline" size="sm"
                  className="h-9 px-3 font-display font-bold text-[10px] tracking-wider border-white/12 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/25 disabled:opacity-30">
                  Pick Random
                </Button>
              </div>
              <motion.div
                animate={safeCount > 0 ? { scale: [1, 1.04, 1] } : {}}
                transition={{ repeat: Infinity, duration: mult >= 5 ? 0.5 : mult >= 2 ? 0.75 : 1.1 }}
              >
                <Button onClick={handleCashout} disabled={safeCount === 0 || cashingOut}
                  className="w-full h-11 font-display font-bold tracking-widest text-[#060a14] disabled:opacity-30 disabled:bg-white/8 disabled:text-white/25"
                  style={safeCount > 0
                    ? { background: color, boxShadow: `0 0 24px ${color}44`, transition: "background 0.3s, box-shadow 0.3s" }
                    : {}}>
                  {cashingOut ? "CASHING…" : safeCount === 0 ? "PICK FIRST" : `${mult.toFixed(2)}× CASHOUT`}
                </Button>
              </motion.div>
            </div>
          ) : (
            <Button
              onClick={() => { setSession(null); setCellStates([]); setExplodedCell(null); setLastSafePick(null); }}
              className="h-11 font-display font-bold tracking-widest bg-white/8 hover:bg-white/12 text-white border border-white/10">
              PLAY AGAIN
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
