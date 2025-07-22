from backtester import backtest_with_log
df, summary = backtest_with_log("ETH/BTC", "1h")
print(summary)
