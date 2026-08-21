import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface RoomType { id: string; name: string; }
interface BathroomType { id: string; name: string; }
interface Floor { id: string; name: string; display_order: number; }

interface MatrixEntry {
  id: string;
  roomTypeId: string;
  bathroomTypeId: string | null;
  floorId: string | null;
  quantity: number;
}

interface Props {
  projectId: string;
  brandId: string;
}

/**
 * Single source of truth for a project's room matrix (room_matrix_entries),
 * organized by floor. The FF&E Takeoff tab reads this (summed across floors)
 * to generate quantities.
 *
 * Two-page layout: this component renders the read-only floor-by-floor table
 * plus an "Edit Matrix" button; the actual editing happens in a dialog
 * (EditRoomMatrixDialog below) that mirrors the same room-type-by-floor
 * layout but with editable quantity cells.
 */
export default function RoomMatrixModule({ projectId, brandId }: Props) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bathroomTypes, setBathroomTypes] = useState<BathroomType[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    const [rtRes, btRes, floorRes, entryRes] = await Promise.all([
      supabase.from("room_types").select("*").eq("brand_id", brandId),
      supabase.from("bathroom_types").select("*").eq("brand_id", brandId),
      supabase.from("project_floors").select("*").eq("project_id", projectId).order("display_order"),
      supabase.from("room_matrix_entries").select("*").eq("project_id", projectId),
    ]);
    setRoomTypes(rtRes.data ?? []);
    setBathroomTypes(btRes.data ?? []);
    setFloors((floorRes.data as Floor[]) ?? []);
    setEntries(
      ((entryRes.data ?? []) as any[]).map((e) => ({
        id: e.id,
        roomTypeId: e.room_type_id,
        bathroomTypeId: e.bathroom_type_id,
        floorId: e.floor_id,
        quantity: e.quantity,
      }))
    );
    setLoaded(true);
  }, [brandId, projectId]);

  useEffect(() => { load(); }, [load]);

  const roomTypeName = (id: string) => roomTypes.find((rt) => rt.id === id)?.name ?? "Unknown";
  const bathroomTypeName = (id: string | null) => (id ? bathroomTypes.find((bt) => bt.id === id)?.name ?? "Unknown" : "Not set");

  const combos = useMemo(() => {
    const map = new Map<string, { roomTypeId: string; bathroomTypeId: string | null; byFloor: Record<string, number>; noFloorQty: number }>();
    for (const e of entries) {
      const key = `${e.roomTypeId}:${e.bathroomTypeId}`;
      if (!map.has(key)) map.set(key, { roomTypeId: e.roomTypeId, bathroomTypeId: e.bathroomTypeId, byFloor: {}, noFloorQty: 0 });
      const row = map.get(key)!;
      if (e.floorId) row.byFloor[e.floorId] = (row.byFloor[e.floorId] ?? 0) + e.quantity;
      else row.noFloorQty += e.quantity;
    }
    return Array.from(map.values()).sort((a, b) => roomTypeName(a.roomTypeId).localeCompare(roomTypeName(b.roomTypeId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, roomTypes]);

  const rowTotal = (row: { byFloor: Record<string, number>; noFloorQty: number }) =>
    Object.values(row.byFloor).reduce((s, q) => s + q, 0) + row.noFloorQty;
  const grandTotal = combos.reduce((s, r) => s + rowTotal(r), 0);
  const floorTotal = (floorId: string) => combos.reduce((s, r) => s + (r.byFloor[floorId] ?? 0), 0);
  const unassignedTotal = combos.reduce((s, r) => s + r.noFloorQty, 0);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading room matrix…</p>;
  }

  if (roomTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No room types configured for this brand yet. Room types are set up at the brand level.
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Room Matrix</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Room and bathroom type mix by floor. The FF&E Takeoff tab reads this matrix (summed across floors) to
            generate quantities, and it feeds the Cost Per Key figure on the Executive Summary.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit Matrix
        </Button>
      </div>

      {combos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
          No room matrix set up for this project yet. Click "Edit Matrix" to get started.
        </p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                <th className="px-3 py-2">Room Type</th>
                <th className="px-3 py-2">Bathroom Type</th>
                {floors.map((f) => <th key={f.id} className="px-3 py-2 text-right w-16">{f.name.toUpperCase()}</th>)}
                {unassignedTotal > 0 && <th className="px-3 py-2 text-right w-20">Unassigned</th>}
                <th className="px-3 py-2 text-right w-20 font-semibold">Total</th>
                <th className="px-3 py-2 text-right w-24">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((row, i) => {
                const total = rowTotal(row);
                return (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{roomTypeName(row.roomTypeId)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{bathroomTypeName(row.bathroomTypeId)}</td>
                    {floors.map((f) => (
                      <td key={f.id} className="px-3 py-1.5 text-right">{row.byFloor[f.id] || ""}</td>
                    ))}
                    {unassignedTotal > 0 && <td className="px-3 py-1.5 text-right">{row.noFloorQty || ""}</td>}
                    <td className="px-3 py-1.5 text-right font-semibold">{total}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {grandTotal > 0 ? `${((total / grandTotal) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold bg-muted/20">
                <td className="px-3 py-1.5" colSpan={2}>Total</td>
                {floors.map((f) => <td key={f.id} className="px-3 py-1.5 text-right">{floorTotal(f.id)}</td>)}
                {unassignedTotal > 0 && <td className="px-3 py-1.5 text-right">{unassignedTotal}</td>}
                <td className="px-3 py-1.5 text-right">{grandTotal}</td>
                <td className="px-3 py-1.5 text-right"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <EditRoomMatrixDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        roomTypes={roomTypes}
        bathroomTypes={bathroomTypes}
        floors={floors}
        entries={entries}
        onSaved={load}
      />
    </div>
  );
}

/* ── Edit dialog: same room-type-by-floor layout, editable ── */

interface EditProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  roomTypes: RoomType[];
  bathroomTypes: BathroomType[];
  floors: Floor[];
  entries: MatrixEntry[];
  onSaved: () => void;
}

interface DraftCombo {
  key: string;
  roomTypeId: string;
  bathroomTypeId: string;
  quantityByFloor: Record<string, number | "">;
}

function EditRoomMatrixDialog({ open, onOpenChange, projectId, roomTypes, bathroomTypes, floors: initialFloors, entries, onSaved }: EditProps) {
  const [floors, setFloors] = useState<Floor[]>(initialFloors);
  const [combos, setCombos] = useState<DraftCombo[]>([]);
  const [newFloorName, setNewFloorName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFloors(initialFloors);

    const map = new Map<string, DraftCombo>();
    for (const e of entries) {
      const key = `${e.roomTypeId}:${e.bathroomTypeId}`;
      if (!map.has(key)) map.set(key, { key, roomTypeId: e.roomTypeId, bathroomTypeId: e.bathroomTypeId, quantityByFloor: {} });
      if (e.floorId) map.get(key)!.quantityByFloor[e.floorId] = e.quantity;
    }
    setCombos(map.size > 0 ? Array.from(map.values()) : [{ key: `new-${Date.now()}`, roomTypeId: "", bathroomTypeId: "", quantityByFloor: {} }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFloors, entries]);

  const addFloor = () => {
    if (!newFloorName.trim()) return;
    if (floors.some((f) => f.name.toLowerCase() === newFloorName.trim().toLowerCase())) {
      toast.error("A floor with that name already exists.");
      return;
    }
    const tempFloor: Floor = { id: `new-floor-${Date.now()}`, name: newFloorName.trim(), display_order: floors.length };
    setFloors((prev) => [...prev, tempFloor]);
    setNewFloorName("");
  };

  const removeFloor = (floorId: string) => {
    setFloors((prev) => prev.filter((f) => f.id !== floorId));
    setCombos((prev) => prev.map((c) => {
      const { [floorId]: _removed, ...rest } = c.quantityByFloor;
      return { ...c, quantityByFloor: rest };
    }));
  };

  const addCombo = () => setCombos((prev) => [...prev, { key: `new-${Date.now()}-${Math.random()}`, roomTypeId: "", bathroomTypeId: "", quantityByFloor: {} }]);
  const removeCombo = (key: string) => setCombos((prev) => prev.filter((c) => c.key !== key));
  const updateCombo = (key: string, patch: Partial<DraftCombo>) =>
    setCombos((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateQty = (key: string, floorId: string, value: string) => {
    const parsed = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setCombos((prev) => prev.map((c) => (c.key === key ? { ...c, quantityByFloor: { ...c.quantityByFloor, [floorId]: parsed } } : c)));
  };

  const rowTotal = (c: DraftCombo) => Object.values(c.quantityByFloor).reduce((s: number, v) => s + (Number(v) || 0), 0);
  const grandTotal = combos.reduce((s, c) => s + rowTotal(c), 0);

  const handleSave = async () => {
    // Only require the room type — bathroom type can be confirmed later.
    // Requiring both meant any row where the user hadn't picked a bathroom
    // type yet got silently dropped on save instead of persisted as-is.
    const validCombos = combos.filter((c) => c.roomTypeId);
    if (validCombos.length === 0) {
      toast.error("Add at least one room type and bathroom type.");
      return;
    }
    setSaving(true);
    try {
      const floorIdMap = new Map<string, string>();
      const newFloors = floors.filter((f) => f.id.startsWith("new-floor-"));
      if (newFloors.length > 0) {
        const { data: inserted, error } = await supabase
          .from("project_floors")
          .insert(newFloors.map((f) => ({ project_id: projectId, name: f.name, display_order: floors.findIndex((fl) => fl.id === f.id) })))
          .select("id, name");
        if (error) throw error;
        newFloors.forEach((f, i) => floorIdMap.set(f.id, inserted![i].id));
      }

      const keptFloorIds = floors.filter((f) => !f.id.startsWith("new-floor-")).map((f) => f.id);
      const removedFloors = initialFloors.filter((f) => !keptFloorIds.includes(f.id));
      if (removedFloors.length > 0) {
        await supabase.from("project_floors").delete().in("id", removedFloors.map((f) => f.id));
      }

      const resolveFloorId = (id: string) => floorIdMap.get(id) ?? id;

      await supabase.from("room_matrix_entries").delete().eq("project_id", projectId);
      const insertRows: any[] = [];
      for (const c of validCombos) {
        const floorEntries = Object.entries(c.quantityByFloor).filter(([, q]) => Number(q) > 0);
        if (floorEntries.length === 0) continue;
        for (const [floorId, qty] of floorEntries) {
          insertRows.push({
            project_id: projectId,
            room_type_id: c.roomTypeId,
            bathroom_type_id: c.bathroomTypeId || null,
            floor_id: resolveFloorId(floorId),
            is_ada: false,
            quantity: Number(qty),
          });
        }
      }
      if (insertRows.length > 0) {
        const { error } = await supabase.from("room_matrix_entries").insert(insertRows);
        if (error) throw error;
      }

      toast.success("Room matrix saved.");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save room matrix.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Room Matrix</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-40 text-sm"
              placeholder="Add floor (e.g. 1st)"
              value={newFloorName}
              onChange={(e) => setNewFloorName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addFloor(); }}
            />
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={addFloor}>
              <Plus className="h-3.5 w-3.5" /> Add Floor
            </Button>
          </div>

          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                  <th className="px-2 py-2 w-56">Room Type</th>
                  <th className="px-2 py-2 w-56">Bathroom Type</th>
                  {floors.map((f) => (
                    <th key={f.id} className="px-2 py-2 w-20">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{f.name}</span>
                        <button className="text-muted-foreground hover:text-destructive" title="Remove floor" onClick={() => removeFloor(f.id)}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 w-16 text-right">Total</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => (
                  <tr key={c.key} className="border-t">
                    <td className="px-2 py-1.5">
                      <Select value={c.roomTypeId} onValueChange={(v) => updateCombo(c.key, { roomTypeId: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Room Type" /></SelectTrigger>
                        <SelectContent>
                          {roomTypes.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={c.bathroomTypeId} onValueChange={(v) => updateCombo(c.key, { bathroomTypeId: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Bathroom Type" /></SelectTrigger>
                        <SelectContent>
                          {bathroomTypes.map((bt) => <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    {floors.map((f) => (
                      <td key={f.id} className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs text-right"
                          value={c.quantityByFloor[f.id] ?? ""}
                          onChange={(e) => updateQty(c.key, f.id, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium">{rowTotal(c)}</td>
                    <td className="px-2 py-1.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeCombo(c.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold bg-muted/20">
                  <td className="px-2 py-1.5" colSpan={2}>Total</td>
                  {floors.map((f) => (
                    <td key={f.id} className="px-2 py-1.5 text-right">
                      {combos.reduce((s, c) => s + (Number(c.quantityByFloor[f.id]) || 0), 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">{grandTotal}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={addCombo}>
            <Plus className="h-3.5 w-3.5" /> Add Room Type Row
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save Matrix"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
