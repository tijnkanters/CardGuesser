# Card Detection PoC

A mobile-friendly webapp that uses your smartphone camera to detect playing cards using Roboflow's model with local browser inference.

## Features

- 📱 Mobile-first design optimized for smartphones
- 🃏 Detects playing cards with rank and suit (A♠, K♥, 10♦, etc.)
- 🎯 Real-time detection with red bounding boxes
- 🔌 **Local inference** - model downloads once, then runs in browser
- 📷 Camera switching (front/rear)

## Quick Setup

### 1. Get a Roboflow API Key (Free)

1. Create account at [roboflow.com](https://roboflow.com)
2. Go to Settings → API Keys
3. Copy your **Publishable Key**

### 2. Add Your Key

Edit `app.js` line 31:
```javascript
publishable_key: "rf_YOUR_API_KEY",  // Replace with your key
```

### 3. Run

```bash
npx http-server . -p 8080
```

Open http://localhost:8080 on your device.

## How It Works

The app uses Roboflow's playing cards model (`playing-cards-ow27d`) which:
- Downloads once (~5MB) and caches in browser
- Runs inference entirely locally (no API calls during detection)
- Detects 52 card types with rank and suit

## Mobile Access

```bash
# Create HTTPS tunnel for mobile
npx localtunnel --port 8080
```
