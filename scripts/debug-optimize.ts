import 'dotenv/config';
process.env.MBTA_MOCK = '1';

import { optimizeRoute } from '../lib/decisionEngine/optimizeRoute';

async function run() {
  try {
    const res = await optimizeRoute('North Quincy', 'South Station', 'fastest');
    console.log('optimizeRoute result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('optimizeRoute threw:', err);
  }
}

run();
