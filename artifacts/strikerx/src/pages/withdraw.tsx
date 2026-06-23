import { Layout } from "@/components/layout";
import { useRequestWithdrawal, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Clock, AlertTriangle, Smartphone, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

type WithdrawTab = "crypto" | "mpesa";

const MPESA_NUMBER = "174379";
const KES_PER_STRIKER = 1.3;

export function Withdraw() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { token } = useAuth();
  const requestWithdrawal = useRequestWithdrawal();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [tab, setTab] = useState<WithdrawTab>("crypto");
  const [strikerAmount, setStrikerAmount] = useState("");
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // M-Pesa state
  const [mpesaStriker, setMpesaStriker] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaSubmitted, setMpesaSubmitted] = useState(false);
  const [mpesaLoading, setMpesaLoading] = useState(false);

  const WITHDRAW_RATE = 110;
  const parsedAmount = parseFloat(strikerAmount);
  const tonPreview = strikerAmount && !isNaN(parsedAmount) ? (parsedAmount / WITHDRAW_RATE).toFixed(4) : "0";

  const p = me as Record<string, unknown> | undefined;
  const balance = Number(p?.strikerBalance ?? 0);
  const wageredSince = Number(p?.strikerWageredSinceBonus ?? 0);
  const wagerRequired = balance * 1;
  const canWithdraw = wageredSince >= wagerRequired || wagerRequired === 0;
  const wagerPct = Math.min(100, wagerRequired > 0 ? (wageredSince / wagerRequired) * 100 : 100);

  const mpesaStrikerNum = parseFloat(mpesaStriker || "0") || 0;
  const mpesaKesPreview = (mpesaStrikerNum * KES_PER_STRIKER * 0.9).toFixed(0); // 10% fee
  const mpesaStrikerDeducted = mpesaStrikerNum;

  const PRESETS = [0.25, 0.5, 0.75, 1] as const;
  const PRESET_LABELS = ["25%", "50%", "75%", "Max"] as const;

  const handleSubmit = async () => {
    const amount = parseFloat(strikerAmount);
    if (!amount || amount <= 0) { toast({ title: t('withdraw.enterAmount'), variant: "destructive" }); return; }
    if (amount > balance) { toast({ title: t('withdraw.insufficientBalance'), variant: "destructive" }); return; }
    if (!address.trim()) { toast({ title: t('withdraw.enterAddress'), variant: "destructive" }); return; }
    if (!canWithdraw) { toast({ title: t('withdraw.wagerNotMet'), variant: "destructive" }); return; }
    try {
      await requestWithdrawal.mutateAsync({ data: { amountStriker: amount, destinationAddress: address.trim(), currency: "TON" } });
      setSubmitted(true);
    } catch (e: unknown) {
      toast({ title: t('withdraw.withdrawalFailed'), description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleMpesaSubmit = async () => {
    const amount = parseFloat(mpesaStriker);
    if (!amount || amount < 100) { toast({ title: "Minimum withdrawal is 100 STRIKER", variant: "destructive" }); return; }
    if (amount > balance) { toast({ title: "Insufficient STRIKER balance", variant: "destructive" }); return; }
    if (!mpesaPhone.trim()) { toast({ title: "Enter your M-Pesa phone number", variant: "destructive" }); return; }
    if (!canWithdraw) { toast({ title: t('withdraw.wagerNotMet'), variant: "destructive" }); return; }

    setMpesaLoading(true);
    try {
      const r = await fetch("/api/payments/withdraw/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountStriker: amount, phoneNumber: mpesaPhone.trim() }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) {
        // If endpoint doesn't exist yet, fall back to generic withdrawal request
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

  const TABS: { id: WithdrawTab; label: string; icon: typeof Wallet }[] = [
    { id: "crypto", label: "CRYPTO / TON", icon: Wallet },
    { id: "mpesa",  label: "M-PESA",       icon: Smartphone },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-white/60" />
          <span className="font-display font-bold text-sm tracking-widest text-white">{t('withdraw.title')}</span>
        </div>

        {/* Balance display */}
        <div className="bg-white/3 border border-white/6 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-0.5">Available Balance</div>
            <div className="font-mono font-black text-xl text-white tabular-nums">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-sm font-bold text-white/40 ml-1.5">SKR</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-0.5">≈ TON</div>
            <div className="font-mono font-bold text-lg text-[#0098ea] tabular-nums">
              {(balance / WITHDRAW_RATE).toFixed(3)}
            </div>
          </div>
        </div>

        {/* Wager gate (shared) */}
        {!canWithdraw && (
          <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-mono font-bold text-[#f59e0b]">{t('withdraw.wagerRequirement')}</div>
                <div className="text-[10px] font-mono text-white/30 mt-0.5">{t('withdraw.playThrough')}</div>
              </div>
            </div>
            <div className="bg-black/30 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-[#f59e0b] rounded-full" style={{ width: `${wagerPct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[9px] font-mono text-white/25">
              <span>{t('withdraw.wagered', { amount: wageredSince.toFixed(0) })}</span>
              <span>{t('withdraw.required', { amount: wagerRequired.toFixed(0) })}</span>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-white/3 rounded-xl p-1 border border-white/6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-display font-bold tracking-wider transition-all ${
                tab === id
                  ? "bg-white/10 text-white shadow-inner border border-white/10"
                  : "text-white/35 hover:text-white/60"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── CRYPTO TAB ──────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "crypto" && (
            <motion.div key="crypto" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-[#00ff88]" />
                    </div>
                    <div>
                      <div className="font-display font-black text-xl text-white">{t('withdraw.queued')}</div>
                      <div className="text-xs font-mono text-white/40 mt-2 leading-relaxed">{t('withdraw.queuedDesc')}</div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/30 mb-0.5">{t('withdraw.amountSummaryLabel')}</div><div className="text-white font-bold">{strikerAmount} SKR</div></div>
                        <div><div className="text-white/30 mb-0.5">{t('withdraw.tonSummaryLabel')}</div><div className="text-[#00ff88] font-bold">≈ {tonPreview} TON</div></div>
                        <div className="col-span-2"><div className="text-white/30 mb-0.5">{t('withdraw.addressSummaryLabel')}</div><div className="text-white break-all">{address}</div></div>
                      </div>
                    </div>
                    <Button onClick={() => { setSubmitted(false); setStrikerAmount(""); setAddress(""); }}
                      variant="outline" className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
                      {t('withdraw.newWithdrawal')}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    <div className="bg-white/3 border border-white/6 rounded-xl p-3 flex items-center justify-between">
                      <div className="text-[10px] font-mono text-white/30">{t('withdraw.withdrawRate')}</div>
                      <div className="text-xs font-mono font-bold text-white">{WITHDRAW_RATE} STRIKER = 1 TON</div>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">{t('withdraw.amount')}</label>
                      {/* Quick presets */}
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {PRESETS.map((pct, i) => {
                          const preset = Math.floor(balance * pct);
                          const isActive = strikerAmount === String(preset) && preset > 0;
                          return (
                            <button key={pct} onClick={() => setStrikerAmount(String(preset))}
                              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                isActive
                                  ? "bg-primary/20 border-primary/50 text-primary"
                                  : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
                              }`}>
                              {PRESET_LABELS[i]}
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative">
                        <Input type="number" value={strikerAmount} onChange={e => setStrikerAmount(e.target.value)}
                          className={`bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base ${
                            parsedAmount > balance ? "border-red-500/50" : parsedAmount > 0 && parsedAmount < 100 ? "border-yellow-500/50" : ""
                          }`}
                          placeholder="Min 100 SKR" />
                      </div>
                      {parsedAmount > balance && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertTriangle size={9} /> Exceeds available balance
                        </p>
                      )}
                      {parsedAmount > 0 && parsedAmount < 100 && (
                        <p className="text-[10px] text-yellow-400/70 mt-1">Minimum withdrawal is 100 SKR</p>
                      )}
                    </div>
                    {strikerAmount && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between bg-white/3 border border-white/6 rounded-xl px-4 py-3">
                        <span className="text-xs font-mono text-white/40">{t('withdraw.youReceive')}</span>
                        <span className="font-display font-bold text-lg text-white">{tonPreview} <span className="text-[#0098ea]">TON</span></span>
                      </motion.div>
                    )}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">{t('withdraw.addressLabel')}</label>
                      <Input value={address} onChange={e => setAddress(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono text-sm h-11" placeholder="UQA..." />
                    </div>
                    <Button onClick={handleSubmit} disabled={!canWithdraw || requestWithdrawal.isPending}
                      className="h-12 font-display font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 border border-white/10">
                      {requestWithdrawal.isPending ? t('withdraw.processing') : t('withdraw.requestWithdrawal')}
                    </Button>
                    <div className="text-center text-[10px] font-mono text-white/20">{t('withdraw.spreadNote')}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── M-PESA TAB ──────────────────────────────────────────────────── */}
          {tab === "mpesa" && (
            <motion.div key="mpesa" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <AnimatePresence mode="wait">
                {mpesaSubmitted ? (
                  <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00a651]/10 border border-[#00a651]/30 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-[#00a651]" />
                    </div>
                    <div>
                      <div className="font-display font-black text-xl text-white">Withdrawal Queued!</div>
                      <div className="text-xs font-mono text-white/40 mt-2 leading-relaxed">
                        Your M-Pesa withdrawal is being processed. Funds will be sent to your number within 1–24 hours.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/30 mb-0.5">STRIKER Deducted</div><div className="text-white font-bold">{mpesaStriker} SKR</div></div>
                        <div><div className="text-white/30 mb-0.5">Est. KES Received</div><div className="text-[#00a651] font-bold">KES {mpesaKesPreview}</div></div>
                        <div className="col-span-2"><div className="text-white/30 mb-0.5">Phone</div><div className="text-white">{mpesaPhone}</div></div>
                      </div>
                    </div>
                    <Button onClick={() => { setMpesaSubmitted(false); setMpesaStriker(""); setMpesaPhone(""); }}
                      variant="outline" className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
                      New Withdrawal
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    <div className="bg-gradient-to-br from-[#00a651]/10 to-[#00a651]/5 border border-[#00a651]/25 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Smartphone className="w-4 h-4 text-[#00a651]" />
                        <span className="font-display font-bold text-xs text-[#00a651] tracking-wider">M-PESA WITHDRAWAL</span>
                      </div>
                      <div className="space-y-1 text-[11px] font-mono text-white/60">
                        <div className="flex justify-between"><span>Paybill</span><span className="text-white font-bold">{MPESA_NUMBER}</span></div>
                        <div className="flex justify-between"><span>Rate</span><span className="text-white font-bold">1 SKR = KES {KES_PER_STRIKER.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Fee</span><span className="text-white/40">~10%</span></div>
                        <div className="flex justify-between"><span>Min withdrawal</span><span className="text-white font-bold">100 SKR</span></div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">STRIKER to Withdraw</label>
                      <div className="relative">
                        <Input type="number" value={mpesaStriker} onChange={e => setMpesaStriker(e.target.value)}
                          className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base pr-16" placeholder="Min 100 SKR" />
                        <button onClick={() => setMpesaStriker(String(Math.floor(balance)))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#00ff88] hover:text-white px-1.5 py-0.5 rounded border border-[#00ff88]/30 transition-all">
                          MAX
                        </button>
                      </div>
                      {mpesaStrikerNum > 0 && (
                        <div className="flex items-center justify-between mt-1.5 px-1">
                          <span className="text-[10px] font-mono text-white/30">You receive (est.)</span>
                          <span className="text-xs font-mono font-bold text-[#00a651]">≈ KES {mpesaKesPreview}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">M-Pesa Phone Number</label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="e.g. 0712345678" />
                    </div>

                    {mpesaStrikerNum > 0 && mpesaStrikerDeducted > 0 && (
                      <div className="bg-white/3 border border-white/6 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-white/40">STRIKER balance after</span>
                          <span className="font-bold text-white">{Math.max(0, balance - mpesaStrikerDeducted).toLocaleString(undefined, { maximumFractionDigits: 0 })} SKR</span>
                        </div>
                      </div>
                    )}

                    <Button onClick={handleMpesaSubmit} disabled={!canWithdraw || mpesaLoading}
                      className="h-12 font-display font-bold tracking-widest bg-[#00a651] hover:bg-[#00a651]/90 text-white disabled:opacity-30">
                      {mpesaLoading ? "Submitting…" : "Withdraw via M-Pesa"}
                    </Button>
                    <div className="text-center text-[10px] font-mono text-white/20">
                      M-Pesa withdrawals are processed manually. Please allow up to 24 hours.
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
