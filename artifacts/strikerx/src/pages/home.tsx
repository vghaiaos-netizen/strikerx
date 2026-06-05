import { useAuth } from "@/lib/auth";
import { useTelegramAuth, useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Flame, Target, Bomb, Zap } from "lucide-react";

export function Home() {
  const { player, setToken, isLoading } = useAuth();
  const telegramAuth = useTelegramAuth();
  
  useEffect(() => {
    // Mock telegram auth for development
    if (!player && !isLoading && !localStorage.getItem("strikerx_token")) {
      telegramAuth.mutate({ data: { initData: "mock_init_data" } }, {
        onSuccess: (data) => {
          setToken(data.token);
        }
      });
    }
  }, [player, isLoading, telegramAuth, setToken]);

  const { data: jackpot } = useGetJackpot({
    query: {
      queryKey: getGetJackpotQueryKey(),
      refetchInterval: 30000
    }
  });

  return (
    <Layout>
      <div className="p-4 flex flex-col gap-6">
        
        {/* Jackpot Widget */}
        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50 mix-blend-overlay"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Live Jackpot</span>
          <div className="text-4xl font-mono font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
            {jackpot?.currentAmountTon || 0} TON
          </div>
          <div className="w-full bg-black/50 h-2 rounded-full mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-secondary h-full" style={{ width: `${jackpot?.percentFull || 0}%` }} />
          </div>
        </div>

        {/* Balance Strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Striker</span>
            <span className="font-mono font-bold text-sm text-foreground mt-1">{player?.strikerBalance || 0}</span>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Boot</span>
            <span className="font-mono font-bold text-sm text-secondary mt-1">{player?.bootBalance || 0}</span>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Captain</span>
            <span className="font-mono font-bold text-sm text-primary mt-1">{player?.captainBalance || 0}</span>
          </div>
        </div>

        {/* Games */}
        <div>
          <h2 className="text-lg font-bold mb-3 font-mono tracking-tight">ORIGINALS</h2>
          <div className="grid grid-cols-2 gap-3">
            <GameCard href="/games/shot" name="The Shot" icon={<Flame className="text-primary" />} bg="bg-primary/5" />
            <GameCard href="/games/penalty" name="Penalty" icon={<Target className="text-blue-500" />} bg="bg-blue-500/5" />
            <GameCard href="/games/minefield" name="Minefield" icon={<Bomb className="text-destructive" />} bg="bg-destructive/5" />
            <GameCard href="/games/freekick" name="Free Kick" icon={<Zap className="text-secondary" />} bg="bg-secondary/5" />
          </div>
        </div>

      </div>
    </Layout>
  );
}

function GameCard({ href, name, icon, bg }: { href: string; name: string; icon: React.ReactNode; bg: string }) {
  return (
    <Link href={href} className={`relative flex flex-col p-4 rounded-xl border border-border overflow-hidden transition-all hover:border-primary/50 active:scale-95 ${bg}`}>
      <div className="mb-4 bg-background/50 w-10 h-10 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/5">
        {icon}
      </div>
      <div className="font-bold font-mono tracking-tight">{name}</div>
    </Link>
  );
}