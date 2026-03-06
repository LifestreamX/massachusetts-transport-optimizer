# QStash setup for Massachusetts Transit Optimizer

1. Create a QStash schedule in the QStash dashboard:
   - Method: POST
   - URL: https://<your-deployment>/api/qstash
   - Body: optional (we ignore body for now)
   - Interval: set to your desired schedule (e.g. every 3 minutes)

2. Security options:
   - Preferred: Use QStash/Upstash signing keys. Set `QSTASH_CURRENT_SIGNING_KEY`
     (and `QSTASH_NEXT_SIGNING_KEY` for rotation) in your environment and the
     receiver will verify HMAC-SHA256 signatures sent by QStash.

3. Testing locally / manually:
   - You can `curl` the endpoint to test (if you set a signing key, you can
     generate a test HMAC locally). For quick testing without a signature set
     (not recommended in production) you can POST directly:

     curl -X POST https://<your-deployment>/api/qstash

4. Notes:
   - The endpoint triggers the same `prefetchPriorityStations()` job used by
     the internal cron route. It returns a summary JSON with timing.
   - If you set `QSTASH_SIGNING_KEY`, the endpoint will require a valid
     HMAC-SHA256 signature in the `qstash-signature` header.

5) Environment variables (Vercel / deployment):
   - Add these to your Vercel project settings (Environment Variables):
     - `MBTA_API_KEY` — your MBTA API key
     - `QSTASH_URL` — e.g. `https://qstash-us-east-1.upstash.io` (optional)
     - `QSTASH_TOKEN` — publish token (used for creating schedules via client)
     - `QSTASH_CURRENT_SIGNING_KEY` — current signing key used by QStash to sign webhooks
     - `QSTASH_NEXT_SIGNING_KEY` — next key for rotation (optional)

   - For local development, copy `.env.example` -> `.env` and fill values.

6) Quick verification after deployment:
   - If using `CRON_SECRET`:

     curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-deployment>/api/qstash

   - If using QStash signing keys, use the QStash dashboard to send a test
     webhook. Example using the official `@upstash/qstash` client to publish a
     one-off test message from a Node script:

```js
import { Client } from '@upstash/qstash';

const client = new Client({
  baseUrl: process.env.QSTASH_URL,
  token: process.env.QSTASH_TOKEN,
});

await client.publish({
  url: 'https://<your-deployment>/api/qstash',
  body: { test: true },
});
```

This will send a signed request from QStash to your receiver.
