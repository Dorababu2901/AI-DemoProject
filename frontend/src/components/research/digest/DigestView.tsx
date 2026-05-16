import type { ResearchDigest } from "../../../types";
import { CitationList } from "./CitationList";
import { PaperCard } from "./PaperCard";
import { SynthesisPanel } from "./SynthesisPanel";

interface Props {
  digest: ResearchDigest;
}

export function DigestView({ digest }: Props) {
  const summaryById = new Map(digest.summaries.map((s) => [s.arxiv_id, s]));
  const ordered = [...digest.papers].sort((a, b) => {
    const sa = summaryById.get(a.arxiv_id)?.relevance_score ?? 0;
    const sb = summaryById.get(b.arxiv_id)?.relevance_score ?? 0;
    return sb - sa;
  });
  return (
    <div className="space-y-4">
      <SynthesisPanel synthesis={digest.synthesis} />
      <CitationList citations={digest.citations} />
      <div>
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Papers ({ordered.length})
        </div>
        <div className="space-y-3">
          {ordered.map((p) => (
            <PaperCard
              key={p.arxiv_id}
              paper={p}
              summary={summaryById.get(p.arxiv_id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
