import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const port = 4179;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let browser;
const failures = [];
let documents = [
  {
    docId: "doc-1",
    docName: "Handbook.txt",
    status: "ready",
    collection: "Engineering",
    totalChunks: 1,
    uploadedAt: "2026-10-11T00:00:00Z",
    version: "v1",
  },
];
const chats = new Map();
let connected = false;
let savedRequests = [];
let uploadAttempts = 0;
let conflictingId = "";
const citation = {
  id: "doc-1:v1:0",
  docId: "doc-1",
  docName: "Handbook.txt",
  version: "v1",
  text: "New team members start with the engineering handbook.",
  chunkIndex: 0,
  page: 2,
};
try {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.ORAG_TEST_CHROMIUM_PATH
      ? { executablePath: process.env.ORAG_TEST_CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "ui-test-token");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postDataJSON();
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (/\/api\/orgs\/acme\/?$/.test(url.pathname))
      return json({
        org: {
          orgId: "org1",
          name: "Acme Engineering",
          slug: "acme",
          role: "owner",
        },
      });
    if (url.pathname.endsWith("/documents")) {
      if (req.method() === "GET")
        return url.searchParams.has("id")
          ? documents.find((doc) => doc.docId === url.searchParams.get("id"))
            ? json({
                document: documents.find(
                  (doc) => doc.docId === url.searchParams.get("id"),
                ),
                chunks: [{ text: citation.text, chunkIndex: 0, page: 2 }],
                legacy: false,
              })
            : json({ error: "Document not found" }, 404)
          : json({ documents });
      if (req.method() === "PATCH") {
        documents = documents.map((doc) =>
          doc.docId === body.docId
            ? { ...doc, docName: body.docName, collection: body.collection }
            : doc,
        );
        return json({ success: true });
      }
      if (req.method() === "DELETE") {
        documents = documents.filter(
          (doc) => doc.docId !== url.searchParams.get("id"),
        );
        return json({ success: true });
      }
      if (body.action === "prepare") {
        uploadAttempts++;
        return json(
          { error: "A duplicate of this file is already in your workspace" },
          400,
        );
      }
    }
    if (url.pathname.endsWith("/chats")) {
      if (req.method() === "PUT") {
        if (body.id === conflictingId)
          return json({ error: "This chat changed in another tab." }, 409);
        const prior = chats.get(body.id);
        if ((prior?.revision ?? 0) !== body.expectedRevision)
          return json({ error: "Chat changed in another tab" }, 409);
        const revision = body.expectedRevision + 1;
        chats.set(body.id, {
          ...body,
          revision,
          updatedAt: new Date().toISOString(),
        });
        savedRequests.push(body);
        return json({ revision });
      }
      if (req.method() === "DELETE") {
        chats.delete(url.searchParams.get("id"));
        return json({ success: true });
      }
      if (url.searchParams.has("id"))
        return json({ chat: chats.get(url.searchParams.get("id")) });
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      return json({
        chats: [...chats.values()]
          .filter((chat) =>
            `${chat.title} ${chat.messages.map((m) => m.content).join(" ")}`
              .toLowerCase()
              .includes(search),
          )
          .map((chat) => ({
            ...chat,
            messageCount: chat.messages.length,
            bookmarkedCount: chat.messages.filter((m) => m.bookmarked).length,
          })),
      });
    }
    if (url.pathname.endsWith("/integrations")) {
      if (req.method() === "GET")
        return json({
          canManage: true,
          driveConfigured: true,
          connections: connected
            ? [{ provider: "notion", lastSyncedAt: "2026-10-11T00:00:00Z" }]
            : [],
        });
      if (req.method() === "DELETE") {
        connected = false;
        return json({ success: true });
      }
      if (body.action === "connect") {
        assert.equal(body.token, "test-notion-connection-token");
        connected = true;
        return json({ success: true });
      }
      if (body.action === "sync")
        return json({ imported: 2, removed: 1, pending: 0 });
    }
    if (url.pathname.endsWith("/agent")) {
      assert.deepEqual(body.doc_ids, ["doc-1"]);
      assert.equal(body.messages.filter((m) => m.role === "user").length, 1);
      return route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ type: "citations", citations: [citation] })}\n\ndata: ${JSON.stringify({ type: "token", content: 'Start with the **engineering handbook** [[cite:doc-1:v1:0]]. <img src=x onerror="alert(1)">' })}\n\ndata: {"type":"done"}\n\n`,
      });
    }
    return json({ error: "Unexpected fixture endpoint" }, 404);
  });
  await page.goto(`${base}/org/acme`);
  await page.getByRole("heading", { name: "Acme Engineering" }).waitFor();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("textbox", { name: "Ask a question" })
    .fill("What should a new team member read?");
  await page.getByRole("button", { name: "Send →", exact: true }).click();
  await page.getByText("engineering handbook", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Send →", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector('.workspace-title [role="status"]')
        ?.textContent === "Saved",
  );
  assert.equal(
    await page.locator(".workspace-message img").count(),
    0,
    "model output must render as text",
  );
  assert.equal([...chats.values()][0].messages.length, 2);
  await page.getByRole("button", { name: "[1]", exact: true }).click();
  await page.getByRole("dialog", { name: "Source passage" }).waitFor();
  assert.match(await page.locator(".source-evidence").innerText(), /page 2/i);
  await page.locator(".preview-passage.highlighted").waitFor();
  assert.equal(await page.locator(".preview-passage.highlighted").count(), 1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .locator(".workspace-message.ai")
    .getByRole("button", { name: "Bookmark", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.workspace-title [role="status"]')
        ?.textContent === "Saved",
  );
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(await page.locator(".workspace-message").count(), 1);
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  const title = "Team onboarding";
  await page.getByRole("textbox", { name: "Conversation title" }).fill(title);
  await page.getByRole("textbox", { name: "Ask a question" }).focus();
  await page.getByRole("button", { name: "+ New chat", exact: true }).click();
  await page
    .getByRole("heading", { name: "Answers from your team's knowledge." })
    .waitFor();
  await page.getByRole("button", { name: /^Chats/ }).click();
  await page
    .getByRole("textbox", { name: "Search conversations" })
    .fill("engineering handbook");
  await page
    .locator(".workspace-chat-row")
    .getByRole("button", { name: /^Team onboarding/ })
    .waitFor();
  await page
    .locator(".workspace-chat-row")
    .getByRole("button", { name: /^Team onboarding/ })
    .click();
  await page.getByText("engineering handbook", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Conversation title" })
      .inputValue(),
    title,
  );
  assert.equal([...chats.values()][0].messages[1].bookmarked, true);
  await page.getByRole("button", { name: /^Sources/ }).click();
  await page.getByRole("button", { name: "Manage Handbook.txt" }).click();
  await page
    .getByRole("textbox", { name: "File name" })
    .fill("Getting-started.txt");
  await page.getByRole("textbox", { name: "Collection" }).fill("Onboarding");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage Getting-started.txt" })
    .waitFor();
  assert.equal(documents[0].collection, "Onboarding");
  conflictingId = [...chats.keys()][0];
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Local changes");
  await page.getByRole("textbox", { name: "Ask a question" }).focus();
  await page
    .getByRole("button", { name: "Save as new conversation", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Save as new conversation", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".workspace-title input")?.value ===
      "Local changes (copy)",
  );
  assert.equal(chats.size, 2);
  assert.equal(chats.get(conflictingId).title, "Team onboarding");
  await page.getByRole("button", { name: /^Connected sources/ }).click();
  await page
    .getByRole("textbox", { name: "Notion connection token" })
    .fill("test-notion-connection-token");
  await page
    .getByRole("button", { name: "Connect Notion", exact: true })
    .click();
  await page.getByRole("button", { name: "Sync now", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page
    .getByText("Refreshed 2 documents and removed 1.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect Notion", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Upload documents", { exact: true }).setInputFiles({
    name: "duplicate.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("test"),
  });
  await page
    .getByRole("button", { name: "Retry upload", exact: true })
    .waitFor();
  assert.match(
    await page.locator(".workspace-upload").innerText(),
    /duplicate/,
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/documents") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Retry upload", exact: true }).click(),
  ]);
  assert.equal(uploadAttempts, 2);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Retry upload" && !button.disabled,
    ),
  );
  await mkdir("/tmp/orag-ui", { recursive: true });
  await page.screenshot({
    path: "/tmp/orag-ui/workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page
    .getByRole("button", { name: "Manage Getting-started.txt" })
    .click();
  await page.getByRole("dialog", { name: "Manage document" }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile layout must not overflow",
  );
  await page.screenshot({
    path: "/tmp/orag-ui/workspace-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page
    .getByText("Your knowledge starts here.", { exact: true })
    .waitFor();
  assert.equal(documents.length, 0);
  await page.getByRole("button", { name: /^Chats/ }).click();
  await page
    .getByRole("button", { name: "Delete Team onboarding", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Local changes (copy)", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Delete Local changes (copy)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete conversation", exact: true })
    .click();
  await page.getByText("No matching conversations.", { exact: true }).waitFor();
  assert.equal(chats.size, 0);
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log(
    `UI checks passed: cited chat, safe output rendering, persistence, concurrent-edit recovery, bookmarks, history search, document preview/rename/collections/deletion, source connection/sync/disconnect, failed upload retry, and mobile layout. ${savedRequests.length} saves verified.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
