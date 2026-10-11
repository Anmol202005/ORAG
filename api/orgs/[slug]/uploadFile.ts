// api/orgs/[slug]/uploadFile.ts
import type { VercelResponse } from "@vercel/node";
import { Pinecone } from "@pinecone-database/pinecone";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../../../lib/dynamo.js";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del, get } from "@vercel/blob";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";

// ── Config ────────────────────────────────────────────────────────────────────
export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false, // required — lets handleUpload read the raw body itself
  },
};

dotenv.config({ path: "./.env" });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index({ name: process.env.PINECONE_INDEX_NAME! });
const TABLE = process.env.TABLE_NAME!;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_EXTENSIONS = [
  "pdf", "docx", "txt", "md", "csv",
  "json", "ts", "tsx", "js", "jsx", "py",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function batchArray<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

// Trust filename extension over MIME type — mobile browsers frequently
// send application/octet-stream regardless of the actual file type
async function extractText(buffer: Buffer, _mime: string, name: string): Promise<string> {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer, CanvasFactory });
    try {
      const data = await parser.getText();
      return data.text;
    } finally {
      await parser.destroy();
    }
  }

  if (lowerName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // .txt, .md, .csv, .json, .ts, .tsx, .js, .jsx, .py — all plain text
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

  const { orgId } = req.orgMember!;

  // Manually read + parse body since bodyParser is disabled
  let body: HandleUploadBody & { blobUrl?: string; fileName?: string };
  try {
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
    body = JSON.parse(raw.toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Invalid or missing JSON body" });
  }

  // ── Phase 1: Token generation ──────────────────────────────────────────────
  // Client sends { type: "blob.generate-client-token", ... }
  // We validate by extension only — MIME types are unreliable on mobile.
  if (body?.type === "blob.generate-client-token") {
    try {
      const jsonResponse = await handleUpload({
        body,
        request: req as any,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const fileName = clientPayload ?? pathname;
          const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error(`File type .${ext} is not supported`);
          }

          return {
            // No allowedContentTypes — mobile sends wrong MIME types
            // (e.g. application/octet-stream for .csv, .docx, .ts etc.)
            // Extension check above is the only gate we need.
            maximumSizeInBytes: MAX_FILE_SIZE,
            tokenPayload: JSON.stringify({ orgId }),
            addRandomSuffix: true,
          };
        },
      });

      return res.status(200).json(jsonResponse);
    } catch (err: any) {
      return res.status(400).json({ error: err.message ?? "Token generation failed" });
    }
  }

  // ── Phase 2: Process the uploaded blob ────────────────────────────────────
  // Client sends { blobUrl, fileName } after uploading to Vercel Blob.
  const { blobUrl, fileName } = body;

  if (!blobUrl || !fileName) {
    return res.status(400).json({ error: "Missing blobUrl or fileName" });
  }

  // Validate extension again server-side — never trust the client alone
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ error: `File type .${ext} is not supported` });
  }

  let blobBuffer: Buffer;
  let contentType: string;

  try {
    const result = await get(blobUrl, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    if (!result || result.statusCode !== 200) {
      return res.status(502).json({ error: "Could not retrieve uploaded file from blob store" });
    }

    contentType = result.blob.contentType ?? "application/octet-stream";

    // Stream → Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.stream as any) {
      chunks.push(chunk);
    }
    blobBuffer = Buffer.concat(chunks);

    if (blobBuffer.length > MAX_FILE_SIZE) {
      await del(blobUrl);
      return res.status(413).json({ error: "File exceeds the 100 MB limit" });
    }
  } catch (err: any) {
    return res.status(502).json({ error: `Could not retrieve uploaded file: ${err.message}` });
  }

  // Extract text — pass contentType for reference but extraction is driven by fileName
  let rawText: string;
  try {
    rawText = await extractText(blobBuffer, contentType, fileName);
  } catch (err: any) {
    await del(blobUrl);
    return res.status(422).json({ error: `Text extraction failed: ${err.message}` });
  }

  if (!rawText.trim()) {
    await del(blobUrl);
    return res.status(422).json({ error: "Could not extract any text from the file" });
  }

  const chunks = chunkText(rawText);
  const docId = randomUUID();
  const timestamp = Date.now();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // 1️⃣ Upsert chunks into Pinecone
  const records = chunks.map((chunk, i) => ({
    _id: `${orgId}-${safeFileName}-${timestamp}-chunk${i}`,
    text: chunk,
    source_file: fileName,
    doc_id: docId,
    org_id: orgId,
    chunk_index: i,
    total_chunks: chunks.length,
    uploaded_at: new Date().toISOString(),
  }));

  const batches = batchArray(records, 96);
  for (const batch of batches) {
    await index.upsertRecords({ records: batch });
  }

  // 2️⃣ Write document record to DynamoDB
  await createDocumentRecord(docId, fileName, orgId, chunks.length);

  // 3️⃣ Delete the blob — fully processed, no need to keep it
  await del(blobUrl);

  return res.status(200).json({
    success: true,
    docId,
    file: fileName,
    org_id: orgId,
    chunks_upserted: records.length,
  });
};

export default compose(
  withCors,
  withAuth,
  withOrgMember(["owner", "admin", "member"]),
)(handler);