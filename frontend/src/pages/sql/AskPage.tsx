import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { sqlApi, type QueryResponse, type SqlConnection } from "../../lib/sqlApi";
import { ApiError } from "../../lib/api";
import SchemaSidebar from "../../components/sql/SchemaSidebar";
import HistoryPanel from "../../components/sql/HistoryPanel";
import MessageBubble from "../../components/sql/MessageBubble";

interface Turn {
  question: string;
  answer?: QueryResponse;
  loading?: boolean;
  error?: string;
}

const EXAMPLES = [
  "List the top 10 best-selling tracks of all time.",
  "What is the average invoice total per country?",
  "Show the number of new customers per month in 2013.",
  "Which employee has the highest sales and by how much?",
  "Find albums where every track is longer than 5 minutes.",
];

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return String((e.data as any)?.detail ?? e.message);
  return (e as Error)?.message ?? "Request failed";
}

export default function AskPage() {
  const [connections, setConnections] = useState<SqlConnection[] | null>(null);
  const stored = Number(sessionStorage.getItem("sqlActiveConnectionId") || 0) || null;
  const [activeId, setActiveId] = useState<number | null>(stored);

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sqlApi
      .list()
      .then((list) => setConnections(list))
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    if (!activeId && connections && connections.length > 0) {
      setActiveId(connections[0].id);
    }
  }, [activeId, connections]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const submit = async (q: string) => {
    if (!q.trim() || !activeId || submitting) return;
    const history = turns.flatMap((t) => [
      { role: "user" as const, content: t.question },
      ...(t.answer ? [{ role: "assistant" as const, content: t.answer.explanation }] : []),
    ]);
    setTurns((t) => [...t, { question: q, loading: true }]);
    setInput("");
    setSubmitting(true);
    try {
      const data = await sqlApi.ask({ connection_id: activeId, question: q, history });
      setTurns((t) =>
        t.map((tn, i) => (i === t.length - 1 ? { ...tn, loading: false, answer: data } : tn)),
      );
      setHistoryKey((k) => k + 1);
    } catch (e) {
      const msg = errMsg(e);
      setTurns((t) =>
        t.map((tn, i) => (i === t.length - 1 ? { ...tn, loading: false, error: msg } : tn)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (connections && connections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <p className="text-slate-600">No connections yet.</p>
        <Link to="/sql/connections" className="text-emerald-700 underline">
          Add one →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-2 flex items-center gap-4 shrink-0">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Chat
        </Link>
        <h1 className="text-base font-semibold">Talk to your database</h1>
        <Link to="/sql/connections" className="text-xs text-slate-500 hover:underline ml-auto">
          Manage connections
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        {activeId && (
          <SchemaSidebar
            connectionId={activeId}
            onPickTable={(t) => setInput((i) => `${i}${i ? " " : ""}${t}`)}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="border-b bg-white px-4 py-2 flex items-center gap-3">
            <label className="text-sm text-slate-500">Connection:</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={activeId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setActiveId(id);
                sessionStorage.setItem("sqlActiveConnectionId", String(id));
                setTurns([]);
              }}
            >
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.dialect})
                </option>
              ))}
            </select>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl w-full mx-auto">
            {turns.length === 0 && (
              <div className="text-sm text-slate-600 space-y-2">
                <p>Try one of these:</p>
                <ul className="space-y-1">
                  {EXAMPLES.map((ex) => (
                    <li key={ex}>
                      <button
                        onClick={() => submit(ex)}
                        className="text-left text-emerald-700 hover:underline"
                      >
                        • {ex}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((t, i) => (
              <MessageBubble
                key={i}
                question={t.question}
                answer={t.answer}
                loading={t.loading}
                error={t.error}
              />
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
              placeholder="Ask a question about your data…"
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

        {activeId && <HistoryPanel connectionId={activeId} refreshKey={historyKey} onPick={(q) => setInput(q)} />}
      </div>
    </div>
  );
}
