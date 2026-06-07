import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Brand {
  id: string;
  name: string;
  code: string;
}

export default function BrandsManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchBrands = async () => {
    const { data } = await supabase.from("brands").select("id, name, code").order("name");
    setBrands(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchBrands(); }, []);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "BRAND";
    const { error } = await supabase.from("brands").insert({ name: trimmed, code });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Brand added");
      setNewName("");
      fetchBrands();
    }
    setAdding(false);
  };

  const handleUpdate = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("brands").update({ name: trimmed }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Brand updated");
      setEditingId(null);
      fetchBrands();
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (!confirm(`Delete "${brand.name}"? Projects using this brand may be affected.`)) return;
    const { error } = await supabase.from("brands").delete().eq("id", brand.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Brand deleted");
      fetchBrands();
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading brands…</p>;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-sm font-medium text-foreground mb-1">Brands</h2>
        <p className="text-xs text-muted-foreground">
          Manage the brands available when creating new projects.
        </p>
      </div>

      {/* Add new brand */}
      <div className="flex gap-2">
        <Input
          placeholder="New brand name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={adding || !newName.trim()} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* Brands list */}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {brands.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No brands yet.</p>
          )}
          {brands.map((brand) => (
            <div key={brand.id} className="flex items-center justify-between px-4 py-3 gap-2">
              {editingId === brand.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate(brand.id)}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdate(brand.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-foreground">{brand.name}</span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setEditingId(brand.id); setEditName(brand.name); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(brand)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
