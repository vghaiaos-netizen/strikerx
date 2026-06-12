import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePlayPenalty, getGetMeQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronUp, RotateCcw, Trophy } from "lucide-react";
import { soundManager } from "@/lib/sound";
import { useTranslation } from "react-i18next";

type Zone = "left" | "center" | "right";

interface Result {
  win: boolean;
  keeperDirection: Zone;
  playerDirection: Zone;
  multiplier: number;
  winAmount: number;
}

const QUICK_BETS = [50, 100, 500, 1000];

const SW = 320, SH = 190;
const NX = 58, NW = 204, NY = 28, NH = 106;
const BALL_SX = SW / 2, BALL_SY = NY + NH + 22;
const ZONE_X: Record<Zone, number> = { left: NX + 36, center: NX + NW / 2, right: NX + NW - 36 };
const ZONE_Y = NY + 30;
const KEEPER_X = NX + NW / 2;
const KEEPER_DIVE_X: Record<Zone, number> = { left: NX + 28, center: NX + NW / 2, right: NX + NW - 28 };
const ARM = 22;

function Keeper({ cx, diveDir }: { cx: number; diveDir: Zone | null }) {
  const KY = NY + 56;
  const isDiving = !!diveDir;
  
  // Animation variants
  const lean = diveDir === "left" ? -22 : diveDir === "right" ? 22 : 0;
  
  return (
    <g transform={`translate(${cx}, ${KY})`}>
      <g transform={`rotate(${lean})`}>
        {/* Torso */}
        <rect x="-10" y="-18" width="20" height="26" rx="8" fill="url(#jerseyGrad)" />
        
        {/* Number "1" */}
        <text x="0" y="2" textAnchor="middle" fontSize="11" fill="white" fontWeight="900" opacity="0.9" style={{ userSelect: "none" }}>1</text>
        
        {/* Head */}
        <circle cx="0" cy="-30" r="13" fill="#f5b87a" />
        {/* Hair/Cap */}
        <path d="M -13 -32 A 13 13 0 0 1 13 -32 L 13 -35 Q 0 -42 -13 -35 Z" fill="#222" />
        
        {/* Arms */}
        {diveDir === "left" ? (
          <>
            <path d="M -10 -10 Q -25 -15 -35 -25" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="-35" cy="-25" r="7" fill="#f5c518" />
            <path d="M 10 -10 Q 20 -5 25 5" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="25" cy="5" r="7" fill="#f5c518" />
          </>
        ) : diveDir === "right" ? (
          <>
            <path d="M 10 -10 Q 25 -15 35 -25" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="35" cy="-25" r="7" fill="#f5c518" />
            <path d="M -10 -10 Q -20 -5 -25 5" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="-25" cy="5" r="7" fill="#f5c518" />
          </>
        ) : (
          <>
            <path d="M -10 -10 Q -18 0 -15 15" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="-15" cy="15" r="7" fill="#f5c518" />
            <path d="M 10 -10 Q 18 0 15 15" stroke="#00cc55" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="15" cy="15" r="7" fill="#f5c518" />
          </>
        )}

        {/* Shorts */}
        <rect x="-10" y="8" width="20" height="12" rx="4" fill="#007733" />
        
        {/* Legs */}
        <g transform={diveDir === "left" ? "rotate(-30, -5, 18)" : ""}>
          <path d="M -8 18 L -10 32 Q -10 38 -4 38" stroke="#00cc55" strokeWidth="8" fill="none" strokeLinecap="round" />
          <rect x="-11" y="34" width="10" height="6" rx="2" fill="#111" />
        </g>
        <g transform={diveDir === "right" ? "rotate(30, 5, 18)" : ""}>
          <path d="M 8 18 L 10 32 Q 10 38 4 38" stroke="#00cc55" strokeWidth="8" fill="none" strokeLinecap="round" />
          <rect x="1" y="34" width="10" height="6" rx="2" fill="#111" />
        </g>
      </g>
    </g>
  );
}

export function Penalty() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const playPenalty = usePlayPenalty();

  const [betAmount, setBetAmount] = useState("100");
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [kicking, setKicking] = useState(false);
  const [ballPos, setBallPos] = useState({ x: BALL_SX, y: BALL_SY });
  const [flashWin, setFlashWin] = useState(false);
  const [flashLose, setFlashLose] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]);

  const handleKick = async (zone: Zone) => {
    if (kicking) return;
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    setSelectedZone(zone);
    setKicking(true);
    setResult(null);
    setBallPos({ x: BALL_SX, y: BALL_SY });

    try {
      const res = await playPenalty.mutateAsync({ data: { betStriker: amount, direction: zone } });
      const raw = res as unknown as { win?: boolean; keeperDirection?: string; multiplier?: number; winAmount?: number };
      const r: Result = {
        win: raw.win ?? res.outcome === "win",
        keeperDirection: (raw.keeperDirection as Zone) ?? "center",
        playerDirection: zone,
        multiplier: res.multiplier ?? 1.92,
        winAmount: res.winAmount ?? 0,
      };
      soundManager.play("kick");
      setTimeout(() => setBallPos({ x: ZONE_X[zone], y: ZONE_Y + 6 }), 40);
      setTimeout(() => {
        setResult(r);
        if (r.win) {
          setFlashWin(true); setTimeout(() => setFlashWin(false), 900);
          toast({ title: `GOAL! +${r.winAmount.toFixed(0)} STRIKER`, description: `${r.multiplier}× payout` });
          soundManager.play("goal");
        } else {
          setFlashLose(true); setTimeout(() => setFlashLose(false), 750);
          toast({ title: "SAVED!", description: "Keeper dived the right way", variant: "destructive" });
          soundManager.play("saved");
        }
        setHistory(prev => [r.win, ...prev].slice(0, 14));
        setKicking(false);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }, 460);
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message, variant: "destructive" });
      setKicking(false);
    }
  };

  const handleReset = () => {
    setResult(null); setSelectedZone(null);
    setBallPos({ x: BALL_SX, y: BALL_SY });
  };

  const hasResult = !!result;

  return (
    <Layout>
      <AnimatePresence>
        {flashWin && (
          <motion.div key="fw" className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 0.85 }}
            style={{ background: "radial-gradient(ellipse at 50% 35%, #00ff8842 0%, transparent 68%)" }} />
        )}
        {flashLose && (
          <motion.div key="fl" className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.65 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }}
            style={{ background: "radial-gradient(ellipse at 50% 35%, #ef444438 0%, transparent 65%)" }} />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#00ff88]" />
            <span className="font-display font-bold text-xs tracking-[0.2em] text-white">{t('games.penalty.title')}</span>
            <span className="text-[9px] font-mono text-white/20 ml-1">1.92× payout</span>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-1">
              {history.slice(0, 12).map((w, i) => (
                <div key={i}
                  className={`rounded-full transition-all ${w ? "bg-[#00ff88] w-2 h-2" : "bg-red-400/60 w-1.5 h-1.5"}`} />
              ))}
            </div>
          )}
        </div>

        {/* Goal area */}
        <div className="flex-1 flex items-center justify-center px-3 min-h-0">
          <div className="w-full max-w-xs">
            <svg viewBox={`0 0 ${SW} ${SH}`} className="w-full" style={{ maxHeight: "220px" }}>
              <defs>
                <filter id="bglow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d2914" />
                  <stop offset="100%" stopColor="#091909" />
                </linearGradient>
                <linearGradient id="jerseyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00cc55" />
                  <stop offset="100%" stopColor="#009944" />
                </linearGradient>
                <pattern id="grassStripes" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="20" height="40" fill="rgba(255,255,255,0.03)" />
                </pattern>
                <pattern id="nh" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="10" y2="0" stroke="rgba(255,255,255,0.09)" strokeWidth="0.8" />
                  <line x1="0" y1="5" x2="10" y2="5" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                </pattern>
                <pattern id="nv" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.09)" strokeWidth="0.8" />
                  <line x1="5" y1="0" x2="5" y2="10" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Stadium Atmosphere */}
              <g opacity="0.06">
                {Array.from({ length: 24 }).map((_, i) => (
                  <ellipse 
                    key={i} 
                    cx={(SW / 24) * i + (SW / 48)} 
                    cy={5 + Math.random() * 5} 
                    rx="5" 
                    ry={6 + Math.random() * 4} 
                    fill="white" 
                  />
                ))}
              </g>

              {/* Pitch */}
              <rect x="0" y={NY + NH + 4} width={SW} height={SH - NY - NH - 4} fill="url(#pitchGrad)" />
              <rect x="0" y={NY + NH + 4} width={SW} height={SH - NY - NH - 4} fill="url(#grassStripes)" />
              
              <ellipse cx={SW / 2} cy={NY + NH + 20} rx="55" ry="9" fill="rgba(13, 41, 20, 0.6)" />
              <circle cx={BALL_SX} cy={NY + NH + 28} r="2.5" fill="rgba(255,255,255,0.35)" />
              
              {/* Penalty arc */}
              <path d={`M ${NX - 20} ${NY + NH + 4} Q ${SW / 2} ${NY + NH - 20} ${NX + NW + 20} ${NY + NH + 4}`}
                fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />

              {/* Net background tint */}
              <rect x={NX} y={NY} width={NW} height={NH} fill="#00080a" opacity="0.3" />
              
              {/* Net */}
              <rect x={NX} y={NY} width={NW} height={NH} fill="url(#nh)" />
              <rect x={NX} y={NY} width={NW} height={NH} fill="url(#nv)" />
              <rect x={NX} y={NY} width={NW} height={NH} fill="#00100500" opacity="0.6" />

              {/* Goal frame glow */}
              <rect x={NX} y={NY} width={NW} height={NH} fill="none"
                stroke="rgba(255,255,255,0.1)" strokeWidth="8" strokeLinejoin="round" />
              {/* Goal frame */}
              <rect x={NX} y={NY} width={NW} height={NH} fill="none"
                stroke="white" strokeWidth="2.5" strokeLinejoin="round" />

              {/* Shot arc (appears after kick) */}
              {result && (
                <motion.path
                  d={`M ${BALL_SX} ${BALL_SY - 4} Q ${(BALL_SX + ZONE_X[result.playerDirection]) / 2} ${NY - 18} ${ZONE_X[result.playerDirection]} ${ZONE_Y + 8}`}
                  fill="none"
                  stroke={result.win ? "#00ff88" : "#ef4444"}
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  initial={{ pathLength: 0, opacity: 0.75 }}
                  animate={{ pathLength: 1, opacity: 0.2 }}
                  transition={{ duration: 0.42 }}
                />
              )}

              {/* Keeper */}
              <AnimatePresence mode="wait">
                {!result ? (
                  <motion.g key="idle"
                    animate={{ x: [0, -4, 4, -3, 3, 0] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}>
                    <Keeper cx={KEEPER_X} diveDir={null} />
                  </motion.g>
                ) : (
                  <motion.g key="dive"
                    initial={{ x: KEEPER_X - KEEPER_DIVE_X[result.keeperDirection] }}
                    animate={{ x: 0 }}
                    transition={{ type: "spring", stiffness: 480, damping: 20 }}>
                    <Keeper cx={KEEPER_DIVE_X[result.keeperDirection]} diveDir={result.keeperDirection} />
                  </motion.g>
                )}
              </AnimatePresence>

              {/* Ball */}
              <motion.g
                animate={{ 
                  x: ballPos.x - BALL_SX, 
                  y: ballPos.y - BALL_SY,
                  rotate: kicking ? 360 : 0
                }}
                transition={{ 
                  duration: 0.42, 
                  ease: [0.2, 0.0, 0.35, 1.0],
                  rotate: { duration: 0.42, ease: "linear" }
                }}
              >
                {/* Shadow */}
                <ellipse cx={BALL_SX} cy={BALL_SY + 9} rx="8" ry="3" fill="black" opacity="0.35" />
                {/* Ball */}
                <circle cx={BALL_SX} cy={BALL_SY} r="9"
                  fill={result ? (result.win ? "white" : "#ffc0c0") : "white"}
                  filter="url(#bglow)" />
                
                {/* Football Patches */}
                <circle cx={BALL_SX} cy={BALL_SY - 4} r="1.8" fill="#111" opacity="0.8" />
                <circle cx={BALL_SX - 4} cy={BALL_SY + 1} r="1.8" fill="#111" opacity="0.8" />
                <circle cx={BALL_SX + 4} cy={BALL_SY + 1} r="1.8" fill="#111" opacity="0.8" />
                <circle cx={BALL_SX - 2} cy={BALL_SY + 5} r="1.8" fill="#111" opacity="0.8" />
                <circle cx={BALL_SX + 2} cy={BALL_SY + 5} r="1.8" fill="#111" opacity="0.8" />
                
                {/* Specular Highlight */}
                <circle cx={BALL_SX - 3} cy={BALL_SY - 3} r="2.5" fill="white" opacity="0.6" />
              </motion.g>

              {/* Goal celebration rings */}
              <AnimatePresence>
                {result?.win && [1, 2, 3, 4, 5].map(n => (
                  <motion.circle key={n}
                    cx={ZONE_X[result.playerDirection]} cy={ZONE_Y + 6}
                    r={12}
                    fill="none" stroke="#00ff88" strokeWidth="2"
                    initial={{ r: 12, opacity: 0.85 }}
                    animate={{ r: 12 + n * 30, opacity: 0 }}
                    transition={{ duration: 0.8, delay: n * 0.08, ease: "easeOut" }}
                    style={{ transformOrigin: `${ZONE_X[result.playerDirection]}px ${ZONE_Y + 6}px` }}
                  />
                ))}
              </AnimatePresence>
            </svg>

            {/* Result card */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.78, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 440, damping: 24 }}
                  className={`mx-2 text-center py-3 rounded-2xl border ${
                    result.win
                      ? "border-[#00ff88]/40 bg-[#00ff88]/10"
                      : "border-red-400/30 bg-red-400/8"
                  }`}
                >
                  <div className={`font-display font-black text-3xl leading-none tracking-wide ${
                    result.win ? "text-[#00ff88]" : "text-red-400"
                  }`}>
                    {result.win ? t('games.penalty.goal') : t('games.penalty.saved')}
                  </div>
                  <div className={`text-sm font-mono mt-1.5 ${result.win ? "text-[#00ff88]/65" : "text-red-400/50"}`}>
                    {result.win
                      ? `+${result.winAmount.toFixed(0)} STRIKER · ${result.multiplier}×`
                      : `Keeper went ${result.keeperDirection}`}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Zone picker / Reset */}
        <div className="px-4 pb-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as Zone[]).map(zone => {
              const Icon = zone === "left" ? ChevronLeft : zone === "right" ? ChevronRight : ChevronUp;
              const isShot = result?.playerDirection === zone;
              const isKeeper = result?.keeperDirection === zone;
              return (
                <motion.button
                  key={zone}
                  whileHover={!kicking && !hasResult ? { scale: 1.02 } : {}}
                  whileTap={!hasResult ? { scale: 0.95 } : {}}
                  onClick={() => !hasResult && handleKick(zone)}
                  disabled={kicking || hasResult}
                  className={`
                    flex flex-col items-center gap-1.5 py-5 rounded-2xl border-2 font-display
                    font-bold text-[11px] uppercase tracking-widest transition-all duration-150
                    group relative overflow-hidden
                    ${selectedZone === zone && kicking ? "border-[#00ff88] bg-[#00ff88]/18 text-[#00ff88]" : ""}
                    ${isShot && result?.win ? "border-[#00ff88]/55 bg-[#00ff88]/14 text-[#00ff88]" : ""}
                    ${isShot && !result?.win ? "border-red-400/45 bg-red-400/10 text-red-400" : ""}
                    ${isKeeper && !isShot ? "border-yellow-400/35 bg-yellow-400/8 text-yellow-400/55" : ""}
                    ${!hasResult && !kicking ? "border-white/12 bg-white/4 text-white/55 hover:border-white/28 hover:bg-white/8 hover:text-white/85 cursor-pointer" : ""}
                    ${hasResult && !isShot && !isKeeper ? "border-white/5 text-white/18" : ""}
                  `}
                >
                  <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-125" />
                  <span>
                    {hasResult
                      ? (isShot ? (result.win ? t('games.penalty.goal') : t('games.penalty.saved')) : isKeeper ? "keeper" : t(`games.penalty.${zone}`))
                      : t(`games.penalty.${zone}`)}
                  </span>
                  {!hasResult && !kicking && (
                    <div className="absolute bottom-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronUp className="w-3 h-3 text-[#00ff88] animate-bounce" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {hasResult && (
            <Button onClick={handleReset}
              className="h-10 font-display font-bold tracking-widest bg-white/8 hover:bg-white/12 text-white border border-white/10">
              <RotateCcw className="w-3.5 h-3.5 mr-2" />
              KICK AGAIN
            </Button>
          )}
        </div>

        {/* Bet panel */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-2.5 pb-4 flex flex-col gap-2">
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
            className="bg-white/5 border-white/10 text-white font-mono font-bold h-9 text-sm"
            disabled={kicking} />
        </div>
      </div>
    </Layout>
  );
}
