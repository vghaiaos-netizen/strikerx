import { AdminLayout } from "@/components/admin-layout";
import { useGetAdminOverview, getGetAdminOverviewQueryKey } from "@workspace/api-client-react";

export function AdminDashboard() {
  const { data: overview, isLoading } = useGetAdminOverview({
    query: {
      queryKey: getGetAdminOverviewQueryKey()
    }
  });

  return (
    <AdminLayout>
      <h1 className="text-3xl font-mono font-bold text-primary mb-6">DASHBOARD</h1>
      
      {isLoading ? (
        <div className="animate-pulse flex gap-4"><div className="w-1/4 h-32 bg-card rounded-xl"></div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Players Online" value={overview?.playersOnline || 0} />
          <StatCard title="Total Players" value={overview?.totalPlayers || 0} />
          <StatCard title="Today Volume (TON)" value={overview?.todayVolumeTon || 0} />
          <StatCard title="Today Profit (TON)" value={overview?.todayProfitTon || 0} />
          <StatCard title="Pending Withdrawals" value={overview?.pendingWithdrawals || 0} />
          <StatCard title="Jackpot Amount" value={overview?.jackpotAmount || 0} />
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ title, value }: { title: string, value: number | string }) {
  return (
    <div className="bg-card border border-border p-6 rounded-xl flex flex-col">
      <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">{title}</span>
      <span className="text-3xl font-mono font-bold text-foreground">{value}</span>
    </div>
  );
}