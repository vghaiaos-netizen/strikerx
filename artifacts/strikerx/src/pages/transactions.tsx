import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useGetMyTransactions } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownLeft, ArrowUpRight, Zap, Gift, Trophy,
  Clock, CheckCircle, XCircle, Copy, ReceiptText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TxTab = "all" | "deposits" | "withdrawals";

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
  pending:   { label: "Pending",   color: "#f59e0b", icon: Clock         },
  completed: { label: "Completed", color: "#22c55e", icon: CheckCircle   },
  failed:    { label: "Failed",    color: "#ef4444", icon: XCircle       },
  cancelled: { label: "Cancelled", color: "#6b7280", icon: XCircle       },
};

function TxCard({ tx }: { tx: TxRow }) {
  const { toast } = useToast();
  const meta   = TYPE_META[tx.type]   ?? TYPE_META.bonus;
  const status = STATUS_META[tx.status] ?? STATUS_META.pending;
  const Icon   = meta.icon;
  const StatusIcon = status.icon;

  const isPositive = ["deposit", "win", "bonus", "cashback", "referral"].includes(tx.type);
  // Binary trades use amountTon (amountStriker is 0 for TON/USDT trades)
  const hasTon    = (tx.amountTon ?? 0) > 0;
  const amtNum    = hasTon ? Number(tx.amountTon) : Number(tx.amountStriker);
  const amtUnit   = hasTon ? (tx.currency ?? "TON") : "SKR";
  const amtDecimals = hasTon ? 4 : 0;
  const amtStr    = `${isPositive ? "+" : "-"}${amtNum.toLocaleString(undefined, { minimumFractionDigits: amtDecimals, maximumFractionDigits: amtDecimals })} ${amtUnit}`;

  const handleCopyId = () => {
    if (!tx.externalId) return;
    navigator.clipboard.writeText(tx.externalId).catch(() => {});
    toast({ title: "Copied to clipboard" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl px-3 py-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2.5">
        {/* Type icon */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>

        {/* Middle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white">{meta.label}</span>
            <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: status.color, background: `${status.color}15` }}>
              <StatusIcon className="w-2.5 h-2.5" />
              {status.label}
            </span>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            {new Date(tx.createdAt).toLocaleString([], {
              month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
            {tx.currency && tx.currency !== "STRIKER" && (
              <span className="ml-1.5 text-muted-foreground/60">· {tx.currency}</span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-right shrink-0">
          <div className={`font-mono font-black text-sm tabular-nums ${isPositive ? "text-green-400" : "text-white/70"}`}>
            {amtStr}
          </div>
        </div>
      </div>

      {/* External ID row — withdrawal only */}
      {tx.type === "withdrawal" && tx.externalId && (
        <div className="flex items-center gap-2 bg-white/3 border border-white/6 rounded-lg px-2.5 py-1.5">
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider shrink-0">Transfer ID</span>
          <span className="text-[9px] font-mono text-white/60 flex-1 truncate">{tx.externalId}</span>
          <button onClick={handleCopyId} className="shrink-0 text-white/30 hover:text-white/70 transition-colors">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Pending withdrawal note */}
      {tx.type === "withdrawal" && tx.status === "pending" && !tx.externalId && (
        <div className="text-[9px] font-mono text-[#f59e0b]/60 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          Awaiting admin approval · Transfer ID will appear here once sent
        </div>
      )}
    </motion.div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-16 gap-3 text-center">
      <ReceiptText size={36} className="text-muted-foreground/20" />
      <p className="text-sm text-muted-foreground">No {label} transactions yet</p>
    </div>
  );
}

export function Transactions() {
  const [tab, setTab] = useState<TxTab>("all");
  const { player } = useAuth();
  const { data, isLoading } = useGetMyTransactions(
    { limit: 100, offset: 0 },
    { query: { queryKey: ["my-transactions"], refetchInterval: 30_000 } }
  );

  const txs = (data ?? []) as TxRow[];

  const filtered = tab === "all"
    ? txs
    : tab === "deposits"
    ? txs.filter((t) => t.type === "deposit" || t.type === "bonus" || t.type === "referral" || t.type === "cashback")
    : txs.filter((t) => t.type === "withdrawal");

  const TABS: { id: TxTab; label: string; count?: number }[] = [
    { id: "all",         label: "All",         count: txs.length },
    { id: "deposits",    label: "Deposits",     count: txs.filter((t) => t.type === "deposit").length },
    { id: "withdrawals", label: "Withdrawals",  count: txs.filter((t) => t.type === "withdrawal").length },
  ];

  const totalIn  = txs.filter(t => ["deposit","bonus","referral","cashback","win"].includes(t.type) && t.status === "completed").reduce((s, t) => s + Number(t.amountStriker), 0);
  const totalOut = txs.filter(t => t.type === "withdrawal" && t.status === "completed").reduce((s, t) => s + Number(t.amountStriker), 0);
  const pending  = txs.filter(t => t.status === "pending").length;

  return (
    <Layout>
      <div className="flex flex-col pb-6">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-2">
          <ReceiptText size={18} className="text-primary" />
          <h1 className="font-black text-lg tracking-tight">Transaction History</h1>
        </div>

        {!player && (
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground">Open in Telegram to see your transactions</p>
          </div>
        )}

        {/* Summary bar */}
        {txs.length > 0 && (
          <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
            <div className="bg-green-950/40 border border-green-700/20 rounded-xl px-3 py-2 text-center">
              <p className="text-[8px] font-mono text-green-400/60 uppercase tracking-widest mb-0.5">Bonuses</p>
              <p className="font-mono font-black text-sm text-green-400 tabular-nums">+{totalIn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[8px] font-mono text-green-400/40">SKR earned</p>
            </div>
            <div className="bg-orange-950/30 border border-orange-700/20 rounded-xl px-3 py-2 text-center">
              <p className="text-[8px] font-mono text-orange-400/60 uppercase tracking-widest mb-0.5">Withdrawn</p>
              <p className="font-mono font-black text-sm text-orange-400 tabular-nums">{totalOut.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[8px] font-mono text-orange-400/40">SKR</p>
            </div>
            <div className={`rounded-xl px-3 py-2 text-center border ${pending > 0 ? "bg-yellow-950/30 border-yellow-700/20" : "bg-card border-border"}`}>
              <p className={`text-[8px] font-mono uppercase tracking-widest mb-0.5 ${pending > 0 ? "text-yellow-400/60" : "text-muted-foreground"}`}>Pending</p>
              <p className={`font-mono font-black text-sm tabular-nums ${pending > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>{pending}</p>
              <p className={`text-[8px] font-mono ${pending > 0 ? "text-yellow-400/40" : "text-muted-foreground/40"}`}>txns</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 px-4 mb-4 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-bold transition-colors border-b-2 -mb-px flex items-center gap-1 ${
                tab === t.id ? "border-primary text-white" : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[9px] font-mono px-1 rounded ${tab === t.id ? "text-primary/80" : "text-muted-foreground/50"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-4">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl h-16 animate-pulse" />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {filtered.length === 0 ? (
                  <EmptyState label={tab === "all" ? "" : tab} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {filtered.map((tx) => (
                      <TxCard key={tx.id} tx={tx} />
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Link back */}
        <div className="px-4 mt-6">
          <Link href="/portfolio">
            <button className="text-xs text-muted-foreground hover:text-white font-mono transition-colors flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" />
              Back to Portfolio
            </button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
