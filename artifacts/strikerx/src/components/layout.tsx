import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { BarChart2, PieChart, User, Gamepad2, TrendingUp, Globe, Volume2, VolumeX, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import { useTranslation } from "react-i18next";

interface WcTheme { active: boolean; live: boolean; countdown: boolean; kickOff: string | null; endsAt: string | null; }

// Pages that are main-tab roots — no back button on these
const MAIN_TABS = new Set(["/", "/games", "/markets", "/portfolio", "/account", "/games/trading"]);

function useBackButton(location: string) {
  const isInner = !MAIN_TABS.has(location);

  useEffect(() => {
    const tg = (window as unknown as Record<string, unknown>).Telegram as {
      WebApp?: { BackButton?: { show: () => void; hide: () => void; onClick: (fn: () => void) => void; offClick: (fn: () => void) => void } };
    } | undefined;
    const bb = tg?.WebApp?.BackButton;
    if (!bb) return;
    if (isInner) {
      bb.show();
      const handler = () => window.history.back();
      bb.onClick(handler);
      return () => { bb.hide(); bb.offClick(handler); };
    } else {
      bb.hide();
      return;
    }
  }, [isInner]);

  return isInner;
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { player } = useAuth();
  const { t } = useTranslation();
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const showBackButton = useBackButton(location);

  const toggleSound = () => {
    if (soundManager.isEnabled()) {
      soundManager.disable();
      setSoundEnabled(false);
    } else {
      soundManager.enable();
      setSoundEnabled(true);
    }
  };

  const { data: wcTheme } = useQuery<WcTheme>({
    queryKey: ["wc-theme"],
    queryFn: async () => {
      const res = await fetch("/api/public/wc-theme");
      return res.json() as Promise<WcTheme>;
    },
    refetchInterval: 300_000,
    staleTime: 60_000,
  });

  const wcActive = wcTheme?.active ?? false;

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background flex flex-col relative overflow-hidden text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                onClick={() => window.history.back()}
                className="p-1 -ml-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Back"
              >
                <ChevronLeft size={20} />
              </button>
            )}
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
          </div>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={toggleSound}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground"
              title={soundEnabled ? "Mute" : "Unmute"}
            >
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            {player && (
              <div className="flex items-center gap-1">
                {parseFloat(String(player.tonBalance ?? 0)) > 0 && (
                  <div className="bg-[#0098ea]/10 border border-[#0098ea]/20 px-2 py-1 rounded-md text-[11px] font-mono font-bold text-[#0098ea]">
                    {parseFloat(String(player.tonBalance ?? 0)).toFixed(2)} TON
                  </div>
                )}
                <div className="bg-primary/10 border border-primary/20 px-2 py-1 rounded-md text-[11px] font-mono font-bold text-primary">
                  {Math.round(parseFloat(String(player.strikerBalance ?? 0))).toLocaleString()} STRK
                </div>
              </div>
            )}
            <NotificationBell />
          </div>
        </div>

        {/* World Cup accent line */}
        {wcActive && (
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#e63946]/50 to-transparent" />
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 w-full max-w-[430px] bg-card border-t border-border grid grid-cols-5 px-1 py-2 z-50">
        <NavLink href="/"          icon={<TrendingUp size={18} />} label="Trade"     active={location === "/" || location.startsWith("/games/trading")} />
        <NavLink href="/markets"   icon={<BarChart2  size={18} />} label="Markets"   active={location === "/markets"} />
        <NavLink href="/games"     icon={<Gamepad2   size={18} />} label="Games"     active={location === "/games" || (location.startsWith("/games/") && !location.startsWith("/games/trading"))} />
        <NavLink href="/portfolio" icon={<PieChart   size={18} />} label="Portfolio" active={location === "/portfolio" || location === "/loyalty"} />
        <NavLink href="/account"   icon={<User       size={18} />} label="Account"   active={location === "/account" || location === "/profile" || location === "/deposit" || location === "/withdraw"} />
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
