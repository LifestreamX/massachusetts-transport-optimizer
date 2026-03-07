#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';
import { mbtaClient } from '../lib/mbta/mbtaClient';
import { getAllStations } from '../lib/data/stationsByLine';

// Configuration
const TEST_COUNT = parseInt(process.env.LIVE_COMPARE_COUNT || '2000', 10);
const CONCURRENCY = parseInt(process.env.LIVE_COMPARE_CONCURRENCY || '3', 10);
const DELAY_MS = parseInt(process.env.LIVE_COMPARE_DELAY_MS || '1000', 10);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// Generate random station pairs
function generatePairs(stations: string[], count: number) {
  const pairs: Array<{ origin: string; destination: string }> = [];
  const n = stations.length;
  for (let i = 0; i < count; i++) {
    const a = stations[Math.floor(Math.random() * n)];
    let b = stations[Math.floor(Math.random() * n)];
    if (a === b) b = stations[(Math.floor(Math.random() * (n - 1)) + 1) % n];
    pairs.push({ origin: a, destination: b });
  }
  return pairs;
}

async function compareOne(origin: string, destination: string) {
  try {
    const appResult = await optimizeRoute(origin, destination);

    // Ground truth: ensure returned route names exist in MBTA route list
    const allRouteData = await mbtaClient.fetchAllRouteData();
    const knownNames = new Set<string>();
    allRouteData.forEach((r: any) => {
      const name =
        r.route.attributes.long_name ||
        r.route.attributes.short_name ||
        r.route.id;
      knownNames.add(name);
    });

    const mismatches: string[] = [];
    appResult.routes.forEach((route: any) => {
      if (!knownNames.has(route.routeName)) {
        mismatches.push(route.routeName);
      }
    });

    return {
      origin,
      destination,
      routeCount: appResult.routes.length,
      mismatches: mismatches.join(';') || '',
      ok: mismatches.length === 0,
    };
  } catch (err: unknown) {
    return {
      origin,
      destination,
      routeCount: 0,
      mismatches: `error:${(err as Error).message}`,
      ok: false,
    };
  }
}

async function run() {
  const stations = getAllStations();
  const pairs = generatePairs(stations, TEST_COUNT);

  const outPath = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outPath)) fs.mkdirSync(outPath);
  const csvPath = path.join(outPath, `live-compare-${Date.now()}.csv`);
  const fd = fs.openSync(csvPath, 'w');
  fs.writeSync(fd, 'origin,destination,routeCount,ok,mismatches\n');

  let idx = 0;
  const results: any[] = [];

  async function worker() {
    while (idx < pairs.length) {
      const i = idx++;
      const p = pairs[i];
      const res = await compareOne(p.origin, p.destination);
      results.push(res);
      fs.writeSync(
        fd,
        `${JSON.stringify(res.origin).slice(1, -1)},${JSON.stringify(res.destination).slice(1, -1)},${res.routeCount},${res.ok},"${res.mismatches}"\n`,
      );
      // brief delay between items to reduce burstiness
      await sleep(DELAY_MS);
    }
  }

  // Launch workers
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  fs.closeSync(fd);

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(
    `Completed ${total} comparisons — passed: ${passed}, failed: ${failed}`,
  );
  console.log(`CSV report written to ${csvPath}`);
}

run().catch((err) => {
  console.error('Runner error:', err);
  process.exit(1);
});
