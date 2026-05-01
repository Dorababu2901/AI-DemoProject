/**
 * Centralized API client.
 *
 * All HTTP calls to the backend MUST go through this module.
 * Components and hooks should import the `api` object below;
 * they should never call `fetch` directly.
 */

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Path relative to BASE_URL, e.g. "/api/v1/chat". */
  path: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let authTokenProvider: () => string | null = () => null;

/**
 * Register a function that returns the current auth token (e.g. JWT).
 * Called on every request so token rotation is picked up automatically.
 */
export function setAuthTokenProvider(provider: () => string | null): void {
  authTokenProvider = provider;
}

async function request<T>({
  path,
  method = "GET",
  body,
  headers,
  signal,
}: RequestOptions): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers ?? {}),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const token = authTokenProvider();
  if (token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "path" | "method" | "body">) =>
    request<T>({ ...options, path, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "path" | "method" | "body">) =>
    request<T>({ ...options, path, method: "POST", body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "path" | "method" | "body">) =>
    request<T>({ ...options, path, method: "PUT", body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "path" | "method" | "body">) =>
    request<T>({ ...options, path, method: "PATCH", body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, "path" | "method" | "body">) =>
    request<T>({ ...options, path, method: "DELETE" }),
};

export const API_BASE_URL = BASE_URL;
