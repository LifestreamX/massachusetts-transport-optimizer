#!/usr/bin/env ts-node
import { mbtaClient } from '../lib/mbta/mbtaClient';

async function main() {
  const routeId = 'CR-Greenbush';
  
  console.log(`Fetching stops for route=${routeId}`);
  
  try {
    const stops = await mbtaClient.fetchStops({ routeId });
    console.log(`\nGot ${stops.length} stops for ${routeId}`);
    
    stops.forEach((stop: any) => {
      console.log(`  ${stop.id}: ${stop.attributes?.name}`);
    });

    // Check if Quincy Center (70102) is in the list
    const quincyCenter = stops.find((s: any) => s.id === '70102');
    if (quincyCenter) {
      console.log('\n✓ Quincy Center (70102) is a stop on this route');
    } else {
      console.log('\n✗ Quincy Center (70102) is NOT a stop on this route');
      
      // Look for any Quincy-related stops
      const quincyStops = stops.filter((s: any) => 
        s.attributes?.name?.toLowerCase().includes('quincy')
      );
      if (quincyStops.length > 0) {
        console.log('\nQuincy-related stops found:');
        quincyStops.forEach((s: any) => {
          console.log(`  ${s.id}: ${s.attributes?.name}`);
        });
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
