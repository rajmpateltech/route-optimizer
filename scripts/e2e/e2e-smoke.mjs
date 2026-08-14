const API = 'http://localhost:8080/api';

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const email = `e2e-${Date.now()}@example.com`;
  const { token } = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'password123' }) });
  console.log('✓ registered + token', token.slice(0, 16), '…');
  const H = { Authorization: `Bearer ${token}` };

  const { id } = await req('/jobs', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      name: 'E2E smoke test',
      stops: [
        { address: '1600 Amphitheatre Parkway, Mountain View, CA' },
        { address: '1355 Market St, San Francisco, CA' },
        { address: '1 Infinite Loop, Cupertino, CA' },
        { address: '3200 Park Blvd, Palo Alto, CA' },
      ],
    }),
  });
  console.log('✓ job created', id);

  let state;
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const { job } = await req(`/jobs/${id}`, { headers: H });
    state = job;
    if (['done', 'failed'].includes(job.status)) break;
    await sleep(2000);
  }
  console.log('✓ final status:', state.status, '| phase:', state.phase, '| progress:', state.progress);

  if (state.status === 'failed') {
    console.error('✗ JOB FAILED:', state.error);
    process.exit(1);
  }

  const { result } = await req(`/jobs/${id}/result`, { headers: H });
  console.log('✓ result:');
  console.log('  ordered stop count:', result.ordered_stops.length);
  console.log('  total_distance_km:', result.total_distance_km.toFixed(2));
  console.log('  total_duration_min:', result.total_duration_min.toFixed(1));
  console.log('  geometry points:', result.geometry.length);
  console.log('  turn steps:', result.steps.length);
  console.log('  first 3 instructions:', result.steps.slice(0, 3).map((s) => s.instruction));

  for (const fmt of ['csv', 'gpx', 'kml', 'json']) {
    const res = await fetch(`${API}/jobs/${id}/export/${fmt}`, { headers: H });
    const ok = res.ok ? `${(await res.text()).length} bytes` : `HTTP ${res.status}`;
    console.log(`  export ${fmt}:`, ok);
  }

  const { steps, total } = await req(`/jobs/${id}/steps?offset=0&limit=5`, { headers: H });
  console.log('✓ steps pagination:', steps.length, 'of', total);
  console.log('\nE2E PASS');
}

main().catch((err) => {
  console.error('E2E FAIL:', err.message);
  process.exit(1);
});
