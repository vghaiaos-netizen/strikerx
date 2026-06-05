import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";

export function Profile() {
  const { player, setToken } = useAuth();
  
  return (
    <Layout>
      <div className="p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-mono font-bold text-primary mb-2">PROFILE</h1>
        
        <div className="bg-card border border-border p-4 rounded-xl flex items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-2xl font-bold text-primary font-mono">
            {player?.username?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <div className="font-bold text-lg">{player?.username || "Player"}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{player?.vipTier?.replace("_", " ") || "Sunday League"}</div>
          </div>
        </div>

        <button 
          onClick={() => setToken(null)}
          className="w-full mt-4 p-3 bg-destructive/10 text-destructive rounded-xl font-bold font-mono text-sm border border-destructive/20"
        >
          LOG OUT
        </button>
      </div>
    </Layout>
  );
}