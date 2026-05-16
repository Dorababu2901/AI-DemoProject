import { useEffect, useState } from "react";
import { sqlApi, type SchemaOut } from "../../lib/sqlApi";
import { ApiError } from "../../lib/api";

interface Props {
  connectionId: number;
  onPickTable?: (name: string) => void;
}

export default function SchemaSidebar({ connectionId, onPickTable }: Props) {
  const [data, setData] = useState<SchemaOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    sqlApi
      .getSchema(connectionId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiError ? String((e.data as any)?.detail ?? e.message) : (e as Error).message;
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  return (
    <aside className="w-72 shrink-0 border-r bg-white overflow-y-auto">
      <div className="p-3 border-b">
        <div className="text-xs uppercase tracking-wide text-slate-500">Schema</div>
        {data && <div className="text-sm font-medium">{data.dialect}</div>}
      </div>
      <div className="p-2">
        {loading && <p className="text-sm text-slate-500 p-2">Loading schema…</p>}
        {error && <p className="text-sm text-red-600 p-2">{error}</p>}
        {data && <SchemaTree schema={data} onPickTable={onPickTable} />}
      </div>
    </aside>
  );
}

function SchemaTree({ schema, onPickTable }: { schema: SchemaOut; onPickTable?: (n: string) => void }) {
  if (schema.tables.length === 0) return <p className="text-sm text-slate-500 p-2">No tables.</p>;
  return (
    <ul className="space-y-1">
      {schema.tables.map((t) => (
        <TableNode key={t.name} table={t} onPick={onPickTable} />
      ))}
    </ul>
  );
}

function TableNode({
  table,
  onPick,
}: {
  table: SchemaOut["tables"][number];
  onPick?: (n: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-sm">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700 w-4">
          {open ? "▾" : "▸"}
        </button>
        <button
          onClick={() => onPick?.(table.name)}
          className="font-mono text-slate-800 hover:underline text-left flex-1"
          title={`${table.row_count ?? "?"} rows`}
        >
          {table.name}
        </button>
        {table.row_count !== null && <span className="text-xs text-slate-400">{table.row_count}</span>}
      </div>
      {open && (
        <ul className="ml-6 mt-1 space-y-0.5">
          {table.columns.map((c) => (
            <li key={c.name} className="font-mono text-xs text-slate-600">
              {c.primary_key && <span className="text-amber-600 mr-1">★</span>}
              {c.name} <span className="text-slate-400">: {c.type}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
