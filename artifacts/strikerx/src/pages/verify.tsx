import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { ShieldCheck, Search, ArrowLeft, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HOUSE_EDGE = 0.03;

async function computeCrashPoint(serverSeed: string): Promise<number> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("crash"));
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const r = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  if (r < HOUSE_EDGE) return 1.0;
  const e = 1 - HOUSE_EDGE;
  return Math.max(1.0, parseFloat((e / (1 - r * e)).toFixed(2)));
}

interface RoundData {
  id: number;
  status: string;
  crashPoint: number | null;
  serverSeed: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export function Verify() {
  const [roundId, setRoundId] = useState("");
  const [manualSeed, setManualSeed] = useState("");
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [computedCrash, setComputedCrash] = useState<number | null>(null);
  const [hashHex, setHashHex] = useState("");
  const [rValue, setRValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualResult, setManualResult] = useState<number | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  const verified = roundData && computedCrash !== null && roundData.crashPoint !== null
    && Math.abs(computedCrash - roundData.crashPoint) < 0.01;

  const fetchAndVerify = async () => {
    setError("");
    setRoundData(null);
    setComputedCrash(null);
    setHashHex("");
    setRValue(null);

    const id = parseInt(roundId.trim(), 10);
    if (isNaN(id) || id <= 0) { setError("Enter a valid round ID"); return; }

    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/games/rounds/${id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Round not found"); return; }

      setRoundData(data);

      if (data.status !== "crashed" || !data.serverSeed) {
        setError("Round is not crashed yet — seed revealed only after crash");
        return;
      }

      // Compute and show intermediate values
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(data.serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode("crash"));
      const hash = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setHashHex(hash);

      const r = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
      setRValue(r);

      const crash = await computeCrashPoint(data.serverSeed);
      setComputedCrash(crash);
    } catch {
      setError("Network error — make sure you are logged in");
    } finally {
      setLoading(false);
    }
  };

  const verifyManual = async () => {
    const seed = manualSeed.trim();
    if (!seed) return;
    setManualLoading(true);
    try {
      const result = await computeCrashPoint(seed);
      setManualResult(result);
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <h1 className="font-bold text-lg text-foreground flex items-center gap-2">
              <ShieldCheck size={20} className="text-[#00c853]" />
              Provably Fair
            </h1>
            <p className="text-xs text-muted-foreground">Verify any crash round outcome</p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground">How it works</h2>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>Before each round, the server generates a random <span className="font-mono text-foreground">serverSeed</span>.</p>
            <p>The crash point is computed as <span className="font-mono text-foreground">HMAC-SHA256(serverSeed, "crash")</span> and cannot be changed after the round begins.</p>
            <p>The seed is revealed only after the round crashes, so you can verify the result was predetermined and fair.</p>
          </div>
          <div className="mt-3 bg-muted rounded-lg p-3 font-mono text-[11px] text-muted-foreground space-y-1">
            <p>hash = HMAC-SHA256(serverSeed, "crash")</p>
            <p>r = parseInt(hash[0..8], 16) / 0xffffffff</p>
            <p>if r &lt; 0.03: crash = 1.00x (house edge)</p>
            <p>else: crash = max(1.0, 0.97 / (1 - r×0.97))</p>
          </div>
        </div>

        {/* Lookup by Round ID */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Verify a Round</h2>
          <div className="space-y-1.5">
            <Label htmlFor="roundId" className="text-xs text-muted-foreground">Round ID</Label>
            <div className="flex gap-2">
              <Input
                id="roundId"
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchAndVerify()}
                placeholder="e.g. 42"
                className="font-mono text-sm"
              />
              <Button
                onClick={fetchAndVerify}
                disabled={loading || !roundId.trim()}
                size="sm"
                className="bg-[#00c853] text-black hover:bg-[#00a844] font-bold shrink-0"
              >
                {loading ? "..." : <Search size={16} />}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              <XCircle size={14} />
              {error}
            </div>
          )}

          {roundData && !error && (
            <div className="space-y-3 pt-1">
              {/* Round info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-muted-foreground mb-0.5">Round</p>
                  <p className="font-mono font-bold text-foreground">#{roundData.id}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-muted-foreground mb-0.5">Status</p>
                  <p className="font-mono font-bold text-foreground capitalize">{roundData.status}</p>
                </div>
              </div>

              {roundData.serverSeed && (
                <>
                  <div className="bg-muted rounded-lg p-2.5 space-y-1">
                    <p className="text-[11px] text-muted-foreground font-medium">Server Seed</p>
                    <p className="font-mono text-[11px] text-foreground break-all">{roundData.serverSeed}</p>
                  </div>

                  {hashHex && (
                    <div className="bg-muted rounded-lg p-2.5 space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">HMAC-SHA256 Hash</p>
                      <p className="font-mono text-[11px] text-foreground break-all">
                        <span className="text-[#00c853]">{hashHex.slice(0, 8)}</span>{hashHex.slice(8)}
                      </p>
                    </div>
                  )}

                  {rValue !== null && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted rounded-lg p-2.5">
                        <p className="text-muted-foreground mb-0.5">r value</p>
                        <p className="font-mono font-bold text-foreground">{rValue.toFixed(6)}</p>
                      </div>
                      <div className="bg-muted rounded-lg p-2.5">
                        <p className="text-muted-foreground mb-0.5">House edge</p>
                        <p className="font-mono font-bold text-foreground">3.00%</p>
                      </div>
                    </div>
                  )}

                  {/* Verification result */}
                  {computedCrash !== null && (
                    <div className={`rounded-xl p-4 border ${verified ? "border-[#00c853]/40 bg-[#00c853]/10" : "border-red-400/40 bg-red-400/10"}`}>
                      <div className="flex items-start gap-3">
                        {verified
                          ? <CheckCircle size={20} className="text-[#00c853] shrink-0 mt-0.5" />
                          : <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
                        }
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-foreground">
                            {verified ? "Round Verified" : "Verification Failed"}
                          </p>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p>Recorded crash: <span className="font-mono font-bold text-foreground">{roundData.crashPoint?.toFixed(2)}x</span></p>
                            <p>Computed crash: <span className={`font-mono font-bold ${verified ? "text-[#00c853]" : "text-red-400"}`}>{computedCrash.toFixed(2)}x</span></p>
                          </div>
                          {verified && <p className="text-[11px] text-[#00c853] font-medium mt-1">The outcome matches — this round was fair.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Manual verification */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Manual Verification</h2>
          <p className="text-xs text-muted-foreground">Enter any server seed to compute its crash point independently.</p>
          <div className="space-y-1.5">
            <Label htmlFor="manualSeed" className="text-xs text-muted-foreground">Server Seed (hex)</Label>
            <Input
              id="manualSeed"
              value={manualSeed}
              onChange={(e) => setManualSeed(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verifyManual()}
              placeholder="64-char hex string"
              className="font-mono text-xs"
            />
          </div>
          <Button
            onClick={verifyManual}
            disabled={manualLoading || !manualSeed.trim()}
            size="sm"
            variant="outline"
            className="w-full"
          >
            {manualLoading ? "Computing..." : "Compute Crash Point"}
          </Button>
          {manualResult !== null && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Crash point</p>
              <p className="text-2xl font-mono font-bold text-[#00c853]">{manualResult.toFixed(2)}x</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pb-2">
          <ExternalLink size={12} />
          <span>Crash formula is open source and verifiable by anyone</span>
        </div>
      </div>
    </Layout>
  );
}
