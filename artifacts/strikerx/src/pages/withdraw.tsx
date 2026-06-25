import { Layout } from "@/components/layout";
import { useRequestWithdrawal, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, Clock, AlertTriangle, Smartphone, Wallet,
  ReceiptText, ArrowRight, CheckCircle, Info,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

type WithdrawTab = "crypto" | "mpesa";

const MPESA_NUMBER    = "174379";
const KES_PER_STRIKER = 1.3;
const WITHDRAW_RATE   = 110;

// ─── Withdraw ─────────────────────────────────────────────────────────────────
export function Withdraw() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { token } = useAuth();
  const requestWithdrawal = useRequestWithdrawal();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [tab, setTab]               = useState<WithdrawTab>("crypto");
  const [strikerAmount, setStrikerAmount] = useState("");
  const [address, setAddress]       = useState("");
  const [submitted, setSubmitted]   = useState(false);

  const [mpesaStriker, setMpesaStriker]   = useState("");
  const [mpesaPhone, setMpesaPhone]       = useState("");
  const [mpesaSubmitted, setMpesaSubmitted] = useState(false);
  const [mpesaLoading, setMpesaLoading]   = useState(false);

  const p             = me as Record<string, unknown> | undefined;
  const balance       = Number(p?.strikerBalance ?? 0);
  const wageredSince  = Number(p?.strikerWageredSinceBonus ?? 0);
  const wagerRequired = balance * 1;
  const canWithdraw   = wageredSince >= wagerRequired || wagerRequired === 0;
  const wagerPct      = Math.min(100, wagerRequired > 0 ? (wageredSince / wagerRequired) * 100 : 100);
  const wagerRemaining = Math.max(0, wagerRequired - wageredSince);

  const parsedAmount    = parseFloat(strikerAmount);
  const tonPreview      = strikerAmount && !isNaN(parsedAmount) ? (parsedAmount / WITHDRAW_RATE).toFixed(4) : "0";
  const mpesaStrikerNum = parseFloat(mpesaStriker || "0") || 0;
  const mpesaKesPreview = (mpesaStrikerNum * KES_PER_STRIKER * 0.9).toFixed(0);

  const PRESETS = [0.25, 0.5, 0.75, 1] as const;

  const handleSubmit = async () => {
    const amount = parseFloat(strikerAmount);
    if (!amount || amount <= 0) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    if (amount > balance)       { toast({ title: "Exceeds balance", variant: "destructive" }); return; }
    if (!address.trim())        { toast({ title: "Enter TON wallet address", variant: "destructive" }); return; }
    if (!canWithdraw)           { toast({ title: "Wager requirement not met", variant: "destructive" }); return; }
    try {
      await requestWithdrawal.mutateAsync({ data: { amountStriker: amount, destinationAddress: address.trim(), currency: "TON" } });
      setSubmitted(true);
    } catch (e: unknown) {
      toast({ title: "Withdrawal failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleMpesaSubmit = async () => {
    const amount = parseFloat(mpesaStriker);
    if (!amount || amount < 100) { toast({ title: "Minimum 100 STRIKER", variant: "destructive" }); return; }
    if (amount > balance)        { toast({ title: "Exceeds balance", variant: "destructive" }); return; }
    if (!mpesaPhone.trim())      { toast({ title: "Enter M-Pesa phone number", variant: "destructive" }); return; }
    if (!canWithdraw)            { toast({ title: "Wager requirement not met", variant: "destructive" }); return; }
    setMpesaLoading(true);
    try {
      const r = await fetch("/api/payments/withdraw/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountStriker: amount, phoneNumber: mpesaPhone.trim() }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) {
        if (r.status === 404) {
          await requestWithdrawal.mutateAsync({ data: { amountStriker: amount, destinationAddress: mpesaPhone.trim(), currency: "TON" } });
          setMpesaSubmitted(true);
          return;
        }
        throw new Error(data.error ?? "Failed to submit");
      }
      setMpesaSubmitted(true);
    } catch (e: unknown) {
      toast({ title: "Withdrawal failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMpesaLoading(false);
    }
  };

  // ── LOCKED STATE ──────────────────────────────────────────────────────────
  if (!canWithdraw) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

          {/* Header */}
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-white/40" />
            <span className="font-mono font-bold text-sm text-white/60 tracking-widest uppercase">Withdraw</span>
          </div>

          {/* Balance card */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Available Balance</div>
              <div className="font-black text-2xl text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {balance.toLocaleString()}
                <span className="text-sm font-bold text-white/30 ml-1.5">SKR</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Rate</div>
              <div className="text-xs font-mono text-white/50">{WITHDRAW_RATE} SKR = 1 TON</div>
            </div>
          </div>

          {/* Locked card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#f59e0b]/6 border border-[#f59e0b]/25 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <div>
                <div className="font-bold text-sm text-[#f59e0b]">Withdrawal Locked</div>
                <div className="text-[11px] font-mono text-white/40 mt-1 leading-relaxed">
                  You need to wager your bonus balance before withdrawing.
                  Play more games to unlock.
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono">
              <span className="text-white/40">Wagered</span>
              <span className="text-[#f59e0b] font-bold">{wageredSince.toFixed(0)} / {wagerRequired.toFixed(0)} SKR</span>
            </div>
            <div className="h-3 bg-black/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${wagerPct}%` }}
                transition={{ duration: 0.9 }}
                style={{ background: "linear-gradient(90deg, #f59e0b80, #f59e0b)" }}
              />
            </div>
            <div className="mt-2 text-[9px] font-mono text-white/25 text-center">
              {wagerRemaining.toFixed(0)} SKR more to unlock · play games or trade markets
            </div>
          </motion.div>

          {/* CTA */}
          <Link href="/markets">
            <motion.div whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-[#00ff88]/6 border border-[#00ff88]/20 rounded-xl p-4 cursor-pointer hover:border-[#00ff88]/35 transition-all">
              <div className="w-9 h-9 rounded-xl bg-[#00ff88]/12 flex items-center justify-center shrink-0">
                <ArrowRight className="w-4 h-4 text-[#00ff88]" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-white">Trade Markets</div>
                <div className="text-[10px] font-mono text-white/35 mt-0.5">Binary predictions count toward wager requirement</div>
              </div>
            </motion.div>
          </Link>
        </div>
      </Layout>
    );
  }

  // ── UNLOCKED FORM ─────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-8">

        {/* Header */}
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-white/60" />
          <span className="font-mono font-bold text-sm text-white tracking-widest uppercase">Withdraw</span>
        </div>

        {/* Balance card */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Available Balance</div>
            <div className="font-black text-2xl text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {balance.toLocaleString()}
              <span className="text-sm font-bold text-white/30 ml-1.5">SKR</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">≈ TON value</div>
            <div className="font-black text-xl text-[#0098ea] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {(balance / WITHDRAW_RATE).toFixed(3)}
            </div>
          </div>
        </div>

        {/* Rate exchange card */}
        <div className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-3">
          <div className="flex-1 text-center">
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-0.5">You Send</div>
            <div className="font-black text-base text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {WITHDRAW_RATE} <span className="text-[#00ff88]">SKR</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <ArrowRight className="w-3.5 h-3.5 text-white/30" />
          </div>
          <div className="flex-1 text-center">
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-0.5">You Get</div>
            <div className="font-black text-base text-[#0098ea]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              1 <span className="text-white/50">TON</span>
            </div>
          </div>
        </div>

        {/* First-withdrawal notice */}
        <div className="flex items-start gap-2.5 bg-white/3 border border-white/8 rounded-xl p-3.5">
          <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
          <div className="text-[10px] font-mono text-white/35 leading-relaxed">
            Your first withdrawal goes through a manual review (1–24 hours). Subsequent withdrawals may be faster.
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-white/3 rounded-xl p-1 border border-white/6">
          {([
            { id: "crypto" as const, label: "CRYPTO / TON", Icon: Wallet },
            { id: "mpesa"  as const, label: "M-PESA",       Icon: Smartphone },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold tracking-wider transition-all ${
                tab === id
                  ? "bg-white/10 text-white border border-white/12 shadow-inner"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── CRYPTO TAB ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "crypto" && (
            <motion.div key="crypto" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-5 py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-[#00ff88]" />
                    </div>
                    <div>
                      <div className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        Withdrawal Queued
                      </div>
                      <div className="text-xs font-mono text-white/35 mt-2 leading-relaxed">
                        Your request is in the queue. You'll receive <span className="text-[#00ff88]">{tonPreview} TON</span> once processed (1–24h).
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <div className="text-white/25 mb-0.5">Amount</div>
                          <div className="text-white font-bold">{strikerAmount} SKR</div>
                        </div>
                        <div>
                          <div className="text-white/25 mb-0.5">≈ TON</div>
                          <div className="text-[#00ff88] font-bold">{tonPreview} TON</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-white/25 mb-0.5">Destination</div>
                          <div className="text-white break-all text-[10px]">{address}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <button
                        onClick={() => { setSubmitted(false); setStrikerAmount(""); setAddress(""); }}
                        className="w-full py-3 rounded-xl border border-white/10 text-white/50 text-xs font-mono hover:border-white/20 hover:text-white/70 transition-all"
                      >
                        New Withdrawal
                      </button>
                      <Link href="/transactions">
                        <button className="w-full flex items-center justify-center gap-1.5 text-xs font-mono text-white/25 hover:text-white/50 transition-colors py-2">
                          <ReceiptText className="w-3 h-3" />
                          View Transaction History
                        </button>
                      </Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    {/* Amount */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">
                        STRIKER Amount
                      </label>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {PRESETS.map((pct, i) => {
                          const preset  = Math.floor(balance * pct);
                          const isActive = strikerAmount === String(preset) && preset > 0;
                          return (
                            <button
                              key={pct}
                              onClick={() => setStrikerAmount(String(preset))}
                              className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${
                                isActive
                                  ? "bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]"
                                  : "border-white/8 text-white/30 hover:border-white/20 hover:text-white/60"
                              }`}
                            >
                              {["25%","50%","75%","Max"][i]}
                            </button>
                          );
                        })}
                      </div>
                      <Input
                        type="number"
                        value={strikerAmount}
                        onChange={e => setStrikerAmount(e.target.value)}
                        className={`bg-white/5 border-white/10 text-white font-mono font-bold h-12 text-base ${
                          parsedAmount > balance ? "border-red-500/50" : ""
                        }`}
                        placeholder="Min 100 SKR"
                      />
                      {parsedAmount > balance && (
                        <p className="text-[10px] text-red-400 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Exceeds balance
                        </p>
                      )}
                    </div>

                    {/* Live conversion preview */}
                    <AnimatePresence>
                      {strikerAmount && parsedAmount > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center justify-between bg-[#0098ea]/6 border border-[#0098ea]/20 rounded-xl px-4 py-3">
                            <span className="text-xs font-mono text-white/35">You receive</span>
                            <span className="font-black text-lg text-[#0098ea]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                              {tonPreview} <span className="text-white/40 text-sm">TON</span>
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Address */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">
                        TON Wallet Address
                      </label>
                      <Input
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono text-sm h-12"
                        placeholder="UQA..."
                      />
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={requestWithdrawal.isPending || parsedAmount > balance || parsedAmount < 100}
                      className="w-full h-12 rounded-xl bg-white/8 border border-white/12 text-white font-bold tracking-wider disabled:opacity-30 hover:bg-white/12 transition-all flex items-center justify-center gap-2"
                    >
                      {requestWithdrawal.isPending ? (
                        <Clock className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                      {requestWithdrawal.isPending ? "Processing…" : "Request Withdrawal"}
                    </button>
                    <div className="text-center text-[9px] font-mono text-white/18">
                      Processing fee may apply · {WITHDRAW_RATE} SKR = 1 TON
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── M-PESA TAB ───────────────────────────────────────────────── */}
          {tab === "mpesa" && (
            <motion.div key="mpesa" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <AnimatePresence mode="wait">
                {mpesaSubmitted ? (
                  <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-5 py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00a651]/10 border border-[#00a651]/30 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-[#00a651]" />
                    </div>
                    <div>
                      <div className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        M-Pesa Request Queued
                      </div>
                      <div className="text-xs font-mono text-white/35 mt-2 leading-relaxed">
                        Funds will be sent to <span className="text-[#00a651]">{mpesaPhone}</span> within 1–24 hours.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <div className="text-white/25 mb-0.5">STRIKER</div>
                          <div className="text-white font-bold">{mpesaStriker} SKR</div>
                        </div>
                        <div>
                          <div className="text-white/25 mb-0.5">Est. KES</div>
                          <div className="text-[#00a651] font-bold">KES {mpesaKesPreview}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-white/25 mb-0.5">Phone</div>
                          <div className="text-white">{mpesaPhone}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <button
                        onClick={() => { setMpesaSubmitted(false); setMpesaStriker(""); setMpesaPhone(""); }}
                        className="w-full py-3 rounded-xl border border-white/10 text-white/50 text-xs font-mono hover:border-white/20 hover:text-white/70 transition-all"
                      >
                        New Withdrawal
                      </button>
                      <Link href="/transactions">
                        <button className="w-full flex items-center justify-center gap-1.5 text-xs font-mono text-white/25 hover:text-white/50 transition-colors py-2">
                          <ReceiptText className="w-3 h-3" />
                          View Transaction History
                        </button>
                      </Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    {/* M-Pesa info card */}
                    <div className="bg-gradient-to-br from-[#00a651]/10 to-transparent border border-[#00a651]/25 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Smartphone className="w-4 h-4 text-[#00a651]" />
                        <span className="font-bold text-xs text-[#00a651] tracking-wider uppercase">M-Pesa Details</span>
                      </div>
                      <div className="space-y-1.5 text-[11px] font-mono text-white/50">
                        <div className="flex justify-between"><span>Paybill</span><span className="text-white font-bold">{MPESA_NUMBER}</span></div>
                        <div className="flex justify-between"><span>Rate</span><span className="text-white font-bold">1 SKR = KES {KES_PER_STRIKER.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Fee</span><span className="text-[#f59e0b]">~10% (shown in preview)</span></div>
                        <div className="flex justify-between"><span>Minimum</span><span className="text-white font-bold">100 SKR</span></div>
                      </div>
                    </div>

                    {/* STRIKER amount */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">
                        STRIKER to Withdraw
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={mpesaStriker}
                          onChange={e => setMpesaStriker(e.target.value)}
                          className="bg-white/5 border-white/10 text-white font-mono font-bold h-12 text-base pr-16"
                          placeholder="Min 100 SKR"
                        />
                        <button
                          onClick={() => setMpesaStriker(String(Math.floor(balance)))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-[#00ff88] border border-[#00ff88]/30 px-2 py-1 rounded-lg hover:bg-[#00ff88]/10 transition-all"
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* Live KES preview */}
                    <AnimatePresence>
                      {mpesaStrikerNum > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center justify-between bg-[#00a651]/6 border border-[#00a651]/20 rounded-xl px-4 py-3">
                            <div>
                              <div className="text-[9px] font-mono text-white/30 mb-0.5">You receive (after 10% fee)</div>
                              <div className="font-black text-lg text-[#00a651]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                KES {mpesaKesPreview}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] font-mono text-white/25 mb-0.5">Balance after</div>
                              <div className="text-xs font-mono text-white/50">
                                {Math.max(0, balance - mpesaStrikerNum).toFixed(0)} SKR
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Phone number */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">
                        M-Pesa Phone Number
                      </label>
                      <Input
                        value={mpesaPhone}
                        onChange={e => setMpesaPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-12"
                        placeholder="e.g. 0712 345 678"
                      />
                    </div>

                    <button
                      onClick={handleMpesaSubmit}
                      disabled={mpesaLoading || mpesaStrikerNum < 100 || mpesaStrikerNum > balance}
                      className="w-full h-12 rounded-xl bg-[#00a651] text-white font-bold tracking-wider disabled:opacity-30 hover:bg-[#00a651]/85 transition-all flex items-center justify-center gap-2"
                    >
                      {mpesaLoading ? <Clock className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                      {mpesaLoading ? "Submitting…" : "Withdraw via M-Pesa"}
                    </button>
                    <div className="text-center text-[9px] font-mono text-white/18">
                      M-Pesa withdrawals processed manually · allow up to 24 hours
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
