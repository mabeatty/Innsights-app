// Google Drive folder picker for the invoice/draw backup link.
//
// Uses Google Identity Services (OAuth, the logged-in user's own account) plus
// the Google Picker API. Requires two build-time env vars:
//   VITE_GOOGLE_API_KEY    — API key restricted to the Picker API
//   VITE_GOOGLE_CLIENT_ID  — OAuth client ID (Web application)
//
// Falls back to a manual "paste a link" input if the picker is unconfigured or
// fails to load.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, ExternalLink, Link as LinkIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API_KEY = (import.meta as any).env?.VITE_GOOGLE_API_KEY as string | undefined;
const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

let gisPromise: Promise<void> | null = null;
let pickerPromise: Promise<void> | null = null;

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
const ensurePicker = () =>
  (pickerPromise ??= loadScript("https://apis.google.com/js/api.js").then(
    () => new Promise<void>((resolve) => (window as any).gapi.load("picker", { callback: () => resolve() })),
  ));

function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (!g?.accounts?.oauth2) { reject(new Error("Google Identity Services not available")); return; }
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => (resp?.error ? reject(new Error(resp.error)) : resolve(resp.access_token)),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

interface Props {
  value: string;
  onChange: (url: string) => void;
}

export default function DriveFolderPicker({ value, onChange }: Props) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [loading, setLoading] = useState(false);

  const configured = !!API_KEY && !!CLIENT_ID;

  const pick = async () => {
    if (!configured) {
      toast.error("Google Drive picker isn't configured yet — paste the folder link instead.");
      setShowPaste(true);
      return;
    }
    setLoading(true);
    try {
      await Promise.all([ensureGis(), ensurePicker()]);
      const token = await getAccessToken();
      const g = (window as any).google;
      const view = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder")
        .setIncludeFolders(true);
      const picker = new g.picker.PickerBuilder()
        .enableFeature(g.picker.Feature.SUPPORT_DRIVES) // show Shared Drives
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === g.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc) {
              onChange(doc.url || `https://drive.google.com/drive/folders/${doc.id}`);
              setFolderName(doc.name || "Selected folder");
            }
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e: any) {
      console.error("[drive-picker]", e);
      toast.error(e?.message || "Couldn't open the Drive picker — paste the link instead.");
      setShowPaste(true);
    } finally {
      setLoading(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center gap-2 text-sm text-primary hover:underline truncate"
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">{folderName || value}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <Button type="button" variant="outline" size="sm" onClick={pick} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Change"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" className="gap-2" onClick={pick} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
        Select Drive Folder
      </Button>
      {showPaste ? (
        <div className="relative">
          <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            placeholder="Paste Google Drive folder URL"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : (
        <button type="button" className="block text-xs text-muted-foreground hover:underline" onClick={() => setShowPaste(true)}>
          or paste a link
        </button>
      )}
    </div>
  );
}
