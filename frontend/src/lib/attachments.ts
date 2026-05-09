// Attachment types shared between the picker UI and the chat send payload.

export type AttachmentKind =
  | "image"
  | "video"
  | "table"
  | "formula"
  | "code"
  | "file";

export interface ChatAttachment {
  kind: AttachmentKind;
  name?: string;
  mime?: string;
  /** Inline text content (table CSV, formula source, code, transcript). */
  text?: string;
  /** Data URL — used for images (and previewing videos in the UI). */
  data?: string;
  /** Code language hint (e.g. "ts", "py"). */
  language?: string;
}

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp)$/i;
const VIDEO_MIME = /^video\/(mp4|x-msvideo|quicktime|avi)$/i;
const CODE_EXT = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "c", "cc", "cpp", "h", "cs",
  "go", "rs", "rb", "php", "sh", "bash", "ps1", "sql", "yml", "yaml",
  "json", "xml", "html", "css", "scss", "kt", "swift", "scala",
]);
// File extensions that are binary documents — we cannot meaningfully inline
// their text in the browser without a parser, so we only attach metadata.
const BINARY_DOC_EXT = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "zip", "rar", "7z", "tar", "gz",
]);

const MAX_INLINE_BYTES = 10 * 1024 * 1024; // 10 MB cap per attachment
const MAX_INLINE_TEXT = 180_000; // stay under backend 200k limit

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result));
    r.readAsText(file);
  });
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_INLINE_BYTES) {
    throw new Error(`"${file.name}" exceeds 10 MB inline limit`);
  }
  const mime = file.type || "";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (IMAGE_MIME.test(mime)) {
    return {
      kind: "image",
      name: file.name,
      mime,
      data: await readAsDataURL(file),
    };
  }
  if (VIDEO_MIME.test(mime) || ["mp4", "avi", "mov"].includes(ext)) {
    return {
      kind: "video",
      name: file.name,
      mime: mime || `video/${ext}`,
      data: await readAsDataURL(file),
      text: `Video file attached (${file.name}, ${file.size} bytes). ` +
        `The model cannot view the video frames directly; describe what you'd like analyzed.`,
    };
  }
  if (mime === "text/csv" || ext === "csv") {
    return {
      kind: "table",
      name: file.name,
      mime: "text/csv",
      text: await readAsText(file),
    };
  }
  if (ext === "xlsx" || ext === "xls") {
    return {
      kind: "table",
      name: file.name,
      mime,
      text: `[Spreadsheet ${file.name} attached but not parsed in-browser. ` +
        `Paste the data as CSV/Markdown for full analysis.]`,
    };
  }
  if (BINARY_DOC_EXT.has(ext)) {
    return {
      kind: "file",
      name: file.name,
      mime: mime || `application/${ext}`,
      text:
        `[Binary document ${file.name} (${ext.toUpperCase()}, ${file.size} bytes) attached. ` +
        `The browser cannot extract its text without a parser. ` +
        `Please paste the relevant text or convert to .txt/.md for full analysis.]`,
    };
  }
  if (ext === "tex" || ext === "mml") {
    return {
      kind: "formula",
      name: file.name,
      mime,
      text: await readAsText(file),
    };
  }
  if (CODE_EXT.has(ext) || mime.startsWith("text/")) {
    const text = await readAsText(file);
    return {
      kind: "code",
      name: file.name,
      mime: mime || "text/plain",
      language: CODE_EXT.has(ext) ? ext : undefined,
      text: text.length > MAX_INLINE_TEXT ? text.slice(0, MAX_INLINE_TEXT) : text,
    };
  }
  // Fallback — try text, else just record metadata.
  try {
    const text = await readAsText(file);
    return {
      kind: "file",
      name: file.name,
      mime,
      text: text.length > MAX_INLINE_TEXT ? text.slice(0, MAX_INLINE_TEXT) : text,
    };
  } catch {
    return { kind: "file", name: file.name, mime };
  }
}

export function inlineSnippetAttachment(
  kind: "code" | "table" | "formula",
  text: string,
  language?: string,
): ChatAttachment {
  return {
    kind,
    name: `inline.${kind}`,
    text,
    language,
  };
}
