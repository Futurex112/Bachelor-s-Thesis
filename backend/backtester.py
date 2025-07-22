import ccxt
import pandas as pd
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Use anonymous public client for OHLCV
exchange = ccxt.binance({
    "enableRateLimit": True,
    "options": { "adjustForTimeDifference": True }
})

def ta_rsi(series, period=14):
    delta = series.diff()
    gain  = delta.where(delta > 0, 0).rolling(period).mean()
    loss  = -delta.where(delta < 0, 0).rolling(period).mean()
    rs    = gain / loss
    return 100 - (100 / (1 + rs))

def apply_strategy(df):
    df["ema_fast"] = df["close"].ewm(span=12, adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]     = df["ema_fast"] - df["ema_slow"]
    df["signal"]   = df["macd"].ewm(span=9, adjust=False).mean()
    df["rsi"]      = ta_rsi(df["close"], 14)

    df["signal_type"] = None
    df.loc[(df["macd"] > df["signal"]) & (df["rsi"] > 50), "signal_type"] = "buy"
    df.loc[(df["macd"] < df["signal"]) & (df["rsi"] < 50), "signal_type"] = "sell"
    return df

def backtest_with_log(symbol, timeframe="1h", limit=300):
    try:
        candles = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        df = pd.DataFrame(candles, columns=["timestamp","open","high","low","close","volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df = apply_strategy(df)

        trades = []
        for i in range(len(df)-1):
            row, nxt = df.iloc[i], df.iloc[i+1]
            if row["signal_type"] == "buy":
                success = nxt["close"] > row["close"]
                trades.append({
                    "symbol":     symbol,
                    "timeframe":  timeframe,
                    "timestamp":  row["timestamp"],
                    "price":      row["close"],
                    "next_close": nxt["close"],
                    "success":    success
                })

        trade_df = pd.DataFrame(trades)
        win_rate = trade_df["success"].mean() * 100 if not trade_df.empty else 0
        summary  = {
            "symbol":      symbol,
            "timeframe":   timeframe,
            "signals":     len(trade_df),
            "accuracy (%)": round(win_rate, 2)
        }
        return trade_df, summary

    except Exception as e:
        return pd.DataFrame(), {
            "symbol":    symbol,
            "timeframe": timeframe,
            "error":     str(e)
        }

def parallel_backtest(symbols, timeframes, limit=300):
    tasks, results = [], []
    with ThreadPoolExecutor() as executor:
        for s in symbols:
            for tf in timeframes:
                tasks.append(executor.submit(backtest_with_log, s, tf, limit))
        for fut in as_completed(tasks):
            results.append(fut.result())
    return results
