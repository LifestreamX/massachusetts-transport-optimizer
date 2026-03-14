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

- **Live departure boards** and route planning for every MBTA station
- **Real-time predictions** with schedule fallback for commuter rail
- **Multi-modal support**: subway and commuter rail with accurate ETAs
- **Smart route→stop mapping**: handles stations with different IDs per line
- **Service alerts** and reliability scores
- **Auto-refresh** with optimized caching to reduce API load
- **Fast, modern UI** with autocomplete and mobile support
- **Built-in rate limiting** and Redis caching

---

## Recent Updates

### Commuter Rail Schedule Support (March 2026)
Fixed commuter rail ETAs not displaying. Root cause: stations like Quincy Center have different stop IDs for each line (e.g., Red Line uses `70102`, Greenbush uses `place-qnctr`). 

**What changed:**
- Fetch route-specific stop IDs instead of reusing a single origin stop
- Add schedule fallback when live predictions are unavailable
- Cache route→stop mappings (24h TTL) to reduce API calls
- Display "Scheduled" badge with time when showing schedule-based ETAs

**Impact:** Commuter rail routes now show scheduled departure times even when live predictions are not available, ensuring users always have timing information.

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

- `app/` – Next.js pages, UI components, and API routes
- `lib/` – Core logic
  - `mbta/` – MBTA API client with caching and retry logic
  - `decisionEngine/` – Route optimization and scoring
  - `cache/` – Redis-backed caching layer
  - `data/` – Static station and line data
- `scripts/` – Utilities and integration tests
  - `integration-test.ts` – Validates commuter rail and schedule fallback
  - `live-compare.ts` – Large-scale validation runner

---

## License

MIT
