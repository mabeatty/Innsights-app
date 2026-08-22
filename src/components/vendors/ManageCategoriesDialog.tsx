import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, GitMerge, X } from "lucide-react";
import { toast } from "sonner";

export interface VendorCategory {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  categories: VendorCategory[];
  vendorCountByCategory: Record<string, number>; // keyed by category name
  onChanged: () => void; // reload categories + vendors in the parent
}

/**
 * Categories are managed centrally here rather than typed freely per vendor.
 * Renaming updates every vendor currently using that category name in one
 * pass; merging reassigns all vendors from one category to another and
 * removes the source category, so near-duplicates (e.g. "Seating" vs "Soft
 * Seating") can be consolidated without hand-editing each vendor.
 */
export default function ManageCategoriesDialog({ open, onOpenChange, organizationId, categories, vendorCountByCategory, onChanged }: Props) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error("That category already exists.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("vendor_categories").insert({ org_id: organizationId, name });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Category added.");
    setNewCategoryName("");
    onChanged();
  };

  const startRename = (c: VendorCategory) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
    setMergingId(null);
  };

  const saveRename = async (c: VendorCategory) => {
    const name = renameValue.trim();
    if (!name || name === c.name) { setRenamingId(null); return; }
    if (categories.some((other) => other.id !== c.id && other.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Another category already has that name — use Merge instead if you want to combine them.");
      return;
    }
    setBusy(true);
    // Update every vendor using the old name, then rename the category record.
    const { error: vendorError } = await supabase.from("global_vendors").update({ category: name }).eq("category", c.name).eq("org_id", organizationId);
    if (vendorError) { toast.error(vendorError.message); setBusy(false); return; }
    const { error } = await supabase.from("vendor_categories").update({ name }).eq("id", c.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Renamed to "${name}".`);
    setRenamingId(null);
    onChanged();
  };

  const startMerge = (c: VendorCategory) => {
    setMergingId(c.id);
    setMergeTargetId("");
    setRenamingId(null);
  };

  const confirmMerge = async (source: VendorCategory) => {
    const target = categories.find((c) => c.id === mergeTargetId);
    if (!target) { toast.error("Pick a category to merge into."); return; }
    setBusy(true);
    const { error: vendorError } = await supabase.from("global_vendors").update({ category: target.name }).eq("category", source.name).eq("org_id", organizationId);
    if (vendorError) { toast.error(vendorError.message); setBusy(false); return; }
    const { error } = await supabase.from("vendor_categories").delete().eq("id", source.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Merged "${source.name}" into "${target.name}".`);
    setMergingId(null);
    onChanged();
  };

  const deleteCategory = async (c: VendorCategory) => {
    const count = vendorCountByCategory[c.name] ?? 0;
    if (count > 0) {
      toast.error(`${count} vendor${count === 1 ? " uses" : "s use"} this category — merge or reassign them first.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("vendor_categories").delete().eq("id", c.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Category deleted.");
    onChanged();
  };

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Vendor Categories</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
          />
          <Button size="sm" className="gap-1.5 shrink-0" onClick={addCategory} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        <div className="space-y-1.5">
          {sorted.map((c) => {
            const count = vendorCountByCategory[c.name] ?? 0;
            return (
              <div key={c.id} className="rounded-md border p-2">
                {renamingId === c.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 text-sm"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(c); }}
                      autoFocus
                    />
                    <Button size="sm" className="h-8 shrink-0" onClick={() => saveRename(c)} disabled={busy}>Save</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setRenamingId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : mergingId === c.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm shrink-0">Merge into:</span>
                    <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choose target category" /></SelectTrigger>
                      <SelectContent>
                        {sorted.filter((other) => other.id !== c.id).map((other) => (
                          <SelectItem key={other.id} value={other.id}>{other.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 shrink-0" onClick={() => confirmMerge(c)} disabled={busy || !mergeTargetId}>Merge</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setMergingId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{count} vendor{count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Rename" onClick={() => startRename(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Merge into another category" onClick={() => startMerge(c)}>
                        <GitMerge className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteCategory(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No categories yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
