import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Users, Zap, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Multiplier chart point ───────────────────────────────────────────────────
interface ChartPoint { x: number; y: number; }

const QUICK_BETS = [50, 100, 500, 1000];

// ─── Component ────────────────────────────────────────────────────────────────
export function TheShot() {
  const { token, player } = useAuth();
  const { toast } = useToast();

  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const [wsReady, setWsReady] = useState(false);
  const [round, setRound] = useState<RoundState | null>(null);
  const [bets, setBets] = useState<Map<number, LiveBet>>(new Map());
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [myBet, setMyBet] = useState<{ placed: boolean; cashedOut: boolean; winAmount?: number; multiplier?: number } | null>(null);

  const [betAmount, setBetAmount] = useState<string>("100");
  const [autoCashout, setAutoCashout] = useState<string>("");
  const [waitCountdown, setWaitCountdown] = useState(5);
  const [crashHistory, setCrashHistory] = useState<number[]>([]);

  const startTimeRef = useRef<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // ─── WebSocket Setup ────────────────────────────────────────────────────────
  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

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
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {};
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleEvent = useCallback((event: string, data: unknown) => {
    const d = data as Record<string, unknown>;

    if (event === "round_state") {
      const rs = d as unknown as RoundState;
      setRound(rs);
      setBets(new Map());
      setChartPoints([]);
      startTimeRef.current = rs.startedAt ? new Date(rs.startedAt).getTime() : null;

      if (rs.status === "waiting") {
        setMyBet(null);
        setWaitCountdown(5);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setWaitCountdown(p => Math.max(0, p - 1));
        }, 1000);
      } else if (rs.status === "running") {
        if (countdownRef.current) clearInterval(countdownRef.current);
        startTimeRef.current = rs.startedAt ? new Date(rs.startedAt).getTime() : Date.now();
      }
    }

    if (event === "multiplier") {
      const { multiplier } = d as { multiplier: number; roundId: number };
      setRound(prev => prev ? { ...prev, multiplier } : prev);
      setChartPoints(prev => {
        const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
        const newPts = [...prev, { x: elapsed, y: multiplier }];
        return newPts.slice(-120); // keep last 120 points
      });
    }

    if (event === "bet_placed") {
      const bet = d as unknown as LiveBet;
      setBets(prev => new Map(prev).set(bet.playerId, bet));
    }

    if (event === "player_cashout") {
      const { playerId, multiplier, winAmount, username } = d as { playerId: number; username: string; multiplier: number; winAmount: number; roundId: number };
      setBets(prev => {
        const m = new Map(prev);
        const existing = m.get(playerId);
        if (existing) m.set(playerId, { ...existing, cashoutMultiplier: multiplier, winAmount });
        return m;
      });
    }

    if (event === "round_crashed") {
      const { crashPoint } = d as { crashPoint: number };
      setRound(prev => prev ? { ...prev, status: "crashed", multiplier: crashPoint, crashPoint } : prev);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCrashHistory(prev => [crashPoint, ...prev].slice(0, 10));
    }

    if (event === "bet_accepted") {
      setMyBet({ placed: true, cashedOut: false });
      toast({ title: "Bet placed!", description: "Cash out before the crash!" });
    }

    if (event === "cashout_confirmed") {
      const { winAmount, multiplier } = d as { winAmount: number; multiplier: number };
      setMyBet({ placed: true, cashedOut: true, winAmount, multiplier });
      toast({ title: `Cashed out at ${multiplier.toFixed(2)}x`, description: `Won ${winAmount.toFixed(0)} STRIKER` });
    }

    if (event === "error") {
      toast({ title: "Error", description: (d.message as string), variant: "destructive" });
    }

    if (event === "balance_update") {
      // Will refresh via react-query invalidation; balance shown from auth context
    }
  }, [toast]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleBet = () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) return;
    send({
      type: "place_bet",
      payload: {
        betStriker: amount,
        autoCashout: autoCashout ? parseFloat(autoCashout) : undefined,
      },
    });
  };

  const handleCashout = () => {
    send({ type: "cashout" });
  };

  // ─── Chart SVG path ─────────────────────────────────────────────────────────
  const chartPath = () => {
    if (chartPoints.length < 2) return "";
    const W = 340, H = 160;
    const maxX = Math.max(...chartPoints.map(p => p.x), 1);
    const maxY = Math.max(...chartPoints.map(p => p.y), 2);
    const pts = chartPoints.map(p => ({
      sx: (p.x / maxX) * W,
      sy: H - (p.y / maxY) * H,
    }));
    return ["M", pts[0].sx, pts[0].sy, ...pts.slice(1).flatMap(p => ["L", p.sx.toFixed(1), p.sy.toFixed(1)])].join(" ");
  };

  const isWaiting = round?.status === "waiting";
  const isRunning = round?.status === "running";
  const isCrashed = round?.status === "crashed";
  const hasBet = myBet?.placed && !myBet.cashedOut;
  const mult = round?.multiplier ?? 1.0;
  const multColor = isCrashed ? "#ef4444" : mult >= 5 ? "#f59e0b" : mult >= 2 ? "#22c55e" : "#00ff88";

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-hidden bg-[#0a0e1a]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#00ff88]" />
            <span className="font-display font-bold text-sm tracking-widest text-white">THE SHOT</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Users className="w-3 h-3" />
            <span>{round?.activePlayers ?? 0}</span>
            <span className={`ml-2 w-1.5 h-1.5 rounded-full ${wsReady ? "bg-[#00ff88]" : "bg-white/20"} animate-pulse`} />
          </div>
        </div>

        {/* ── Crash Display ── */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-4 min-h-0">

          {/* SVG chart (running only) */}
          {isRunning && chartPoints.length > 1 && (
            <svg ref={chartRef} viewBox="0 0 340 160" className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={chartPath()} fill="none" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" />
              <path d={`${chartPath()} L340,160 L0,160 Z`} fill="url(#chartGrad)" />
            </svg>
          )}

          {/* Multiplier */}
          <AnimatePresence mode="wait">
            {isWaiting && (
              <motion.div key="waiting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-white/40">
                  <Clock className="w-4 h-4" />
                  <span className="font-display font-bold text-sm tracking-widest uppercase">Next Round In</span>
                </div>
                <div className="font-display font-black text-7xl text-white/60">{waitCountdown}s</div>
              </motion.div>
            )}

            {isRunning && (
              <motion.div key="running" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-1">
                <motion.div
                  className="font-display font-black tabular-nums leading-none"
                  style={{ fontSize: "clamp(64px,18vw,96px)", color: multColor, textShadow: `0 0 40px ${multColor}88` }}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                >
                  {mult.toFixed(2)}x
                </motion.div>
                <div className="text-xs font-mono text-white/30 uppercase tracking-widest">flying</div>
              </motion.div>
            )}

            {isCrashed && (
              <motion.div key="crashed" initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2">
                <motion.div
                  className="font-display font-black text-[#ef4444] tabular-nums leading-none"
                  style={{ fontSize: "clamp(56px,16vw,84px)", textShadow: "0 0 60px #ef444488" }}
                >
                  {round?.crashPoint?.toFixed(2)}x
                </motion.div>
                <div className="text-sm font-mono uppercase tracking-widest text-[#ef4444]/60">crashed</div>

                {myBet?.cashedOut && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-lg px-4 py-2 text-center">
                    <div className="text-[#00ff88] font-bold text-sm">+{myBet.winAmount?.toFixed(0)} STRIKER at {myBet.multiplier?.toFixed(2)}x</div>
                  </motion.div>
                )}
                {myBet?.placed && !myBet.cashedOut && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg px-4 py-2">
                    <div className="text-[#ef4444] font-bold text-sm text-center">Crashed out</div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Crash history */}
          {crashHistory.length > 0 && (
            <div className="absolute bottom-2 left-4 right-4 flex gap-1.5 flex-wrap justify-center">
              {crashHistory.map((cp, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: cp < 2 ? "#ef444420" : cp < 5 ? "#22c55e20" : "#f59e0b20",
                    color: cp < 2 ? "#ef4444" : cp < 5 ? "#22c55e" : "#f59e0b",
                  }}
                >
                  {cp.toFixed(2)}x
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Live Bets List ── */}
        {bets.size > 0 && (
          <div className="px-4 mb-2 max-h-24 overflow-y-auto">
            <div className="flex gap-1.5 flex-wrap">
              {Array.from(bets.values()).map(bet => (
                <div
                  key={bet.playerId}
                  className={`text-[10px] font-mono px-2 py-1 rounded-full border ${bet.cashoutMultiplier ? "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]" : "border-white/10 bg-white/5 text-white/50"}`}
                >
                  {bet.username} {bet.cashoutMultiplier ? `✓${bet.cashoutMultiplier.toFixed(2)}x` : `${bet.betStriker.toFixed(0)}S`}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bet Panel ── */}
        <div className="border-t border-white/5 bg-[#0d1117] px-4 pt-3 pb-safe pb-4 flex flex-col gap-3">

          {/* Quick bet buttons */}
          <div className="flex gap-2">
            {QUICK_BETS.map(q => (
              <button
                key={q}
                onClick={() => setBetAmount(String(q))}
                className={`flex-1 text-xs font-mono py-1.5 rounded border transition-all ${betAmount === String(q) ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10" : "border-white/10 text-white/40 hover:border-white/30"}`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Bet + auto-cashout inputs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/30 font-mono uppercase tracking-wider block mb-1">Bet (STRIKER)</label>
              <Input
                type="number"
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-9 text-sm"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-[10px] text-white/30 font-mono uppercase tracking-wider block mb-1">Auto Cashout</label>
              <Input
                type="number"
                step="0.1"
                placeholder="2.00"
                value={autoCashout}
                onChange={e => setAutoCashout(e.target.value)}
                className="bg-white/5 border-white/10 text-white/70 font-mono h-9 text-sm"
                disabled={isRunning}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleBet}
              disabled={!isWaiting || myBet?.placed || !wsReady}
              className="h-11 font-display font-bold tracking-widest text-sm bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30"
            >
              <Zap className="w-4 h-4 mr-1" />
              {myBet?.placed ? "BET PLACED" : "PLACE BET"}
            </Button>

            <motion.div
              animate={hasBet && isRunning ? { scale: [1, 1.04, 1] } : {}}
              transition={{ repeat: Infinity, duration: 0.8 }}
            >
              <Button
                onClick={handleCashout}
                disabled={!hasBet || !isRunning}
                className="w-full h-11 font-display font-bold tracking-widest text-sm bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a] disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30"
              >
                CASHOUT {hasBet && isRunning ? `${mult.toFixed(2)}x` : ""}
              </Button>
            </motion.div>
          </div>

          {/* Balance */}
          <div className="text-center text-[10px] font-mono text-white/20">
            Balance: <span className="text-white/50">{(player as Record<string,unknown>)?.strikerBalance?.toLocaleString?.() ?? "—"} STRIKER</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
