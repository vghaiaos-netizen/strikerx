import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useTelegramAuth } from "@workspace/api-client-react";

/**
 * Handles initial Telegram WebApp auth on first mount AND listens for
 * `strikerx:reauth` events dispatched by ws-notifications.tsx when the
 * WS server rejects a stale/expired JWT.
 *
 * Must be called from a component that is ALWAYS mounted (App.tsx / Router),
 * NOT from a page component that may not be active on the current route.
 */
export function useDevAuth() {
  const { setToken } = useAuth();
  const telegramAuth = useTelegramAuth();
  const tried = useRef(false);

  const runAuth = () => {
    const tg = (window as unknown as Record<string, unknown>).Telegram as {
      WebApp?: { initData?: string; initDataUnsafe?: { start_param?: string } };
    } | undefined;
    const initData   = tg?.WebApp?.initData;
    const startParam = tg?.WebApp?.initDataUnsafe?.start_param;

    if (initData) {
      telegramAuth.mutate(
        { data: { initData, referralCode: startParam || undefined } },
        { onSuccess: (d) => setToken(d.token) },
      );
    } else if (import.meta.env.DEV) {
      telegramAuth.mutate(
        { data: { initData: "dev:123456:player_dev" } },
        { onSuccess: (d) => setToken(d.token) },
      );
    }
  };

  // Initial auth — run exactly once on first mount
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    runAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-auth when WS signals the token is stale/expired.
  // This listener MUST live in a component that is always mounted so it catches
  // auth failures regardless of which route the player is on.
  useEffect(() => {
    const handler = () => runAuth();
    window.addEventListener("strikerx:reauth", handler);
    return () => window.removeEventListener("strikerx:reauth", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
