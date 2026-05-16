import { useEffect, useState } from "react";
import { sqlApi, type HistoryItem } from "../../lib/sqlApi";

interface Props {
  connectionId: number;
  refreshKey?: number;
  onPick: (q: string) => void;
}

export default function HistoryPanel({ connectionId, refreshKey, onPick }: Props) {
  const [data, setData] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sqlApi
      .history(connectionId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, refreshKey]);

  return (
    <aside className="w-72 shrink-0 border-l bg-white overflow-y-auto">
      <div className="p-3 border-b text-xs uppercase tracking-wide text-slate-500">History</div>
      <div className="p-2 space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {data && data.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
        {data?.map((h) => (
          <button
            key={h.id}
            onClick={() => onPick(h.question)}
            className="block w-full text-left p-2 rounded hover:bg-slate-100 text-xs"
          >
            <div className="font-medium text-slate-800 line-clamp-2">{h.question}</div>
            <div className="text-slate-400 text-[10px] mt-0.5">
              {new Date(h.created_at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
