import { useState, useEffect, Component, ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/ws-notifications";
import { GlobalWinOverlay } from "@/components/big-win-overlay";
import { useDevAuth } from "@/lib/use-telegram-auth";
import NotFound from "@/pages/not-found";
import LanguagePicker from "@/pages/language-picker";
import { getSavedLang, saveLangLocally, getLangDir, type LangCode } from "@/i18n";

import { Home } from "./pages/home";
import { Profile } from "./pages/profile";
import { Deposit } from "./pages/deposit";
import { Withdraw } from "./pages/withdraw";
import { Leaderboard } from "./pages/leaderboard";
import { Loyalty } from "./pages/loyalty";

import { TheShot } from "./pages/games/shot";
import { Penalty } from "./pages/games/penalty";
import { Minefield } from "./pages/games/minefield";
import { FreeKick } from "./pages/games/freekick";
import { Trading } from "./pages/games/trading";

import { Markets }   from "./pages/markets";
import { Portfolio } from "./pages/portfolio";
import { Account }   from "./pages/account";

import { Verify } from "./pages/verify";
import { Achievements } from "./pages/achievements";
import HowToPlay from "./pages/how-to-play";

import { AdminLogin } from "./pages/admin/login";
import { AdminDashboard } from "./pages/admin/dashboard";
import { AdminPlayers } from "./pages/admin/players";
import { AdminWithdrawals } from "./pages/admin/withdrawals";
import { AdminConfig } from "./pages/admin/config";
import { AdminAnalytics } from "./pages/admin/analytics";
import { AdminAuditLog } from "./pages/admin/audit-log";
import { AdminBroadcast } from "./pages/admin/broadcast";
import { AdminTournaments } from "./pages/admin/tournaments";
import { AdminRateEvents } from "./pages/admin/rate-events";
import { AdminFlagged } from "./pages/admin/flagged";
import { AdminMatchEvents } from "./pages/admin/match-events";
import { AdminKyc } from "./pages/admin/kyc";
import { AdminAffiliates } from "./pages/admin/affiliates";
import { AdminJackpot } from "./pages/admin/jackpot";
import { AdminInbox } from "./pages/admin/inbox";
import { AdminOutreach } from "./pages/admin/outreach";
import { AdminTrading } from "./pages/admin/trading";
import { AdminTradingAssets } from "./pages/admin/trading-assets";
import { AdminManualDeposits } from "./pages/admin/manual-deposits";

const queryClient = new QueryClient();

// ── Global error boundary — prevents entire app going blank on a render error ──
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err?.message ?? "Unknown error" };
  }
  componentDidCatch(err: Error, info: { componentStack: string }) {
    // Log for debugging without crashing
    console.error("[StrikerX] Render error:", err, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center gap-4">
          <div className="text-2xl font-black text-red-400">Something went wrong</div>
          <p className="text-sm text-muted-foreground max-w-xs">{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="mt-2 px-6 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  // Handles initial Telegram auth AND the strikerx:reauth listener.
  // Must live here (always mounted) — not in any page component that may not be active.
  useDevAuth();

  return (
    <Switch>
      <Route path="/" component={Trading} />
      <Route path="/games" component={Home} />

      {/* Player Pages */}
      <Route path="/games/trading"   component={Trading} />
      <Route path="/games/shot"      component={TheShot} />
      <Route path="/games/penalty"   component={Penalty} />
      <Route path="/games/minefield" component={Minefield} />
      <Route path="/games/freekick"  component={FreeKick} />
      <Route path="/profile"         component={Profile} />
      <Route path="/deposit"         component={Deposit} />
      <Route path="/withdraw"        component={Withdraw} />
      <Route path="/leaderboard"     component={Leaderboard} />
      <Route path="/verify"          component={Verify} />
      <Route path="/achievements"    component={Achievements} />
      <Route path="/loyalty"         component={Loyalty} />
      <Route path="/markets"         component={Markets} />
      <Route path="/portfolio"       component={Portfolio} />
      <Route path="/account"         component={Account} />
      <Route path="/guide"           component={HowToPlay} />

      {/* Admin Pages */}
      <Route path="/admin"                component={AdminLogin} />
      <Route path="/admin/dashboard"      component={AdminDashboard} />
      <Route path="/admin/players"        component={AdminPlayers} />
      <Route path="/admin/withdrawals"       component={AdminWithdrawals} />
      <Route path="/admin/manual-deposits"   component={AdminManualDeposits} />
      <Route path="/admin/config"         component={AdminConfig} />
      <Route path="/admin/analytics"      component={AdminAnalytics} />
      <Route path="/admin/audit-log"      component={AdminAuditLog} />
      <Route path="/admin/broadcast"      component={AdminBroadcast} />
      <Route path="/admin/tournaments"    component={AdminTournaments} />
      <Route path="/admin/rate-events"    component={AdminRateEvents} />
      <Route path="/admin/flagged"        component={AdminFlagged} />
      <Route path="/admin/match-events"   component={AdminMatchEvents} />
      <Route path="/admin/kyc"            component={AdminKyc} />
      <Route path="/admin/affiliates"     component={AdminAffiliates} />
      <Route path="/admin/jackpot"        component={AdminJackpot} />
      <Route path="/admin/inbox"          component={AdminInbox} />
      <Route path="/admin/outreach"       component={AdminOutreach} />
      <Route path="/admin/trading/assets"  component={AdminTradingAssets} />
      <Route path="/admin/trading"        component={AdminTrading} />

      <Route component={NotFound} />
    </Switch>
  );
}

// Syncs the server's stored language preference to the client on first auth
function LangSyncer() {
  const { player, token } = useAuth();
  const { i18n } = useTranslation();

  useEffect(() => {
    const serverLang = (player as Record<string, unknown>)?.languagePreference as string | undefined;
    if (!serverLang || serverLang === i18n.language) return;
    // Server preference wins over local storage when they first diverge
    saveLangLocally(serverLang);
    i18n.changeLanguage(serverLang);
    document.documentElement.dir = getLangDir(serverLang);
    document.documentElement.lang = serverLang;
  }, [(player as Record<string, unknown>)?.languagePreference as string, token]);

  return null;
}

function AppShell() {
  const { i18n } = useTranslation();

  // Apply RTL / LTR direction whenever language changes
  useEffect(() => {
    const dir = getLangDir(i18n.language);
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
    document.documentElement.classList.add("dark");
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NotificationsProvider>
            <LangSyncer />
            <AppErrorBoundary>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </AppErrorBoundary>
            <Toaster />
            <GlobalWinOverlay />
          </NotificationsProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  const { i18n } = useTranslation();

  // Ensure a language is always set — default to English on first visit
  useEffect(() => {
    if (!getSavedLang()) {
      saveLangLocally("en");
      i18n.changeLanguage("en");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell />;
}

export default App;
