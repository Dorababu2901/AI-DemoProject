/**
 * SSE streaming helper for the Research Digest Agent.
 *
 * Wraps `fetch()` + a `ReadableStream` reader to parse `text/event-stream`
 * frames and dispatch them to caller-provided handlers as typed
 * `AgentEvent` chunks.
 */
import type { AgentEvent } from "../types";
import { API_BASE_URL, getAuthToken } from "./api";

export interface StreamHandlers {
  onEvent?: (event: AgentEvent) => void;
  onError?: (err: unknown) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

function parseSseFrame(frame: string): { event?: string; data: string } | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value =
      colon === -1
        ? ""
        : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function streamAgent(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
): Promise<void> {
  const url = path.startsWith("http")
    ? path
    : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: handlers.signal,
    });
  } catch (err) {
    handlers.onError?.(err);
    return;
  }

  if (!response.ok || !response.body) {
    let text = "";
    try {
      text = await response.text();
    } catch {
      /* ignore */
    }
    handlers.onError?.(
      new Error(`stream failed: HTTP ${response.status} ${text}`),
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Per the spec the line
      // terminator may be \n, \r\n, or \r — so the frame separator can be
      // \n\n, \r\n\r\n, or \r\r. Normalize to \n to keep the splitter simple.
      buffer = buffer.replace(/\r\n?/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;
        try {
          const evt = JSON.parse(parsed.data) as AgentEvent;
          handlers.onEvent?.(evt);
        } catch (err) {
          handlers.onError?.(err);
        }
      }
    }
    // flush trailing frame if any
    if (buffer.trim().length > 0) {
      const parsed = parseSseFrame(buffer);
      if (parsed) {
        try {
          const evt = JSON.parse(parsed.data) as AgentEvent;
          handlers.onEvent?.(evt);
        } catch (err) {
          handlers.onError?.(err);
        }
      }
    }
    handlers.onDone?.();
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      handlers.onDone?.();
      return;
    }
    handlers.onError?.(err);
  }
}
