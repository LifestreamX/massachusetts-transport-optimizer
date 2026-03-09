'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OptimizeRouteResponse,
  ApiErrorResponse,
  RouteOption,
  ViewMode,
  TransitMode,
  RoutePreference,
} from '@/types/routeTypes';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds for live updates (reduced request volume)

// Dynamic station list state
type Station = {
  id: string;
  name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  wheelchair_boarding?: number;
  platform_name?: string;
  address?: string;
  lines?: string[];
};

type Line = {
  id: string;
  name: string;
  shortName: string;
  type: 'subway' | 'commuter';
  description?: string;
  directionNames?: string[];
  directionDestinations?: string[];
  color: string;
};

// Fetch optimized routes from the backend
async function fetchOptimizedRoutes(
  origin: string,
  destination: string,
  preference: string,
  transitMode?: string,
): Promise<OptimizeRouteResponse> {
  const res = await fetch('/api/optimize-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, preference, transitMode }),
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as OptimizeRouteResponse;
}

// Station info endpoint and logic removed - keeping route-planning only

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
  lines: Line[];
  selectedLineIds: string[];
  onToggleLine: (lineId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  title: string;
}) {
  return (
    <div>
      <div className='flex gap-2'>
        <button
          type='button'
          onClick={onSelectAll}
          className='text-xs font-semibold text-primary dark:text-primary hover:text-primary dark:hover:text-primary'
        >
          All
        </button>
        <span className='text-foreground/60 dark:text-foreground/70'>|</span>
        <button
          type='button'
          onClick={onClearAll}
          className='text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200'
        >
          Clear
        </button>
      </div>
      <div className='flex flex-wrap gap-2'>
        {lines.map((line: Line) => (
          <button
            key={line.id}
            type='button'
            onClick={() => onToggleLine(line.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
              selectedLineIds.includes(line.id)
                ? 'shadow-md ring-2 ring-offset-1 text-white'
                : 'opacity-80 hover:opacity-95 text-foreground/70 dark:text-foreground/60 bg-gray-100 dark:bg-gray-800'
            }`}
            style={{
              backgroundColor: selectedLineIds.includes(line.id)
                ? line.color
                : undefined,
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

  // Only close dropdown if suggestions list changes and input is not focused
  useEffect(() => {
    const inputEl = wrapperRef.current?.querySelector('input');
    if (document.activeElement !== inputEl) {
      setShowSuggestions(false);
    }
  }, [suggestions]);

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
      <div className='mb-1.5 flex items-center justify-between'>
        <label
          htmlFor={id}
          className='block text-sm font-semibold text-foreground dark:text-white'
        >
          {label}
        </label>
        <button
          type='button'
          onClick={() => {
            setFilteredSuggestions(suggestions.slice(0, 500));
            setShowSuggestions(true);
            // focus the input so keyboard works immediately
            const inputEl = wrapperRef.current?.querySelector(
              'input',
            ) as HTMLInputElement | null;
            inputEl?.focus();
          }}
          className='text-xs font-semibold text-primary dark:text-primary hover:underline ml-3'
        >
          Show all
        </button>
      </div>
      <div className='relative'>
        <input
          id={id}
          type='text'
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() =>
            value.length > 0 &&
            filteredSuggestions.length > 0 &&
            setShowSuggestions(true)
          }
          required
          autoComplete='off'
          className='w-full rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-background text-foreground px-4 py-3 text-sm font-medium shadow-sm transition-all placeholder:text-foreground/60 dark:placeholder:text-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20'
        />
        <div className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 dark:text-foreground/70'>
          📍
        </div>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className='absolute left-0 right-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-background text-foreground shadow-2xl'>
          {filteredSuggestions.map((suggestion, i) => (
            <li key={i}>
              <button
                type='button'
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click
                  onChange(suggestion);
                  setShowSuggestions(false);
                }}
                className='w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-primary/10 dark:hover:bg-primary hover:text-primary dark:hover:text-primary'
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
  const [alertsOpen, setAlertsOpen] = useState(false);
  // Simplified, robust RouteCard implementation to avoid parser issues
  return (
    <div
      className={
        isBest
          ? 'rounded-2xl border-2 p-6 border-primary bg-gradient-to-br from-primary/10 to-indigo-50 shadow-xl'
          : 'rounded-2xl border-2 p-6 border-gray-200 bg-background text-foreground shadow-md'
      }
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='flex items-center gap-4 flex-1'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold shadow-md bg-gray-200 dark:bg-gray-700'>
            {rank}
          </div>
          <div className='flex-1'>
            <h3 className='text-xl font-bold leading-tight text-foreground'>
              {route.routeName}
            </h3>
            {isBest && (
              <div className='mt-1.5 flex items-center gap-2'>
                <span className='inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-sm'>
                  ⭐ Best Option
                </span>
              </div>
            )}
          </div>
        </div>
        <div className='text-right'>
          <p className='text-3xl font-bold tabular-nums text-foreground'>
            {route.totalEstimatedTime}
            <span className='text-base font-semibold text-gray-500'>min</span>
          </p>
        </div>
      </div>

      <div className='mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
        <div className='rounded-lg bg-background/80 text-foreground p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Delay
          </p>
          <p className='mt-1 text-lg font-bold text-gray-900'>
            {route.delayMinutes > 0 ? `+${route.delayMinutes}m` : '—'}
          </p>
        </div>

        <div className='rounded-lg bg-background/80 text-foreground p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Reliability
          </p>
          <p
            className={`mt-1 text-lg font-bold ${route.reliabilityScore >= 80 ? 'text-green-600' : route.reliabilityScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}
          >
            {route.reliabilityScore}
            <span className='text-sm'>/100</span>
          </p>
        </div>

        <div className='rounded-lg bg-background/80 text-foreground p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Alerts
          </p>
          <div className='mt-1 flex items-center justify-between'>
            <p className='text-lg font-bold text-foreground'>
              {route.alertSummary.length === 0
                ? '✓ None'
                : `⚠ ${route.alertSummary.length}`}
            </p>
            {route.alertSummary.length > 0 && (
              <button
                type='button'
                onClick={() => setAlertsOpen((s) => !s)}
                className='ml-3 text-xs font-semibold text-primary dark:text-primary hover:underline'
              >
                {alertsOpen ? 'Hide' : 'View alerts'}
              </button>
            )}
          </div>
        </div>

        <div className='rounded-lg bg-background/80 text-foreground p-3 shadow-sm'>
          <p className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
            Next Arrival
          </p>
          <p className='mt-1 text-lg font-bold'>
            {route.nextArrivalMinutes !== undefined
              ? `in ${route.nextArrivalMinutes}m`
              : route.nextArrivalISO
                ? new Date(route.nextArrivalISO).toLocaleTimeString()
                : '—'}
          </p>
        </div>
      </div>
      {alertsOpen && route.alertSummary.length > 0 && (
        <div className='mt-4 rounded-lg border border-gray-200 bg-background p-3 text-sm text-foreground'>
          <h4 className='mb-2 text-sm font-semibold'>Active alerts</h4>
          <ul className='list-disc list-inside space-y-1'>
            {route.alertSummary.map((a, i) => (
              <li key={i} className='break-words'>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className='flex items-center justify-center py-16'>
      <div className='relative'>
        <div className='h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-primary' />
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='h-8 w-8 rounded-full bg-primary/10'></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('route-planning');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [data, setData] = useState<OptimizeRouteResponse | null>(null);
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
  originRef.current = origin;
  destinationRef.current = destination;

  const handleFetch = useCallback(
    async (o: string, d: string) => {
      setLoading(true);
      setError(null);
      setData(null);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout - Please try again')),
          65000,
        ),
      );
      try {
        const result = (await Promise.race([
          fetchOptimizedRoutes(o, d, preference, transitMode),
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
    },
    [preference, transitMode],
  );

  // Station-fetch removed; route-planning only

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFetch(origin, destination);
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
      handleFetch(originRef.current, destinationRef.current);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [autoRefresh, handleFetch]);

  // Keep line filters synchronized with transit mode: clear selections
  // for the modes that are not visible so hidden filters don't remain applied.
  useEffect(() => {
    if (transitMode === 'subway') {
      setSelectedCommuterLines([]);
    } else if (transitMode === 'commuter') {
      setSelectedSubwayLines([]);
    }
  }, [transitMode]);

  // Dynamic station list
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState<string | null>(null);

  // Dynamic line list
  const [lines, setLines] = useState<Line[]>([]);
  const [linesLoading, setLinesLoading] = useState(true);
  const [linesError, setLinesError] = useState<string | null>(null);

  // Fallback static data for stations and lines if API fails or returns 'PRO FEATURE ONLY'
  useEffect(() => {
    setStationsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    fetch('/api/stations', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeoutId);
        setStations(data.stations || []);
        setStationsLoading(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setStations([]);
        setStationsLoading(false);
      });
  }, []);

  useEffect(() => {
    setLinesLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    fetch('/api/lines', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeoutId);
        setLines(data.lines || []);
        setLinesLoading(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setLines([]);
        setLinesLoading(false);
      });
  }, []);

  // Compute available stations based on selected transit mode
  const subwayLineIds = lines
    .filter((l) => l.type === 'subway')
    .map((l) => l.id);
  const commuterLineIds = lines
    .filter((l) => l.type === 'commuter')
    .map((l) => l.id);

  // Assume each station has a lines: string[] property listing served line IDs (add this to station API if not present)
  let filteredStations: Station[] = stations;
  if (transitMode === 'subway') {
    filteredStations = stations.filter((s: any) =>
      s.lines?.some((lineId: string) => subwayLineIds.includes(lineId)),
    );
  } else if (transitMode === 'commuter') {
    filteredStations = stations.filter((s: any) =>
      s.lines?.some((lineId: string) => commuterLineIds.includes(lineId)),
    );
  }

  // Apply line filters if any are selected
  const allSelectedLines = [...selectedSubwayLines, ...selectedCommuterLines];
  if (allSelectedLines.length > 0) {
    filteredStations = filteredStations.filter((s: any) =>
      s.lines?.some((lineId: string) => allSelectedLines.includes(lineId)),
    );
  }

  const availableStations = filteredStations.map((s) => s.name);

  // Split lines by type for UI
  const subwayLines = lines.filter((l) => l.type === 'subway');
  const commuterRailLines = lines.filter((l) => l.type === 'commuter');

  // If stations or lines are loading or errored, show appropriate UI in the form
  if (stationsLoading || linesLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background text-foreground'>
        <Spinner />
        <span className='ml-4 text-lg font-semibold'>Loading…</span>
      </div>
    );
  }
  if (stationsError || linesError) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background text-foreground'>
        <div className='rounded-xl border-2 border-red-300 bg-red-50 px-6 py-4 shadow-lg'>
          <p className='text-lg font-bold text-red-700'>
            {stationsError || linesError}
          </p>
        </div>
      </div>
    );
  }

  const formattedTime = data
    ? new Date(data.lastUpdated).toLocaleTimeString()
    : null;

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <main className='mx-auto max-w-5xl px-4 py-6 sm:py-10'>
        {/* Header */}
        <header className='mb-8 text-center'>
          <div className='inline-flex items-center gap-3 rounded-full bg-background text-foreground px-6 py-2 shadow-lg ring-1 ring-black/5 mb-4'>
            <span className='text-3xl'>🚇</span>
            <span className='text-sm font-bold uppercase tracking-wider text-primary'>
              Live Transit Data
            </span>
          </div>
          <h1 className='text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl'>
            Massachusetts Transit
            <span className='block text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-600'>
              Optimizer
            </span>
          </h1>
          <p className='mt-4 text-lg text-foreground/80 font-medium max-w-2xl mx-auto'>
            Real-time MBTA route optimization for ALL subway and commuter rail
            stations in Massachusetts
          </p>
        </header>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className='mb-8 rounded-2xl border-2 border-white bg-background/80 text-foreground backdrop-blur-sm p-6 sm:p-8 shadow-2xl'
        >
          {/* View Mode Toggle */}
          <div className='mb-6'>
            <label className='mb-2 block text-sm font-semibold text-foreground dark:text-white'>
              What would you like to do?
            </label>
            <div className='flex items-center gap-3'>
              <span className='text-xl'>🗺️</span>
              <p className='text-sm font-semibold text-foreground dark:text-white'>
                Plan a Trip
              </p>
            </div>
          </div>

          {/* Station Departures removed - route-planning only */}

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
                  className='group flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-white transition-all hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
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
                      className='flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary'
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
                      {(transitMode === 'all' || transitMode === 'subway') && (
                        <LineFilterPanel
                          title='Subway Lines'
                          lines={subwayLines}
                          selectedLineIds={selectedSubwayLines}
                          onToggleLine={(lineId) => {
                            setSelectedSubwayLines((prev) =>
                              prev.includes(lineId)
                                ? prev.filter((id) => id !== lineId)
                                : [...prev, lineId],
                            );
                          }}
                          onSelectAll={() =>
                            setSelectedSubwayLines(subwayLines.map((l) => l.id))
                          }
                          onClearAll={() => setSelectedSubwayLines([])}
                        />
                      )}

                      {(transitMode === 'all' ||
                        transitMode === 'commuter') && (
                        <LineFilterPanel
                          title='Commuter Rail Lines'
                          lines={commuterRailLines}
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
                              commuterRailLines.map((l) => l.id),
                            )
                          }
                          onClearAll={() => setSelectedCommuterLines([])}
                        />
                      )}
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
                <label className='mb-2 block text-sm font-semibold text-foreground dark:text-white'>
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
                          ? 'border-primary bg-primary/10 dark:bg-primary text-primary dark:text-white shadow-md ring-2 ring-primary/20'
                          : 'border-gray-200 bg-white dark:bg-gray-800 text-gray-700 dark:text-foreground hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Route Preference */}
              <div className='mb-6'>
                <label className='mb-2 block text-sm font-semibold text-foreground dark:text-white'>
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
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-white shadow-md'
                          : 'border-gray-200 bg-white dark:bg-gray-800 text-gray-700 dark:text-foreground hover:border-gray-300 dark:hover:border-gray-700'
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
            className='w-full rounded-xl bg-gradient-to-r from-primary to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg transition-all hover:from-primary hover:to-indigo-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:from-primary disabled:hover:to-indigo-600'
          >
            {loading ? (
              <span className='flex items-center justify-center gap-2'>
                <span className='h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent' />
                Finding Best Routes...
              </span>
            ) : (
              <span className='flex items-center justify-center gap-2'>
                <span className='text-xl'>🔍</span>
                Find Best Routes
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
        {loading && !data && <Spinner />}

        {/* Station Departures removed */}

        {/* Route Planning Results */}
        {data && (
          <section>
            {/* Notice removed: always show all available routes, no fallback warning */}
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white/80 backdrop-blur-sm px-6 py-4 shadow-lg'>
              <div className='flex items-center gap-3'>
                <span className='flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xl'>
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
                  key={route.routeName + '-' + (route.nextArrivalMinutes ?? i)}
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
          <div className='mx-auto max-w-2xl px-6 py-4'>
            {/* Footer attribution and styling removed for portfolio presentation */}
          </div>
        </footer>
      </main>
    </div>
  );
}
