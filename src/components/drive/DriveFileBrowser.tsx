// Custom in-app Google Drive file browser, rooted at the shared "[02] WI -
// Development" Shared Drive. Built separately from DriveFolderPicker.tsx's
// Google Picker widget because that widget has a documented bug: enabling
// Shared Drive support (needed here, since the root is a Shared Drive, ID
// prefix '0A...') triggers an unwanted native OS file dialog instead of
// Google's own picker. This avoids that entirely — same OAuth token
// acquisition (Google Identity Services, the user's own Google account,
// drive.readonly scope), but a hand-built breadcrumb tree UI hitting the
// Drive REST API directly instead of the Picker widget.

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Folder, FileText, ChevronRight, Loader2, Home } from "lucide-react";
import { toast } from "sonner";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

// The Shared Drive root to browse from — "[02] WI - Development".
const ROOT_FOLDER_ID = "0AK2IivAMgu7eUk9PVA";
const ROOT_LABEL = "WI - Development";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}
const isFolder = (item: DriveItem) => item.mimeType === "application/vnd.google-apps.folder";

let gisPromise: Promise<void> | null = null;
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
const ensureGis = () => (gisPromise ??= loadScript("https://accounts.google.com/gsi/client"));

let cachedToken: { token: string; expiresAt: number } | null = null;
function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return Promise.resolve(cachedToken.token);
  }
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (!g?.accounts?.oauth2) { reject(new Error("Google Identity Services not available")); return; }
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp?.error) { reject(new Error(resp.error)); return; }
        cachedToken = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err: any) => reject(new Error(err?.type || "oauth_error")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function listChildren(folderId: string, token: string): Promise<DriveItem[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,webViewLink)",
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
    pageSize: "200",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = await res.json();
  return data.files ?? [];
}

interface DriveFileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: { id: string; name: string; url: string }) => void;
  title?: string;
}

export default function DriveFileBrowser({ open, onOpenChange, onSelect, title }: DriveFileBrowserProps) {
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: ROOT_FOLDER_ID, name: ROOT_LABEL }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = breadcrumb[breadcrumb.length - 1];
  const configured = !!CLIENT_ID;

  const load = useCallback(async (folderId: string) => {
    setLoading(true);
    setError(null);
    try {
      await ensureGis();
      const token = await getAccessToken();
      const children = await listChildren(folderId, token);
      setItems(children);
    } catch (e: any) {
      setError(e?.message || "Couldn't load this folder.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !configured) return;
    setBreadcrumb([{ id: ROOT_FOLDER_ID, name: ROOT_LABEL }]);
    load(ROOT_FOLDER_ID);
  }, [open, configured, load]);

  const openFolder = (item: DriveItem) => {
    const next = [...breadcrumb, { id: item.id, name: item.name }];
    setBreadcrumb(next);
    load(item.id);
  };
  const jumpTo = (index: number) => {
    const next = breadcrumb.slice(0, index + 1);
    setBreadcrumb(next);
    load(next[next.length - 1].id);
  };

  const selectFile = (item: DriveItem) => {
    const url = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    onSelect({ id: item.id, name: item.name, url });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || "Select a file from Drive"}</DialogTitle>
        </DialogHeader>

        {!configured ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Google Drive browsing isn't configured (missing VITE_GOOGLE_CLIENT_ID).
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground pb-1 border-b">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  {i === 0 ? <Home className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <button
                    className={i === breadcrumb.length - 1 ? "font-medium text-foreground" : "hover:underline"}
                    onClick={() => jumpTo(i)}
                    disabled={i === breadcrumb.length - 1}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto -mx-1 px-1">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : error ? (
                <p className="text-sm text-destructive py-6 text-center">{error}</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">This folder is empty.</p>
              ) : (
                <div className="divide-y">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className="w-full flex items-center gap-2.5 px-2 py-2 text-sm hover:bg-muted/40 rounded-sm text-left"
                      onClick={() => (isFolder(item) ? openFolder(item) : selectFile(item))}
                    >
                      {isFolder(item) ? (
                        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate flex-1">{item.name}</span>
                      {isFolder(item) && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
