import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import NotFound from "@/pages/not-found";

import { Home } from "./pages/home";
import { Profile } from "./pages/profile";
import { Deposit } from "./pages/deposit";
import { Withdraw } from "./pages/withdraw";
import { Leaderboard } from "./pages/leaderboard";

import { TheShot } from "./pages/games/shot";
import { Penalty } from "./pages/games/penalty";
import { Minefield } from "./pages/games/minefield";
import { FreeKick } from "./pages/games/freekick";

import { AdminLogin } from "./pages/admin/login";
import { AdminDashboard } from "./pages/admin/dashboard";
import { AdminPlayers } from "./pages/admin/players";
import { AdminWithdrawals } from "./pages/admin/withdrawals";
import { AdminConfig } from "./pages/admin/config";
import { AdminAnalytics } from "./pages/admin/analytics";
import { AdminAuditLog } from "./pages/admin/audit-log";
import { AdminBroadcast } from "./pages/admin/broadcast";
import { AdminTournaments } from "./pages/admin/tournaments";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      {/* Player Pages */}
      <Route path="/games/shot" component={TheShot} />
      <Route path="/games/penalty" component={Penalty} />
      <Route path="/games/minefield" component={Minefield} />
      <Route path="/games/freekick" component={FreeKick} />
      <Route path="/profile" component={Profile} />
      <Route path="/deposit" component={Deposit} />
      <Route path="/withdraw" component={Withdraw} />
      <Route path="/leaderboard" component={Leaderboard} />

      {/* Admin Pages */}
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/players" component={AdminPlayers} />
      <Route path="/admin/withdrawals" component={AdminWithdrawals} />
      <Route path="/admin/config" component={AdminConfig} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/audit-log" component={AdminAuditLog} />
      <Route path="/admin/broadcast" component={AdminBroadcast} />
      <Route path="/admin/tournaments" component={AdminTournaments} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Ensure dark mode is active
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('dark');
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
