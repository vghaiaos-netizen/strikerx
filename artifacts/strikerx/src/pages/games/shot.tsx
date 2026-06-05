import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetCurrentRound, getGetCurrentRoundQueryKey, usePlaceShotBet, useCashoutShot } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export function TheShot() {
  const { player } = useAuth();
  const { toast } = useToast();
  const [betAmount, setBetAmount] = useState<number>(100);
  const [autoCashout, setAutoCashout] = useState<string>("");

  const { data: round } = useGetCurrentRound({
    query: {
      queryKey: getGetCurrentRoundQueryKey(),
      refetchInterval: 1000
    }
  });

  const placeBet = usePlaceShotBet();
  // We don't have the round ID to cash out dynamically easily from the hook list if we just placed it, but let's assume we can cashout current round
  const cashout = useCashoutShot();

  const handleBet = () => {
    if (!betAmount || betAmount <= 0) return;
    placeBet.mutate({ 
      data: { 
        betStriker: betAmount,
        autoCashout: autoCashout ? parseFloat(autoCashout) : undefined 
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Bet placed!", description: `Good luck on The Shot.` });
      },
      onError: (err: any) => {
        toast({ title: "Failed to place bet", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleCashout = () => {
    if (!round?.id) return;
    cashout.mutate({ id: round.id }, {
      onSuccess: (res) => {
        toast({ title: "Cashed out!", description: `Won ${res.winAmount} STRIKER at ${res.multiplier}x` });
      },
      onError: (err: any) => {
        toast({ title: "Cashout failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const isRunning = round?.status === "running";
  const isWaiting = round?.status === "waiting";
  const isCrashed = round?.status === "crashed";

  return (
    <Layout>
      <div className="p-4 flex flex-col h-full gap-4">
        <h1 className="text-2xl font-mono font-bold text-primary">THE SHOT</h1>
        
        <div className="flex-1 bg-card border border-border rounded-xl flex flex-col items-center justify-center p-8 relative overflow-hidden">
          {isRunning && (
            <div className="text-6xl font-mono font-black text-secondary animate-pulse">
              {round?.multiplier?.toFixed(2)}x
            </div>
          )}
          {isCrashed && (
            <div className="text-6xl font-mono font-black text-destructive">
              {round?.crashPoint?.toFixed(2)}x
              <div className="text-lg text-center mt-2 text-muted-foreground uppercase">Crashed</div>
            </div>
          )}
          {isWaiting && (
            <div className="text-4xl font-mono font-bold text-muted-foreground">
              Waiting for next round...
            </div>
          )}
          
          <div className="absolute bottom-4 left-4 text-xs font-mono text-muted-foreground">
            Players: {round?.activePlayers || 0}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 bg-card border border-border rounded-xl">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase mb-1 block">Bet Amount</label>
              <Input 
                type="number" 
                value={betAmount} 
                onChange={(e) => setBetAmount(parseFloat(e.target.value))}
                className="font-mono font-bold bg-background border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase mb-1 block">Auto Cashout</label>
              <Input 
                type="number" 
                step="0.1"
                placeholder="2.0"
                value={autoCashout} 
                onChange={(e) => setAutoCashout(e.target.value)}
                className="font-mono bg-background border-border"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button 
              onClick={handleBet} 
              disabled={!isWaiting || placeBet.isPending}
              className="font-mono font-bold"
            >
              PLACE BET
            </Button>
            <Button 
              onClick={handleCashout}
              disabled={!isRunning || cashout.isPending}
              variant="secondary"
              className="font-mono font-bold"
            >
              CASHOUT
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}