import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetTradingAssets, useGetTradingPrices,
  getGetTradingAssetsQueryKey, getGetTradingPricesQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart2, Zap, Search, X, Flame } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ASSET_CATEGORIES: Record<string, string[]> = {
  All:         [],
  Crypto:      ["BTC", "ETH", "SOL", "BNB", "TON", "XRP", "DOGE", "AVAX", "MATIC"],
  Forex:       ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"],
  Commodities: ["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "COPPER"],
  Indices:     ["SPX", "NDX", "DJI", "DAX", "FTSE", "NKY"],
};

const ASSET_META: Record<string, { color: string; icon: string; digits: number }> = {
  BTC:    { color: "#f7931a", icon: "B",   digits: 2 },
  ETH:    { color: "#627eea", icon: "E",   digits: 2 },
  SOL:    { color: "#9945ff", icon: "S",   digits: 3 },
  BNB:    { color: "#f0b90b", icon: "B",   digits: 2 },
  TON:    { color: "#0098ea", icon: "T",   digits: 4 },
  XRP:    { color: "#346aa9", icon: "X",   digits: 4 },
  DOGE:   { color: "#c2a633", icon: "D",   digits: 5 },
  AVAX:   { color: "#e84142", icon: "A",   digits: 3 },
  MATIC:  { color: "#8247e5", icon: "M",   digits: 4 },
  EURUSD: { color: "#0ea5e9", icon: "EU",  digits: 5 },
  GBPUSD: { color: "#8b5cf6", icon: "GB",  digits: 5 },
  USDJPY: { color: "#f59e0b", icon: "JP",  digits: 3 },
  AUDUSD: { color: "#22c55e", icon: "AU",  digits: 5 },
  USDCHF: { color: "#ef4444", icon: "CH",  digits: 5 },
  XAUUSD: { color: "#fbbf24", icon: "AU",  digits: 2 },
  XAGUSD: { color: "#94a3b8", icon: "AG",  digits: 4 },
  USOIL:  { color: "#78350f", icon: "OIL", digits: 2 },
  NATGAS: { color: "#0891b2", icon: "GAS", digits: 3 },
  COPPER: { color: "#b45309", icon: "CU",  digits: 4 },
  SPX:    { color: "#00ff88", icon: "SP",  digits: 2 },
  NDX:    { color: "#00d4ff", icon: "NQ",  digits: 2 },
  DJI:    { color: "#3b82f6", icon: "DJ",  digits: 2 },
  DAX:    { color: "#f97316", icon: "DA",  digits: 2 },
  FTSE:   { color: "#a855f7", icon: "FT",  digits: 2 },
  NKY:    { color: "#f43f5e", icon: "NK",  digits: 2 },
};

function formatPrice(symbol: string, price: number): string {
  const digits = ASSET_META[symbol]?.digits ?? 2;
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (digits <= 2) return price.toFixed(2);
  return price.toFixed(digits);
}

type SortMode = "default" | "gainers" | "losers";

// ─── Markets ──────────────────────────────────────────────────────────────────
export function Markets() {
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const tickerRef = useRef<HTMLDivElement>(null);

  const { data: assetsData } = useGetTradingAssets({
    query: { queryKey: getGetTradingAssetsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: pricesData } = useGetTradingPrices({
    query: { queryKey: getGetTradingPricesQueryKey(), refetchInterval: 3_000 },
  });

  const assets  = assetsData?.assets ?? [];
  const prices  = (pricesData?.prices ?? {}) as Record<string, number>;
  const changes = ((pricesData as unknown as Record<string, unknown>)?.changes24h ?? {}) as Record<string, number>;

  // Top movers
  const sortedByChange = [...assets].sort((a, b) => (changes[b.symbol] ?? 0) - (changes[a.symbol] ?? 0));
  const topGainers = sortedByChange.slice(0, 3).filter(a => (changes[a.symbol] ?? 0) > 0);
  const topLosers  = [...sortedByChange].reverse().slice(0, 3).filter(a => (changes[a.symbol] ?? 0) < 0);
  const showMovers = category === "All" && !search && assets.length > 0;

  // Category asset counts
  const assetCountByCategory: Record<string, number> = {};
  for (const [cat, syms] of Object.entries(ASSET_CATEGORIES)) {
    assetCountByCategory[cat] = cat === "All" ? assets.length : assets.filter(a => syms.includes(a.symbol)).length;
  }

  const baseFiltered = assets.filter(a => {
    const inCategory = category === "All" || ASSET_CATEGORIES[category]?.includes(a.symbol);
    const inSearch   = !search || a.symbol.toLowerCase().includes(search.toLowerCase()) || a.displayName.toLowerCase().includes(search.toLowerCase());
    return inCategory && inSearch;
  });

  const filtered = sortMode === "gainers"
    ? [...baseFiltered].sort((a, b) => (changes[b.symbol] ?? 0) - (changes[a.symbol] ?? 0))
    : sortMode === "losers"
    ? [...baseFiltered].sort((a, b) => (changes[a.symbol] ?? 0) - (changes[b.symbol] ?? 0))
    : baseFiltered;

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

        {/* ── HEADER ── */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart2 className="w-4.5 h-4.5 text-[#00ff88]" size={18} />
            <h1 className="font-black text-lg">Markets</h1>
          </div>
          <p className="text-[10px] font-mono text-white/30">Live prices · 82% payout · instant settlement</p>
        </div>

        {/* ── TICKER STRIP ── */}
        {assets.length > 0 && (
          <div
            ref={tickerRef}
            className="overflow-hidden whitespace-nowrap border-y border-white/6 bg-white/2 py-2 select-none"
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
                  <span className="text-[10px] font-mono text-white/70">
                    {price ? formatPrice(a.symbol, price) : "—"}
                  </span>
                  <span className={`text-[9px] font-mono ${isUp ? "text-[#00ff88]" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* ── TOP MOVERS ── */}
        {showMovers && (topGainers.length > 0 || topLosers.length > 0) && (
          <div className="px-4 mt-4 mb-1">
            <div className="grid grid-cols-2 gap-2">
              {/* Gainers */}
              {topGainers.length > 0 && (
                <div className="bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <TrendingUp className="w-3 h-3 text-[#00ff88]" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#00ff88]/60">Top Gainers</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {topGainers.map(a => {
                      const chg  = changes[a.symbol] ?? 0;
                      const meta = ASSET_META[a.symbol];
                      const px   = prices[a.symbol];
                      return (
                        <button key={a.symbol} onClick={() => goToTrade(a.symbol)}
                          className="flex items-center justify-between gap-1 w-full text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0"
                              style={{ background: `${meta?.color ?? "#fff"}18`, color: meta?.color ?? "#fff" }}>
                              {meta?.icon ?? a.symbol.slice(0, 2)}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold leading-tight">{a.symbol}</p>
                              {px && <p className="text-[8px] font-mono text-white/25 tabular-nums">{formatPrice(a.symbol, px)}</p>}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-[#00ff88] tabular-nums">+{chg.toFixed(2)}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Losers */}
              {topLosers.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Top Losers</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {topLosers.map(a => {
                      const chg  = changes[a.symbol] ?? 0;
                      const meta = ASSET_META[a.symbol];
                      const px   = prices[a.symbol];
                      return (
                        <button key={a.symbol} onClick={() => goToTrade(a.symbol)}
                          className="flex items-center justify-between gap-1 w-full text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0"
                              style={{ background: `${meta?.color ?? "#fff"}18`, color: meta?.color ?? "#fff" }}>
                              {meta?.icon ?? a.symbol.slice(0, 2)}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold leading-tight">{a.symbol}</p>
                              {px && <p className="text-[8px] font-mono text-white/25 tabular-nums">{formatPrice(a.symbol, px)}</p>}
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

        {/* ── SEARCH ── */}
        <div className="px-4 mt-4 mb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={13} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full bg-white/3 border border-white/8 rounded-xl pl-9 pr-9 py-2.5 text-sm font-mono text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── CATEGORY TABS ── */}
        <div className="flex gap-1.5 px-4 mt-1 mb-3 overflow-x-auto no-scrollbar">
          {Object.keys(ASSET_CATEGORIES).map(cat => {
            const count  = assetCountByCategory[cat] ?? 0;
            const isActive = category === cat;
            return (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setSearch(""); setSortMode("default"); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  isActive
                    ? "bg-[#00ff88] text-[#060a14] border-transparent"
                    : "bg-white/3 border-white/8 text-white/40 hover:text-white/70 hover:border-white/18"
                }`}
              >
                {cat}
                <span className={`text-[9px] font-mono ${isActive ? "text-[#060a14]/60" : "text-white/20"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── SORT ── */}
        <div className="flex gap-1.5 px-4 mb-3">
          {([
            { key: "default",  label: "Default"      },
            { key: "gainers",  label: "Gainers"      },
            { key: "losers",   label: "Losers"       },
          ] as { key: SortMode; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortMode(key)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                sortMode === key
                  ? key === "gainers" ? "bg-[#00ff88]/12 border-[#00ff88]/35 text-[#00ff88]"
                    : key === "losers"  ? "bg-red-500/12 border-red-500/35 text-red-400"
                    : "bg-white/10 border-white/20 text-white"
                  : "border-white/6 text-white/30 hover:text-white/60 hover:border-white/15"
              }`}
            >
              {key === "gainers" && <TrendingUp size={9} />}
              {key === "losers"  && <TrendingDown size={9} />}
              {label}
            </button>
          ))}
        </div>

        {/* ── ASSET GRID ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${category}-${sortMode}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4 grid grid-cols-2 gap-2.5"
          >
            {filtered.map((asset, idx) => {
              const price     = prices[asset.symbol];
              const change    = changes[asset.symbol] ?? 0;
              const isUp      = change >= 0;
              const isHot     = Math.abs(change) >= 2;
              const meta      = ASSET_META[asset.symbol];
              const payout    = parseFloat(String(asset.payoutRatio));
              const payoutPct = Math.round((payout - 1) * 100);

              return (
                <motion.div
                  key={asset.symbol}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.025 }}
                  className="bg-white/2 border border-white/8 rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden"
                >
                  {/* Color accent top */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                    style={{ background: `linear-gradient(to right, ${meta?.color ?? "#fff"}60, transparent)` }} />

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                        style={{
                          background: `${meta?.color ?? "#fff"}15`,
                          color: meta?.color ?? "#fff",
                          border: `1px solid ${meta?.color ?? "#fff"}20`,
                        }}
                      >
                        {meta?.icon ?? asset.symbol.slice(0, 2)}
                      </span>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-bold leading-tight">{asset.symbol}</p>
                          {isHot && (
                            <Flame className="w-2.5 h-2.5 text-[#f59e0b]" />
                          )}
                        </div>
                        <p className="text-[8px] font-mono text-white/25 leading-tight truncate max-w-[60px]">{asset.displayName}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${
                      isUp ? "text-[#00ff88] bg-[#00ff88]/8" : "text-red-400 bg-red-500/8"
                    }`}>
                      {isUp ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                      {isUp ? "+" : ""}{change.toFixed(2)}%
                    </div>
                  </div>

                  {/* Price */}
                  <div className="font-black text-base tabular-nums leading-tight text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {price
                      ? formatPrice(asset.symbol, price)
                      : <span className="text-white/20 text-xs font-mono animate-pulse">Loading…</span>
                    }
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-white/5">
                    <span className="text-[9px] font-mono text-white/25 flex items-center gap-0.5">
                      <Zap className="w-2 h-2 text-[#f59e0b]" />
                      {payoutPct}%
                    </span>
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => goToTrade(asset.symbol)}
                      className="text-[10px] font-black px-3 py-1.5 rounded-lg text-[#060a14] transition-all"
                      style={{
                        background: meta?.color ?? "#00ff88",
                        boxShadow: `0 2px 10px ${meta?.color ?? "#00ff88"}35`,
                      }}
                    >
                      Trade
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-14 text-white/25 text-sm font-mono">
            {search ? `No results for "${search}"` : "No assets in this category"}
          </div>
        )}
      </div>
    </Layout>
  );
}
