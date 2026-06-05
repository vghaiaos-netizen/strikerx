import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useGetMyStats, getGetMyStatsQueryKey, useGetMyStreak, getGetMyStreakQueryKey, useGetMyReferral, getGetMyReferralQueryKey, useClaimStreakReward } from "@workspace/api-client-react";
import { Trophy, Copy, Check, LogOut, Zap, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const VIP_TIERS = ["Sunday League","Championship","Premier League","Champions League","World Cup"];
const VIP_COLORS = ["#6b7280","#3b82f6","#22c55e","#f59e0b","#a855f7"];
const VIP_THRESHOLDS = [0, 10, 50, 200, 1000];

export function Profile() {
  const { player, setToken } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: stats } = useGetMyStats({ query: { queryKey: getGetMyStatsQueryKey() } });
  const { data: streak } = useGetMyStreak({ query: { queryKey: getGetMyStreakQueryKey() } });
  const { data: referral } = useGetMyReferral({ query: { queryKey: getGetMyReferralQueryKey() } });
  const claimStreak = useClaimStreakReward();

  const p = player as Record<string, unknown> | null;
  const vipTier = p?.vipTier as string ?? "sunday_league";
  const vipIdx = ["sunday_league","championship","premier_league","champions_league","world_cup"].indexOf(vipTier);
  const vipName = VIP_TIERS[vipIdx] ?? "Sunday League";
  const vipColor = VIP_COLORS[vipIdx] ?? "#6b7280";
  const tonWagered = Number(p?.tonWageredLifetime ?? 0);
  const nextThreshold = VIP_THRESHOLDS[Math.min(vipIdx + 1, 4)];
  const vipPct = vipIdx >= 4 ? 100 : (tonWagered / nextThreshold) * 100;

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

  const initials = (p?.username as string ?? "?").slice(0, 2).toUpperCase();
  const statCards = [
    { label: "Total Games", value: stats?.totalGames ?? 0, icon: TrendingUp },
    { label: "Win Rate",    value: `${((stats?.winRate ?? 0) * 100).toFixed(0)}%`, icon: Target },
    { label: "Best Multi",  value: `${stats?.biggestMultiplier ?? 0}x`, icon: Zap },
  ];

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
            {VIP_TIERS.map((t, i) => (
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

        {/* Referral */}
        {referral && (
          <div className="bg-white/3 border border-white/6 rounded-xl p-4">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 mb-3">Referral</div>
            <div className="flex items-center gap-2 bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 mb-3">
              <span className="flex-1 font-mono text-sm text-white/80 tracking-wider">{referral.code}</span>
              <button onClick={copyCode} className="text-white/40 hover:text-white transition-colors">
                {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-black/20 rounded-lg p-2">
                <div className="text-[9px] font-mono text-white/30">Tier 1 (10%)</div>
                <div className="font-mono font-bold text-xs text-[#00ff88] mt-0.5">{Number(referral.tier1Earnings ?? 0).toFixed(0)} STRIKER</div>
              </div>
              <div className="bg-black/20 rounded-lg p-2">
                <div className="text-[9px] font-mono text-white/30">Tier 2 (5%)</div>
                <div className="font-mono font-bold text-xs text-[#00ff88] mt-0.5">{Number(referral.tier2Earnings ?? 0).toFixed(0)} STRIKER</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
