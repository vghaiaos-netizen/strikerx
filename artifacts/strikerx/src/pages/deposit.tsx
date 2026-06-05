import { Layout } from "@/components/layout";
import {
  useCreateDeposit,
  useGetMe,
  useGetRateEventsActive,
  getGetMeQueryKey,
  getGetRateEventsActiveQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ExternalLink, Copy, Check, Clock, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Currency = "TON" | "USDT" | "BNB" | "SOL";
const BASE_CURRENCIES: { id: Currency; label: string; color: string }[] = [
  { id: "TON",  label: "TON",  color: "#0098ea" },
  { id: "USDT", label: "USDT", color: "#26a17b" },
  { id: "BNB",  label: "BNB",  color: "#f0b90b" },
  { id: "SOL",  label: "SOL",  color: "#9945ff" },
];

interface Invoice { payUrl: string; amount: string; currency: string; expiresAt?: string; }

function useRateCountdown(endsAt: string | null | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!endsAt) { setSecs(0); return; }
    const update = () => setSecs(Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return secs;
}

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Deposit() {
  const { toast } = useToast();
  const createDeposit = useCreateDeposit();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: rateEvent } = useGetRateEventsActive({
    query: { queryKey: getGetRateEventsActiveQueryKey(), refetchInterval: 30_000, staleTime: 20_000 },
  });

  const isEventActive = rateEvent?.active === true && !!rateEvent.depositRate;
  const eventRate     = rateEvent?.depositRate ?? 100;
  const baseRate      = rateEvent?.baseRate ?? 100;
  const rateCountdown = useRateCountdown(isEventActive ? rateEvent?.endsAt : null);

  const [currency, setCurrency] = useState<Currency>("TON");
  const [amount, setAmount] = useState("1");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [invoiceCountdown, setInvoiceCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (invoice?.expiresAt) {
      const end = new Date(invoice.expiresAt).getTime();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setInvoiceCountdown(remaining);
        if (remaining === 0 && timerRef.current) clearInterval(timerRef.current);
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [invoice]);

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    try {
      const res = await createDeposit.mutateAsync({
        data: { currency: currency as "TON" | "USDT_TON" | "USDT_TRC20" | "BNB" | "SOL" },
      });
      setInvoice({ payUrl: res.payLink ?? "#", amount, currency, expiresAt: res.expiresAt });
      setInvoiceCountdown(res.expiresAt ? Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000) : 0);
    } catch (e: unknown) {
      toast({ title: "Failed to generate invoice", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(invoice?.payUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeRate      = currency === "TON" ? (isEventActive ? eventRate : baseRate) : null;
  const strikerPreview  = currency === "TON"
    ? (parseFloat(amount || "0") * (activeRate ?? 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "~";
  const rateLabel = currency === "TON"
    ? `${activeRate?.toLocaleString() ?? "100"} STRIKER / TON`
    : "Approx rate";

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">ADD FUNDS</span>
          {me && (
            <span className="ml-auto text-xs font-mono text-white/30">
              {Number(me?.strikerBalance ?? 0).toLocaleString()} STRIKER
            </span>
          )}
        </div>

        {/* ── Rate Event Banner ──────────────────────────────────────────── */}
        <AnimatePresence>
          {isEventActive && (
            <motion.div
              key="rate-banner"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.3 }}
              className="relative overflow-hidden rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/8 px-4 py-3"
            >
              {/* Animated shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b]/10 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: "linear" }}
              />

              <div className="relative flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f59e0b]/20">
                  <Zap className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-xs tracking-wider text-[#f59e0b]">
                      ⚡ RATE BOOST ACTIVE
                    </span>
                    <span className="rounded bg-[#f59e0b]/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#f59e0b]">
                      +{Math.round(((eventRate - baseRate) / baseRate) * 100)}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-white/50">
                    {eventRate.toLocaleString()} STRIKER per TON
                    {rateCountdown > 0 && (
                      <> · ends in <span className="text-[#f59e0b]">{fmt(rateCountdown)}</span></>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display font-black text-base text-[#f59e0b]">
                    {eventRate.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono text-white/30">STRIKER/TON</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!invoice ? (
          <>
            {/* Currency selector */}
            <div className="grid grid-cols-4 gap-2">
              {BASE_CURRENCIES.map(c => (
                <button key={c.id} onClick={() => setCurrency(c.id)}
                  className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    currency === c.id
                      ? "border-current"
                      : "border-white/8 text-white/30 hover:border-white/20"
                  }`}
                  style={{
                    color:       currency === c.id ? c.color : undefined,
                    borderColor: currency === c.id ? c.color : undefined,
                    background:  currency === c.id ? `${c.color}12` : undefined,
                  }}>
                  <span className="font-display font-bold text-sm">{c.label}</span>
                  {c.id === "TON" && isEventActive && (
                    <span className="text-[7px] font-mono text-[#f59e0b] leading-none">BOOSTED</span>
                  )}
                </button>
              ))}
            </div>

            {/* Exchange rate card */}
            <div className={`border rounded-xl p-3 text-center transition-all ${
              currency === "TON" && isEventActive
                ? "bg-[#f59e0b]/5 border-[#f59e0b]/20"
                : "bg-white/3 border-white/6"
            }`}>
              <div className="text-[10px] font-mono text-white/30 mb-0.5">Exchange Rate</div>
              <div className={`font-mono text-sm font-bold ${
                currency === "TON" && isEventActive ? "text-[#f59e0b]" : "text-white"
              }`}>
                {rateLabel}
              </div>
              {currency === "TON" && isEventActive && (
                <div className="mt-0.5 text-[9px] font-mono text-white/25 line-through">
                  {baseRate.toLocaleString()} STRIKER / TON
                </div>
              )}
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

            {/* STRIKER preview */}
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 transition-all ${
              currency === "TON" && isEventActive
                ? "bg-[#f59e0b]/5 border border-[#f59e0b]/20"
                : "bg-[#00ff88]/5 border border-[#00ff88]/15"
            }`}>
              <span className="text-xs font-mono text-white/40">You receive</span>
              <span className={`font-display font-bold text-lg ${
                currency === "TON" && isEventActive ? "text-[#f59e0b]" : "text-[#00ff88]"
              }`}>
                {strikerPreview} STRIKER
              </span>
            </div>

            <Button onClick={handleGenerate} disabled={createDeposit.isPending}
              className="h-12 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30">
              {createDeposit.isPending ? "GENERATING..." : "GENERATE INVOICE"}
            </Button>
          </>
        ) : (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 items-center">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl shadow-[0_0_32px_#00ff8820]">
                <QRCodeSVG value={invoice.payUrl} size={180} level="M" />
              </div>

              {/* Amount */}
              <div className="text-center">
                <div className="font-display font-black text-2xl text-white">
                  {invoice.amount} {invoice.currency}
                </div>
                <div className="text-xs font-mono text-white/30 mt-0.5">
                  ≈ {strikerPreview} STRIKER
                  {invoice.currency === "TON" && isEventActive && (
                    <span className="ml-1 text-[#f59e0b]">⚡ boosted</span>
                  )}
                </div>
              </div>

              {/* Invoice countdown */}
              {invoiceCountdown > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#f59e0b]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Expires in {Math.floor(invoiceCountdown / 60)}:{String(invoiceCountdown % 60).padStart(2, "0")}
                  </span>
                </div>
              )}

              {/* Pay link */}
              <div className="flex gap-2 w-full">
                <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button className="w-full h-11 font-display font-bold tracking-widest bg-[#0098ea] hover:bg-[#0098ea]/90 text-white">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    PAY IN TELEGRAM
                  </Button>
                </a>
                <Button variant="outline" onClick={copyUrl}
                  className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white">
                  {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <button onClick={() => setInvoice(null)}
                className="text-xs font-mono text-white/30 hover:text-white/60 underline">
                Generate new invoice
              </button>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </Layout>
  );
}
