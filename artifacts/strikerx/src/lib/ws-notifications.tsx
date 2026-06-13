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
  const authRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const authRetries = useRef(0);
  const reconnectAttempts = useRef(0);
  const mounted = useRef(true);
  const myPlayerIdRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!mounted.current) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      authRetries.current = 0;
      reconnectAttempts.current = 0;
      if (authRetryTimer.current) { clearTimeout(authRetryTimer.current); authRetryTimer.current = null; }

      // Keepalive ping every 20 s (keeps mobile proxies from killing idle sockets).
      if (pingInterval.current) clearInterval(pingInterval.current);
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 20_000);

      // Auth with polling: home.tsx fires Telegram re-auth on every open, which
      // writes a fresh JWT to localStorage ~200-500 ms after this WS connects.
      // Poll every 500 ms for up to 30 s so we catch the token even if it isn't
      // in localStorage at the instant onopen fires.
      let pollCount = 0;
      const tryAuth = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const token = localStorage.getItem("strikerx_token");
        if (token) {
          ws.send(JSON.stringify({ type: "auth", token }));
        } else if (pollCount < 60) {
          pollCount++;
          setTimeout(tryAuth, 500);
        }
      };
      tryAuth();
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data) as { event: string; data: Record<string, unknown> };

        if (event === "auth_ok") {
          authRetries.current = 0;
          if (authRetryTimer.current) { clearTimeout(authRetryTimer.current); authRetryTimer.current = null; }
          myPlayerIdRef.current = Number(data.playerId ?? 0);
          return;
        }

        // If server rejects our token, wait for a FRESH token to land in
        // localStorage (home.tsx re-auths with Telegram on every open, writing a
        // new JWT within ~200-500 ms). Poll until the value changes, then retry.
        if (event === "error") {
          const msg = String(data.message ?? "");
          if (msg === "Invalid token" || msg.includes("Authentication timeout")) {
            if (authRetryTimer.current) clearTimeout(authRetryTimer.current);
            const failedToken = localStorage.getItem("strikerx_token");
            let pollCount = 0;
            const waitForFreshToken = () => {
              if (ws.readyState !== WebSocket.OPEN) return; // onclose will reconnect
              const current = localStorage.getItem("strikerx_token");
              if (current && current !== failedToken) {
                // A new token arrived — retry auth
                ws.send(JSON.stringify({ type: "auth", token: current }));
              } else if (pollCount < 60) {
                // Keep polling every 500 ms for up to 30 s
                pollCount++;
                authRetryTimer.current = setTimeout(waitForFreshToken, 500);
              } else {
                // Gave up — close so onclose reconnects cleanly
                ws.close();
              }
            };
            authRetryTimer.current = setTimeout(waitForFreshToken, 300);
            return;
          }
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
      if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
      if (!mounted.current) return;
      reconnectAttempts.current += 1;
      const delay = Math.min(16000, 1000 * 2 ** (reconnectAttempts.current - 1));
      reconnectTimer.current = setTimeout(connect, delay);
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
      if (authRetryTimer.current) clearTimeout(authRetryTimer.current);
      if (pingInterval.current) clearInterval(pingInterval.current);
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
