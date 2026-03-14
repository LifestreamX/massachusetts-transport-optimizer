#!/usr/bin/env ts-node
import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

async function main() {
  const origin = 'Quincy Center';
  const destination = 'South Station';
  console.log(`Running optimizeRoute(${origin} -> ${destination})`);
  try {
    const res = await optimizeRoute(origin, destination, 'fastest');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
