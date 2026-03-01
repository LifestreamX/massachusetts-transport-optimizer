const fetch = global.fetch || require('node-fetch');

const URL = 'http://localhost:3000/api/station-info';
const station = process.argv[2] || 'Quincy Center';
const iterations = parseInt(process.argv[3] || '100', 10);

async function run() {
  let success = 0;
  for (let i = 0; i < iterations; i++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station }),
      });
      const text = await res.text();
      if (res.ok) {
        success++;
      } else {
        console.error(`(${i + 1}) Failed: ${res.status} - ${text}`);
      }
    } catch (err) {
      console.error(`(${i + 1}) Error:`, err.message || err);
    }
  }
  console.log(`Completed ${iterations} requests. Success: ${success}`);
}

run();
