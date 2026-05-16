// Shared API response shapes and domain types.

export interface MessageAttachment {
  kind: "image" | "file" | "video" | "table" | "formula" | "code";
  url?: string;
  mime?: string;
  name?: string;
  prompt?: string;
}

export interface ChatSendResponse {
  reply: string;
  model: string;
  thread_id: string;
  user_message_id: string;
  assistant_message_id: string;
  attachments?: MessageAttachment[];
}

// ---------- Project 10: Research Digest Agent ----------
// Reserved placeholders. Filled in during feature implementation.

export interface ResearchRequest {
  query: string;
  max_results?: number;
  max_iterations?: number;
}

export interface Paper {
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  published?: string;
  updated?: string;
  pdf_url?: string;
  categories?: string[];
}

export interface PaperSummary {
  arxiv_id: string;
  summary: string;
  key_findings: string[];
  relevance_score?: number;
}

export interface Citation {
  arxiv_id: string;
  quote: string;
  page?: number;
}

export interface ResearchDigest {
  query: string;
  papers: Paper[];
  summaries: PaperSummary[];
  citations: Citation[];
  synthesis: string;
  generated_at: string;
}

export type AgentEventType =
  | "thought"
  | "tool_call"
  | "tool_result"
  | "paper_found"
  | "paper_summarized"
  | "decision"
  | "synthesis_chunk"
  | "digest"
  | "error"
  | "done";

export interface AgentEvent {
  type: AgentEventType;
  data?: Record<string, unknown> | string | null;
  iteration?: number;
  timestamp?: string;
}

/** Alias kept for compatibility with the spec's wording. */
export type DigestChunk = AgentEvent;
