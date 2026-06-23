import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type UTCTimestamp,
  type IPriceLine,
} from "lightweight-charts";

interface TradingChartProps {
  symbol:          string;
  interval:        "1m" | "5m" | "15m" | "30m" | "1h";
  currentPrice:    number | null;
  entryPrice:      number | null;
  chartMode:       "candle" | "line";
  expiresAt?:      string | null;
  token?:          string | null;
  activeDirection?: "UP" | "DOWN" | null;
  isWinning?:      boolean | null;
}

type KlineBar = CandlestickData<UTCTimestamp> & { volume?: number };

const INTERVAL_SECS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600 };

export function TradingChart({ symbol, interval, currentPrice, entryPrice, chartMode, expiresAt, token, activeDirection, isWinning }: TradingChartProps) {
  const wrapRef        = useRef<HTMLDivElement>(null);   // outer wrapper for overlays
  const containerRef   = useRef<HTMLDivElement>(null);   // chart canvas target
  const chartRef       = useRef<IChartApi | null>(null);
  const candleRef      = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef        = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef         = useRef<ISeriesApi<"Histogram"> | null>(null);
  const liveCandleRef  = useRef<KlineBar | null>(null);
  const entryLineRef   = useRef<IPriceLine | null>(null);
  const liveLineRef    = useRef<IPriceLine | null>(null);
  const symbolRef      = useRef(symbol);
  const intervalRef    = useRef(interval);

  const [isLoading, setIsLoading] = useState(false);
  const [hasData,   setHasData]   = useState(false);

  // ── Expiry countdown overlay ──────────────────────────────────────────────
  const [expiryLabel,   setExpiryLabel]   = useState<string | null>(null);
  const [expirySeconds, setExpirySeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) { setExpiryLabel(null); setExpirySeconds(null); return; }
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setExpiryLabel(null); setExpirySeconds(null); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setExpiryLabel(m > 0 ? `${m}m ${s}s` : `${s}s`);
      setExpirySeconds(m * 60 + s);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  // ── Mount chart once ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background:  { type: ColorType.Solid, color: "transparent" },
        textColor:   "rgba(255,255,255,0.35)",
        fontFamily:  "ui-monospace, 'JetBrains Mono', Menlo, monospace",
        fontSize:    10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2332", width: 1 },
        horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2332", width: 1 },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor:     "rgba(255,255,255,0.30)",
        scaleMargins:  { top: 0.06, bottom: 0.20 },  // leave space for volume at bottom
      },
      timeScale: {
        borderVisible:  false,
        timeVisible:    true,
        secondsVisible: false,
        fixRightEdge:   true,
        rightOffset:    4,
        barSpacing:     6,
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale:  { mouseWheel: false, pinch: true },
      width:  el.clientWidth,
      height: el.clientHeight,
    });

    // ── Candlestick series ───────────────────────────────────────────────
    const candleSeries = chart.addCandlestickSeries({
      upColor:          "#22c55e",
      downColor:        "#ef4444",
      borderUpColor:    "#22c55e",
      borderDownColor:  "#ef4444",
      wickUpColor:      "rgba(34,197,94,0.65)",
      wickDownColor:    "rgba(239,68,68,0.65)",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // ── Line series (mode toggle) ────────────────────────────────────────
    const lineSeries = chart.addLineSeries({
      color:                  "#00ff88",
      lineWidth:              2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius:  4,
      lastValueVisible:       false,
      priceLineVisible:       false,
    });

    // ── Volume histogram — separate price scale ──────────────────────────
    const volSeries = chart.addHistogramSeries({
      color:            "rgba(34,197,94,0.18)",
      priceFormat:      { type: "volume" },
      priceScaleId:     "vol",
      lastValueVisible: false,
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    candleSeries.applyOptions({ visible: true });
    lineSeries.applyOptions({ visible: false });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    lineRef.current   = lineSeries;
    volRef.current    = volSeries;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      lineRef.current   = null;
      volRef.current    = null;
      liveCandleRef.current = null;
      entryLineRef.current  = null;
      liveLineRef.current   = null;
    };
  }, []);

  // ── Toggle candle / line mode ────────────────────────────────────────────
  // After toggling, request an animation frame so the chart can re-measure
  // its price axis before re-fitting — prevents the "skewed" scale jump.
  useEffect(() => {
    if (!candleRef.current || !lineRef.current || !chartRef.current) return;
    candleRef.current.applyOptions({ visible: chartMode === "candle" });
    lineRef.current.applyOptions({ visible: chartMode === "line" });
    // Re-fit price scale after the DOM has settled so wicks vs close-only
    // don't leave a mismatched Y-axis between the two series.
    requestAnimationFrame(() => {
      chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
      chartRef.current?.timeScale().fitContent();
    });
  }, [chartMode]);

  // ── Fetch klines when symbol or interval changes ─────────────────────────
  useEffect(() => {
    symbolRef.current   = symbol;
    intervalRef.current = interval;
    liveCandleRef.current = null;

    // Remove stale live price line
    if (liveLineRef.current && candleRef.current) {
      try { candleRef.current.removePriceLine(liveLineRef.current); } catch { /* ignore */ }
      liveLineRef.current = null;
    }

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Immediately wipe stale data so we never show the previous asset's
    // candles while the new asset loads (avoids visual skew / ghost chart).
    if (candleRef.current) { try { candleRef.current.setData([]); } catch { /* ignore */ } }
    if (lineRef.current)   { try { lineRef.current.setData([]);   } catch { /* ignore */ } }
    if (volRef.current)    { try { volRef.current.setData([]);    } catch { /* ignore */ } }

    let cancelled = false;
    setIsLoading(true);
    setHasData(false);

    fetch(
      `/api/trading/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=150`,
      { headers },
    )
      .then((r) => (r.ok ? r.json() as Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }> }> : null))
      .then((data) => {
        if (cancelled) return;
        setIsLoading(false);
        if (!data?.candles?.length) return;
        if (symbolRef.current !== symbol || intervalRef.current !== interval) return;
        setHasData(true);

        const bars: KlineBar[] = data.candles.map((c) => ({
          time:   c.time as UTCTimestamp,
          open:   c.open,
          high:   c.high,
          low:    c.low,
          close:  c.close,
          volume: c.volume,
        }));

        if (!candleRef.current || !lineRef.current || !volRef.current) return;
        candleRef.current.setData(bars);
        lineRef.current.setData(bars.map((b): LineData<UTCTimestamp> => ({ time: b.time, value: b.close })));

        // Volume histogram — color by candle direction
        volRef.current.setData(bars.map((b) => ({
          time:  b.time,
          value: b.volume ?? 0,
          color: b.close >= b.open ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.22)",
        })));

        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol, interval, token]);

  // ── Manage entry price line ──────────────────────────────────────────────
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current); } catch { /* ignore */ }
      entryLineRef.current = null;
    }

    if (entryPrice !== null && entryPrice > 0) {
      entryLineRef.current = series.createPriceLine({
        price:            entryPrice,
        color:            "#c084fc",
        lineWidth:        2,
        lineStyle:        LineStyle.Dashed,
        axisLabelVisible: true,
        title:            "Entry",
      });
    }
  }, [entryPrice]);

  // ── Live candle + live price line ────────────────────────────────────────
  useEffect(() => {
    if (currentPrice === null || currentPrice <= 0) return;

    const secs   = INTERVAL_SECS[interval] ?? 60;
    const bucket = (Math.floor(Date.now() / 1000 / secs) * secs) as UTCTimestamp;

    const live = liveCandleRef.current;
    let updated: KlineBar;

    if (live && live.time === bucket) {
      updated = { ...live, close: currentPrice, high: Math.max(live.high, currentPrice), low: Math.min(live.low, currentPrice) };
    } else {
      const prev = live?.close ?? currentPrice;
      updated = { time: bucket, open: prev, high: Math.max(prev, currentPrice), low: Math.min(prev, currentPrice), close: currentPrice };
    }

    liveCandleRef.current = updated;

    try {
      candleRef.current?.update(updated);
      lineRef.current?.update({ time: bucket, value: currentPrice });
    } catch { /* time went backwards — ignore */ }

    // Create or update the live price horizontal line
    if (candleRef.current) {
      if (!liveLineRef.current) {
        liveLineRef.current = candleRef.current.createPriceLine({
          price:            currentPrice,
          color:            "rgba(0,255,136,0.55)",
          lineWidth:        1,
          lineStyle:        LineStyle.Solid,
          axisLabelVisible: true,
          title:            "",
        });
      } else {
        liveLineRef.current.applyOptions({ price: currentPrice });
      }
    }
  }, [currentPrice, interval]);

  // Derived direction colors
  const zoneColor = activeDirection === "UP" ? "0,255,136" : activeDirection === "DOWN" ? "239,68,68" : null;
  const zoneAlpha = isWinning === true ? 0.10 : isWinning === false ? 0.04 : 0.06;

  return (
    <div ref={wrapRef} className="w-full h-full relative">
      {/* The actual chart canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Active direction zone overlay */}
      {zoneColor && activeDirection && (
        <div
          className="absolute inset-0 pointer-events-none z-[1] transition-opacity duration-700"
          style={{
            background: activeDirection === "UP"
              ? `linear-gradient(to top, transparent 35%, rgba(${zoneColor},${zoneAlpha}) 100%)`
              : `linear-gradient(to bottom, transparent 35%, rgba(${zoneColor},${zoneAlpha}) 100%)`,
          }}
        />
      )}

      {/* Winning/losing edge glow */}
      {isWinning !== null && isWinning !== undefined && activeDirection && (
        <div
          className="absolute inset-0 pointer-events-none z-[1] rounded-b-sm transition-opacity duration-500"
          style={{
            boxShadow: isWinning
              ? "inset 0 -3px 0 rgba(0,255,136,0.5)"
              : "inset 0 -3px 0 rgba(239,68,68,0.5)",
          }}
        />
      )}

      {/* Klines loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
          <span className="text-[10px] text-muted-foreground/50 animate-pulse tracking-widest">LOADING</span>
        </div>
      )}

      {/* Shown when Binance is geo-blocked (Replit dev) — chart builds from live ticks */}
      {!isLoading && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
          <span className="text-[10px] text-muted-foreground/30 tracking-wider">Building from live feed…</span>
        </div>
      )}

      {/* Active position expiry badge */}
      {expiryLabel && expirySeconds !== null && (
        <div
          className={`absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg pointer-events-none transition-all duration-300 ${
            expirySeconds <= 10
              ? "px-2.5 py-1.5 bg-red-500/25 border border-red-500/60"
              : expirySeconds <= 30
              ? "px-2 py-1 bg-orange-500/20 border border-orange-500/45"
              : "px-1.5 py-0.5 bg-black/50 border border-violet-500/30"
          }`}
        >
          <span
            className={`rounded-full animate-pulse ${
              expirySeconds <= 10 ? "w-2 h-2 bg-red-400" : expirySeconds <= 30 ? "w-1.5 h-1.5 bg-orange-400" : "w-1.5 h-1.5 bg-violet-400"
            }`}
          />
          <span
            className={`font-mono font-bold tabular-nums ${
              expirySeconds <= 10 ? "text-sm text-red-200" : expirySeconds <= 30 ? "text-[11px] text-orange-300" : "text-[9px] text-violet-300"
            }`}
          >
            {expiryLabel}
          </span>
        </div>
      )}
    </div>
  );
}
