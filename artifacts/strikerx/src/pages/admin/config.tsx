import { AdminLayout } from "@/components/admin-layout";

export function AdminConfig() {
  return (
    <AdminLayout>
      <h1 className="text-3xl font-mono font-bold text-primary mb-6">CONFIG</h1>
      <div className="text-muted-foreground">Manage config here.</div>
    </AdminLayout>
  );
}