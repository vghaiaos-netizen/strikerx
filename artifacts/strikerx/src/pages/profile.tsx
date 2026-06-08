import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import {
  useGetMyStats, getGetMyStatsQueryKey,
  useGetMyStreak, getGetMyStreakQueryKey,
  useGetMyReferral, getGetMyReferralQueryKey,
  useGetMyReferralDetail,
  useGetMyCashback,
  useGetMyAchievements,
  useClaimStreakReward,
  useClaimCashback,
  useRedeemBoot,
} from "@workspace/api-client-react";
import { Trophy, Copy, Check, LogOut, Zap, Target, TrendingUp, Star, ChevronRight, Users, Percent, ShoppingBag, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const VIP_TIERS = ["Sunday League","Championship","Premier League","Champions League","World Cup"];
const VIP_COLORS = ["#6b7280","#3b82f6","#22c55e","#f59e0b","#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];

const RARITY_COLORS: Record<string, string> = {
  common: "#6b7280", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b",
};

export function Profile() {
  const { player, token, setToken } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied]       = useState(false);
  const [bootAmount, setBootAmount] = useState("");
  const [showBootShop, setShowBootShop] = useState(false);
  const [kycFullName, setKycFullName]   = useState("");
  const [kycCountry, setKycCountry]     = useState("");
  const [kycDocType, setKycDocType]     = useState("passport");
  const [kycSubmitting, setKycSubmitting] = useState(false);

  const { data: stats }    = useGetMyStats({ query: { queryKey: getGetMyStatsQueryKey() } });
  const { data: streak }   = useGetMyStreak({ query: { queryKey: getGetMyStreakQueryKey() } });
  const { data: referral } = useGetMyReferral({ query: { queryKey: getGetMyReferralQueryKey() } });
  const { data: refDetail } = useGetMyReferralDetail();
  const { data: cashback, refetch: refetchCashback } = useGetMyCashback();
  const { data: achievements } = useGetMyAchievements();
  const claimStreak   = useClaimStreakReward();
  const claimCashback = useClaimCashback();
  const redeemBootMut = useRedeemBoot();

  const p = player as Record<string, unknown> | null;
  const vipTier  = p?.vipTier as string ?? "sunday_league";
  const vipIdx   = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const vipName  = VIP_TIERS[vipIdx] ?? "Sunday League";
  const vipColor = VIP_COLORS[vipIdx] ?? "#6b7280";
  const tonWagered    = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(vipIdx + 1, 4)];

  const copyCode = () => {
    const code = referral?.code ?? "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: code });
  };

  const handleClaim = async () => {
    try {
      await claimStreak.mutateAsync();
      toast({ title: "Streak bonus claimed!" });
    } catch (e: unknown) {
      toast({ title: "Cannot claim", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const handleCashbackClaim = async () => {
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
    if (!amount || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    try {
      const result = await redeemBootMut.mutateAsync({ data: { amount } });
      toast({ title: "BOOT redeemed!", description: `+${result.redeemedBoot} STRIKER added to your balance` });
      setBootAmount("");
      setShowBootShop(false);
    } catch (e: unknown) {
      toast({ title: "Redeem failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  };

  const initials = (p?.username as string ?? "?").slice(0, 2).toUpperCase();
  const statCards = [
    { label: "Total Games", value: stats?.totalGames ?? 0, icon: TrendingUp },
    { label: "Win Rate",    value: `${((stats?.winRate ?? 0) * 100).toFixed(0)}%`, icon: Target },
    { label: "Best Multi",  value: `${stats?.biggestMultiplier ?? 0}x`, icon: Zap },
  ];

  const unlockedAchievements = achievements?.filter(a => a.unlockedAt) ?? [];

  const cashbackRatePct = ((cashback?.cashbackRate ?? 0) * 100).toFixed(0);
  const hasCashback = (cashback?.cashbackRate ?? 0) > 0;

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Avatar + VIP */}
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

        {/* VIP Progress */}
        <div className="bg-white/3 border border-white/6 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">VIP Progress</span>
            <span className="text-[10px] font-mono text-white/30">{tonWagered.toFixed(1)} / {nextThreshold} TON</span>
          </div>
          <div className="flex gap-1 mb-2">
            {VIP_TIERS.map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= vipIdx ? "opacity-100" : "opacity-20"}`}
                style={{ background: VIP_COLORS[i] }} />
            ))}
          </div>
          <div className="flex justify-between">
            {VIP_TIERS.map((t, i) => (
              <span key={i} className="text-[8px] font-mono" style={{ color: i === vipIdx ? vipColor : "#ffffff25" }}>
                {t.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>

        {/* Balances */}
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

        {/* Boot Shop */}
        {Number(p?.bootBalance ?? 0) > 0 && (
          <div className="bg-white/3 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-amber-400" />
                <span className="text-sm font-semibold text-foreground">Boot Shop</span>
              </div>
              <button
                onClick={() => setShowBootShop(v => !v)}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                {showBootShop ? "Close" : "Convert BOOT"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Convert <span className="text-amber-400 font-bold">{Number(p?.bootBalance ?? 0).toLocaleString()} BOOT</span> to STRIKER at 1:1 rate
            </p>
            {showBootShop && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="number"
                  value={bootAmount}
                  onChange={e => setBootAmount(e.target.value)}
                  placeholder={`Max ${Number(p?.bootBalance ?? 0)}`}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                  min="1"
                  max={Number(p?.bootBalance ?? 0)}
                />
                <Button
                  onClick={handleBootRedeem}
                  disabled={redeemBootMut.isPending}
                  className="bg-amber-600 hover:bg-amber-500 text-white shrink-0"
                  size="sm"
                >
                  {redeemBootMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </Button>
              </motion.div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 text-white/30 mx-auto mb-1.5" />
              <div className="font-display font-bold text-sm text-white">{value}</div>
              <div className="text-[9px] font-mono text-white/30 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Streak */}
        {streak && (
          <div className="bg-white/3 border border-white/6 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">Daily Streak</div>
              <div className="font-display font-bold text-[#f59e0b]">{streak.streakDays ?? 0} days</div>
            </div>
            <div className="flex gap-1.5 mb-3">
              {[1,2,3,4,5,6,7].map(d => {
                const active = d <= (streak.streakDays ?? 0) % 7;
                const milestone = [3,7].includes(d);
                return (
                  <div key={d} className={`flex-1 h-7 rounded-md flex items-center justify-center text-[9px] font-mono font-bold border transition-all ${active ? "border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]" : "border-white/8 text-white/20"} ${milestone ? "border-dashed" : ""}`}>
                    {d}
                  </div>
                );
              })}
            </div>
            {streak.canClaim && (
              <Button onClick={handleClaim} disabled={claimStreak.isPending}
                className="w-full h-9 font-display font-bold text-xs tracking-widest bg-[#f59e0b] hover:bg-[#f59e0b]/90 text-[#0a0e1a]">
                CLAIM TODAY'S BONUS
              </Button>
            )}
          </div>
        )}

        {/* Cashback */}
        {cashback && hasCashback && (
          <div className="bg-white/3 border border-white/6 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">VIP Cashback</span>
              </div>
              <span className="text-[10px] font-mono text-white/30">{cashback.period}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-black/20 rounded-lg p-2 text-center">
                <div className="text-[9px] font-mono text-white/30">Rate</div>
                <div className="font-mono font-bold text-sm text-[#00ff88]">{cashbackRatePct}%</div>
              </div>
              <div className="bg-black/20 rounded-lg p-2 text-center">
                <div className="text-[9px] font-mono text-white/30">Losses</div>
                <div className="font-mono font-bold text-sm text-white">{Number(cashback.estimatedLossesStriker).toFixed(0)}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-2 text-center">
                <div className="text-[9px] font-mono text-white/30">Available</div>
                <div className="font-mono font-bold text-sm text-[#00ff88]">{Number(cashback.pendingStriker).toFixed(0)}</div>
              </div>
            </div>
            {cashback.canClaim ? (
              <Button onClick={handleCashbackClaim} disabled={claimCashback.isPending}
                className="w-full h-9 font-display font-bold text-xs tracking-widest bg-[#00ff88] hover:bg-[#00ff88]/90 text-[#0a0e1a]">
                CLAIM {Number(cashback.pendingStriker).toFixed(0)} STRIKER
              </Button>
            ) : (
              <div className="text-center text-[10px] font-mono text-white/30">
                {cashback.claimedThisPeriod ? "Claimed this week" : "No cashback available yet"}
              </div>
            )}
          </div>
        )}

        {/* Achievements preview */}
        {achievements && achievements.length > 0 && (
          <div className="bg-white/3 border border-white/6 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">Achievements</span>
              </div>
              <Link href="/achievements">
                <span className="flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors cursor-pointer">
                  {unlockedAchievements.length}/{achievements.length} <ChevronRight className="w-3 h-3" />
                </span>
              </Link>
            </div>

            {unlockedAchievements.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {unlockedAchievements.slice(0, 6).map(a => {
                  const color = RARITY_COLORS[a.rarity] ?? "#6b7280";
                  return (
                    <div key={a.key}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-mono"
                      style={{ borderColor: `${color}40`, background: `${color}10`, color }}>
                      <Star className="w-2.5 h-2.5" />
                      {a.title}
                    </div>
                  );
                })}
                {unlockedAchievements.length > 6 && (
                  <div className="px-2 py-1 rounded-lg border border-white/8 text-[10px] font-mono text-white/30">
                    +{unlockedAchievements.length - 6} more
                  </div>
                )}
              </div>
            ) : (
              <Link href="/achievements">
                <div className="text-center py-3 text-[11px] font-mono text-white/30 hover:text-white/50 cursor-pointer transition-colors">
                  Play games to unlock achievements
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Referral */}
        {referral && (
          <div className="bg-white/3 border border-white/6 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">Referral</span>
              </div>
              {refDetail && (
                <span className="text-[10px] font-mono text-white/30">{refDetail.totalReferred} referred</span>
              )}
            </div>

            <div className="flex items-center gap-2 bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 mb-3">
              <span className="flex-1 font-mono text-sm text-white/80 tracking-wider">{referral.code}</span>
              <button onClick={copyCode} className="text-white/40 hover:text-white transition-colors">
                {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center mb-3">
              <div className="bg-black/20 rounded-lg p-2">
                <div className="text-[9px] font-mono text-white/30">Tier 1 (10%)</div>
                <div className="font-mono font-bold text-xs text-[#00ff88] mt-0.5">
                  {Number(referral.tier1Earnings ?? 0).toFixed(0)} STRIKER
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-2">
                <div className="text-[9px] font-mono text-white/30">Tier 2 (5%)</div>
                <div className="font-mono font-bold text-xs text-[#00ff88] mt-0.5">
                  {Number(referral.tier2Earnings ?? 0).toFixed(0)} STRIKER
                </div>
              </div>
            </div>

            {/* Per-referee breakdown */}
            {refDetail && refDetail.referees.length > 0 && (
              <div className="border-t border-white/6 pt-3">
                <div className="text-[9px] font-mono text-white/25 mb-2 uppercase tracking-wider">Squad</div>
                <div className="flex flex-col gap-1.5">
                  {refDetail.referees.slice(0, 5).map((ref, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-[8px] font-bold text-white/50">
                          T{ref.tier}
                        </div>
                        <span className="text-white/60">{ref.username}</span>
                      </div>
                      <span className="text-[#00ff88] font-bold">+{Number(ref.earnedStriker).toFixed(0)}</span>
                    </div>
                  ))}
                  {refDetail.referees.length > 5 && (
                    <div className="text-[9px] font-mono text-white/25 text-center pt-1">
                      +{refDetail.referees.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KYC Identity Verification ── */}
        {(() => {
          const kycStatus = (player as Record<string, unknown>)?.kycStatus as string ?? "none";
          return (
            <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-mono font-semibold">Identity Verification (KYC)</span>
              </div>

              {kycStatus === "verified" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-mono font-bold text-emerald-400">Verified</div>
                    <div className="text-xs text-white/50 mt-0.5">Your identity has been verified. Withdrawal limits are fully unlocked.</div>
                  </div>
                </div>
              )}

              {kycStatus === "pending" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin flex-shrink-0" />
                  <div>
                    <div className="text-sm font-mono font-bold text-yellow-400">Under Review</div>
                    <div className="text-xs text-white/50 mt-0.5">Our team is reviewing your submission. This usually takes 24–48 hours.</div>
                  </div>
                </div>
              )}

              {(kycStatus === "none" || kycStatus === "rejected" || !kycStatus) && (
                <div className="space-y-3">
                  {kycStatus === "rejected" && (
                    <div className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      Your previous submission was rejected. Please re-submit with valid details.
                    </div>
                  )}
                  {kycStatus === "none" && (
                    <p className="text-xs text-white/50">
                      Verify your identity to unlock full withdrawal limits and higher daily limits.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-white/40 block mb-1">Full Name</label>
                      <input
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                        placeholder="As on your ID"
                        value={kycFullName}
                        onChange={e => setKycFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-white/40 block mb-1">Country</label>
                      <input
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                        placeholder="e.g. Nigeria"
                        value={kycCountry}
                        onChange={e => setKycCountry(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-white/40 block mb-1">Document Type</label>
                    <select
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 text-white"
                      value={kycDocType}
                      onChange={e => setKycDocType(e.target.value)}
                    >
                      <option value="passport">Passport</option>
                      <option value="national_id">National ID</option>
                      <option value="drivers_license">Driver's License</option>
                    </select>
                  </div>
                  <Button
                    className="w-full font-mono text-xs h-9 gap-2"
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
                          toast({ title: "KYC submitted!", description: "We'll review your request within 24–48 hours." });
                          setKycFullName(""); setKycCountry("");
                        } else {
                          const d = await r.json() as { error?: string };
                          toast({ title: "Submission failed", description: d.error ?? "Please try again.", variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "Network error", variant: "destructive" });
                      } finally {
                        setKycSubmitting(false);
                      }
                    }}
                  >
                    {kycSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Submit for Verification
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
