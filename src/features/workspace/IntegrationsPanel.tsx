import { useState } from "react";
import Modal from "./Modal";
import { api, type Integrations } from "./api";
export default function IntegrationsPanel({
  slug,
  data,
  onClose,
  onChanged,
}: {
  slug: string;
  data: Integrations;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [folder, setFolder] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const run = async (
    provider: "drive" | "notion",
    action: "connect" | "sync" | "disconnect",
  ) => {
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      let folderId = folder.trim();
      if (folderId.includes("/folders/"))
        folderId = folderId.split("/folders/")[1].split(/[?#/]/)[0];
      const response = await api<{
        url?: string;
        imported?: number;
        removed?: number;
        pending?: number;
      }>(
        slug,
        action === "disconnect"
          ? `integrations?provider=${provider}`
          : "integrations",
        {
          method: action === "disconnect" ? "DELETE" : "POST",
          ...(action !== "disconnect"
            ? {
                body: JSON.stringify({
                  provider,
                  action,
                  ...(provider === "drive" ? { folderId } : { token }),
                }),
              }
            : {}),
        },
      );
      setToken("");
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
      if (action === "sync")
        setNotice(
          `Refreshed ${response.imported} documents and removed ${response.removed}.${response.pending ? ` ${response.pending} still pending; sync again to continue.` : ""}`,
        );
      if (action === "disconnect")
        setNotice(
          "Source disconnected. Imported documents remain in your workspace; you can delete them individually.",
        );
      if (action === "connect")
        setNotice("Connected. Select Sync now to import shared pages.");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Source operation failed");
    } finally {
      setBusy("");
    }
  };
  return (
    <Modal title="Connected sources" onClose={onClose}>
      <p className="muted">
        Imported content is available to everyone in this organization. Sources
        refresh daily when scheduled sync is configured. Sync now to refresh
        immediately.
      </p>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="workspace-notice">
          {notice}
        </p>
      )}
      {(["drive", "notion"] as const).map((provider) => {
        const connection = data.connections.find(
          (c) => c.provider === provider,
        );
        return (
          <section className="integration-card" key={provider}>
            <h3>{provider === "drive" ? "Google Drive" : "Notion"}</h3>
            {connection ? (
              <>
                <p className="muted">
                  {connection.syncing
                    ? "Syncing…"
                    : connection.lastSyncedAt
                      ? `Last refreshed ${new Date(connection.lastSyncedAt).toLocaleString()}`
                      : "Connected · waiting for first sync"}
                </p>
                {connection.pending ? (
                  <p className="muted">
                    {connection.pending} documents pending
                  </p>
                ) : null}
                {connection.error && (
                  <p className="workspace-error">{connection.error}</p>
                )}
                {data.canManage && (
                  <div className="workspace-actions">
                    <button
                      disabled={!!busy || connection.syncing}
                      className="primary"
                      onClick={() => run(provider, "sync")}
                    >
                      {busy === provider ? "Working…" : "Sync now"}
                    </button>
                    <button
                      disabled={!!busy || connection.syncing}
                      onClick={() => run(provider, "disconnect")}
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </>
            ) : data.canManage ? (
              <>
                {provider === "drive" ? (
                  <>
                    <label>
                      Folder URL or ID
                      <input
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/…"
                      />
                    </label>
                    <p className="muted">
                      Imports supported files and Google Docs in this folder and
                      its subfolders.
                    </p>
                    {!data.driveConfigured && (
                      <p className="muted">
                        An administrator must configure Google OAuth and the
                        callback URL on the server.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <label>
                      Notion connection token
                      <input
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Paste your internal connection token"
                      />
                    </label>
                    <p className="muted">
                      Share the pages you want indexed with this Notion
                      connection. ORAG imports their text, including nested
                      blocks and tables.
                    </p>
                  </>
                )}
                <button
                  className="primary"
                  disabled={
                    !!busy ||
                    (provider === "drive"
                      ? !data.driveConfigured || !folder.trim()
                      : !token.trim())
                  }
                  onClick={() => run(provider, "connect")}
                >
                  {busy === provider
                    ? "Connecting…"
                    : `Connect ${provider === "drive" ? "Google Drive" : "Notion"}`}
                </button>
              </>
            ) : (
              <p className="muted">
                An organization owner or admin can connect this source.
              </p>
            )}
          </section>
        );
      })}
    </Modal>
  );
}
