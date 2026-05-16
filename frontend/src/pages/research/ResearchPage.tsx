import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { AgentEventList } from "../../components/research/agent/AgentEventList";
import { DigestView } from "../../components/research/digest/DigestView";
import { QueryForm } from "../../components/research/search/QueryForm";
import { streamAgent } from "../../lib/stream";
import type { AgentEvent, Paper, PaperSummary, ResearchDigest } from "../../types";

/**
 * Project 10 — Research Digest Agent.
 *
 * Submits a question, streams `AgentEvent` chunks from
 * `POST /api/v1/research/digest`, and renders the live agent log plus
 * the final structured digest.
 */
export default function ResearchPage() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [summaries, setSummaries] = useState<PaperSummary[]>([]);
  const [digest, setDigest] = useState<ResearchDigest | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setEvents([]);
    setPapers([]);
    setSummaries([]);
    setDigest(null);
    setError(null);
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const handleSubmit = useCallback(
    async (query: string, maxIterations: number) => {
      reset();
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      await streamAgent(
        "/api/v1/research/digest",
        { query, max_iterations: maxIterations },
        {
          signal: ctrl.signal,
          onEvent: (ev) => {
            setEvents((prev) => [...prev, ev]);
            const d = ev.data as Record<string, unknown> | string | null;
            if (ev.type === "paper_found" && d && typeof d === "object") {
              setPapers((prev) => [...prev, d as unknown as Paper]);
            } else if (
              ev.type === "paper_summarized" &&
              d &&
              typeof d === "object"
            ) {
              setSummaries((prev) => [...prev, d as unknown as PaperSummary]);
            } else if (ev.type === "digest" && d && typeof d === "object") {
              setDigest(d as unknown as ResearchDigest);
            } else if (ev.type === "error") {
              setError(typeof d === "string" ? d : JSON.stringify(d));
            }
          },
          onError: (err) => {
            setError(err instanceof Error ? err.message : String(err));
            setStreaming(false);
          },
          onDone: () => setStreaming(false),
        },
      );
    },
    [],
  );

  // While the digest hasn't arrived yet, build a "preview" digest from the
  // live papers + summaries so the UI feels responsive.
  const previewDigest: ResearchDigest | null =
    digest ??
    (papers.length > 0
      ? {
          query: "",
          papers,
          summaries,
          citations: [],
          synthesis: "",
          generated_at: "",
        }
      : null);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Chat
        </Link>
        <h1 className="text-base font-semibold">Research Digest Agent</h1>
        <span className="text-xs text-slate-400">arXiv-powered</span>
      </header>
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <QueryForm
          disabled={streaming}
          streaming={streaming}
          onSubmit={handleSubmit}
          onStop={handleStop}
        />

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded p-3">
            {error}
          </div>
        )}

        {(events.length > 0 || streaming) && <AgentEventList events={events} />}

        {previewDigest && (
          <div className="space-y-4">
            {!digest && (
              <div className="text-xs text-slate-500 italic">
                Live results — final synthesis will appear when the agent finishes.
              </div>
            )}
            <DigestView digest={previewDigest} />
          </div>
        )}
      </main>
    </div>
  );
}
