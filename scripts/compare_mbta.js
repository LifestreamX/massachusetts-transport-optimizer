const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const STATIONS_FILE = path.join(
  __dirname,
  '..',
  'lib',
  'data',
  'stationsByLine.ts',
);
const LOCAL_API = process.env.LOCAL_API || 'http://localhost:3000';
const MBTA_BASE = 'https://api-v3.mbta.com';
const API_KEY = process.env.MBTA_API_KEY || '';

function loadStations() {
  const src = fs.readFileSync(STATIONS_FILE, 'utf8');
  const arrRegex = /export const [A-Z0-9_]+_STATIONS = \[([\s\S]*?)\];/gm;
  const stations = new Set();
  let m;
  while ((m = arrRegex.exec(src)) !== null) {
    const block = m[1];
    const strRegex = /'([^']+)'/g;
    let s;
    while ((s = strRegex.exec(block)) !== null) {
      stations.add(s[1].trim());
    }
  }
  return Array.from(stations).sort();
}

function sampleStations(all, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(all[Math.floor(Math.random() * all.length)]);
  }
  return out;
}

async function callLocal(station) {
  try {
    const res = await fetch(`${LOCAL_API}/api/station-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station }),
    });
    if (!res.ok) return { error: `local status ${res.status}` };
    const j = await res.json();
    return { ok: true, data: j };
  } catch (err) {
    return { error: String(err) };
  }
}

function buildMbtaUrl(path, params = {}) {
  const url = new URL(path, MBTA_BASE);
  if (API_KEY) url.searchParams.set('api_key', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

let allMbtaStopsCache = null;
async function fetchAllMbtaStopsOnce() {
  if (allMbtaStopsCache) return allMbtaStopsCache;
  const url = buildMbtaUrl('/stops', {
    'page[limit]': '1000',
    'fields[stop]': 'name',
  });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`mbta all stops status ${r.status}`);
  const j = await r.json();
  allMbtaStopsCache = (j.data || []).map((s) => ({
    id: s.id,
    name: s.attributes.name,
  }));
  return allMbtaStopsCache;
}

async function callMbtaForStation(station) {
  try {
    // Try stops filter by name first
    const stopsUrl = buildMbtaUrl('/stops', {
      'filter[name]': station,
      'fields[stop]': 'name',
    });
    let r = await fetch(stopsUrl);
    let stops = [];
    if (r.ok) {
      const jr = await r.json();
      stops = (jr.data || []).map((s) => ({
        id: s.id,
        name: s.attributes.name,
      }));
    }

    // If filter[name] not supported or returned nothing, fallback to local matching
    if (!r.ok || stops.length === 0) {
      try {
        const all = await fetchAllMbtaStopsOnce();
        const q = station.toLowerCase();
        stops = all.filter((s) => (s.name || '').toLowerCase().includes(q));
      } catch (err) {
        return { error: `failed to fetch all stops: ${err.message}` };
      }
    }

    if (stops.length === 0) return { ok: true, stops: [], predictions: [] };

    // For each stop get predictions (limited)
    const preds = [];
    for (const stop of stops.slice(0, 5)) {
      const purl = buildMbtaUrl('/predictions', {
        'filter[stop]': stop.id,
        sort: 'arrival_time',
        'page[limit]': '50',
      });
      const pr = await fetch(purl);
      if (!pr.ok) continue;
      const pjson = await pr.json();
      (pjson.data || []).forEach((p) =>
        preds.push({ stopId: stop.id, attributes: p.attributes }),
      );
      // be gentle
      await new Promise((r) => setTimeout(r, 100));
    }
    preds.sort((a, b) => {
      const ta =
        a.attributes?.departure_time || a.attributes?.arrival_time || null;
      const tb =
        b.attributes?.departure_time || b.attributes?.arrival_time || null;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return new Date(ta) - new Date(tb);
    });
    return { ok: true, stops, predictions: preds };
  } catch (err) {
    return { error: String(err) };
  }
}

function summarize(localRes) {
  if (!localRes || localRes.error) return { departures: -1 };
  const dep =
    localRes.data && Array.isArray(localRes.data.departures)
      ? localRes.data.departures
      : [];
  return { departures: dep.length, first: dep[0] || null };
}

function summarizeMbta(mbtaRes) {
  if (!mbtaRes || mbtaRes.error) return { predictions: -1 };
  return {
    predictions: mbtaRes.predictions.length,
    first: mbtaRes.predictions[0] || null,
  };
}

async function run() {
  const allStations = loadStations();
  console.log(`Loaded ${allStations.length} stations`);
  if (allStations.length === 0) return;
  const tests = sampleStations(allStations, 500);
  console.log(`Running ${tests.length} station comparisons...`);

  const results = [];
  const concurrency = 5;
  let idx = 0;

  async function worker() {
    while (idx < tests.length) {
      const i = idx++;
      const station = tests[i];
      process.stdout.write(`\r[${i + 1}/${tests.length}] ${station}     `);
      const [localRes, mbtaRes] = await Promise.all([
        callLocal(station),
        callMbtaForStation(station),
      ]);
      const sLocal = summarize(localRes);
      const sMbta = summarizeMbta(mbtaRes);
      const mismatch =
        sLocal.departures !== sMbta.predictions ||
        sLocal.departures === -1 ||
        sMbta.predictions === -1;
      results.push({
        station,
        local: sLocal,
        mbta: sMbta,
        mismatch,
        localErr: localRes.error || null,
        mbtaErr: mbtaRes.error || null,
      });
      // be gentle
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log('\nDone. Aggregating results...');
  const total = results.length;
  const mismatches = results.filter((r) => r.mismatch).length;
  const localErrors = results.filter((r) => r.localErr).length;
  const mbtaErrors = results.filter((r) => r.mbtaErr).length;

  const report = {
    total,
    mismatches,
    localErrors,
    mbtaErrors,
    details: results.slice(0, 50),
  };
  fs.writeFileSync(
    path.join(__dirname, 'compare_report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Total: ${total}, Mismatches: ${mismatches}, LocalErrors: ${localErrors}, MbtaErrors: ${mbtaErrors}`,
  );
  console.log(
    'Report written to scripts/compare_report.json (first 50 details included)',
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
