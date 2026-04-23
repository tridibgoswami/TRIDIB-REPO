"""
APScheduler jobs (all times IST):
  09:00 → Login AngelOne + reset daily state + Telegram "Bot Started"
  Every 5 min → check daily P&L / loss limit
  Every 30 s  → poll order fills
  15:15 → auto square-off all positions
  15:30 → logout + send day P&L summary
"""

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

from config import config
from angelone_client import angelone
from telegram_notifier import notifier
from trade_manager import trade_manager

IST = pytz.timezone("Asia/Kolkata")


# ── Jobs ──────────────────────────────────────────────────────────────────────

def job_morning_start():
    logger.info("=== MORNING START ===")
    trade_manager.reset_daily_state()

    if not angelone.login():
        notifier.error_alert("AngelOne login FAILED at market open. Bot inactive — fix credentials and /resume.")
        return

    notifier.bot_started()
    logger.info("Ready to trade. Webhook server already running.")


def job_check_pnl():
    if not angelone._logged_in:
        return
    try:
        trade_manager.check_daily_loss()
    except Exception as e:
        logger.error(f"P&L check error: {e}")


def job_poll_fills():
    """Update fill prices for tracked orders."""
    if not angelone._logged_in:
        return
    try:
        orders = angelone.get_order_book()
        for order in orders:
            oid = order.get("orderid")
            if order.get("status", "").upper() == "COMPLETE" and oid in trade_manager._open_positions:
                fill_price = float(order.get("averageprice", 0))
                trade_manager.update_fill(oid, fill_price)
    except Exception as e:
        logger.error(f"Fill poll error: {e}")


def job_square_off():
    logger.info("=== AUTO SQUARE-OFF ===")
    if not angelone._logged_in:
        return
    try:
        trade_manager.square_off_all()
    except Exception as e:
        logger.error(f"Square-off error: {e}")
        notifier.error_alert(f"Auto square-off failed: {e}")


def job_eod_stop():
    logger.info("=== EOD STOP ===")
    pnl = trade_manager._daily_pnl
    notifier.bot_stopped(pnl)
    angelone.logout()
    logger.info("Session complete.")


# ── Build ─────────────────────────────────────────────────────────────────────

def build_scheduler() -> BackgroundScheduler:
    sq_h, sq_m = config.SQUARE_OFF_TIME.split(":")

    sched = BackgroundScheduler(timezone=IST)

    sched.add_job(job_morning_start, CronTrigger(hour=9, minute=0, timezone=IST),
                  id="morning_start", replace_existing=True)

    sched.add_job(job_check_pnl, "interval", minutes=5,
                  id="pnl_check", replace_existing=True)

    sched.add_job(job_poll_fills, "interval", seconds=30,
                  id="fill_poll", replace_existing=True)

    sched.add_job(job_square_off, CronTrigger(hour=int(sq_h), minute=int(sq_m), timezone=IST),
                  id="square_off", replace_existing=True)

    sched.add_job(job_eod_stop, CronTrigger(hour=15, minute=30, timezone=IST),
                  id="eod_stop", replace_existing=True)

    return sched
