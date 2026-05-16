import type { FormEvent } from "react";
import { useState } from "react";

interface Props {
  disabled: boolean;
  onSubmit: (query: string, maxIterations: number) => void;
  onStop?: () => void;
  streaming: boolean;
}

export function QueryForm({ disabled, onSubmit, onStop, streaming }: Props) {
  const [query, setQuery] = useState("");
  const [iters, setIters] = useState(3);

  function handle(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    onSubmit(q, iters);
  }

  return (
    <form onSubmit={handle} className="bg-white border rounded p-4 space-y-3">
      <label className="block text-xs font-medium text-slate-700">
        Research question
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="e.g. retrieval augmented generation 2024"
          className="mt-1 block w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-700 flex-1">
          Max iterations: <span className="font-bold">{iters}</span>
          <input
            type="range"
            min={1}
            max={6}
            value={iters}
            onChange={(e) => setIters(parseInt(e.target.value, 10))}
            disabled={disabled}
            className="block w-full mt-1"
          />
        </label>
        {streaming && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="px-4 py-2 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !query.trim()}
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Run agent
          </button>
        )}
      </div>
    </form>
  );
}
