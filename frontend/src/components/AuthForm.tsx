import { useEffect, useState, type FormEvent } from 'react';
import { api, setToken } from '../api';
import type { User } from '../types';

export function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setToken(null));
  }, []);

  if (user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-slate-600">Signed in as {user.email}</p>
          <button
            onClick={() => {
              setToken(null);
              setUser(null);
            }}
            className="rounded-lg bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="mb-1 text-2xl font-bold text-slate-900">RouteOptimizer</h1>
        <p className="mb-6 text-sm text-slate-500">
          Plan large multi-stop driving routes with optimized ordering.
        </p>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="you@example.com"
        />
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="8+ characters"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-3 w-full text-center text-sm text-blue-600 hover:underline"
        >
          {mode === 'login'
            ? 'Need an account? Create one'
            : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
