import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useGetMyStats, getGetMyStatsQueryKey, useRedeemBoot } from "@workspace/api-client-react";
import {
  Trophy, LogOut, Zap, Target, TrendingUp, ShoppingBag,
  ArrowRight, Loader2, ShieldCheck, Gift, ChevronRight,
  Users, Globe, Check, Flame, Star, Crown, Medal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, saveLangLocally, getLangDir, type LangCode } from "@/i18n";

// ─── Constants ────────────────────────────────────────────────────────────────
interface CommunityInfo { groupInviteLink: string | null; miniAppLink: string | null; botUsername: string; }

const VIP_TIERS  = ["Sunday League", "Championship", "Premier League", "Champions League", "World Cup"];
const VIP_COLORS = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];
const VIP_CASHBACK   = ["0%", "2%", "5%", "10%", "15%"];
const VIP_ICONS = [Star, Medal, Trophy, Medal, Crown];

// ─── Profile ──────────────────────────────────────────────────────────────────
export function Profile() {
  const { player, token, setToken } = useAuth();
  const { toast }  = useToast();
  const { t } = useTranslation();
  const { i18n } = useTranslation();

  const [bootAmount, setBootAmount]     = useState("");
  const [showBootShop, setShowBootShop] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showKyc, setShowKyc]           = useState(false);
  const [kycFullName, setKycFullName]   = useState("");
  const [kycCountry, setKycCountry]     = useState("");
  const [kycDocType, setKycDocType]     = useState("passport");
  const [kycSubmitting, setKycSubmitting] = useState(false);

  const { data: stats }  = useGetMyStats({ query: { queryKey: getGetMyStatsQueryKey() } });
  const redeemBootMut    = useRedeemBoot();
  const { data: community } = useQuery<CommunityInfo>({
    queryKey: ["community"],
    queryFn: async () => (await fetch("/api/public/community")).json() as Promise<CommunityInfo>,
    staleTime: 300_000,
  });

  // ── Derived player data ────────────────────────────────────────────────────
  const p          = player as Record<string, unknown> | null;
  const username   = p?.username as string ?? "Player";
  const telegramId = p?.telegramId as string ?? "";
  const vipTier    = p?.vipTier as string ?? "sunday_league";
  const vipIdx     = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const safeVipIdx = vipIdx < 0 ? 0 : vipIdx;
  const vipName    = VIP_TIERS[safeVipIdx] ?? "Sunday League";
  const vipColor   = VIP_COLORS[safeVipIdx] ?? "#6b7280";
  const tonWagered     = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold  = VIP_THRESHOLDS[Math.min(safeVipIdx + 1, 4)] ?? 1000;
  const isMaxTier      = safeVipIdx >= 4;
  const vipProgress    = isMaxTier ? 100 : Math.min(100, (tonWagered / nextThreshold) * 100);
  const initials       = username.slice(0, 2).toUpperCase();
  const strikerBalance = Number(p?.strikerBalance ?? 0);
  const bootBalance    = Number(p?.bootBalance    ?? 0);
  const captainBalance = Number(p?.captainBalance ?? 0);
  const kycStatus      = p?.kycStatus as string ?? "none";

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleLangChange(code: LangCode) {
    saveLangLocally(code);
    await i18n.changeLanguage(code);
    document.documentElement.dir  = getLangDir(code);
    document.documentElement.lang = code;
    setShowLangPicker(false);
    if (token) {
      fetch("/api/players/me/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: code }),
      }).catch(() => {});
    }
  }

  const handleBootRedeem = async () => {
    const amount = Number(bootAmount);
    if (!amount || amount <= 0) { toast({ title: t("profile.enterValid"), variant: "destructive" }); return; }
    try {
      const result = await redeemBootMut.mutateAsync({ data: { amount } });
      toast({ title: t("profile.redeemSuccess"), description: t("profile.redeemSuccessDesc", { amount: result.redeemedBoot }) });
      setBootAmount(""); setShowBootShop(false);
    } catch (e: unknown) {
      toast({ title: t("profile.redeemFailed"), description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleKycSubmit = async () => {
    setKycSubmitting(true);
    try {
      const r = await fetch("/api/players/me/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ fullName: kycFullName.trim(), country: kycCountry.trim(), docType: kycDocType }),
      });
      if (r.ok) {
        toast({ title: t("profile.kycSubmitted"), description: t("profile.kycSubmittedDesc") });
        setKycFullName(""); setKycCountry(""); setShowKyc(false);
      } else {
        const d = await r.json() as { error?: string };
        toast({ title: t("profile.kycFailed"), description: d.error ?? t("errors.unknownError"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("profile.networkError"), variant: "destructive" });
    } finally {
      setKycSubmitting(false);
    }
  };

  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.label ?? "English";

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-8">

        {/* ── HERO PLAYER CARD ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${vipColor}18 0%, #0d1420 60%)`,
            border: `1px solid ${vipColor}35`,
            boxShadow: `0 0 32px ${vipColor}12`,
          }}
        >
          {/* Top-right glow */}
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${vipColor}18 0%, transparent 70%)` }} />

          <div className="relative p-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-[#0a0e1a]"
                  style={{
                    background: `linear-gradient(135deg, ${vipColor}, ${vipColor}88)`,
                    boxShadow: `0 0 20px ${vipColor}40`,
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {initials}
                </div>
                <div
                  className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-black"
                  style={{ background: `${vipColor}25`, border: `1px solid ${vipColor}50`, color: vipColor }}
                >
                  {vipName.split(" ").map(w => w[0]).join("")}
                </div>
              </div>

              {/* Name + tier */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="font-black text-lg text-white truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {username}
                </div>
                <div className="text-[10px] font-mono text-white/30">#{telegramId}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Trophy className="w-3 h-3" style={{ color: vipColor }} />
                  <span className="text-xs font-mono font-bold" style={{ color: vipColor }}>{vipName}</span>
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { localStorage.removeItem("strikerx_token"); setToken(null); }}
                className="p-2 rounded-xl border border-white/8 text-white/25 hover:text-white/60 hover:border-white/20 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Balances row */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="col-span-1 bg-black/25 rounded-xl p-3 text-center">
                <div className="text-[8px] font-mono uppercase tracking-wider text-[#00ff88]/50 mb-0.5">STRIKER</div>
                <div className="font-black text-base text-[#00ff88] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {strikerBalance.toLocaleString()}
                </div>
              </div>
              <div className="bg-black/25 rounded-xl p-3 text-center">
                <div className="text-[8px] font-mono uppercase tracking-wider text-[#f59e0b]/50 mb-0.5">BOOT</div>
                <div className="font-black text-base text-[#f59e0b] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {bootBalance.toLocaleString()}
                </div>
              </div>
              <div className="bg-black/25 rounded-xl p-3 text-center">
                <div className="text-[8px] font-mono uppercase tracking-wider text-[#a855f7]/50 mb-0.5">CAPTAIN</div>
                <div className="font-black text-base text-[#a855f7] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {captainBalance.toLocaleString()}
                </div>
              </div>
            </div>

            {/* VIP progress bar */}
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-mono text-white/35">
                  {isMaxTier
                    ? "Max tier reached"
                    : `${tonWagered.toFixed(1)} / ${nextThreshold} TON → ${VIP_TIERS[safeVipIdx + 1] ?? ""}`
                  }
                </span>
                <span className="text-[9px] font-mono font-bold" style={{ color: vipColor }}>{Math.round(vipProgress)}%</span>
              </div>
              <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${vipProgress}%` }}
                  transition={{ duration: 0.9, delay: 0.2 }}
                  style={{ background: `linear-gradient(90deg, ${vipColor}70, ${vipColor})` }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── STATS ROW ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Games",    value: String(stats?.totalGames ?? 0),                              color: "#00ff88", Icon: TrendingUp },
            { label: "Win Rate", value: `${((stats?.winRate ?? 0) * 100).toFixed(0)}%`,             color: "#3b82f6", Icon: Target     },
            { label: "Best Multi",value: `${(stats?.biggestMultiplier ?? 0)}×`,                      color: "#f59e0b", Icon: Zap        },
          ].map(({ label, value, color, Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="bg-white/3 border border-white/8 rounded-xl p-3 text-center"
            >
              <Icon className="w-3.5 h-3.5 mx-auto mb-1.5" style={{ color }} />
              <div className="font-black text-sm text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
              <div className="text-[8px] font-mono text-white/30 mt-0.5 uppercase tracking-wide">{label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── VIP TIER ROADMAP ────────────────────────────────────────────── */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
          <div className="text-[10px] font-mono font-bold text-white/35 uppercase tracking-wider mb-3">VIP Roadmap</div>
          <div className="flex items-center gap-0">
            {VIP_TIERS.map((tier, i) => {
              const color = VIP_COLORS[i] ?? "#6b7280";
              const isCurrent = i === safeVipIdx;
              const isPast    = i < safeVipIdx;
              const TierIcon  = VIP_ICONS[i] ?? Star;
              return (
                <div key={tier} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <motion.div
                      animate={isCurrent ? { scale: [1, 1.12, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-7 h-7 rounded-full flex items-center justify-center border"
                      style={{
                        background: isPast || isCurrent ? `${color}20` : "transparent",
                        borderColor: isPast || isCurrent ? color : "rgba(255,255,255,0.1)",
                        boxShadow: isCurrent ? `0 0 10px ${color}50` : "none",
                      }}
                    >
                      <TierIcon className="w-3.5 h-3.5" style={{ color: isPast || isCurrent ? color : "rgba(255,255,255,0.2)" }} />
                    </motion.div>
                    <div className="text-[7px] font-mono mt-1 text-center leading-tight"
                      style={{ color: isCurrent ? color : isPast ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)" }}>
                      {tier.split(" ")[0]}
                    </div>
                    <div className="text-[7px] font-mono" style={{ color: isCurrent ? color : "rgba(255,255,255,0.2)" }}>
                      {VIP_CASHBACK[i]}
                    </div>
                  </div>
                  {i < VIP_TIERS.length - 1 && (
                    <div className="w-3 h-px mx-0.5 mb-4" style={{ background: i < safeVipIdx ? VIP_COLORS[i] : "rgba(255,255,255,0.1)" }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[9px] font-mono text-white/25 text-center">
            Cashback % · unlocks at each tier
          </div>
        </div>

        {/* ── BOOT CONVERT ────────────────────────────────────────────────── */}
        {bootBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-[#f59e0b]/10 to-transparent border border-[#f59e0b]/25 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Convert BOOT</div>
                  <div className="text-[10px] font-mono text-white/35">{bootBalance.toLocaleString()} BOOT available</div>
                </div>
              </div>
              <button
                onClick={() => setShowBootShop(v => !v)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-[#060a14]"
                style={{ background: "#f59e0b", fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                CONVERT
              </button>
            </div>
            <AnimatePresence>
              {showBootShop && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <div className="flex gap-2 pt-1">
                    <input
                      type="number"
                      value={bootAmount}
                      onChange={e => setBootAmount(e.target.value)}
                      placeholder={`1 – ${bootBalance}`}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-[#f59e0b]/50"
                      min="1" max={bootBalance}
                    />
                    <button
                      onClick={handleBootRedeem}
                      disabled={redeemBootMut.isPending}
                      className="px-4 py-2.5 rounded-xl bg-[#f59e0b] text-[#060a14] font-bold disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {redeemBootMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── SECTION: LINKS ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-mono font-bold text-white/25 uppercase tracking-wider px-1">Rewards & Community</div>

          <Link href="/loyalty">
            <motion.div whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl p-3.5 cursor-pointer hover:border-[#00ff88]/35 transition-all">
              <div className="w-9 h-9 rounded-xl bg-[#00ff88]/15 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-[#00ff88]" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-white">Loyalty Hub</div>
                <div className="text-[10px] font-mono text-white/35 mt-0.5">Streak · Referrals · Cashback</div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </motion.div>
          </Link>

          {community?.groupInviteLink && (
            <motion.a
              href={community.groupInviteLink}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-xl p-3.5 cursor-pointer hover:border-[#3b82f6]/35 transition-all no-underline"
            >
              <div className="w-9 h-9 rounded-xl bg-[#3b82f6]/15 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-[#3b82f6]" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-white">Community Channel</div>
                <div className="text-[10px] font-mono text-white/35 mt-0.5">News, events & winner announcements</div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </motion.a>
          )}
        </div>

        {/* ── SECTION: SETTINGS ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-mono font-bold text-white/25 uppercase tracking-wider px-1">Settings</div>

          {/* Language */}
          <div className="flex flex-col bg-white/3 border border-white/8 rounded-xl overflow-hidden">
            <motion.button
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowLangPicker(v => !v)}
              className="flex items-center gap-3 p-3.5 w-full text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-white/6 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-white/50" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-white">Language</div>
                <div className="text-[10px] font-mono text-white/35 mt-0.5">{currentLangLabel}</div>
              </div>
              <ChevronRight className={`w-4 h-4 text-white/25 transition-transform ${showLangPicker ? "rotate-90" : ""}`} />
            </motion.button>

            <AnimatePresence>
              {showLangPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-t border-white/6"
                >
                  <div className="grid grid-cols-2 gap-1.5 p-3">
                    {SUPPORTED_LANGUAGES.map(({ code, label, dir }) => {
                      const isActive = i18n.language === code;
                      return (
                        <motion.button
                          key={code}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleLangChange(code as LangCode)}
                          className={`py-2.5 px-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isActive ? "border-[#00ff88]/40 bg-[#00ff88]/8" : "border-white/6 bg-white/3 hover:border-white/15"
                          }`}
                          dir={dir}
                        >
                          <span className={`text-sm font-semibold ${isActive ? "text-[#00ff88]" : "text-white/55"}`}>{label}</span>
                          {isActive && <Check className="w-3 h-3 text-[#00ff88]" />}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* KYC */}
          <div className="flex flex-col bg-white/3 border border-white/8 rounded-xl overflow-hidden">
            <motion.button
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowKyc(v => !v)}
              className="flex items-center gap-3 p-3.5 w-full text-left"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                kycStatus === "verified" ? "bg-emerald-500/15" : "bg-white/6"
              }`}>
                <ShieldCheck className={`w-4 h-4 ${
                  kycStatus === "verified" ? "text-emerald-400" : kycStatus === "pending" ? "text-yellow-400" : "text-white/50"
                }`} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-white">Identity Verification</div>
                <div className={`text-[10px] font-mono mt-0.5 ${
                  kycStatus === "verified" ? "text-emerald-400" :
                  kycStatus === "pending"  ? "text-yellow-400"  : "text-white/35"
                }`}>
                  {kycStatus === "verified" ? "Verified" : kycStatus === "pending" ? "Under review" : "Not verified · required for large withdrawals"}
                </div>
              </div>
              {kycStatus !== "verified" && (
                <ChevronRight className={`w-4 h-4 text-white/25 transition-transform ${showKyc ? "rotate-90" : ""}`} />
              )}
            </motion.button>

            <AnimatePresence>
              {showKyc && kycStatus !== "verified" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-t border-white/6"
                >
                  <div className="p-4 flex flex-col gap-3">
                    {kycStatus === "rejected" && (
                      <div className="text-xs font-mono text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl p-3">
                        {t("profile.kycRejected")}
                      </div>
                    )}
                    {kycStatus === "pending" && (
                      <div className="flex items-center gap-2 text-yellow-400 text-xs font-mono p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>{t("profile.kycPendingDesc")}</span>
                      </div>
                    )}
                    {(kycStatus === "none" || kycStatus === "rejected") && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-mono text-white/35 block mb-1">Full Name</label>
                            <input
                              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-white/25"
                              placeholder="As on ID" value={kycFullName} onChange={e => setKycFullName(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono text-white/35 block mb-1">Country</label>
                            <input
                              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-white/25"
                              placeholder="e.g. Kenya" value={kycCountry} onChange={e => setKycCountry(e.target.value)}
                            />
                          </div>
                        </div>
                        <select
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                          value={kycDocType} onChange={e => setKycDocType(e.target.value)}
                        >
                          <option value="passport">Passport</option>
                          <option value="national_id">National ID</option>
                          <option value="drivers_license">Driver's License</option>
                        </select>
                        <button
                          onClick={handleKycSubmit}
                          disabled={kycSubmitting || !kycFullName.trim() || !kycCountry.trim()}
                          className="w-full h-10 rounded-xl bg-white/8 border border-white/12 text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-white/12 transition-all"
                        >
                          {kycSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          Submit for Verification
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── SIGN OUT (subtle, bottom) ────────────────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => { localStorage.removeItem("strikerx_token"); setToken(null); }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-white/6 text-white/25 hover:text-white/50 hover:border-white/15 transition-all text-xs font-mono"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </motion.button>

      </div>
    </Layout>
  );
}
