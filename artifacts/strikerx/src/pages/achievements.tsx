import { Layout } from "@/components/layout";
import { useGetMyAchievements } from "@workspace/api-client-react";
import { Lock, Star } from "lucide-react";
import { motion } from "framer-motion";

const RARITY_COLORS: Record<string, string> = {
  common:    "#6b7280",
  rare:      "#3b82f6",
  epic:      "#a855f7",
  legendary: "#f59e0b",
};

const RARITY_BG: Record<string, string> = {
  common:    "#6b728015",
  rare:      "#3b82f615",
  epic:      "#a855f715",
  legendary: "#f59e0b15",
};

const RARITY_ORDER = ["legendary", "epic", "rare", "common"];

export function Achievements() {
  const { data: achievements, isLoading } = useGetMyAchievements();

  const unlocked = achievements?.filter(a => a.unlockedAt) ?? [];
  const locked   = achievements?.filter(a => !a.unlockedAt) ?? [];

  const sortByRarity = (list: typeof achievements) =>
    [...(list ?? [])].sort(
      (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
    );

  return (
    <Layout>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-black text-lg text-white">Achievements</h1>
            <p className="text-[10px] font-mono text-white/40 mt-0.5">
              {unlocked.length} / {achievements?.length ?? 0} unlocked
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg px-3 py-1.5">
            <Star className="w-3 h-3 text-[#f59e0b]" />
            <span className="text-xs font-mono font-bold text-[#f59e0b]">{unlocked.length}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white/3 border border-white/6 rounded-xl p-3">
          <div className="flex justify-between text-[10px] font-mono text-white/40 mb-2">
            <span>Progress</span>
            <span>{Math.round((unlocked.length / Math.max(1, achievements?.length ?? 1)) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#00ff88]"
              initial={{ width: 0 }}
              animate={{ width: `${(unlocked.length / Math.max(1, achievements?.length ?? 1)) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Unlocked */}
        {unlocked.length > 0 && (
          <section>
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 mb-2">
              Unlocked ({unlocked.length})
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sortByRarity(unlocked).map((a, i) => (
                <AchievementCard key={a.key} achievement={a} index={i} unlocked />
              ))}
            </div>
          </section>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <section>
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 mb-2">
              Locked ({locked.length})
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sortByRarity(locked).map((a, i) => (
                <AchievementCard key={a.key} achievement={a} index={i} unlocked={false} />
              ))}
            </div>
          </section>
        )}

        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-white/3 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
}

function AchievementCard({
  achievement,
  index,
  unlocked,
}: {
  achievement: { key: string; title: string; description: string; rarity: string; unlockedAt?: string | null };
  index: number;
  unlocked: boolean;
}) {
  const color = RARITY_COLORS[achievement.rarity] ?? "#6b7280";
  const bg    = RARITY_BG[achievement.rarity]    ?? "#6b728015";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="relative rounded-xl border p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{
        borderColor: unlocked ? `${color}40` : "#ffffff08",
        background: unlocked ? bg : "rgba(255,255,255,0.02)",
      }}
    >
      {unlocked && (
        <div
          className="absolute inset-0 opacity-5"
          style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }}
        />
      )}

      <div className="flex items-start justify-between gap-1">
        <div
          className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: `${color}20`, color }}
        >
          {achievement.rarity}
        </div>
        {!unlocked && <Lock className="w-3 h-3 text-white/20 flex-shrink-0" />}
        {unlocked && <Star className="w-3 h-3 flex-shrink-0" style={{ color }} />}
      </div>

      <div className={`font-display font-bold text-sm leading-tight ${unlocked ? "text-white" : "text-white/30"}`}>
        {achievement.title}
      </div>
      <div className={`text-[10px] font-mono leading-snug ${unlocked ? "text-white/50" : "text-white/20"}`}>
        {achievement.description}
      </div>

      {achievement.unlockedAt && (
        <div className="text-[9px] font-mono text-white/25 mt-auto">
          {new Date(achievement.unlockedAt).toLocaleDateString()}
        </div>
      )}
    </motion.div>
  );
}
