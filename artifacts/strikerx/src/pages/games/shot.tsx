import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Users, Zap, Clock, Target } from "lucide-react";

type RoundStatus = "waiting" | "running" | "crashed";

interface RoundState {
  id: number;
  status: RoundStatus;
  multiplier: number;
  crashPoint: number | null;
  startedAt: string | null;
  activePlayers: number;
}

interface LiveBet {
  playerId: number;
  username: string;
  betStriker: number;
  cashoutMultiplier?: number;
  winAmount?: number;
}

interface ChartPoint { x: number; y: number; }

const QUICK_BETS = [50, 100, 500, 1000];

function getCrashColor(mult: number, crashed: boolean) {
  if (crashed) return "#ef4444";
  if (mult >= 10) return "#f59e0b";
  if (mult >= 5)  return "#f97316";
  if (mult >= 2)  return "#22c55e";
  return "#00ff88";
}

function HistoryPill({ value }: { value: number }) {
  const color = value < 2 ? "#ef4444" : value < 5 ? "#22c55e" : "#f59e0b";
  return (
    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0 border"
      style={{ background: `${color}12`, color, borderColor: `${color}30` }}>
      {value.toFixed(2)}x
    </span>
  );
}

export function TheShot() {
  const { token, player } = useAuth();
  const { toast } = useToast();

  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ w: 340, h: 200 });

  const [wsReady, setWsReady] = useState(false);
  const [round, setRound] = useState<RoundState | null>(null);
  const [bets, setBets] = useState<Map<number, LiveBet>>(new Map());
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [myBet, setMyBet] = useState<{ placed: boolean; cashedOut: boolean; winAmount?: number; multiplier?: number } | null>(null);

  const [betAmount, setBetAmount] = useState("100");
  const [autoCashout, setAutoCashout] = useState("");
  const [waitCountdown, setWaitCountdown] = useState(8);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [crashHistory, setCrashHistory] = useState<number[]>([]);
  const [justCrashed, setJustCrashed] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Responsive chart
  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setChartSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const handleEvent = useCallback((event: string, data: unknown) => {
    const d = data as Record<string, unknown>;

    if (event === "round_state") {
      const rs = d as unknown as RoundState;
      setRound(rs);
      setBets(new Map());
      setChartPoints([]);
      setJustCrashed(false);
      startTimeRef.current = rs.startedAt ? new Date(rs.startedAt).getTime() : null;

      if (rs.status === "waiting") {
        setMyBet(null);
        setWaitCountdown(8);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => setWaitCountdown(p => Math.max(0, p - 1)), 1000);
      } else if (rs.status === "running") {
        if (countdownRef.current) clearInterval(countdownRef.current);
        startTimeRef.current = rs.startedAt ? new Date(rs.startedAt).getTime() : Date.now();
      }
    }

    if (event === "multiplier") {
      const { multiplier } = d as { multiplier: number };
      setRound(prev => prev ? { ...prev, multiplier } : prev);
      setChartPoints(prev => {
        const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
        return [...prev, { x: elapsed, y: multiplier }].slice(-300);
      });
    }

    if (event === "bet_placed") setBets(prev => new Map(prev).set((d as unknown as LiveBet).playerId, d as unknown as LiveBet));

    if (event === "player_cashout") {
      const { playerId, multiplier, winAmount } = d as { playerId: number; multiplier: number; winAmount: number; username: string; roundId: number };
      setBets(prev => {
        const m = new Map(prev);
        const b = m.get(playerId);
        if (b) m.set(playerId, { ...b, cashoutMultiplier: multiplier, winAmount });
        return m;
      });
    }

    if (event === "round_crashed") {
      const { crashPoint } = d as { crashPoint: number };
      setRound(prev => prev ? { ...prev, status: "crashed", multiplier: crashPoint, crashPoint } : prev);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCrashHistory(prev => [crashPoint, ...prev].slice(0, 20));
      setJustCrashed(true);
      setTimeout(() => setJustCrashed(false), 800);
    }

    if (event === "bet_accepted") {
      setMyBet({ placed: true, cashedOut: false });
      toast({ title: "Bet placed!", description: "Cash out before the crash!" });
    }

    if (event === "cashout_confirmed") {
      const { winAmount, multiplier } = d as { winAmount: number; multiplier: number };
      setMyBet({ placed: true, cashedOut: true, winAmount, multiplier });
      toast({ title: `Cashed out at ${multiplier.toFixed(2)}x`, description: `+${winAmount.toFixed(0)} STRIKER` });
    }

    if (event === "balance_update") {
      const { strikerBalance } = d as { strikerBalance: number | string };
      setLiveBalance(parseFloat(String(strikerBalance)));
    }

    if (event === "error") toast({ title: "Error", description: d.message as string, variant: "destructive" });
  }, [toast]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws`;
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsReady(true);
        if (token) ws.send(JSON.stringify({ type: "auth", token }));
      };
      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data) as { event: string; data: unknown };
          handleEvent(event, data);
        } catch {}
      };
      ws.onclose = () => {
        setWsReady(false);
        if (!destroyed) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {};
    };

    connect();
    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (countdownRef.current) clearInterval(countdownRef.current);
      wsRef.current?.close();
    };
  }, [token, handleEvent]);

  const handleBet = () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) return;
    send({ type: "place_bet", payload: { betStriker: amount, autoCashout: autoCashout ? parseFloat(autoCashout) : undefined } });
  };

  const handleCashout = () => send({ type: "cashout" });

  // Build SVG chart path (smooth cubic bezier)
  const buildPath = () => {
    if (chartPoints.length < 2) return { line: "", fill: "" };
    const W = chartSize.w, H = chartSize.h;
    const maxX = Math.max(...chartPoints.map(p => p.x), 1);
    const maxY = Math.max(...chartPoints.map(p => p.y), 2) * 1.1;
    const toS = (p: ChartPoint) => ({
      sx: (p.x / maxX) * (W - 12) + 6,
      sy: H - 10 - ((p.y - 1) / (maxY - 1)) * (H - 24),
    });
    const pts = chartPoints.map(toS);
    let d = `M ${pts[0].sx.toFixed(1)} ${pts[0].sy.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cpx = (prev.sx + curr.sx) / 2;
      d += ` C ${cpx.toFixed(1)} ${prev.sy.toFixed(1)} ${cpx.toFixed(1)} ${curr.sy.toFixed(1)} ${curr.sx.toFixed(1)} ${curr.sy.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    return { line: d, fill: `${d} L ${last.sx.toFixed(1)} ${H} L ${pts[0].sx.toFixed(1)} ${H} Z` };
  };

  const autoCashoutLineY = () => {
    if (!autoCashout || chartPoints.length < 2) return null;
    const target = parseFloat(autoCashout);
    if (!target || target < 1.01) return null;
    const maxY = Math.max(...chartPoints.map(p => p.y), target, 2) * 1.1;
    const H = chartSize.h;
    return H - 10 - ((target - 1) / (maxY - 1)) * (H - 24);
  };

  const isWaiting = round?.status === "waiting";
  const isRunning = round?.status === "running";
  const isCrashed = round?.status === "crashed";
  const hasBet = !!myBet?.placed && !myBet.cashedOut;
  const mult = round?.multiplier ?? 1.0;
  const color = getCrashColor(mult, isCrashed);
  const { line, fill } = buildPath();
  const autoY = autoCashoutLineY();
  const betArr = Array.from(bets.values());
  const cashedOutBets = betArr.filter(b => b.cashoutMultiplier);
  const activeBets = betArr.filter(b => !b.cashoutMultiplier);
  // Use live balance from WS balance_update events; fall back to auth context value
  const playerBalance = liveBalance ?? Number((player as Record<string, unknown>)?.strikerBalance ?? 0);

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-hidden bg-[#060a14]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#00ff88]" />
            <span className="font-display font-bold text-xs tracking-[0.2em] text-white">THE SHOT</span>
          </div>
          <div className="flex items-center gap-3">
            {round?.activePlayers ? (
              <div className="flex items-center gap-1 text-[10px] text-white/35">
                <Users className="w-3 h-3" />
                <span>{round.activePlayers} live</span>
              </div>
            ) : null}
            <div className={`flex items-center gap-1.5 text-[10px] ${wsReady ? "text-[#00ff88]" : "text-white/20"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsReady ? "bg-[#00ff88] animate-pulse" : "bg-white/15"}`} />
              {wsReady ? "live" : "connecting…"}
            </div>
          </div>
        </div>

        {/* ── Crash History ── */}
        {crashHistory.length > 0 && (
          <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto border-b border-white/4 flex-shrink-0 [scrollbar-width:none]">
            {crashHistory.map((cp, i) => <HistoryPill key={i} value={cp} />)}
          </div>
        )}

        {/* ── Chart + Multiplier ── */}
        <div className="relative flex-1 min-h-0" ref={chartRef}>

          {/* Grid + curve */}
          <svg
            width={chartSize.w} height={chartSize.h}
            viewBox={`0 0 ${chartSize.w} ${chartSize.h}`}
            className="absolute inset-0"
            style={{ opacity: isWaiting ? 0.12 : 1, transition: "opacity 0.5s" }}
          >
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="80%" stopColor={color} stopOpacity="0.03" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* subtle grid lines */}
            {[0.25, 0.5, 0.75].map(f => (
              <line key={f}
                x1={0} y1={chartSize.h * f}
                x2={chartSize.w} y2={chartSize.h * f}
                stroke="white" strokeOpacity="0.03" strokeWidth="1" />
            ))}

            {/* auto-cashout target line */}
            {autoY !== null && isRunning && (
              <>
                <line x1={0} y1={autoY} x2={chartSize.w} y2={autoY}
                  stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="5 4" />
                <rect x={6} y={autoY - 11} width={62} height={12} rx={3} fill="#0a0e1a" fillOpacity="0.8" />
                <text x={8} y={autoY - 2} fill="#f59e0b" fontSize="9" fontFamily="monospace" opacity="0.8">
                  auto {parseFloat(autoCashout).toFixed(2)}x
                </text>
              </>
            )}

            {fill && <path d={fill} fill="url(#chartFill)" />}
            {line && (
              <path d={line} fill="none" stroke={color} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                filter="url(#glow)"
                style={{ transition: isCrashed ? "none" : "stroke 0.3s" }} />
            )}
          </svg>

          {/* Multiplier overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <AnimatePresence mode="wait">

              {isWaiting && (
                <motion.div key="waiting"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="flex items-center gap-1.5 text-white/25">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase">Next Round</span>
                  </div>
                  <div className="font-display font-black leading-none text-white/50 tabular-nums"
                    style={{ fontSize: "clamp(72px,20vw,100px)" }}>
                    {waitCountdown}<span className="text-4xl opacity-60">s</span>
                  </div>
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase"
                  >
                    Place your bet
                  </motion.div>
                </motion.div>
              )}

              {isRunning && (
                <motion.div key="running"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <motion.div
                    className="font-display font-black tabular-nums leading-none"
                    style={{
                      fontSize: "clamp(76px,22vw,112px)",
                      color,
                      textShadow: `0 0 60px ${color}44, 0 0 24px ${color}22`,
                      transition: "color 0.3s, text-shadow 0.3s",
                    }}
                    animate={mult >= 5 ? { scale: [1, 1.03, 1] } : {}}
                    transition={{ repeat: Infinity, duration: mult >= 10 ? 0.35 : 0.6 }}
                  >
                    {mult.toFixed(2)}x
                  </motion.div>
                  {hasBet && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-mono font-bold"
                      style={{ color }}
                    >
                      +{(parseFloat(betAmount || "0") * mult).toFixed(0)} STRIKER
                    </motion.div>
                  )}
                  <div className="text-[9px] font-mono tracking-[0.3em] text-white/20 uppercase">flying</div>
                </motion.div>
              )}

              {isCrashed && (
                <motion.div key="crashed"
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18 }}
                  className="flex flex-col items-center gap-2"
                >
                  <motion.div
                    className="font-display font-black text-[#ef4444] tabular-nums leading-none"
                    style={{
                      fontSize: "clamp(64px,19vw,100px)",
                      textShadow: "0 0 70px #ef444466",
                    }}
                    animate={justCrashed ? { x: [-4, 4, -3, 3, -1, 1, 0] } : {}}
                    transition={{ duration: 0.35 }}
                  >
                    {round?.crashPoint?.toFixed(2)}x
                  </motion.div>
                  <div className="text-sm font-mono uppercase tracking-[0.35em] text-[#ef4444]/50">crashed</div>

                  <AnimatePresence>
                    {myBet?.cashedOut && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-1 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl px-4 py-2 text-center">
                        <div className="text-[#00ff88] font-bold text-sm">
                          +{myBet.winAmount?.toFixed(0)} STRIKER at {myBet.multiplier?.toFixed(2)}x
                        </div>
                      </motion.div>
                    )}
                    {myBet?.placed && !myBet.cashedOut && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-1 bg-[#ef4444]/10 border border-[#ef4444]/25 rounded-xl px-4 py-2">
                        <div className="text-[#ef4444] text-sm font-bold text-center">Crashed out</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Live Players Strip ── */}
        {bets.size > 0 && (
          <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto border-t border-white/4 flex-shrink-0 bg-black/20 [scrollbar-width:none]">
            {cashedOutBets.map(b => (
              <span key={b.playerId}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#00ff88]/30 bg-[#00ff88]/8 text-[#00ff88] flex-shrink-0">
                {b.username} {b.cashoutMultiplier?.toFixed(2)}x
              </span>
            ))}
            {activeBets.map(b => (
              <span key={b.playerId}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/8 bg-white/4 text-white/35 flex-shrink-0">
                {b.username} {b.betStriker}S
              </span>
            ))}
          </div>
        )}

        {/* ── Bet Panel ── */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-3 pb-4 flex-shrink-0 flex flex-col gap-2.5">

          {/* Quick bet row */}
          <div className="flex gap-1.5">
            {QUICK_BETS.map(q => (
              <button key={q} onClick={() => setBetAmount(String(q))}
                className={`flex-1 text-[11px] font-mono py-1.5 rounded-lg border transition-all ${betAmount === String(q) ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10" : "border-white/8 text-white/30 hover:border-white/20"}`}>
                {q >= 1000 ? `${q / 1000}k` : q}
              </button>
            ))}
            <button
              onClick={() => setBetAmount(String(Math.max(50, Math.floor(playerBalance / 2))))}
              className="flex-1 text-[11px] font-mono py-1.5 rounded-lg border border-white/8 text-white/30 hover:border-white/20 transition-all">
              ½
            </button>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-white/25 font-mono uppercase tracking-wider block mb-1">Bet (STRIKER)</label>
              <Input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-9 text-sm"
                disabled={isRunning} />
            </div>
            <div>
              <label className="text-[9px] font-mono uppercase tracking-wider block mb-1"
                style={{ color: autoCashout && parseFloat(autoCashout) > 1 ? "#f59e0b" : "rgba(255,255,255,0.25)" }}>
                Auto Cashout {autoCashout && parseFloat(autoCashout) > 1 ? `(${parseFloat(autoCashout).toFixed(2)}x)` : ""}
              </label>
              <Input type="number" step="0.1" placeholder="2.00" value={autoCashout}
                onChange={e => setAutoCashout(e.target.value)}
                className="bg-white/5 border-white/10 text-white/70 font-mono h-9 text-sm"
                disabled={isRunning} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleBet}
              disabled={!isWaiting || !!myBet?.placed || !wsReady}
              className="h-11 font-display font-bold tracking-widest text-sm bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#060a14] disabled:opacity-20 disabled:bg-white/5 disabled:text-white/20">
              <Zap className="w-4 h-4 mr-1" />
              {myBet?.placed ? "BET PLACED" : "PLACE BET"}
            </Button>

            <motion.div
              animate={hasBet && isRunning ? { scale: [1, 1.04, 1] } : {}}
              transition={{ repeat: Infinity, duration: 0.7 }}
            >
              <Button onClick={handleCashout}
                disabled={!hasBet || !isRunning}
                className="w-full h-11 font-display font-bold tracking-widest text-sm disabled:opacity-20 disabled:bg-white/5 disabled:text-white/20"
                style={hasBet && isRunning
                  ? { background: color, color: "#060a14", boxShadow: `0 0 24px ${color}44` }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)" }
                }>
                {hasBet && isRunning ? `CASHOUT ${mult.toFixed(2)}x` : "CASHOUT"}
              </Button>
            </motion.div>
          </div>

          {/* Balance + auto-cashout note */}
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-white/20">
              Balance: <span className="text-white/35">{playerBalance.toLocaleString()} STRIKER</span>
            </span>
            {hasBet && isRunning && (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="text-[#00ff88]/60"
              >
                <Target className="w-2.5 h-2.5 inline mr-1" />
                Tap CASHOUT to lock in
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
