import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";

export interface WsNotification {
  id: string;
  type: "big_win" | "jackpot_won";
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

  const connect = useCallback(() => {
    if (!mounted.current) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data) as { event: string; data: Record<string, unknown> };

        if (event === "big_win") {
          const mult = Number(data.multiplier ?? 0);
          const win = Number(data.winAmount ?? 0);
          const notif: WsNotification = {
            id: `bw-${Date.now()}-${Math.random()}`,
            type: "big_win",
            username: String(data.username ?? ""),
            message: `${data.username} hit ${mult.toFixed(2)}x`,
            detail: `+${Math.round(win).toLocaleString()} STRK on ${data.game ?? ""}`,
            at: Number(data.at ?? Date.now()),
            read: false,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 30));
        }

        if (event === "jackpot_won") {
          const notif: WsNotification = {
            id: `jp-${Date.now()}-${Math.random()}`,
            type: "jackpot_won",
            username: String(data.username ?? ""),
            message: `${data.username} won the Golden Boot!`,
            detail: `${Number(data.amountTon ?? 0).toFixed(2)} TON jackpot`,
            at: Number(data.at ?? Date.now()),
            read: false,
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
