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
  Legend
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

// Register core components and zoom plugin
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

export default function StrategyDashboard() {
  const [currencyPairs, setCurrencyPairs] = useState([]);
  const [selectedPairs, setSelectedPairs] = useState([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState([]);
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [logData, setLogData] = useState([]);
  const [logStats, setLogStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const chartRef = useRef(null);

  const frequencies = [
    "1m","3m","5m","15m","30m",
    "1h","2h","4h","6h","8h","12h",
    "1d","3d","1w","1M"
  ];

  useEffect(() => {
    // Fetch currency pairs
    fetch("https://api.binance.com/api/v3/exchangeInfo")
      .then(res => res.json())
      .then(data => {
        const syms = data.symbols
          .filter(s => s.status === "TRADING" && s.isSpotTradingAllowed)
          .map(s => `${s.baseAsset}/${s.quoteAsset}`);
        setCurrencyPairs(syms);
      });

    // Load history
    fetch("http://127.0.0.1:5000/backtest-history")
      .then(res => res.json())
      .then(setHistory)
      .catch(console.error);
  }, []);

  const toggleItem = (item, list, setList) =>
    setList(list.includes(item)
      ? list.filter(i => i !== item)
      : [...list, item]
    );

  async function runBacktest() {
    try {
      const res = await fetch("http://127.0.0.1:5000/run-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: selectedPairs,
          timeframes: selectedFrequencies
        })
      });
      const batch = await res.json();
      setResults(prev => [...prev, ...batch]);
      setSelectedLog(null);
    } catch {
      alert("Ensure the Python server is running.");
    }
  }

  async function loadTradeLog(file) {
    try {
      const res = await fetch(`http://127.0.0.1:5000/read-log/${file}`);
      const { trades, statistics } = await res.json();
      setLogData(trades);
      setLogStats({
        total: statistics.total_trades,
        wins: statistics.winning_trades,
        losses: statistics.total_trades - statistics.winning_trades,
        winRate: statistics.accuracy.toFixed(2)
      });
      setSelectedLog(file);
    } catch {}
  }

  function toggleLogView(file) {
    if (selectedLog === file) setSelectedLog(null);
    else loadTradeLog(file);
  }

  function renderChart() {
    if (!logData.length) return null;
    const labels = logData.map(r => r.timestamp);
    const entry  = logData.map(r => r.price);
    const exit   = logData.map(r => r.next_close);

    return (
      <>
        <Line
          ref={chartRef}
          data={{ labels, datasets: [
            { label: "Entry Price", data: entry, borderColor: "#3b82f6", fill: false },
            { label: "Exit Price",  data: exit,  borderColor: "#10b981", fill: false }
          ]}}
          options={{
            responsive: true,
            plugins: {
              legend: { position: "bottom" },
              title: { display: true, text: `Trade Log – ${selectedLog}` },
              tooltip: {
                callbacks: {
                  title: () => '',
                  label: function(context) {
                    const { dataset, raw } = context;
                    if (dataset.label === 'Buy' || dataset.label === 'Sell') {
                      const date = new Date(raw.x);
                      const type = dataset.label;
                      return `${type}: (${date.toLocaleString()}, ${raw.y.toFixed(2)})`;
                    }
                    return `${dataset.label}: ${context.parsed.y}`;
                  }
                }
              },
              zoom: {
                pan:  { enabled: true, mode: "x" },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" }
              }
            }
          }}
        />
        <button
          onClick={() => chartRef.current?.resetZoom()}
          style={{
            marginTop: 10,
            padding: "6px 12px",
            background: "#64748b",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Reset Zoom
        </button>
      </>
    );
  }

  return (
    <div style={{ display: "flex", gap: 40, padding: 20, background: "#1e293b", minHeight: "100vh", color: "#f8fafc" }}>
      {/* Left Panel */}
      <div style={{ flex: 1, paddingRight: 20 }}>
        <h2>🧪 Configure Backtest</h2>
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
                  type="checkbox"
                  checked={selectedPairs.includes(p)}
                  onChange={() => toggleItem(p, selectedPairs, setSelectedPairs)}
                  style={{ marginRight: 10 }}
                />
                {p}
              </label>
            ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <h4>🧠 Strategy</h4>
          <p style={{ color: "#38bdf8", fontWeight: "bold" }}>Momentum + Trend Strategy</p>
          <p style={{ fontSize: 14, color: "#94a3b8" }}>Combines: MACD Platinum, QQE Advanced, QMP Filter</p>
        </div>
        <div style={{ marginTop: 20 }}>
          <h4>🕒 Time Frames</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {frequencies.map(f => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', marginRight: 0, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedFrequencies.includes(f)}
                  onChange={() => toggleItem(f, selectedFrequencies, setSelectedFrequencies)}
                  style={{ marginRight: 5 }}
                />
                {f}
              </label>
            ))}
          </div>
        </div>
        <button
          onClick={runBacktest}
          style={{
            marginTop: 20,
            background: "#3b82f6",
            color: "#fff",
            padding: "10px 20px",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          ▶ Run Backtest
        </button>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1 }}>
        <h2>📊 Results</h2>
        {results.length === 0 ? (
          <p style={{ color: "#64748b" }}>No results yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {results.map((r, i) => (
              <li
                key={i}
                style={{
                  marginBottom: 12,
                  background: "#0f172a",
                  padding: 15,
                  borderRadius: 8,
                  borderLeft: "4px solid #38bdf8"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>
                      {r.symbol} [{r.timeframe}]{r.run_id ? ` – ${r.run_id}` : ""}
                    </strong>{" "}
                    {r["accuracy (%)"] != null ? (
                      <span style={{ color: "#22c55e" }}>Accuracy: {r["accuracy (%)"]}%</span>
                    ) : (
                      <span style={{ color: "red" }}>Error</span>
                    )}
                  </div>
                  {r.file && (
                    <button
                      onClick={() => toggleLogView(r.file)}
                      style={{
                        background: "#0ea5e9",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      View
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {selectedLog && logStats && (
          <div style={{ marginTop: 30 }}>
            <h3>📈 Trade Detail: {selectedLog}</h3>
            {renderChart()}
            <div style={{ marginTop: 15 }}>
              <p>Total Trades: {logStats.total}</p>
              <p>Wins: {logStats.wins}</p>
              <p>Losses: {logStats.losses}</p>
              <p>Win Rate: {logStats.winRate}%</p>
            </div>
          </div>
        )}

        <div style={{ marginTop: 40 }}>
          <h4 style={{ cursor: "pointer" }} onClick={() => setShowHistory(!showHistory)}>
            📂 Past Results {showHistory ? "▼" : "▶"}
          </h4>
          {showHistory && (
            <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 10 }}>
              {history.map((h, idx) => {
                const acc = ((h.metrics.winning_trades / h.metrics.total_trades) * 100).toFixed(2);
                return (
                  <div key={idx} style={{
                    background: "#0f172a",
                    padding: 12,
                    marginBottom: 10,
                    borderRadius: 6,
                    borderLeft: "3px solid #64748b"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{h.symbol} [{h.timeframe}] – {h.timestamp}</strong><br/>
                        Trades: {h.metrics.total_trades}, Wins: {h.metrics.winning_trades}, Accuracy: {acc}%
                      </div>
                      <button
                        onClick={() => toggleLogView(h.file)}
                        style={{
                          background: "#3b82f6",
                          color: "#fff",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: 4,
                          cursor: "pointer"
                        }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
