import { api, API_BASE_URL } from "./api";

export type PdfStatus = "pending" | "indexing" | "indexed" | "failed";

export interface PdfAttachment {
  id: string;
  thread_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  status: PdfStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const pdfApi = {
  async upload(threadId: string, file: File): Promise<PdfAttachment> {
    const fd = new FormData();
    fd.append("file", file);
    // FormData sets its own boundary; the api client skips JSON content-type for FormData.
    const res = await fetch(
      `${API_BASE_URL}/api/v1/threads/${threadId}/attachments`,
      { method: "POST", body: fd, credentials: "include" },
    );
    if (!res.ok) {
      let detail: unknown = await res.text();
      try {
        detail = JSON.parse(detail as string);
      } catch {
        /* keep text */
      }
      const msg =
        typeof detail === "object" && detail && "detail" in (detail as object)
          ? String((detail as { detail: unknown }).detail)
          : `Upload failed (${res.status})`;
      throw new Error(msg);
    }
    return (await res.json()) as PdfAttachment;
  },

  list: (threadId: string) =>
    api.get<PdfAttachment[]>(`/api/v1/threads/${threadId}/attachments`),

  status: (id: string) => api.get<PdfAttachment>(`/api/v1/attachments/${id}`),

  remove: (id: string) =>
    api.delete<void>(`/api/v1/attachments/${id}`),

  fileUrl: (id: string, page?: number) => {
    const base = `${API_BASE_URL}/api/v1/attachments/${id}/file`;
    return page ? `${base}#page=${page}` : base;
  },
};
