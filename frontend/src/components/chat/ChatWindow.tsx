import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

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

interface ThreadSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRead {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface ThreadWithMessages extends ThreadSummary {
  messages: ChatMessageRead[];
}

const ACTIVE_THREAD_KEY = "active_thread_id";

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

  // Persist the active thread id so a refresh restores the conversation.
  useEffect(() => {
    if (threadId) localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
    else localStorage.removeItem(ACTIVE_THREAD_KEY);
  }, [threadId]);

  // On mount: load the user's threads and, if we know an active one, its messages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await api.get<ThreadSummary[]>("/api/v1/threads");
        if (cancelled) return;
        setThreads(list);

        const activeId = threadId ?? list[0]?.id ?? null;
        if (activeId) {
          await loadThread(activeId, cancelled);
        }
      } catch {
        // ignore — user might just be unauthenticated; RequireAuth handles redirect
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThread(id: string, cancelled = false) {
    try {
      const t = await api.get<ThreadWithMessages>(`/api/v1/threads/${id}`);
      if (cancelled) return;
      setThreadId(t.id);
      setMessages(
        t.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Thread was deleted server-side; reset.
        setThreadId(null);
        setMessages([]);
      }
    }
  }

  function newThread() {
    setThreadId(null);
    setMessages([]);
    setModel(null);
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
      // Refresh the sidebar so the new/updated thread bubbles up.
      api
        .get<ThreadSummary[]>("/api/v1/threads")
        .then(setThreads)
        .catch(() => undefined);
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
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">
            Conversations
          </span>
          <button
            onClick={newThread}
            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-400">No chats yet.</p>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => loadThread(t.id)}
              className={`block w-full truncate px-4 py-2 text-left text-sm ${
                t.id === threadId
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              title={t.title ?? "(untitled)"}
            >
              {t.title?.trim() || "(untitled)"}
            </button>
          ))}
        </div>
      </aside>

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
