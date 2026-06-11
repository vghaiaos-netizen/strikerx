import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Users, Zap, Clock, Target } from "lucide-react";
import { soundManager } from "@/lib/sound";

type RoundStatus = "waiting" | "running" | "crashed";

interface RoundState {
  id: number;
  status: RoundStatus;
  multiplier: number;
  crashPoint: number | null;
  startedAt: string | null;
  waitingStartedAt: string | null;
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

  // Static particle config (outside component — never recreated)
const PARTICLES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  left: `${((i / 48) * 100 + (i % 3) * 2).toFixed(1)}%`,
  w: (i % 5) + 1,
  baseDur: 2.1 + (i % 5) * 0.38,
  delay: -((i * 0.31) % 2.8),
  opacity: 0.04 + (i % 4) * 0.02,
  gold: i % 7 === 0,
  shape: i % 3 === 0 ? ("square" as const) : ("circle" as const),
  dx: (i % 7) - 3,
}));

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
  const queryClient = useQueryClient();

  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ w: 340, h: 200 });

  const [wsReady, setWsReady] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsFailedPermanently, setWsFailedPermanently] = useState(false);
  const reconnectAttempts = useRef(0);
  const [round, setRound] = useState<RoundState | null>(null);
  const [bets, setBets] = useState<Map<number, LiveBet>>(new Map());
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [myBet, setMyBet] = useState<{ placed: boolean; cashedOut: boolean; winAmount?: number; multiplier?: number } | null>(null);

  const [betAmount, setBetAmount] = useState("100");
  const [autoCashout, setAutoCashout] = useState("");
  const [waitCountdown, setWaitCountdown] = useState(8);
  const [wsAuthed, setWsAuthed] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [crashHistory, setCrashHistory] = useState<number[]>([]);
  const [crashFlash, setCrashFlash] = useState(false);

  // Milestone tracking
  const milestonesHitRef = useRef<Set<number>>(new Set());
  const [activeMilestone, setActiveMilestone] = useState<number | null>(null);

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
      setCrashFlash(false);
      startTimeRef.current = rs.startedAt ? new Date(rs.startedAt).getTime() : null;

      if (rs.status === "waiting") {
        setMyBet(null);
        milestonesHitRef.current = new Set();
        setActiveMilestone(null);
        if (countdownRef.current) clearInterval(countdownRef.current);
        const WAIT_DURATION = 8;
        const elapsed = rs.waitingStartedAt
          ? (Date.now() - new Date(rs.waitingStartedAt).getTime()) / 1000
          : 0;
        const remaining = Math.max(1, Math.ceil(WAIT_DURATION - elapsed));
        setWaitCountdown(remaining);
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
      const { playerId, multiplier, winAmount } = d as { playerId: number; multiplier: number; winAmount: number };
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
      setCrashFlash(true);
      setTimeout(() => setCrashFlash(false), 600);
      soundManager.play("crash");
    }

    if (event === "bet_accepted") {
      setMyBet({ placed: true, cashedOut: false });
      toast({ title: "Bet placed!", description: "Cash out before the crash!" });
      soundManager.play("bet_placed");
    }

    if (event === "cashout_confirmed") {
      const { winAmount, multiplier } = d as { winAmount: number; multiplier: number };
      setMyBet({ placed: true, cashedOut: true, winAmount, multiplier });
      toast({ title: `Cashed out at ${multiplier.toFixed(2)}x`, description: `+${winAmount.toFixed(0)} STRIKER` });
      soundManager.play("cashout");
    }

    if (event === "balance_update") {
      const { strikerBalance } = d as { strikerBalance: number | string };
      setLiveBalance(parseFloat(String(strikerBalance)));
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    }

    if (event === "auth_ok") { setWsAuthed(true); return; }

    if (event === "error") toast({ title: "Error", description: d.message as string, variant: "destructive" });
  }, [toast]);

  // Keep a ref to the latest token so the WS reconnect can always send current auth
  // without the effect needing to re-run (which would create a new connection).
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Send auth immediately if the WS is already open when the token arrives
  useEffect(() => {
    if (token && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "auth", token }));
    }
  }, [token]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws`;
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const MAX_RECONNECT = 8;

    const connect = () => {
      if (destroyed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        reconnectAttempts.current = 0;
        setWsReady(true);
        setWsReconnecting(false);
        setWsFailedPermanently(false);
        if (tokenRef.current) ws.send(JSON.stringify({ type: "auth", token: tokenRef.current }));
      };
      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data) as { event: string; data: unknown };
          handleEvent(event, data);
        } catch {}
      };
      ws.onclose = () => {
        setWsReady(false);
        setWsAuthed(false);
        if (!destroyed) {
          reconnectAttempts.current += 1;
          if (reconnectAttempts.current >= MAX_RECONNECT) {
            setWsFailedPermanently(true);
            setWsReconnecting(false);
          } else {
            setWsReconnecting(true);
            const delay = Math.min(8000, 1000 * 2 ** (reconnectAttempts.current - 1));
            reconnectTimer = setTimeout(connect, delay);
          }
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleEvent]);

  const roundStatus = round?.status;
  const currentMult = round?.multiplier ?? 1.0;

  // Milestone detection (runs on every render while running — intentional)
  useEffect(() => {
    if (roundStatus !== "running") return;
    const milestones = [2, 5, 10];
    for (const m of milestones) {
      if (currentMult >= m && !milestonesHitRef.current.has(m)) {
        milestonesHitRef.current.add(m);
        setActiveMilestone(m);
        const t = setTimeout(() => setActiveMilestone(null), 750);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  });

  // Accelerating heartbeat tick — faster and higher pitch as multiplier climbs
  useEffect(() => {
    if (roundStatus !== "running") return;
    // Interval (ms): 2000ms at 1x → 400ms at 5x → 150ms above 10x
    const intervalMs = Math.max(150, 2000 / Math.max(1, currentMult));
    const id = setInterval(() => {
      soundManager.playTick(currentMult);
    }, intervalMs);
    return () => clearInterval(id);
  });

  // Particle CSS keyframe injection
  useEffect(() => {
    if (roundStatus !== "running") return;
    const styleId = "shot-particles-keyframe";
    let el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = `
      @keyframes pRise {
        0%   { transform: translate(0px, 0px);    opacity: 0; }
        8%   { opacity: var(--p-op); }
        92%  { opacity: var(--p-op); }
        100% { transform: translate(calc(var(--p-dx) * 1px * ${chartSize.w / 100}), -${chartSize.h + 50}px); opacity: 0; }
      }
    `;
    return () => {
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
    };
  }, [roundStatus, chartSize.h]);

  const handleBet = () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) return;
    send({ type: "place_bet", payload: { betStriker: amount, autoCashout: autoCashout ? parseFloat(autoCashout) : undefined } });
  };

  const handleCashout = () => send({ type: "cashout" });

  // ── Chart geometry ────────────────────────────────────────────────────────────
  const PAD = { left: 32, right: 10, top: 12, bottom: 12 };

  const buildChart = () => {
    if (chartPoints.length < 2) return { line: "", fill: "", rocketX: null, rocketY: null, refLines: [] as { y: number; label: string; color: string }[] };
    const W = chartSize.w, H = chartSize.h;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const maxX = Math.max(...chartPoints.map(p => p.x), 1);
    const maxY = Math.max(...chartPoints.map(p => p.y), 2) * 1.15;

    const toSvg = (p: ChartPoint) => ({
      sx: PAD.left + (p.x / maxX) * innerW,
      sy: PAD.top + innerH - ((p.y - 1) / (maxY - 1)) * innerH,
    });

    const pts = chartPoints.map(toSvg);
    let d = `M ${pts[0].sx.toFixed(1)} ${pts[0].sy.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cpx = (prev.sx + curr.sx) / 2;
      d += ` C ${cpx.toFixed(1)} ${prev.sy.toFixed(1)} ${cpx.toFixed(1)} ${curr.sy.toFixed(1)} ${curr.sx.toFixed(1)} ${curr.sy.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    const fill = `${d} L ${last.sx.toFixed(1)} ${PAD.top + innerH} L ${pts[0].sx.toFixed(1)} ${PAD.top + innerH} Z`;

    const refTargets = [
      { val: 2, label: "2×", color: "#22c55e" },
      { val: 5, label: "5×", color: "#f97316" },
      { val: 10, label: "10×", color: "#f59e0b" },
    ];
    const refLines = refTargets
      .filter(r => r.val < maxY * 0.95)
      .map(r => ({
        y: PAD.top + innerH - ((r.val - 1) / (maxY - 1)) * innerH,
        label: r.label,
        color: r.color,
      }));

    return { line: d, fill, rocketX: last.sx, rocketY: last.sy, refLines };
  };

  const autoCashoutLineY = () => {
    if (!autoCashout || chartPoints.length < 2) return null;
    const target = parseFloat(autoCashout);
    if (!target || target < 1.01) return null;
    const maxY = Math.max(...chartPoints.map(p => p.y), target, 2) * 1.15;
    const innerH = chartSize.h - PAD.top - PAD.bottom;
    return PAD.top + innerH - ((target - 1) / (maxY - 1)) * innerH;
  };

  const isWaiting = round?.status === "waiting";
  const isRunning = round?.status === "running";
  const isCrashed = round?.status === "crashed";
  const hasBet = !!myBet?.placed && !myBet.cashedOut;
  const mult = round?.multiplier ?? 1.0;
  const color = getCrashColor(mult, isCrashed);
  const { line, fill, rocketX, rocketY, refLines } = buildChart();
  const autoY = autoCashoutLineY();
  const betArr = Array.from(bets.values());
  const cashedOutBets = betArr.filter(b => b.cashoutMultiplier);
  const activeBets = betArr.filter(b => !b.cashoutMultiplier);
  const playerBalance = liveBalance ?? Number((player as Record<string, unknown>)?.strikerBalance ?? 0);

  const pulseDuration = mult >= 10 ? 0.22 : mult >= 5 ? 0.4 : 0.68;
  const speedFactor = useMemo(() => mult >= 10 ? 3.8 : mult >= 5 ? 2.4 : mult >= 2 ? 1.55 : 1, [mult]);

  const ringR = 36;
  const ringCirc = 2 * Math.PI * ringR;
  const ringProgress = waitCountdown / 8;

  return (
    <Layout>
      {/* Crash flash overlay */}
      <AnimatePresence>
        {crashFlash && (
          <motion.div key="flash"
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ background: "radial-gradient(ellipse at center, #ef444444 0%, #ef444400 70%)" }} />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-hidden bg-[#060a14]">

        {/* Reconnecting / Failed banner */}
        <AnimatePresence>
          {wsFailedPermanently && (
            <motion.div key="ws-failed"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="bg-[#ef4444]/15 border-b border-[#ef4444]/30 px-4 py-2 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] font-mono text-[#ef4444]">Connection lost — refresh to reconnect</span>
              <button onClick={() => { reconnectAttempts.current = 0; setWsFailedPermanently(false); setWsReconnecting(true); wsRef.current?.close(); }}
                className="text-[10px] font-mono text-[#ef4444]/70 underline hover:text-[#ef4444]">Retry</button>
            </motion.div>
          )}
          {wsReconnecting && !wsFailedPermanently && (
            <motion.div key="ws-reconnecting"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="bg-[#f59e0b]/10 border-b border-[#f59e0b]/20 px-4 py-1.5 flex items-center gap-2 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-[10px] font-mono text-[#f59e0b]">Reconnecting… attempt {reconnectAttempts.current}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
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
            <div className={`flex items-center gap-1.5 text-[10px] ${wsReady ? "text-[#00ff88]" : wsReconnecting ? "text-[#f59e0b]" : "text-white/20"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsReady ? "bg-[#00ff88] animate-pulse" : wsReconnecting ? "bg-[#f59e0b] animate-pulse" : "bg-white/15"}`} />
              {wsReady ? "live" : wsReconnecting ? "reconnecting" : "offline"}
            </div>
          </div>
        </div>

        {/* Crash History */}
        {crashHistory.length > 0 && (
          <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto border-b border-white/4 flex-shrink-0 [scrollbar-width:none]">
            {crashHistory.map((cp, i) => <HistoryPill key={i} value={cp} />)}
          </div>
        )}

        {/* Chart */}
        <div className="relative flex-1 min-h-0" ref={chartRef}>

          {/* Stadium Backdrop */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" style={{ opacity: 0.12 }}>
            <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
              <rect x="0" y="195" width="400" height="5" fill="#00ff88" /> {/* Pitch line */}
              <g fill="#ffffff">
                {Array.from({ length: 20 }).map((_, i) => (
                  <path key={i} d={`M ${i * 20} 200 Q ${i * 20 + 10} 180 ${i * 20 + 20} 200`} />
                ))}
              </g>
            </svg>
          </div>

          {/* SVG */}
          <svg width={chartSize.w} height={chartSize.h}
            viewBox={`0 0 ${chartSize.w} ${chartSize.h}`}
            className="absolute inset-0"
            style={{ opacity: isWaiting ? 0.1 : 1, transition: "opacity 0.5s" }}>
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="rocketGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="rocketPulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Reference lines */}
            {refLines.map((rl) => (
              <g key={rl.label}>
                <line x1={PAD.left} y1={rl.y} x2={chartSize.w - PAD.right} y2={rl.y}
                  stroke={rl.color} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 5" />
                <text x={4} y={rl.y + 4} fill={rl.color} fontSize="9" fontFamily="monospace" opacity="0.5">
                  {rl.label}
                </text>
              </g>
            ))}

            {/* Auto-cashout line */}
            {autoY !== null && isRunning && (
              <>
                <line x1={PAD.left} y1={autoY} x2={chartSize.w - PAD.right} y2={autoY}
                  stroke="#f59e0b" strokeOpacity="0.65" strokeWidth="1" strokeDasharray="5 4" />
                <rect x={PAD.left + 4} y={autoY - 12} width={66} height={13} rx={3} fill="#0a0e1a" fillOpacity="0.9" />
                <text x={PAD.left + 7} y={autoY - 2} fill="#f59e0b" fontSize="9" fontFamily="monospace" opacity="0.9">
                  auto {parseFloat(autoCashout).toFixed(2)}x
                </text>
              </>
            )}

            {fill && <path d={fill} fill="url(#chartFill)" />}
            {line && (
              <>
                <path d={line} fill="none" stroke={color} strokeWidth="8"
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity="0.15" />
                <path d={line} fill="none" stroke={color} strokeWidth="3.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  filter="url(#glow)"
                  style={{ transition: isCrashed ? "none" : "stroke 0.3s" }} />
              </>
            )}

            {/* Rocket dot */}
            {rocketX !== null && rocketY !== null && isRunning && (
              <g transform={`translate(${rocketX}, ${rocketY})`}>
                <circle cx="0" cy="0" r="16" fill="url(#rocketPulse)" />
                <g transform="rotate(-15) translate(-8, -8)">
                  <path
                    d="M15.5 2.5C15.5 2.5 14.5 1.5 12.5 1.5C10.5 1.5 8.5 3.5 7.5 5.5C6.5 7.5 6.5 10.5 6.5 10.5L1.5 13.5L4.5 14.5L5.5 19.5L8.5 14.5C8.5 14.5 11.5 14.5 13.5 13.5C15.5 12.5 17.5 10.5 17.5 8.5C17.5 6.5 16.5 5.5 15.5 2.5Z"
                    fill={color}
                    filter="url(#rocketGlow)"
                  />
                  <path
                    d="M12.5 5.5C12.5 6.60457 11.6046 7.5 10.5 7.5C9.39543 7.5 8.5 6.60457 8.5 5.5C8.5 4.39543 9.39543 3.5 10.5 3.5C11.6046 3.5 12.5 4.39543 12.5 5.5Z"
                    fill="white"
                    opacity="0.9"
                  />
                  {/* Flame */}
                  <motion.path
                    d="M6.5 10.5L3.5 15.5L6.5 13.5L9.5 15.5L6.5 10.5Z"
                    fill="#f59e0b"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 0.2 }}
                  />
                </g>
              </g>
            )}

            {/* Crashed X */}
            {rocketX !== null && rocketY !== null && isCrashed && (
              <g>
                <circle cx={rocketX} cy={rocketY} r="12" fill="#ef444428" />
                <line x1={rocketX - 6} y1={rocketY - 6} x2={rocketX + 6} y2={rocketY + 6} stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
                <line x1={rocketX + 6} y1={rocketY - 6} x2={rocketX - 6} y2={rocketY + 6} stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            )}
          </svg>

          {/* Particle field — only while running */}
          {isRunning && PARTICLES.map(p => (
            <div key={p.id} style={{
              position: "absolute",
              bottom: 0,
              left: p.left,
              width: `${p.w}px`,
              height: `${p.w}px`,
              borderRadius: "50%",
              background: p.gold && mult >= 5 ? "#f59e0b" : color,
              "--p-op": String(p.opacity),
              animationName: "pRise",
              animationDuration: `${p.baseDur / speedFactor}s`,
              animationDelay: `${p.delay}s`,
              animationIterationCount: "infinite",
              animationTimingFunction: "linear",
              pointerEvents: "none",
              opacity: 0,
            } as React.CSSProperties} />
          ))}

          {/* Milestone expanding ring */}
          <AnimatePresence>
            {activeMilestone && (
              <motion.div key={activeMilestone}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <motion.div
                  className="rounded-full border-2"
                  style={{ borderColor: getCrashColor(activeMilestone, false) }}
                  initial={{ width: 48, height: 48, opacity: 1 }}
                  animate={{ width: 260, height: 260, opacity: 0 }}
                  transition={{ duration: 0.65, ease: "easeOut" }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Multiplier overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <AnimatePresence mode="wait">

              {isWaiting && (
                <motion.div key="waiting"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                    <svg width="96" height="96" className="absolute inset-0 -rotate-90">
                      <circle cx="48" cy="48" r={ringR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle cx="48" cy="48" r={ringR} fill="none"
                        stroke="#00ff88" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={ringCirc}
                        strokeDashoffset={ringCirc * (1 - ringProgress)}
                        style={{ transition: "stroke-dashoffset 0.9s linear" }} />
                    </svg>
                  <div className="relative flex flex-col items-center">
                    <div className="absolute inset-0 z-[-1] opacity-10">
                      <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="0.5">
                        <rect x="5" y="5" width="90" height="90" rx="2" />
                        <line x1="50" y1="5" x2="50" y2="95" />
                        <circle cx="50" cy="50" r="15" />
                        <circle cx="50" cy="5" r="10" clipPath="inset(0 0 50% 0)" />
                        <circle cx="50" cy="95" r="10" clipPath="inset(50% 0 0 0)" />
                      </svg>
                    </div>
                    <span className="font-display font-black text-white tabular-nums leading-none" style={{ fontSize: 38 }}>
                      {waitCountdown}
                    </span>
                    <span className="text-[9px] font-mono tracking-[0.25em] text-white/25 uppercase -mt-0.5">sec</span>
                  </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/25">
                    <Clock className="w-3 h-3" />
                    <span className="font-mono text-[9px] tracking-[0.25em] uppercase">Next Round</span>
                  </div>
                  <motion.div animate={{ opacity: [0.25, 0.65, 0.25] }} transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-[9px] font-mono tracking-[0.3em] text-[#00ff88]/40 uppercase">
                    Place your bet
                  </motion.div>
                </motion.div>
              )}

              {isRunning && (
                <motion.div key="running"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-1"
                >
                  <motion.div
                    className="font-display font-black tabular-nums leading-none"
                    style={{
                      fontSize: `clamp(76px, ${76 + (mult - 1) * 2}px, 120px)`,
                      color,
                      textShadow: `0 0 80px ${color}88, 0 0 40px ${color}44`,
                      transition: "color 0.3s, text-shadow 0.3s",
                    }}
                    animate={activeMilestone
                      ? { scale: [1, 1.18, 1] }
                      : mult >= 5
                        ? { scale: [1, 1.04, 1] }
                        : {}}
                    transition={{ repeat: activeMilestone ? 0 : Infinity, duration: activeMilestone ? 0.4 : pulseDuration }}
                  >
                    {mult.toFixed(2)}x
                  </motion.div>
                  {hasBet && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-0.5">
                      <span className="text-sm font-mono font-bold" style={{ color }}>
                        +{(parseFloat(betAmount || "0") * mult).toFixed(0)} STRIKER
                      </span>
                      <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">potential win</span>
                    </motion.div>
                  )}
                  <div className="text-[9px] font-mono tracking-[0.3em] text-white/15 uppercase mt-0.5">flying</div>
                </motion.div>
              )}

              {isCrashed && (
                <motion.div key="crashed"
                  initial={{ scale: 1.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center gap-2"
                >
                  <motion.div
                    className="font-display font-black text-[#ef4444] tabular-nums leading-none"
                    style={{ fontSize: "clamp(64px,19vw,96px)", textShadow: "0 0 70px #ef444466, 0 0 120px #ef444422" }}
                    animate={{ x: [-5, 5, -4, 4, -2, 2, 0] }}
                    transition={{ duration: 0.42 }}
                  >
                    {round?.crashPoint?.toFixed(2)}x
                  </motion.div>
                  <div className="text-sm font-mono uppercase tracking-[0.35em] text-[#ef4444]/55">crashed</div>

                  <AnimatePresence>
                    {myBet?.cashedOut && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-1 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl px-5 py-2.5 text-center">
                        <div className="text-[#00ff88] font-bold text-sm">+{myBet.winAmount?.toFixed(0)} STRIKER</div>
                        <div className="text-[#00ff88]/50 text-[10px] font-mono mt-0.5">cashed at {myBet.multiplier?.toFixed(2)}x</div>
                      </motion.div>
                    )}
                    {myBet?.placed && !myBet.cashedOut && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-1 bg-[#ef4444]/10 border border-[#ef4444]/25 rounded-xl px-5 py-2.5 text-center">
                        <div className="text-[#ef4444] text-sm font-bold">Crashed out</div>
                        <div className="text-[#ef4444]/40 text-[10px] font-mono mt-0.5">
                          -{parseFloat(betAmount || "0").toFixed(0)} STRIKER
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Live Players Strip */}
        {bets.size > 0 && (
          <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto border-t border-white/4 flex-shrink-0 bg-black/20 [scrollbar-width:none]">
            {cashedOutBets.map(b => (
              <span key={b.playerId}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#00ff88]/30 bg-[#00ff88]/8 text-[#00ff88] flex-shrink-0 whitespace-nowrap">
                {b.username} {b.cashoutMultiplier?.toFixed(2)}x
              </span>
            ))}
            {activeBets.map(b => (
              <span key={b.playerId}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/8 bg-white/4 text-white/35 flex-shrink-0 whitespace-nowrap">
                {b.username} {b.betStriker}S
              </span>
            ))}
          </div>
        )}

        {/* Bet Panel */}
        <div className="border-t border-white/5 bg-[#0d1117]/95 px-4 pt-3 pb-4 flex-shrink-0 flex flex-col gap-2.5">
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

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleBet}
              disabled={!isWaiting || !!myBet?.placed || !wsAuthed}
              className="h-11 font-display font-bold tracking-widest text-sm bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#060a14] disabled:opacity-20 disabled:bg-white/5 disabled:text-white/20">
              <Zap className="w-4 h-4 mr-1" />
              {myBet?.placed ? "BET PLACED" : "PLACE BET"}
            </Button>

            <motion.div
              animate={hasBet && isRunning ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: pulseDuration }}
            >
              <Button onClick={handleCashout}
                disabled={!hasBet || !isRunning}
                className="w-full h-11 font-display font-bold tracking-widest text-sm disabled:opacity-20 disabled:bg-white/5 disabled:text-white/20"
                style={hasBet && isRunning
                  ? { background: color, color: "#060a14", boxShadow: `0 0 28px ${color}55` }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)" }
                }>
                {hasBet && isRunning ? `CASHOUT ${mult.toFixed(2)}x` : "CASHOUT"}
              </Button>
            </motion.div>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-white/20">
              Balance: <span className="text-white/35">{playerBalance.toLocaleString()} STRIKER</span>
            </span>
            {hasBet && isRunning && (
              <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.1 }}
                className="text-[#00ff88]/55">
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
