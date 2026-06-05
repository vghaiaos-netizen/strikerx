import { AdminLayout } from "@/components/admin-layout";

export function AdminWithdrawals() {
  return (
    <AdminLayout>
      <h1 className="text-3xl font-mono font-bold text-primary mb-6">WITHDRAWALS</h1>
      <div className="text-muted-foreground">Manage withdrawals here.</div>
    </AdminLayout>
  );
}