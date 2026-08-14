export interface User {
  id: string;
  email: string;
}

export interface Stop {
  id: string;
  input_index: number;
  label: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  geocode_status: 'pending' | 'ok' | 'not_found' | 'failed' | 'manual';
  geocode_confidence: number | null;
}

export type JobStatus =
  | 'uploaded'
  | 'geocoding'
  | 'geocoded'
  | 'matrix'
  | 'optimizing'
  | 'routing'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface Job {
  id: string;
  name: string;
  country: string;
  start_address: string;
  status: JobStatus;
  phase: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  total_stops: number;
  total_distance_km: number | null;
  total_duration_min: number | null;
  created_at: string;
  updated_at: string;
}

export interface JobDetail {
  job: Job;
  stops: Stop[];
}

export interface RouteStep {
  stop_index: number;
  type: 'turn' | 'arrive' | 'depart';
  instruction: string;
  name?: string;
  distance_m?: number;
  duration_s?: number;
  maneuver?: string;
  modifier?: string;
}

export interface RouteLeg {
  from: number;
  to: number;
  distance_m: number;
  duration_s: number;
}

export interface JobResult {
  ordered_stops: { stopId: string; order: number }[];
  geometry: [number, number][];
  steps: RouteStep[];
  legs: RouteLeg[];
  stops: Stop[];
  total_distance_km: number;
  total_duration_min: number;
}

export interface StepsResponse {
  steps: RouteStep[];
  legs: RouteLeg[];
  total: number;
  total_distance_km: number;
  total_duration_min: number;
  offset: number;
  limit: number;
}
