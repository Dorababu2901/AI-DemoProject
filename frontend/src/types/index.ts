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
