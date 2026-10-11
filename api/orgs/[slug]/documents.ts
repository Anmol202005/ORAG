import type { VercelResponse } from "@vercel/node";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";
import { docClient } from "../../../lib/dynamo.js";
import {
  tableName,
  docKey,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  getPassages,
  readBlob,
  indexDocument,
} from "../../../lib/knowledge.js";
import {
  collectionName,
  validateFileName,
} from "../../../lib/knowledge-utils.js";
export const config = { maxDuration: 300 };
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { orgId } = req.orgMember!;
  try {
    if (req.method === "GET") {
      const id = typeof req.query.id === "string" ? req.query.id : undefined;
      if (!id) return res.json({ documents: await listDocuments(orgId) });
      const document = await getDocument(orgId, id);
      if (!document)
        return res.status(404).json({ error: "Document not found" });
      const chunks = await getPassages(document);
      return res.json({ document, chunks, legacy: !document.snapshotUrl });
    }
    const body = req.body ?? {};
    if (req.method === "POST" && body.action === "prepare") {
      const fileName = validateFileName(body.fileName);
      const collection = collectionName(body.collection ?? "");
      const uploadId = randomUUID();
      const docId =
        typeof body.replaceId === "string" ? body.replaceId : randomUUID();
      const prior = body.replaceId
        ? await getDocument(orgId, docId)
        : undefined;
      if (body.replaceId && !prior)
        return res.status(404).json({ error: "Document not found" });
      if (prior?.sourceProvider)
        return res
          .status(400)
          .json({ error: "Synced documents are updated from their source" });
      if (prior) {
        await updateDocument(
          orgId,
          docId,
          {
            pendingFileName: fileName,
            uploadId,
            processingStartedAt: Date.now(),
            status: "uploading",
            progress: 0,
            error: "",
          },
          "attribute_exists(pk) AND (attribute_not_exists(lockUntil) OR lockUntil < :now)",
          { ":now": Date.now() },
        );
      } else {
        await docClient.send(
          new PutCommand({
            TableName: tableName(),
            Item: {
              ...docKey(orgId, docId),
              docId,
              orgId,
              docName: fileName,
              pendingFileName: fileName,
              uploadId,
              collection,
              processingStartedAt: Date.now(),
              status: "uploading",
              progress: 0,
              uploadedAt: new Date().toISOString(),
            },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
      }
      return res.json({
        docId,
        uploadId,
        pathname: `orgs/${orgId}/${docId}/${uploadId}/${fileName}`,
      });
    }
    const id = req.method === "DELETE" ? req.query.id : body.docId;
    if (typeof id !== "string")
      return res.status(400).json({ error: "Document ID required" });
    const document = await getDocument(orgId, id);
    if (!document) return res.status(404).json({ error: "Document not found" });
    if (req.method === "DELETE") {
      await deleteDocument(document);
      return res.json({ success: true });
    }
    if (req.method === "PATCH") {
      const fields: Record<string, unknown> = {};
      if (body.docName !== undefined)
        fields.docName = validateFileName(body.docName);
      if (body.collection !== undefined)
        fields.collection = collectionName(body.collection);
      if (!Object.keys(fields).length)
        return res.status(400).json({ error: "No changes supplied" });
      await updateDocument(
        orgId,
        id,
        fields,
        "attribute_exists(pk) AND (attribute_not_exists(lockUntil) OR lockUntil < :now)",
        { ":now": Date.now() },
      );
      return res.json({ document: await getDocument(orgId, id) });
    }
    if (req.method === "POST" && body.action === "retry") {
      const pending = document as typeof document & {
        pendingBlobUrl?: string;
        pendingFileName?: string;
      };
      if (!pending.pendingBlobUrl)
        return res
          .status(400)
          .json({ error: "Choose the file again to retry this upload" });
      const updated = await indexDocument(
        { ...document, docName: pending.pendingFileName ?? document.docName },
        await readBlob(pending.pendingBlobUrl),
        pending.pendingBlobUrl,
      );
      return res.json({ document: updated });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    )
      return res
        .status(409)
        .json({
          error: "This document is being processed. Try again shortly.",
        });
    return res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Document operation failed",
      });
  }
};
export default compose(withCors, withAuth, withOrgMember())(handler);
