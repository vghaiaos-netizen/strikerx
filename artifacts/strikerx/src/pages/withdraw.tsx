import { Layout } from "@/components/layout";
import { useRequestWithdrawal, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Withdraw() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const requestWithdrawal = useRequestWithdrawal();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [strikerAmount, setStrikerAmount] = useState("");
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const WITHDRAW_RATE = 110;
  const parsedAmount = parseFloat(strikerAmount);
  const tonPreview = strikerAmount && !isNaN(parsedAmount) ? (parsedAmount / WITHDRAW_RATE).toFixed(4) : "0";

  const p = me as Record<string, unknown> | undefined;
  const balance = Number(p?.strikerBalance ?? 0);
  const wageredSince = Number(p?.strikerWageredSinceBonus ?? 0);
  const wagerRequired = balance * 1;
  const canWithdraw = wageredSince >= wagerRequired || wagerRequired === 0;
  const wagerPct = Math.min(100, wagerRequired > 0 ? (wageredSince / wagerRequired) * 100 : 100);

  const handleSubmit = async () => {
    const amount = parseFloat(strikerAmount);
    if (!amount || amount <= 0) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    if (amount > balance) { toast({ title: "Insufficient balance", variant: "destructive" }); return; }
    if (!address.trim()) { toast({ title: "Enter a TON wallet address", variant: "destructive" }); return; }
    if (!canWithdraw) { toast({ title: "Wager requirement not met", variant: "destructive" }); return; }
    try {
      await requestWithdrawal.mutateAsync({ data: { amountStriker: amount, destinationAddress: address.trim(), currency: "TON" } });
      setSubmitted(true);
    } catch (e: unknown) {
      toast({ title: "Withdrawal failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-white/60" />
          <span className="font-display font-bold text-sm tracking-widest text-white">{t('withdraw.title')}</span>
          <span className="ml-auto text-xs font-mono text-white/30">{balance.toLocaleString()} STRIKER</span>
        </div>

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
                <Clock className="w-8 h-8 text-[#00ff88]" />
              </div>
              <div>
                <div className="font-display font-black text-xl text-white">Withdrawal Queued</div>
                <div className="text-xs font-mono text-white/40 mt-2 leading-relaxed">
                  Pending review. First withdrawal goes through manual verification.
                </div>
              </div>
              <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div><div className="text-white/30 mb-0.5">Amount</div><div className="text-white font-bold">{strikerAmount} STRIKER</div></div>
                  <div><div className="text-white/30 mb-0.5">TON</div><div className="text-[#00ff88] font-bold">≈ {tonPreview} TON</div></div>
                  <div className="col-span-2"><div className="text-white/30 mb-0.5">Address</div><div className="text-white break-all">{address}</div></div>
                </div>
              </div>
              <Button onClick={() => { setSubmitted(false); setStrikerAmount(""); setAddress(""); }}
                variant="outline" className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
                New Withdrawal
              </Button>
            </motion.div>
          ) : (
            <motion.div key="form" className="flex flex-col gap-4">
              {/* Rate */}
              <div className="bg-white/3 border border-white/6 rounded-xl p-3 flex items-center justify-between">
                <div className="text-[10px] font-mono text-white/30">Withdraw Rate</div>
                <div className="text-xs font-mono font-bold text-white">{WITHDRAW_RATE} STRIKER = 1 TON</div>
              </div>

              {/* Wager gate */}
              {!canWithdraw && (
                <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono font-bold text-[#f59e0b]">Wager requirement</div>
                      <div className="text-[10px] font-mono text-white/30 mt-0.5">Play through your deposit first</div>
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-[#f59e0b] rounded-full" style={{ width: `${wagerPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] font-mono text-white/25">
                    <span>{wageredSince.toFixed(0)} wagered</span>
                    <span>{wagerRequired.toFixed(0)} required</span>
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">{t('withdraw.amount')}</label>
                <div className="relative">
                  <Input type="number" value={strikerAmount} onChange={e => setStrikerAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base pr-16"
                    placeholder="Min 100" />
                  <button onClick={() => setStrikerAmount(String(Math.floor(balance)))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#00ff88] hover:text-white px-1.5 py-0.5 rounded border border-[#00ff88]/30 transition-all">
                    MAX
                  </button>
                </div>
              </div>

              {/* Preview */}
              {strikerAmount && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between bg-white/3 border border-white/6 rounded-xl px-4 py-3">
                  <span className="text-xs font-mono text-white/40">You receive</span>
                  <span className="font-display font-bold text-lg text-white">{tonPreview} <span className="text-[#0098ea]">TON</span></span>
                </motion.div>
              )}

              {/* Address */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">{t('withdraw.addressLabel')}</label>
                <Input value={address} onChange={e => setAddress(e.target.value)}
                  className="bg-white/5 border-white/10 text-white font-mono text-sm h-11"
                  placeholder="UQA..." />
              </div>

              <Button onClick={handleSubmit} disabled={!canWithdraw || requestWithdrawal.isPending}
                className="h-12 font-display font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 border border-white/10">
                {requestWithdrawal.isPending ? t('withdraw.processing') : "REQUEST WITHDRAWAL"}
              </Button>

              <div className="text-center text-[10px] font-mono text-white/20">
                10 STRIKER spread from deposit rate. Processed within 24h.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
