import { Pinecone } from "@pinecone-database/pinecone";
import { PDFParse } from "pdf-parse";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });
    
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const index = pc.index({
  name: process.env.PINECONE_INDEX_NAME!,
});

async function extractText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mime = file.type;
  const name = file.name.toLowerCase();

  // Plain text / markdown / CSV / JSON / source code
  if (
    mime.startsWith("text/") ||
    [".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".txt"].some(
      (ext) => name.endsWith(ext),
    )
  ) {
    return buffer.toString("utf-8");
  }

  // PDF
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return data.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}

function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }

      const rawText = await extractText(file);

      if (!rawText.trim()) {
        return Response.json(
          { error: "Could not extract any text from the file" },
          { status: 422 },
        );
      }

      const chunks = chunkText(rawText);

      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

      const records = chunks.map((chunk, i) => ({
        _id: `${safeFileName}-${timestamp}-chunk${i}`,
        text: chunk,
        source_file: file.name,
        org_name: "demoOrg",
        chunk_index: i,
        total_chunks: chunks.length,
        uploaded_at: new Date().toISOString(),
      }));

      await index.upsertRecords({ records });

      return Response.json({
        success: true,
        file: file.name,
        chunks_upserted: records.length,
      });
    } catch (err: unknown) {
      console.error("[upload] error:", err);
      const message =
        err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
};
