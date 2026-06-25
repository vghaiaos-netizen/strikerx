import { Layout } from "@/components/layout";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  useGetMyStreak,
  useGetMyReferral,
  useGetMyReferralDetail,
  useGetMyCashback,
  useGetMyAchievements,
  useClaimStreakReward,
  useClaimCashback,
  useRedeemBoot,
} from "@workspace/api-client-react";
import {
  Trophy, Copy, Check, Zap, Star, Users, Percent,
  ShoppingBag, ArrowRight, Loader2, ChevronRight, Gift, Shield, Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const VIP_TIERS  = ["Amateur", "Division 1", "Premier League", "Champions League", "World Cup"];
const VIP_COLORS = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
const VIP_THRESHOLDS = [0, 5, 20, 50, 100];
const VIP_CASHBACK   = ["0%", "2%", "5%", "10%", "15%"];
const VIP_ICONS      = ["AM", "D1", "PL", "UCL", "WC"];

const RARITY_COLORS: Record<string, string> = {
  common: "#6b7280", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b",
};

export function Loyalty() {
  const { t } = useTranslation();
  const { player, token } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied]     = useState(false);
  const [bootAmount, setBootAmount] = useState("");
  const [showBootShop, setShowBootShop] = useState(false);

  const { data: streak }    = useGetMyStreak();
  const { data: referral }  = useGetMyReferral();
  const { data: refDetail } = useGetMyReferralDetail();
  const { data: cashback, refetch: refetchCashback } = useGetMyCashback();
  const { data: achievements } = useGetMyAchievements();

  const claimStreak   = useClaimStreakReward();
  const claimCashback = useClaimCashback();
  const redeemBootMut = useRedeemBoot();

  const p        = player as Record<string, unknown> | null;
  const vipTier  = p?.vipTier as string ?? "amateur";
  const vipIdx   = ["sunday_league","division_one","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const vipName  = VIP_TIERS[vipIdx]  ?? "Sunday League";
  const vipColor = VIP_COLORS[vipIdx] ?? "#6b7280";
  const vipIcon  = VIP_ICONS[vipIdx]  ?? "SL";
  const tonWagered    = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(vipIdx + 1, 4)] ?? 1000;
  const isMaxTier     = vipIdx >= 4;
  const vipProgress   = isMaxTier ? 100 : Math.min(100, (tonWagered / nextThreshold) * 100);

  const unlocked = achievements?.filter(a => a.unlockedAt) ?? [];

  const copyCode = () => {
    const code = referral?.code ?? "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Code copied!", description: code });
  };

  const shareToTelegram = () => {
    const code = referral?.code ?? "";
    const text = encodeURIComponent(`Join me on StrikerX — the football casino inside Telegram! Use my link for a 500 STRIKER welcome bonus.`);
    // Include startapp so Telegram passes the referral code to the mini app automatically
    const url  = encodeURIComponent(`https://t.me/StrykkerXBot/StrikerX?startapp=${code}`);
    const tg   = (window as unknown as Record<string, unknown>).Telegram as { WebApp?: { openTelegramLink?: (u: string) => void } } | undefined;
    const link = `https://t.me/share/url?url=${url}&text=${text}`;
    if (tg?.WebApp?.openTelegramLink) {
      tg.WebApp.openTelegramLink(link);
    } else {
      window.open(link, "_blank");
    }
  };

  const handleClaimStreak = async () => {
    try {
      await claimStreak.mutateAsync();
      toast({ title: "Streak bonus claimed!" });
    } catch (e: unknown) {
      toast({ title: "Cannot claim", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleClaimCashback = async () => {
    try {
      const result = await claimCashback.mutateAsync();
      toast({ title: "Cashback claimed!", description: `+${result.claimedStriker} STRIKER` });
      refetchCashback();
    } catch (e: unknown) {
      toast({ title: "Cannot claim", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleBootRedeem = async () => {
    const amount = Number(bootAmount);
    if (!amount || amount <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    try {
      const result = await redeemBootMut.mutateAsync({ data: { amount } });
      toast({ title: "BOOT redeemed!", description: `+${result.redeemedBoot} STRIKER added` });
      setBootAmount(""); setShowBootShop(false);
    } catch (e: unknown) {
      toast({ title: "Redeem failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const hasCashback    = (cashback?.cashbackRate ?? 0) > 0;
  const hasBootBalance = Number(p?.bootBalance ?? 0) > 0;
  const totalEarned    = Number(referral?.tier1Earnings ?? 0) + Number(referral?.tier2Earnings ?? 0);

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-black text-xl text-white">{t("loyalty.hub")}</h1>
            <p className="text-[10px] font-mono text-white/40 mt-0.5">{t("loyalty.hubDesc")}</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background: `${vipColor}20`, borderColor: `${vipColor}40` }}>
            <Trophy className="w-4 h-4" style={{ color: vipColor }} />
          </div>
        </div>

        {/* ── VIP Status Card ── */}
        <motion.div
          className="relative overflow-hidden rounded-2xl p-4 border"
          style={{ borderColor: `${vipColor}30`, background: `linear-gradient(135deg, ${vipColor}15, #0a0e1a 60%)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20"
            style={{ background: vipColor }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/40">{t("loyalty.currentRank")}</div>
                <div className="font-display font-black text-2xl text-white mt-0.5">{vipName}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-display font-black text-base border-2"
                style={{ background: `${vipColor}20`, borderColor: `${vipColor}50`, color: vipColor }}>
                {vipIcon}
              </div>
            </div>

            {/* Tier progress */}
            {!isMaxTier && (
              <div className="mb-3">
                <div className="flex justify-between text-[9px] font-mono text-white/30 mb-1.5">
                  <span>{tonWagered.toFixed(1)} TON wagered</span>
                  <span>{nextThreshold} TON → {VIP_TIERS[vipIdx + 1] ?? ""}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${vipProgress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ background: `linear-gradient(90deg, ${vipColor}80, ${vipColor})` }} />
                </div>
              </div>
            )}

            {/* Tier row */}
            <div className="flex gap-1 mb-2">
              {VIP_TIERS.map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full h-1 rounded-full" style={{ background: i <= vipIdx ? VIP_COLORS[i] : "#ffffff10" }} />
                  <div className="text-[7px] font-mono font-bold" style={{ color: i === vipIdx ? vipColor : "#ffffff20" }}>
                    {VIP_ICONS[i]}
                  </div>
                </div>
              ))}
            </div>

            {/* Perks row */}
            <div className="flex gap-1">
              {VIP_CASHBACK.map((perk, i) => (
                <div key={i} className="flex-1 text-center py-1 rounded-lg text-[8px] font-mono font-bold"
                  style={{ background: i === vipIdx ? `${VIP_COLORS[i]}25` : "#ffffff05", color: i === vipIdx ? VIP_COLORS[i] : "#ffffff20" }}>
                  {perk}
                  <div className="text-[6px] opacity-60 mt-0.5">cb</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Daily Streak ── */}
        {streak && (
          <div className="bg-white/3 border border-[#f59e0b]/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t("loyalty.dailyStreak")}</span>
              </div>
              <div className="font-display font-bold text-lg text-[#f59e0b]">{streak.streakDays ?? 0} <span className="text-xs text-white/40">{t("loyalty.days")}</span></div>
            </div>
            <div className="flex gap-1.5 mb-3">
              {[1,2,3,4,5,6,7].map(d => {
                const active  = d <= (streak.streakDays ?? 0) % 7;
                const today   = d === ((streak.streakDays ?? 0) % 7) + 1;
                const milestone = d === 3 || d === 7;
                return (
                  <div key={d} className={`flex-1 h-8 rounded-lg flex flex-col items-center justify-center gap-0.5 border transition-all ${active ? "border-[#f59e0b] bg-[#f59e0b]/15" : today ? "border-[#f59e0b]/50 bg-[#f59e0b]/5" : "border-white/6 bg-transparent"} ${milestone ? "ring-1 ring-[#f59e0b]/20" : ""}`}>
                    <span className={`text-[9px] font-mono font-bold ${active ? "text-[#f59e0b]" : today ? "text-[#f59e0b]/60" : "text-white/20"}`}>{d}</span>
                    {milestone && <span className="text-[6px] font-mono text-[#f59e0b]/40">★</span>}
                  </div>
                );
              })}
            </div>
            {streak.canClaim ? (
              <Button onClick={handleClaimStreak} disabled={claimStreak.isPending}
                className="w-full h-10 font-display font-black text-xs tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a]">
                {claimStreak.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("loyalty.claimStreakBtn").toUpperCase()}
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-2">
                <Check className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[11px] font-mono text-white/40">{t("loyalty.claimedToday")}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Referral & Squad ── */}
        {referral && (
          <div className="relative overflow-hidden bg-white/3 border border-[#00ff88]/20 rounded-2xl p-4">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-10 bg-[#00ff88]" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#00ff88]/70">{t("loyalty.referEarn")}</span>
              </div>
              <p className="text-[11px] font-mono text-white/40 mb-4">
                {t("loyalty.referDesc")}
              </p>

              {/* Big code block */}
              <div className="flex items-center gap-2 bg-black/40 border border-[#00ff88]/20 rounded-xl px-4 py-3 mb-3">
                <div className="flex-1">
                  <div className="text-[9px] font-mono text-white/30 mb-0.5">{t("loyalty.yourCode")}</div>
                  <div className="font-mono font-black text-lg text-white tracking-widest">{referral.code}</div>
                </div>
                <button onClick={copyCode}
                  className="w-9 h-9 rounded-lg flex items-center justify-center border transition-all"
                  style={{ borderColor: copied ? "#00ff88" : "#ffffff20", background: copied ? "#00ff8820" : "transparent" }}>
                  {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4 text-white/50" />}
                </button>
              </div>

              {/* Share button */}
              <Button onClick={shareToTelegram}
                className="w-full h-10 mb-4 font-display font-bold text-xs tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a] flex items-center gap-2">
                <Share2 className="w-3.5 h-3.5" />
                {t("loyalty.shareToTelegram").toUpperCase()}
              </Button>

              {/* Earnings summary */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-white/30">{t("loyalty.squad")}</div>
                  <div className="font-display font-bold text-base text-white">{refDetail?.totalReferred ?? 0}</div>
                  <div className="text-[8px] font-mono text-white/20">{t("loyalty.players")}</div>
                </div>
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-white/30">{t("loyalty.tier1")}</div>
                  <div className="font-display font-bold text-sm text-[#00ff88]">{Number(referral.tier1Earnings ?? 0).toFixed(0)}</div>
                  <div className="text-[8px] font-mono text-white/20">STRIKER</div>
                </div>
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-white/30">{t("loyalty.tier2")}</div>
                  <div className="font-display font-bold text-sm text-[#00ff88]">{Number(referral.tier2Earnings ?? 0).toFixed(0)}</div>
                  <div className="text-[8px] font-mono text-white/20">STRIKER</div>
                </div>
              </div>

              {/* Total earned callout */}
              {totalEarned > 0 && (
                <div className="flex items-center justify-center gap-2 py-2 mb-3 bg-[#00ff88]/5 rounded-xl border border-[#00ff88]/15">
                  <Trophy className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span className="text-[11px] font-mono text-white/60">{t("loyalty.totalEarned")}: <span className="text-[#00ff88] font-bold">{totalEarned.toFixed(0)} STRIKER</span></span>
                </div>
              )}

              {/* Squad list */}
              {refDetail && refDetail.referees.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/25 mb-2">{t("loyalty.yourSquad")}</div>
                  <div className="flex flex-col gap-1.5">
                    {refDetail.referees.slice(0, 8).map((ref, i) => (
                      <motion.div key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-black/20">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold border"
                          style={{ background: ref.tier === 1 ? "#00ff8820" : "#ffffff08", borderColor: ref.tier === 1 ? "#00ff8840" : "#ffffff15", color: ref.tier === 1 ? "#00ff88" : "#ffffff40" }}>
                          T{ref.tier}
                        </div>
                        <span className="flex-1 text-[11px] font-mono text-white/60 truncate">{ref.username}</span>
                        <span className="text-[11px] font-mono font-bold text-[#00ff88]">+{Number(ref.earnedStriker).toFixed(0)}</span>
                      </motion.div>
                    ))}
                    {refDetail.referees.length > 8 && (
                      <div className="text-[9px] font-mono text-white/25 text-center py-1">
                        +{refDetail.referees.length - 8} {t("loyalty.moreInSquad")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {(!refDetail || refDetail.referees.length === 0) && (
                <div className="text-center py-4 border border-dashed border-white/8 rounded-xl">
                  <Users className="w-6 h-6 text-white/20 mx-auto mb-2" />
                  <div className="text-[11px] font-mono text-white/30">{t("loyalty.shareCode")}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VIP Cashback ── */}
        {cashback && hasCashback && (
          <div className="bg-white/3 border border-[#00ff88]/15 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t("loyalty.vipCashback")}</span>
              </div>
              <span className="text-[10px] font-mono text-white/30">{cashback.period}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: t("loyalty.yourRate"),   val: `${((cashback.cashbackRate ?? 0) * 100).toFixed(0)}%`, color: vipColor },
                { label: t("loyalty.fromLosses"), val: Number(cashback.estimatedLossesStriker).toFixed(0), color: "white" },
                { label: t("loyalty.available"),  val: Number(cashback.pendingStriker).toFixed(0), color: "#00ff88" },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-black/20 rounded-xl p-2.5 text-center">
                  <div className="text-[8px] font-mono text-white/30 mb-0.5">{label}</div>
                  <div className="font-display font-bold text-sm" style={{ color }}>{val}</div>
                </div>
              ))}
            </div>
            {cashback.canClaim ? (
              <Button onClick={handleClaimCashback} disabled={claimCashback.isPending}
                className="w-full h-10 font-display font-bold text-xs tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a]">
                {claimCashback.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `CLAIM ${Number(cashback.pendingStriker).toFixed(0)} STRIKER`}
              </Button>
            ) : (
              <div className="text-center text-[10px] font-mono text-white/30 py-2">
                {cashback.claimedThisPeriod ? t("loyalty.claimedWeek") : t("loyalty.playMore")}
              </div>
            )}
          </div>
        )}

        {/* Cashback locked (below VIP level) */}
        {cashback && !hasCashback && (
          <div className="bg-white/3 border border-white/6 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/25 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-[#3b82f6]" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-bold text-white/60">{t("loyalty.unlockCashback")}</div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">{t("loyalty.unlockCashbackDesc")}</div>
            </div>
          </div>
        )}

        {/* ── Achievements ── */}
        {achievements && achievements.length > 0 && (
          <div className="bg-white/3 border border-white/6 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t("loyalty.badges")}</span>
              </div>
              <Link href="/achievements">
                <span className="flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-white/70 cursor-pointer transition-colors">
                  {unlocked.length}/{achievements.length} <ChevronRight className="w-3 h-3" />
                </span>
              </Link>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-3">
              <motion.div className="h-full bg-gradient-to-r from-[#f59e0b] to-[#00ff88] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(unlocked.length / Math.max(1, achievements.length)) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>

            {unlocked.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {unlocked.slice(0, 6).map(a => {
                  const color = RARITY_COLORS[a.rarity] ?? "#6b7280";
                  return (
                    <div key={a.key} className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono"
                      style={{ borderColor: `${color}40`, background: `${color}10`, color }}>
                      <Star className="w-2 h-2" />
                      {a.title}
                    </div>
                  );
                })}
                {unlocked.length > 6 && (
                  <div className="px-2 py-1 rounded-lg border border-white/8 text-[10px] font-mono text-white/30">
                    +{unlocked.length - 6} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-2 text-[11px] font-mono text-white/30">
                {t("loyalty.playForBadge")}
              </div>
            )}

            <Link href="/achievements">
              <div className="mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/6 hover:border-white/15 cursor-pointer transition-all">
                <span className="text-[10px] font-mono text-white/40">{t("loyalty.viewAllBadges")}</span>
                <ChevronRight className="w-3 h-3 text-white/30" />
              </div>
            </Link>
          </div>
        )}

        {/* ── Boot Shop ── */}
        {hasBootBalance && (
          <div className="bg-white/3 border border-[#f59e0b]/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">{t("loyalty.bootShop")}</span>
              </div>
              <button onClick={() => setShowBootShop(v => !v)}
                className="text-[10px] font-mono text-[#f59e0b] hover:text-[#f59e0b]/80 transition-colors">
                {showBootShop ? t("loyalty.cancelBtn") : t("loyalty.convertBoot")}
              </button>
            </div>
            <p className="text-[11px] font-mono text-white/40 mb-2">
              {t("loyalty.bootBalance", { amount: Number(p?.bootBalance ?? 0).toLocaleString() })}
            </p>
            <AnimatePresence>
              {showBootShop && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="flex gap-2 overflow-hidden">
                  <input type="number" value={bootAmount} onChange={e => setBootAmount(e.target.value)}
                    placeholder={`Max ${Number(p?.bootBalance ?? 0)}`}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-[#f59e0b]/50"
                    min="1" max={Number(p?.bootBalance ?? 0)} />
                  <Button onClick={handleBootRedeem} disabled={redeemBootMut.isPending}
                    className="bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a] shrink-0" size="sm">
                    {redeemBootMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </div>
    </Layout>
  );
}
