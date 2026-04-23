# TradingView → AngelOne → Telegram Trading Bot — Setup Guide

## Prerequisites

- Python 3.11+
- A VPS / cloud server with a **public IP** (the bot must be reachable by TradingView)
- AngelOne account with **SmartAPI** enabled
- Telegram bot created via **@BotFather**
- TradingView account (Pro or above for webhook alerts)

---

## 1. AngelOne SmartAPI Setup

1. Login to myaccount.angelone.in
2. Go to **Apps** → **Create New App** → note your **API Key**
3. Enable TOTP in the Angel One app:
   - Go to Profile → Two-Factor Authentication → TOTP
   - Scan the QR code with Google Authenticator or Authy
   - **Save the Base32 secret** shown below the QR code — this is `ANGELONE_TOTP_SECRET`

---

## 2. Telegram Bot Setup

```
1. Message @BotFather on Telegram → /newbot
2. Copy the bot token → TELEGRAM_BOT_TOKEN
3. Start your bot (send it any message)
4. Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
5. Find "chat":{"id": <number>} → TELEGRAM_CHAT_ID
```

---

## 3. Server Setup

```bash
# Clone / upload the bot files to your server
git clone <repo> trading-bot
cd trading-bot

# Install dependencies
pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env
nano .env
```

---

## 4. Environment Variables (`.env`)

```env
ANGELONE_API_KEY=abc123
ANGELONE_CLIENT_ID=A123456
ANGELONE_PASSWORD=your_mpin
ANGELONE_TOTP_SECRET=BASE32SECRETFROMQRCODE

TELEGRAM_BOT_TOKEN=123456789:AABBcc...
TELEGRAM_CHAT_ID=987654321

WEBHOOK_SECRET=MyStr0ngSecret!     # ← copy this into every TradingView alert
WEBHOOK_HOST=0.0.0.0
WEBHOOK_PORT=8000

MAX_DAILY_LOSS=5000
MAX_OPEN_POSITIONS=2
DEFAULT_QUANTITY=25
SQUARE_OFF_TIME=15:15
```

---

## 5. Open Port & Firewall

```bash
# Allow webhook port
sudo ufw allow 8000/tcp

# Verify your public IP
curl ifconfig.me
```

---

## 6. TradingView Alert Setup

1. Open your indicator chart in TradingView
2. Click the **Alerts** bell icon → **Create Alert**
3. Set your trigger condition from your indicator
4. In **Notifications** tab:
   - Enable **Webhook URL**
   - URL: `http://<YOUR_PUBLIC_IP>:8000/webhook`
5. In the **Message** field, paste the appropriate JSON from `tradingview_alert_template.pine`
   - **Update `expiry` to the current month's expiry date every week/month**
6. Set **Alert Expiry** to as far ahead as possible

---

## 7. Run the Bot

```bash
# Test run
python main.py

# Production (run in background, survives terminal close)
nohup python main.py &

# Or with screen
screen -S trading-bot
python main.py
# Ctrl+A+D to detach
```

The bot will:
- **09:00 AM IST** — Login to AngelOne, start webhook server, send Telegram confirmation
- **During market hours** — Execute trades from TradingView signals
- **Every 5 min** — Check P&L, halt if daily loss limit hit
- **15:15 PM IST** — Auto square-off all open positions
- **15:30 PM IST** — Logout, send day summary to Telegram

---

## 8. Run as a systemd Service (Recommended for Production)

```ini
# /etc/systemd/system/trading-bot.service

[Unit]
Description=TradingView AngelOne Trading Bot
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/trading-bot
ExecStart=/usr/bin/python3 /home/ubuntu/trading-bot/main.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable trading-bot
sudo systemctl start trading-bot
sudo systemctl status trading-bot
```

---

## Signal JSON Reference

| Field | Required | Values | Example |
|-------|----------|--------|---------|
| `secret` | Yes | Your webhook secret | `"MySecret"` |
| `symbol` | Yes | NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY | `"NIFTY"` |
| `action` | Yes | BUY, SELL | `"BUY"` |
| `instrument` | Yes | FUT, CE, PE | `"FUT"` |
| `expiry` | Yes | e.g. `"29MAY2025"` | `"29MAY2025"` |
| `strike` | Options only | Strike price | `24000` |
| `price` | No | 0 = MARKET | `0` |
| `quantity` | No | Lots | `25` |
| `product_type` | No | INTRADAY, DELIVERY | `"INTRADAY"` |
| `order_type` | No | MARKET, LIMIT, SL, SL-M | `"MARKET"` |

---

## 9. Mobile Control via Telegram

Once the bot is running, open your Telegram app and message your bot:

| Command | What it does |
|---------|-------------|
| `/start` | Show all available commands |
| `/status` | Bot state, login, halt, open positions, P&L |
| `/positions` | Live open positions with unrealized P&L |
| `/pnl` | Today's realized + unrealized P&L |
| `/orders` | Last 10 orders from today's order book |
| `/squareoff` | Close all positions (asks for confirmation) |
| `/halt` | Pause bot — no new trades accepted |
| `/resume` | Resume trading after halt |
| `/setlots 50` | Change default quantity to 50 |
| `/setloss 8000` | Update daily loss limit to ₹8000 |
| `/trade NIFTY BUY FUT 29MAY2025` | Place a manual futures trade |
| `/trade BANKNIFTY SELL PE 29MAY2025 52000` | Place a manual options trade |

> All commands only work from your configured `TELEGRAM_CHAT_ID` — no one else can control the bot.

---

## Health Check

```bash
curl http://localhost:8000/health
# {"status":"running","halted":false,"open_positions":0}
```
