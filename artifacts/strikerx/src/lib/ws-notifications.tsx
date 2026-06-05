import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { ACHIEVEMENT_MAP } from "@/lib/achievement-defs";

export interface WsNotification {
  id: string;
  type: "big_win" | "jackpot_won" | "achievement_unlocked" | "tournament_ended";
  username: string;
  message: string;
  detail: string;
  at: number;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: WsNotification[];
  unreadCount: number;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clearAll: () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<WsNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const myPlayerIdRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!mounted.current) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate so server knows our playerId for targeted events
      const token = localStorage.getItem("strikerx_token");
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      }
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data) as { event: string; data: Record<string, unknown> };

        if (event === "auth_ok") {
          myPlayerIdRef.current = Number(data.playerId ?? 0);
          return;
        }

        if (event === "big_win") {
          const mult = Number(data.multiplier ?? 0);
          const win  = Number(data.winAmount ?? 0);
          const notif: WsNotification = {
            id: `bw-${Date.now()}-${Math.random()}`,
            type: "big_win",
            username: String(data.username ?? ""),
            message: `${data.username} hit ${mult.toFixed(2)}x`,
            detail:  `+${Math.round(win).toLocaleString()} STRK on ${data.game ?? ""}`,
            at:      Number(data.at ?? Date.now()),
            read:    false,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 30));
        }

        if (event === "jackpot_won") {
          const notif: WsNotification = {
            id: `jp-${Date.now()}-${Math.random()}`,
            type: "jackpot_won",
            username: String(data.username ?? ""),
            message:  `${data.username} won the Golden Boot!`,
            detail:   `${Number(data.amountTon ?? 0).toFixed(2)} TON jackpot`,
            at:       Number(data.at ?? Date.now()),
            read:     false,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 30));
        }

        if (event === "achievement_unlocked") {
          const pid = Number(data.playerId ?? 0);
          if (pid !== myPlayerIdRef.current) return; // only show own achievements
          const keys = (data.keys as string[] | undefined) ?? [];
          for (const key of keys) {
            const def = ACHIEVEMENT_MAP[key];
            if (!def) continue;
            const notif: WsNotification = {
              id: `ach-${key}-${Date.now()}`,
              type: "achievement_unlocked",
              username: String(data.username ?? ""),
              message:  `Achievement unlocked: ${def.title}`,
              detail:   def.description,
              at:       Number(data.at ?? Date.now()),
              read:     false,
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 30));
          }
        }

        if (event === "tournament_ended") {
          const notif: WsNotification = {
            id: `te-${Date.now()}`,
            type: "tournament_ended",
            username: "",
            message:  "Tournament has ended!",
            detail:   `Prize pool: ${Number(data.prizePoolTon ?? 0).toFixed(2)} TON distributed`,
            at:       Number(data.at ?? Date.now()),
            read:     false,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 30));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!mounted.current) return;
      reconnectTimer.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
