import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  token: string | null;
  adminToken: string | null;
  setToken: (token: string | null) => void;
  setAdminToken: (token: string | null) => void;
  player: any | null;
  isLoading: boolean;
  /** True while the initial Telegram auth handshake is in flight (up to ~2s on first open). */
  isBootstrapping: boolean;
  setBootstrapping: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(localStorage.getItem("strikerx_token"));
  const [adminToken, setAdminTokenState] = useState<string | null>(localStorage.getItem("strikerx_admin_token"));
  // Bootstrapping = true while we're waiting for the first Telegram auth handshake.
  // If there's already a stored token this is false immediately (returning user).
  const [isBootstrapping, setBootstrapping] = useState<boolean>(!localStorage.getItem("strikerx_token"));
  const queryClient = useQueryClient();

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("strikerx_token", newToken);
    } else {
      localStorage.removeItem("strikerx_token");
    }
    setTokenState(newToken);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const setAdminToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("strikerx_admin_token", newToken);
    } else {
      localStorage.removeItem("strikerx_admin_token");
    }
    setAdminTokenState(newToken);
  };

  const { data: player, isLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false
    }
  });

  // If the stored token is invalid/expired (401), clear it so the dev auto-login
  // in home.tsx can re-authenticate cleanly.
  useEffect(() => {
    if (error && token) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        localStorage.removeItem("strikerx_token");
        setTokenState(null);
      }
    }
  }, [error, token]);

  return (
    <AuthContext.Provider value={{ token, adminToken, setToken, setAdminToken, player: player || null, isLoading, isBootstrapping, setBootstrapping }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
