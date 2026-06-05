import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, ArrowLeftRight, Settings, BarChart } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { adminToken, setAdminToken } = useAuth();

  if (!adminToken) {
    window.location.href = "/admin";
    return null;
  }

  const links = [
    { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/admin/players", label: "Players", icon: <Users size={18} /> },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: <ArrowLeftRight size={18} /> },
    { href: "/admin/config", label: "Config", icon: <Settings size={18} /> },
    { href: "/admin/analytics", label: "Analytics", icon: <BarChart size={18} /> },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-background flex text-foreground">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="font-mono text-2xl font-bold text-primary">STRIKER<span className="text-secondary">X</span></h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Admin Panel</p>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          {links.map(link => {
            const active = location.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${active ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button 
            onClick={() => { setAdminToken(null); window.location.href = "/admin"; }}
            className="w-full text-left px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}