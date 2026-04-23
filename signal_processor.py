"""
Validates and normalises incoming TradingView webhook payloads.

Expected TradingView alert JSON format (set this in the alert message box):
{
  "secret":       "{{strategy.order.comment}}",   ← or hard-code your secret
  "symbol":       "NIFTY",
  "action":       "BUY",
  "instrument":   "FUT",          ← FUT | CE | PE
  "expiry":       "25APR2024",    ← only for options/futures
  "strike":       0,              ← 0 for futures; e.g. 22000 for options
  "price":        0,              ← 0 = MARKET order
  "quantity":     25,             ← lots
  "product_type": "INTRADAY",
  "order_type":   "MARKET"
}
"""

from dataclasses import dataclass, field
from loguru import logger
from config import config


VALID_ACTIONS = {"BUY", "SELL"}
VALID_INSTRUMENTS = {"FUT", "CE", "PE"}
VALID_ORDER_TYPES = {"MARKET", "LIMIT", "SL", "SL-M"}
VALID_PRODUCT_TYPES = {"INTRADAY", "DELIVERY", "CARRYFORWARD"}
VALID_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"}

# AngelOne exchange for F&O
NFO_EXCHANGE = "NFO"


@dataclass
class Signal:
    symbol: str
    action: str               # BUY | SELL
    instrument: str           # FUT | CE | PE
    expiry: str               # e.g. "25APR2024"
    strike: int               # 0 for futures
    price: float
    quantity: int
    product_type: str
    order_type: str
    exchange: str = NFO_EXCHANGE
    trading_symbol: str = field(default="", init=False)

    def __post_init__(self):
        self.trading_symbol = self._build_trading_symbol()

    def _build_trading_symbol(self) -> str:
        """Construct AngelOne trading symbol from signal components."""
        sym = self.symbol.upper()
        exp = self.expiry.upper()
        if self.instrument == "FUT":
            return f"{sym}{exp}FUT"
        # Options: NIFTY25APR2400022000CE
        strike_str = str(int(self.strike)).zfill(5)
        return f"{sym}{exp}{strike_str}{self.instrument}"


class SignalProcessor:
    def validate_secret(self, payload: dict) -> bool:
        return payload.get("secret") == config.WEBHOOK_SECRET

    def parse(self, payload: dict) -> Signal | None:
        """Parse and validate a raw webhook payload into a Signal object."""
        try:
            symbol = str(payload.get("symbol", "")).upper().strip()
            action = str(payload.get("action", "")).upper().strip()
            instrument = str(payload.get("instrument", "FUT")).upper().strip()
            expiry = str(payload.get("expiry", "")).upper().strip()
            strike = int(payload.get("strike", 0))
            price = float(payload.get("price", 0))
            quantity = int(payload.get("quantity", config.DEFAULT_QUANTITY))
            product_type = str(payload.get("product_type", "INTRADAY")).upper().strip()
            order_type = str(payload.get("order_type", "MARKET")).upper().strip()

            errors = []
            if symbol not in VALID_SYMBOLS:
                errors.append(f"Invalid symbol '{symbol}'. Allowed: {VALID_SYMBOLS}")
            if action not in VALID_ACTIONS:
                errors.append(f"Invalid action '{action}'. Allowed: {VALID_ACTIONS}")
            if instrument not in VALID_INSTRUMENTS:
                errors.append(f"Invalid instrument '{instrument}'. Allowed: {VALID_INSTRUMENTS}")
            if not expiry:
                errors.append("Missing 'expiry' field (e.g. '25APR2024')")
            if instrument in {"CE", "PE"} and strike == 0:
                errors.append("Strike price required for options")
            if order_type not in VALID_ORDER_TYPES:
                errors.append(f"Invalid order_type '{order_type}'")
            if product_type not in VALID_PRODUCT_TYPES:
                errors.append(f"Invalid product_type '{product_type}'")
            if quantity <= 0:
                errors.append("Quantity must be positive")

            if errors:
                logger.warning(f"Signal validation errors: {errors}")
                return None

            sig = Signal(
                symbol=symbol,
                action=action,
                instrument=instrument,
                expiry=expiry,
                strike=strike,
                price=price,
                quantity=quantity,
                product_type=product_type,
                order_type=order_type,
            )
            logger.info(f"Signal parsed: {sig}")
            return sig

        except Exception as e:
            logger.error(f"Signal parse error: {e}")
            return None


processor = SignalProcessor()
