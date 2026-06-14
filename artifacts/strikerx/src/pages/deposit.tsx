import { Layout } from "@/components/layout";
import { useCreateDeposit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ExternalLink, Copy, Check, Clock, Zap, TrendingUp, Coins } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

type Currency = "TON" | "USDT" | "BNB" | "SOL";
const CURRENCIES: { id: Currency; label: string; color: string }[] = [
  { id: "TON",  label: "TON",  color: "#0098ea" },
  { id: "USDT", label: "USDT", color: "#26a17b" },
  { id: "BNB",  label: "BNB",  color: "#f0b90b" },
  { id: "SOL",  label: "SOL",  color: "#9945ff" },
];

interface Invoice { payUrl: string; amount: string; currency: string; expiresAt?: string; }
interface RateEvent { active: boolean; depositRate: number; endsAt: string | null; }

export function Deposit() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createDeposit = useCreateDeposit();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const { data: rateEvent } = useQuery<RateEvent>({
    queryKey: ["rate-event"],
    queryFn:  async () => (await fetch("/api/public/rate-event")).json() as Promise<RateEvent>,
    refetchInterval: 60_000,
  });

  const [currency, setCurrency]   = useState<Currency>("TON");
  const [amount, setAmount]       = useState("1");
  const [invoice, setInvoice]     = useState<Invoice | null>(null);
  const [copied, setCopied]       = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [rateCountdown, setRateCountdown] = useState(0);
  const timerRef     = useRef<NodeJS.Timeout | null>(null);
  const rateTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!invoice?.expiresAt) return;
    const end = new Date(invoice.expiresAt).getTime();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdown(rem);
      if (rem === 0 && timerRef.current) clearInterval(timerRef.current);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [invoice]);

  useEffect(() => {
    if (!rateEvent?.active || !rateEvent.endsAt) return;
    const end = new Date(rateEvent.endsAt).getTime();
    if (rateTimerRef.current) clearInterval(rateTimerRef.current);
    rateTimerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRateCountdown(rem);
      if (rem === 0 && rateTimerRef.current) clearInterval(rateTimerRef.current);
    }, 1000);
    return () => { if (rateTimerRef.current) clearInterval(rateTimerRef.current); };
  }, [rateEvent]);

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    try {
      const res = await createDeposit.mutateAsync({ data: { currency: currency as "TON" | "USDT_TON" | "USDT_TRC20" | "BNB" | "SOL" } });
      setInvoice({ payUrl: res.payLink ?? "#", amount, currency, expiresAt: res.expiresAt });
      setCountdown(res.expiresAt ? Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000) : 0);
    } catch (e: unknown) {
      toast({ title: "Invoice error", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(invoice?.payUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const effectiveRate  = rateEvent?.active ? rateEvent.depositRate : 100;
  const selectedCurr   = CURRENCIES.find(c => c.id === currency)!;
  const amtNum         = parseFloat(amount || "0") || 0;
  const strikerPreview = currency === "TON" ? (amtNum * effectiveRate).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "~";

  const fmtRateCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  };

  const tonBalance     = parseFloat(String(me?.tonBalance     ?? 0));
  const strikerBalance = parseFloat(String(me?.strikerBalance ?? 0));

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">DEPOSIT FUNDS</span>
        </div>

        {/* Current balances */}
        {me && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/3 border border-white/6 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3 h-3 text-[#0098ea]" />
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Trading Wallet</span>
              </div>
              <div className="font-mono font-bold text-sm text-white">{tonBalance.toFixed(2)} TON</div>
            </div>
            <div className="bg-white/3 border border-white/6 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Coins className="w-3 h-3 text-[#fbbf24]" />
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Casino Balance</span>
              </div>
              <div className="font-mono font-bold text-sm text-white">{strikerBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} SKR</div>
            </div>
          </div>
        )}

        {/* Rate Event Banner */}
        <AnimatePresence>
          {rateEvent?.active && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="relative overflow-hidden rounded-xl border border-[#fbbf24]/40 bg-gradient-to-r from-[#fbbf24]/15 via-[#f59e0b]/10 to-[#fbbf24]/15 px-4 py-3"
            >
              <div className="relative flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-[#fbbf24] shrink-0" />
                <div className="flex-1">
                  <div className="font-display font-bold text-sm text-[#fbbf24] tracking-wider">
                    BONUS RATE ACTIVE — {effectiveRate} STRIKER / TON
                  </div>
                  {rateCountdown > 0 && (
                    <div className="text-[10px] font-mono text-[#fbbf24]/70 mt-0.5">
                      Ends in {fmtRateCountdown(rateCountdown)}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!invoice ? (
          <>
            {/* What you get panel */}
            <div className="bg-white/3 border border-white/8 rounded-xl p-3">
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">What you get</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#0098ea]" />
                    <span className="text-xs text-white/60">Trading wallet (TON)</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-white">
                    {currency === "TON" ? `${amtNum > 0 ? amtNum.toFixed(2) : "—"} TON` : `${amtNum > 0 ? amtNum.toFixed(4) : "—"} ${currency}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-[#fbbf24]" />
                    <span className="text-xs text-white/60">STRIKER (casino games)</span>
                  </div>
                  <span className={`font-mono text-sm font-bold ${rateEvent?.active ? "text-[#fbbf24]" : "text-[#00ff88]"}`}>
                    {strikerPreview} SKR
                  </span>
                </div>
              </div>
            </div>

            {/* Currency selector */}
            <div className="grid grid-cols-4 gap-2">
              {CURRENCIES.map(c => (
                <button key={c.id} onClick={() => setCurrency(c.id)}
                  className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${currency === c.id ? "border-current" : "border-white/8 text-white/30 hover:border-white/20"}`}
                  style={{
                    color:       currency === c.id ? c.color : undefined,
                    borderColor: currency === c.id ? c.color : undefined,
                    background:  currency === c.id ? `${c.color}12` : undefined,
                  }}>
                  <span className="font-display font-bold text-sm">{c.label}</span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">
                Amount ({currency})
              </label>
              <Input type="number" step="0.1" min="0.1" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base" />
            </div>

            {/* Rate info */}
            {currency === "TON" && (
              <div className="text-center text-[10px] font-mono text-white/30">
                {rateEvent?.active
                  ? <span className="text-[#fbbf24]">Bonus rate: {effectiveRate} STRIKER / TON</span>
                  : "Base rate: 100 STRIKER / TON"}
              </div>
            )}

            <Button onClick={handleGenerate} disabled={createDeposit.isPending}
              className="h-12 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30">
              {createDeposit.isPending ? "Generating..." : t('deposit.generateInvoice')}
            </Button>
          </>
        ) : (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 items-center">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl shadow-[0_0_32px_#00ff8820]">
                <QRCodeSVG value={invoice.payUrl} size={180} level="M" />
              </div>

              {/* Amount */}
              <div className="text-center">
                <div className="font-display font-black text-2xl text-white">{invoice.amount} {invoice.currency}</div>
                <div className="text-xs font-mono text-white/40 mt-1">
                  → Trading wallet + {strikerPreview} STRIKER bonus
                </div>
              </div>

              {/* Countdown */}
              {countdown > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#f59e0b]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('deposit.expiresIn')} {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
                </div>
              )}

              {/* Pay link */}
              <div className="flex gap-2 w-full">
                <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button className="w-full h-11 font-display font-bold tracking-widest bg-[#0098ea] hover:bg-[#0098ea]/90 text-white">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('deposit.payInTelegram')}
                  </Button>
                </a>
                <Button variant="outline" onClick={copyUrl}
                  className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white">
                  {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <button onClick={() => setInvoice(null)}
                className="text-xs font-mono text-white/30 hover:text-white/60 underline">
                {t('deposit.generateNew')}
              </button>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </Layout>
  );
}
