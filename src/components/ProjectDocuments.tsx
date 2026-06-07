import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronRight, Plus, Trash2, ExternalLink, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const FOLDERS = ["Drawings", "Permits", "Contracts", "Other"] as const;
type FolderName = (typeof FOLDERS)[number];

interface DocRow {
  id: string;
  project_id: string;
  folder_name: string;
  document_name: string;
  drive_url: string;
  added_by: string;
  created_at: string;
}

interface OrgMember {
  user_id: string;
  email: string;
}

export default function ProjectDocuments({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const { user, accessLevel } = useAuth();
  const canEdit = accessLevel !== "view";
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(FOLDERS));
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add document state
  const [addFolder, setAddFolder] = useState<FolderName | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [newDriveUrl, setNewDriveUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // Send dialog state
  const [sendDoc, setSendDoc] = useState<DocRow | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setDocs((data as unknown as DocRow[]) ?? []);
  }, [projectId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Fetch org members for autocomplete
  useEffect(() => {
    if (!user) return;
    const fetchMembers = async () => {
      // Get org members
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .not("user_id", "is", null);
      if (!members || members.length === 0) return;

      const userIds = members.map(m => m.user_id).filter(Boolean) as string[];
      // Get emails via edge function
      const { data, error } = await supabase.functions.invoke("get-team-emails", {
        body: { userIds },
      });
      if (error || !data?.emails) return;
      const emailMap = data.emails as Record<string, string>;
      setOrgMembers(
        Object.entries(emailMap).map(([uid, email]) => ({ user_id: uid, email }))
      );
    };
    fetchMembers();
  }, [user]);

  const handleAdd = async () => {
    if (!addFolder || !newDocName.trim() || !newDriveUrl.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from("project_documents").insert({
      project_id: projectId,
      folder_name: addFolder,
      document_name: newDocName.trim(),
      drive_url: newDriveUrl.trim(),
      added_by: user.id,
    });
    if (error) {
      toast.error(`Failed to add document: ${error.message}`);
    } else {
      toast.success("Document added.");
      setAddFolder(null);
      setNewDocName("");
      setNewDriveUrl("");
      await fetchDocs();
    }
    setAdding(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from("project_documents").delete().eq("id", deleteTarget.id);
    toast.success("Document deleted.");
    setDeleteTarget(null);
    setDeleting(false);
    await fetchDocs();
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard.");
  };

  const openSendDialog = (doc: DocRow) => {
    setSendDoc(doc);
    setSendTo("");
    setSendMessage(
      `Please find the following document from the ${projectName ?? "project"} project: ${doc.document_name} — ${doc.drive_url}`
    );
    setShowSuggestions(false);
  };

  const handleSend = async () => {
    if (!sendDoc || !sendTo.trim()) return;
    setSending(true);
    const { error } = await supabase.functions.invoke("send-document-email", {
      body: {
        to: sendTo.split(",").map(e => e.trim()).filter(Boolean),
        subject: `Document Shared: ${sendDoc.document_name}`,
        message: sendMessage,
      },
    });
    if (error) {
      toast.error("Failed to send email.");
    } else {
      toast.success("Email sent successfully.");
      setSendDoc(null);
    }
    setSending(false);
  };

  const toggleFolder = (f: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });

  // Email autocomplete filtering
  const emailSuggestions = orgMembers.filter(m =>
    sendTo.length > 0 && m.email.toLowerCase().includes(sendTo.split(",").pop()?.trim().toLowerCase() ?? "")
  );

  const addEmailSuggestion = (email: string) => {
    const parts = sendTo.split(",").map(e => e.trim()).filter(Boolean);
    // Replace the last partial entry
    parts.pop();
    parts.push(email);
    setSendTo(parts.join(", ") + ", ");
    setShowSuggestions(false);
  };

  // Get user email for display
  const getUserEmail = (userId: string) => {
    const member = orgMembers.find(m => m.user_id === userId);
    return member?.email ?? userId.slice(0, 8) + "…";
  };

  return (
    <div className="space-y-3 pt-2">
      {FOLDERS.map((folder) => {
        const folderDocs = docs.filter((d) => d.folder_name === folder);
        const isOpen = openFolders.has(folder);
        return (
          <Collapsible key={folder} open={isOpen} onOpenChange={() => toggleFolder(folder)}>
            <div className="flex items-center justify-between rounded-md border px-4 py-2 bg-muted/30">
              <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="text-sm font-medium">{folder}</span>
                <span className="text-xs text-muted-foreground">({folderDocs.length})</span>
              </CollapsibleTrigger>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAddFolder(folder); setNewDocName(""); setNewDriveUrl(""); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              )}
            </div>
            <CollapsibleContent>
              {folderDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 px-6">No documents yet.</p>
              ) : (
                <div className="border rounded-b-md divide-y">
                  {folderDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/20">
                      <button
                        onClick={() => window.open(doc.drive_url, "_blank", "noopener,noreferrer")}
                        className="flex items-center gap-2 text-primary hover:underline text-left truncate flex-1 min-w-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.document_name}</span>
                      </button>
                      <div className="flex items-center gap-3 ml-4 shrink-0 text-muted-foreground text-xs">
                        <span className="hidden sm:inline">{getUserEmail(doc.added_by)}</span>
                        <span>{format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copy link"
                          onClick={() => copyLink(doc.drive_url)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Send"
                              onClick={() => openSendDialog(doc)}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(doc)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Add Document Dialog */}
      <Dialog open={!!addFolder} onOpenChange={(o) => !o && setAddFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document to {addFolder}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document Name</Label>
              <Input
                placeholder="e.g. Floor Plan Rev 3"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Google Drive URL</Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={newDriveUrl}
                onChange={(e) => setNewDriveUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFolder(null)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !newDocName.trim() || !newDriveUrl.trim()}>
              {adding ? "Adding…" : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={!!sendDoc} onOpenChange={(o) => !o && setSendDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5 relative">
              <Label>To (comma-separated emails)</Label>
              <Input
                placeholder="email@example.com"
                value={sendTo}
                onChange={(e) => { setSendTo(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {showSuggestions && emailSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-popover border rounded-md shadow-md mt-1 max-h-32 overflow-y-auto">
                  {emailSuggestions.map((m) => (
                    <button
                      key={m.user_id}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                      onMouseDown={(e) => { e.preventDefault(); addEmailSuggestion(m.email); }}
                    >
                      {m.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                rows={4}
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDoc(null)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending || !sendTo.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deleteTarget?.document_name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
