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
  { dir: "center", label: "CENTRE" },
  { dir: "right", label: "RIGHT" },
];

interface KickResult {
  win: boolean;
  direction: Direction;
  keeperDirection: Direction;
  multiplier: number;
  winAmount: number;
}

// x-center for each zone (SVG viewBox 0 0 320 180)
function zoneX(d: Direction | null) {
  if (d === "left") return 67;
  if (d === "right") return 253;
  return 160;
}

export function Penalty() {
  const { toast } = useToast();
  const playPenalty = usePlayPenalty();

  const [betAmount, setBetAmount] = useState("100");
  const [selected, setSelected] = useState<Direction | null>(null);
  const [shotDir, setShotDir] = useState<Direction | null>(null);
  const [result, setResult] = useState<KickResult | null>(null);
  const [kicking, setKicking] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]);
  const [flash, setFlash] = useState<"goal" | "saved" | null>(null);

  const handleKick = async () => {
    if (!selected) { toast({ title: "Pick a zone first!", variant: "destructive" }); return; }
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }

    setShotDir(selected);
    setKicking(true);
    setResult(null);
    setFlash(null);

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
      setFlash(r.win ? "goal" : "saved");
      setTimeout(() => setFlash(null), 900);
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as { message?: string })?.message ?? "Request failed", variant: "destructive" });
    } finally {
      setKicking(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setShotDir(null);
    // keep selected zone for fast re-kick
  };

  // Ball: always rendered, animates on shot
  const inFlight = kicking || !!result;
  const ballX = inFlight ? zoneX(shotDir) : 160;
  const ballY = inFlight ? 65 : 152;

  // Keeper: offset from center (160) when result arrives
  const keeperOffset = result
    ? (result.keeperDirection === "left" ? -93 : result.keeperDirection === "right" ? 93 : 0)
    : 0;
  const keeperColor = result ? (result.win ? "#ef4444" : "#22c55e") : "#22c55e";

  return (
    <Layout>
      {/* Flash overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            style={{
              background: flash === "goal"
                ? "radial-gradient(ellipse at 50% 40%, #00ff8850 0%, transparent 68%)"
                : "radial-gradient(ellipse at 50% 40%, #ef444450 0%, transparent 68%)",
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#060a14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 border-b border-white/5">
          <Target className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-xs tracking-[0.2em] text-white">PENALTY</span>
          <span className="ml-auto text-[10px] font-mono text-white/25">1.92× payout</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-around px-4 py-2 min-h-0 gap-3">

          {/* Goal + pitch SVG */}
          <div className="w-full max-w-xs">
            <svg viewBox="0 0 320 180" className="w-full">
              <defs>
                <linearGradient id="pg-grass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0e2b0e" />
                  <stop offset="100%" stopColor="#071507" />
                </linearGradient>
                <linearGradient id="pg-net" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0c1e0c" />
                  <stop offset="100%" stopColor="#060c06" />
                </linearGradient>
                <filter id="pg-glow">
                  <feGaussianBlur stdDeviation="3.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="pg-ballglow">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Grass */}
              <rect x="0" y="122" width="320" height="58" fill="url(#pg-grass)" />
              {[0, 1, 2, 3].map(i => (
                <rect key={i} x={i * 80} y="122" width="80" height="58"
                  fill={i % 2 === 0 ? "rgba(0,0,0,0.14)" : "transparent"} />
              ))}
              {/* 6-yard box */}
              <rect x="95" y="122" width="130" height="18" fill="none" stroke="#ffffff09" strokeWidth="1" />

              {/* Net back */}
              <rect x="20" y="16" width="280" height="106" fill="url(#pg-net)" />
              {/* Net mesh H */}
              {Array.from({ length: 6 }).map((_, i) => (
                <line key={`h${i}`} x1="20" y1={16 + (i + 1) * 106 / 7} x2="300" y2={16 + (i + 1) * 106 / 7}
                  stroke="#ffffff09" strokeWidth="1" />
              ))}
              {/* Net mesh V */}
              {Array.from({ length: 13 }).map((_, i) => (
                <line key={`v${i}`}
                  x1={20 + (i + 1) * 280 / 14} y1="16"
                  x2={20 + (i + 1) * 280 / 14} y2="122"
                  stroke="#ffffff07" strokeWidth="1" />
              ))}

              {/* Goal frame */}
              <rect x="19" y="15" width="282" height="108" fill="none" stroke="#ffffffcc" strokeWidth="3" rx="1" />

              {/* Zone dividers */}
              <line x1="113" y1="16" x2="113" y2="122" stroke="#ffffff12" strokeWidth="1" strokeDasharray="5 5" />
              <line x1="207" y1="16" x2="207" y2="122" stroke="#ffffff12" strokeWidth="1" strokeDasharray="5 5" />

              {/* Zone selection / result highlights */}
              {ZONES.map(({ dir }, i) => {
                const xs = [20, 113, 207][i];
                const ws = [93, 94, 93][i];
                const isSel = selected === dir && !result;
                const isShot = result?.direction === dir;
                const win = isShot && result?.win;
                const loss = isShot && !result?.win;
                return (
                  <rect key={dir} x={xs} y="16" width={ws} height="106"
                    fill={win ? "#00ff8818" : loss ? "#ef444418" : isSel ? "#00ff8810" : "transparent"}
                    stroke={win ? "#00ff8870" : loss ? "#ef444470" : isSel ? "#00ff8845" : "transparent"}
                    strokeWidth="1.5"
                    style={{ transition: "fill 0.2s, stroke 0.2s" }} />
                );
              })}

              {/* Keeper — SVG silhouette (no emoji) */}
              <motion.g
                animate={{ x: keeperOffset }}
                transition={{ type: "spring", stiffness: 480, damping: 28, delay: result ? 0.1 : 0 }}
              >
                {/* head */}
                <circle cx="160" cy="73" r="10" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
                {/* body */}
                <rect x="150" y="84" width="20" height="26" rx="4" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
                {/* left arm */}
                <rect x="119" y="86" width="33" height="6" rx="3" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
                {/* right arm */}
                <rect x="168" y="86" width="33" height="6" rx="3" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
                {/* shirt number */}
                <text x="160" y="101" textAnchor="middle" fontSize="9" fontFamily="monospace"
                  fontWeight="bold" fill="rgba(0,0,0,0.45)">1</text>
                {/* left leg */}
                <rect x="151" y="110" width="8" height="13" rx="3" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
                {/* right leg */}
                <rect x="161" y="110" width="8" height="13" rx="3" fill={keeperColor}
                  style={{ transition: "fill 0.2s" }} />
              </motion.g>

              {/* Ball — always visible, animates to target on kick */}
              <motion.g
                animate={{ x: ballX - 160, y: ballY - 152 }}
                transition={{
                  duration: kicking ? 0.38 : 0,
                  ease: [0.2, 0.65, 0.35, 1.0],
                }}
              >
                <circle cx="160" cy="152" r="9.5"
                  fill={result?.win ? "#00ff88" : "white"}
                  style={{ transition: "fill 0.25s" }}
                  filter={result?.win ? "url(#pg-ballglow)" : undefined}
                />
                {/* ball inner mark */}
                <circle cx="160" cy="152" r="4.5" fill="rgba(0,0,0,0.28)" />
              </motion.g>

              {/* Penalty spot */}
              <circle cx="160" cy="148" r="2" fill="#ffffff25" />
            </svg>
          </div>

          {/* Result card or zone picker */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key="result"
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className={`w-full max-w-xs text-center px-6 py-4 rounded-2xl border ${
                  result.win
                    ? "border-[#00ff88]/35 bg-[#00ff88]/10"
                    : "border-[#ef4444]/35 bg-[#ef4444]/10"
                }`}>
                <div className={`font-display font-black text-4xl tracking-wide leading-none ${
                  result.win ? "text-[#00ff88]" : "text-[#ef4444]"
                }`}>
                  {result.win ? "GOAL!" : "SAVED!"}
                </div>
                <div className={`text-sm font-mono mt-2 opacity-70 ${
                  result.win ? "text-[#00ff88]" : "text-[#ef4444]"
                }`}>
                  {result.win
                    ? `+${result.winAmount.toFixed(0)} STRIKER @ ${result.multiplier}×`
                    : `Keeper went ${result.keeperDirection}`}
                </div>
              </motion.div>
            ) : (
              <motion.div key="zones"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-3 gap-2 w-full max-w-xs"
              >
                {ZONES.map(({ dir, label }) => (
                  <button key={dir} onClick={() => setSelected(dir)} disabled={kicking}
                    className={`py-3.5 rounded-xl border-2 font-display font-bold text-xs tracking-widest transition-all disabled:opacity-40 ${
                      selected === dir
                        ? "border-[#00ff88] bg-[#00ff88]/15 text-[#00ff88] shadow-[0_0_20px_rgba(0,255,136,0.2)]"
                        : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/65"
                    }`}>
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* History dots */}
          {history.length > 0 && (
            <div className="flex gap-1.5">
              {history.map((w, i) => (
                <div key={i} className={`w-5 h-5 rounded text-[9px] font-mono flex items-center justify-center font-bold ${
                  w ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ef4444]/20 text-[#ef4444]"
                }`}>{w ? "G" : "S"}</div>
              ))}
            </div>
          )}
        </div>

        {/* Bet panel */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-3 pb-4 flex flex-col gap-2.5">
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
          {result ? (
            <Button onClick={handleReset}
              className="h-11 font-display font-bold tracking-widest bg-white/8 hover:bg-white/12 text-white border border-white/10">
              KICK AGAIN
            </Button>
          ) : (
            <Button onClick={handleKick} disabled={!selected || kicking}
              className="h-11 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#060a14] disabled:opacity-20 disabled:bg-white/5 disabled:text-white/20">
              {kicking ? "SHOOTING..." : selected ? `SHOOT ${selected.toUpperCase()}` : "PICK A ZONE"}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
