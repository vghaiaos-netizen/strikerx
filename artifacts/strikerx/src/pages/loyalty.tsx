import { Layout } from "@/components/layout";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  useGetMyStreak, useGetMyReferral, useGetMyReferralDetail,
  useGetMyCashback, useGetMyAchievements,
  useClaimStreakReward, useClaimCashback, useRedeemBoot,
} from "@workspace/api-client-react";
import {
  Trophy, Copy, Check, Zap, Star, Users, Percent,
  ShoppingBag, ArrowRight, Loader2, ChevronRight, Gift, Shield, Share2,
  Flame, Crown, Medal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// ─── Constants ────────────────────────────────────────────────────────────────
const VIP_TIERS     = ["Sunday League", "Championship", "Premier League", "Champions League", "World Cup"];
const VIP_COLORS    = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];
const VIP_CASHBACK  = ["0%", "2%", "5%", "10%", "15%"];

const RARITY_COLORS: Record<string, string> = {
  common: "#6b7280", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b",
};

// Streak day rewards (shown per slot)
const STREAK_REWARDS = [50, 75, 100, 150, 200, 300, 500];

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-mono font-bold text-white/25 uppercase tracking-wider px-1">{label}</div>
  );
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export function Loyalty() {
  const { t } = useTranslation();
  const { player } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied]         = useState(false);
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

  const p         = player as Record<string, unknown> | null;
  const vipTier   = p?.vipTier as string ?? "sunday_league";
  const vipIdx    = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const safeIdx   = vipIdx < 0 ? 0 : vipIdx;
  const vipName   = VIP_TIERS[safeIdx] ?? "Sunday League";
  const vipColor  = VIP_COLORS[safeIdx] ?? "#6b7280";
  const tonWagered    = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(safeIdx + 1, 4)] ?? 1000;
  const isMaxTier     = safeIdx >= 4;
  const vipProgress   = isMaxTier ? 100 : Math.min(100, (tonWagered / nextThreshold) * 100);
  const bootBalance   = Number(p?.bootBalance ?? 0);

  const unlocked    = achievements?.filter(a => a.unlockedAt) ?? [];
  const totalEarned = Number(referral?.tier1Earnings ?? 0) + Number(referral?.tier2Earnings ?? 0);
  const hasCashback = (cashback?.cashbackRate ?? 0) > 0;
  const pendingCashback = Number(cashback?.pendingStriker ?? 0);

  const copyCode = () => {
    const code = referral?.code ?? "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Code copied!", description: code });
  };

  const shareToTelegram = () => {
    const code = referral?.code ?? "";
    const text = encodeURIComponent("Join me on StrikerX — the football casino inside Telegram! Use my link for a 500 STRIKER welcome bonus.");
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

  const streakDays  = streak?.streakDays ?? 0;
  const streakSlot  = streakDays % 7;  // 0–6

  return (
    <Layout>
      <div className="flex flex-col gap-5 px-4 pt-3 pb-8">

        {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Loyalty Hub</h1>
            <p className="text-[10px] font-mono text-white/35 mt-0.5">Streak · Referrals · Cashback · Achievements</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background: `${vipColor}18`, borderColor: `${vipColor}35` }}>
            <Trophy className="w-4 h-4" style={{ color: vipColor }} />
          </div>
        </div>

        {/* ── VIP STATUS ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-4 border"
          style={{ borderColor: `${vipColor}30`, background: `linear-gradient(135deg, ${vipColor}15, #0a0e1a 60%)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-20"
            style={{ background: vipColor }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/30 mb-0.5">Current Rank</div>
                <div className="font-black text-2xl text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{vipName}</div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: `${vipColor}90` }}>
                  {VIP_CASHBACK[safeIdx]} cashback on losses
                </div>
              </div>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center border-2"
                style={{ background: `${vipColor}18`, borderColor: `${vipColor}45`, color: vipColor }}>
                <Crown className="w-6 h-6" style={{ color: vipColor }} />
              </div>
            </div>

            {!isMaxTier && (
              <>
                <div className="flex justify-between text-[9px] font-mono text-white/25 mb-1.5">
                  <span>{tonWagered.toFixed(1)} TON</span>
                  <span>{nextThreshold} TON → {VIP_TIERS[safeIdx + 1] ?? ""}</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${vipProgress}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    style={{ background: `linear-gradient(90deg, ${vipColor}70, ${vipColor})` }}
                  />
                </div>
              </>
            )}
            {isMaxTier && (
              <div className="text-[10px] font-mono text-white/40 text-center py-1">
                Maximum tier — all perks unlocked
              </div>
            )}
          </div>
        </motion.div>

        {/* ── DAILY STREAK ────────────────────────────────────────────────── */}
        {streak && (
          <div className="flex flex-col gap-3">
            <SectionHeader label="Daily Streak" />

            <div className="bg-white/3 border border-[#f59e0b]/20 rounded-2xl p-4">
              {/* Streak count hero */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Flame className="w-5 h-5 text-[#f59e0b]" />
                  </motion.div>
                  <span className="font-black text-2xl text-[#f59e0b] tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {streakDays}
                  </span>
                  <span className="text-sm font-mono text-[#f59e0b]/50 mt-0.5">day streak</span>
                </div>
                {streakDays > 0 && (
                  <div className="ml-auto text-[10px] font-mono text-white/30">
                    Come back tomorrow for day {streakDays + 1}
                  </div>
                )}
              </div>

              {/* 7-day calendar */}
              <div className="flex gap-1.5 mb-4">
                {[1,2,3,4,5,6,7].map(d => {
                  const filled    = d <= streakSlot;
                  const isToday   = d === streakSlot + 1;
                  const isMilestone = d === 3 || d === 7;
                  const reward    = STREAK_REWARDS[d - 1] ?? 0;
                  return (
                    <div
                      key={d}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all ${
                        filled    ? "border-[#f59e0b] bg-[#f59e0b]/15" :
                        isToday   ? "border-[#f59e0b]/40 bg-[#f59e0b]/6" :
                                    "border-white/6 bg-transparent"
                      } ${isMilestone ? "ring-1 ring-[#f59e0b]/15" : ""}`}
                    >
                      <span className={`text-[8px] font-mono font-bold ${filled ? "text-[#f59e0b]" : isToday ? "text-[#f59e0b]/60" : "text-white/15"}`}>
                        {d}
                      </span>
                      <span className={`text-[7px] font-mono ${filled ? "text-[#f59e0b]/60" : "text-white/15"}`}>
                        {reward}
                      </span>
                    </div>
                  );
                })}
              </div>

              {streak.canClaim ? (
                <Button
                  onClick={handleClaimStreak}
                  disabled={claimStreak.isPending}
                  className="w-full h-11 font-black text-xs tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/85 text-[#0a0e1a]"
                >
                  {claimStreak.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : `CLAIM DAY ${streakSlot + 1} BONUS`
                  }
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Check className="w-3.5 h-3.5 text-[#00ff88]" />
                  <span className="text-[11px] font-mono text-white/35">Streak claimed today — come back tomorrow</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REFERRAL SQUAD ──────────────────────────────────────────────── */}
        {referral && (
          <div className="flex flex-col gap-3">
            <SectionHeader label="Referral Squad" />

            <div className="relative overflow-hidden bg-white/3 border border-[#00ff88]/20 rounded-2xl p-4">
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-8 bg-[#00ff88] pointer-events-none" />
              <div className="relative">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-black/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-white/25 mb-0.5">Squad</div>
                    <div className="font-black text-lg text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {refDetail?.totalReferred ?? 0}
                    </div>
                    <div className="text-[8px] font-mono text-white/20">players</div>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-white/25 mb-0.5">Tier 1</div>
                    <div className="font-black text-lg text-[#00ff88]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {Number(referral.tier1Earnings ?? 0).toFixed(0)}
                    </div>
                    <div className="text-[8px] font-mono text-white/20">SKR</div>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-white/25 mb-0.5">Tier 2</div>
                    <div className="font-black text-lg text-[#00ff88]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {Number(referral.tier2Earnings ?? 0).toFixed(0)}
                    </div>
                    <div className="text-[8px] font-mono text-white/20">SKR</div>
                  </div>
                </div>

                {/* Total earned callout */}
                {totalEarned > 0 && (
                  <div className="flex items-center justify-center gap-2 py-2 mb-4 bg-[#00ff88]/5 rounded-xl border border-[#00ff88]/15">
                    <Gift className="w-3.5 h-3.5 text-[#00ff88]" />
                    <span className="text-[11px] font-mono text-white/50">
                      Total earned: <span className="text-[#00ff88] font-bold">{totalEarned.toFixed(0)} STRIKER</span>
                    </span>
                  </div>
                )}

                {/* Code block */}
                <div className="flex items-center gap-2 bg-black/40 border border-[#00ff88]/20 rounded-xl px-4 py-3 mb-3">
                  <div className="flex-1">
                    <div className="text-[8px] font-mono text-white/25 mb-0.5">Your Code</div>
                    <div className="font-mono font-black text-lg text-white tracking-widest">{referral.code}</div>
                  </div>
                  <button
                    onClick={copyCode}
                    className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
                    style={{
                      borderColor: copied ? "#00ff88" : "rgba(255,255,255,0.15)",
                      background: copied ? "#00ff8818" : "transparent",
                    }}
                  >
                    {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4 text-white/40" />}
                  </button>
                </div>

                {/* Share button */}
                <Button
                  onClick={shareToTelegram}
                  className="w-full h-10 mb-4 font-black text-xs tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/85 text-[#0a0e1a] flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  SHARE TO TELEGRAM
                </Button>

                {/* Squad list */}
                {refDetail && refDetail.referees.length > 0 ? (
                  <div>
                    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white/20 mb-2">Your Squad</div>
                    <div className="flex flex-col gap-1">
                      {refDetail.referees.slice(0, 8).map((ref, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl bg-black/20"
                        >
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold border"
                            style={{
                              background: ref.tier === 1 ? "#00ff8818" : "rgba(255,255,255,0.05)",
                              borderColor: ref.tier === 1 ? "#00ff8835" : "rgba(255,255,255,0.1)",
                              color: ref.tier === 1 ? "#00ff88" : "rgba(255,255,255,0.3)",
                            }}>
                            T{ref.tier}
                          </div>
                          <span className="flex-1 text-[11px] font-mono text-white/55 truncate">{ref.username}</span>
                          <span className="text-[11px] font-mono font-bold text-[#00ff88]">
                            +{Number(ref.earnedStriker).toFixed(0)}
                          </span>
                        </motion.div>
                      ))}
                      {refDetail.referees.length > 8 && (
                        <div className="text-[9px] font-mono text-white/20 text-center py-1">
                          +{refDetail.referees.length - 8} more in squad
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-5 border border-dashed border-white/8 rounded-xl">
                    <Users className="w-7 h-7 text-white/15 mx-auto mb-2" />
                    <div className="text-[11px] font-mono text-white/25">Share your code to build your squad</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── VIP CASHBACK ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionHeader label="VIP Cashback Vault" />

          {cashback && hasCashback ? (
            <div className="bg-white/3 border border-[#00ff88]/15 rounded-2xl p-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Your Rate",    val: `${((cashback.cashbackRate ?? 0) * 100).toFixed(0)}%`, color: vipColor },
                  { label: "From Losses", val: Number(cashback.estimatedLossesStriker).toFixed(0), color: "white" },
                  { label: "Available",   val: pendingCashback.toFixed(0),                          color: "#00ff88" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-black/20 rounded-xl p-2.5 text-center">
                    <div className="text-[8px] font-mono text-white/25 mb-0.5">{label}</div>
                    <div className="font-black text-base" style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}>{val}</div>
                  </div>
                ))}
              </div>

              {cashback.canClaim && pendingCashback > 0 ? (
                <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                  <Button
                    onClick={handleClaimCashback}
                    disabled={claimCashback.isPending}
                    className="w-full h-11 font-black text-xs tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/85 text-[#0a0e1a]"
                  >
                    {claimCashback.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : `CLAIM ${pendingCashback.toFixed(0)} STRIKER`
                    }
                  </Button>
                </motion.div>
              ) : (
                <div className="text-center text-[10px] font-mono text-white/25 py-2">
                  {cashback.claimedThisPeriod ? "Claimed this week — resets next week" : "Keep playing to accumulate cashback"}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/12 border border-[#3b82f6]/25 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-[#3b82f6]" />
              </div>
              <div>
                <div className="text-[11px] font-mono font-bold text-white/50">Unlock Cashback</div>
                <div className="text-[10px] font-mono text-white/25 mt-0.5">
                  Reach Championship tier (10 TON wagered) to earn 2% cashback on losses
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ACHIEVEMENTS ─────────────────────────────────────────────────── */}
        {achievements && achievements.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionHeader label="Achievements" />

            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              {/* Progress */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono text-white/35">
                  <span className="text-white font-bold">{unlocked.length}</span>/{achievements.length} unlocked
                </div>
                <Link href="/achievements">
                  <span className="text-[10px] font-mono text-white/30 hover:text-white/60 cursor-pointer flex items-center gap-1 transition-colors">
                    View all <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#f59e0b] to-[#00ff88] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(unlocked.length / Math.max(1, achievements.length)) * 100}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>

              {unlocked.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {unlocked.slice(0, 8).map(a => {
                    const color = RARITY_COLORS[a.rarity] ?? "#6b7280";
                    return (
                      <div
                        key={a.key}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono"
                        style={{ borderColor: `${color}35`, background: `${color}10`, color }}
                      >
                        <Star className="w-2.5 h-2.5" />
                        {a.title}
                      </div>
                    );
                  })}
                  {unlocked.length > 8 && (
                    <div className="px-2.5 py-1.5 rounded-xl border border-white/8 text-[10px] font-mono text-white/25">
                      +{unlocked.length - 8}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-3 text-[11px] font-mono text-white/25">
                  Play games to earn your first badge
                </div>
              )}

              <Link href="/achievements">
                <div className="mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/6 hover:border-white/15 cursor-pointer transition-all">
                  <Medal className="w-3.5 h-3.5 text-white/25" />
                  <span className="text-[10px] font-mono text-white/35">View All Badges</span>
                  <ChevronRight className="w-3 h-3 text-white/25" />
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ── BOOT SHOP ────────────────────────────────────────────────────── */}
        {bootBalance > 0 && (
          <div className="flex flex-col gap-3">
            <SectionHeader label="BOOT Redemption" />

            <div className="bg-gradient-to-br from-[#f59e0b]/10 to-transparent border border-[#f59e0b]/25 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-[#f59e0b]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">BOOT Balance</div>
                    <div className="text-[10px] font-mono text-[#f59e0b]/60">{bootBalance.toLocaleString()} BOOT available</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowBootShop(v => !v)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-black text-[#060a14]"
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
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 pt-2">
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
                        className="px-4 py-2.5 rounded-xl bg-[#f59e0b] text-[#060a14] font-bold disabled:opacity-50 flex items-center"
                      >
                        {redeemBootMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="mt-2 text-[9px] font-mono text-white/25 text-center">
                      BOOT converts to STRIKER at the current redemption rate
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
