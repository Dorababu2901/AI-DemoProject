import { api } from "./api";

export type Dialect = "sqlite" | "postgresql" | "mysql" | "mssql";

export interface SqlConnection {
  id: number;
  name: string;
  dialect: string;
  created_at: string;
  owner_id: string | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
}
export interface ForeignKeyInfo {
  column: string;
  referred_table: string;
  referred_column: string;
}
export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  foreign_keys: ForeignKeyInfo[];
  row_count: number | null;
  sample_rows: Record<string, unknown>[];
}
export interface SchemaOut {
  dialect: string;
  tables: TableInfo[];
}

export interface ChartHint {
  type: "bar" | "line" | "pie" | "none";
  x?: string | null;
  y?: string | null;
}
export interface QueryResponse {
  sql: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  explanation: string;
  suggested_chart: ChartHint;
  history_id?: number | null;
}
export interface HistoryItem {
  id: number;
  question: string;
  sql: string;
  explanation: string;
  created_at: string;
}

const BASE = "/api/v1/sql";

export const sqlApi = {
  list: () => api.get<SqlConnection[]>(`${BASE}/connections`),

  create: (body: { name: string; dialect: Dialect; connection_string: string }) =>
    api.post<SqlConnection>(`${BASE}/connections`, body),

  remove: (id: number) => api.delete<null>(`${BASE}/connections/${id}`),

  getSchema: (id: number) => api.get<SchemaOut>(`${BASE}/connections/${id}/schema`),

  history: (id: number) => api.get<HistoryItem[]>(`${BASE}/connections/${id}/history`),

  ask: (body: {
    connection_id: number;
    question: string;
    history?: { role: string; content: string }[];
  }) => api.post<QueryResponse>(`${BASE}/query`, body),

  explain: (body: {
    question: string;
    sql: string;
    columns: string[];
    rows: unknown[][];
  }) => api.post<{ explanation: string }>(`${BASE}/query/explain`, body),
};
