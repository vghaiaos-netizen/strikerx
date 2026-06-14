import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Trophy, User, Wallet, TrendingUp, Globe, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";
import { useGetJackpot, getGetJackpotQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import { useTranslation } from "react-i18next";

interface WcTheme { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { player } = useAuth();
  const { t } = useTranslation();
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());

  const toggleSound = () => {
    if (soundManager.isEnabled()) {
      soundManager.disable();
      setSoundEnabled(false);
    } else {
      soundManager.enable();
      setSoundEnabled(true);
    }
  };

  const { data: jackpot } = useGetJackpot({
    query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 30000 },
  });

  const { data: wcTheme } = useQuery<WcTheme>({
    queryKey: ["wc-theme"],
    queryFn: async () => {
      const res = await fetch("/api/public/wc-theme");
      return res.json() as Promise<WcTheme>;
    },
    refetchInterval: 300_000,
    staleTime: 60_000,
  });

  const pct     = jackpot?.percentFull ?? 0;
  const isReady = jackpot?.status === "ready";
  const wcActive = wcTheme?.active ?? false;

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background flex flex-col relative overflow-hidden text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="font-mono font-bold text-xl text-primary tracking-tighter">
                STRIKER<span className="text-white/20">X</span>
              </span>
              {wcActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1 bg-[#e63946]/15 border border-[#e63946]/25 rounded-full px-1.5 py-0.5"
                >
                  <Globe className="w-2.5 h-2.5 text-[#e63946]" />
                  <span className="text-[8px] font-mono font-bold text-[#e63946] tracking-widest">WC '26</span>
                </motion.div>
              )}
            </div>
          </Link>
          <div className="flex gap-2 items-center">
            <button
              onClick={toggleSound}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground"
              title={soundEnabled ? "Mute" : "Unmute"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <div className="bg-muted px-2 py-1 rounded-md text-xs font-mono font-bold">
              {Math.round(player?.strikerBalance ?? 0).toLocaleString()} STRK
            </div>
            <NotificationBell />
          </div>
        </div>

        {/* Jackpot progress bar */}
        {jackpot && (
          <div
            className={`h-[3px] w-full relative overflow-hidden ${isReady ? "bg-[#f59e0b]/20" : "bg-white/5"}`}
            title={`Golden Boot Jackpot: ${Number(jackpot.currentAmountTon).toFixed(2)} TON`}
          >
            <motion.div
              className={`h-full ${isReady ? "bg-[#f59e0b]" : "bg-gradient-to-r from-[#f59e0b] to-[#00ff88]"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
              animate={isReady ? { opacity: [1, 0.4, 1] } : { width: `${Math.min(pct, 100)}%` }}
              transition={isReady ? { duration: 0.9, repeat: Infinity } : { duration: 0.5 }}
            />
          </div>
        )}

        {/* World Cup accent line */}
        {wcActive && (
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#e63946]/50 to-transparent" />
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 w-full max-w-[430px] bg-card border-t border-border grid grid-cols-5 px-1 py-2 z-50">
        <NavLink href="/"              icon={<Home       size={18} />} label={t('nav.home')}    active={location === "/"} />
        <NavLink href="/games/trading" icon={<TrendingUp size={18} />} label="Trade"             active={location.startsWith("/games/trading")} />
        <NavLink href="/deposit"       icon={<Wallet     size={18} />} label={t('nav.wallet')}  active={location === "/deposit" || location === "/withdraw"} />
        <NavLink href="/leaderboard"   icon={<Trophy     size={18} />} label={t('nav.rank')}    active={location === "/leaderboard"} />
        <NavLink href="/profile"       icon={<User       size={18} />} label={t('nav.profile')} active={location === "/profile"} />
      </nav>
    </div>
  );
}

function NavLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex flex-col items-center justify-center py-2 gap-1 rounded-lg transition-colors ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}>
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </Link>
  );
}
