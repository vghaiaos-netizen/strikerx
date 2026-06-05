import { useState } from "react";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useAdminLogin();
  const { setAdminToken } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { username, password } }, {
      onSuccess: (data) => {
        setAdminToken(data.token);
        setLocation("/admin/dashboard");
      }
    });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center pb-8">
          <CardTitle className="font-mono text-3xl font-black text-primary">STRIKER<span className="text-secondary">X</span> <span className="text-foreground">ADMIN</span></CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input 
              placeholder="Username" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              className="bg-background border-border font-mono"
            />
            <Input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="bg-background border-border font-mono"
            />
            <Button type="submit" disabled={login.isPending} className="w-full mt-4 font-bold tracking-widest font-mono">
              {login.isPending ? "AUTHENTICATING..." : "SYSTEM LOGIN"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}