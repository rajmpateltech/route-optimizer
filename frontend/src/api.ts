import type { Job, JobDetail, JobResult, StepsResponse, User } from './types';

const API = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'routeoptimizer.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    window.dispatchEvent(new Event('routeoptimizer:authed'));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('routeoptimizer:unauthorized'));
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    setToken(null);
    window.dispatchEvent(new Event('routeoptimizer:unauthorized'));
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  login(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return request<{ user: User }>('/auth/me');
  },
  listJobs() {
    return request<{ jobs: Job[] }>('/jobs');
  },
  createJob(name: string, stops: unknown[], country?: string, startAddress?: string) {
    return request<{ id: string }>('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        name,
        stops,
        country: country || '',
        start_address: startAddress || '',
      }),
    });
  },
  getJob(id: string) {
    return request<JobDetail>(`/jobs/${id}`);
  },
  deleteJob(id: string) {
    return request<void>(`/jobs/${id}`, { method: 'DELETE' });
  },
  getResult(id: string) {
    return request<{ status: string; result: JobResult | null }>(`/jobs/${id}/result`);
  },
  getSteps(id: string, offset = 0, limit = 200) {
    return request<StepsResponse>(`/jobs/${id}/steps?offset=${offset}&limit=${limit}`);
  },
};

export async function uploadCsv(
  file: File,
  name: string,
  country?: string,
  startAddress?: string,
): Promise<{ id: string }> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('country', country || '');
  form.append('start_address', startAddress || '');
  const res = await fetch(`${API}/jobs/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || 'Upload failed');
  }
  return res.json();
}

export function downloadFile(id: string, format: 'csv' | 'gpx' | 'kml' | 'json'): void {
  const token = getToken();
  fetch(`${API}/jobs/${id}/export/${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `route.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
    });
}
