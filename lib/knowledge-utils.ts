export interface Passage {
  text: string;
  page?: number;
  chunkIndex: number;
}
export interface Citation extends Passage {
  id: string;
  docId: string;
  docName: string;
  version?: string;
  score?: number;
}
export function chunkPages(
  pages: { text: string; page?: number }[],
  size = 500,
  overlap = 100,
): Passage[] {
  if (size <= overlap || overlap < 0)
    throw new Error("Invalid chunk size or overlap");
  const chunks: Passage[] = [];
  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start += size - overlap) {
      chunks.push({
        text: words.slice(start, start + size).join(" "),
        ...(page.page ? { page: page.page } : {}),
        chunkIndex: chunks.length,
      });
      if (start + size >= words.length) break;
    }
  }
  return chunks;
}
export function citationId(
  docId: string,
  version: string | undefined,
  chunkIndex: number,
) {
  return `${docId}:${version ?? "legacy"}:${chunkIndex}`;
}
export function parseCitations(content: unknown): Citation[] {
  try {
    const raw =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("")
          : "";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.results)
      ? parsed.results.filter(
          (r: Citation) =>
            r &&
            typeof r.id === "string" &&
            typeof r.docId === "string" &&
            typeof r.docName === "string" &&
            typeof r.text === "string" &&
            Number.isInteger(r.chunkIndex),
        )
      : [];
  } catch {
    return [];
  }
}
export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "txt",
  "md",
  "csv",
  "json",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
];
export function validateFileName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240 ||
    /[/\\]/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("Enter a valid file name (up to 240 characters)");
  if (!ALLOWED_EXTENSIONS.includes(value.split(".").pop()?.toLowerCase() ?? ""))
    throw new Error("Unsupported file type");
  return value.trim();
}
export function collectionName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("Collection must be up to 80 characters");
  return value.trim();
}

export function scopeToolInput(
  input: Record<string, unknown>,
  docIds: string[],
) {
  if (input.type === "tool_call")
    return {
      ...input,
      args: { ...(input.args as Record<string, unknown>), doc_ids: docIds },
    };
  return { ...input, doc_ids: docIds };
}
