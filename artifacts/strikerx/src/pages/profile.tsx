import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useGetMyStats, getGetMyStatsQueryKey, useRedeemBoot } from "@workspace/api-client-react";
import {
  Trophy, LogOut, Zap, Target, TrendingUp, ShoppingBag,
  ArrowRight, Loader2, ShieldCheck, Gift, ChevronRight, Users, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, saveLangLocally, getLangDir, type LangCode } from "@/i18n";

interface CommunityInfo { groupInviteLink: string | null; miniAppLink: string | null; botUsername: string; }

const VIP_TIERS  = ["Sunday League", "Championship", "Premier League", "Champions League", "World Cup"];
const VIP_COLORS = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];

export function Profile() {
  const { player, token, setToken } = useAuth();
  const { toast }  = useToast();
  const { t } = useTranslation();
  const [bootAmount, setBootAmount] = useState("");
  const [showBootShop, setShowBootShop] = useState(false);
  const [kycFullName, setKycFullName]   = useState("");
  const [kycCountry, setKycCountry]     = useState("");
  const [kycDocType, setKycDocType]     = useState("passport");
  const [kycSubmitting, setKycSubmitting] = useState(false);

  const { data: stats }  = useGetMyStats({ query: { queryKey: getGetMyStatsQueryKey() } });
  const redeemBootMut    = useRedeemBoot();
  const { data: community } = useQuery<CommunityInfo>({
    queryKey: ["community"],
    queryFn: async () => { const r = await fetch("/api/public/community"); return r.json() as Promise<CommunityInfo>; },
    staleTime: 300_000,
  });

  const { i18n } = useTranslation();
  const [showLangPicker, setShowLangPicker] = useState(false);

  async function handleLangChange(code: LangCode) {
    saveLangLocally(code);
    await i18n.changeLanguage(code);
    document.documentElement.dir = getLangDir(code);
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

  const p        = player as Record<string, unknown> | null;
  const vipTier  = p?.vipTier as string ?? "sunday_league";
  const vipIdx   = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const vipName  = VIP_TIERS[vipIdx]  ?? "Sunday League";
  const vipColor = VIP_COLORS[vipIdx] ?? "#6b7280";
  const tonWagered    = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(vipIdx + 1, 4)] ?? 1000;
  const isMaxTier     = vipIdx >= 4;
  const vipProgress   = isMaxTier ? 100 : Math.min(100, (tonWagered / nextThreshold) * 100);

  const initials = (p?.username as string ?? "?").slice(0, 2).toUpperCase();

  const statCards = [
    { labelKey: "profile.totalGames", value: stats?.totalGames ?? 0,                                  icon: TrendingUp },
    { labelKey: "profile.winRate",    value: `${((stats?.winRate ?? 0) * 100).toFixed(0)}%`,         icon: Target     },
    { labelKey: "profile.bestMulti",  value: `${stats?.biggestMultiplier ?? 0}x`,                     icon: Zap        },
  ];

  const handleBootRedeem = async () => {
    const amount = Number(bootAmount);
    if (!amount || amount <= 0) { toast({ title: t('profile.enterValid'), variant: "destructive" }); return; }
    try {
      const result = await redeemBootMut.mutateAsync({ data: { amount } });
      toast({ title: t('profile.redeemSuccess'), description: t('profile.redeemSuccessDesc', { amount: result.redeemedBoot }) });
      setBootAmount(""); setShowBootShop(false);
    } catch (e: unknown) {
      toast({ title: t('profile.redeemFailed'), description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── Avatar + VIP ── */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-display font-black text-2xl text-[#0a0e1a]"
              style={{ background: `linear-gradient(135deg, ${vipColor}, ${vipColor}88)` }}>
              {initials}
            </div>
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold border"
              style={{ background: `${vipColor}20`, borderColor: `${vipColor}50`, color: vipColor }}>
              {vipName.split(" ").map(w => w[0]).join("")}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg text-white truncate">{p?.username as string ?? "Player"}</div>
            <div className="text-xs font-mono text-white/40 mt-0.5">#{p?.telegramId as string}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Trophy className="w-3 h-3" style={{ color: vipColor }} />
              <span className="text-xs font-mono font-bold" style={{ color: vipColor }}>{vipName}</span>
            </div>
          </div>
          <button onClick={() => { localStorage.removeItem("strikerx_token"); setToken(null); }}
            className="p-2 rounded-lg border border-white/8 text-white/30 hover:text-white/60 hover:border-white/20 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* ── VIP progress (compact) ── */}
        <div className="bg-white/3 border border-white/6 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-white/40">
              {isMaxTier
                ? t('profile.maxTier')
                : t('profile.vipProgress', { wagered: tonWagered.toFixed(1), threshold: nextThreshold, tier: VIP_TIERS[vipIdx + 1] ?? "" })}
            </span>
            <span className="text-[10px] font-mono font-bold" style={{ color: vipColor }}>{Math.round(vipProgress)}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${vipProgress}%` }}
              transition={{ duration: 0.8 }}
              style={{ background: `linear-gradient(90deg, ${vipColor}80, ${vipColor})` }} />
          </div>
        </div>

        {/* ── Loyalty Hub link ── */}
        <Link href="/loyalty">
          <motion.div whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl p-4 cursor-pointer hover:border-[#00ff88]/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/25 flex items-center justify-center flex-shrink-0">
              <Gift className="w-4 h-4 text-[#00ff88]" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-sm text-white">{t('profile.loyaltyHub')}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{t('profile.loyaltyHubDesc')}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </motion.div>
        </Link>

        {/* ── Community Channel ── */}
        {community?.groupInviteLink && (
          <motion.a
            href={community.groupInviteLink}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-xl p-4 cursor-pointer hover:border-[#3b82f6]/40 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/25 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#3b82f6]" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-sm text-white">{t('profile.communityChannel')}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{t('profile.communityDesc')}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </motion.a>
        )}

        {/* ── Language ── */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowLangPicker(v => !v)}
          className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-4 w-full hover:border-white/20 transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-4 h-4 text-white/50" />
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-sm text-white">{t('profile.language')}</div>
            <div className="text-[10px] font-mono text-white/40 mt-0.5">
              {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.label ?? "English"}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-white/30 transition-transform ${showLangPicker ? "rotate-90" : ""}`} />
        </motion.button>

        <AnimatePresence>
          {showLangPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 pt-1">
                {SUPPORTED_LANGUAGES.map(({ code, label, dir }) => {
                  const isActive = i18n.language === code;
                  return (
                    <motion.button
                      key={code}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleLangChange(code as LangCode)}
                      className={`py-3 px-4 rounded-xl border text-left transition-all ${
                        isActive
                          ? "border-[#00ff88] bg-[#00ff88]/10 text-white"
                          : "border-white/8 bg-white/3 text-white/60 hover:border-white/20"
                      }`}
                      dir={dir}
                    >
                      <div className={`font-semibold text-sm ${isActive ? "text-[#00ff88]" : ""}`}>{label}</div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-40">{code.toUpperCase()}</div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Token Balances ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "STRIKER", val: p?.strikerBalance, color: "#00ff88" },
            { label: "BOOT",    val: p?.bootBalance,    color: "#f59e0b" },
            { label: "CAPTAIN", val: p?.captainBalance, color: "#a855f7" },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
              <div className="text-[9px] font-mono font-bold uppercase tracking-wider mb-1" style={{ color: `${color}80` }}>{label}</div>
              <motion.div className="font-display font-bold text-sm" style={{ color }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                {Number(val ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </motion.div>
            </div>
          ))}
        </div>

        {/* ── Boot Shop ── */}
        {Number(p?.bootBalance ?? 0) > 0 && (
          <div className="bg-white/3 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShoppingBag size={14} className="text-amber-400" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/50">{t('profile.bootShop')}</span>
              </div>
              <button onClick={() => setShowBootShop(v => !v)}
                className="text-[10px] font-mono text-amber-400 hover:text-amber-300 transition-colors">
                {showBootShop ? t('profile.cancel') : t('profile.convertBoot')}
              </button>
            </div>
            <p className="text-[11px] font-mono text-white/40">
              {t('profile.convertBootDesc', { amount: Number(p?.bootBalance ?? 0).toLocaleString() })}
            </p>
            <AnimatePresence>
              {showBootShop && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} className="mt-3 flex gap-2 overflow-hidden">
                  <input type="number" value={bootAmount} onChange={e => setBootAmount(e.target.value)}
                    placeholder={`Max ${Number(p?.bootBalance ?? 0)}`}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                    min="1" max={Number(p?.bootBalance ?? 0)} />
                  <Button onClick={handleBootRedeem} disabled={redeemBootMut.isPending}
                    className="bg-amber-600 hover:bg-amber-500 text-white shrink-0" size="sm">
                    {redeemBootMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Game Stats ── */}
        <div className="grid grid-cols-3 gap-2">
          {statCards.map(({ labelKey, value, icon: Icon }) => (
            <div key={labelKey} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 text-white/30 mx-auto mb-1.5" />
              <div className="font-display font-bold text-sm text-white">{value}</div>
              <div className="text-[9px] font-mono text-white/30 mt-0.5">{t(labelKey)}</div>
            </div>
          ))}
        </div>

        {/* ── KYC ── */}
        {(() => {
          const kycStatus = (player as Record<string, unknown>)?.kycStatus as string ?? "none";
          return (
            <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-mono font-semibold">{t('profile.kycTitle')}</span>
              </div>

              {kycStatus === "verified" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-mono font-bold text-emerald-400">{t('profile.kycVerified')}</div>
                    <div className="text-xs text-white/50 mt-0.5">{t('profile.kycVerifiedDesc')}</div>
                  </div>
                </div>
              )}

              {kycStatus === "pending" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin flex-shrink-0" />
                  <div>
                    <div className="text-sm font-mono font-bold text-yellow-400">{t('profile.kycPending')}</div>
                    <div className="text-xs text-white/50 mt-0.5">{t('profile.kycPendingDesc')}</div>
                  </div>
                </div>
              )}

              {(kycStatus === "none" || kycStatus === "rejected" || !kycStatus) && (
                <div className="space-y-3">
                  {kycStatus === "rejected" && (
                    <div className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      {t('profile.kycRejected')}
                    </div>
                  )}
                  {kycStatus === "none" && (
                    <p className="text-xs text-white/50">{t('profile.kycNoneDesc')}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-white/40 block mb-1">{t('profile.kycFullName')}</label>
                      <input className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                        placeholder={t('profile.kycFullNamePlaceholder')} value={kycFullName} onChange={e => setKycFullName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-white/40 block mb-1">{t('profile.kycCountry')}</label>
                      <input className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                        placeholder={t('profile.kycCountryPlaceholder')} value={kycCountry} onChange={e => setKycCountry(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-white/40 block mb-1">{t('profile.kycDocType')}</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                      value={kycDocType} onChange={e => setKycDocType(e.target.value)}>
                      <option value="passport">{t('profile.kycPassport')}</option>
                      <option value="national_id">{t('profile.kycNationalId')}</option>
                      <option value="drivers_license">{t('profile.kycDriversLicense')}</option>
                    </select>
                  </div>
                  <Button className="w-full font-mono text-xs h-9 gap-2"
                    disabled={kycSubmitting || !kycFullName.trim() || !kycCountry.trim()}
                    onClick={async () => {
                      setKycSubmitting(true);
                      try {
                        const r = await fetch("/api/players/me/kyc", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
                          body: JSON.stringify({ fullName: kycFullName.trim(), country: kycCountry.trim(), docType: kycDocType }),
                        });
                        if (r.ok) {
                          toast({ title: t('profile.kycSubmitted'), description: t('profile.kycSubmittedDesc') });
                          setKycFullName(""); setKycCountry("");
                        } else {
                          const d = await r.json() as { error?: string };
                          toast({ title: t('profile.kycFailed'), description: d.error ?? t('errors.unknownError'), variant: "destructive" });
                        }
                      } catch {
                        toast({ title: t('profile.networkError'), variant: "destructive" });
                      } finally {
                        setKycSubmitting(false);
                      }
                    }}>
                    {kycSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    {t('profile.kycSubmit')}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}
