import ccxt
import pandas as pd
from datetime import datetime
import threading
import time
from typing import Dict, List
import json
import os
import csv

class LiveTrader:
    def __init__(self):
        self.exchange = ccxt.binance({
            "enableRateLimit": True,
            "options": {"adjustForTimeDifference": True}
        })
        self.positions: Dict[str, Dict] = {}  # symbol -> position info
        self.paper_balance = 1000  # Start with 1,000 USDT
        self.trade_history: List[Dict] = []
        self.active_symbols = set()
        self.data_streams = {}
        self.lock = threading.Lock()
        self.log_dir = "papertrade_trade_logs"
        os.makedirs(self.log_dir, exist_ok=True)

    def ta_rsi(self, series, period=14):
        delta = series.diff()
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = -delta.where(delta < 0, 0).rolling(period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))

    def apply_strategy(self, df):
        df["ema_fast"] = df["close"].ewm(span=12, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=26, adjust=False).mean()
        df["macd"] = df["ema_fast"] - df["ema_slow"]
        df["signal"] = df["macd"].ewm(span=9, adjust=False).mean()
        df["rsi"] = self.ta_rsi(df["close"], 14)

        df["signal_type"] = None
        df.loc[(df["macd"] > df["signal"]) & (df["rsi"] > 50), "signal_type"] = "buy"
        df.loc[(df["macd"] < df["signal"]) & (df["rsi"] < 50), "signal_type"] = "sell"
        return df

    def start_trading(self, symbol: str, timeframe: str = "1h"):
        if symbol in self.active_symbols:
            return {"error": f"Already trading {symbol}"}

        self.active_symbols.add(symbol)
        thread = threading.Thread(target=self._trading_loop, args=(symbol, timeframe))
        thread.daemon = True
        thread.start()
        return {"message": f"Started trading {symbol}"}

    def stop_trading(self, symbol: str):
        if symbol in self.active_symbols:
            self.active_symbols.remove(symbol)
            return {"message": f"Stopped trading {symbol}"}
        return {"error": f"Not trading {symbol}"}

    def log_trade(self, trade, symbol, timeframe):
        # Log each trade to a CSV file per symbol/timeframe
        fname = f"{symbol.replace('/', '')}_{timeframe}.csv"
        path = os.path.join(self.log_dir, fname)
        file_exists = os.path.isfile(path)
        with open(path, "a", newline="") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=list(trade.keys()))
            if not file_exists:
                writer.writeheader()
            writer.writerow(trade)

    def _trading_loop(self, symbol: str, timeframe: str):
        while symbol in self.active_symbols:
            try:
                candles = self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=100)
                df = pd.DataFrame(candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
                df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
                df = self.apply_strategy(df)

                latest = df.iloc[-1]
                prev = df.iloc[-2]

                trade_time = latest["timestamp"]
                if trade_time.tzinfo is None:
                    trade_time = trade_time.tz_localize('UTC')
                else:
                    trade_time = trade_time.tz_convert('UTC')

                with self.lock:
                    # Entry
                    if latest["signal_type"] == "buy" and symbol not in self.positions:
                        position_size_usdt = self.paper_balance * 0.1
                        entry_price = latest["close"]
                        quantity = position_size_usdt / entry_price
                        if quantity <= 0:
                            continue
                        self.positions[symbol] = {
                            "entry_price": entry_price,
                            "size_usdt": position_size_usdt,
                            "quantity": quantity,
                            "entry_time": trade_time.isoformat(),
                            "type": "long"
                        }
                        self.paper_balance -= position_size_usdt
                        trade = {
                            "symbol": symbol,
                            "type": "buy",
                            "price": entry_price,
                            "size": position_size_usdt,
                            "quantity": quantity,
                            "timestamp": trade_time.isoformat()
                        }
                        self.trade_history.append(trade)
                        self.log_trade(trade, symbol, timeframe)

                    # Exit
                    elif latest["signal_type"] == "sell" and symbol in self.positions:
                        position = self.positions[symbol]
                        exit_price = latest["close"]
                        quantity = position["quantity"]
                        pnl = (exit_price - position["entry_price"]) * quantity
                        self.paper_balance += position["size_usdt"] + pnl
                        trade = {
                            "symbol": symbol,
                            "type": "sell",
                            "price": exit_price,
                            "size": position["size_usdt"],
                            "quantity": quantity,
                            "pnl": pnl,
                            "timestamp": trade_time.isoformat()
                        }
                        self.trade_history.append(trade)
                        self.log_trade(trade, symbol, timeframe)
                        del self.positions[symbol]

            except Exception as e:
                print(f"Error in trading loop for {symbol}: {str(e)}")

            time.sleep(60)

    def get_status(self):
        with self.lock:
            return {
                "paper_balance": self.paper_balance,
                "positions": self.positions,
                "trade_history": self.trade_history[-50:],
                "active_symbols": list(self.active_symbols)
            }

# Create global instance
live_trader = LiveTrader() 