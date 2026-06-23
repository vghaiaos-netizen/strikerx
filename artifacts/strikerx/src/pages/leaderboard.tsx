import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Star, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";

const VIP_ICONS: Record<string, React.ReactNode> = {
  sunday_league: null,
  championship: <Star size={12} className="text-blue-400" />,
  premier_league: <Star size={12} className="text-purple-400" />,
  champions_league: <Medal size={12} className="text-yellow-400" />,
  world_cup: <Crown size={12} className="text-yellow-400" />,
};

const VIP_LABELS: Record<string, string> = {
  sunday_league: "Sunday League", championship: "Championship",
  premier_league: "Premier League", champions_league: "Champions League", world_cup: "World Cup",
};

const RANK_STYLES = [
  "text-yellow-400 bg-yellow-400/10 border-yellow-500/30",
  "text-gray-300 bg-gray-400/10 border-gray-500/30",
  "text-orange-400 bg-orange-400/10 border-orange-500/30",
];

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

export function Leaderboard() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("wagered");

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "wagered",   label: t('leaderboard.topWagerers') },
    { key: "wins",      label: t('leaderboard.topWinners') },
    { key: "streak",    label: t('leaderboard.streakKings') },
    { key: "referrals", label: t('leaderboard.referrals') },
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

  const formatScore = (tab: Tab, score: number) => {
    switch (tab) {
      case "wagered":   return `${Number(score).toFixed(2)} TON`;
      case "wins":      return `${Math.round(score).toLocaleString()} STRIKER`;
      case "streak":    return t('leaderboard.scoreDays', { count: score });
      case "referrals": return t('leaderboard.scoreRefs', { count: score });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
              <Trophy size={20} className="text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-mono font-bold text-foreground">{t('leaderboard.title').toUpperCase()}</h1>
              <p className="text-xs text-muted-foreground">{t('leaderboard.subtitle')}</p>
            </div>
          </div>

          {/* Tournament Banner */}
          {tournament && (
            <div className="mb-4 p-3 rounded-xl bg-green-950/50 border border-green-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-mono font-bold text-green-400">{t('leaderboard.tournamentLive')}</span>
                </div>
                <span className="text-xs text-green-300 font-mono">{t('leaderboard.tonPrize', { amount: tournament.prizePoolTon })}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {tournament.type} · Ends {new Date(tournament.endTime).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted/30 rounded-xl mb-4">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  activeTab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
            ))
          ) : !data?.entries?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy size={48} className="text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-mono">{t('leaderboard.noData')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('leaderboard.beFirst')}</p>
            </div>
          ) : (
            data.entries.map((entry) => {
              const isTop3 = entry.rank <= 3;
              const rankStyle = RANK_STYLES[entry.rank - 1] ?? "text-muted-foreground bg-muted/20 border-border";
              return (
                <div
                  key={entry.playerId}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    isTop3 ? "bg-card border-primary/20 shadow-sm" : "bg-card/50 border-border/50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center font-mono font-bold text-sm flex-shrink-0 ${rankStyle}`}>
                    {entry.rank === 1 ? <Trophy size={16} className="text-yellow-400" />
                     : entry.rank === 2 ? <Medal size={16} className="text-gray-300" />
                     : entry.rank === 3 ? <Medal size={16} className="text-orange-400" />
                     : `#${entry.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-bold text-sm truncate ${isTop3 ? "text-foreground" : "text-muted-foreground"}`}>
                        {entry.username}
                      </span>
                      {VIP_ICONS[entry.vipTier]}
                    </div>
                    <div className="text-xs text-muted-foreground">{VIP_LABELS[entry.vipTier] ?? entry.vipTier}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-mono font-bold text-sm ${isTop3 ? "text-primary" : "text-muted-foreground"}`}>
                      {formatScore(activeTab, entry.score)}
                    </div>
                    {entry.gamesPlayed !== undefined && (
                      <div className="text-xs text-muted-foreground">{t('leaderboard.scoreGames', { count: entry.gamesPlayed })}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
