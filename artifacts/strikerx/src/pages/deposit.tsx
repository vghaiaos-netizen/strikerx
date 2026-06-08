import { Layout } from "@/components/layout";
import { useCreateDeposit, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ExternalLink, Copy, Check, Clock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Currency = "TON" | "USDT" | "BNB" | "SOL";
const CURRENCIES: { id: Currency; label: string; color: string; rate: string }[] = [
  { id: "TON",  label: "TON",    color: "#0098ea", rate: "100 STRIKER / TON"  },
  { id: "USDT", label: "USDT",   color: "#26a17b", rate: "Approx rate"        },
  { id: "BNB",  label: "BNB",    color: "#f0b90b", rate: "Approx rate"        },
  { id: "SOL",  label: "SOL",    color: "#9945ff", rate: "Approx rate"        },
];

interface Invoice { payUrl: string; amount: string; currency: string; expiresAt?: string; }

export function Deposit() {
  const { toast } = useToast();
  const createDeposit = useCreateDeposit();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [currency, setCurrency] = useState<Currency>("TON");
  const [amount, setAmount] = useState("1");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    try {
      const res = await createDeposit.mutateAsync({ data: { currency: currency as "TON" | "USDT_TON" | "USDT_TRC20" | "BNB" | "SOL" } });
      setInvoice({ payUrl: res.payLink ?? "#", amount: amount, currency, expiresAt: res.expiresAt });
      setCountdown(res.expiresAt ? Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000) : 0);
    } catch (e: unknown) {
      toast({ title: "Failed to generate invoice", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(invoice?.payUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedCurr = CURRENCIES.find(c => c.id === currency)!;
  const strikerPreview = currency === "TON" ? (parseFloat(amount || "0") * 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "~";

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#00ff88]" />
          <span className="font-display font-bold text-sm tracking-widest text-white">ADD FUNDS</span>
          {me && (
            <span className="ml-auto text-xs font-mono text-white/30">
              {Number(me?.strikerBalance ?? 0).toLocaleString()} STRIKER
            </span>
          )}
        </div>

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
              <div className="text-[10px] font-mono text-white/30 mb-0.5">Exchange Rate</div>
              <div className="font-mono text-sm font-bold text-white">{selectedCurr.rate}</div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/30 block mb-1.5">Amount ({currency})</label>
              <Input type="number" step="0.1" min="0.1" value={amount} onChange={e => setAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono font-bold h-11 text-base" />
            </div>

            {/* Preview */}
            <div className="flex items-center justify-between bg-[#00ff88]/5 border border-[#00ff88]/15 rounded-xl px-4 py-3">
              <span className="text-xs font-mono text-white/40">You receive</span>
              <span className="font-display font-bold text-lg text-[#00ff88]">{strikerPreview} STRIKER</span>
            </div>

            <Button onClick={handleGenerate} disabled={createDeposit.isPending}
              className="h-12 font-display font-bold tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] disabled:opacity-30">
              {createDeposit.isPending ? "GENERATING..." : "GENERATE INVOICE"}
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
                  <span>Expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
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
                <Button variant="outline" onClick={copyUrl} className="h-11 w-11 p-0 border-white/10 bg-white/5 hover:bg-white/10 text-white">
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
