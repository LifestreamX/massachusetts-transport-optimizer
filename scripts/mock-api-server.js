const http = require('http');

// Allow selecting port via command-line `--port <n>` or `PORT` env var.
let argvPort = null;
const portIndex = process.argv.indexOf('--port');
if (portIndex !== -1 && process.argv.length > portIndex + 1) {
  argvPort = process.argv[portIndex + 1];
}
const PORT = argvPort || process.env.PORT || 3000;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (url === '/api/optimize-route') {
    if (method === 'GET') {
      return sendJson(res, 405, {
        error: 'Only POST supported. Use POST /api/optimize-route',
      });
    }

    if (method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}');
        const origin = (parsed.origin || '').trim();
        const destination = (parsed.destination || '').trim();

        if (!origin || !destination) {
          return sendJson(res, 400, {
            error: 'origin and destination are required',
            statusCode: 400,
          });
        }

        // Return a minimal but valid OptimizeRouteResponse
        const response = {
          routes: [
            {
              routeName: `Mock route ${origin}→${destination}`,
              totalEstimatedTime: 10,
              delayMinutes: 0,
              reliabilityScore: 0.9,
              alertSummary: [],
            },
          ],
          lastUpdated: new Date().toISOString(),
        };

        return sendJson(res, 200, response);
      } catch (e) {
        return sendJson(res, 400, { error: 'malformed json', statusCode: 400 });
      }
    }
  }

  // Default 404
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Mock API server listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
