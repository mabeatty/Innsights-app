import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Save, Trash2, Search, Upload, Building2, BedDouble, Bath, MapPin } from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
}

interface RoomType {
  id: string;
  name: string;
}

interface BathroomType {
  id: string;
  name: string;
}

interface Item {
  id: string;
  item_number: string;
  name: string;
  category: string;
  unit: string;
  unit_price: number;
}

interface LineItem {
  id: string;
  item_id: string;
  quantity_per_room: number;
  items: Item;
}

interface TypeWithCount {
  id: string;
  name: string;
  itemCount: number;
}

type Level = "brands" | "workspace" | "editor";
type EditorKind = "room" | "bathroom" | "publicarea";

/* ── Template Editor (Level 3) ── */
function TemplateEditor({
  brandId,
  typeId,
  typeName,
  tableName,
}: {
  brandId: string;
  typeId: string;
  typeName: string;
  tableName: "room_type_line_items" | "bathroom_type_line_items" | "public_area_type_line_items";
}) {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [checkedItems, setCheckedItems] = useState<Map<string, { item: Item; qty: number }>>(new Map());

  const [pendingItems, setPendingItems] = useState<
    { item_id: string; quantity_per_room: number; items: Item }[]
  >([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [qtyChanges, setQtyChanges] = useState<Map<string, number>>(new Map());

  const fkColumn = tableName === "room_type_line_items" ? "room_type_id" : tableName === "bathroom_type_line_items" ? "bathroom_type_id" : "public_area_type_id";
  const qtyField = tableName === "public_area_type_line_items" ? "quantity" : "quantity_per_room";

  const fetchLineItems = useCallback(async () => {
    setLoading(true);
    let data: any[] | null = null;
    if (tableName === "room_type_line_items") {
      const res = await supabase
        .from("room_type_line_items")
        .select("id, item_id, quantity_per_room, items(id, item_number, name, category, unit, unit_price)")
        .eq("room_type_id", typeId);
      data = res.data;
    } else if (tableName === "bathroom_type_line_items") {
      const res = await supabase
        .from("bathroom_type_line_items")
        .select("id, item_id, quantity_per_room, items(id, item_number, name, category, unit, unit_price)")
        .eq("bathroom_type_id", typeId);
      data = res.data;
    } else {
      const res = await supabase
        .from("public_area_type_line_items")
        .select("id, item_id, quantity, items(id, item_number, name, category, unit, unit_price)")
        .eq("public_area_type_id", typeId);
      // Normalize quantity field to quantity_per_room for uniform handling
      data = (res.data ?? []).map((r: any) => ({ ...r, quantity_per_room: r.quantity }));
    }
    setLineItems((data as unknown as LineItem[]) ?? []);
    setPendingItems([]);
    setRemovedIds(new Set());
    setQtyChanges(new Map());
    setLoading(false);
  }, [typeId, tableName, fkColumn]);

  useEffect(() => {
    if (typeId) fetchLineItems();
  }, [typeId, fetchLineItems]);

  // Search items
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("items")
        .select("id, item_number, name, category, unit, unit_price")
        .eq("brand_id", brandId)
        .or(`item_number.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`)
        .limit(10);
      setSearchResults((data as Item[]) ?? []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, brandId]);

  const toggleChecked = (item: Item) => {
    setCheckedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, { item, qty: 1 });
      }
      return next;
    });
  };

  const updateCheckedQty = (itemId: string, qty: number) => {
    setCheckedItems((prev) => {
      const next = new Map(prev);
      const entry = next.get(itemId);
      if (entry) next.set(itemId, { ...entry, qty });
      return next;
    });
  };

  const handleAddCheckedItems = () => {
    const existingIds = lineItems.filter((li) => !removedIds.has(li.id)).map((li) => li.item_id);
    const pendingIds = pendingItems.map((pi) => pi.item_id);
    let added = 0;
    const newPending: typeof pendingItems = [];
    for (const [, { item, qty }] of checkedItems) {
      if (existingIds.includes(item.id) || pendingIds.includes(item.id)) continue;
      newPending.push({ item_id: item.id, quantity_per_room: qty, items: item });
      added++;
    }
    if (newPending.length > 0) setPendingItems((prev) => [...prev, ...newPending]);
    if (added === 0 && checkedItems.size > 0) toast.error("All selected items already in template.");
    setCheckedItems(new Map());
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveExisting = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  };

  const handleRemovePending = (index: number) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQtyChange = (id: string, qty: number) => {
    setQtyChanges((prev) => new Map(prev).set(id, qty));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (removedIds.size > 0) {
        const { error } = await supabase.from(tableName).delete().in("id", Array.from(removedIds));
        if (error) throw error;
      }
      for (const [id, qty] of qtyChanges) {
        if (removedIds.has(id)) continue;
        const updatePayload = tableName === "public_area_type_line_items" ? { quantity: qty } : { quantity_per_room: qty };
        const { error } = await supabase.from(tableName).update(updatePayload as any).eq("id", id);
        if (error) throw error;
      }
      if (pendingItems.length > 0) {
        if (tableName === "room_type_line_items") {
          const inserts = pendingItems.map((pi) => ({
            room_type_id: typeId,
            item_id: pi.item_id,
            quantity_per_room: pi.quantity_per_room,
          }));
          const { error } = await supabase.from("room_type_line_items").insert(inserts);
          if (error) throw error;
        } else if (tableName === "bathroom_type_line_items") {
          const inserts = pendingItems.map((pi) => ({
            bathroom_type_id: typeId,
            item_id: pi.item_id,
            quantity_per_room: pi.quantity_per_room,
          }));
          const { error } = await supabase.from("bathroom_type_line_items").insert(inserts);
          if (error) throw error;
        } else {
          const inserts = pendingItems.map((pi) => ({
            public_area_type_id: typeId,
            item_id: pi.item_id,
            quantity: pi.quantity_per_room,
          }));
          const { error } = await supabase.from("public_area_type_line_items").insert(inserts as any);
          if (error) throw error;
        }
      }
      toast.success(`${typeName} template saved.`);
      await fetchLineItems();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = removedIds.size > 0 || pendingItems.length > 0 || qtyChanges.size > 0;
  const visibleExisting = lineItems.filter((li) => !removedIds.has(li.id));

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : (
        <>
          {/* Add Items - Multi-select search */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Add Items</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item number or name…"
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-auto divide-y">
                  {searchResults.map((item) => {
                    const checked = checkedItems.has(item.id);
                    const qty = checkedItems.get(item.id)?.qty ?? 1;
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChecked(item)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="font-mono text-xs">{item.item_number}</span>
                          <span className="mx-2">—</span>
                          {item.name}
                          <span className="ml-2 text-xs text-muted-foreground">{item.category}</span>
                        </span>
                        {checked && (
                          <Input
                            type="number"
                            min={1}
                            className="h-7 w-16 text-xs"
                            value={qty}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateCheckedQty(item.id, Number(e.target.value))}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              {checkedItems.size > 0 && (
                <Button size="sm" onClick={handleAddCheckedItems}>
                  <Plus className="h-4 w-4 mr-1" /> Add {checkedItems.size} Selected Item{checkedItems.size > 1 ? "s" : ""}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Save button - always visible at top */}
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>

          {/* Existing items table */}
          {(visibleExisting.length > 0 || pendingItems.length > 0) ? (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Number</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-32">Qty / Room</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExisting.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell className="font-mono text-xs">{li.items.item_number}</TableCell>
                      <TableCell>{li.items.name}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{li.items.category}</span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20"
                          defaultValue={li.quantity_per_room}
                          onChange={(e) => handleQtyChange(li.id, Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveExisting(li.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingItems.map((pi, idx) => (
                    <TableRow key={`pending-${idx}`} className="bg-accent/30">
                      <TableCell className="font-mono text-xs">{pi.items.item_number}</TableCell>
                      <TableCell>{pi.items.name} <span className="text-xs text-muted-foreground italic">(new)</span></TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{pi.items.category}</span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20"
                          value={pi.quantity_per_room}
                          onChange={(e) =>
                            setPendingItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, quantity_per_room: Number(e.target.value) } : p
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemovePending(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No items assigned to this template yet.</p>
          )}
        </>
      )}
    </div>
  );
}

/* ── Brand Card (Level 1) ── */
function BrandCard({
  brand,
  onClick,
  onLogoUploaded,
}: {
  brand: Brand;
  onClick: () => void;
  onLogoUploaded: (brandId: string, url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${brand.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("brand-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("brand-logos").getPublicUrl(path);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    const { error: updateError } = await supabase
      .from("brands")
      .update({ logo_url: publicUrl } as any)
      .eq("id", brand.id);

    if (updateError) {
      toast.error("Failed to save logo.");
    } else {
      toast.success("Logo uploaded.");
      onLogoUploaded(brand.id, publicUrl);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card
      className="transition-colors hover:border-primary/50 hover:shadow-sm cursor-pointer h-full group"
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary overflow-hidden shrink-0">
            {brand.logo_url ? (
              <img
                src={brand.logo_url}
                alt={brand.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-6 w-6" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{brand.name}</CardTitle>
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={uploading}
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleUpload}
      />
    </Card>
  );
}

/* ── Main Page ── */
export default function AdminTemplates({ embedded }: { embedded?: boolean }) {
  const [level, setLevel] = useState<Level>("brands");
  const [brands, setBrands] = useState<Brand[]>([]);

  // Level 2 state
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [roomTypesWithCount, setRoomTypesWithCount] = useState<TypeWithCount[]>([]);
  const [bathTypesWithCount, setBathTypesWithCount] = useState<TypeWithCount[]>([]);
  const [publicAreaTypesWithCount, setPublicAreaTypesWithCount] = useState<TypeWithCount[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  // Level 3 state
  const [editorKind, setEditorKind] = useState<EditorKind>("room");
  const [editorTypeId, setEditorTypeId] = useState("");
  const [editorTypeName, setEditorTypeName] = useState("");

  // Fetch brands
  useEffect(() => {
    supabase
      .from("brands")
      .select("id, name, logo_url")
      .order("name")
      .then(({ data }) => setBrands((data as Brand[]) ?? []));
  }, []);

  const handleLogoUploaded = (brandId: string, url: string) => {
    setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, logo_url: url } : b)));
  };

  // Navigate to brand workspace
  const openBrandWorkspace = async (brand: Brand) => {
    setSelectedBrand(brand);
    setWorkspaceLoading(true);
    setLevel("workspace");

    const [rtRes, btRes, paRes, rtCountRes, btCountRes, paCountRes] = await Promise.all([
      supabase.from("room_types").select("id, name").eq("brand_id", brand.id).order("name"),
      supabase.from("bathroom_types").select("id, name").eq("brand_id", brand.id).order("name"),
      supabase.from("public_area_types").select("id, name").eq("brand_id", brand.id).order("name"),
      supabase.from("room_type_line_items").select("room_type_id, id"),
      supabase.from("bathroom_type_line_items").select("bathroom_type_id, id"),
      supabase.from("public_area_type_line_items").select("public_area_type_id, id"),
    ]);

    const roomTypes = (rtRes.data as RoomType[]) ?? [];
    const bathTypes = (btRes.data as BathroomType[]) ?? [];
    const publicAreaTypes = (paRes.data ?? []) as { id: string; name: string }[];

    // Count items per type
    const rtCounts = new Map<string, number>();
    (rtCountRes.data ?? []).forEach((r: any) => {
      rtCounts.set(r.room_type_id, (rtCounts.get(r.room_type_id) ?? 0) + 1);
    });

    const btCounts = new Map<string, number>();
    (btCountRes.data ?? []).forEach((r: any) => {
      btCounts.set(r.bathroom_type_id, (btCounts.get(r.bathroom_type_id) ?? 0) + 1);
    });

    const paCounts = new Map<string, number>();
    (paCountRes.data ?? []).forEach((r: any) => {
      paCounts.set(r.public_area_type_id, (paCounts.get(r.public_area_type_id) ?? 0) + 1);
    });

    setRoomTypesWithCount(
      roomTypes.map((rt) => ({ id: rt.id, name: rt.name, itemCount: rtCounts.get(rt.id) ?? 0 }))
    );
    setBathTypesWithCount(
      bathTypes.map((bt) => ({ id: bt.id, name: bt.name, itemCount: btCounts.get(bt.id) ?? 0 }))
    );
    setPublicAreaTypesWithCount(
      publicAreaTypes.map((pa) => ({ id: pa.id, name: pa.name, itemCount: paCounts.get(pa.id) ?? 0 }))
    );
    setWorkspaceLoading(false);
  };

  const openEditor = (kind: EditorKind, typeId: string, typeName: string) => {
    setEditorKind(kind);
    setEditorTypeId(typeId);
    setEditorTypeName(typeName);
    setLevel("editor");
  };

  /* ── Level 1: Brand Grid ── */
  if (level === "brands") {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Room Block Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a brand to manage its room and bathroom templates.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              onClick={() => openBrandWorkspace(brand)}
              onLogoUploaded={handleLogoUploaded}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── Level 2: Brand Workspace ── */
  if (level === "workspace" && selectedBrand) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLevel("brands")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{selectedBrand.name}</h1>
            <p className="text-sm text-muted-foreground">Manage room, bathroom, and public area type templates.</p>
          </div>
        </div>

        {workspaceLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Room Types */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <BedDouble className="h-4 w-4" /> Room Type Templates
              </h2>
              {roomTypesWithCount.length === 0 ? (
                <p className="text-sm text-muted-foreground">No room types for this brand.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {roomTypesWithCount.map((rt) => (
                    <Card
                      key={rt.id}
                      className="transition-colors hover:border-primary/50 hover:shadow-sm cursor-pointer"
                      onClick={() => openEditor("room", rt.id, rt.name)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{rt.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="text-xs text-muted-foreground">{rt.itemCount} items</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Bathroom Types */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Bath className="h-4 w-4" /> Bathroom Type Templates
              </h2>
              {bathTypesWithCount.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bathroom types for this brand.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {bathTypesWithCount.map((bt) => (
                    <Card
                      key={bt.id}
                      className="transition-colors hover:border-primary/50 hover:shadow-sm cursor-pointer"
                      onClick={() => openEditor("bathroom", bt.id, bt.name)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{bt.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="text-xs text-muted-foreground">{bt.itemCount} items</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Public Area Types */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Public Area Templates
              </h2>
              {publicAreaTypesWithCount.length === 0 ? (
                <p className="text-sm text-muted-foreground">No public area types for this brand.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {publicAreaTypesWithCount.map((pa) => (
                    <Card
                      key={pa.id}
                      className="transition-colors hover:border-primary/50 hover:shadow-sm cursor-pointer"
                      onClick={() => openEditor("publicarea", pa.id, pa.name)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{pa.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="text-xs text-muted-foreground">{pa.itemCount} items</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  /* ── Level 3: Template Editor ── */
  if (level === "editor" && selectedBrand) {
    const tableName = editorKind === "room" ? "room_type_line_items" : editorKind === "bathroom" ? "bathroom_type_line_items" : "public_area_type_line_items";
    const kindLabel = editorKind === "room" ? "Room Type" : editorKind === "bathroom" ? "Bathroom Type" : "Public Area";
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBrandWorkspace(selectedBrand)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{editorTypeName}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedBrand.name} · {kindLabel} Template
            </p>
          </div>
        </div>
        <TemplateEditor
          key={`${editorKind}-${editorTypeId}`}
          brandId={selectedBrand.id}
          typeId={editorTypeId}
          typeName={editorTypeName}
          tableName={tableName}
        />
      </div>
    );
  }

  return null;
}
