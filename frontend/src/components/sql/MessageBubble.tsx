import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import sqlLang from "highlight.js/lib/languages/sql";
import "highlight.js/styles/atom-one-light.css";
import type { QueryResponse } from "../../lib/sqlApi";
import ChartView from "./ChartView";

hljs.registerLanguage("sql", sqlLang);

interface Props {
  question: string;
  answer?: QueryResponse;
  loading?: boolean;
  error?: string;
}

function SqlBlock({ sql }: { sql: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.removeAttribute("data-highlighted");
      hljs.highlightElement(ref.current);
    }
  }, [sql]);
  return (
    <pre className="text-xs m-0 overflow-x-auto rounded border bg-slate-50">
      <code ref={ref} className="language-sql block p-2">
        {sql}
      </code>
    </pre>
  );
}

export default function MessageBubble({ question, answer, loading, error }: Props) {
  const [showSql, setShowSql] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
        <span className="text-emerald-700 font-semibold">You: </span>
        {question}
      </div>

      {loading && <div className="text-sm text-slate-500 italic">Generating SQL & running query…</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {answer && (
        <div className="bg-white border rounded-lg p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowSql((s) => !s)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                {showSql ? "▾ SQL" : "▸ SQL"}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(answer.sql)}
                className="text-xs px-2 py-0.5 border rounded hover:bg-slate-50"
              >
                Copy
              </button>
            </div>
            {showSql && <SqlBlock sql={answer.sql} />}
          </div>

          <ResultTable
            columns={answer.columns}
            rows={answer.rows}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
          />

          <p className="text-sm text-slate-700">
            <span className="font-semibold">Explanation:</span> {answer.explanation}
          </p>

          <ChartView hint={answer.suggested_chart} columns={answer.columns} rows={answer.rows} />
        </div>
      )}
    </div>
  );
}

function ResultTable({
  columns,
  rows,
  page,
  setPage,
  pageSize,
}: {
  columns: string[];
  rows: unknown[][];
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
}) {
  const [sortIdx, setSortIdx] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  if (rows.length === 0) return <p className="text-sm text-slate-500 italic">No rows returned.</p>;

  const sorted =
    sortIdx === null
      ? rows
      : [...rows].sort((a, b) => {
          const av = a[sortIdx];
          const bv = b[sortIdx];
          if (av == null && bv == null) return 0;
          if (av == null) return -1 * sortDir;
          if (bv == null) return 1 * sortDir;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
          return String(av).localeCompare(String(bv)) * sortDir;
        });

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const slice = sorted.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div>
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-100">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-left font-semibold border-b cursor-pointer hover:bg-slate-200"
                  onClick={() => {
                    if (sortIdx === i) setSortDir((d) => (d === 1 ? -1 : 1));
                    else {
                      setSortIdx(i);
                      setSortDir(1);
                    }
                  }}
                >
                  {c}
                  {sortIdx === i ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, ri) => (
              <tr key={ri} className="odd:bg-white even:bg-slate-50">
                {r.map((v, ci) => (
                  <td key={ci} className="px-2 py-1 border-b font-mono">
                    {v === null ? <span className="text-slate-400">NULL</span> : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
        <span>{rows.length} row(s)</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-2 py-0.5 border rounded disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {page + 1} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
            className="px-2 py-0.5 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
