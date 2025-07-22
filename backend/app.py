import os
from datetime import datetime
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from backtester import backtest_with_log, parallel_backtest
from live_trader import live_trader

app = Flask(__name__)
CORS(app)

@app.route("/run-backtest", methods=["POST"])
def run_backtest():
    data = request.get_json()
    symbols    = data.get("symbols", [])
    timeframes = data.get("timeframes", [])
    os.makedirs("trade_logs", exist_ok=True)

    results = parallel_backtest(symbols, timeframes)
    out = []
    for df, summary in results:
        if not df.empty:
            ts    = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            fname = f"{ts}_{summary['symbol'].replace('/','')}_{summary['timeframe']}.csv"
            path  = os.path.join("trade_logs", fname)
            df.to_csv(path, index=False)
            summary["file"]   = fname
            summary["run_id"] = ts
        else:
            summary["file"]   = None
            summary["run_id"] = None
        out.append(summary)
    return jsonify(out)

@app.route("/backtest-history", methods=["GET"])
def backtest_history():
    files = []
    for f in os.listdir("trade_logs"):
        if not f.endswith(".csv"):
            continue
        parts = f[:-4].split("_")
        ts, sym, tf = parts[0]+"_"+parts[1], parts[2], parts[3]
        df = pd.read_csv(os.path.join("trade_logs", f))
        metrics = {
            "total_trades":    len(df),
            "winning_trades":  len(df[df["success"]]),
            "avg_profit_loss": round((df["next_close"]-df["price"]).mean(),2)
        }
        files.append({
            "file":      f,
            "timestamp": ts,
            "symbol":    sym,
            "timeframe": tf,
            "metrics":   metrics
        })
    files.sort(key=lambda x: x["timestamp"], reverse=True)
    return jsonify(files)

@app.route("/read-log/<filename>", methods=["GET"])
def read_log(filename):
    path = os.path.join("trade_logs", filename)
    if not os.path.exists(path):
        return jsonify({"error":"File not found"}), 404
    df = pd.read_csv(path, on_bad_lines='skip')
    stats = {
        "total_trades":   len(df),
        "winning_trades": len(df[df["success"]]),
        "accuracy":       round(100 * df["success"].mean(),2)
    }
    return jsonify({
        "trades":     df.to_dict("records"),
        "statistics": stats
    })

@app.route("/live/start", methods=["POST"])
def start_live_trading():
    data = request.get_json()
    symbol = data.get("symbol")
    timeframe = data.get("timeframe", "1h")
    
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400
        
    result = live_trader.start_trading(symbol, timeframe)
    return jsonify(result)

@app.route("/live/stop", methods=["POST"])
def stop_live_trading():
    data = request.get_json()
    symbol = data.get("symbol")
    
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400
        
    result = live_trader.stop_trading(symbol)
    return jsonify(result)

@app.route("/live/status", methods=["GET"])
def get_live_status():
    return jsonify(live_trader.get_status())

@app.route("/live-logs", methods=["GET"])
def list_live_logs():
    log_dir = "papertrade_trade_logs"
    if not os.path.exists(log_dir):
        return []
    files = [f for f in os.listdir(log_dir) if f.endswith('.csv')]
    files.sort(reverse=True)
    return jsonify(files)

@app.route("/live-log/<filename>", methods=["GET"])
def download_live_log(filename):
    log_dir = "papertrade_trade_logs"
    if not os.path.exists(os.path.join(log_dir, filename)):
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(log_dir, filename, as_attachment=True)

@app.route("/read-live-log/<filename>", methods=["GET"])
def read_live_log(filename):
    log_dir = "papertrade_trade_logs"
    path = os.path.join(log_dir, filename)
    if not os.path.exists(path):
        return jsonify({"error": "File not found"}), 404
    df = pd.read_csv(path, on_bad_lines='skip')
    # For live logs, there may not be a 'success' column, so count wins by type if possible
    total_trades = len(df)
    wins = len(df[df['type'] == 'sell']) if 'type' in df.columns else 0
    losses = total_trades - wins
    win_rate = round(100 * wins / total_trades, 2) if total_trades > 0 else 0
    stats = {
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "winRate": win_rate
    }
    return jsonify({
        "trades": df.to_dict("records"),
        "statistics": stats
    })

if __name__ == "__main__":
    app.run(debug=True)
