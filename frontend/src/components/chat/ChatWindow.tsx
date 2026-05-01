import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  model: string;
}

export default function ChatWindow() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState<string | null>(null);

  function logout() {
    localStorage.removeItem("auth_token");
    navigate("/login");
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const history: ChatTurn[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const data = await api.post<ChatResponse>("/api/v1/chat/send", {
        message: text,
        history,
      });
      setModel(data.model);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Error ${err.status}: ${
              (err.data as { detail?: string } | null)?.detail ?? "request failed"
            }`
          : "Network error — is the backend running?";
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: msg },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Amzur AI Chat</h1>
          {model && (
            <p className="text-xs text-slate-500">model: {model}</p>
          )}
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
          {messages.length === 0 && (
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
                    : "bg-white text-slate-800 border border-slate-200"
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
  );
}
