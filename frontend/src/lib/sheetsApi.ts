import { api, API_BASE_URL } from "./api";

export interface SheetDataset {
  id: number;
  name: string;
  source: "csv" | "xlsx" | "google_sheet" | string;
  source_ref: string | null;
  columns: string[];
  row_count: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetPreview {
  columns: string[];
  dtypes: Record<string, string>;
  rows: unknown[][];
  row_count: number;
}

export interface SheetAskResponse {
  answer: string;
  code?: string | null;
  columns?: string[] | null;
  rows?: unknown[][] | null;
  history_id?: number | null;
}

export interface SheetHistoryItem {
  id: number;
  question: string;
  answer: string;
  code?: string | null;
  created_at: string;
}

const BASE = "/api/v1/sheets";

export const sheetsApi = {
  list: () => api.get<SheetDataset[]>(`${BASE}/datasets`),

  get: (id: number) => api.get<SheetDataset>(`${BASE}/datasets/${id}`),

  preview: (id: number) =>
    api.get<DatasetPreview>(`${BASE}/datasets/${id}/preview`),

  remove: (id: number) =>
    api.delete<null>(`${BASE}/datasets/${id}`),

  uploadFile: async (
    file: File,
    name?: string,
    worksheet?: string,
  ): Promise<SheetDataset> => {
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("name", name);
    if (worksheet) fd.append("worksheet", worksheet);
    // FormData uses the api client so cookies + auth are applied consistently.
    const res = await fetch(`${API_BASE_URL}${BASE}/datasets/upload`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(
        typeof data?.detail === "string" ? data.detail : `Upload failed (${res.status})`,
      );
    }
    return (await res.json()) as SheetDataset;
  },

  addGoogleSheet: (body: {
    name: string;
    sheet_url: string;
    worksheet?: string;
  }) => api.post<SheetDataset>(`${BASE}/datasets/google`, body),

  ask: (
    id: number,
    body: { question: string; history?: { role: string; content: string }[] },
  ) => api.post<SheetAskResponse>(`${BASE}/datasets/${id}/ask`, body),

  history: (id: number) =>
    api.get<SheetHistoryItem[]>(`${BASE}/datasets/${id}/history`),
};
