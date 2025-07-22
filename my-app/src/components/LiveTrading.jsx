import { useState, useEffect, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin,
  TimeScale
);

export default function LiveTrading() {
  const [currencyPairs, setCurrencyPairs] = useState([]);
  const [selectedPair, setSelectedPair] = useState("");
  const [timeframe, setTimeframe] = useState("1h");
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [ohlcv, setOhlcv] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const chartRef = useRef(null);
  const [logFiles, setLogFiles] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedLiveLog, setSelectedLiveLog] = useState(null);
  const [liveLogTrades, setLiveLogTrades] = useState([]);
  const [liveLogStats, setLiveLogStats] = useState(null);

  const timeframes = [
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M"
  ];

  // Fetch pairs on mount
  useEffect(() => {
    fetch("https://api.binance.com/api/v3/exchangeInfo")
      .then(res => res.json())
      .then(data => {
        const syms = data.symbols
          .filter(s => s.status === "TRADING" && s.isSpotTradingAllowed)
          .map(s => `${s.baseAsset}/${s.quoteAsset}`);
        setCurrencyPairs(syms);
      });
  }, []);

  // Poll status and OHLCV every minute
  useEffect(() => {
    if (!selectedPair) return;
    fetchOhlcv();
    fetchStatus();
    const interval = setInterval(() => {
      fetchOhlcv();
      fetchStatus();
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [selectedPair, timeframe]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/live/status");
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Error fetching status:", e);
    }
  };

  const fetchOhlcv = async () => {
    if (!selectedPair) return;
    const binanceSymbol = selectedPair.replace("/", "");
    try {
      const limit = liveMode ? 2 : 100;
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${timeframe}&limit=${limit}`);
      const data = await res.json();
      const newCandles = data.map(candle => ({
        time: new Date(candle[0]),
        close: parseFloat(candle[4])
      }));
      setOhlcv(prev => {
        if (!liveMode) {
          setInitialized(true);
          return newCandles; // Always replace in non-live mode
        }
        if (!initialized || prev.length === 0) {
          setInitialized(true);
          return newCandles;
        }
        // Only add new candles in live mode
        const lastTime = prev[prev.length - 1].time.getTime();
        const filtered = newCandles.filter(c => c.time.getTime() > lastTime);
        return [...prev, ...filtered];
      });
    } catch (e) {
      setOhlcv([]);
      setInitialized(false);
    }
  };

  // Reset ohlcv, initialized, and liveMode when pair or timeframe changes
  useEffect(() => {
    setOhlcv([]);
    setInitialized(false);
    setLiveMode(false);
  }, [selectedPair, timeframe]);

  const startTrading = async () => {
    try {
      setError("");
      const res = await fetch("http://127.0.0.1:5000/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedPair, timeframe })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        // Do NOT reset chart if already trading
      } else {
        // Switch to live mode, keep current candles, start accumulating
        setLiveMode(true);
      }
    } catch (e) {
      setError("Failed to start trading. Ensure the server is running.");
    }
  };

  const stopTrading = async () => {
    try {
      setError("");
      const res = await fetch("http://127.0.0.1:5000/live/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedPair })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to stop trading. Ensure the server is running.");
    }
  };

  // Find the closest candle time for each trade
  const candleTimes = ohlcv.map(c => c.time);

  const tradeMarkers = (status?.trade_history || [])
    .filter(trade => trade.symbol === selectedPair)
    .map(trade => {
      // Find the candle that matches the trade price (within a small tolerance)
      const match = ohlcv.find(
        c => Math.abs(c.close - trade.price) < 1e-6 // adjust tolerance as needed
      );
      return {
        x: match ? match.time : new Date(trade.timestamp),
        y: match ? match.close : trade.price,
        type: trade.type
      };
    });

  // Chart.js line chart dataset
  const labels = ohlcv.map(c => c.time);
  const closePrices = ohlcv.map(c => c.close);
  const buyMarkers = tradeMarkers.filter(t => t.type === 'buy');
  const sellMarkers = tradeMarkers.filter(t => t.type === 'sell');

  const chartData = {
    labels,
    datasets: [
      {
        label: `${selectedPair} Close Price`,
        data: closePrices,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        pointRadius: 0,
        fill: false,
        tension: 0.1
      },
      {
        type: 'scatter',
        label: 'Buy',
        data: buyMarkers,
        pointBackgroundColor: '#22c55e',
        pointBorderColor: '#22c55e',
        pointRadius: 6,
        showLine: false
      },
      {
        type: 'scatter',
        label: 'Sell',
        data: sellMarkers,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#ef4444',
        pointRadius: 6,
        showLine: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: selectedPair ? `${selectedPair} Live Chart` : 'Live Chart' },
      tooltip: {
        callbacks: {
          // Remove the default title (the bold part)
          title: () => '',
          // Customize the label for Buy/Sell dots
          label: function(context) {
            const { dataset, raw } = context;
            if (dataset.label === 'Buy' || dataset.label === 'Sell') {
              const date = new Date(raw.x);
              const type = dataset.label;
              return `${type}: (${date.toLocaleString()}, ${raw.y.toFixed(2)})`;
            }
            // For the line, show default
            return `${dataset.label}: ${context.parsed.y}`;
          }
        }
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'minute', tooltipFormat: 'yyyy-MM-dd HH:mm' },
        grid: { color: '#334155' },
        ticks: { color: '#f8fafc' }
      },
      y: {
        grid: { color: '#334155' },
        ticks: { color: '#f8fafc' }
      }
    }
  };

  // Fetch log files list from backend
  useEffect(() => {
    fetch("http://127.0.0.1:5000/live-logs")
      .then(res => res.json())
      .then(setLogFiles)
      .catch(() => setLogFiles([]));
  }, []);

  async function loadLiveLog(file) {
    try {
      const res = await fetch(`http://127.0.0.1:5000/read-live-log/${file}`);
      const { trades, statistics } = await res.json();
      setLiveLogTrades(trades);
      setLiveLogStats(statistics);
      setSelectedLiveLog(file);
    } catch {
      setLiveLogTrades([]);
      setLiveLogStats(null);
      setSelectedLiveLog(file);
    }
  }

  // --- Layout ---
  return (
    <div style={{ display: "flex", gap: 40, padding: 20, background: "#1e293b", minHeight: "100vh", color: "#f8fafc" }}>
      {/* Left Panel */}
      <div style={{ flex: 1, paddingRight: 20 }}>
        <h2>🟢 Live Paper Trading</h2>
        <h4>💱 Currency Pairs</h4>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            marginBottom: 10,
            borderRadius: 4,
            border: "1px solid #475569",
            background: "#0f172a",
            color: "#f8fafc"
          }}
        />
        <div style={{ maxHeight: 250, overflowY: "auto", border: "1px solid #475569", padding: 10 }}>
          {currencyPairs
            .filter(p => p.toLowerCase().includes(search.toLowerCase()))
            .map(p => (
              <label key={p} style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="radio"
                  name="pair"
                  checked={selectedPair === p}
                  onChange={() => setSelectedPair(p)}
                  style={{ marginRight: 10 }}
                />
                {p}
              </label>
            ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <h4>🕒 Time Frames</h4>
          {timeframes.map(tf => (
            <label key={tf} style={{ marginRight: 10 }}>
              <input
                type="radio"
                name="timeframe"
                checked={timeframe === tf}
                onChange={() => setTimeframe(tf)}
                style={{ marginRight: 5 }}
              />
              {tf}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <button
            onClick={startTrading}
            disabled={!selectedPair}
            style={{
              background: "#22c55e",
              color: "#fff",
              padding: "10px 20px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              marginRight: 10,
              opacity: !selectedPair ? 0.5 : 1
            }}
          >
            ▶ Start Trading
          </button>
          <button
            onClick={stopTrading}
            disabled={!selectedPair}
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "10px 20px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              opacity: !selectedPair ? 0.5 : 1
            }}
          >
            ■ Stop Trading
          </button>
        </div>
        {error && (
          <div style={{ color: "#ef4444", marginTop: 20 }}>{error}</div>
        )}
        <div style={{ marginTop: 30 }}>
          <h4>💰 Paper Balance</h4>
          <div style={{ fontSize: 24, color: "#22c55e" }}>
            {status?.paper_balance?.toFixed(2) ?? "-"} USDT
          </div>
        </div>
        <div style={{ marginTop: 30 }}>
          <h4>📂 Open Positions</h4>
          {status?.positions && Object.keys(status.positions).length > 0 ? (
            Object.entries(status.positions).map(([symbol, pos]) => (
              <div key={symbol} style={{ background: "#1e293b", padding: 12, marginBottom: 10, borderRadius: 6, borderLeft: "4px solid #3b82f6" }}>
                <div><strong>{symbol}</strong></div>
                <div style={{ fontSize: 14, color: "#64748b" }}>Entry: {pos.entry_price !== undefined ? pos.entry_price.toFixed(8) : '-'}</div>
                <div>Size: {pos.size_usdt !== undefined ? pos.size_usdt.toFixed(2) : '-'} USDT</div>
                <div>Type: {pos.type}</div>
                <div>Quantity: {pos.quantity !== undefined ? pos.quantity.toFixed(6) : '-'}</div>
              </div>
            ))
          ) : (
            <div style={{ color: "#64748b" }}>No open positions</div>
          )}
        </div>
      </div>
      {/* Right Panel */}
      <div style={{ flex: 1 }}>
        <h2>📊 Live Chart & Trades</h2>
        <div style={{ background: "#0f172a", padding: 20, borderRadius: 8, minHeight: 400, height: 400, marginBottom: 20 }}>
          {ohlcv.length > 0 ? (
            <Line
              ref={chartRef}
              data={chartData}
              options={chartOptions}
              height={350}
            />
          ) : (
            <div style={{ color: "#64748b" }}>No chart data yet.</div>
          )}
        </div>
        <div style={{ marginTop: 30 }}>
          <h3>Recent Trades</h3>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {status?.trade_history?.filter(trade => trade.symbol === selectedPair).length > 0 ? (
              status.trade_history.filter(trade => trade.symbol === selectedPair).map((trade, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: trade.type === "buy" ? "#1e293b" : "#0f172a",
                    borderRadius: 4,
                    borderLeft: `4px solid ${trade.type === "buy" ? "#22c55e" : "#ef4444"}`
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <strong>{trade.symbol}</strong> - {trade.type.toUpperCase()}
                    </div>
                    <div>
                      Price: {trade.price !== undefined ? trade.price.toFixed(8) : '-'}
                      {trade.pnl !== undefined && (
                        <span style={{ marginLeft: 10, color: trade.pnl > 0 ? "#22c55e" : "#ef4444" }}>
                          PnL: {trade.pnl.toFixed(2)} USDT
                        </span>
                      )}
                    </div>
                  </div>
                  <div>Quantity: {trade.quantity !== undefined ? trade.quantity.toFixed(6) : '-'}</div>
                </div>
              ))
            ) : (
              <div style={{ color: "#64748b" }}>No trades yet.</div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 40 }}>
          <h4 style={{ cursor: 'pointer' }} onClick={() => setShowLogs(!showLogs)}>
            📂 Past Live Papertrade Logs {showLogs ? '▼' : '▶'}
          </h4>
          {showLogs && (
            <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
              {logFiles.length === 0 ? (
                <div style={{ color: '#64748b' }}>No logs yet.</div>
              ) : (
                logFiles.map((file, idx) => (
                  <div key={idx} style={{ background: '#0f172a', padding: 12, marginBottom: 10, borderRadius: 6, borderLeft: '3px solid #64748b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{file}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => selectedLiveLog === file ? setSelectedLiveLog(null) : loadLiveLog(file)}
                          style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}
                        >
                          {selectedLiveLog === file ? 'Hide' : 'View'}
                        </button>
                        <a
                          href={`http://127.0.0.1:5000/live-log/${file}`}
                          download={file}
                          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', textDecoration: 'none' }}
                        >
                          Download
                        </a>
                      </div>
                    </div>
                    {selectedLiveLog === file && liveLogStats && (
                      <div style={{ marginTop: 12, background: '#1e293b', borderRadius: 6, padding: 12 }}>
                        <div style={{ marginBottom: 8 }}>
                          <strong>Stats:</strong> Total Trades: {liveLogStats.total_trades}, Wins: {liveLogStats.wins}, Losses: {liveLogStats.losses}, Win Rate: {liveLogStats.winRate}%
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 13 }}>
                          {liveLogTrades.length === 0 ? (
                            <div style={{ color: '#64748b' }}>No trades in log.</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ color: '#38bdf8', textAlign: 'left' }}>
                                  <th style={{ padding: '2px 6px' }}>Type</th>
                                  <th style={{ padding: '2px 6px' }}>Time</th>
                                  <th style={{ padding: '2px 6px' }}>Price</th>
                                  <th style={{ padding: '2px 6px' }}>Quantity</th>
                                  <th style={{ padding: '2px 6px' }}>PnL</th>
                                </tr>
                              </thead>
                              <tbody>
                                {liveLogTrades.map((t, i) => (
                                  <tr key={i} style={{ color: t.type === 'buy' ? '#22c55e' : t.type === 'sell' ? '#ef4444' : '#f8fafc' }}>
                                    <td style={{ padding: '2px 6px' }}>{t.type}</td>
                                    <td style={{ padding: '2px 6px' }}>{t.timestamp ? new Date(t.timestamp).toLocaleString() : '-'}</td>
                                    <td style={{ padding: '2px 6px' }}>{t.price !== undefined ? t.price.toFixed(2) : '-'}</td>
                                    <td style={{ padding: '2px 6px' }}>{t.quantity !== undefined ? t.quantity.toFixed(6) : '-'}</td>
                                    <td style={{ padding: '2px 6px' }}>{t.pnl !== undefined ? t.pnl.toFixed(2) : '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 