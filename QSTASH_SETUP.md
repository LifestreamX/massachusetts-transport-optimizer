QStash setup for Massachusetts Transit Optimizer
===============================================

1) Create a QStash schedule in the QStash dashboard:
   - Method: POST
   - URL: https://<your-deployment>/api/qstash
   - Body: optional (we ignore body for now)
   - Interval: set to your desired schedule (e.g. every 3 minutes)

2) Security options (choose one):
   - Preferred: Set a "Signing Key" in QStash and paste it into your
     `QSTASH_SIGNING_KEY` environment variable in Vercel. The receiver verifies
     an HMAC-SHA256 signature sent in the `qstash-signature` header.
   - Alternate: Use the existing `CRON_SECRET` environment variable and have
     QStash add an `Authorization: Bearer <CRON_SECRET>` header when calling
     `POST /api/qstash`.

3) Testing locally / manually:
   - You can `curl` the endpoint to test (if CRON_SECRET is set):

     curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-deployment>/api/qstash

4) Notes:
   - The endpoint triggers the same `prefetchPriorityStations()` job used by
     the internal cron route. It returns a summary JSON with timing.
   - If you set `QSTASH_SIGNING_KEY`, the endpoint will require a valid
     HMAC-SHA256 signature in the `qstash-signature` header.
