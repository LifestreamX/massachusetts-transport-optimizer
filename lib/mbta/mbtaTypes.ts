/**
 * Type definitions for MBTA V3 JSON:API responses.
 * Only the fields we actually consume are typed.
 */

/* ------------------------------------------------------------------ */
/*  Generic JSON:API envelope                                          */
/* ------------------------------------------------------------------ */

export interface JsonApiEnvelope<T> {
  data: T[];
}

/* ------------------------------------------------------------------ */
/*  /routes                                                            */
/* ------------------------------------------------------------------ */

export interface MbtaRouteAttributes {
  long_name: string;
  short_name: string;
  type: number; // 0=LightRail, 1=HeavyRail, 2=CommuterRail, 3=Bus, 4=Ferry
  description: string;
  direction_names: string[];
  direction_destinations: string[];
}

export interface MbtaRouteResource {
  id: string;
  type: 'route';
  attributes: MbtaRouteAttributes;
}

export type MbtaRoutesResponse = JsonApiEnvelope<MbtaRouteResource>;

/* ------------------------------------------------------------------ */
/*  /predictions                                                       */
/* ------------------------------------------------------------------ */

export interface MbtaPredictionAttributes {
  arrival_time: string | null;
  departure_time: string | null;
  direction_id: number;
  status: string | null;
  schedule_relationship: string | null;
}

export interface MbtaPredictionRelationships {
  route: { data: { id: string; type: 'route' } | null };
  stop: { data: { id: string; type: 'stop' } | null };
}

export interface MbtaPredictionResource {
  id: string;
  type: 'prediction';
  attributes: MbtaPredictionAttributes;
  relationships: MbtaPredictionRelationships;
}

export type MbtaPredictionsResponse = JsonApiEnvelope<MbtaPredictionResource>;

/* ------------------------------------------------------------------ */
/*  /alerts                                                            */
/* ------------------------------------------------------------------ */

export interface MbtaAlertAttributes {
  header: string;
  description: string | null;
  severity: number;
  effect: string;
  lifecycle: string;
  active_period: { start: string; end: string | null }[];
  informed_entity: {
    route?: string;
    route_type?: number;
    stop?: string;
    direction_id?: number | null;
  }[];
}

export interface MbtaAlertResource {
  id: string;
  type: 'alert';
  attributes: MbtaAlertAttributes;
}

export type MbtaAlertsResponse = JsonApiEnvelope<MbtaAlertResource>;

/* ------------------------------------------------------------------ */
/*  /vehicles                                                          */
/* ------------------------------------------------------------------ */

export interface MbtaVehicleAttributes {
  current_status: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
  speed: number | null;
  latitude: number;
  longitude: number;
  direction_id: number;
  updated_at: string;
}

export interface MbtaVehicleRelationships {
  route: { data: { id: string; type: 'route' } | null };
  stop: { data: { id: string; type: 'stop' } | null };
}

export interface MbtaVehicleResource {
  id: string;
  type: 'vehicle';
  attributes: MbtaVehicleAttributes;
  relationships: MbtaVehicleRelationships;
}

export type MbtaVehiclesResponse = JsonApiEnvelope<MbtaVehicleResource>;

/* ------------------------------------------------------------------ */
/*  /stops                                                             */
/* ------------------------------------------------------------------ */

export interface MbtaStopAttributes {
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  wheelchair_boarding: number; // 0=no info, 1=accessible, 2=not accessible
  platform_name: string | null;
  platform_code: string | null;
  address: string | null;
}

export interface MbtaStopRelationships {
  parent_station: { data: { id: string; type: 'stop' } | null };
  child_stops: { data: { id: string; type: 'stop' }[] };
}

export interface MbtaStopResource {
  id: string;
  type: 'stop';
  attributes: MbtaStopAttributes;
  relationships?: MbtaStopRelationships;
}

export type MbtaStopsResponse = JsonApiEnvelope<MbtaStopResource>;

/* ------------------------------------------------------------------ */
/*  /schedules                                                         */
/* ------------------------------------------------------------------ */

export interface MbtaScheduleAttributes {
  arrival_time: string | null;
  departure_time: string | null;
  direction_id: number;
  drop_off_type: number;
  pickup_type: number;
  stop_sequence: number;
  timepoint: boolean;
}

export interface MbtaScheduleRelationships {
  route: { data: { id: string; type: 'route' } | null };
  stop: { data: { id: string; type: 'stop' } | null };
  trip: { data: { id: string; type: 'trip' } | null };
}

export interface MbtaScheduleResource {
  id: string;
  type: 'schedule';
  attributes: MbtaScheduleAttributes;
  relationships: MbtaScheduleRelationships;
}

export type MbtaSchedulesResponse = JsonApiEnvelope<MbtaScheduleResource>;

/* ------------------------------------------------------------------ */
/*  /trips                                                             */
/* ------------------------------------------------------------------ */

export interface MbtaTripAttributes {
  headsign: string;
  direction_id: number;
  wheelchair_accessible: number;
  bikes_allowed: number;
  block_id: string | null;
  name: string;
}

export interface MbtaTripRelationships {
  route: { data: { id: string; type: 'route' } | null };
  service: { data: { id: string; type: 'service' } | null };
  shape: { data: { id: string; type: 'shape' } | null };
}

export interface MbtaTripResource {
  id: string;
  type: 'trip';
  attributes: MbtaTripAttributes;
  relationships: MbtaTripRelationships;
}

export type MbtaTripsResponse = JsonApiEnvelope<MbtaTripResource>;
