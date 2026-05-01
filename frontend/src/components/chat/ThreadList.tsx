import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ThreadSummary } from "../../lib/threads";

interface Props {
  threads: ThreadSummary[];
  activeId: string | null;
  busyId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export default function ThreadList({
  threads,
  activeId,
  busyId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  function startEdit(t: ThreadSummary) {
    setEditingId(t.id);
    setDraft(t.title ?? "");
  }

  function commit() {
    if (!editingId) return;
    const next = draft.trim();
    const original = threads.find((t) => t.id === editingId)?.title ?? "";
    if (next && next !== original) onRename(editingId, next);
    setEditingId(null);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") setEditingId(null);
  }

  function handleDelete(t: ThreadSummary) {
    const label = t.title?.trim() || "this conversation";
    if (window.confirm(`Delete "${label}"? This cannot be undone.`)) {
      onDelete(t.id);
    }
  }

  return (
    <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Conversations</span>
        <button
          onClick={onCreate}
          className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-400">
            No conversations yet — click <strong>+ New</strong> to start one.
          </p>
        )}
        {threads.map((t) => {
          const isActive = t.id === activeId;
          const isBusy = busyId === t.id;
          const isEditing = editingId === t.id;
          return (
            <div
              key={t.id}
              className={`group flex items-center gap-1 px-2 py-1.5 ${
                isActive ? "bg-blue-50" : "hover:bg-slate-50"
              } ${isBusy ? "opacity-50" : ""}`}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={onKey}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => onSelect(t.id)}
                  disabled={isBusy}
                  className={`flex-1 truncate text-left text-sm ${
                    isActive ? "font-medium text-blue-700" : "text-slate-700"
                  }`}
                  title={t.title ?? "(untitled)"}
                >
                  {t.title?.trim() || "(untitled)"}
                </button>
              )}
              {!isEditing && (
                <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(t)}
                    disabled={isBusy}
                    title="Rename"
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828 8 16l.172-3.828z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={isBusy}
                    title="Delete"
                    className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
