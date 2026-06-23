import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import {
  useGetMyReferral,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  User, Wallet, ArrowDownToLine, ArrowUpFromLine, Copy, Check,
  Shield, Globe, LogOut, ChevronRight, Star, FlaskConical,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, saveLangLocally, getLangDir, type LangCode } from "@/i18n";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

const VIP_TIERS  = ["Sunday League", "Championship", "Premier League", "Champions League", "World Cup"];
const VIP_COLORS = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];

// Use VITE_MINI_APP_LINK env var or fall back to the known production link
const MINI_APP_LINK = (import.meta.env.VITE_MINI_APP_LINK as string | undefined) ?? "https://t.me/StrykkerXBot/StrikerX";

export function Account() {
  const { player, token, setToken } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showLang, setShowLang] = useState(false);

  const { data: referral } = useGetMyReferral();
  const { data: me }       = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled: !!token } });

  const p        = (me ?? player) as Record<string, unknown> | null;
  const vipTier  = p?.vipTier as string ?? "sunday_league";
  const vipIdx   = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const vipName  = VIP_TIERS[vipIdx]  ?? "Sunday League";
  const vipColor = VIP_COLORS[vipIdx] ?? "#6b7280";
  const tonWagered    = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(vipIdx + 1, 4)] ?? 1000;
  const isMaxTier     = vipIdx >= 4;
  const vipProgress   = isMaxTier ? 100 : Math.min(100, (tonWagered / nextThreshold) * 100);

  const initials = (p?.username as string ?? "?").slice(0, 2).toUpperCase();

  const demoBalance  = parseFloat(String(p?.demoUsdtBalance ?? 10000));
  const tonBalance   = parseFloat(String(p?.tonBalance ?? 0));
  const usdtBalance  = parseFloat(String(p?.usdtBalance ?? 0));
  const strkBalance  = Math.round(parseFloat(String(p?.strikerBalance ?? 0)));
  const kycStatus    = p?.kycStatus as string ?? "none";

  const kycLabels: Record<string, string> = { none: "Not started", pending: "Under review", verified: "Verified", rejected: "Rejected" };
  const kycColors: Record<string, string> = { none: "#6b7280", pending: "#f59e0b", verified: "#22c55e", rejected: "#ef4444" };

  function copyRef() {
    const code = referral?.code ?? "";
    if (!code) return;
    const link = `${MINI_APP_LINK}?startapp=${code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLangChange(code: LangCode) {
    saveLangLocally(code);
    await i18n.changeLanguage(code);
    document.documentElement.dir = getLangDir(code);
    document.documentElement.lang = code;
    setShowLang(false);
    if (token) {
      fetch("/api/players/me/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: code }),
      }).catch(() => {});
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("strikerx_demo_mode");
    toast({ title: "Logged out" });
  }

  if (!player) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 gap-4 px-4">
          <User size={40} className="text-muted-foreground" />
          <p className="text-muted-foreground text-sm text-center">Open StrikerX in Telegram to access your account</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
        {/* Profile header */}
        <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg"
            style={{ background: `${vipColor}20`, color: vipColor }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-base truncate">@{p?.username as string ?? "player"}</p>
            <p className="text-[11px] font-bold" style={{ color: vipColor }}>{vipName}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest">VIP Progress</p>
            <p className="text-xs font-bold">{tonWagered.toFixed(1)} / {nextThreshold} TON</p>
          </div>
        </div>

        {/* VIP progress bar */}
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden -mt-1">
          <motion.div
            className="h-full rounded-full"
            style={{ background: vipColor, width: `${vipProgress}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${vipProgress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>

        {/* Balance overview */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2.5 flex items-center gap-1">
            <Wallet size={9} />
            Real Balance
          </p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-muted/50 rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-muted-foreground">TON</p>
              <p className="font-mono font-black text-base text-[#0098ea]">{tonBalance.toFixed(4)}</p>
            </div>
            <div className="flex-1 bg-muted/50 rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-muted-foreground">USDT</p>
              <p className="font-mono font-black text-base text-[#26a17b]">{usdtBalance.toFixed(2)}</p>
            </div>
            <div className="flex-1 bg-muted/50 rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-muted-foreground">STRK</p>
              <p className="font-mono font-black text-base text-primary">{strkBalance.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/deposit" className="flex-1">
              <Button className="w-full h-9 gap-1.5" variant="default" size="sm">
                <ArrowDownToLine size={13} />
                Deposit
              </Button>
            </Link>
            <Link href="/withdraw" className="flex-1">
              <Button className="w-full h-9 gap-1.5" variant="outline" size="sm">
                <ArrowUpFromLine size={13} />
                Withdraw
              </Button>
            </Link>
          </div>
        </div>

        {/* Demo balance */}
        <div className="bg-card border border-amber-500/20 rounded-xl p-3">
          <p className="text-[9px] text-amber-400/80 uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
            <FlaskConical size={9} />
            Demo Balance
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono font-black text-base text-amber-300">${demoBalance.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">Virtual USDT — practice mode</p>
            </div>
            <Link href="/">
              <Button size="sm" variant="outline" className="text-[10px] border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
                Go to Trading
              </Button>
            </Link>
          </div>
        </div>

        {/* Referral */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Referral Link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs font-bold bg-muted px-2.5 py-1.5 rounded-lg text-primary truncate">
              {referral?.code ? `${MINI_APP_LINK}?startapp=${referral.code}` : "—"}
            </code>
            <button
              onClick={copyRef}
              className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors shrink-0"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-muted-foreground" />}
            </button>
          </div>
          {referral && (
            <p className="text-[9px] text-muted-foreground mt-1.5">
              {referral.totalReferred} referral{referral.totalReferred !== 1 ? "s" : ""} · Earn 5% of their winnings for life
            </p>
          )}
        </div>

        {/* KYC */}
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-muted-foreground" />
              <div>
                <p className="text-xs font-bold">Identity Verification</p>
                <p className="text-[10px]" style={{ color: kycColors[kycStatus] ?? "#6b7280" }}>
                  {kycLabels[kycStatus] ?? kycStatus}
                </p>
              </div>
            </div>
            {(kycStatus === "none" || kycStatus === "rejected") && (
              <Link href="/profile">
                <button className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                  Verify <ChevronRight size={10} />
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowLang(!showLang)}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-xs font-bold">Language</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.label ?? "English"}
              <ChevronRight size={11} className={`transition-transform ${showLang ? "rotate-90" : ""}`} />
            </div>
          </button>

          <AnimatePresence>
            {showLang && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="grid grid-cols-2 gap-1 p-2">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLangChange(lang.code as LangCode)}
                      className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        i18n.language === lang.code
                          ? "bg-primary/15 text-primary font-bold"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={13} />
          Log Out
        </button>
      </div>
    </Layout>
  );
}
