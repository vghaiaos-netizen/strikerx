import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetTradingAssets,
  useGetTradingPrices,
  getGetTradingAssetsQueryKey,
  getGetTradingPricesQueryKey,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart2, Zap } from "lucide-react";

const ASSET_CATEGORIES: Record<string, string[]> = {
  All:         [],
  Crypto:      ["BTC", "ETH", "SOL", "BNB", "TON"],
  Forex:       ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  Commodities: ["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "COPPER"],
};

const ASSET_META: Record<string, { color: string; icon: string; digits: number }> = {
  BTC:    { color: "#f7931a", icon: "₿",  digits: 2 },
  ETH:    { color: "#627eea", icon: "Ξ",  digits: 2 },
  SOL:    { color: "#9945ff", icon: "◎",  digits: 3 },
  BNB:    { color: "#f0b90b", icon: "⬡",  digits: 2 },
  TON:    { color: "#0098ea", icon: "◆",  digits: 4 },
  EURUSD: { color: "#0ea5e9", icon: "€",  digits: 5 },
  GBPUSD: { color: "#8b5cf6", icon: "£",  digits: 5 },
  USDJPY: { color: "#f59e0b", icon: "¥",  digits: 3 },
  AUDUSD: { color: "#22c55e", icon: "A$", digits: 5 },
  USDCHF: { color: "#ef4444", icon: "₣",  digits: 5 },
  XAUUSD: { color: "#fbbf24", icon: "Au", digits: 2 },
  XAGUSD: { color: "#94a3b8", icon: "Ag", digits: 4 },
  USOIL:  { color: "#78350f", icon: "OIL",digits: 2 },
  NATGAS: { color: "#0891b2", icon: "GAS",digits: 3 },
  COPPER: { color: "#b45309", icon: "Cu", digits: 4 },
};

function formatPrice(symbol: string, price: number): string {
  const digits = ASSET_META[symbol]?.digits ?? 2;
  if (price >= 1000) return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (digits <= 2) return "$" + price.toFixed(2);
  return price.toFixed(digits);
}

export function Markets() {
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<string>("All");
  const tickerRef = useRef<HTMLDivElement>(null);

  const { data: assetsData } = useGetTradingAssets({
    query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: pricesData } = useGetTradingPrices({
    query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 3000 },
  });

  const assets = assetsData?.assets ?? [];
  const prices = pricesData?.prices ?? {};
  const changes = (pricesData as Record<string, unknown>)?.changes24h as Record<string, number> ?? {};

  const filtered = category === "All"
    ? assets
    : assets.filter((a) => ASSET_CATEGORIES[category]?.includes(a.symbol));

  // Auto-scroll ticker
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let x = 0;
    const speed = 0.4;
    let raf: number;
    const scroll = () => {
      x += speed;
      if (x >= el.scrollWidth / 2) x = 0;
      el.scrollLeft = x;
      raf = requestAnimationFrame(scroll);
    };
    raf = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(raf);
  }, [assets.length]);

  const goToTrade = (symbol: string) => {
    sessionStorage.setItem("strikerx_selected_asset", symbol);
    navigate("/");
  };

  return (
    <Layout>
      <div className="flex flex-col pb-6">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart2 size={18} className="text-primary" />
            <h1 className="font-black text-lg tracking-tight">Markets</h1>
          </div>
          <p className="text-xs text-muted-foreground">Live prices across all tradable assets</p>
        </div>

        {/* Ticker strip */}
        {assets.length > 0 && (
          <div
            ref={tickerRef}
            className="overflow-hidden whitespace-nowrap border-y border-border bg-card/50 py-2 px-0 select-none"
            style={{ scrollBehavior: "auto" }}
          >
            {/* Duplicate for seamless loop */}
            {[...assets, ...assets].map((a, i) => {
              const price  = prices[a.symbol];
              const change = changes[a.symbol] ?? 0;
              const isUp   = change >= 0;
              const meta   = ASSET_META[a.symbol];
              return (
                <span
                  key={`${a.symbol}-${i}`}
                  className="inline-flex items-center gap-1.5 mx-4 cursor-pointer"
                  onClick={() => goToTrade(a.symbol)}
                >
                  <span className="text-[10px] font-mono font-bold" style={{ color: meta?.color ?? "#fff" }}>
                    {a.symbol}
                  </span>
                  <span className="text-[10px] font-mono text-white">
                    {price ? formatPrice(a.symbol, price) : "—"}
                  </span>
                  <span className={`text-[9px] font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-1.5 px-4 mt-4 mb-3 overflow-x-auto no-scrollbar">
          {Object.keys(ASSET_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                category === cat
                  ? "bg-primary text-black"
                  : "bg-card border border-border text-muted-foreground hover:text-white hover:border-white/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Asset grid */}
        <div className="px-4 grid grid-cols-2 gap-2.5">
          {filtered.map((asset) => {
            const price  = prices[asset.symbol];
            const change = changes[asset.symbol] ?? 0;
            const isUp   = change >= 0;
            const meta   = ASSET_META[asset.symbol];
            const payout = parseFloat(String(asset.payoutRatio));
            const payoutPct = Math.round((payout - 1) * 100);

            return (
              <motion.div
                key={asset.symbol}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black"
                      style={{ background: `${meta?.color ?? "#fff"}20`, color: meta?.color ?? "#fff" }}
                    >
                      {meta?.icon ?? asset.symbol[0]}
                    </span>
                    <div>
                      <p className="text-xs font-bold leading-tight">{asset.symbol}</p>
                      <p className="text-[9px] text-muted-foreground leading-tight">{asset.displayName}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-0.5 text-[9px] font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {isUp ? "+" : ""}{change.toFixed(2)}%
                  </div>
                </div>

                {/* Price */}
                <div className="font-mono font-black text-base tabular-nums">
                  {price ? formatPrice(asset.symbol, price) : <span className="text-muted-foreground text-xs">Loading…</span>}
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Zap size={8} className="text-yellow-400" />
                    {payoutPct}% payout
                  </span>
                  <button
                    onClick={() => goToTrade(asset.symbol)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors"
                  >
                    Trade
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No assets in this category</div>
        )}
      </div>
    </Layout>
  );
}
