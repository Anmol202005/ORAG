import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { Pinecone } from "@pinecone-database/pinecone";
import { put, get, del } from "@vercel/blob";
import { randomUUID, createHash } from "node:crypto";
import { docClient } from "./dynamo.js";
import { chunkPages, type Passage } from "./knowledge-utils.js";
export const tableName = () =>
  process.env.DYNAMO_TABLE_NAME ?? process.env.TABLE_NAME!;
export type DocumentStatus =
  | "uploading"
  | "extracting"
  | "indexing"
  | "ready"
  | "error"
  | "deleting";
export interface DocumentRecord {
  docId: string;
  orgId: string;
  docName: string;
  status: DocumentStatus;
  uploadedAt: string;
  updatedAt?: string;
  collection?: string;
  totalChunks?: number;
  version?: string;
  snapshotUrl?: string;
  blobUrl?: string;
  contentHash?: string;
  error?: string;
  progress?: number;
  lockUntil?: number;
  processingStartedAt?: number;
  sourceProvider?: "drive" | "notion";
  sourceId?: string;
  sourceUpdatedAt?: string;
}
export const docKey = (orgId: string, docId: string) => ({
  pk: `ORG#${orgId}`,
  sk: `DOC#${docId}`,
});
export function vectorIndex() {
  return new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index({
    name: process.env.PINECONE_INDEX_NAME!,
  });
}
export async function getDocument(
  orgId: string,
  docId: string,
): Promise<DocumentRecord | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: docKey(orgId, docId),
      ConsistentRead: true,
    }),
  );
  const record = result.Item as DocumentRecord | undefined;
  return record ? documentStatus(record) : undefined;
}
export async function queryAll(pk: string, prefix: string) {
  const items: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const response = await docClient.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: prefix
          ? "pk = :pk AND begins_with(sk, :prefix)"
          : "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": pk,
          ...(prefix ? { ":prefix": prefix } : {}),
        },
        ExclusiveStartKey: cursor,
        ConsistentRead: true,
      }),
    );
    items.push(...(response.Items ?? []));
    cursor = response.LastEvaluatedKey;
  } while (cursor);
  return items;
}
export function documentStatus(record: DocumentRecord): DocumentRecord {
  if (
    ["uploading", "extracting", "indexing"].includes(record.status) &&
    Date.now() -
      (record.processingStartedAt ?? new Date(record.uploadedAt).getTime()) >
      600_000
  )
    return {
      ...record,
      status: "error",
      error:
        "Processing was interrupted. Retry indexing or choose the file again.",
    };
  return record;
}
export async function listDocuments(orgId: string) {
  return (
    (await queryAll(`ORG#${orgId}`, "DOC#")) as unknown as DocumentRecord[]
  ).map(documentStatus);
}
export async function updateDocument(
  orgId: string,
  docId: string,
  fields: Record<string, unknown>,
  condition = "attribute_exists(pk)",
  extra: Record<string, unknown> = {},
) {
  const entries = Object.entries(fields).filter(
    ([, value]) => value !== undefined,
  );
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: docKey(orgId, docId),
      UpdateExpression: `SET ${entries.map((_, i) => `#f${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(
        entries.map(([key], i) => [`#f${i}`, key]),
      ),
      ExpressionAttributeValues: {
        ...Object.fromEntries(entries.map(([, value], i) => [`:v${i}`, value])),
        ...extra,
      },
      ConditionExpression: condition,
    }),
  );
}
export async function readBlob(url: string): Promise<Buffer> {
  const result = await knowledgeServices.get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream)
    throw new Error("Document content is unavailable");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}
export async function extractPages(
  buffer: Buffer,
  name: string,
): Promise<{ text: string; page?: number }[]> {
  if (buffer.length > 100 * 1024 * 1024)
    throw new Error("File exceeds the 100 MB limit");
  if (name.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const { CanvasFactory } = await import("pdf-parse/worker");
    const parser = new PDFParse({ data: buffer, CanvasFactory });
    try {
      const data = await parser.getText();
      return data.pages.map((page) => ({ text: page.text, page: page.num }));
    } finally {
      await parser.destroy();
    }
  }
  if (name.toLowerCase().endsWith(".docx")) {
    const { extractRawText } = await import("mammoth");
    return [{ text: (await extractRawText({ buffer })).value }];
  }
  return [{ text: buffer.toString("utf8") }];
}
export const knowledgeServices = { vectorIndex, put, get, del, extractPages };
export async function removeVectors(
  orgId: string,
  docId: string,
  version?: string,
) {
  await knowledgeServices
    .vectorIndex()
    .deleteMany({
      filter: {
        $and: [
          { org_id: { $eq: orgId } },
          { doc_id: { $eq: docId } },
          ...(version ? [{ version: { $eq: version } }] : []),
        ],
      },
    });
}
export async function indexDocument(
  record: DocumentRecord,
  buffer: Buffer,
  blobUrl?: string,
) {
  const { orgId, docId } = record;
  const operation = randomUUID();
  // A lease prevents simultaneous replacements, retries and deletion. The old version stays searchable until commit.
  await updateDocument(
    orgId,
    docId,
    {
      lockUntil: Date.now() + 360_000,
      processingStartedAt: Date.now(),
      operation,
      status: "extracting",
      error: "",
      progress: 0,
      ...(blobUrl ? { pendingBlobUrl: blobUrl } : {}),
    },
    "attribute_exists(pk) AND (attribute_not_exists(lockUntil) OR lockUntil < :now)" +
      (blobUrl ? " AND uploadId = :upload" : ""),
    {
      ":now": Date.now(),
      ...(blobUrl
        ? { ":upload": (record as unknown as { uploadId: string }).uploadId }
        : {}),
    },
  );
  let snapshotUrl: string | undefined;
  let claimedHash = false;
  const hash = createHash("sha256").update(buffer).digest("hex");
  const hashKey = { pk: `ORG#${orgId}`, sk: `HASH#${hash}` };
  try {
    if (!record.sourceProvider) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: tableName(),
            Item: { ...hashKey, docId },
            ConditionExpression: "attribute_not_exists(pk) OR docId = :doc",
            ExpressionAttributeValues: { ":doc": docId },
          }),
        );
        claimedHash = hash !== record.contentHash;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "ConditionalCheckFailedException"
        )
          throw new Error(
            "This file is already in your workspace. Choose a different file or replace the existing document.",
            { cause: error },
          );
        throw error;
      }
    }
    const chunks = chunkPages(
      await knowledgeServices.extractPages(buffer, record.docName),
    );
    if (!chunks.length && !record.sourceProvider)
      throw new Error(
        "No text could be extracted. Scanned PDFs need OCR before upload.",
      );
    const snapshot = await knowledgeServices.put(
      `orgs/${orgId}/${docId}/${operation}/passages.json`,
      JSON.stringify({ chunks }),
      {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: true,
      },
    );
    snapshotUrl = snapshot.url;
    await updateDocument(
      orgId,
      docId,
      { status: "indexing", progress: 0 },
      "operation = :operation",
      { ":operation": operation },
    );
    const records = chunks.map((chunk) => ({
      _id: `${docId}-${operation}-${chunk.chunkIndex}`,
      text: chunk.text,
      source_file: record.docName,
      org_id: orgId,
      doc_id: docId,
      version: operation,
      chunk_index: chunk.chunkIndex,
      total_chunks: chunks.length,
      ...(chunk.page ? { page: chunk.page } : {}),
    }));
    for (let i = 0; i < records.length; i += 96) {
      await knowledgeServices
        .vectorIndex()
        .upsertRecords({ records: records.slice(i, i + 96) });
      await updateDocument(
        orgId,
        docId,
        {
          progress: Math.round(
            (Math.min(i + 96, records.length) / records.length) * 100,
          ),
        },
        "operation = :operation",
        { ":operation": operation },
      );
    }
    await updateDocument(
      orgId,
      docId,
      {
        docName: record.docName,
        status: "ready",
        progress: 100,
        version: operation,
        snapshotUrl,
        blobUrl: blobUrl ?? "",
        pendingBlobUrl: "",
        contentHash: hash,
        totalChunks: chunks.length,
        updatedAt: new Date().toISOString(),
        lockUntil: 0,
        error: "",
        ...(record.sourceUpdatedAt
          ? { sourceUpdatedAt: record.sourceUpdatedAt }
          : {}),
      },
      "operation = :operation",
      { ":operation": operation },
    );
  } catch (error) {
    await removeVectors(orgId, docId, operation).catch(() => {});
    if (snapshotUrl) await knowledgeServices.del(snapshotUrl).catch(() => {});
    if (claimedHash)
      await docClient
        .send(
          new DeleteCommand({
            TableName: tableName(),
            Key: hashKey,
            ConditionExpression: "docId = :doc",
            ExpressionAttributeValues: { ":doc": docId },
          }),
        )
        .catch(() => {});
    await updateDocument(
      orgId,
      docId,
      {
        status: "error",
        lockUntil: 0,
        error: error instanceof Error ? error.message : "Indexing failed",
      },
      "operation = :operation",
      { ":operation": operation },
    );
    throw error;
  }
  // Cleanup is best-effort: retrieval always checks the committed version, even if old vectors remain.
  if (record.version)
    await removeVectors(orgId, docId, record.version).catch(() => {});
  if (record.snapshotUrl)
    await knowledgeServices.del(record.snapshotUrl).catch(() => {});
  if (record.blobUrl && record.blobUrl !== blobUrl)
    await knowledgeServices.del(record.blobUrl).catch(() => {});
  if (
    !record.sourceProvider &&
    record.contentHash &&
    record.contentHash !== hash
  )
    await docClient
      .send(
        new DeleteCommand({
          TableName: tableName(),
          Key: { pk: `ORG#${orgId}`, sk: `HASH#${record.contentHash}` },
          ConditionExpression: "docId = :doc",
          ExpressionAttributeValues: { ":doc": docId },
        }),
      )
      .catch(() => {});
  return await getDocument(orgId, docId);
}
export async function deleteDocument(record: DocumentRecord) {
  await updateDocument(
    record.orgId,
    record.docId,
    { status: "deleting", lockUntil: Date.now() + 360_000 },
    "attribute_exists(pk) AND (attribute_not_exists(lockUntil) OR lockUntil < :now)",
    { ":now": Date.now() },
  );
  // Hide first; then purge vectors, retained files and metadata. Failed deletion can be retried.
  try {
    await removeVectors(record.orgId, record.docId);
    const urls = [
      record.blobUrl,
      record.snapshotUrl,
      (record as unknown as { pendingBlobUrl?: string }).pendingBlobUrl,
    ].filter((v): v is string => !!v);
    if (urls.length) await knowledgeServices.del([...new Set(urls)]);
    if (record.contentHash && !record.sourceProvider)
      await docClient
        .send(
          new DeleteCommand({
            TableName: tableName(),
            Key: {
              pk: `ORG#${record.orgId}`,
              sk: `HASH#${record.contentHash}`,
            },
            ConditionExpression: "docId = :doc",
            ExpressionAttributeValues: { ":doc": record.docId },
          }),
        )
        .catch(() => {});
    await docClient.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: docKey(record.orgId, record.docId),
      }),
    );
  } catch (error) {
    await updateDocument(record.orgId, record.docId, {
      lockUntil: 0,
      error: "Deletion failed. Retry to finish removing this document.",
    });
    throw error;
  }
}
export async function getPassages(record: DocumentRecord): Promise<Passage[]> {
  if (!record.snapshotUrl) return [];
  return JSON.parse((await readBlob(record.snapshotUrl)).toString("utf8"))
    .chunks;
}
