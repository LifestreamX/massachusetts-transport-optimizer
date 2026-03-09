import 'dotenv/config';

import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

async function run() {
  try {
    const res = await optimizeRoute('North Quincy', 'South Station', 'fastest');
    console.log('optimizeRoute (live) result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('optimizeRoute (live) threw:', err);
  }
}

run();
