import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, API_BASE_URL, ApiError } from "../../lib/api";
import {
  threadsApi,
  type ChatMessageRead,
  type ServerAttachment,
  type ThreadSummary,
} from "../../lib/threads";
import {
  fileToAttachment,
  inlineSnippetAttachment,
  type ChatAttachment,
} from "../../lib/attachments";
import { pdfApi } from "../../lib/pdfAttachments";
import AttachmentList from "../attachments/AttachmentList";
import PdfPanel from "../attachments/PdfPanel";
import RichContent from "./RichContent";
import ThreadList from "./ThreadList";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  serverAttachments?: ServerAttachment[];
}

interface ChatResponse {
  reply: string;
  model: string;
  thread_id: string;
  user_message_id: string;
  assistant_message_id: string;
  attachments?: ServerAttachment[];
}

const ACTIVE_THREAD_KEY = "active_thread_id";

function toMessage(m: ChatMessageRead): Message | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    serverAttachments: m.attachments ?? undefined,
  };
}

const IMAGE_INTENT_RE =
  /\b(draw|sketch|paint|illustrate|render|imagine|generate (an? )?image|picture|photo)\b/i;

export default function ChatWindow() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_THREAD_KEY),
  );
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [snippetOpen, setSnippetOpen] = useState<null | "code" | "table" | "formula">(null);
  const [snippetText, setSnippetText] = useState("");
  const [snippetLang, setSnippetLang] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [ragEnabled, setRagEnabled] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Persist active thread id so refresh restores the conversation.
  useEffect(() => {
    if (threadId) localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
    else localStorage.removeItem(ACTIVE_THREAD_KEY);
  }, [threadId]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await threadsApi.list();
        if (cancelled) return;
        setThreads(list);
        const activeId = threadId ?? list[0]?.id ?? null;
        if (activeId) await loadThread(activeId, cancelled);
      } catch {
        // unauthenticated → RequireAuth handles redirect
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshThreads() {
    try {
      const list = await threadsApi.list();
      setThreads(list);
    } catch {
      // ignore
    }
  }

  async function loadThread(id: string, cancelled = false) {
    try {
      const t = await threadsApi.get(id);
      if (cancelled) return;
      setThreadId(t.id);
      setMessages(t.messages.map(toMessage).filter((x): x is Message => !!x));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setThreadId(null);
        setMessages([]);
      }
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      const t = await threadsApi.create();
      setThreads((prev) => [t, ...prev]);
      setThreadId(t.id);
      setMessages([]);
      setModel(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Create failed (${err.status})` : "Create failed");
    }
  }

  async function handleRename(id: string, title: string) {
    setError(null);
    setBusyThreadId(id);
    const previous = threads;
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t)),
    );
    try {
      const updated = await threadsApi.rename(id, title);
      setThreads((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setThreads(previous);
      setError(err instanceof ApiError ? `Rename failed (${err.status})` : "Rename failed");
    } finally {
      setBusyThreadId(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setBusyThreadId(id);
    const previous = threads;
    setThreads((prev) => prev.filter((t) => t.id !== id));
    try {
      await threadsApi.remove(id);
      if (id === threadId) {
        setThreadId(null);
        setMessages([]);
        setModel(null);
      }
    } catch (err) {
      setThreads(previous);
      setError(err instanceof ApiError ? `Delete failed (${err.status})` : "Delete failed");
    } finally {
      setBusyThreadId(null);
    }
  }

  function logout() {
    api
      .post("/api/v1/auth/logout")
      .catch(() => undefined)
      .finally(() => {
        localStorage.removeItem(ACTIVE_THREAD_KEY);
        navigate("/login");
      });
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    try {
      const next: ChatAttachment[] = [];
      for (const f of files) {
        // PDFs go through the dedicated RAG upload endpoint instead of being
        // inlined into the chat payload.
        const isPdf =
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          const tid = await ensureThread();
          await pdfApi.upload(tid, f);
          // The PdfPanel's own polling will pick this up on its next thread load;
          // force a refresh by toggling a key on it via threadId is not needed
          // because the panel re-fetches when threadId changes. Instead, we
          // emit a small custom event the panel can listen to — simplest: just
          // reload the panel by bumping a counter.
          setPdfRefreshKey((n) => n + 1);
          continue;
        }
        next.push(await fileToAttachment(f));
      }
      if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    }
  }

  /**
   * Ensure the user has an active thread; create one if not. Returns its id.
   * Used by the PDF upload flow which needs a thread to attach to.
   */
  async function ensureThread(): Promise<string> {
    if (threadId) return threadId;
    const t = await threadsApi.create();
    setThreads((prev) => [t, ...prev]);
    setThreadId(t.id);
    setMessages([]);
    setModel(null);
    return t.id;
  }

  function addSnippet() {
    if (!snippetOpen || !snippetText.trim()) {
      setSnippetOpen(null);
      setSnippetText("");
      setSnippetLang("");
      return;
    }
    setAttachments((prev) =>
      [
        ...prev,
        inlineSnippetAttachment(snippetOpen, snippetText, snippetLang || undefined),
      ].slice(0, 10),
    );
    setSnippetOpen(null);
    setSnippetText("");
    setSnippetLang("");
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;

    const messageText = text || "(see attachments)";
    const tempId = `tmp-${Date.now()}`;
    const sentAttachments = attachments;
    const isImageRequest = IMAGE_INTENT_RE.test(messageText);
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: messageText, attachments: sentAttachments },
    ]);
    setInput("");
    setAttachments([]);
    setSending(true);
    setGeneratingImage(isImageRequest);

    try {
      const data = await api.post<ChatResponse>("/api/v1/chat/send", {
        message: messageText,
        thread_id: threadId,
        attachments: sentAttachments,
        rag_enabled: ragEnabled,
      });
      setModel(data.model);
      setThreadId(data.thread_id);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === tempId ? { ...m, id: data.user_message_id } : m,
        ),
        {
          id: data.assistant_message_id,
          role: "assistant",
          content: data.reply,
          serverAttachments: data.attachments,
        },
      ]);
      refreshThreads();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        localStorage.removeItem(ACTIVE_THREAD_KEY);
        navigate("/login");
        return;
      }
      let msg = "Network error \u2014 is the backend running?";
      if (err instanceof ApiError) {
        const data = err.data as
          | { detail?: unknown }
          | null;
        const detail = data?.detail;
        let detailText: string;
        if (typeof detail === "string") {
          detailText = detail;
        } else if (Array.isArray(detail)) {
          detailText = detail
            .map((d: { loc?: unknown[]; msg?: string }) =>
              d?.msg ? `${(d.loc ?? []).join(".")}: ${d.msg}` : JSON.stringify(d),
            )
            .join("; ");
        } else if (detail !== undefined) {
          detailText = JSON.stringify(detail);
        } else {
          detailText = "request failed";
        }
        msg = `Error ${err.status}: ${detailText}`;
      }
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: msg },
      ]);
    } finally {
      setSending(false);
      setGeneratingImage(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <ThreadList
        threads={threads}
        activeId={threadId}
        busyId={busyThreadId}
        onSelect={(id) => loadThread(id)}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Amzur AI Chat</h1>
            {model && <p className="text-xs text-slate-500">model: {model}</p>}
          </div>
          <button
            onClick={logout}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </header>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-700 hover:underline"
            >
              dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {loading && (
              <p className="text-center text-sm text-slate-400">Loading…</p>
            )}
            {!loading && messages.length === 0 && (
              <p className="text-center text-sm text-slate-400">
                Start the conversation by sending a message below.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mb-2">
                      <AttachmentList items={m.attachments} />
                    </div>
                  )}
                  {m.role === "assistant" ? (
                    <RichContent content={m.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                  {m.serverAttachments && m.serverAttachments.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {m.serverAttachments.some((a) => a.kind === "file" && a.attachment_id) && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.serverAttachments
                            .filter((a) => a.kind === "file" && a.attachment_id)
                            .map((c, i) => {
                              const href = pdfApi.fileUrl(c.attachment_id!, c.page);
                              return (
                                <a
                                  key={`cite-${i}`}
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Open ${c.name ?? "PDF"}${c.page ? ` at p.${c.page}` : ""}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <span>📎</span>
                                  <span className="max-w-[180px] truncate">
                                    {c.name ?? "source"}
                                    {c.page ? ` p.${c.page}` : ""}
                                  </span>
                                </a>
                              );
                            })}
                        </div>
                      )}
                      {m.serverAttachments.map((att, i) => {
                        const src =
                          att.url && att.url.startsWith("http")
                            ? att.url
                            : att.url
                            ? `${API_BASE_URL}${att.url}`
                            : undefined;
                        return att.kind === "image" && src ? (
                          <figure key={i} className="flex flex-col gap-1">
                            <img
                              src={src}
                              alt={att.prompt ?? "generated image"}
                              loading="lazy"
                              className="max-w-full rounded-lg border border-slate-200"
                            />
                            <figcaption className="flex gap-3 text-xs text-slate-500">
                              <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:underline"
                              >
                                Open in new tab
                              </a>
                              <a
                                href={src}
                                download
                                className="hover:underline"
                              >
                                Download
                              </a>
                            </figcaption>
                          </figure>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                  {generatingImage ? "Generating image\u2026" : "Thinking\u2026"}
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-slate-200 bg-white px-4 py-3"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <PdfPanel
              key={`${threadId ?? "none"}:${pdfRefreshKey}`}
              threadId={threadId}
              onEnsureThread={ensureThread}
              ragEnabled={ragEnabled}
              onRagEnabledChange={setRagEnabled}
            />
            {attachments.length > 0 && (
              <AttachmentList
                items={attachments}
                onRemove={(i) =>
                  setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                }
              />
            )}
            {snippetOpen && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold capitalize">
                    Add {snippetOpen} snippet
                  </span>
                  {snippetOpen === "code" && (
                    <input
                      value={snippetLang}
                      onChange={(e) => setSnippetLang(e.target.value)}
                      placeholder="language (e.g. ts, py)"
                      className="w-40 rounded border border-slate-300 px-2 py-0.5 text-xs"
                    />
                  )}
                </div>
                <textarea
                  value={snippetText}
                  onChange={(e) => setSnippetText(e.target.value)}
                  rows={4}
                  placeholder={
                    snippetOpen === "formula"
                      ? "e.g. \\frac{a}{b} = c"
                      : snippetOpen === "table"
                      ? "Paste CSV or Markdown table"
                      : "Paste code"
                  }
                  className="w-full rounded border border-slate-300 p-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSnippetOpen(null);
                      setSnippetText("");
                      setSnippetLang("");
                    }}
                    className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addSnippet}
                    className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Attach
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.csv,.xlsx,.xls,.tex,.mml,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cc,.cpp,.h,.cs,.go,.rs,.rb,.php,.sh,.sql,.yml,.yaml,.html,.css"
                onChange={handleFiles}
                className="hidden"
              />
              <div className="relative">
                <button
                  type="button"
                  title="Add attachment"
                  onClick={() => setAddMenuOpen((v) => !v)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-lg leading-none text-slate-700 hover:bg-slate-100"
                >
                  +
                </button>
                {addMenuOpen && (
                  <div
                    className="absolute bottom-full left-0 z-10 mb-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                    onMouseLeave={() => setAddMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <span>📎</span> File / Image / Video
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setSnippetOpen("code");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <span>{"</>"}</span> Code snippet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setSnippetOpen("table");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <span>⊞</span> Table
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setSnippetOpen("formula");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <span>∑</span> Formula (LaTeX)
                    </button>
                  </div>
                )}
              </div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="submit"
                disabled={sending || (!input.trim() && attachments.length === 0)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
