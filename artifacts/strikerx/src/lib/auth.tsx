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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(localStorage.getItem("strikerx_token"));
  const [adminToken, setAdminTokenState] = useState<string | null>(localStorage.getItem("strikerx_admin_token"));
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

  const { data: player, isLoading } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false
    }
  });

  return (
    <AuthContext.Provider value={{ token, adminToken, setToken, setAdminToken, player: player || null, isLoading }}>
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
