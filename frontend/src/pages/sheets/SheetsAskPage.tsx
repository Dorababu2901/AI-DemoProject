import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import {
  sheetsApi,
  type DatasetPreview,
  type SheetAskResponse,
  type SheetDataset,
  type SheetHistoryItem,
} from "../../lib/sheetsApi";

interface Turn {
  question: string;
  answer?: SheetAskResponse;
  loading?: boolean;
  error?: string;
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return String((e.data as any)?.detail ?? e.message);
  return (e as Error)?.message ?? "Request failed";
}

export default function SheetsAskPage() {
  const { id } = useParams<{ id: string }>();
  const datasetId = Number(id);

  const [dataset, setDataset] = useState<SheetDataset | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [history, setHistory] = useState<SheetHistoryItem[]>([]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!datasetId) return;
    sheetsApi.get(datasetId).then(setDataset).catch((e) => setLoadError(errMsg(e)));
    sheetsApi.preview(datasetId).then(setPreview).catch(() => setPreview(null));
    sheetsApi.history(datasetId).then(setHistory).catch(() => setHistory([]));
  }, [datasetId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const submit = async (q: string) => {
    if (!q.trim() || !datasetId || submitting) return;
    const past = turns.flatMap((t) => [
      { role: "user" as const, content: t.question },
      ...(t.answer ? [{ role: "assistant" as const, content: t.answer.answer }] : []),
    ]);
    setTurns((t) => [...t, { question: q, loading: true }]);
    setInput("");
    setSubmitting(true);
    try {
      const data = await sheetsApi.ask(datasetId, { question: q, history: past });
      setTurns((t) =>
        t.map((tn, i) => (i === t.length - 1 ? { ...tn, loading: false, answer: data } : tn)),
      );
      sheetsApi.history(datasetId).then(setHistory).catch(() => undefined);
    } catch (err) {
      const m = errMsg(err);
      setTurns((t) =>
        t.map((tn, i) => (i === t.length - 1 ? { ...tn, loading: false, error: m } : tn)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm">
        <p className="text-red-600">{loadError}</p>
        <Link to="/sheets" className="text-emerald-700 underline">
          ← Back to datasets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-2 flex items-center gap-4 shrink-0">
        <Link to="/sheets" className="text-sm text-slate-500 hover:text-slate-800">
          ← Datasets
        </Link>
        <h1 className="text-base font-semibold">
          Ask: {dataset?.name ?? "…"}
        </h1>
        {dataset && (
          <span className="text-xs text-slate-500">
            {dataset.row_count} rows · {dataset.columns.length} cols · {dataset.source}
          </span>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Schema/preview sidebar */}
        <aside className="w-64 border-r bg-white overflow-y-auto p-3 text-xs shrink-0">
          <p className="uppercase text-slate-400 mb-1">Columns</p>
          {preview ? (
            <ul className="space-y-1">
              {preview.columns.map((c) => (
                <li key={c}>
                  <button
                    onClick={() => setInput((i) => `${i}${i ? " " : ""}${c}`)}
                    className="text-left text-slate-700 hover:text-emerald-700"
                    title={preview.dtypes[c]}
                  >
                    {c}{" "}
                    <span className="text-slate-400">{preview.dtypes[c]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">Loading…</p>
          )}
        </aside>

        {/* Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-w-4xl w-full mx-auto">
            {preview && turns.length === 0 && (
              <div className="bg-white border rounded p-3 text-xs">
                <p className="text-slate-500 mb-2">
                  Preview (first {preview.rows.length} of {preview.row_count} rows)
                </p>
                <div className="overflow-auto">
                  <table className="text-xs border-collapse">
                    <thead className="bg-slate-100">
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c} className="border px-2 py-1 text-left">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="border px-2 py-1">
                              {cell === null ? "" : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-sm">
                  <span className="text-emerald-800 font-medium">You: </span>
                  {t.question}
                </div>
                {t.loading && (
                  <div className="text-xs text-slate-500">Thinking…</div>
                )}
                {t.error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-sm whitespace-pre-wrap">
                    {t.error}
                  </div>
                )}
                {t.answer && (
                  <div className="bg-white border rounded p-3 text-sm space-y-2">
                    <p className="whitespace-pre-wrap">{t.answer.answer}</p>
                    {t.answer.code && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-500">
                          Show code
                        </summary>
                        <pre className="bg-slate-50 rounded p-2 overflow-auto text-xs mt-1">
                          {t.answer.code}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="border-t bg-white p-3 flex gap-2 max-w-4xl w-full mx-auto"
          >
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder="Ask a question about your spreadsheet…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Asking…" : "Ask"}
            </button>
          </form>
        </div>

        {/* History */}
        <aside className="w-64 border-l bg-white overflow-y-auto p-3 text-xs shrink-0">
          <p className="uppercase text-slate-400 mb-1">History</p>
          {history.length === 0 ? (
            <p className="text-slate-400">No history yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => setInput(h.question)}
                    className="text-left text-slate-700 hover:text-emerald-700"
                  >
                    {h.question}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
