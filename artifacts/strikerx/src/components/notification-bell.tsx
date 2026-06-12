import { Bell, Trophy, Zap, Star, X, Medal } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNotifications, type WsNotification } from "@/lib/ws-notifications";
import { useTranslation } from "react-i18next";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function NotifRow({ n }: { n: WsNotification }) {
  let icon: React.ReactNode;
  switch (n.type) {
    case "jackpot_won":
      icon = <Trophy size={14} className="text-yellow-400 shrink-0 mt-0.5" />;
      break;
    case "achievement_unlocked":
      icon = <Star size={14} className="text-purple-400 shrink-0 mt-0.5" />;
      break;
    case "tournament_ended":
      icon = <Medal size={14} className="text-yellow-400 shrink-0 mt-0.5" />;
      break;
    default:
      icon = <Zap size={14} className="text-[#00c853] shrink-0 mt-0.5" />;
  }

  return (
    <div className="flex gap-2 px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">{n.message}</p>
        <p className="text-[11px] text-muted-foreground truncate">{n.detail}</p>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5">{timeAgo(n.at)}</span>
    </div>
  );
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-[#00c853] text-black text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-72 bg-card border border-border rounded-lg shadow-2xl z-[200] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">{t("notifications.liveFeed")}</span>
            <div className="flex gap-1">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                >
                  {t("notifications.clear")}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <Bell size={24} className="opacity-30" />
                <p className="text-xs">{t("notifications.noActivity")}</p>
              </div>
            ) : (
              notifications.map((n) => <NotifRow key={n.id} n={n} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
