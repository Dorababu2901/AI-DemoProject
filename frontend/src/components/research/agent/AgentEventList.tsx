import { useEffect, useRef } from "react";
import type { AgentEvent } from "../../../types";

interface Props {
  events: AgentEvent[];
}

const COLORS: Record<string, string> = {
  thought: "bg-slate-100 text-slate-800",
  tool_call: "bg-indigo-100 text-indigo-800",
  tool_result: "bg-indigo-50 text-indigo-700",
  paper_found: "bg-emerald-50 text-emerald-800",
  paper_summarized: "bg-emerald-100 text-emerald-900",
  decision: "bg-amber-100 text-amber-900",
  synthesis_chunk: "bg-violet-100 text-violet-900",
  digest: "bg-violet-200 text-violet-900",
  done: "bg-slate-200 text-slate-700",
  error: "bg-rose-100 text-rose-800",
};

function summarize(ev: AgentEvent): string {
  const d = ev.data as any;
  switch (ev.type) {
    case "thought":
      return typeof d === "string" ? d : JSON.stringify(d);
    case "tool_call":
      return `→ ${d?.tool ?? "tool"}(${JSON.stringify(d?.query ?? d)})`;
    case "tool_result":
      return `← ${d?.tool ?? "tool"}: ${d?.new ?? "?"} new / ${d?.returned ?? "?"} returned`;
    case "paper_found":
      return `📄 ${d?.title ?? d?.arxiv_id ?? "paper"}`;
    case "paper_summarized":
      return `📝 [${d?.arxiv_id}] relevance=${d?.relevance_score ?? "?"}`;
    case "decision":
      return `🧭 ${d?.action}: ${d?.reason ?? ""}${d?.refined_query ? ` → "${d.refined_query}"` : ""}`;
    case "synthesis_chunk":
      return "✍️ synthesis ready";
    case "digest":
      return "📦 final digest";
    case "done":
      return `✅ done (${d?.papers ?? 0} papers, ${d?.summaries ?? 0} summaries)`;
    case "error":
      return `❌ ${typeof d === "string" ? d : JSON.stringify(d)}`;
    default:
      return JSON.stringify(d);
  }
}

export function AgentEventList({ events }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="bg-white border rounded">
      <div className="px-4 py-2 border-b text-xs font-semibold text-slate-600 uppercase tracking-wide">
        Agent activity
      </div>
      <div ref={ref} className="max-h-80 overflow-y-auto p-3 space-y-1.5 text-xs">
        {events.length === 0 ? (
          <div className="text-slate-400 italic">Waiting for first event…</div>
        ) : (
          events.map((ev, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-2 py-1.5 rounded ${
                COLORS[ev.type] ?? "bg-slate-50 text-slate-700"
              }`}
            >
              {ev.iteration != null && (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/70 text-[10px] font-mono">
                  i{ev.iteration}
                </span>
              )}
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/70 text-[10px] font-mono">
                {ev.type}
              </span>
              <span className="break-words">{summarize(ev)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
