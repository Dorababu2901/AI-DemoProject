import type { Citation } from "../../../types";

interface Props {
  citations: Citation[];
}

export function CitationList({ citations }: Props) {
  if (!citations.length) return null;
  return (
    <div className="bg-white border rounded p-4">
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
        Citations
      </div>
      <ul className="space-y-2 text-sm">
        {citations.map((c, i) => (
          <li key={i} className="border-l-2 border-indigo-300 pl-3">
            <a
              href={`https://arxiv.org/abs/${c.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-indigo-700 hover:underline"
            >
              [{c.arxiv_id}]
            </a>
            <div className="text-slate-700">{c.quote}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
