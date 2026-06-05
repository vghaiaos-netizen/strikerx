import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ArrowLeftRight, Settings, BarChart,
  ScrollText, Radio, Trophy, LogOut, ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/players", label: "Players", icon: Users },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowLeftRight },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/broadcast", label: "Broadcast", icon: Radio },
  { href: "/admin/config", label: "Config", icon: Settings },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { adminToken, setAdminToken } = useAuth();

  if (!adminToken) {
    window.location.href = "/admin";
    return null;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex text-foreground">
      <aside className="w-56 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-border">
          <h1 className="font-mono text-xl font-black text-primary tracking-tight">
            STRIKER<span className="text-green-400">X</span>
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/admin/dashboard" && location.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={15} />
                <span className="font-mono flex-1">{label}</span>
                {active && <ChevronRight size={12} className="opacity-60" />}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={() => { setAdminToken(null); window.location.href = "/admin"; }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-mono"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8 min-w-0">
        {children}
      </main>
    </div>
  );
}