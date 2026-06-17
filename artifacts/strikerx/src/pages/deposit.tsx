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
  Smartphone, FileText, ArrowRight, CheckCircle, AlertCircle, RefreshCw
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";

type DepositTab = "crypto" | "mpesa" | "manual";
type Currency = "TON" | "USDT" | "BNB" | "SOL";

const CURRENCIES: { id: Currency; label: string; color: string; symbol: string }[] = [
  { id: "TON",  label: "TON",  color: "#0098ea", symbol: "◈" },
  { id: "USDT", label: "USDT", color: "#26a17b", symbol: "$" },
  { id: "BNB",  label: "BNB",  color: "#f0b90b", symbol: "⬡" },
  { id: "SOL",  label: "SOL",  color: "#9945ff", symbol: "◎" },
];

interface Invoice { payUrl: string; amount: string; currency: string; expiresAt?: string; }
interface RateEvent { active: boolean; depositRate: number; endsAt: string | null; }

const MPESA_NUMBER = "174379";
const KES_PER_STRIKER = 1.3;

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

  const [tab, setTab] = useState<DepositTab>("crypto");
  const [currency, setCurrency] = useState<Currency>("TON");
  const [amount, setAmount] = useState("1");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [rateCountdown, setRateCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // M-Pesa state
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaAmountKes, setMpesaAmountKes] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [mpesaStep, setMpesaStep] = useState<"form" | "pending" | "done">("form");
  const [mpesaLoading, setMpesaLoading] = useState(false);

  // Manual state
  const [manualPhone, setManualPhone] = useState("");
  const [manualAmountKes, setManualAmountKes] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualDone, setManualDone] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);

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

  const handleMpesaSubmit = async () => {
    const kes = parseFloat(mpesaAmountKes);
    if (!mpesaPhone.trim()) { toast({ title: "Enter your M-Pesa phone number", variant: "destructive" }); return; }
    if (!kes || kes < 10) { toast({ title: "Minimum deposit is KES 10", variant: "destructive" }); return; }
    if (!mpesaRef.trim()) { toast({ title: "Enter the M-Pesa reference code", variant: "destructive" }); return; }

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
    if (!kes || kes < 10) { toast({ title: "Minimum deposit is KES 10", variant: "destructive" }); return; }
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

  const effectiveRate = rateEvent?.active ? rateEvent.depositRate : 100;
  const amtNum = parseFloat(amount || "0") || 0;
  const strikerPreview = currency === "TON" ? (amtNum * effectiveRate).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "~";
  const fmtRateCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  };

  const tonBalance = parseFloat(String(me?.tonBalance ?? 0));
  const strikerBalance = parseFloat(String(me?.strikerBalance ?? 0));
  const mpesaKesNum = parseFloat(mpesaAmountKes || "0") || 0;
  const mpesaStrikerPreview = Math.floor(mpesaKesNum / KES_PER_STRIKER);
  const manualKesNum = parseFloat(manualAmountKes || "0") || 0;
  const manualStrikerPreview = Math.floor(manualKesNum / KES_PER_STRIKER);

  const TABS: { id: DepositTab; label: string; icon: typeof Wallet }[] = [
    { id: "crypto", label: "CRYPTO", icon: Wallet },
    { id: "mpesa",  label: "M-PESA", icon: Smartphone },
    { id: "manual", label: "MANUAL", icon: FileText },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">DEPOSIT FUNDS</span>
        </div>

        {/* Balances */}
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

        {/* Rate event banner */}
        <AnimatePresence>
          {rateEvent?.active && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="relative overflow-hidden rounded-xl border border-[#fbbf24]/40 bg-gradient-to-r from-[#fbbf24]/15 via-[#f59e0b]/10 to-[#fbbf24]/15 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-[#fbbf24] shrink-0" />
                <div className="flex-1">
                  <div className="font-display font-bold text-sm text-[#fbbf24] tracking-wider">
                    BONUS RATE — {effectiveRate} STRIKER / TON
                  </div>
                  {rateCountdown > 0 && (
                    <div className="text-[10px] font-mono text-[#fbbf24]/70 mt-0.5">Ends in {fmtRateCountdown(rateCountdown)}</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1.5 bg-white/3 rounded-xl p-1 border border-white/6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-display font-bold tracking-wider transition-all ${
                tab === id
                  ? "bg-[#00ff88] text-[#0a0e1a] shadow-[0_0_12px_#00ff8840]"
                  : "text-white/40 hover:text-white/70"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── CRYPTO TAB ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "crypto" && (
            <motion.div key="crypto" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className="flex flex-col gap-4">
              {!invoice ? (
                <>
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
                          <span className="text-xs text-white/60">STRIKER (casino)</span>
                        </div>
                        <span className={`font-mono text-sm font-bold ${rateEvent?.active ? "text-[#fbbf24]" : "text-[#00ff88]"}`}>
                          {strikerPreview} SKR
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {CURRENCIES.map(c => (
                      <button key={c.id} onClick={() => setCurrency(c.id)}
                        className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${currency === c.id ? "border-current" : "border-white/8 text-white/30 hover:border-white/20"}`}
                        style={{ color: currency === c.id ? c.color : undefined, borderColor: currency === c.id ? c.color : undefined, background: currency === c.id ? `${c.color}12` : undefined }}>
                        <span className="text-lg leading-none">{c.symbol}</span>
                        <span className="font-display font-bold text-xs">{c.label}</span>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Amount ({currency})</label>
                    <div className="flex gap-2">
                      <Input type="number" step="0.1" min="0.1" value={amount} onChange={e => setAmount(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base flex-1" />
                      {["0.5", "1", "5", "10"].map(v => (
                        <button key={v} onClick={() => setAmount(v)}
                          className="text-[10px] font-mono text-white/40 hover:text-[#00ff88] border border-white/8 hover:border-[#00ff88]/40 rounded-lg px-2 transition-all">
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={handleGenerate} disabled={createDeposit.isPending}
                    className="h-12 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30 shadow-[0_0_20px_#00ff8830]">
                    {createDeposit.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating...</> : <>Generate Invoice <ArrowRight className="w-4 h-4 ml-2" /></>}
                  </Button>
                </>
              ) : (
                <AnimatePresence>
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 items-center">
                    <div className="bg-white p-4 rounded-2xl shadow-[0_0_32px_#00ff8820]">
                      <QRCodeSVG value={invoice.payUrl} size={180} level="M" />
                    </div>
                    <div className="text-center">
                      <div className="font-display font-black text-2xl text-white">{invoice.amount} {invoice.currency}</div>
                      <div className="text-xs font-mono text-white/40 mt-1">→ Trading wallet + {strikerPreview} STRIKER</div>
                    </div>
                    {countdown > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-mono text-[#f59e0b]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
                      </div>
                    )}
                    <div className="flex gap-2 w-full">
                      <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button className="w-full h-11 font-display font-bold tracking-widest bg-[#0098ea] hover:bg-[#0098ea]/90 text-white">
                          <ExternalLink className="w-4 h-4 mr-2" />Pay in Telegram
                        </Button>
                      </a>
                      <Button variant="outline" onClick={copyUrl} className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white">
                        {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <button onClick={() => setInvoice(null)} className="text-xs font-mono text-white/30 hover:text-white/60 underline">
                      Generate new invoice
                    </button>
                  </motion.div>
                </AnimatePresence>
              )}
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
                      <div className="font-display font-black text-xl text-white">Reference Submitted!</div>
                      <div className="text-xs font-mono text-white/40 mt-2 leading-relaxed max-w-xs">
                        Our team will verify your M-Pesa payment and credit your balance within minutes.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/30 mb-0.5">Reference</div><div className="text-[#00ff88] font-bold">{mpesaRef.toUpperCase()}</div></div>
                        <div><div className="text-white/30 mb-0.5">Amount</div><div className="text-white font-bold">KES {mpesaAmountKes}</div></div>
                        <div><div className="text-white/30 mb-0.5">Est. STRIKER</div><div className="text-[#fbbf24] font-bold">{mpesaStrikerPreview.toLocaleString()} SKR</div></div>
                        <div><div className="text-white/30 mb-0.5">Status</div><div className="text-white/60">Under review</div></div>
                      </div>
                    </div>
                    <Button onClick={() => { setMpesaStep("form"); setMpesaRef(""); setMpesaAmountKes(""); setMpesaPhone(""); }}
                      variant="outline" className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
                      Submit another
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    {/* Instructions */}
                    <div className="bg-gradient-to-br from-[#00a651]/10 to-[#00a651]/5 border border-[#00a651]/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Smartphone className="w-4 h-4 text-[#00a651]" />
                        <span className="font-display font-bold text-sm text-[#00a651] tracking-wider">M-PESA INSTRUCTIONS</span>
                      </div>
                      <div className="space-y-2 text-xs font-mono text-white/70">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#00a651]/20 border border-[#00a651]/40 flex items-center justify-center text-[#00a651] font-bold text-[10px] shrink-0 mt-0.5">1</span>
                          <span>Go to M-Pesa → <strong className="text-white">Lipa na M-Pesa → Paybill</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#00a651]/20 border border-[#00a651]/40 flex items-center justify-center text-[#00a651] font-bold text-[10px] shrink-0 mt-0.5">2</span>
                          <span>Business No: <strong className="text-white text-base">{MPESA_NUMBER}</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#00a651]/20 border border-[#00a651]/40 flex items-center justify-center text-[#00a651] font-bold text-[10px] shrink-0 mt-0.5">3</span>
                          <span>Account No: <strong className="text-white">Your Telegram username or ID</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#00a651]/20 border border-[#00a651]/40 flex items-center justify-center text-[#00a651] font-bold text-[10px] shrink-0 mt-0.5">4</span>
                          <span>Enter amount, confirm, and <strong className="text-white">copy the SMS reference code</strong> below</span>
                        </div>
                      </div>
                    </div>

                    {/* Rate info */}
                    <div className="flex items-center justify-between bg-white/3 border border-white/6 rounded-xl px-4 py-3 text-xs font-mono">
                      <span className="text-white/40">Rate</span>
                      <span className="text-white font-bold">KES {KES_PER_STRIKER.toFixed(2)} → 1 STRIKER</span>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">M-Pesa Phone Number</label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="e.g. 0712345678" />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Amount Sent (KES)</label>
                      <Input type="number" value={mpesaAmountKes} onChange={e => setMpesaAmountKes(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base"
                        placeholder="Min KES 10" />
                      {mpesaKesNum > 0 && (
                        <div className="text-[10px] font-mono text-[#00ff88] mt-1 text-right">
                          ≈ {mpesaStrikerPreview.toLocaleString()} STRIKER
                        </div>
                      )}
                    </div>

                    {/* Reference */}
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">M-Pesa Reference Code (from SMS)</label>
                      <Input value={mpesaRef} onChange={e => setMpesaRef(e.target.value.toUpperCase())}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 tracking-widest"
                        placeholder="e.g. QHR9XXXX" />
                    </div>

                    <Button onClick={handleMpesaSubmit} disabled={mpesaLoading}
                      className="h-12 font-display font-bold tracking-widest bg-[#00a651] hover:bg-[#00a651]/90 text-white disabled:opacity-30 shadow-[0_0_20px_#00a65130]">
                      {mpesaLoading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : <>Submit M-Pesa Reference <ArrowRight className="w-4 h-4 ml-2" /></>}
                    </Button>

                    <div className="flex items-start gap-2 text-[10px] font-mono text-white/25 leading-relaxed">
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
                      <div className="font-display font-black text-xl text-white">Deposit Submitted!</div>
                      <div className="text-xs font-mono text-white/40 mt-2 leading-relaxed max-w-xs">
                        Our team will review your payment and credit your balance. You'll receive a notification once confirmed.
                      </div>
                    </div>
                    <div className="bg-white/3 border border-white/6 rounded-xl p-4 w-full text-left">
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div><div className="text-white/30 mb-0.5">Reference</div><div className="text-[#00ff88] font-bold">{manualRef.toUpperCase()}</div></div>
                        <div><div className="text-white/30 mb-0.5">Amount</div><div className="text-white font-bold">KES {manualAmountKes}</div></div>
                        <div><div className="text-white/30 mb-0.5">Est. STRIKER</div><div className="text-[#fbbf24] font-bold">{manualStrikerPreview.toLocaleString()} SKR</div></div>
                        <div><div className="text-white/30 mb-0.5">Status</div><div className="text-white/60">Pending review</div></div>
                      </div>
                    </div>
                    <Button onClick={() => { setManualDone(false); setManualRef(""); setManualAmountKes(""); setManualPhone(""); setManualNote(""); }}
                      variant="outline" className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
                      Submit another
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="flex flex-col gap-4">
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-3">Payment Instructions</div>
                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-white/40">M-Pesa Paybill</span><span className="text-white font-bold">{MPESA_NUMBER}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Account No.</span><span className="text-white font-bold">Your Username</span></div>
                        <div className="border-t border-white/5 pt-2 mt-2">
                          <div className="text-white/30 text-[10px] mb-1">After payment, fill in the form below with your reference code.</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-white/3 border border-white/6 rounded-xl px-4 py-3 text-xs font-mono">
                      <span className="text-white/40">Conversion rate</span>
                      <span className="text-white font-bold">KES {KES_PER_STRIKER.toFixed(2)} = 1 STRIKER</span>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Amount Paid (KES)</label>
                      <Input type="number" value={manualAmountKes} onChange={e => setManualAmountKes(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base"
                        placeholder="e.g. 500" />
                      {manualKesNum > 0 && (
                        <div className="text-[10px] font-mono text-[#00ff88] mt-1 text-right">
                          ≈ {manualStrikerPreview.toLocaleString()} STRIKER
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Reference / Transaction Code</label>
                      <Input value={manualRef} onChange={e => setManualRef(e.target.value.toUpperCase())}
                        className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 tracking-widest"
                        placeholder="e.g. QHR9XXXX" />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Phone Number (optional)</label>
                      <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="e.g. 0712345678" />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Notes (optional)</label>
                      <Input value={manualNote} onChange={e => setManualNote(e.target.value)}
                        className="bg-white/5 border-white/10 text-white font-mono h-11"
                        placeholder="Bank name, transfer details, etc." />
                    </div>

                    <Button onClick={handleManualSubmit} disabled={manualLoading}
                      className="h-12 font-display font-bold tracking-widest bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 border border-white/10">
                      {manualLoading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : <>Submit for Review <ArrowRight className="w-4 h-4 ml-2" /></>}
                    </Button>

                    <div className="flex items-start gap-2 text-[10px] font-mono text-white/25 leading-relaxed">
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
