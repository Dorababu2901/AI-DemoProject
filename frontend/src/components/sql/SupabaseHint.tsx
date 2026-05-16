import { useEffect, useState } from "react";

interface Props {
  /** Auto-fills the parent connection-string field whenever a usable URL is built. */
  onUse: (url: string) => void;
  /** Suggests a name for the parent name field once we know the project ref. */
  onSuggestName?: (name: string) => void;
  defaultOpen?: boolean;
}

/**
 * Two ways to use:
 *   1. Paste the connection string from the Supabase dashboard (with `[YOUR-PASSWORD]`),
 *      type your password — we substitute and URL-encode it.
 *   2. Or fill Host + Region + Mode + Password and we build the URL.
 *
 * The built URL is pushed to the parent on every change so you don't need to click anything.
 */
export default function SupabaseHint({ onUse, onSuggestName, defaultOpen = false }: Props) {
  const [pasted, setPasted] = useState("");
  const [host, setHost] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"session" | "transaction" | "direct">("session");
  const [region, setRegion] = useState("ap-southeast-2");
  const [awsPrefix, setAwsPrefix] = useState("aws-1");

  const projectRef = host.replace(/^db\./, "").replace(/\.supabase\.co$/, "");

  const buildFromFields = (): string | null => {
    if (!password) return null;
    const pw = encodeURIComponent(password);
    if (mode === "direct") {
      if (!projectRef) return null;
      return `postgresql+psycopg://postgres:${pw}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
    }
    if (!projectRef || !region) return null;
    const port = mode === "transaction" ? 6543 : 5432;
    return `postgresql+psycopg://postgres.${projectRef}:${pw}@${awsPrefix}-${region}.pooler.supabase.com:${port}/postgres?sslmode=require`;
  };

  const buildFromPasted = (): string | null => {
    if (!pasted.trim() || !password) return null;
    let url = pasted.trim();
    url = url.replace(/^postgres(ql)?:\/\//i, "postgresql+psycopg://");
    const pw = encodeURIComponent(password);
    url = url.replace(/\[YOUR-PASSWORD\]/gi, pw);
    if (!/sslmode=/i.test(url)) {
      url += url.includes("?") ? `&sslmode=require` : `?sslmode=require`;
    }
    return url;
  };

  const built = buildFromPasted() ?? buildFromFields() ?? "";

  // Push built URL up to parent on every change.
  useEffect(() => {
    if (!built) return;
    onUse(built);
    if (onSuggestName) {
      const ref = projectRef || "supabase";
      onSuggestName(`supabase-${ref.slice(0, 12)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // Auto-detect host & region from a pasted URL.
  useEffect(() => {
    if (!pasted) return;
    const m = pasted.match(/postgres\.([a-z0-9]+):/i);
    if (m && !host) setHost(`db.${m[1]}.supabase.co`);
    const r = pasted.match(/@(aws-\d+)-([a-z0-9-]+)\.pooler\.supabase\.com/i);
    if (r) {
      setAwsPrefix(r[1]);
      setRegion(r[2]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasted]);

  return (
    <details open={defaultOpen} className="mt-4 border rounded-lg p-3 bg-emerald-50/40">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">
        Supabase helper · paste from dashboard, or fill the fields
      </summary>

      <div className="mt-3 space-y-3 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-slate-500">
            1. Paste the connection string from Supabase (Project Settings → Database → Connection string)
          </span>
          <textarea
            rows={2}
            className="border rounded px-2 py-1 font-mono text-xs"
            placeholder="postgresql://postgres.PROJECT_REF:[YOUR-PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </label>

        <label className="flex flex-col">
          <span className="text-xs text-slate-500">2. Database password (always required)</span>
          <input
            type="password"
            className="border rounded px-2 py-1 font-mono"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </label>

        <details className="border rounded p-2 bg-white">
          <summary className="cursor-pointer text-xs text-slate-600">Or build from parts</summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">Host</span>
              <input
                className="border rounded px-2 py-1 font-mono"
                placeholder="db.xyzcompany.supabase.co"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">Region (pooler)</span>
              <input
                className="border rounded px-2 py-1 font-mono"
                placeholder="ap-southeast-2"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">Connection mode</span>
              <select
                className="border rounded px-2 py-1"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="session">Session pooler · port 5432 (recommended)</option>
                <option value="transaction">Transaction pooler · port 6543</option>
                <option value="direct">Direct · port 5432 (IPv6 only)</option>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">AWS prefix (aws-0 / aws-1)</span>
              <input
                className="border rounded px-2 py-1 font-mono"
                placeholder="aws-1"
                value={awsPrefix}
                onChange={(e) => setAwsPrefix(e.target.value)}
              />
            </label>
          </div>
        </details>

        <div>
          <span className="text-xs text-slate-500">Final connection string (auto-applied above)</span>
          <pre className="text-xs bg-white border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {built || "(paste a Supabase URL and enter your password to build it)"}
          </pre>
        </div>

        <p className="text-xs text-slate-500">
          Tip: paste the dashboard URL (with <code>[YOUR-PASSWORD]</code>) and type your password —
          we URL-encode it and switch the scheme to <code>postgresql+psycopg</code> automatically.
          Then click <strong>Test &amp; save</strong> above.
        </p>
      </div>
    </details>
  );
}
