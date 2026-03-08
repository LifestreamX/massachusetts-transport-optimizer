#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { UNIQUE_STATIONS } from '../lib/cache/stationList';
import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';
import { mbtaClient } from '../lib/mbta/mbtaClient';

type ResultRow = {
  origin: string;
  destination: string;
  ourTopRoute: string | null;
  mbtaCandidateRoutes: string[];
  ourAccessible: boolean | null;
  mbtaAccessible: boolean | null;
  ourTransfers: number | null;
  mbtaTransfers: number | null;
  matchTopRoute: boolean;
  notes: string;
};

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function generatePairs(count: number, seed = 42) {
  const rng = seededRandom(seed);
  const stations = UNIQUE_STATIONS;
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  while (pairs.length < count) {
    const a = stations[Math.floor(rng() * stations.length)];
    const b = stations[Math.floor(rng() * stations.length)];
    if (a === b) continue;
    const key = `${a}__${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }
  return pairs;
}

async function analyzePair(
  origin: string,
  destination: string,
  stopsMap: Map<string, any[]>,
  routeServesMap: Map<string, Set<string>>,
): Promise<ResultRow> {
  try {
    const opt = await optimizeRoute(origin, destination, 'fastest');
    const ourTop = opt.routes?.[0] ?? null;

    const originStops = stopsMap.get(origin) ?? [];
    const destStops = stopsMap.get(destination) ?? [];
    const originIds = new Set(originStops.map((s: any) => s.id));
    const destIds = new Set(destStops.map((s: any) => s.id));

    const candidates: string[] = [];
    for (const [routeName, servedSet] of routeServesMap.entries()) {
      const servesOrigin = [...originIds].some((id) => servedSet.has(id));
      const servesDest = [...destIds].some((id) => servedSet.has(id));
      if (servesOrigin && servesDest) candidates.push(routeName);
    }

    const ourAccessible = ourTop?.accessible ?? null;
    const mbtaAccessible =
      (originStops.some((s: any) => s.attributes?.wheelchair_boarding === 1) &&
        destStops.some((s: any) => s.attributes?.wheelchair_boarding === 1)) ||
      null;

    const ourTransfers = ourTop?.transfersEstimate ?? null;
    const mbtaTransfers = candidates.length > 0 ? 0 : 2;
    const matchTop = ourTop
      ? candidates.includes(ourTop.routeName) ||
        candidates.includes((ourTop.routeName || '').toLowerCase())
      : false;

    return {
      origin,
      destination,
      ourTopRoute: ourTop?.routeName ?? null,
      mbtaCandidateRoutes: candidates,
      ourAccessible,
      mbtaAccessible,
      ourTransfers,
      mbtaTransfers,
      matchTopRoute: matchTop,
      notes: '',
    };
  } catch (err: any) {
    return {
      origin,
      destination,
      ourTopRoute: null,
      mbtaCandidateRoutes: [],
      ourAccessible: null,
      mbtaAccessible: null,
      ourTransfers: null,
      mbtaTransfers: null,
      matchTopRoute: false,
      notes: String(err?.message ?? err),
    };
  }
}

async function run(
  count: number,
  opts: {
    pairConcurrency?: number;
    stopFetchConcurrency?: number;
    scheduleConcurrency?: number;
  } = {},
) {
  const pairConcurrency = opts.pairConcurrency ?? 1;
  const stopFetchConcurrency = opts.stopFetchConcurrency ?? 2;
  const scheduleConcurrency = opts.scheduleConcurrency ?? 1;

  console.log(
    `Starting live-compare for ${count} pairs (pairConcurrency=${pairConcurrency})`,
  );
  const pairs = generatePairs(count, Date.now() % 1000000);
  const outDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `live-compare-${Date.now()}.csv`);
  const header =
    'origin,destination,ourTopRoute,mbtaCandidateRoutes,ourAccessible,mbtaAccessible,ourTransfers,mbtaTransfers,matchTopRoute,notes\n';
  fs.writeFileSync(outFile, header, 'utf8');

  // Prefetch stops for all stations to reduce per-pair calls
  console.log('Prefetching stop metadata for stations...');
  const stopsMap = new Map<string, any[]>();
  const stationList = UNIQUE_STATIONS;
  let stopIdx = 0;
  async function stopWorker() {
    while (stopIdx < stationList.length) {
      const i = stopIdx++;
      const name = stationList[i];
      try {
        const val = await mbtaClient.fetchStops(name).catch(() => [] as any[]);
        stopsMap.set(name, val);
      } catch (e) {
        stopsMap.set(name, []);
      }
    }
  }
  await Promise.all(Array.from({ length: stopFetchConcurrency }, stopWorker));

  // Prefetch all route data and compute served stop ids per route
  console.log('Prefetching all route data and schedules...');
  const allRouteData = await mbtaClient.fetchAllRouteData();
  const routeServesMap = new Map<string, Set<string>>();
  let rIdx = 0;
  async function routeWorker() {
    while (rIdx < allRouteData.length) {
      const i = rIdx++;
      const rd = allRouteData[i];
      try {
        const schedules = await mbtaClient
          .fetchSchedules(rd.route.id)
          .catch(() => [] as any[]);
        const served = new Set(
          schedules
            .map((s: any) => s.relationships?.stop?.data?.id)
            .filter(Boolean),
        );
        const name =
          rd.route.attributes?.long_name ||
          rd.route.attributes?.short_name ||
          rd.route.id;
        routeServesMap.set(name, served);
      } catch (e) {
        const name =
          rd.route.attributes?.long_name ||
          rd.route.attributes?.short_name ||
          rd.route.id;
        routeServesMap.set(name, new Set());
      }
    }
  }
  await Promise.all(Array.from({ length: scheduleConcurrency }, routeWorker));

  // Limit concurrency for pair analysis
  let idx = 0;
  async function worker() {
    while (idx < pairs.length) {
      const i = idx++;
      const [o, d] = pairs[i];
      process.stdout.write(`\rProgress: ${i + 1}/${pairs.length}`);
      const row = await analyzePair(o, d, stopsMap, routeServesMap);
      const line =
        [
          row.origin,
          row.destination,
          (row.ourTopRoute ?? '').replace(/,/g, ' '),
          row.mbtaCandidateRoutes.map((r) => r.replace(/,/g, ' ')).join('|'),
          row.ourAccessible ?? '',
          row.mbtaAccessible ?? '',
          row.ourTransfers ?? '',
          row.mbtaTransfers ?? '',
          row.matchTopRoute,
          `"${(row.notes ?? '').replace(/"/g, '""')}"`,
        ].join(',') + '\n';
      fs.appendFileSync(outFile, line, 'utf8');
    }
  }

  await Promise.all(Array.from({ length: pairConcurrency }, worker));
  console.log('\nDone. Results saved to', outFile);
}

// CLI with concurrency flags
const argv = process.argv.slice(2);
function getFlag(name: string, def?: string) {
  const i = argv.findIndex((a) => a === name);
  return i >= 0 ? argv[i + 1] : def;
}
const count = parseInt(getFlag('--count', '5000')!, 10);
const pairConcurrency = parseInt(getFlag('--concurrency', '1')!, 10);
const stopFetchConcurrency = parseInt(getFlag('--stopConcurrency', '2')!, 10);
const scheduleConcurrency = parseInt(
  getFlag('--scheduleConcurrency', '1')!,
  10,
);

async function runWithOptions(totalCount: number) {
  const smoke = Math.min(100, totalCount);
  console.log('Running smoke test for', smoke, 'pairs');
  await run(smoke, {
    pairConcurrency,
    stopFetchConcurrency,
    scheduleConcurrency,
  });
  if (totalCount > smoke) {
    console.log(
      `Smoke complete. Proceeding to full run of ${totalCount} pairs...`,
    );
    await run(totalCount - smoke, {
      pairConcurrency,
      stopFetchConcurrency,
      scheduleConcurrency,
    });
  }
}

(async () => {
  await runWithOptions(count);
})();
