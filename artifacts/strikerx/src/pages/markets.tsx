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
import { TrendingUp, TrendingDown, BarChart2, Zap, Search, X } from "lucide-react";

const ASSET_CATEGORIES: Record<string, string[]> = {
  All:         [],
  Crypto:      ["BTC", "ETH", "SOL", "BNB", "TON", "XRP", "DOGE", "AVAX", "MATIC"],
  Forex:       ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  Commodities: ["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "COPPER"],
  Indices:     ["SPX", "NDX", "DJI", "DAX", "FTSE", "NKY"],
};

const ASSET_META: Record<string, { color: string; icon: string; digits: number }> = {
  BTC:    { color: "#f7931a", icon: "₿",   digits: 2 },
  ETH:    { color: "#627eea", icon: "Ξ",   digits: 2 },
  SOL:    { color: "#9945ff", icon: "◎",   digits: 3 },
  BNB:    { color: "#f0b90b", icon: "⬡",   digits: 2 },
  TON:    { color: "#0098ea", icon: "◆",   digits: 4 },
  XRP:    { color: "#346aa9", icon: "✕",   digits: 4 },
  DOGE:   { color: "#c2a633", icon: "Ð",   digits: 5 },
  AVAX:   { color: "#e84142", icon: "A",   digits: 3 },
  MATIC:  { color: "#8247e5", icon: "M",   digits: 4 },
  EURUSD: { color: "#0ea5e9", icon: "€",   digits: 5 },
  GBPUSD: { color: "#8b5cf6", icon: "£",   digits: 5 },
  USDJPY: { color: "#f59e0b", icon: "¥",   digits: 3 },
  AUDUSD: { color: "#22c55e", icon: "A$",  digits: 5 },
  USDCHF: { color: "#ef4444", icon: "₣",   digits: 5 },
  XAUUSD: { color: "#fbbf24", icon: "Au",  digits: 2 },
  XAGUSD: { color: "#94a3b8", icon: "Ag",  digits: 4 },
  USOIL:  { color: "#78350f", icon: "OIL", digits: 2 },
  NATGAS: { color: "#0891b2", icon: "GAS", digits: 3 },
  COPPER: { color: "#b45309", icon: "Cu",  digits: 4 },
  SPX:    { color: "#00ff88", icon: "S&P", digits: 2 },
  NDX:    { color: "#00d4ff", icon: "NQ",  digits: 2 },
  DJI:    { color: "#3b82f6", icon: "DJ",  digits: 2 },
  DAX:    { color: "#f97316", icon: "DA",  digits: 2 },
  FTSE:   { color: "#a855f7", icon: "FT",  digits: 2 },
  NKY:    { color: "#f43f5e", icon: "NK",  digits: 2 },
};

const CATEGORY_LABELS: Record<string, string> = {
  All: "All", Crypto: "Crypto", Forex: "Forex", Commodities: "Commod.", Indices: "Indices",
};

function formatPrice(symbol: string, price: number): string {
  const digits = ASSET_META[symbol]?.digits ?? 2;
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (digits <= 2) return price.toFixed(2);
  return price.toFixed(digits);
}

export function Markets() {
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const tickerRef = useRef<HTMLDivElement>(null);

  const { data: assetsData } = useGetTradingAssets({
    query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: pricesData } = useGetTradingPrices({
    query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 3000 },
  });

  const assets  = assetsData?.assets ?? [];
  const prices  = (pricesData?.prices ?? {}) as Record<string, number>;
  const changes = ((pricesData as unknown as Record<string, unknown>)?.changes24h ?? {}) as Record<string, number>;

  // Top movers (only when showing All category and no search)
  const sortedByChange = [...assets].sort((a, b) => (changes[b.symbol] ?? 0) - (changes[a.symbol] ?? 0));
  const topGainers = sortedByChange.slice(0, 3).filter((a) => (changes[a.symbol] ?? 0) > 0);
  const topLosers  = [...sortedByChange].reverse().slice(0, 3).filter((a) => (changes[a.symbol] ?? 0) < 0);
  const showMovers = category === "All" && !search && assets.length > 0;

  const filtered = assets.filter((a) => {
    const inCategory = category === "All" || ASSET_CATEGORIES[category]?.includes(a.symbol);
    const inSearch = !search || a.symbol.toLowerCase().includes(search.toLowerCase()) || a.displayName.toLowerCase().includes(search.toLowerCase());
    return inCategory && inSearch;
  });

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

        {/* Top Movers */}
        {showMovers && (topGainers.length > 0 || topLosers.length > 0) && (
          <div className="px-4 mt-3 mb-1">
            <div className="grid grid-cols-2 gap-2">
              {/* Gainers */}
              {topGainers.length > 0 && (
                <div className="bg-green-950/40 border border-green-700/30 rounded-xl p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={10} className="text-green-400" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-green-400/70">Gainers</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {topGainers.map((a) => {
                      const chg = changes[a.symbol] ?? 0;
                      const meta = ASSET_META[a.symbol];
                      const px = prices[a.symbol];
                      return (
                        <button key={a.symbol} onClick={() => goToTrade(a.symbol)}
                          className="flex items-center justify-between gap-1 w-full text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0"
                              style={{ background: `${meta?.color ?? "#fff"}20`, color: meta?.color ?? "#fff" }}>
                              {meta?.icon ?? a.symbol[0]}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold leading-none">{a.symbol}</p>
                              {px && <p className="text-[8px] font-mono text-muted-foreground tabular-nums">{formatPrice(a.symbol, px)}</p>}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-green-400 tabular-nums">+{chg.toFixed(2)}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Losers */}
              {topLosers.length > 0 && (
                <div className="bg-red-950/40 border border-red-700/30 rounded-xl p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={10} className="text-red-400" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/70">Losers</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {topLosers.map((a) => {
                      const chg = changes[a.symbol] ?? 0;
                      const meta = ASSET_META[a.symbol];
                      const px = prices[a.symbol];
                      return (
                        <button key={a.symbol} onClick={() => goToTrade(a.symbol)}
                          className="flex items-center justify-between gap-1 w-full text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0"
                              style={{ background: `${meta?.color ?? "#fff"}20`, color: meta?.color ?? "#fff" }}>
                              {meta?.icon ?? a.symbol[0]}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold leading-none">{a.symbol}</p>
                              {px && <p className="text-[8px] font-mono text-muted-foreground tabular-nums">{formatPrice(a.symbol, px)}</p>}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-red-400 tabular-nums">{chg.toFixed(2)}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="px-4 mt-4 mb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-9 py-2.5 text-sm font-mono text-white placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 px-4 mt-2 mb-3 overflow-x-auto no-scrollbar">
          {Object.keys(ASSET_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setSearch(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                category === cat
                  ? "bg-primary text-black"
                  : "bg-card border border-border text-muted-foreground hover:text-white hover:border-white/20"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        {/* Asset grid */}
        <div className="px-4 grid grid-cols-2 gap-2.5">
          {filtered.map((asset, idx) => {
            const price     = prices[asset.symbol];
            const change    = changes[asset.symbol] ?? 0;
            const isUp      = change >= 0;
            const meta      = ASSET_META[asset.symbol];
            const payout    = parseFloat(String(asset.payoutRatio));
            const payoutPct = Math.round((payout - 1) * 100);

            return (
              <motion.div
                key={asset.symbol}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden"
              >
                {/* Accent glow top */}
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                  style={{ background: `linear-gradient(to right, ${meta?.color ?? "#fff"}60, transparent)` }} />

                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                      style={{ background: `${meta?.color ?? "#fff"}18`, color: meta?.color ?? "#fff", border: `1px solid ${meta?.color ?? "#fff"}25` }}
                    >
                      {meta?.icon ?? asset.symbol[0]}
                    </span>
                    <div>
                      <p className="text-xs font-bold leading-tight">{asset.symbol}</p>
                      <p className="text-[9px] text-muted-foreground leading-tight">{asset.displayName}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                    isUp ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                  }`}>
                    {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {isUp ? "+" : ""}{change.toFixed(2)}%
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2">
                  <div className="font-mono font-black text-lg tabular-nums leading-tight">
                    {price
                      ? formatPrice(asset.symbol, price)
                      : <span className="text-muted-foreground text-xs animate-pulse">Loading…</span>}
                  </div>
                  {price && change !== 0 && (
                    <span className={`text-[9px] font-mono tabular-nums ${isUp ? "text-green-400/70" : "text-red-400/70"}`}>
                      {isUp ? "+" : ""}{(price * change / 100).toFixed(ASSET_META[asset.symbol]?.digits ?? 2)}
                    </span>
                  )}
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Zap size={8} className="text-yellow-400" />
                    {payoutPct}%
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => goToTrade(asset.symbol)}
                    className="text-[10px] font-black px-3 py-1.5 rounded-lg text-black transition-all"
                    style={{ background: meta?.color ?? "#00ff88", boxShadow: `0 2px 12px ${meta?.color ?? "#00ff88"}40` }}
                  >
                    Trade
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {search ? `No results for "${search}"` : "No assets in this category"}
          </div>
        )}
      </div>
    </Layout>
  );
}
