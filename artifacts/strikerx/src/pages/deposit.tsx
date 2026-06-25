import { Layout } from "@/components/layout";
import { useCreateDeposit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, ExternalLink, Copy, Check, Clock, Zap, TrendingUp, Coins,
  Smartphone, FileText, ArrowRight, CheckCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────
type DepositTab = "crypto" | "mpesa" | "manual";
type Currency   = "TON" | "USDT" | "BNB" | "SOL";

const CURRENCIES: { id: Currency; label: string; color: string; symbol: string }[] = [
  { id: "TON",  label: "TON",  color: "#0098ea", symbol: "T" },
  { id: "USDT", label: "USDT", color: "#26a17b", symbol: "$" },
  { id: "BNB",  label: "BNB",  color: "#f0b90b", symbol: "B" },
  { id: "SOL",  label: "SOL",  color: "#9945ff", symbol: "S" },
];

interface Invoice   { payUrl: string; amount: string; currency: string; expiresAt?: string; }
interface RateEvent { active: boolean; depositRate: number; endsAt: string | null; }

const MPESA_NUMBER    = "174379";
const KES_PER_STRIKER = 1.3;

// ─── Deposit ──────────────────────────────────────────────────────────────────
export function Deposit() {
  const { toast } = useToast();
  const { token } = useAuth();
  const createDeposit = useCreateDeposit();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const { data: rateEvent } = useQuery<RateEvent>({
    queryKey: ["rate-event"],
    queryFn: async () => (await fetch("/api/public/rate-event")).json() as Promise<RateEvent>,
    refetchInterval: 60_000,
  });

  const [tab, setTab]         = useState<DepositTab>("crypto");
  const [currency, setCurrency] = useState<Currency>("TON");
  const [amount, setAmount]   = useState("5");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied]   = useState(false);
  const [countdown, setCountdown]       = useState(0);
  const [rateCountdown, setRateCountdown] = useState(0);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // M-Pesa state
  const [mpesaPhone, setMpesaPhone]         = useState("");
  const [mpesaAmountKes, setMpesaAmountKes] = useState("");
  const [mpesaRef, setMpesaRef]             = useState("");
  const [mpesaStep, setMpesaStep]           = useState<"form" | "done">("form");
  const [mpesaLoading, setMpesaLoading]     = useState(false);

  // Manual state
  const [manualPhone, setManualPhone]         = useState("");
  const [manualAmountKes, setManualAmountKes] = useState("");
  const [manualRef, setManualRef]             = useState("");
  const [manualNote, setManualNote]           = useState("");
  const [manualDone, setManualDone]           = useState(false);
  const [manualLoading, setManualLoading]     = useState(false);

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

  const MIN_DEPOSIT = 5;

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_DEPOSIT) { toast({ title: `Minimum deposit is ${MIN_DEPOSIT} TON`, variant: "destructive" }); return; }
    try {
      const res = await createDeposit.mutateAsync({ data: { currency: currency as "TON" | "USDT_TON" | "USDT_TRC20" | "BNB" | "SOL" } });
      setInvoice({ payUrl: res.payLink ?? "#", amount, currency, expiresAt: res.expiresAt });
      setCountdown(res.expiresAt ? Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000) : 0);
    } catch (e: unknown) {
      toast({ title: "Invoice error", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleMpesaSubmit = async () => {
    const kes = parseFloat(mpesaAmountKes);
    if (!mpesaPhone.trim())       { toast({ title: "Enter your M-Pesa phone number", variant: "destructive" }); return; }
    if (!kes || kes < 10)         { toast({ title: "Minimum deposit is KES 10", variant: "destructive" }); return; }
    if (!mpesaRef.trim())         { toast({ title: "Enter the M-Pesa reference code", variant: "destructive" }); return; }
    setMpesaLoading(true);
    try {
      const r = await fetch("/api/payments/deposit/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: "mpesa", phoneNumber: mpesaPhone.trim(), amountKes: kes, reference: mpesaRef.trim() }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Failed to submit");
      setMpesaStep("done");
    } catch (e: unknown) {
      toast({ title: "Submission failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMpesaLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    const kes = parseFloat(manualAmountKes);
    if (!kes || kes < 10)                              { toast({ title: "Minimum deposit is KES 10", variant: "destructive" }); return; }
    if (!manualRef.trim() || manualRef.trim().length < 4) { toast({ title: "Enter a valid reference code", variant: "destructive" }); return; }
    setManualLoading(true);
    try {
      const r = await fetch("/api/payments/deposit/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          method: "bank",
          phoneNumber: manualPhone.trim() || undefined,
          amountKes: kes,
          reference: manualRef.trim(),
          note: manualNote.trim() || undefined,
        }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Failed to submit");
      setManualDone(true);
    } catch (e: unknown) {
      toast({ title: "Submission failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setManualLoading(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(invoice?.payUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const effectiveRate      = rateEvent?.active ? rateEvent.depositRate : 100;
  const amtNum             = parseFloat(amount || "0") || 0;
  const strikerPreview     = currency === "TON" ? Math.round(amtNum * effectiveRate).toLocaleString() : "~";
  const mpesaKesNum        = parseFloat(mpesaAmountKes || "0") || 0;
  const mpesaStrikerPreview = Math.floor(mpesaKesNum / KES_PER_STRIKER);
  const manualKesNum       = parseFloat(manualAmountKes || "0") || 0;
  const manualStrikerPreview = Math.floor(manualKesNum / KES_PER_STRIKER);

  const fmtCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  };

  const me2 = me as Record<string, unknown> | undefined;
  const tonBalance     = parseFloat(String(me2?.tonBalance ?? 0));
  const strikerBalance = parseFloat(String(me2?.strikerBalance ?? 0));

  const TABS: { id: DepositTab; label: string; icon: typeof Wallet }[] = [
    { id: "crypto", label: "CRYPTO",  icon: Wallet },
    { id: "mpesa",  label: "M-PESA",  icon: Smartphone },
    { id: "manual", label: "MANUAL",  icon: FileText },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── HEADER ── */}
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-black text-sm tracking-widest text-white uppercase">Deposit Funds</span>
        </div>

        {/* ── BALANCES ── */}
        {me2 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/3 border border-white/8 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3 h-3 text-[#0098ea]" />
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Trading Wallet</span>
              </div>
              <div className="font-black text-base text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {tonBalance.toFixed(2)} <span className="text-[#0098ea] font-bold text-sm">TON</span>
              </div>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Coins className="w-3 h-3 text-[#fbbf24]" />
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Casino</span>
              </div>
              <div className="font-black text-base text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {strikerBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[#fbbf24] font-bold text-sm">SKR</span>
              </div>
            </div>
          </div>
        )}

        {/* ── RATE EVENT BANNER ── */}
        <AnimatePresence>
          {rateEvent?.active && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative overflow-hidden rounded-xl border border-[#fbbf24]/40 p-4"
              style={{ background: "linear-gradient(135deg, #f59e0b18, #fbbf2408)" }}
            >
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Zap className="w-5 h-5 text-[#fbbf24] shrink-0" />
                </motion.div>
                <div className="flex-1">
                  <div className="font-black text-sm text-[#fbbf24] tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    BONUS RATE · {effectiveRate} STRIKER / TON
                  </div>
                  {rateCountdown > 0 && (
                    <div className="text-[10px] font-mono text-[#fbbf24]/55 mt-0.5">
                      Ends in {fmtCountdown(rateCountdown)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-mono text-[#fbbf24]/40 mb-0.5">vs normal</div>
                  <div className="text-[10px] font-mono text-[#fbbf24]/60 line-through">100 SKR/TON</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TABS ── */}
        <div className="grid grid-cols-3 gap-1.5 bg-white/3 rounded-xl p-1 border border-white/6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold tracking-wider transition-all ${
                tab === id
                  ? "bg-[#00ff88] text-[#0a0e1a] shadow-sm"
                  : "text-white/35 hover:text-white/65"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── CRYPTO TAB ──────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "crypto" && (
            <motion.div key="crypto" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className="flex flex-col gap-4">

              <AnimatePresence mode="wait">
                {!invoice ? (
                  <motion.div key="form" className="flex flex-col gap-4">

                    {/* "What you'll get" hero card */}
                    <div className="bg-gradient-to-br from-[#00ff88]/8 to-transparent border border-[#00ff88]/20 rounded-2xl p-4">
                      <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-3">What you get</div>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-lg bg-[#0098ea]/15 flex items-center justify-center">
                              <TrendingUp className="w-3 h-3 text-[#0098ea]" />
                            </div>
                            <span className="text-xs font-mono text-white/50">Trading wallet (TON)</span>
                          </div>
                          <span className="font-black text-base text-white tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {currency === "TON"
                              ? `${amtNum > 0 ? amtNum.toFixed(2) : "—"} TON`
                              : `${amtNum > 0 ? amtNum.toFixed(4) : "—"} ${currency}`
                            }
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-lg bg-[#fbbf24]/15 flex items-center justify-center">
                              <Coins className="w-3 h-3 text-[#fbbf24]" />
                            </div>
                            <span className="text-xs font-mono text-white/50">STRIKER (casino)</span>
                          </div>
                          <span className={`font-black text-base tabular-nums ${rateEvent?.active ? "text-[#fbbf24]" : "text-[#00ff88]"}`}
                            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {strikerPreview} SKR
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Currency selector */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {CURRENCIES.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setCurrency(c.id)}
                          className={`py-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all relative overflow-hidden ${
                            currency === c.id ? "" : "border-white/8 text-white/30 hover:border-white/20"
                          }`}
                          style={{
                            color:       currency === c.id ? c.color : undefined,
                            borderColor: currency === c.id ? `${c.color}50` : undefined,
                            background:  currency === c.id ? `${c.color}10` : undefined,
                          }}
                        >
                          {currency === c.id && (
                            <span className="absolute top-0 left-0 right-0 h-0.5" style={{ background: c.color, opacity: 0.6 }} />
                          )}
                          <span className="text-sm font-black leading-none">{c.symbol}</span>
                          <span className="font-bold text-[10px]">{c.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Amount input */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">
                        Amount ({currency})
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="number" step="1" min="5"
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                          className="bg-white/5 border-white/10 text-white font-mono font-bold h-12 text-base flex-1"
                        />
                        {["5", "10", "25", "50"].map(v => (
                          <button
                            key={v}
                            onClick={() => setAmount(v)}
                            className={`text-[10px] font-mono border rounded-xl px-2 transition-all ${
                              amount === v
                                ? "border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/8"
                                : "border-white/8 text-white/35 hover:text-[#00ff88] hover:border-[#00ff88]/30"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      {amtNum > 0 && amtNum < MIN_DEPOSIT && (
                        <p className="text-[10px] font-mono text-[#f59e0b] mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" />
                          Minimum {MIN_DEPOSIT} TON
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={handleGenerate}
                      disabled={createDeposit.isPending}
                      className="h-12 font-black tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/85 text-[#0a0e1a] disabled:opacity-30 shadow-[0_0_20px_#00ff8825]"
                    >
                      {createDeposit.isPending
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                        : <>Generate Invoice <ArrowRight className="w-4 h-4 ml-2" /></>
                      }
                    </Button>

                    <div className="text-center text-[9px] font-mono text-white/20">
                      {effectiveRate} STRIKER per 1 TON · trading balance added directly
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="invoice" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4 items-center">

                    {/* QR */}
                    <div className="bg-white p-4 rounded-2xl shadow-[0_0_40px_#00ff8818]">
                      <QRCodeSVG value={invoice.payUrl} size={176} level="M" />
                    </div>

                    {/* Details */}
                    <div className="text-center w-full">
                      <div className="font-black text-2xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {invoice.amount} {invoice.currency}
                      </div>
                      <div className="text-xs font-mono text-white/30 mt-1">
                        → trading wallet + {strikerPreview} STRIKER
                      </div>
                    </div>

                    {/* Awaiting confirmation */}
                    <div className="w-full flex items-center gap-2 justify-center bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      />
                      <span className="text-xs font-mono text-white/40">Awaiting payment confirmation…</span>
                      {countdown > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-xs font-mono text-[#f59e0b]">
                          <Clock className="w-3 h-3" />
                          {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="flex gap-2 w-full">
                      <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button className="w-full h-11 font-bold tracking-widest bg-[#0098ea] hover:bg-[#0098ea]/85 text-white flex items-center justify-center gap-2">
                          <ExternalLink className="w-4 h-4" />
                          Pay in Telegram
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        onClick={copyUrl}
                        className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white"
                      >
                        {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>

                    <button
                      onClick={() => setInvoice(null)}
                      className="text-xs font-mono text-white/25 hover:text-white/55 transition-colors"
                    >
                      Generate new invoice
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── M-PESA TAB ──────────────────────────────────────────────────── */}
          {tab === "mpesa" && (
            <motion.div key="mpesa" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className="flex flex-col gap-4">

              <AnimatePresence mode="wait">
                {mpesaStep === "done" ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-[#00ff88]" />
                    </div>
                    <div>
                      <div className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        Reference Submitted!
                      </div>
                      <div className="text-xs font-mono text-white/35 mt-2 leading-relaxed max-w-xs">
                        Our team will verify your M-Pesa payment and credit your balance within minutes.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/25 mb-0.5">Reference</div><div className="text-[#00ff88] font-bold">{mpesaRef.toUpperCase()}</div></div>
                        <div><div className="text-white/25 mb-0.5">Amount</div><div className="text-white font-bold">KES {mpesaAmountKes}</div></div>
                        <div><div className="text-white/25 mb-0.5">Est. STRIKER</div><div className="text-[#fbbf24] font-bold">{mpesaStrikerPreview.toLocaleString()} SKR</div></div>
                        <div><div className="text-white/25 mb-0.5">Status</div><div className="text-white/50">Under review</div></div>
                      </div>
                    </div>
                    <Button
                      onClick={() => { setMpesaStep("form"); setMpesaRef(""); setMpesaAmountKes(""); setMpesaPhone(""); }}
                      variant="outline"
                      className="border-white/10 text-white/50 hover:text-white hover:border-white/20"
                    >
                      Submit another
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    {/* Step-by-step instructions */}
                    <div className="bg-gradient-to-br from-[#00a651]/10 to-transparent border border-[#00a651]/25 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Smartphone className="w-4 h-4 text-[#00a651]" />
                        <span className="font-bold text-sm text-[#00a651] tracking-wider uppercase">M-Pesa Instructions</span>
                      </div>
                      <div className="space-y-2.5 text-xs font-mono text-white/55">
                        {[
                          <>Go to M-Pesa → <strong className="text-white">Lipa na M-Pesa → Paybill</strong></>,
                          <>Business No: <strong className="text-white text-sm">{MPESA_NUMBER}</strong></>,
                          <>Account No: <strong className="text-white">Your Telegram username / ID</strong></>,
                          <>Enter amount, confirm, <strong className="text-white">copy the SMS reference code</strong> below</>,
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#00a651]/20 border border-[#00a651]/35 flex items-center justify-center text-[#00a651] font-bold text-[10px] shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rate */}
                    <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs font-mono">
                      <span className="text-white/35">Rate</span>
                      <span className="text-white font-bold">KES {KES_PER_STRIKER.toFixed(2)} → 1 STRIKER</span>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">M-Pesa Phone</label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="0712345678" />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">Amount Sent (KES)</label>
                      <Input type="number" value={mpesaAmountKes} onChange={e => setMpesaAmountKes(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base"
                        placeholder="Min KES 10" />
                      {mpesaKesNum > 0 && (
                        <div className="text-[10px] font-mono text-[#00ff88] mt-1.5 text-right">
                          ≈ {mpesaStrikerPreview.toLocaleString()} STRIKER
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">M-Pesa Reference (from SMS)</label>
                      <Input value={mpesaRef} onChange={e => setMpesaRef(e.target.value.toUpperCase())}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 tracking-widest"
                        placeholder="e.g. QHR9XXXX" />
                    </div>

                    <Button onClick={handleMpesaSubmit} disabled={mpesaLoading}
                      className="h-12 font-bold tracking-widest bg-[#00a651] hover:bg-[#00a651]/85 text-white disabled:opacity-30">
                      {mpesaLoading
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                        : <>Submit Reference <ArrowRight className="w-4 h-4 ml-2" /></>
                      }
                    </Button>

                    <div className="flex items-start gap-2 text-[10px] font-mono text-white/20 leading-relaxed">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Balance is credited manually by our team after verification. Usually within 5–15 minutes during business hours.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── MANUAL TAB ──────────────────────────────────────────────────── */}
          {tab === "manual" && (
            <motion.div key="manual" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className="flex flex-col gap-4">

              <AnimatePresence mode="wait">
                {manualDone ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-[#00ff88]" />
                    </div>
                    <div>
                      <div className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        Deposit Submitted!
                      </div>
                      <div className="text-xs font-mono text-white/35 mt-2 leading-relaxed max-w-xs">
                        Our team will review your payment and credit your balance. You'll receive a notification once confirmed.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/25 mb-0.5">Reference</div><div className="text-[#00ff88] font-bold">{manualRef.toUpperCase()}</div></div>
                        <div><div className="text-white/25 mb-0.5">Amount</div><div className="text-white font-bold">KES {manualAmountKes}</div></div>
                        <div><div className="text-white/25 mb-0.5">Est. STRIKER</div><div className="text-[#fbbf24] font-bold">{manualStrikerPreview.toLocaleString()} SKR</div></div>
                        <div><div className="text-white/25 mb-0.5">Status</div><div className="text-white/50">Pending review</div></div>
                      </div>
                    </div>
                    <Button
                      onClick={() => { setManualDone(false); setManualRef(""); setManualAmountKes(""); setManualPhone(""); setManualNote(""); }}
                      variant="outline"
                      className="border-white/10 text-white/50 hover:text-white hover:border-white/20"
                    >
                      Submit another
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                      <div className="text-[10px] font-mono text-white/25 uppercase tracking-wider mb-3">Payment Instructions</div>
                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-white/35">M-Pesa Paybill</span><span className="text-white font-bold">{MPESA_NUMBER}</span></div>
                        <div className="flex justify-between"><span className="text-white/35">Account No.</span><span className="text-white font-bold">Your Username</span></div>
                        <div className="border-t border-white/5 pt-2 mt-1">
                          <div className="text-white/25 text-[10px]">After payment, fill in the form below with your reference code.</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs font-mono">
                      <span className="text-white/35">Conversion rate</span>
                      <span className="text-white font-bold">KES {KES_PER_STRIKER.toFixed(2)} = 1 STRIKER</span>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">Amount Paid (KES)</label>
                      <Input type="number" value={manualAmountKes} onChange={e => setManualAmountKes(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base"
                        placeholder="e.g. 500" />
                      {manualKesNum > 0 && (
                        <div className="text-[10px] font-mono text-[#00ff88] mt-1.5 text-right">
                          ≈ {manualStrikerPreview.toLocaleString()} STRIKER
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">Reference / Transaction Code</label>
                      <Input value={manualRef} onChange={e => setManualRef(e.target.value.toUpperCase())}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 tracking-widest"
                        placeholder="e.g. QHR9XXXX" />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">Phone Number (optional)</label>
                      <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="0712345678" />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-2">Notes (optional)</label>
                      <Input value={manualNote} onChange={e => setManualNote(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="Bank name, transfer details, etc." />
                    </div>

                    <Button onClick={handleManualSubmit} disabled={manualLoading}
                      className="h-12 font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 border border-white/10">
                      {manualLoading
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                        : <>Submit for Review <ArrowRight className="w-4 h-4 ml-2" /></>
                      }
                    </Button>

                    <div className="flex items-start gap-2 text-[10px] font-mono text-white/20 leading-relaxed">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Manual deposits are processed by our team. Confirmed deposits are credited within 5–30 minutes.</span>
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
