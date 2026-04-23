"""
Entry point.

Usage:
    python main.py

The bot auto-starts at 09:00 IST and stops at 15:30 IST every weekday.
Run this script once (e.g. via systemd or screen) and leave it running.
"""

import signal
import sys
import time
from loguru import logger
from scheduler import build_scheduler

# ── Logging setup ─────────────────────────────────────────────────────────────
logger.remove()
logger.add(sys.stdout, level="INFO",
           format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")
logger.add("logs/bot.log", rotation="1 day", retention="30 days", level="DEBUG",
           format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}")


def main():
    logger.info("Starting TradingView → AngelOne Bot")
    scheduler = build_scheduler()
    scheduler.start()
    logger.info("Scheduler running. Waiting for 09:00 IST to start trading session...")

    def _shutdown(sig, frame):
        logger.info("Shutdown signal received")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Keep the process alive
    while True:
        time.sleep(60)


if __name__ == "__main__":
    import os
    os.makedirs("logs", exist_ok=True)
    main()
