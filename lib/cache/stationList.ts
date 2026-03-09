// Static station lists used for prefetching and fallback behaviors.
// Keep these small and representative to avoid long build-time processing.
export const PRIORITY_STATIONS: string[] = [
  'South Station',
  'Park Street',
  'Downtown Crossing',
  'North Station',
  'Back Bay',
];

export const UNIQUE_STATIONS: string[] = [
  ...PRIORITY_STATIONS,
  'Alewife',
  'Quincy Center',
  'Forest Hills',
  'Harvard',
  'JFK/UMass',
];

// Note: For comprehensive station data, use the MBTA API or the server-side
// `/api/stations` endpoint which consolidates MBTA stop resources.
