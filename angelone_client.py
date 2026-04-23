import time
import pyotp
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2
from loguru import logger
from config import config


class AngelOneClient:
    def __init__(self):
        self.api = SmartConnect(api_key=config.ANGELONE_API_KEY)
        self.auth_token: str = ""
        self.feed_token: str = ""
        self.refresh_token: str = ""
        self._logged_in: bool = False

    # ── Authentication ────────────────────────────────────────────────────────

    def login(self) -> bool:
        totp = pyotp.TOTP(config.ANGELONE_TOTP_SECRET).now()
        try:
            data = self.api.generateSession(
                config.ANGELONE_CLIENT_ID,
                config.ANGELONE_PASSWORD,
                totp,
            )
            if data["status"]:
                self.auth_token = data["data"]["jwtToken"]
                self.refresh_token = data["data"]["refreshToken"]
                self.feed_token = self.api.getfeedToken()
                self._logged_in = True
                logger.info("AngelOne login successful")
                return True
            logger.error(f"Login failed: {data.get('message')}")
            return False
        except Exception as e:
            logger.error(f"Login exception: {e}")
            return False

    def logout(self):
        try:
            self.api.terminateSession(config.ANGELONE_CLIENT_ID)
            self._logged_in = False
            logger.info("AngelOne session terminated")
        except Exception as e:
            logger.warning(f"Logout error: {e}")

    # ── Order Management ──────────────────────────────────────────────────────

    def place_order(
        self,
        symbol_token: str,
        trading_symbol: str,
        action: str,           # "BUY" or "SELL"
        quantity: int,
        order_type: str = "MARKET",   # MARKET / LIMIT / SL / SL-M
        price: float = 0,
        trigger_price: float = 0,
        product_type: str = "INTRADAY",  # INTRADAY / DELIVERY / CARRYFORWARD
        exchange: str = "NFO",
    ) -> dict:
        """Place an order and return the API response dict."""
        order_params = {
            "variety": "NORMAL",
            "tradingsymbol": trading_symbol,
            "symboltoken": symbol_token,
            "transactiontype": action,
            "exchange": exchange,
            "ordertype": order_type,
            "producttype": product_type,
            "duration": "DAY",
            "price": str(price) if order_type == "LIMIT" else "0",
            "triggerprice": str(trigger_price) if trigger_price else "0",
            "quantity": str(quantity),
        }
        logger.info(f"Placing order: {order_params}")
        resp = self.api.placeOrder(order_params)
        return resp

    def cancel_order(self, order_id: str, variety: str = "NORMAL") -> dict:
        return self.api.cancelOrder(order_id, variety)

    # ── Positions & P&L ──────────────────────────────────────────────────────

    def get_positions(self) -> list:
        resp = self.api.position()
        if resp and resp.get("status"):
            return resp["data"] or []
        return []

    def get_order_book(self) -> list:
        resp = self.api.orderBook()
        if resp and resp.get("status"):
            return resp["data"] or []
        return []

    def get_order_status(self, order_id: str) -> dict | None:
        orders = self.get_order_book()
        for order in orders:
            if order.get("orderid") == order_id:
                return order
        return None

    def get_day_pnl(self) -> float:
        positions = self.get_positions()
        total_pnl = 0.0
        for pos in positions:
            try:
                pnl = float(pos.get("unrealised", 0)) + float(pos.get("realised", 0))
                total_pnl += pnl
            except (ValueError, TypeError):
                pass
        return total_pnl

    # ── Square Off ────────────────────────────────────────────────────────────

    def square_off_all_positions(self) -> list:
        """Close all open intraday positions. Returns list of order IDs placed."""
        positions = self.get_positions()
        order_ids = []
        for pos in positions:
            net_qty = int(pos.get("netqty", 0))
            if net_qty == 0:
                continue
            # If net qty is positive we are long → sell; negative we are short → buy
            action = "SELL" if net_qty > 0 else "BUY"
            qty = abs(net_qty)
            try:
                resp = self.place_order(
                    symbol_token=pos["symboltoken"],
                    trading_symbol=pos["tradingsymbol"],
                    action=action,
                    quantity=qty,
                    order_type="MARKET",
                    product_type=pos.get("producttype", "INTRADAY"),
                    exchange=pos.get("exchange", "NFO"),
                )
                if resp and resp.get("status"):
                    order_ids.append(resp["data"]["orderid"])
                    logger.info(f"Square-off order placed: {resp['data']['orderid']} for {pos['tradingsymbol']}")
                else:
                    logger.error(f"Square-off failed for {pos['tradingsymbol']}: {resp}")
            except Exception as e:
                logger.error(f"Square-off exception for {pos['tradingsymbol']}: {e}")
        return order_ids

    # ── Symbol Lookup ─────────────────────────────────────────────────────────

    def search_scrip(self, exchange: str, trading_symbol: str) -> dict | None:
        """Search for a scrip token by trading symbol."""
        resp = self.api.searchScrip(exchange, trading_symbol)
        if resp and resp.get("status") and resp["data"]:
            return resp["data"][0]
        return None

    def get_ltp(self, exchange: str, trading_symbol: str, symbol_token: str) -> float:
        resp = self.api.ltpData(exchange, trading_symbol, symbol_token)
        if resp and resp.get("status"):
            return float(resp["data"]["ltp"])
        return 0.0


angelone = AngelOneClient()
