'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OptimizeRouteResponse,
  ApiErrorResponse,
  RouteOption,
} from '@/types/routeTypes';
import {
  SUBWAY_LINES,
  COMMUTER_RAIL_LINES,
  getAllStations,
  getAllSubwayStations,
  getAllCommuterRailStations,
  getStationsFromLines,
  type LineInfo,
} from '@/lib/data/stationsByLine';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds for live updates

// ALL MBTA Subway Stations in Massachusetts (Red, Orange, Blue, Green Lines)
const SUBWAY_STATIONS = [
  // Red Line - Alewife to Ashmont Branch
  'Alewife',
  'Davis',
  'Porter',
  'Harvard',
  'Central',
  'Kendall/MIT',
  'Charles/MGH',
  'Park Street',
  'Downtown Crossing',
  'South Station',
  'Broadway',
  'Andrew',
  'JFK/UMass',
  'Savin Hill',
  'Fields Corner',
  'Shawmut',
  'Ashmont',
  // Red Line - Braintree Branch
  'North Quincy',
  'Wollaston',
  'Quincy Center',
  'Quincy Adams',
  'Braintree',
  // Orange Line - Oak Grove to Forest Hills
  'Oak Grove',
  'Malden Center',
  'Wellington',
  'Assembly',
  'Sullivan Square',
  'Community College',
  'North Station',
  'Haymarket',
  'State',
  'Downtown Crossing',
  'Chinatown',
  'Tufts Medical Center',
  'Back Bay',
  'Massachusetts Avenue',
  'Ruggles',
  'Roxbury Crossing',
  'Jackson Square',
  'Stony Brook',
  'Green Street',
  'Forest Hills',
  // Blue Line - Wonderland to Bowdoin
  'Wonderland',
  'Revere Beach',
  'Beachmont',
  'Suffolk Downs',
  'Orient Heights',
  'Wood Island',
  'Airport',
  'Maverick',
  'Aquarium',
  'State',
  'Government Center',
  'Bowdoin',
  // Green Line B Branch - Park Street to Boston College
  'Boston College',
  'South Street',
  'Chestnut Hill Avenue',
  'Chiswick Road',
  'Sutherland Road',
  'Washington Street',
  'Warren Street',
  'Allston Street',
  'Griggs Street',
  'Harvard Avenue',
  'Packards Corner',
  'Babcock Street',
  'Pleasant Street',
  'Saint Paul Street',
  'Boston University East',
  'Boston University Central',
  'Boston University West',
  'Blandford Street',
  // Green Line C Branch - North Station to Cleveland Circle
  'Cleveland Circle',
  'Englewood Avenue',
  'Dean Road',
  'Tappan Street',
  'Washington Square',
  'Fairbanks Street',
  'Brandon Hall',
  'Summit Avenue',
  'Coolidge Corner',
  'Saint Marys Street',
  'Hawes Street',
  'Kent Street',
  'Saint Paul Street',
  'Hynes Convention Center',
  // Green Line D Branch - Union Square to Riverside
  'Riverside',
  'Woodland',
  'Waban',
  'Eliot',
  'Newton Highlands',
  'Newton Centre',
  'Chestnut Hill',
  'Reservoir',
  'Beaconsfield',
  'Brookline Hills',
  'Brookline Village',
  'Longwood',
  'Fenway',
  // Green Line E Branch - Lechmere to Heath Street
  'Heath Street',
  'Back of the Hill',
  'Riverway',
  'Mission Park',
  'Fenwood Road',
  'Brigham Circle',
  'Longwood Medical Area',
  'Museum of Fine Arts',
  'Northeastern University',
  'Symphony',
  'Prudential',
  'Copley',
  // Green Line Common Stops
  'Lechmere',
  'Science Park/West End',
  'North Station',
  'Haymarket',
  'Government Center',
  'Park Street',
  'Boylston',
  'Arlington',
  'Copley',
  'Hynes Convention Center',
  'Kenmore',
];

// ALL MBTA Commuter Rail Stations in Massachusetts
const COMMUTER_RAIL_STATIONS = [
  // Fitchburg Line
  'North Station',
  'Porter',
  'Belmont',
  'Waverley',
  'Waltham',
  'Brandeis/Roberts',
  'Kendal Green',
  'Hastings',
  'Silver Hill',
  'Lincoln',
  'Concord',
  'West Concord',
  'South Acton',
  'Littleton/Route 495',
  'Ayer',
  'Shirley',
  'North Leominster',
  'Fitchburg',
  'Wachusett',
  // Framingham/Worcester Line
  'South Station',
  'Back Bay',
  'Yawkey',
  'Newtonville',
  'West Newton',
  'Auburndale',
  'Wellesley Farms',
  'Wellesley Hills',
  'Wellesley Square',
  'Natick Center',
  'West Natick',
  'Framingham',
  'Ashland',
  'Southborough',
  'Westborough',
  'Grafton',
  'Worcester/Union Station',
  // Franklin/Foxboro Line
  'South Station',
  'Back Bay',
  'Ruggles',
  'Hyde Park',
  'Readville',
  'Endicott',
  'Dedham Corporate Center',
  'Islington',
  'Norwood Central',
  'Norwood Depot',
  'Windsor Gardens',
  'Plimptonville',
  'Walpole',
  'Norfolk',
  'Franklin/Dean College',
  'Forge Park/495',
  'Foxboro',
  // Greenbush Line
  'South Station',
  'JFK/UMass',
  'Quincy Center',
  'Weymouth Landing/East Braintree',
  'East Weymouth',
  'West Hingham',
  'Nantasket Junction',
  'Cohasset',
  'North Scituate',
  'Greenbush',
  // Haverhill Line
  'North Station',
  'Malden Center',
  'Wyoming Hill',
  'Melrose/Cedar Park',
  'Melrose Highlands',
  'Greenwood',
  'Wakefield',
  'Reading',
  'North Wilmington',
  'Ballardvale',
  'Andover',
  'Lawrence',
  'Bradford',
  'Haverhill',
  // Kingston/Plymouth Line
  'South Station',
  'JFK/UMass',
  'Quincy Center',
  'Braintree',
  'Weymouth Landing/East Braintree',
  'South Weymouth',
  'Abington',
  'Whitman',
  'Hanson',
  'Halifax',
  'Kingston',
  'Plymouth',
  // Lowell Line
  'North Station',
  'West Medford',
  'Wedgemere',
  'Winchester Center',
  'Mishawum',
  'Anderson/Woburn',
  'Wilmington',
  'North Billerica',
  'Lowell',
  // Needham Line
  'South Station',
  'Back Bay',
  'Ruggles',
  'Forest Hills',
  'Roslindale Village',
  'Bellevue',
  'Highland',
  'West Roxbury',
  'Hersey',
  'Needham Junction',
  'Needham Center',
  'Needham Heights',
  // Newburyport/Rockport Line
  'North Station',
  'Chelsea',
  'Lynn',
  'Swampscott',
  'Salem',
  'Beverly',
  'Montserrat',
  'Prides Crossing',
  'Beverly Farms',
  'Manchester',
  'West Gloucester',
  'Gloucester',
  'Rockport',
  'North Beverly',
  'Hamilton/Wenham',
  'Ipswich',
  'Rowley',
  'Newburyport',
  // Providence/Stoughton Line
  'South Station',
  'Back Bay',
  'Ruggles',
  'Hyde Park',
  'Route 128',
  'Canton Junction',
  'Sharon',
  'Mansfield',
  'Attleboro',
  'South Attleboro',
  'Canton Center',
  'Stoughton',
  // Fairmount Line
  'South Station',
  'Newmarket',
  'Uphams Corner',
  'Four Corners/Geneva',
  'Talbot Avenue',
  'Morton Street',
  'Fairmount',
  'Readville',
];

type TransitMode = 'all' | 'subway' | 'commuter';
type RoutePreference =
  | 'fastest'
  | 'least-transfers'
  | 'most-reliable'
  | 'accessible';
type ViewMode = 'route-planning' | 'station-info';

interface StationInfoResponse {
  stationName: string;
  departures: {
    routeName: string;
    destination: string;
    departureTime: string | null;
    arrivalTime: string | null;
    minutesAway: number;
    status: string | null;
    tripHeadsign: string;
    track: string | null;
    mode?: 'subway' | 'commuter' | 'light-rail';
  }[];
  alerts: {
    header: string;
    severity: number;
    effect: string;
  }[];
  lastUpdated: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: fetch optimized routes                                     */
/* ------------------------------------------------------------------ */

async function fetchOptimizedRoutes(
  origin: string,
  destination: string,
): Promise<OptimizeRouteResponse> {
  const res = await fetch('/api/optimize-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as OptimizeRouteResponse;
}

async function fetchStationInfo(station: string): Promise<StationInfoResponse> {
  const res = await fetch('/api/station-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ station }),
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as StationInfoResponse;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function LineFilterPanel({
  lines,
  selectedLineIds,
  onToggleLine,
  onSelectAll,
  onClearAll,
  title,
}: {
  lines: LineInfo[];
  selectedLineIds: string[];
  onToggleLine: (lineId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  title: string;
}) {
  return (
    <div className='rounded-lg border-2 border-gray-200 bg-white p-4'>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='text-sm font-bold text-gray-900'>{title}</h3>
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={onSelectAll}
            className='text-xs font-semibold text-blue-600 hover:text-blue-700'
          >
            All
          </button>
          <span className='text-gray-300'>|</span>
          <button
            type='button'
            onClick={onClearAll}
            className='text-xs font-semibold text-gray-600 hover:text-gray-700'
          >
            Clear
          </button>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        {lines.map((line) => (
          <button
            key={line.id}
            type='button'
            onClick={() => onToggleLine(line.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
              selectedLineIds.includes(line.id)
                ? 'shadow-md ring-2 ring-offset-1'
                : 'opacity-50 hover:opacity-75'
            }`}
            style={{
              backgroundColor: selectedLineIds.includes(line.id)
                ? line.color
                : '#e5e7eb',
              color: selectedLineIds.includes(line.id) ? 'white' : '#6b7280',
            }}
          >
            {line.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function AutocompleteInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  suggestions: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length > 0) {
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase()),
      );
      setFilteredSuggestions(filtered.slice(0, 15)); // Show more suggestions
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className='relative' ref={wrapperRef}>
      <label
        htmlFor={id}
        className='mb-1.5 block text-sm font-semibold text-gray-700'
      >
        {label}
      </label>
      <div className='relative'>
        <input
          id={id}
          type='text'
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() =>
            value.length > 0 &&
            filteredSuggestions.length > 0 &&
            setShowSuggestions(true)
          }
          required
          autoComplete='off'
          className='w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20'
        />
        <div className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400'>
          📍
        </div>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className='absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl'>
          {filteredSuggestions.map((suggestion, i) => (
            <li key={i}>
              <button
                type='button'
                onClick={() => {
                  onChange(suggestion);
                  setShowSuggestions(false);
                }}
                className='w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-blue-50 hover:text-blue-700'
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteCard({
  route,
  rank,
  isBest,
}: {
  route: RouteOption;
  rank: number;
  isBest: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-2xl border-2 p-6 transition-all ${
        isBest
          ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-xl ring-4 ring-blue-500/20'
          : 'border-gray-200 bg-white shadow-md hover:shadow-lg'
      }`}
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='flex items-center gap-4 flex-1'>
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold shadow-md ${
              isBest
                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700'
            }`}
          >
            {rank}
          </div>
          <div className='flex-1'>
            <h3 className='text-xl font-bold leading-tight text-gray-900'>
              {route.routeName}
            </h3>
            {isBest && (
              <div className='mt-1.5 flex items-center gap-2'>
                <span className='inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-sm'>
                  ⭐ Best Option
                </span>
              </div>
            )}
          </div>
        </div>
        <div className='text-right'>
          <p className='text-3xl font-bold tabular-nums text-gray-900'>
            {route.totalEstimatedTime}
            <span className='text-base font-semibold text-gray-500'>min</span>
          </p>
        </div>
      </div>

      <div className='mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
        <div className='rounded-lg bg-white/80 p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Delay
          </p>
          <p className='mt-1 text-lg font-bold text-gray-900'>
            {route.delayMinutes > 0 ? `+${route.delayMinutes}m` : '—'}
          </p>
        </div>
        <div className='rounded-lg bg-white/80 p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Reliability
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              route.reliabilityScore >= 80
                ? 'text-green-600'
                : route.reliabilityScore >= 50
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {route.reliabilityScore}
            <span className='text-sm'>/100</span>
          </p>
        </div>
        <div className='rounded-lg bg-white/80 p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Alerts
          </p>
          <p className='mt-1 text-lg font-bold text-gray-900'>
            {route.alertSummary.length === 0
              ? '✓ None'
              : `⚠ ${route.alertSummary.length}`}
          </p>
        </div>
        <div className='rounded-lg bg-white/80 p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Next Arrival
          </p>
          <p className='mt-1 text-lg font-bold text-gray-900'>
            ~{Math.floor(route.totalEstimatedTime / 2)}m
          </p>
        </div>
      </div>

      {route.alertSummary.length > 0 && (
        <div className='mt-4 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4'>
          <div className='flex items-center justify-between'>
            <h4 className='flex items-center gap-2 text-sm font-bold text-yellow-900'>
              <span className='text-lg'>⚠️</span>
              Active Service Alerts
            </h4>
            <button
              onClick={() => setExpanded(!expanded)}
              className='text-xs font-semibold text-yellow-700 hover:text-yellow-900'
            >
              {expanded ? 'Hide' : 'Show'} Details
            </button>
          </div>
          {expanded && (
            <ul className='mt-3 space-y-2'>
              {route.alertSummary.map((alert, i) => (
                <li
                  key={i}
                  className='flex items-start gap-2 text-sm text-yellow-900'
                >
                  <span className='mt-0.5 shrink-0'>•</span>
                  <span className='font-medium'>{alert}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className='flex items-center justify-center py-16'>
      <div className='relative'>
        <div className='h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600' />
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='h-8 w-8 rounded-full bg-blue-100'></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('station-info'); // Default to station info
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [station, setStation] = useState('');
  const [data, setData] = useState<OptimizeRouteResponse | null>(null);
  const [stationData, setStationData] = useState<StationInfoResponse | null>(
    null,
  );
  const [stationModeFilter, setStationModeFilter] =
    useState<TransitMode>('all');
  const [selectedSubwayLines, setSelectedSubwayLines] = useState<string[]>([]);
  const [selectedCommuterLines, setSelectedCommuterLines] = useState<string[]>(
    [],
  );
  const [showLineFilters, setShowLineFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [transitMode, setTransitMode] = useState<TransitMode>('all');
  const [preference, setPreference] = useState<RoutePreference>('fastest');

  // Keep refs so the interval callback sees the latest values
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);
  const stationRef = useRef(station);
  const viewModeRef = useRef(viewMode);
  originRef.current = origin;
  destinationRef.current = destination;
  stationRef.current = station;
  viewModeRef.current = viewMode;

  const handleFetch = useCallback(async (o: string, d: string) => {
    setLoading(true);
    setError(null);
    setStationData(null);

    // Add 30-second timeout to prevent stuck loading
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timeout - Please try again')),
        30000,
      ),
    );

    try {
      const result = (await Promise.race([
        fetchOptimizedRoutes(o, d),
        timeoutPromise,
      ])) as OptimizeRouteResponse;
      setData(result);
      setAutoRefresh(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setAutoRefresh(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStationFetch = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    setData(null);

    // Add 30-second timeout to prevent stuck loading
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timeout - Please try again')),
        30000,
      ),
    );

    try {
      const result = (await Promise.race([
        fetchStationInfo(s),
        timeoutPromise,
      ])) as StationInfoResponse;
      setStationData(result);
      setAutoRefresh(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setAutoRefresh(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === 'station-info') {
      handleStationFetch(station);
    } else {
      handleFetch(origin, destination);
    }
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (viewModeRef.current === 'station-info') {
        handleStationFetch(stationRef.current);
      } else {
        handleFetch(originRef.current, destinationRef.current);
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [autoRefresh, handleFetch, handleStationFetch]);

  // When the station mode filter changes, clear the station input if the
  // currently selected station isn't available in the new suggestions.
  useEffect(() => {
    if (!station) return;
    const available = getAvailableStations();
    if (!available.includes(station)) {
      setStation('');
    }
  }, [stationModeFilter, selectedSubwayLines, selectedCommuterLines]);

  // Compute available stations based on filters
  const getAvailableStations = (): string[] => {
    // If line filters are active, use them
    if (selectedSubwayLines.length > 0 || selectedCommuterLines.length > 0) {
      const allSelectedLines = [
        ...selectedSubwayLines,
        ...selectedCommuterLines,
      ];
      return getStationsFromLines(allSelectedLines);
    }

    // Otherwise use mode filter
    if (stationModeFilter === 'subway') {
      return getAllSubwayStations();
    } else if (stationModeFilter === 'commuter') {
      return getAllCommuterRailStations();
    }

    // All stations
    return getAllStations();
  };

  const availableStations = getAvailableStations();

  const formattedTime = data
    ? new Date(data.lastUpdated).toLocaleTimeString()
    : stationData
      ? new Date(stationData.lastUpdated).toLocaleTimeString()
      : null;

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'>
      <main className='mx-auto max-w-5xl px-4 py-6 sm:py-10'>
        {/* Header */}
        <header className='mb-8 text-center'>
          <div className='inline-flex items-center gap-3 rounded-full bg-white px-6 py-2 shadow-lg ring-1 ring-black/5 mb-4'>
            <span className='text-3xl'>🚇</span>
            <span className='text-sm font-bold uppercase tracking-wider text-blue-600'>
              Live Transit Data
            </span>
          </div>
          <h1 className='text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl'>
            Massachusetts Transit
            <span className='block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600'>
              Optimizer
            </span>
          </h1>
          <p className='mt-4 text-lg text-gray-600 font-medium max-w-2xl mx-auto'>
            Real-time MBTA route optimization for ALL subway and commuter rail
            stations in Massachusetts
          </p>
        </header>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className='mb-8 rounded-2xl border-2 border-white bg-white/80 backdrop-blur-sm p-6 sm:p-8 shadow-2xl'
        >
          {/* View Mode Toggle */}
          <div className='mb-6'>
            <label className='mb-2 block text-sm font-semibold text-gray-700'>
              What would you like to do?
            </label>
            <div className='grid grid-cols-2 gap-2'>
              <button
                type='button'
                onClick={() => {
                  setViewMode('station-info');
                  setError(null);
                  setData(null);
                  setStationData(null);
                }}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-bold transition-all ${
                  viewMode === 'station-info'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                🚉 Station Departures
              </button>
              <button
                type='button'
                onClick={() => {
                  setViewMode('route-planning');
                  setError(null);
                  setData(null);
                  setStationData(null);
                }}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-bold transition-all ${
                  viewMode === 'route-planning'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                🗺️ Plan a Trip
              </button>
            </div>
          </div>

          {/* Station Info Mode */}
          {viewMode === 'station-info' && (
            <div className='mb-6'>
              <AutocompleteInput
                id='station'
                label='Station'
                value={station}
                onChange={setStation}
                placeholder='e.g., Quincy Center, South Station, Park Street'
                suggestions={availableStations}
              />
              <p className='mt-2 text-xs text-gray-500'>
                See all departures and arrivals for this station
              </p>
              {/* Quick mode selector so users see Subway/Commuter before fetching
                  Hidden after station results load to avoid duplicate controls */}
              {!stationData && (
                <>
                  <div className='mt-3'>
                    <label className='mb-2 block text-sm font-semibold text-gray-700'>
                      Transit Type
                    </label>
                    <div className='flex items-center gap-2'>
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'subway', label: 'Subway Only' },
                        { value: 'commuter', label: 'Commuter Rail Only' },
                      ].map((m) => (
                        <button
                          key={m.value}
                          type='button'
                          onClick={() => {
                            setStationModeFilter(m.value as TransitMode);
                            setSelectedSubwayLines([]);
                            setSelectedCommuterLines([]);
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                            stationModeFilter === m.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/10'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Filters Button */}
                  <div className='mt-3'>
                    <button
                      type='button'
                      onClick={() => setShowLineFilters(!showLineFilters)}
                      className='flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700'
                    >
                      <span>🔍</span>
                      <span>
                        {showLineFilters ? 'Hide' : 'Show'} Line Filters
                      </span>
                      <span className='text-xs text-gray-500'>
                        {selectedSubwayLines.length +
                          selectedCommuterLines.length >
                        0
                          ? `(${selectedSubwayLines.length + selectedCommuterLines.length} selected)`
                          : ''}
                      </span>
                    </button>
                  </div>

                  {/* Line Filter Panels */}
                  {showLineFilters && (
                    <div className='mt-4 space-y-3'>
                      {(stationModeFilter === 'all' ||
                        stationModeFilter === 'subway') && (
                        <LineFilterPanel
                          title='Subway Lines'
                          lines={SUBWAY_LINES}
                          selectedLineIds={selectedSubwayLines}
                          onToggleLine={(lineId) => {
                            setSelectedSubwayLines((prev) =>
                              prev.includes(lineId)
                                ? prev.filter((id) => id !== lineId)
                                : [...prev, lineId],
                            );
                          }}
                          onSelectAll={() =>
                            setSelectedSubwayLines(
                              SUBWAY_LINES.map((l) => l.id),
                            )
                          }
                          onClearAll={() => setSelectedSubwayLines([])}
                        />
                      )}
                      {(stationModeFilter === 'all' ||
                        stationModeFilter === 'commuter') && (
                        <LineFilterPanel
                          title='Commuter Rail Lines'
                          lines={COMMUTER_RAIL_LINES}
                          selectedLineIds={selectedCommuterLines}
                          onToggleLine={(lineId) => {
                            setSelectedCommuterLines((prev) =>
                              prev.includes(lineId)
                                ? prev.filter((id) => id !== lineId)
                                : [...prev, lineId],
                            );
                          }}
                          onSelectAll={() =>
                            setSelectedCommuterLines(
                              COMMUTER_RAIL_LINES.map((l) => l.id),
                            )
                          }
                          onClearAll={() => setSelectedCommuterLines([])}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Route Planning Mode */}
          {viewMode === 'route-planning' && (
            <>
              <div className='grid gap-6 sm:grid-cols-2 mb-6'>
                <AutocompleteInput
                  id='origin'
                  label='From'
                  value={origin}
                  onChange={setOrigin}
                  placeholder='e.g., Park Street, South Station'
                  suggestions={availableStations}
                />
                <AutocompleteInput
                  id='destination'
                  label='To'
                  value={destination}
                  onChange={setDestination}
                  placeholder='e.g., Harvard, Airport'
                  suggestions={availableStations}
                />
              </div>

              <div className='flex items-center justify-center mb-6'>
                <button
                  type='button'
                  onClick={handleSwap}
                  className='group flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 hover:scale-105'
                  title='Swap origin and destination'
                >
                  <span className='transform transition-transform group-hover:rotate-180'>
                    ⇅
                  </span>
                  Swap
                </button>
              </div>

              {/* Line Filters for Route Planning */}
              {!data && (
                <>
                  <div className='mb-4'>
                    <button
                      type='button'
                      onClick={() => setShowLineFilters(!showLineFilters)}
                      className='flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700'
                    >
                      <span>🔍</span>
                      <span>
                        {showLineFilters ? 'Hide' : 'Show'} Line Filters
                      </span>
                      <span className='text-xs text-gray-500'>
                        {selectedSubwayLines.length +
                          selectedCommuterLines.length >
                        0
                          ? `(${selectedSubwayLines.length + selectedCommuterLines.length} selected)`
                          : ''}
                      </span>
                    </button>
                  </div>

                  {showLineFilters && (
                    <div className='mb-6 space-y-3'>
                      <LineFilterPanel
                        title='Subway Lines'
                        lines={SUBWAY_LINES}
                        selectedLineIds={selectedSubwayLines}
                        onToggleLine={(lineId) => {
                          setSelectedSubwayLines((prev) =>
                            prev.includes(lineId)
                              ? prev.filter((id) => id !== lineId)
                              : [...prev, lineId],
                          );
                        }}
                        onSelectAll={() =>
                          setSelectedSubwayLines(SUBWAY_LINES.map((l) => l.id))
                        }
                        onClearAll={() => setSelectedSubwayLines([])}
                      />
                      <LineFilterPanel
                        title='Commuter Rail Lines'
                        lines={COMMUTER_RAIL_LINES}
                        selectedLineIds={selectedCommuterLines}
                        onToggleLine={(lineId) => {
                          setSelectedCommuterLines((prev) =>
                            prev.includes(lineId)
                              ? prev.filter((id) => id !== lineId)
                              : [...prev, lineId],
                          );
                        }}
                        onSelectAll={() =>
                          setSelectedCommuterLines(
                            COMMUTER_RAIL_LINES.map((l) => l.id),
                          )
                        }
                        onClearAll={() => setSelectedCommuterLines([])}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Transit Mode Selector - Only show for route planning */}
          {viewMode === 'route-planning' && (
            <>
              <div className='mb-6'>
                <label className='mb-2 block text-sm font-semibold text-gray-700'>
                  Transit Mode
                </label>
                <div className='flex flex-wrap gap-2'>
                  {[
                    { value: 'all', label: '🚇 All Transit', emoji: '🚇' },
                    { value: 'subway', label: '🚊 Subway Only', emoji: '🚊' },
                    {
                      value: 'commuter',
                      label: '🚆 Commuter Rail Only',
                      emoji: '🚆',
                    },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type='button'
                      onClick={() => setTransitMode(mode.value as TransitMode)}
                      className={`flex-1 min-w-[100px] rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all ${
                        transitMode === mode.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/20'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Route Preference */}
              <div className='mb-6'>
                <label className='mb-2 block text-sm font-semibold text-gray-700'>
                  Route Preference
                </label>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  {[
                    { value: 'fastest', label: '⚡ Fastest', icon: '⚡' },
                    {
                      value: 'least-transfers',
                      label: '🔄 Least Transfers',
                      icon: '🔄',
                    },
                    {
                      value: 'most-reliable',
                      label: '✓ Most Reliable',
                      icon: '✓',
                    },
                    { value: 'accessible', label: '♿ Accessible', icon: '♿' },
                  ].map((pref) => (
                    <button
                      key={pref.value}
                      type='button'
                      onClick={() =>
                        setPreference(pref.value as RoutePreference)
                      }
                      className={`rounded-lg border-2 px-3 py-2.5 text-xs font-bold transition-all sm:text-sm ${
                        preference === pref.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {pref.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            type='submit'
            disabled={loading}
            className='w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:from-blue-600 disabled:hover:to-indigo-600'
          >
            {loading ? (
              <span className='flex items-center justify-center gap-2'>
                <span className='h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent' />
                {viewMode === 'station-info'
                  ? 'Loading Station Info...'
                  : 'Finding Best Routes...'}
              </span>
            ) : (
              <span className='flex items-center justify-center gap-2'>
                <span className='text-xl'>
                  {viewMode === 'station-info' ? '🚉' : '🔍'}
                </span>
                {viewMode === 'station-info'
                  ? 'View Station Departures'
                  : 'Find Best Routes'}
              </span>
            )}
          </button>
        </form>

        {/* Error state */}
        {error && (
          <div className='mb-8 rounded-xl border-2 border-red-300 bg-red-50 px-6 py-4 shadow-lg'>
            <div className='flex items-start gap-3'>
              <span className='text-2xl'>❌</span>
              <div>
                <p className='font-bold text-red-900'>Error</p>
                <p className='mt-1 text-sm text-red-700'>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && !stationData && <Spinner />}

        {/* Station Departures Results */}
        {stationData && (
          <section>
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white/80 backdrop-blur-sm px-6 py-4 shadow-lg'>
              <div className='flex items-center gap-3'>
                <span className='flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xl'>
                  🚉
                </span>
                <div>
                  <p className='text-sm font-semibold text-gray-500'>
                    Departures from
                  </p>
                  <p className='text-2xl font-bold text-gray-900'>
                    {stationData.stationName}
                  </p>
                </div>
              </div>
              {formattedTime && autoRefresh && (
                <div className='flex items-center gap-2'>
                  <div className='flex h-2.5 w-2.5 items-center justify-center'>
                    <span className='absolute h-2.5 w-2.5 animate-ping rounded-full bg-green-400 opacity-75'></span>
                    <span className='relative h-2 w-2 rounded-full bg-green-500'></span>
                  </div>
                  <div className='text-right'>
                    <p className='text-xs font-semibold text-gray-500'>
                      Last Updated
                    </p>
                    <p className='text-sm font-bold tabular-nums text-gray-900'>
                      {formattedTime}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* Mode Tabs */}
            <div className='mb-4 flex items-center gap-2'>
              {[
                { value: 'all', label: 'All' },
                { value: 'subway', label: 'Subway' },
                { value: 'commuter', label: 'Commuter Rail' },
              ].map((m) => (
                <button
                  key={m.value}
                  type='button'
                  onClick={() => setStationModeFilter(m.value as TransitMode)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-all ${
                    {
                      all: 'border-gray-200 bg-white text-gray-700',
                    }[m.value] ?? 'border-gray-200 bg-white text-gray-700'
                  } ${
                    stationModeFilter === m.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/10'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Alerts */}
            {stationData.alerts.length > 0 && (
              <div className='mb-6 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-6 shadow-lg'>
                <h3 className='flex items-center gap-2 text-lg font-bold text-yellow-900 mb-4'>
                  <span className='text-2xl'>⚠️</span>
                  Active Service Alerts
                </h3>
                <div className='space-y-3'>
                  {stationData.alerts.map((alert, i) => (
                    <div key={i} className='rounded-lg bg-white/80 p-4'>
                      <p className='font-bold text-yellow-900'>
                        {alert.header}
                      </p>
                      <p className='mt-1 text-sm text-yellow-800'>
                        Effect: {alert.effect}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Departures Board */}
            <div className='rounded-xl border-2 border-white bg-white/80 backdrop-blur-sm p-6 shadow-2xl'>
              <h3 className='text-xl font-bold text-gray-900 mb-4 flex items-center gap-2'>
                <span>📅</span>
                Next Departures
              </h3>
              {stationData.departures.length > 0 ? (
                <div className='space-y-2'>
                  {stationData.departures
                    .filter((d) =>
                      stationModeFilter === 'all'
                        ? true
                        : stationModeFilter === 'subway'
                          ? d.mode === 'subway' || d.mode === 'light-rail'
                          : d.mode === 'commuter',
                    )
                    .map((departure, i) => (
                      <div
                        key={i}
                        className='flex items-center justify-between gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md'
                      >
                        <div className='flex-1'>
                          <p className='font-bold text-gray-900'>
                            {departure.routeName}
                          </p>
                          <p className='text-sm text-gray-600'>
                            to {departure.destination}
                          </p>
                        </div>
                        <div className='text-right'>
                          <p
                            className={`text-2xl font-bold tabular-nums ${
                              departure.minutesAway === 0
                                ? 'text-red-600'
                                : departure.minutesAway <= 5
                                  ? 'text-orange-600'
                                  : 'text-gray-900'
                            }`}
                          >
                            {departure.minutesAway === 0
                              ? 'Now'
                              : departure.minutesAway === 1
                                ? '1 min'
                                : `${departure.minutesAway} mins`}
                          </p>
                          {departure.status && (
                            <p className='text-xs text-gray-500 mt-1'>
                              {departure.status}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className='text-center py-8'>
                  <span className='text-6xl'>🤷</span>
                  <p className='mt-4 text-lg font-bold text-gray-900'>
                    No upcoming departures
                  </p>
                  <p className='mt-2 text-gray-500'>
                    Check back later or try a different station
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Route Planning Results */}
        {data && (
          <section>
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white/80 backdrop-blur-sm px-6 py-4 shadow-lg'>
              <div className='flex items-center gap-3'>
                <span className='flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xl'>
                  📊
                </span>
                <div>
                  <p className='text-sm font-semibold text-gray-500'>
                    Routes Found
                  </p>
                  <p className='text-2xl font-bold text-gray-900'>
                    {data.routes.length}
                  </p>
                </div>
              </div>
              {formattedTime && autoRefresh && (
                <div className='flex items-center gap-2'>
                  <div className='flex h-2.5 w-2.5 items-center justify-center'>
                    <span className='absolute h-2.5 w-2.5 animate-ping rounded-full bg-green-400 opacity-75'></span>
                    <span className='relative h-2 w-2 rounded-full bg-green-500'></span>
                  </div>
                  <div className='text-right'>
                    <p className='text-xs font-semibold text-gray-500'>
                      Last Updated
                    </p>
                    <p className='text-sm font-bold tabular-nums text-gray-900'>
                      {formattedTime}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className='space-y-5'>
              {data.routes.map((route, i) => (
                <RouteCard
                  key={route.routeName}
                  route={route}
                  rank={i + 1}
                  isBest={i === 0}
                />
              ))}
            </div>

            {data.routes.length === 0 && (
              <div className='rounded-2xl border-2 border-gray-200 bg-white p-12 text-center shadow-lg'>
                <span className='text-6xl'>🤷</span>
                <p className='mt-4 text-xl font-bold text-gray-900'>
                  No routes available
                </p>
                <p className='mt-2 text-gray-500'>
                  Try different stations or check back shortly
                </p>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className='mt-12 border-t-2 border-white/50 pt-8 text-center'>
          <div className='mx-auto max-w-2xl rounded-xl bg-white/60 backdrop-blur-sm px-6 py-4 shadow-lg'>
            <p className='text-sm font-medium text-gray-600'>
              Powered by real-time{' '}
              <a
                href='https://www.mbta.com/developers/v3-api'
                target='_blank'
                rel='noopener noreferrer'
                className='font-bold text-blue-600 hover:text-blue-700 hover:underline'
              >
                MBTA V3 API
              </a>
            </p>
            <p className='mt-1 text-xs text-gray-500'>
              Auto-refreshes every 30 seconds • Live vehicle tracking • Service
              alerts
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
