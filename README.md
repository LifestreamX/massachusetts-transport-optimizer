# Massachusetts Transit Optimizer

**Real-time MBTA route optimization for all 232 subway and commuter rail stations in Massachusetts.**

---

## 🚨 API Key Required

- Get your free MBTA API key: https://api-v3.mbta.com/register
- Add it to `.env.local`:
  ```
  MBTA_API_KEY=your-key-here
  ```
- Without a key: 20 requests/minute (very limited)
- With a key: 1,000 requests/minute (recommended)

---

## Features

- Live departure boards and route planning for every MBTA station
- Real-time data, auto-refresh, and service alerts
- Fast, modern UI with autocomplete and mobile support
- Smart rate limiting and caching to avoid API errors

---

## Getting Started

1. **Install dependencies**
   ```
   npm install
   ```
2. **Add your API key** to `.env.local`
3. **Start the app**
   ```
   npm run dev
   ```
4. **Run tests**
   ```
   npm test
   ```

---

## Project Structure

- `app/` – UI and API routes
- `lib/` – MBTA client, caching, route logic
- `tests/` – Comprehensive test suites

---

## License

MIT
