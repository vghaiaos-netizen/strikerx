import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Trophy, User, Wallet, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { player } = useAuth();

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background flex flex-col relative overflow-hidden text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <span className="font-mono font-bold text-xl text-primary tracking-tighter cursor-pointer">
            STRIKER<span className="text-secondary">X</span>
          </span>
        </Link>
        <div className="flex gap-2 items-center">
          <div className="bg-muted px-2 py-1 rounded-md text-xs font-mono font-bold">
            {Math.round(player?.strikerBalance ?? 0).toLocaleString()} STRK
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 w-full max-w-[430px] bg-card border-t border-border grid grid-cols-5 px-2 py-2 z-50">
        <NavLink href="/" icon={<Home size={20} />} label="Home" active={location === "/"} />
        <NavLink href="/leaderboard" icon={<Trophy size={20} />} label="Rank" active={location === "/leaderboard"} />
        <NavLink href="/deposit" icon={<Wallet size={20} />} label="Wallet" active={location === "/deposit" || location === "/withdraw"} />
        <NavLink href="/profile" icon={<User size={20} />} label="Profile" active={location === "/profile"} />
        <NavLink href="/verify" icon={<ShieldCheck size={20} />} label="Verify" active={location === "/verify"} />
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
