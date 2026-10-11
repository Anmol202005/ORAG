import type { Citation } from "../../../lib/knowledge-utils";
export type { Citation };
export interface Document {
  docId: string;
  docName: string;
  status?:
    | "uploading"
    | "extracting"
    | "indexing"
    | "ready"
    | "error"
    | "deleting";
  collection?: string;
  progress?: number;
  totalChunks?: number;
  uploadedAt: string;
  updatedAt?: string;
  error?: string;
  version?: string;
  sourceProvider?: "drive" | "notion";
}
export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
  citations?: Citation[];
  bookmarked?: boolean;
}
export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  docIds: string[];
  revision: number;
}
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  bookmarkedCount: number;
  revision: number;
}
export interface Connection {
  provider: "drive" | "notion";
  lastSyncedAt?: string;
  error?: string;
  pending?: number;
  syncing?: boolean;
  folderId?: string;
}
export interface Integrations {
  canManage: boolean;
  driveConfigured: boolean;
  connections: Connection[];
}
export function authHeaders() {
  const token =
    localStorage.getItem("auth_token") ??
    localStorage.getItem("access_token") ??
    sessionStorage.getItem("token");
  return {
    Authorization: `Bearer ${token ?? ""}`,
    "Content-Type": "application/json",
  };
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  slug: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `/api/orgs/${encodeURIComponent(slug)}/${path}`,
    {
      ...init,
      headers: { ...authHeaders(), ...init.headers },
      cache: "no-store",
    },
  );
  if (response.status === 401) {
    localStorage.removeItem("auth_token");
    window.location.assign("/auth");
    throw new Error("Your session expired. Sign in again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.error ?? `Request failed (${response.status})`,
      response.status,
    );
  return data as T;
}
export async function streamAnswer(
  slug: string,
  messages: Message[],
  docIds: string[],
  onToken: (token: string) => void,
  onCitations: (citations: Citation[]) => void,
) {
  const response = await fetch(`/api/orgs/${encodeURIComponent(slug)}/agent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.content,
      })),
      doc_ids: docIds,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `Answer failed (${response.status})`);
  }
  if (!response.body) throw new Error("No answer stream received");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    complete = false;
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") {
      if (value === "[DONE]") complete = true;
      return;
    }
    const event = JSON.parse(value);
    if (event.type === "token") onToken(event.content);
    if (event.type === "citations") onCitations(event.citations);
    if (event.type === "done") complete = true;
    if (event.type === "error")
      throw new Error(event.message ?? "Answer failed");
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach((line) => consume(line.trim()));
      if (done) {
        if (buffer.trim()) consume(buffer.trim());
        break;
      }
    }
    if (!complete)
      throw new Error(
        "The answer was interrupted. Your partial response has been kept.",
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
