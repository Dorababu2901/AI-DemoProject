import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sqlApi, type Dialect, type SqlConnection } from "../../lib/sqlApi";
import { ApiError } from "../../lib/api";
import SupabaseHint from "../../components/sql/SupabaseHint";

// UI-only preset list. "supabase" is a convenience entry that submits as `postgresql`
// and surfaces the SupabaseHint helper below.
type DialectChoice = Dialect | "supabase";
const DIALECTS: DialectChoice[] = ["sqlite", "postgresql", "supabase", "mysql", "mssql"];

const DIALECT_LABELS: Record<DialectChoice, string> = {
  sqlite: "sqlite",
  postgresql: "postgresql",
  supabase: "supabase (postgres)",
  mysql: "mysql",
  mssql: "mssql",
};

const PLACEHOLDERS: Record<DialectChoice, string> = {
  sqlite: "sqlite:///./data/chinook.db",
  postgresql:
    "postgresql+psycopg://postgres:PASSWORD@HOST:5432/postgres",
  supabase:
    "postgresql+psycopg://postgres.<project-ref>:Prajwal%400725@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require",
  mysql: "mysql+pymysql://user:pass@host:3306/dbname",
  mssql: "mssql+pyodbc://user:pass@host/db?driver=ODBC+Driver+18+for+SQL+Server",
};

/** Map UI choice -> backend dialect. */
function toDialect(choice: DialectChoice): Dialect {
  return choice === "supabase" ? "postgresql" : choice;
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return String((e.data as any)?.detail ?? e.message);
  return (e as Error)?.message ?? "Request failed";
}

export default function ConnectionsPage() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<SqlConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [dialect, setDialect] = useState<DialectChoice>("supabase");
  const [conn, setConn] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await sqlApi.list();
      setConnections(list);
      setListError(null);
    } catch (e) {
      setListError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedName = name.trim();
    let url = conn.trim();
    if (!trimmedName || !url) {
      setFormError("Name and connection string are required.");
      return;
    }
    const backendDialect = toDialect(dialect);
    // Normalize the Supabase / generic Postgres URL so we always route through psycopg3.
    if (backendDialect === "postgresql") {
      if (/^postgres(ql)?:\/\//i.test(url) && !/^postgresql\+psycopg:\/\//i.test(url)) {
        url = url.replace(/^postgres(ql)?:\/\//i, "postgresql+psycopg://");
      }
      if (/\[YOUR-PASSWORD\]|\[?PASSWORD\]?/i.test(url)) {
        setFormError(
          "Replace [YOUR-PASSWORD] in the connection string with your actual database password.",
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await sqlApi.create({ name: trimmedName, dialect: backendDialect, connection_string: url });
      setName("");
      setConn("");
      await refresh();
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this connection?")) return;
    try {
      await sqlApi.remove(id);
      await refresh();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const use = (id: number) => {
    sessionStorage.setItem("sqlActiveConnectionId", String(id));
    navigate("/sql/ask");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Chat
          </Link>
          <h1 className="text-lg font-semibold">Talk to your database</h1>
        </div>
        <Link
          to="/sql/ask"
          className="text-sm text-emerald-700 hover:underline"
        >
          Open Ask →
        </Link>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <section className="bg-white border rounded-lg p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Add a connection</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="border rounded px-3 py-2 md:col-span-1"
              placeholder="Name (e.g. local-pg)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="border rounded px-3 py-2"
              value={dialect}
              onChange={(e) => setDialect(e.target.value as DialectChoice)}
            >
              {DIALECTS.map((d) => (
                <option key={d} value={d}>
                  {DIALECT_LABELS[d]}
                </option>
              ))}
            </select>
            <input
              className="border rounded px-3 py-2 md:col-span-2 font-mono text-sm"
              placeholder={PLACEHOLDERS[dialect]}
              value={conn}
              onChange={(e) => setConn(e.target.value)}
            />
            <button
              type="submit"
              disabled={submitting}
              className="md:col-span-4 bg-slate-900 text-white rounded py-2 hover:bg-slate-700 disabled:opacity-50"
            >
              {submitting ? "Testing & saving…" : "Test & save"}
            </button>
            {formError && <p className="md:col-span-4 text-sm text-red-600">{formError}</p>}
          </form>

          {(dialect === "postgresql" || dialect === "supabase") && (
            <SupabaseHint
              defaultOpen={dialect === "supabase"}
              onUse={(url) => setConn(url)}
              onSuggestName={(suggested) => {
                if (!name.trim()) setName(suggested);
              }}
            />
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Saved connections</h2>
          {loading && <p className="text-slate-500">Loading…</p>}
          {listError && <p className="text-red-600">{listError}</p>}
          {!loading && connections.length === 0 && (
            <p className="text-slate-500">
              No connections yet. Add one above, or use the auto-seeded "Chinook (SQLite, shared)".
            </p>
          )}
          <ul className="grid gap-3 md:grid-cols-2">
            {connections.map((c) => (
              <li
                key={c.id}
                className="bg-white border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">
                    {c.name}
                    {c.owner_id === null && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        shared
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.dialect} • #{c.id}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => use(c.id)}
                    className="px-3 py-1 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
                  >
                    Use
                  </button>
                  {c.owner_id !== null && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
