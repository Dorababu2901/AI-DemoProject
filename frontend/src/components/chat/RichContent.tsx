import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

interface Props {
  content: string;
  className?: string;
}

/** Renders markdown with GFM tables, KaTeX math, and syntax-highlighted code. */
export default function RichContent({ content, className }: Props) {
  return (
    <div className={`prose prose-sm max-w-none ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
