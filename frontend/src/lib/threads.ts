import { api } from "./api";

export interface ThreadSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRead {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  attachments?: ServerAttachment[] | null;
}

export interface ServerAttachment {
  kind: "image" | "file" | "video" | "table" | "formula" | "code";
  url?: string;
  mime?: string;
  name?: string;
  prompt?: string;
}

export interface ThreadWithMessages extends ThreadSummary {
  messages: ChatMessageRead[];
}

export const threadsApi = {
  list: () => api.get<ThreadSummary[]>("/api/v1/threads"),
  get: (id: string) => api.get<ThreadWithMessages>(`/api/v1/threads/${id}`),
  create: (title?: string) =>
    api.post<ThreadSummary>("/api/v1/threads", { title: title ?? null }),
  rename: (id: string, title: string) =>
    api.patch<ThreadSummary>(`/api/v1/threads/${id}`, { title }),
  remove: (id: string) =>
    api.delete<void>(`/api/v1/threads/${id}`),
};
