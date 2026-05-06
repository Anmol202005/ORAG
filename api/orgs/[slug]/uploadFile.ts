// api/orgs/[slug]/uploadFile.ts
import type { VercelResponse } from "@vercel/node";
import { Pinecone } from "@pinecone-database/pinecone";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../../../lib/dynamo";
import { PDFParse } from "pdf-parse";
import { randomUUID } from "crypto";
import formidable from "formidable"; // ← add
import fs from "fs";
import dotenv from "dotenv";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware";

export const config = { api: { bodyParser: false } };
dotenv.config({ path: "./.env" });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index({ name: process.env.PINECONE_INDEX_NAME! });
const TABLE = process.env.TABLE_NAME!;

// ── Helpers (unchanged) ───────────────────────────────────────────────────────

async function extractText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mime = file.type;
  const name = file.name.toLowerCase();

  if (
    mime.startsWith("text/") ||
    [".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".txt"].some(
      (ext) => name.endsWith(ext),
    )
  ) {
    return buffer.toString("utf-8");
  }

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

async function createDocumentRecord(
  docId: string,
  docName: string,
  orgId: string,
  totalChunks: number,
) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `ORG#${orgId}`,
        sk: `DOC#${docId}`,
        docId,
        docName,
        orgId,
        totalChunks,
        uploadedAt: new Date().toISOString(),
        entityType: "DOCUMENT",
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // orgId is guaranteed and membership verified by withOrgMember
  const { orgId } = req.orgMember!;

  // Vercel parses multipart automatically when Content-Type is multipart/form-data
  const form = formidable({ maxFileSize: 20 * 1024 * 1024 });
  const [, files] = await form.parse(req as any);
  const uploaded = files.file?.[0];
  if (!uploaded) {
    return res.status(400).json({ error: "No file provided" });
  }

  const buffer = fs.readFileSync(uploaded.filepath);
  const file = new File([buffer], uploaded.originalFilename ?? "upload", {
    type: uploaded.mimetype ?? "application/octet-stream",
  });

  const rawText = await extractText(file);
  if (!rawText.trim()) {
    return res
      .status(422)
      .json({ error: "Could not extract any text from the file" });
  }

  const chunks = chunkText(rawText);
  const docId = randomUUID();
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  // 1️⃣ Upsert chunks into Pinecone
  const records = chunks.map((chunk, i) => ({
    _id: `${orgId}-${safeFileName}-${timestamp}-chunk${i}`,
    text: chunk,
    source_file: file.name,
    doc_id: docId,
    org_id: orgId,
    chunk_index: i,
    total_chunks: chunks.length,
    uploaded_at: new Date().toISOString(),
  }));

  await index.upsertRecords({ records });

  // 2️⃣ Write document record to DynamoDB
  await createDocumentRecord(docId, file.name, orgId, chunks.length);

  return res.status(200).json({
    success: true,
    docId,
    file: file.name,
    org_id: orgId,
    chunks_upserted: records.length,
  });
};

export default compose(
  withCors,
  withAuth,
  withOrgMember(["owner", "admin"]), // only owner/admin can upload docs
)(handler);
