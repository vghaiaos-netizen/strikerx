import { AdminLayout } from "@/components/admin-layout";

export function AdminPlayers() {
  return (
    <AdminLayout>
      <h1 className="text-3xl font-mono font-bold text-primary mb-6">PLAYERS</h1>
      <div className="text-muted-foreground">Manage players here.</div>
    </AdminLayout>
  );
}