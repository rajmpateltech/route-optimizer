export interface AuthUser {
  id: string;
  email: string;
}

export type GeocodeStatus = 'pending' | 'ok' | 'not_found' | 'failed' | 'manual';

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

export interface StopRow {
  id: string;
  job_id: string;
  input_index: number;
  label: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  geocode_status: GeocodeStatus;
  geocode_confidence: number | null;
}

export interface StopInput {
  address: string;
  label?: string;
  lat?: number;
  lng?: number;
}

export interface JobRow {
  id: string;
  user_id: string;
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
  created_at: Date;
  updated_at: Date;
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
  total_distance_km: number;
  total_duration_min: number;
}

export interface JobProgress {
  status: JobStatus;
  phase: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  total_distance_km: number | null;
  total_duration_min: number | null;
}
