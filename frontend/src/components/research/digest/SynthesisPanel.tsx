interface Props {
  synthesis: string;
}

/**
 * Lightweight markdown-ish renderer (no external deps): preserves
 * paragraphs and bullet lists; turns `[arxiv_id]` into clickable links.
 */
function renderInline(text: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  const re = /\[(\d{4}\.\d{4,6}(?:v\d+)?)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a
        key={`c${i++}`}
        href={`https://arxiv.org/abs/${m[1]}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-indigo-700 hover:underline"
      >
        [{m[1]}]
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SynthesisPanel({ synthesis }: Props) {
  if (!synthesis) return null;
  const blocks = synthesis.split(/\n{2,}/);
  return (
    <div className="bg-white border rounded p-5 space-y-3">
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        Synthesis
      </div>
      <div className="prose prose-sm max-w-none text-slate-800 space-y-3">
        {blocks.map((block, bi) => {
          const lines = block.split("\n");
          const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
          if (isList) {
            return (
              <ul key={bi} className="list-disc pl-5 space-y-1">
                {lines.map((l, li) => (
                  <li key={li}>{renderInline(l.replace(/^\s*[-*]\s+/, ""))}</li>
                ))}
              </ul>
            );
          }
          // headings (# / ## / ###)
          const heading = block.match(/^(#{1,3})\s+(.*)$/);
          if (heading && lines.length === 1) {
            const level = heading[1].length;
            const Tag = (`h${Math.min(level + 2, 6)}`) as keyof JSX.IntrinsicElements;
            return (
              <Tag key={bi} className="font-semibold text-slate-900">
                {renderInline(heading[2])}
              </Tag>
            );
          }
          return (
            <p key={bi} className="leading-relaxed">
              {renderInline(block)}
            </p>
          );
        })}
      </div>
    </div>
  );
}
