const API = 'http://localhost:8080/api';
async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const N = 120;
  const email = `ortools-${Date.now()}@example.com`;
  const { token } = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'password123' }) });
  const H = { Authorization: `Bearer ${token}` };

  // Dense grid around San Francisco Bay (lat/lng manual -> skips geocoding).
  const stops = [];
  const baseLat = 37.77, baseLng = -122.42;
  let idx = 0;
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 10; c++) {
      stops.push({
        address: `Grid stop ${++idx}`,
        lat: baseLat + r * 0.004 + (Math.random() - 0.5) * 0.002,
        lng: baseLng + c * 0.006 + (Math.random() - 0.5) * 0.002,
      });
    }
  }

  const { id } = await req('/jobs', { method: 'POST', headers: H, body: JSON.stringify({ name: 'OR-Tools 120 stop test', stops }) });
  console.log('✓ job created', id, 'stops:', stops.length);

  const started = Date.now();
  let job;
  while (Date.now() - started < 240_000) {
    const d = await req(`/jobs/${id}`, { headers: H });
    job = d.job;
    if (['done', 'failed'].includes(job.status)) break;
    await sleep(3000);
  }
  console.log('✓ final status:', job.status, '| phase:', job.phase, '| progress:', job.progress);
  if (job.status === 'failed') { console.error('✗ JOB FAILED:', job.error); process.exit(1); }

  const { result } = await req(`/jobs/${id}/result`, { headers: H });
  console.log('✓ ordered stops:', result.ordered_stops.length);
  console.log('✓ total distance:', result.total_distance_km.toFixed(1), 'km,', result.total_duration_min.toFixed(0), 'min');
  console.log('✓ turn steps:', result.steps.length, '| geometry points:', result.geometry.length);
  console.log('OR-TOOLS PATH PASS');
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
