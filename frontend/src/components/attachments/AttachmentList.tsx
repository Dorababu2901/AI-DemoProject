import type { ChatAttachment } from "../../lib/attachments";

interface Props {
  items: ChatAttachment[];
  onRemove?: (index: number) => void;
}

const KIND_LABEL: Record<ChatAttachment["kind"], string> = {
  image: "Image",
  video: "Video",
  table: "Table",
  formula: "Formula",
  code: "Code",
  file: "File",
};

export default function AttachmentList({ items, onRemove }: Props) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((att, i) => (
        <div
          key={i}
          className="relative flex max-w-[180px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5 pr-6 text-xs text-slate-700"
        >
          {att.kind === "image" && att.data ? (
            <img
              src={att.data}
              alt={att.name ?? "image"}
              className="h-12 w-12 rounded object-cover"
            />
          ) : att.kind === "video" && att.data ? (
            <video
              src={att.data}
              className="h-12 w-12 rounded object-cover"
              muted
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-200 font-mono text-[10px] uppercase">
              {att.kind === "code" ? att.language || "code" : KIND_LABEL[att.kind]}
            </div>
          )}
          <div className="flex flex-col overflow-hidden">
            <span className="truncate font-medium">
              {att.name ?? KIND_LABEL[att.kind]}
            </span>
            <span className="text-[10px] text-slate-500">
              {KIND_LABEL[att.kind]}
            </span>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="Remove attachment"
              className="absolute right-1 top-1 text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
