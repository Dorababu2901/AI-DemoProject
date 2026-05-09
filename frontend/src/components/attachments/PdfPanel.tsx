import { useEffect, useRef, useState } from "react";
import { pdfApi, type PdfAttachment } from "../../lib/pdfAttachments";

interface Props {
  threadId: string | null;
  /** Called when the active thread first needs to be created. */
  onEnsureThread: () => Promise<string>;
  /** Whether RAG retrieval is currently enabled (controls chroma search). */
  ragEnabled: boolean;
  /** Update RAG enabled flag in the parent. */
  onRagEnabledChange: (enabled: boolean) => void;
}

const STATUS_LABEL: Record<PdfAttachment["status"], string> = {
  pending: "Queued",
  indexing: "Indexing…",
  indexed: "Ready",
  failed: "Failed",
};

const STATUS_COLOR: Record<PdfAttachment["status"], string> = {
  pending: "bg-slate-100 text-slate-700",
  indexing: "bg-amber-100 text-amber-800",
  indexed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

export default function PdfPanel({
  threadId,
  onEnsureThread,
  ragEnabled,
  onRagEnabledChange,
}: Props) {
  const [items, setItems] = useState<PdfAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);

  // Load existing PDFs when thread changes.
  useEffect(() => {
    let cancelled = false;
    if (!threadId) {
      setItems([]);
      return;
    }
    (async () => {
      try {
        const list = await pdfApi.list(threadId);
        if (!cancelled) setItems(list);
      } catch {
        /* ignore — empty thread is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Poll any pending/indexing items every 2s until they settle.
  useEffect(() => {
    const pending = items.filter(
      (i) => i.status === "pending" || i.status === "indexing",
    );
    if (pending.length === 0) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const updates = await Promise.all(
          pending.map((p) => pdfApi.status(p.id).catch(() => null)),
        );
        setItems((prev) =>
          prev.map((row) => {
            const u = updates.find((x) => x && x.id === row.id);
            return u ?? row;
          }),
        );
      } catch {
        /* ignore transient errors */
      }
    }, 2000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [items]);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    setBusy(true);
    try {
      const tid = threadId ?? (await onEnsureThread());
      const created = await pdfApi.upload(tid, file);
      setItems((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await pdfApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function handleToggleClick() {
    // OFF → ON: enable RAG and open file picker so user can attach a PDF.
    if (!ragEnabled) {
      onRagEnabledChange(true);
      fileRef.current?.click();
      return;
    }
    // ON with no PDFs yet → just open the picker (stay ON).
    if (items.length === 0) {
      fileRef.current?.click();
      return;
    }
    // ON with PDFs already attached → toggle OFF (skip ChromaDB retrieval).
    onRagEnabledChange(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-700">PDFs in this chat</span>
        <button
          type="button"
          disabled={busy}
          onClick={handleToggleClick}
          title={
            ragEnabled
              ? items.length === 0
                ? "Click to upload a PDF"
                : "RAG is ON — click to turn OFF (skip ChromaDB search)"
              : "RAG is OFF — click to turn ON and upload a PDF"
          }
          className={`rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
            ragEnabled
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-400 hover:bg-slate-500"
          }`}
        >
          {busy ? "Uploading…" : ragEnabled ? "RAG ON" : "RAG OFF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      </div>
      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-slate-500">
          {ragEnabled
            ? "Attach a PDF to ask questions grounded in its contents."
            : "RAG is OFF — ChromaDB search is disabled. Click RAG OFF to enable."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1"
            >
              <a
                href={pdfApi.fileUrl(it.id)}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-slate-800 hover:underline"
                title={it.filename}
              >
                📄 {it.filename}
              </a>
              <span
                className={`rounded px-1.5 py-0.5 ${STATUS_COLOR[it.status]}`}
                title={it.error ?? undefined}
              >
                {STATUS_LABEL[it.status]}
                {it.status === "indexed" && it.page_count > 0
                  ? ` · ${it.page_count}p`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(it.id)}
                className="text-slate-400 hover:text-red-600"
                aria-label="Remove PDF"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
