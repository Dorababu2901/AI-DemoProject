import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  threadsApi,
  type ChatMessageRead,
  type ThreadSummary,
} from "../../lib/threads";
import ThreadList from "./ThreadList";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  model: string;
  thread_id: string;
  user_message_id: string;
  assistant_message_id: string;
}

const ACTIVE_THREAD_KEY = "active_thread_id";

function toMessage(m: ChatMessageRead): Message | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  return { id: m.id, role: m.role, content: m.content };
}

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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const data = await api.post<ChatResponse>("/api/v1/chat/send", {
        message: text,
        thread_id: threadId,
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
        },
      ]);
      refreshThreads();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Error ${err.status}: ${
              (err.data as { detail?: string } | null)?.detail ?? "request failed"
            }`
          : "Network error — is the backend running?";
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: msg },
      ]);
    } finally {
      setSending(false);
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
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                  Thinking…
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-slate-200 bg-white px-4 py-3"
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
