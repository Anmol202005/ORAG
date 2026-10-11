import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { queryAll } from "../../lib/knowledge.js";
import { syncConnection, type Provider } from "../../lib/integrations.js";
export const config = { maxDuration: 300 };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const actual = req.headers.authorization ?? "";
  if (
    !process.env.CRON_SECRET ||
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "GET") return res.status(405).end();
  const started = Date.now();
  const results: { orgId: string; provider: string; success: boolean }[] = [];
  const sources = await queryAll("SYNC#ACTIVE", "");
  // Prioritize sources with the oldest sync attempt to avoid starving later organizations.
  const { connection } = await import("../../lib/integrations.js");
  const ordered = await Promise.all(
    sources.map(async (source) => ({
      orgId: String(source.orgId),
      provider: source.provider as Provider,
      last:
        (await connection(String(source.orgId), source.provider as Provider))
          ?.lastAttemptedAt ?? "",
    })),
  );
  ordered.sort((a, b) => a.last.localeCompare(b.last));
  for (const source of ordered) {
    if (Date.now() - started > 30_000) break; // reserve the remaining function budget for one sync
    try {
      await syncConnection(String(source.orgId), source.provider as Provider);
      results.push({
        orgId: String(source.orgId),
        provider: String(source.provider),
        success: true,
      });
    } catch {
      results.push({
        orgId: String(source.orgId),
        provider: String(source.provider),
        success: false,
      });
    }
  }
  return res.json({
    processed: results.length,
    total: sources.length,
    results,
  });
}
