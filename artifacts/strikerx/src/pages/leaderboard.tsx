import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Star, Crown, Flame, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

// ─── Constants ────────────────────────────────────────────────────────────────
const VIP_COLORS: Record<string, string> = {
  sunday_league:    "#6b7280",
  championship:     "#3b82f6",
  premier_league:   "#22c55e",
  champions_league: "#f59e0b",
  world_cup:        "#a855f7",
};

const VIP_LABELS: Record<string, string> = {
  sunday_league: "Sunday League", championship: "Championship",
  premier_league: "Premier League", champions_league: "Champions League", world_cup: "World Cup",
};

type Tab = "wagered" | "wins" | "streak" | "referrals";

interface LeaderboardEntry {
  rank: number; playerId: number; username: string; vipTier: string;
  score: number; gamesPlayed?: number;
}
interface LeaderboardResponse { entries: LeaderboardEntry[]; type: string; count: number; }

interface Tournament {
  id: number; type: string; prizePoolTon: number; status: string;
  startTime: string; endTime: string;
}

// ─── Podium ───────────────────────────────────────────────────────────────────
function Podium({ entries, tab, formatScore }: {
  entries: LeaderboardEntry[];
  tab: Tab;
  formatScore: (score: number) => string;
}) {
  const top = entries.slice(0, 3);
  if (top.length < 1) return null;

  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = ["h-20", "h-28", "h-16"];
  const rankColors = ["#94a3b8", "#f59e0b", "#b45309"];
  const rankLabels = ["2nd", "1st", "3rd"];
  const rankIdx    = [1, 0, 2];

  return (
    <div className="flex items-end justify-center gap-2 px-4 pt-4 pb-2">
      {order.map((entry, i) => {
        if (!entry) return <div key={i} className="flex-1" />;
        const color  = VIP_COLORS[entry.vipTier] ?? "#6b7280";
        const podIdx = rankIdx[i]!;
        const isFirst = podIdx === 0;

        return (
          <motion.div
            key={entry.playerId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex-1 flex flex-col items-center gap-1"
          >
            {/* Crown for #1 */}
            {isFirst && (
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Crown className="w-4 h-4 text-[#f59e0b]" />
              </motion.div>
            )}

            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-[#0a0e1a]"
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}88)`,
                boxShadow: isFirst ? `0 0 16px ${color}60` : "none",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {entry.username.slice(0, 2).toUpperCase()}
            </div>

            {/* Username */}
            <div className="text-[9px] font-mono font-bold text-white/60 truncate max-w-[64px] text-center">
              {entry.username}
            </div>

            {/* Score */}
            <div className="text-[9px] font-mono text-[#00ff88] font-bold text-center leading-tight">
              {formatScore(entry.score)}
            </div>

            {/* Podium block */}
            <div
              className={`w-full ${heights[podIdx]} rounded-t-xl flex items-center justify-center border-t border-x`}
              style={{
                background: `linear-gradient(to bottom, ${rankColors[podIdx]}20, ${rankColors[podIdx]}08)`,
                borderColor: `${rankColors[podIdx]}40`,
              }}
            >
              <span className="text-[10px] font-mono font-black" style={{ color: rankColors[podIdx] }}>
                {rankLabels[i]}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export function Leaderboard() {
  const { t } = useTranslation();
  const { token, player } = useAuth();
  const myId = (player as Record<string, unknown> | null)?.id as number | undefined;
  const [activeTab, setActiveTab] = useState<Tab>("wagered");
  const [tournamentSecs, setTournamentSecs] = useState(0);

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "wagered",   label: "Wagered"  },
    { key: "wins",      label: "Wins"     },
    { key: "streak",    label: "Streak"   },
    { key: "referrals", label: "Referrals"},
  ];

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/leaderboard", activeTab],
    queryFn: async () => {
      const r = await fetch(`/api/leaderboard?type=${activeTab}&limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: tournament } = useQuery<Tournament | null>({
    queryKey: ["/tournaments/active"],
    queryFn: async () => {
      const r = await fetch("/api/tournaments/active");
      if (!r.ok) return null;
      return r.json();
    },
  });

  // Tournament countdown
  useEffect(() => {
    if (!tournament?.endTime) return;
    const end = new Date(tournament.endTime).getTime();
    const tick = () => setTournamentSecs(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tournament?.endTime]);

  const formatScore = (score: number) => {
    switch (activeTab) {
      case "wagered":   return `${Number(score).toFixed(2)} TON`;
      case "wins":      return `${Math.round(score).toLocaleString()} SKR`;
      case "streak":    return `${score}d streak`;
      case "referrals": return `${score} refs`;
    }
  };

  const entries  = data?.entries ?? [];
  const myEntry  = entries.find(e => myId !== undefined && e.playerId === myId);
  const listRows = entries.slice(3); // rows 4+

  const fmtCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  return (
    <Layout>
      <div className="flex flex-col h-full relative">

        {/* Tournament banner */}
        {tournament ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-3 p-3 rounded-2xl bg-gradient-to-r from-[#00ff88]/10 to-[#f59e0b]/10 border border-[#00ff88]/25 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="text-xs font-mono font-bold text-[#00ff88]">LIVE TOURNAMENT</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-black text-[#f59e0b]">{tournament.prizePoolTon} TON prize</div>
              {tournamentSecs > 0 && (
                <div className="text-[9px] font-mono text-white/35">Ends in {fmtCountdown(tournamentSecs)}</div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-[10px] font-mono font-bold text-white/40">WEEKLY RANKINGS</span>
            </div>
            <span className="text-[9px] font-mono text-white/25">Top players earn bonus STRIKER</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 mx-4 mt-3 p-1 bg-white/3 rounded-xl border border-white/6">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-mono font-bold transition-all ${
                activeTab === key
                  ? "bg-[#00ff88] text-[#060a14] shadow-sm"
                  : "text-white/35 hover:text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {isLoading ? (
                <div className="flex flex-col gap-2 px-4 pt-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-14 bg-white/3 rounded-xl border border-white/6 animate-pulse" />
                  ))}
                </div>
              ) : !entries.length ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <Trophy className="w-12 h-12 text-white/10 mb-4" />
                  <div className="font-bold text-white/40 text-sm">No entries yet</div>
                  <div className="text-xs font-mono text-white/25 mt-1">Be the first on the board</div>
                </div>
              ) : (
                <>
                  {/* Podium — top 3 */}
                  <Podium entries={entries} tab={activeTab} formatScore={formatScore} />

                  {/* Rows 4+ */}
                  <div className="flex flex-col gap-1.5 px-4 pt-2">
                    {listRows.map((entry, i) => {
                      const isMe    = myId !== undefined && entry.playerId === myId;
                      const color   = VIP_COLORS[entry.vipTier] ?? "#6b7280";
                      return (
                        <motion.div
                          key={entry.playerId}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                            isMe
                              ? "bg-[#00ff88]/5 border-[#00ff88]/30"
                              : "bg-white/2 border-white/6"
                          }`}
                          style={isMe ? { boxShadow: "0 0 12px rgba(0,255,136,0.08)" } : {}}
                        >
                          <span className="text-[10px] font-mono text-white/30 w-6 text-right shrink-0">
                            #{entry.rank}
                          </span>
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] text-[#0a0e1a] shrink-0"
                            style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}
                          >
                            {entry.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold truncate ${isMe ? "text-[#00ff88]" : "text-white/80"}`}>
                                {entry.username}
                              </span>
                              {isMe && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#00ff88]/15 text-[#00ff88] uppercase tracking-widest shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] font-mono mt-0.5" style={{ color: `${color}80` }}>
                              {VIP_LABELS[entry.vipTier] ?? entry.vipTier}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-mono font-bold text-xs ${isMe ? "text-[#00ff88]" : "text-white/50"}`}>
                              {formatScore(entry.score)}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sticky your-rank bar — shown if you're NOT in the top entries displayed */}
        {myEntry && myEntry.rank > 10 && (
          <motion.div
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-0 left-0 right-0 px-4 pb-2 pt-2 bg-[#060a14]/90 backdrop-blur-sm border-t border-white/6"
          >
            <div className="flex items-center gap-3 bg-[#00ff88]/6 border border-[#00ff88]/25 rounded-xl px-3 py-2.5">
              <ChevronUp className="w-3.5 h-3.5 text-[#00ff88]" />
              <div className="flex-1 text-xs font-mono font-bold text-white/60">
                You are <span className="text-white">#{myEntry.rank}</span>
              </div>
              <div className="text-xs font-mono text-[#00ff88] font-bold">{formatScore(myEntry.score)}</div>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
