"""
Orchestrates trade execution: risk checks → symbol lookup → order placement → tracking.
"""

import threading
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional
import pytz
from loguru import logger

from config import config
from angelone_client import angelone
from telegram_notifier import notifier
from signal_processor import Signal

IST = pytz.timezone("Asia/Kolkata")


@dataclass
class OpenPosition:
    order_id: str
    signal: Signal
    symbol_token: str
    fill_price: float = 0.0
    filled: bool = False


class TradeManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._open_positions: dict[str, OpenPosition] = {}  # order_id → position
        self._halted: bool = False  # True when daily loss limit hit
        self._daily_pnl: float = 0.0

    # ── State Queries ─────────────────────────────────────────────────────────

    @property
    def is_halted(self) -> bool:
        return self._halted

    @property
    def open_position_count(self) -> int:
        return len(self._open_positions)

    # ── Market Hours Guard ────────────────────────────────────────────────────

    def _is_market_open(self) -> bool:
        now = datetime.now(IST).time()
        open_h, open_m = map(int, config.MARKET_OPEN.split(":"))
        close_h, close_m = map(int, config.MARKET_CLOSE.split(":"))
        sq_h, sq_m = map(int, config.SQUARE_OFF_TIME.split(":"))
        from datetime import time as dtime
        return dtime(open_h, open_m) <= now <= dtime(sq_h, sq_m)

    # ── Core Trade Flow ───────────────────────────────────────────────────────

    def process_signal(self, signal: Signal) -> Optional[str]:
        """
        Full pipeline: validate risk → lookup symbol → place order.
        Returns order_id on success, None on any failure.
        """
        with self._lock:
            # 1. Risk gates
            if self._halted:
                reason = "Bot halted due to daily loss limit"
                logger.warning(reason)
                notifier.order_rejected(signal.__dict__, reason)
                return None

            if not self._is_market_open():
                reason = "Outside trading hours"
                logger.warning(reason)
                notifier.order_rejected(signal.__dict__, reason)
                return None

            if self.open_position_count >= config.MAX_OPEN_POSITIONS:
                reason = f"Max open positions ({config.MAX_OPEN_POSITIONS}) reached"
                logger.warning(reason)
                notifier.order_rejected(signal.__dict__, reason)
                return None

            # 2. Notify signal received
            notifier.signal_received(signal.__dict__)

            # 3. Resolve symbol token
            scrip = angelone.search_scrip("NFO", signal.trading_symbol)
            if not scrip:
                reason = f"Symbol not found on AngelOne: {signal.trading_symbol}"
                logger.error(reason)
                notifier.order_rejected(signal.__dict__, reason)
                return None

            symbol_token = scrip["symboltoken"]

            # 4. Place order
            try:
                resp = angelone.place_order(
                    symbol_token=symbol_token,
                    trading_symbol=signal.trading_symbol,
                    action=signal.action,
                    quantity=signal.quantity,
                    order_type=signal.order_type,
                    price=signal.price,
                    product_type=signal.product_type,
                    exchange=signal.exchange,
                )
            except Exception as e:
                logger.error(f"Order placement exception: {e}")
                notifier.order_rejected(signal.__dict__, str(e))
                notifier.error_alert(str(e))
                return None

            if not resp or not resp.get("status"):
                reason = resp.get("message", "Unknown AngelOne error") if resp else "No response"
                logger.error(f"Order rejected by broker: {reason}")
                notifier.order_rejected(signal.__dict__, reason)
                return None

            order_id = resp["data"]["orderid"]
            logger.info(f"Order placed successfully: {order_id}")

            order_details = {
                "price": signal.price or "MARKET",
                "quantity": signal.quantity,
                "ordertype": signal.order_type,
            }
            notifier.order_placed(order_id, signal.__dict__, order_details)

            # 5. Track position
            self._open_positions[order_id] = OpenPosition(
                order_id=order_id,
                signal=signal,
                symbol_token=symbol_token,
            )

            return order_id

    def update_fill(self, order_id: str, fill_price: float):
        """Call this when polling confirms an order is filled."""
        with self._lock:
            pos = self._open_positions.get(order_id)
            if pos:
                pos.fill_price = fill_price
                pos.filled = True
                notifier.order_filled(order_id, fill_price, pos.signal.quantity)

    def close_position(self, order_id: str):
        """Remove a position from tracking (after square-off)."""
        with self._lock:
            self._open_positions.pop(order_id, None)

    # ── Risk Monitoring ───────────────────────────────────────────────────────

    def check_daily_loss(self):
        """Fetch live P&L and halt bot if daily loss limit breached."""
        pnl = angelone.get_day_pnl()
        self._daily_pnl = pnl
        if pnl <= -abs(config.MAX_DAILY_LOSS):
            if not self._halted:
                self._halted = True
                logger.warning(f"Daily loss limit hit: ₹{pnl:.2f}. Bot halted.")
                notifier.daily_loss_halt(pnl)

    # ── End-of-Day Square Off ─────────────────────────────────────────────────

    def square_off_all(self):
        """Auto square-off all open positions at EOD."""
        with self._lock:
            open_pos = list(self._open_positions.values())

        if not open_pos:
            logger.info("Square-off triggered but no open positions.")
            return

        notifier.square_off_alert(open_pos)
        order_ids = angelone.square_off_all_positions()
        logger.info(f"Square-off orders placed: {order_ids}")

        # Clear our tracking
        with self._lock:
            self._open_positions.clear()

    def reset_daily_state(self):
        """Reset state for a new trading day."""
        with self._lock:
            self._halted = False
            self._daily_pnl = 0.0
            self._open_positions.clear()
        logger.info("Daily state reset")


trade_manager = TradeManager()
