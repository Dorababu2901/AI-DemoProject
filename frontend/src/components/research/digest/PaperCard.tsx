import type { Paper, PaperSummary } from "../../../types";

interface Props {
  paper: Paper;
  summary?: PaperSummary;
}

export function PaperCard({ paper, summary }: Props) {
  const score = summary?.relevance_score;
  return (
    <div className="bg-white border rounded p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a
            href={paper.pdf_url ?? `https://arxiv.org/abs/${paper.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-indigo-700 hover:underline"
          >
            {paper.title}
          </a>
          <div className="text-xs text-slate-500 mt-0.5">
            {(paper.authors ?? []).slice(0, 5).join(", ")}
            {paper.authors && paper.authors.length > 5 ? " et al." : ""}
            {paper.published ? ` • ${paper.published.slice(0, 10)}` : ""}
            {" • "}
            <span className="font-mono">{paper.arxiv_id}</span>
          </div>
        </div>
        {score != null && (
          <span
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              score >= 0.7
                ? "bg-emerald-100 text-emerald-800"
                : score >= 0.4
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            relevance {score.toFixed(2)}
          </span>
        )}
      </div>
      {summary?.summary && (
        <p className="text-sm text-slate-700 leading-relaxed">{summary.summary}</p>
      )}
      {summary?.key_findings && summary.key_findings.length > 0 && (
        <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
          {summary.key_findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
