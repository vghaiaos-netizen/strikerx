import { useEffect, useRef } from "react";
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
  symbol: string;
  interval: "1m" | "5m" | "15m" | "30m" | "1h";
  currentPrice: number | null;
  entryPrice: number | null;
  chartMode: "candle" | "line";
  token?: string | null;
}

const INTERVAL_SECS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600 };

type LiveCandle = CandlestickData<UTCTimestamp>;

export function TradingChart({ symbol, interval, currentPrice, entryPrice, chartMode, token }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleRef       = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef         = useRef<ISeriesApi<"Line"> | null>(null);
  const liveCandleRef   = useRef<LiveCandle | null>(null);
  const entryLineRef    = useRef<IPriceLine | null>(null);
  const symbolRef       = useRef(symbol);
  const intervalRef     = useRef(interval);

  // Mount chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.38)",
        fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1a2332" },
        horzLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1a2332" },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: "rgba(255,255,255,0.32)",
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixRightEdge: true,
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "rgba(34,197,94,0.55)",
      wickDownColor: "rgba(239,68,68,0.55)",
    });

    const lineSeries = chart.addLineSeries({
      color: "#00ff88",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    candleSeries.applyOptions({ visible: true });
    lineSeries.applyOptions({ visible: false });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    lineRef.current   = lineSeries;

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
      liveCandleRef.current  = null;
      entryLineRef.current   = null;
    };
  }, []);

  // Toggle candle / line mode
  useEffect(() => {
    if (!candleRef.current || !lineRef.current) return;
    candleRef.current.applyOptions({ visible: chartMode === "candle" });
    lineRef.current.applyOptions({ visible: chartMode === "line" });
  }, [chartMode]);

  // Fetch klines when symbol or interval changes
  useEffect(() => {
    symbolRef.current   = symbol;
    intervalRef.current = interval;
    liveCandleRef.current = null;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let cancelled = false;
    fetch(
      `/api/trading/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=120`,
      { headers },
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number }> }>) : null))
      .then((data) => {
        if (cancelled || !data?.candles?.length) return;
        if (symbolRef.current !== symbol || intervalRef.current !== interval) return;

        const bars: CandlestickData<UTCTimestamp>[] = data.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        if (!candleRef.current || !lineRef.current) return;
        candleRef.current.setData(bars);
        lineRef.current.setData(bars.map((b): LineData<UTCTimestamp> => ({ time: b.time, value: b.close })));
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {
        // Binance geo-blocked on Replit dev — chart starts from live ticks only
      });

    return () => { cancelled = true; };
  }, [symbol, interval, token]);

  // Manage entry price line
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current); } catch { /* ignore */ }
      entryLineRef.current = null;
    }

    if (entryPrice !== null && entryPrice > 0) {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: "#a78bfa",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Entry",
      });
    }
  }, [entryPrice]);

  // Real-time candle update on each price tick
  useEffect(() => {
    if (currentPrice === null || currentPrice <= 0) return;

    const secs = INTERVAL_SECS[interval] ?? 60;
    const bucket = (Math.floor(Date.now() / 1000 / secs) * secs) as UTCTimestamp;

    const live = liveCandleRef.current;
    let updated: LiveCandle;

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
    } catch {
      // lightweight-charts throws if time is before the last bar — ignore
    }
  }, [currentPrice, interval]);

  return <div ref={containerRef} className="w-full h-full" />;
}
