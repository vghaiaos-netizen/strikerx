import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useGetMyTransactions } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownLeft, ArrowUpRight, Zap, Gift, Trophy,
  Clock, CheckCircle, XCircle, Copy, ReceiptText,
  TrendingUp, TrendingDown, Target, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
type TxTab    = "all" | "deposits" | "withdrawals";
type DateFilter = "today" | "7d" | "30d" | "all";

type TxRow = {
  id: number;
  type: "deposit" | "withdrawal" | "bet" | "win" | "bonus" | "cashback" | "referral";
  amountStriker: number;
  amountTon?: number | null;
  currency?: string | null;
  status: "pending" | "completed" | "failed" | "cancelled";
  externalId?: string | null;
  createdAt: string;
};

const TYPE_META: Record<TxRow["type"], { label: string; color: string; icon: typeof ArrowDownLeft }> = {
  deposit:    { label: "Deposit",    color: "#00ff88", icon: ArrowDownLeft  },
  withdrawal: { label: "Withdrawal", color: "#f59e0b", icon: ArrowUpRight   },
  bet:        { label: "Trade",      color: "#6b7280", icon: Zap            },
  win:        { label: "Win",        color: "#22c55e", icon: Trophy         },
  bonus:      { label: "Bonus",      color: "#a855f7", icon: Gift           },
  cashback:   { label: "Cashback",   color: "#3b82f6", icon: Gift           },
  referral:   { label: "Referral",   color: "#f59e0b", icon: Gift           },
};

const STATUS_META: Record<TxRow["status"], { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: "Pending",   color: "#f59e0b", icon: Clock       },
  completed: { label: "Done",      color: "#22c55e", icon: CheckCircle },
  failed:    { label: "Failed",    color: "#ef4444", icon: XCircle     },
  cancelled: { label: "Cancelled", color: "#6b7280", icon: XCircle     },
};

// ─── TxCard ───────────────────────────────────────────────────────────────────
function TxCard({ tx }: { tx: TxRow }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const meta       = TYPE_META[tx.type]    ?? TYPE_META.bonus;
  const statusMeta = STATUS_META[tx.status] ?? STATUS_META.pending;
  const Icon       = meta.icon;
  const StatusIcon = statusMeta.icon;

  const isPositive = ["deposit", "win", "bonus", "cashback", "referral"].includes(tx.type);
  const hasTon     = (tx.amountTon ?? 0) > 0;
  const amtNum     = hasTon ? Number(tx.amountTon) : Number(tx.amountStriker);
  const amtUnit    = hasTon ? (tx.currency ?? "TON") : "SKR";
  const amtDecimals = hasTon ? 4 : 0;
  const amtStr     = `${isPositive ? "+" : "-"}${amtNum.toLocaleString(undefined, { minimumFractionDigits: amtDecimals, maximumFractionDigits: amtDecimals })} ${amtUnit}`;

  const isPending = tx.status === "pending";
  const date      = new Date(tx.createdAt);
  const timeStr   = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const handleCopyId = () => {
    if (!tx.externalId) return;
    navigator.clipboard.writeText(tx.externalId).catch(() => {});
    toast({ title: "Copied to clipboard" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border overflow-hidden transition-all ${
        isPending
          ? "bg-[#f59e0b]/4 border-[#f59e0b]/20"
          : "bg-white/2 border-white/6"
      }`}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Icon */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>

        {/* Middle */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white">{meta.label}</span>
            <span
              className="flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: statusMeta.color, background: `${statusMeta.color}15` }}
            >
              {isPending && <span className="w-1 h-1 rounded-full mr-0.5 animate-pulse" style={{ background: statusMeta.color }} />}
              <StatusIcon className="w-2.5 h-2.5" />
              {statusMeta.label}
            </span>
          </div>
          <div className="text-[9px] font-mono text-white/30 mt-0.5">{timeStr}</div>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`font-mono font-black text-sm tabular-nums ${isPositive ? "text-[#00ff88]" : "text-white/60"}`}>
            {amtStr}
          </span>
          <ChevronDown className={`w-3 h-3 text-white/20 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 flex flex-col gap-1.5 border-t border-white/5">
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <div className="bg-white/3 rounded-lg p-2">
                  <div className="text-[8px] font-mono text-white/25 uppercase mb-0.5">Type</div>
                  <div className="text-[10px] font-mono text-white">{meta.label}</div>
                </div>
                <div className="bg-white/3 rounded-lg p-2">
                  <div className="text-[8px] font-mono text-white/25 uppercase mb-0.5">Status</div>
                  <div className="text-[10px] font-mono" style={{ color: statusMeta.color }}>{statusMeta.label}</div>
                </div>
                {hasTon && (
                  <div className="bg-white/3 rounded-lg p-2">
                    <div className="text-[8px] font-mono text-white/25 uppercase mb-0.5">Currency</div>
                    <div className="text-[10px] font-mono text-white">{tx.currency ?? "TON"}</div>
                  </div>
                )}
                <div className="bg-white/3 rounded-lg p-2">
                  <div className="text-[8px] font-mono text-white/25 uppercase mb-0.5">Date</div>
                  <div className="text-[10px] font-mono text-white">{date.toLocaleDateString()}</div>
                </div>
              </div>

              {tx.externalId && (
                <div className="flex items-center gap-2 bg-white/3 rounded-lg px-2.5 py-2">
                  <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider shrink-0">ID</span>
                  <span className="text-[9px] font-mono text-white/55 flex-1 truncate">{tx.externalId}</span>
                  <button onClick={handleCopyId} className="shrink-0 text-white/25 hover:text-white/70 transition-colors">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}

              {tx.type === "withdrawal" && tx.status === "pending" && !tx.externalId && (
                <div className="text-[9px] font-mono text-[#f59e0b]/60 flex items-center gap-1.5 px-1">
                  <Clock className="w-2.5 h-2.5 shrink-0" />
                  Awaiting admin · transfer ID appears here once sent
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export function Transactions() {
  const [tab, setTab]           = useState<TxTab>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const { player }              = useAuth();
  const { data, isLoading }     = useGetMyTransactions(
    { limit: 200, offset: 0 },
    { query: { queryKey: ["my-transactions"], refetchInterval: 30_000 } }
  );

  const allTxs = (data ?? []) as TxRow[];

  // Date filter
  const dateFilteredTxs = useMemo(() => {
    if (dateFilter === "all") return allTxs;
    const cutoff = Date.now() - (dateFilter === "today" ? 86_400_000 : dateFilter === "7d" ? 7 * 86_400_000 : 30 * 86_400_000);
    return allTxs.filter(t => new Date(t.createdAt).getTime() >= cutoff);
  }, [allTxs, dateFilter]);

  // Tab filter
  const filtered = useMemo(() => {
    if (tab === "deposits")    return dateFilteredTxs.filter(t => ["deposit","bonus","referral","cashback"].includes(t.type));
    if (tab === "withdrawals") return dateFilteredTxs.filter(t => t.type === "withdrawal");
    return dateFilteredTxs;
  }, [dateFilteredTxs, tab]);

  // Pending float to top
  const sorted = useMemo(() => [
    ...filtered.filter(t => t.status === "pending"),
    ...filtered.filter(t => t.status !== "pending"),
  ], [filtered]);

  // Stats
  const totalIn  = allTxs.filter(t => ["deposit","bonus","referral","cashback"].includes(t.type) && t.status === "completed").reduce((s,t) => s + Number(t.amountStriker), 0);
  const totalOut = allTxs.filter(t => t.type === "withdrawal" && t.status === "completed").reduce((s,t) => s + Number(t.amountStriker), 0);
  const pending  = allTxs.filter(t => t.status === "pending").length;

  // Binary trade P&L
  const betTxs  = allTxs.filter(t => t.type === "bet" && t.status === "completed");
  const winTxs  = allTxs.filter(t => t.type === "win" && t.status === "completed");
  const currencies = [...new Set([...betTxs, ...winTxs].map(t => t.currency ?? "TON"))];
  const tradePnl = currencies.map(cur => {
    const bets     = betTxs.filter(t => (t.currency ?? "TON") === cur);
    const wins     = winTxs.filter(t => (t.currency ?? "TON") === cur);
    const staked   = bets.reduce((s,t) => s + Number(t.amountTon ?? 0), 0);
    const returned = wins.reduce((s,t) => s + Number(t.amountTon ?? 0), 0);
    return { cur, bets: bets.length, wins: wins.length, staked, netPnl: returned - staked, winRate: bets.length ? (wins.length / bets.length) * 100 : 0 };
  }).filter(x => x.bets > 0);

  const TABS: { id: TxTab; label: string; count: number }[] = [
    { id: "all",         label: "All",        count: allTxs.length },
    { id: "deposits",    label: "Deposits",   count: allTxs.filter(t => t.type === "deposit").length },
    { id: "withdrawals", label: "Withdrawals",count: allTxs.filter(t => t.type === "withdrawal").length },
  ];

  const DATE_FILTERS: { id: DateFilter; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "7d",    label: "7d"    },
    { id: "30d",   label: "30d"   },
    { id: "all",   label: "All"   },
  ];

  return (
    <Layout>
      <div className="flex flex-col pb-6">

        {/* ── Net P&L Hero ── */}
        {allTxs.length > 0 && (
          <div className="px-4 pt-4 pb-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-[#00ff88]/6 border border-[#00ff88]/20 rounded-xl px-3 py-2.5 text-center">
                <div className="text-[8px] font-mono text-[#00ff88]/50 uppercase tracking-wider mb-0.5">Bonuses</div>
                <div className="font-black text-sm text-[#00ff88] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  +{totalIn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[8px] font-mono text-[#00ff88]/35">SKR</div>
              </div>
              <div className="bg-[#f59e0b]/6 border border-[#f59e0b]/20 rounded-xl px-3 py-2.5 text-center">
                <div className="text-[8px] font-mono text-[#f59e0b]/50 uppercase tracking-wider mb-0.5">Withdrawn</div>
                <div className="font-black text-sm text-[#f59e0b] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {totalOut.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[8px] font-mono text-[#f59e0b]/35">SKR</div>
              </div>
              <div className={`rounded-xl px-3 py-2.5 text-center border ${
                pending > 0 ? "bg-[#f59e0b]/6 border-[#f59e0b]/20" : "bg-white/3 border-white/6"
              }`}>
                <div className={`text-[8px] font-mono uppercase tracking-wider mb-0.5 ${pending > 0 ? "text-[#f59e0b]/50" : "text-white/25"}`}>
                  Pending
                </div>
                <div className={`font-black text-sm tabular-nums ${pending > 0 ? "text-[#f59e0b]" : "text-white/30"}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {pending}
                </div>
                <div className={`text-[8px] font-mono ${pending > 0 ? "text-[#f59e0b]/35" : "text-white/20"}`}>txns</div>
              </div>
            </div>

            {/* Trading P&L */}
            {tradePnl.map(({ cur, bets, wins, staked, netPnl, winRate }) => {
              const isUp  = netPnl >= 0;
              const digits = cur === "TON" ? 4 : 2;
              return (
                <div key={cur} className={`rounded-2xl border p-4 mb-3 ${isUp ? "bg-[#00ff88]/5 border-[#00ff88]/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Target className="w-3 h-3" style={{ color: isUp ? "#00ff88" : "#ef4444" }} />
                      <span className="text-[9px] font-mono font-bold text-white/35 uppercase tracking-wider">
                        Trading P&L · {cur}
                      </span>
                    </div>
                    <div className={`font-mono font-black text-sm tabular-nums ${isUp ? "text-[#00ff88]" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{netPnl.toFixed(digits)} {cur}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: "Trades", val: String(bets),              color: "text-white" },
                      { label: "Won",    val: String(wins),              color: "text-[#00ff88]" },
                      { label: "Lost",   val: String(bets - wins),       color: "text-red-400"  },
                      { label: "Rate",   val: `${winRate.toFixed(0)}%`,  color: winRate >= 55 ? "text-[#00ff88]" : winRate >= 45 ? "text-[#f59e0b]" : "text-red-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-white/5 rounded-xl p-2 text-center">
                        <div className="text-[7px] font-mono text-white/25 uppercase mb-0.5">{label}</div>
                        <div className={`text-[11px] font-black tabular-nums ${color}`}
                          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 h-1 bg-white/6 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: isUp ? "#00ff88" : "#ef4444" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, winRate * 2)}%` }}
                      transition={{ duration: 0.7 }}
                    />
                  </div>
                  <div className="mt-1.5 text-[9px] font-mono text-white/25 text-center">
                    {staked.toFixed(digits)} {cur} staked total
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tabs + Date filter ── */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-0 border-b border-white/8">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-xs font-bold transition-colors border-b-2 -mb-px flex items-center gap-1 ${
                    tab === t.id ? "border-[#00ff88] text-white" : "border-transparent text-white/30 hover:text-white/60"
                  }`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span className={`text-[9px] font-mono ${tab === t.id ? "text-[#00ff88]/70" : "text-white/20"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Date filter chips */}
            <div className="flex gap-1">
              {DATE_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(f.id)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold transition-all ${
                    dateFilter === f.id
                      ? "bg-white/12 text-white border border-white/15"
                      : "text-white/25 hover:text-white/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── List ── */}
        <div className="px-4">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white/3 border border-white/6 rounded-xl h-14 animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <ReceiptText className="w-10 h-10 text-white/8" />
              <div className="text-sm font-bold text-white/30">No transactions</div>
              {allTxs.length === 0 && (
                <Link href="/deposit">
                  <button className="mt-2 px-4 py-2 rounded-xl bg-[#00ff88] text-[#060a14] text-xs font-black">
                    Make your first deposit
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${tab}-${dateFilter}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-1.5"
              >
                {sorted.map(tx => <TxCard key={tx.id} tx={tx} />)}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </Layout>
  );
}
