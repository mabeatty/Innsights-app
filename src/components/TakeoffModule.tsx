import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ── Types ── */
interface TakeoffItem {
  id: string;
  item_id: string;
  room_type_id: string | null;
  bathroom_type_id: string | null;
  quantity_required: number;
  adjusted_quantity: number | null;
  notes: string | null;
  is_ada: boolean;
  items: { name: string; item_number: string; category: string } | null;
  room_types: { name: string } | null;
  bathroom_types: { name: string } | null;
}

interface PublicAreaItem {
  id: string;
  public_area_type_id: string;
  item_id: string;
  quantity_required: number;
  adjusted_quantity: number | null;
  notes: string | null;
  items: { name: string; item_number: string; category: string } | null;
  public_area_types: { name: string } | null;
}

interface RoomType { id: string; name: string; }
interface BathroomType { id: string; name: string; }
interface PublicAreaType { id: string; name: string; }

interface RoomMatrixRow {
  id?: string;
  roomTypeId: string;
  bathroomTypeId: string;
  quantity: number;
}

interface TakeoffVersion {
  id: string;
  version_number: number;
  created_at: string;
}

interface Props {
  projectId: string;
  projectName?: string;
  brandId: string;
}

interface AggregatedItem {
  item_id: string;
  item_number: string;
  item_name: string;
  category: string;
  total_quantity: number;
  appliesTo: string[];
}

const categoryOrder = ["Furniture", "Softgoods", "Lighting", "Artwork & Window Treatments", "Bathroom", "Equipment"];

export default function TakeoffModule({ projectId, projectName, brandId }: Props) {
  const { user } = useAuth();

  // Setup state
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bathroomTypes, setBathroomTypes] = useState<BathroomType[]>([]);
  const [publicAreaTypes, setPublicAreaTypes] = useState<PublicAreaType[]>([]);
  const [matrix, setMatrix] = useState<RoomMatrixRow[]>([]);
  const [selectedPublicAreas, setSelectedPublicAreas] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [setupLoaded, setSetupLoaded] = useState(false);

  // Versions
  const [versions, setVersions] = useState<TakeoffVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [takeoffItems, setTakeoffItems] = useState<TakeoffItem[]>([]);
  const [publicAreaItems, setPublicAreaItems] = useState<PublicAreaItem[]>([]);

  const hasTakeoff = takeoffItems.length > 0 || publicAreaItems.length > 0;

  /* ── Fetch versions ── */
  const fetchVersions = useCallback(async () => {
    const { data } = await supabase
      .from("takeoff_versions")
      .select("id, version_number, created_at")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false });
    setVersions((data as TakeoffVersion[]) ?? []);
  }, [projectId]);

  /* ── Load version data ── */
  const loadVersionData = useCallback(async (versionId: string) => {
    setActiveVersionId(versionId);
    const [tRes, paRes] = await Promise.all([
      supabase
        .from("takeoff_line_items")
        .select("*, items(name, item_number, category), room_types(name), bathroom_types(name)")
        .eq("takeoff_version_id", versionId),
      supabase
        .from("project_public_area_items")
        .select("*, items(name, item_number, category), public_area_types(name)")
        .eq("takeoff_version_id", versionId),
    ]);
    setTakeoffItems((tRes.data as unknown as TakeoffItem[]) ?? []);
    setPublicAreaItems((paRes.data as unknown as PublicAreaItem[]) ?? []);
  }, []);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  // Auto-load latest version
  useEffect(() => {
    if (versions.length > 0 && !activeVersionId) {
      loadVersionData(versions[0].id);
    }
  }, [versions, activeVersionId, loadVersionData]);

  /* ── Load setup data ── */
  useEffect(() => {
    if (setupLoaded || !brandId) return;
    Promise.all([
      supabase.from("room_types").select("*").eq("brand_id", brandId),
      supabase.from("bathroom_types").select("*").eq("brand_id", brandId),
      supabase.from("public_area_types").select("*").eq("brand_id", brandId),
      supabase.from("room_matrix_entries").select("*").eq("project_id", projectId),
    ]).then(([rtRes, btRes, paRes, matrixRes]) => {
      setRoomTypes(rtRes.data ?? []);
      setBathroomTypes(btRes.data ?? []);
      setPublicAreaTypes(paRes.data ?? []);

      const existingMatrix = matrixRes.data ?? [];
      if (existingMatrix.length > 0) {
        setMatrix(existingMatrix.map((e: any) => ({
          id: e.id,
          roomTypeId: e.room_type_id,
          bathroomTypeId: e.bathroom_type_id,
          quantity: e.quantity,
        })));
      } else {
        setMatrix([{ roomTypeId: "", bathroomTypeId: "", quantity: 0 }]);
      }
      setSetupLoaded(true);
    });
  }, [brandId, projectId, setupLoaded]);

  /* ── Matrix helpers ── */
  const updateMatrix = (index: number, field: keyof RoomMatrixRow, value: string | number | boolean) => {
    setMatrix((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addMatrixRow = () => {
    setMatrix((prev) => [...prev, { roomTypeId: "", bathroomTypeId: "", quantity: 0 }]);
  };
  const removeMatrixRow = (index: number) => {
    setMatrix((prev) => prev.filter((_, i) => i !== index));
  };
  const togglePublicArea = (paId: string) => {
    setSelectedPublicAreas((prev) => {
      const next = new Set(prev);
      next.has(paId) ? next.delete(paId) : next.add(paId);
      return next;
    });
  };

  /* ── Save Room Matrix ── */
  const handleSaveMatrix = async () => {
    setSavingMatrix(true);
    try {
      await supabase.from("room_matrix_entries").delete().eq("project_id", projectId);
      const activeRows = matrix.filter((r) => r.roomTypeId && r.bathroomTypeId);
      if (activeRows.length > 0) {
        const { error } = await supabase.from("room_matrix_entries").insert(
          activeRows.map((r) => ({
            project_id: projectId,
            room_type_id: r.roomTypeId,
            bathroom_type_id: r.bathroomTypeId,
            is_ada: false,
            quantity: r.quantity,
          }))
        );
        if (error) throw error;
      }
      toast.success("Room matrix saved.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save room matrix.");
    } finally {
      setSavingMatrix(false);
    }
  };

  /* ── Generate takeoff (versioned) ── */
  const handleGenerate = async () => {
    if (!user) return;
    const activeRows = matrix.filter((r) => r.quantity > 0 && r.roomTypeId && r.bathroomTypeId);
    if (activeRows.length === 0 && selectedPublicAreas.size === 0) {
      toast.error("Add at least one room or public area.");
      return;
    }

    setGenerating(true);
    try {
      // Save matrix first
      await supabase.from("room_matrix_entries").delete().eq("project_id", projectId);
      if (activeRows.length > 0) {
        const { error: mErr } = await supabase.from("room_matrix_entries").insert(
          activeRows.map((r) => ({
            project_id: projectId,
            room_type_id: r.roomTypeId,
            bathroom_type_id: r.bathroomTypeId,
            is_ada: false,
            quantity: r.quantity,
          }))
        );
        if (mErr) throw mErr;
      }

      const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) + 1 : 1;

      const { data: versionData, error: vErr } = await supabase
        .from("takeoff_versions")
        .insert({ project_id: projectId, version_number: nextVersion })
        .select()
        .single();
      if (vErr || !versionData) throw vErr ?? new Error("Failed to create version");
      const versionId = versionData.id;

      const takeoffBatch: any[] = [];
      for (const row of activeRows) {
        const { data: roomLI } = await supabase
          .from("room_type_line_items")
          .select("item_id, quantity_per_room")
          .eq("room_type_id", row.roomTypeId);
        for (const li of roomLI ?? []) {
          takeoffBatch.push({
            project_id: projectId,
            takeoff_version_id: versionId,
            item_id: li.item_id,
            room_type_id: row.roomTypeId,
            bathroom_type_id: null,
            quantity_required: row.quantity * li.quantity_per_room,
            is_ada: false,
          });
        }
        const { data: bathLI } = await supabase
          .from("bathroom_type_line_items")
          .select("item_id, quantity_per_room")
          .eq("bathroom_type_id", row.bathroomTypeId);
        for (const li of bathLI ?? []) {
          takeoffBatch.push({
            project_id: projectId,
            takeoff_version_id: versionId,
            item_id: li.item_id,
            room_type_id: null,
            bathroom_type_id: row.bathroomTypeId,
            quantity_required: row.quantity * li.quantity_per_room,
            is_ada: false,
          });
        }
      }

      if (takeoffBatch.length > 0) {
        const { error: tErr } = await supabase.from("takeoff_line_items").insert(takeoffBatch);
        if (tErr) throw tErr;
      }

      const publicBatch: any[] = [];
      for (const paId of selectedPublicAreas) {
        const { data: paLI } = await supabase
          .from("public_area_line_items")
          .select("item_id, quantity")
          .eq("public_area_type_id", paId);
        for (const li of paLI ?? []) {
          publicBatch.push({
            project_id: projectId,
            takeoff_version_id: versionId,
            public_area_type_id: paId,
            item_id: li.item_id,
            quantity_required: li.quantity,
          });
        }
      }

      if (publicBatch.length > 0) {
        const { error: paErr } = await supabase.from("project_public_area_items").insert(publicBatch);
        if (paErr) throw paErr;
      }

      toast.success(`Takeoff v${nextVersion} generated!`);
      await fetchVersions();
      loadVersionData(versionId);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate takeoff.");
    } finally {
      setGenerating(false);
    }
  };

  /* ── Delete version ── */
  const handleDeleteVersion = async (versionId: string, versionNum: number) => {
    if (!confirm(`Delete takeoff v${versionNum}? This cannot be undone.`)) return;
    await supabase.from("takeoff_versions").delete().eq("id", versionId);
    if (activeVersionId === versionId) {
      setActiveVersionId(null);
      setTakeoffItems([]);
      setPublicAreaItems([]);
    }
    toast.success(`Takeoff v${versionNum} deleted.`);
    fetchVersions();
  };

  /* ── Aggregation helpers ── */
  const aggregateItems = (
    items: { item_id: string; items: { name: string; item_number: string; category: string } | null; quantity_required: number; adjusted_quantity: number | null }[],
    labelFn: (item: any) => string
  ): AggregatedItem[] => {
    const map = new Map<string, AggregatedItem>();
    for (const item of items) {
      const key = item.item_id;
      const qty = item.adjusted_quantity ?? item.quantity_required;
      const label = labelFn(item);
      if (map.has(key)) {
        const agg = map.get(key)!;
        agg.total_quantity += qty;
        if (!agg.appliesTo.includes(label)) agg.appliesTo.push(label);
      } else {
        map.set(key, {
          item_id: key,
          item_number: item.items?.item_number ?? "",
          item_name: item.items?.name ?? "",
          category: item.items?.category ?? "",
          total_quantity: qty,
          appliesTo: [label],
        });
      }
    }
    return Array.from(map.values());
  };

  const groupByCategory = (items: AggregatedItem[]) => {
    const groups = new Map<string, AggregatedItem[]>();
    for (const cat of categoryOrder) {
      const catItems = items.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        catItems.sort((a, b) => a.item_number.localeCompare(b.item_number));
        groups.set(cat, catItems);
      }
    }
    return groups;
  };

  const roomOnlyItems = takeoffItems.filter((i) => i.room_type_id !== null);
  const bathroomOnlyItems = takeoffItems.filter((i) => i.bathroom_type_id !== null);
  const aggRoomItems = aggregateItems(roomOnlyItems, (i) => i.room_types?.name ?? "Unknown");
  const aggBathroomItems = aggregateItems(bathroomOnlyItems, (i) => i.bathroom_types?.name ?? "Unknown");
  const aggGuestroomItems = [...aggRoomItems, ...aggBathroomItems];
  const aggPublicItems = aggregateItems(publicAreaItems, (i) => i.public_area_types?.name ?? "Unknown");
  const guestroomByCategory = groupByCategory(aggGuestroomItems);
  const publicByCategory = groupByCategory(aggPublicItems);

  /* ── Export helpers ── */
  const buildExportRows = () => {
    const rows: string[][] = [];
    guestroomByCategory.forEach((items, category) => {
      items.forEach((i) => {
        rows.push(["Guestroom FF&E", category, i.item_number, i.item_name, i.appliesTo.join(", "), String(i.total_quantity)]);
      });
    });
    publicByCategory.forEach((items, category) => {
      items.forEach((i) => {
        rows.push(["Public Area FF&E", category, i.item_number, i.item_name, i.appliesTo.join(", "), String(i.total_quantity)]);
      });
    });
    return rows;
  };

  const headers = ["Section", "Category", "Item Number", "Item Name", "Applies To", "Quantity"];
  const fileName = (ext: string) => `${projectName ?? "takeoff"}-v${versions.find((v) => v.id === activeVersionId)?.version_number ?? ""}.${ext}`;

  const exportCSV = () => {
    const rows = [headers, ...buildExportRows()];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName("csv");
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const exportXLS = () => {
    const data = [headers, ...buildExportRows()];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Takeoff");
    XLSX.writeFile(wb, fileName("xlsx"));
    toast.success("Excel exported.");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${projectName ?? "Takeoff"} - v${versions.find((v) => v.id === activeVersionId)?.version_number ?? ""}`, 14, 15);
    autoTable(doc, {
      head: [headers],
      body: buildExportRows(),
      startY: 22,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [60, 60, 60] },
    });
    doc.save(fileName("pdf"));
    toast.success("PDF exported.");
  };

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  return (
    <div className="space-y-8 pt-2">
      {/* ── Room Matrix Setup ── */}
      {setupLoaded && roomTypes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Room Matrix
          </h2>
          <div className="space-y-2">
            {matrix.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={row.roomTypeId} onValueChange={(v) => updateMatrix(i, "roomTypeId", v)}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Room Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={row.bathroomTypeId} onValueChange={(v) => updateMatrix(i, "bathroomTypeId", v)}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Bathroom Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {bathroomTypes.map((bt) => (
                      <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  className="h-9 w-24 text-sm"
                  placeholder="Qty"
                  value={row.quantity || ""}
                  onChange={(e) => updateMatrix(i, "quantity", parseInt(e.target.value) || 0)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMatrixRow(i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={addMatrixRow}>
                <Plus className="mr-2 h-4 w-4" />
                Add Room Type
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveMatrix} disabled={savingMatrix}>
                {savingMatrix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Room Matrix
              </Button>
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Total Rooms: {matrix.reduce((sum, r) => sum + (r.quantity || 0), 0)}
            </p>
          </div>
        </section>
      )}

      {/* ── Public Areas Setup ── */}
      {setupLoaded && publicAreaTypes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Public Areas
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                const allSelected = publicAreaTypes.every((pa) => selectedPublicAreas.has(pa.id));
                setSelectedPublicAreas(allSelected ? new Set() : new Set(publicAreaTypes.map((pa) => pa.id)));
              }}
            >
              {publicAreaTypes.every((pa) => selectedPublicAreas.has(pa.id)) ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {publicAreaTypes.map((pa) => (
              <label key={pa.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedPublicAreas.has(pa.id)}
                  onCheckedChange={() => togglePublicArea(pa.id)}
                />
                <span className="text-sm">{pa.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Generate Button ── */}
      {setupLoaded && (roomTypes.length > 0 || publicAreaTypes.length > 0) && (
        <div className="pt-4 border-t">
          <Button onClick={handleGenerate} disabled={generating} size="lg">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : "Generate Takeoff"}
          </Button>
        </div>
      )}

      {/* ── Takeoff Versions List ── */}
      {versions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Takeoff Versions
          </h2>
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-md border p-3 cursor-pointer transition-colors ${
                  v.id === activeVersionId ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
                onClick={() => loadVersionData(v.id)}
              >
                <div>
                  <span className="text-sm font-medium">v{v.version_number}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {v.id === activeVersionId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-3 w-3" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={exportXLS}>Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteVersion(v.id, v.version_number)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Active version takeoff display ── */}
      {activeVersion && hasTakeoff && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Takeoff v{activeVersion.version_number}
            </h2>
          </div>

          {aggGuestroomItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Guestroom FF&amp;E
              </h2>
              <div className="border rounded-md overflow-hidden bg-card">
                <table className="w-full table-dense">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left">Item #</th>
                      <th className="text-left">Item Name</th>
                      <th className="text-left">Applies To</th>
                      <th className="text-right w-24">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Array.from(guestroomByCategory.entries()).map(([category, items]) => (
                      <tbody key={category}>
                        <tr className="bg-muted/30">
                          <td colSpan={4} className="font-medium text-xs uppercase tracking-wide text-muted-foreground py-1.5 px-3">
                            {category}
                          </td>
                        </tr>
                        {items.map((item) => (
                          <tr key={item.item_id}>
                            <td className="font-mono text-xs">{item.item_number}</td>
                            <td>{item.item_name}</td>
                            <td className="text-muted-foreground text-xs">{item.appliesTo.join(", ")}</td>
                            <td className="text-right">{item.total_quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {aggPublicItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Public Area FF&amp;E
              </h2>
              <div className="border rounded-md overflow-hidden bg-card">
                <table className="w-full table-dense">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left">Item #</th>
                      <th className="text-left">Item Name</th>
                      <th className="text-left">Applies To</th>
                      <th className="text-right w-24">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Array.from(publicByCategory.entries()).map(([category, items]) => (
                      <tbody key={category}>
                        <tr className="bg-muted/30">
                          <td colSpan={4} className="font-medium text-xs uppercase tracking-wide text-muted-foreground py-1.5 px-3">
                            {category}
                          </td>
                        </tr>
                        {items.map((item) => (
                          <tr key={item.item_id}>
                            <td className="font-mono text-xs">{item.item_number}</td>
                            <td>{item.item_name}</td>
                            <td className="text-muted-foreground text-xs">{item.appliesTo.join(", ")}</td>
                            <td className="text-right">{item.total_quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {versions.length === 0 && setupLoaded && roomTypes.length === 0 && publicAreaTypes.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No room types or public areas configured for this brand.
        </p>
      )}
    </div>
  );
}
