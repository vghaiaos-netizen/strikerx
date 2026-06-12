import { Layout } from "@/components/layout";
import { useCreateDeposit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ExternalLink, Copy, Check, Clock, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

type Currency = "TON" | "USDT" | "BNB" | "SOL";
const CURRENCIES: { id: Currency; label: string; color: string; rate: string }[] = [
  { id: "TON",  label: "TON",    color: "#0098ea", rate: "100 STRIKER / TON"  },
  { id: "USDT", label: "USDT",   color: "#26a17b", rate: "Approx rate"        },
  { id: "BNB",  label: "BNB",    color: "#f0b90b", rate: "Approx rate"        },
  { id: "SOL",  label: "SOL",    color: "#9945ff", rate: "Approx rate"        },
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
    queryFn: async () => {
      const res = await fetch("/api/public/rate-event");
      return res.json() as Promise<RateEvent>;
    },
    refetchInterval: 60_000,
  });

  const [currency, setCurrency] = useState<Currency>("TON");
  const [amount, setAmount] = useState("1");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [rateEventCountdown, setRateEventCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rateTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (invoice?.expiresAt) {
      const end = new Date(invoice.expiresAt).getTime();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining === 0 && timerRef.current) { clearInterval(timerRef.current); }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [invoice]);

  useEffect(() => {
    if (rateEvent?.active && rateEvent.endsAt) {
      const end = new Date(rateEvent.endsAt).getTime();
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
      rateTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setRateEventCountdown(remaining);
        if (remaining === 0 && rateTimerRef.current) clearInterval(rateTimerRef.current);
      }, 1000);
    }
    return () => { if (rateTimerRef.current) clearInterval(rateTimerRef.current); };
  }, [rateEvent]);

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: t('errors.unknownError'), variant: "destructive" }); return; }
    try {
      const res = await createDeposit.mutateAsync({ data: { currency: currency as "TON" | "USDT_TON" | "USDT_TRC20" | "BNB" | "SOL" } });
      setInvoice({ payUrl: res.payLink ?? "#", amount: amount, currency, expiresAt: res.expiresAt });
      setCountdown(res.expiresAt ? Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000) : 0);
    } catch (e: unknown) {
      toast({ title: t('deposit.invoiceCreated'), description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(invoice?.payUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const effectiveRate = rateEvent?.active ? rateEvent.depositRate : 100;
  const selectedCurr = CURRENCIES.find(c => c.id === currency)!;
  const strikerPreview = currency === "TON"
    ? (parseFloat(amount || "0") * effectiveRate).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "~";

  const formatRateCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">{t('deposit.addFunds')}</span>
          {me && (
            <span className="ml-auto text-xs font-mono text-white/30">
              {Number(me?.strikerBalance ?? 0).toLocaleString()} STRIKER
            </span>
          )}
        </div>

        {/* Rate Event Banner */}
        <AnimatePresence>
          {rateEvent?.active && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className="relative overflow-hidden rounded-xl border border-[#fbbf24]/40 bg-gradient-to-r from-[#fbbf24]/15 via-[#f59e0b]/10 to-[#fbbf24]/15 px-4 py-3"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#fbbf2420,transparent_60%)]" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#fbbf24]/20 shrink-0">
                  <Zap className="w-4 h-4 text-[#fbbf24]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm text-[#fbbf24] tracking-wider">{t('deposit.bonusRateActive')}</span>
                    <span className="text-[10px] font-mono font-bold bg-[#fbbf24] text-black rounded-full px-2 py-0.5">
                      {effectiveRate} STRIKER / TON
                    </span>
                  </div>
                  {rateEventCountdown > 0 && (
                    <div className="text-[10px] font-mono text-[#fbbf24]/70 mt-0.5">
                      {t('deposit.endsIn', { time: formatRateCountdown(rateEventCountdown) })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!invoice ? (
          <>
            {/* Currency selector */}
            <div className="grid grid-cols-4 gap-2">
              {CURRENCIES.map(c => (
                <button key={c.id} onClick={() => setCurrency(c.id)}
                  className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${currency === c.id ? "border-current" : "border-white/8 text-white/30 hover:border-white/20"}`}
                  style={{ color: currency === c.id ? c.color : undefined, borderColor: currency === c.id ? c.color : undefined, background: currency === c.id ? `${c.color}12` : undefined }}>
                  <span className="font-display font-bold text-sm">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
              <div className="text-[10px] font-mono text-white/30 mb-0.5">{t('deposit.exchangeRate')}</div>
              <div className="font-mono text-sm font-bold text-white">
                {rateEvent?.active && currency === "TON"
                  ? <span className="text-[#fbbf24]">{effectiveRate} STRIKER / TON</span>
                  : selectedCurr.rate}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">
                {t('deposit.amountLabel', { currency })}
              </label>
              <Input type="number" step="0.1" min="0.1" value={amount} onChange={e => setAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base" />
            </div>

            {/* Preview */}
            <div className={`flex items-center justify-between border rounded-xl px-4 py-3 transition-colors ${rateEvent?.active ? "bg-[#fbbf24]/5 border-[#fbbf24]/20" : "bg-[#00ff88]/5 border-[#00ff88]/15"}`}>
              <span className="text-xs font-mono text-white/40">{t('deposit.youReceive')}</span>
              <span className={`font-display font-bold text-lg ${rateEvent?.active ? "text-[#fbbf24]" : "text-[#00ff88]"}`}>{strikerPreview} STRIKER</span>
            </div>

            <Button onClick={handleGenerate} disabled={createDeposit.isPending}
              className="h-12 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30">
              {createDeposit.isPending ? t('deposit.processing') : t('deposit.generateInvoice')}
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
                <div className="text-xs font-mono text-white/30 mt-0.5">≈ {strikerPreview} STRIKER</div>
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
                <Button variant="outline" onClick={copyUrl} className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white">
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
