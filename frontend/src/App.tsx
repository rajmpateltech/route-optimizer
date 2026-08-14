import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { Job } from './types';
import { AuthForm } from './components/AuthForm';
import { CreateJob } from './components/CreateJob';
import { JobList } from './components/JobList';
import { JobDetail } from './components/JobDetail';

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onAuth = () => setAuthed(Boolean(getToken()));
    window.addEventListener('routeoptimizer:authed', onAuth);
    window.addEventListener('routeoptimizer:unauthorized', onAuth);
    return () => {
      window.removeEventListener('routeoptimizer:authed', onAuth);
      window.removeEventListener('routeoptimizer:unauthorized', onAuth);
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    api
      .listJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => setAuthed(false));
  }, [authed]);

  useEffect(() => {
    if (!authed) {
      setJobs([]);
      setSelectedId(null);
    }
  }, [authed]);

  async function handleDelete(id: string) {
    await api.deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  if (!authed) return <AuthForm />;

  return (
    <div className="min-h-full bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">RouteOptimizer</h1>
          <button
            onClick={() => {
              setToken(null);
              setAuthed(false);
            }}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <CreateJob
            onCreated={(id) => {
              setSelectedId(id);
              void api.listJobs().then((r) => setJobs(r.jobs));
            }}
          />
          <JobList
            jobs={jobs}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={(id) => void handleDelete(id)}
          />
        </aside>
        <section>
          {selectedId ? (
            <JobDetail key={selectedId} jobId={selectedId} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Select a route or create a new one to begin.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
