import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, API_BASE_URL, persistAuthToken } from "../../lib/api";
import type { LoginRequest, LoginResponse } from "../../types/auth";

export default function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? `Google sign-in failed: ${oauthError}` : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: LoginRequest = { username, password };
      // The backend sets an httpOnly cookie *and* returns the JWT in the body.
      // We persist the token so cross-origin streaming requests (which may not
      // carry the cookie reliably) can authenticate via Authorization: Bearer.
      const resp = await api.post<LoginResponse>("/api/v1/auth/login", payload);
      if (resp?.access_token) persistAuthToken(resp.access_token);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Invalid username or password."
            : `Login failed (${err.status}).`,
        );
      } else {
        setError("Unable to reach the server. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
    // Full-page navigation so the browser follows Google's redirect chain
    // and ultimately receives our httpOnly auth cookie from the callback.
    window.location.href = `${API_BASE_URL}/api/v1/auth/google/login`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Sign in</h1>
        <p className="text-sm text-slate-500">
          Use your Amzur Google account or the dev credentials below.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-5c-1.9 1.4-4.3 2.3-6.9 2.3-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.4 5.5l6 5C40.9 35.6 43.5 30.2 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        Sign in with Google
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-1">
        <label htmlFor="username" className="text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Login with username"}
      </button>
    </form>
  );
}
