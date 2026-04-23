# AlgoTrader Mobile App — Setup Guide

## What You Need

- An Android or iPhone
- A free Cloudflare account (cloudflare.com)
- A free Expo account (expo.dev) — for push notifications
- Node.js 18+ on your computer (one-time setup)

---

## Step 1 — Install & Run the App

```bash
cd mobile-app
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (download from Play Store / App Store).

The app opens on your phone. Go to **Settings** tab — you'll see your **Expo Push Token** (looks like `ExponentPushToken[xxxxxx]`). Copy it.

---

## Step 2 — Deploy the Cloudflare Worker (free, 5 minutes)

```bash
# Install wrangler (Cloudflare CLI)
npm install -g wrangler

# Login to Cloudflare (opens browser)
wrangler login

cd cloudflare-worker
npm install

# Set your secrets (never stored in code)
wrangler secret put WEBHOOK_SECRET
# → Type a strong secret, e.g.:  NiftyBot@2025!

wrangler secret put EXPO_PUSH_TOKEN
# → Paste the token from the app Settings screen

# Deploy!
wrangler deploy
```

After deploy you'll get a URL like:
`https://tradingview-signal-relay.YOUR-NAME.workers.dev`

Your TradingView webhook URL is:
`https://tradingview-signal-relay.YOUR-NAME.workers.dev/signal`

---

## Step 3 — Configure TradingView Alert

1. Open your indicator chart in TradingView
2. Create Alert → set your signal condition
3. In **Notifications** → enable **Webhook URL**
4. URL: `https://tradingview-signal-relay.YOUR-NAME.workers.dev/signal`
5. In **Message**, paste this JSON (edit expiry/strike as needed):

```json
{
  "secret":       "NiftyBot@2025!",
  "symbol":       "NIFTY",
  "action":       "BUY",
  "instrument":   "FUT",
  "expiry":       "29MAY2025",
  "strike":       0,
  "price":        0,
  "quantity":     25,
  "product_type": "INTRADAY",
  "order_type":   "MARKET"
}
```

---

## Step 4 — Enter Credentials in the App

Open the **Settings** tab in the app:

1. **API Key** — from AngelOne SmartAPI dashboard
2. **Client ID** — your AngelOne login ID (e.g. A123456)
3. **MPIN** — your 4-digit AngelOne PIN
4. **TOTP Secret** — the Base32 text shown when you set up 2FA in AngelOne app
5. Tap **Connect to AngelOne**

---

## How It Works Day-to-Day

1. TradingView fires your signal → Cloudflare Worker receives it → push notification on your phone
2. Notification: `🟢 BUY NIFTY Futures` — tap to open app
3. **Signals** tab shows the pending signal with **Execute** / **Dismiss** buttons
4. Tap **Execute** → trade placed on AngelOne instantly
5. **Dashboard** shows live P&L and positions (pull to refresh)

### Auto-Execute Mode
In Settings, turn on **Auto-Execute Signals** — trades execute the moment the notification arrives, no tap needed.

---

## Build a Standalone APK (no Expo Go needed)

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# First time setup
eas build:configure

# Build Android APK
eas build -p android --profile preview
```

The APK link is sent to your email. Install it directly on your phone (no Play Store needed).

---

## App Screens

| Screen | What it shows |
|--------|--------------|
| 📊 Dashboard | Connection status, today's P&L, open positions count, Halt/Square-Off buttons |
| ⚡ Signals | Incoming signal cards with Execute/Dismiss buttons |
| 📂 Positions | Live open positions with unrealized P&L |
| 📋 Orders | Today's order book with fill prices |
| ⚙️ Settings | Credentials, risk limits, auto-execute toggle, push token |
