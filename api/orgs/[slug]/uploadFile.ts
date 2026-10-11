import type { VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";
import {
  getDocument,
  indexDocument,
  readBlob,
} from "../../../lib/knowledge.js";
import { validateFileName } from "../../../lib/knowledge-utils.js";
export const config = { maxDuration: 300, api: { bodyParser: false } };
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  const { orgId } = req.orgMember!;
  try {
    const raw: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 64 * 1024)
        return res.status(413).json({ error: "Upload request too large" });
      raw.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(raw).toString("utf8"));
    if (body.type === "blob.generate-client-token") {
      const response = await handleUpload({
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname, payload) => {
          const { docId, uploadId } = JSON.parse(payload ?? "{}");
          const doc = await getDocument(orgId, docId);
          const pending = doc as typeof doc & {
            uploadId?: string;
            pendingFileName?: string;
          };
          if (
            !doc ||
            pending.uploadId !== uploadId ||
            pathname !==
              `orgs/${orgId}/${docId}/${uploadId}/${pending.pendingFileName}`
          )
            throw new Error("Invalid upload session");
          validateFileName(pending.pendingFileName);
          return {
            maximumSizeInBytes: 100 * 1024 * 1024,
            tokenPayload: JSON.stringify({ orgId, docId, uploadId }),
            addRandomSuffix: true,
          };
        },
      });
      return res.json(response);
    }
    const { docId, uploadId, blobUrl } = body;
    if (
      typeof docId !== "string" ||
      typeof uploadId !== "string" ||
      typeof blobUrl !== "string"
    )
      return res.status(400).json({ error: "Upload session required" });
    const document = await getDocument(orgId, docId);
    const pending = document as typeof document & {
      uploadId?: string;
      pendingFileName?: string;
    };
    if (!document || pending.uploadId !== uploadId)
      return res.status(404).json({ error: "Upload session not found" });
    const url = new URL(blobUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".private.blob.vercel-storage.com") ||
      !decodeURIComponent(url.pathname).startsWith(
        `/orgs/${orgId}/${docId}/${uploadId}/`,
      )
    )
      return res
        .status(400)
        .json({ error: "Uploaded file does not belong to this session" });
    const buffer = await readBlob(blobUrl);
    const updated = await indexDocument(
      { ...document, docName: validateFileName(pending.pendingFileName) },
      buffer,
      blobUrl,
    );
    return res.json({ success: true, document: updated });
  } catch (error) {
    return res
      .status(
        error instanceof Error &&
          error.name === "ConditionalCheckFailedException"
          ? 409
          : 400,
      )
      .json({
        error: error instanceof Error ? error.message : "Upload failed",
      });
  }
};
export default compose(withCors, withAuth, withOrgMember())(handler);
