import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

interface RoomType { id: string; name: string; }
interface BathroomType { id: string; name: string; }

interface RoomMatrixRow {
  id?: string;
  roomTypeId: string;
  bathroomTypeId: string;
  quantity: number;
}

interface Props {
  projectId: string;
  brandId: string;
}

/**
 * Single source of truth for a project's room matrix (room_matrix_entries).
 * The FF&E Takeoff tab reads this matrix to generate line items but no
 * longer edits it directly — editing here is what drives both the takeoff
 * quantities and the Executive Summary's Cost Per Key room count, so this
 * used to exist in two places (here and inside the takeoff tool) with real
 * risk of the two silently disagreeing.
 */
export default function RoomMatrixModule({ projectId, brandId }: Props) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bathroomTypes, setBathroomTypes] = useState<BathroomType[]>([]);
  const [matrix, setMatrix] = useState<RoomMatrixRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    const [rtRes, btRes, matrixRes] = await Promise.all([
      supabase.from("room_types").select("*").eq("brand_id", brandId),
      supabase.from("bathroom_types").select("*").eq("brand_id", brandId),
      supabase.from("room_matrix_entries").select("*").eq("project_id", projectId),
    ]);
    setRoomTypes(rtRes.data ?? []);
    setBathroomTypes(btRes.data ?? []);

    const existing = matrixRes.data ?? [];
    setMatrix(
      existing.length > 0
        ? existing.map((e: any) => ({ id: e.id, roomTypeId: e.room_type_id, bathroomTypeId: e.bathroom_type_id, quantity: e.quantity }))
        : [{ roomTypeId: "", bathroomTypeId: "", quantity: 0 }]
    );
    setLoaded(true);
  }, [brandId, projectId]);

  useEffect(() => { load(); }, [load]);

  const updateMatrix = (index: number, field: keyof RoomMatrixRow, value: string | number) => {
    setMatrix((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setMatrix((prev) => [...prev, { roomTypeId: "", bathroomTypeId: "", quantity: 0 }]);
  const removeRow = (index: number) => setMatrix((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    setSaving(true);
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
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save room matrix.");
    } finally {
      setSaving(false);
    }
  };

  const totalRooms = matrix.reduce((sum, r) => sum + (r.quantity || 0), 0);

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
    <div className="space-y-4 pt-2 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Room Matrix</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defines the room/bathroom type mix and key count for this project. The FF&E Takeoff tab reads this matrix
          to generate quantities — update it here and the takeoff, Cost Per Key, and other room-count figures across
          the app all stay in sync.
        </p>
      </div>

      <div className="space-y-2">
        {matrix.map((row, i) => (
          <div key={row.id ?? i} className="flex items-center gap-2">
            <Select value={row.roomTypeId} onValueChange={(v) => updateMatrix(i, "roomTypeId", v)}>
              <SelectTrigger className="h-9 text-sm flex-1">
                <SelectValue placeholder="Room Type" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={row.bathroomTypeId} onValueChange={(v) => updateMatrix(i, "bathroomTypeId", v)}>
              <SelectTrigger className="h-9 text-sm flex-1">
                <SelectValue placeholder="Bathroom Type" />
              </SelectTrigger>
              <SelectContent>
                {bathroomTypes.map((bt) => <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>)}
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
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" title="Remove" onClick={() => removeRow(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" /> Add Room Type
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Room Matrix
          </Button>
        </div>
        <p className="text-sm text-muted-foreground font-medium">Total Rooms: {totalRooms}</p>
      </div>
    </div>
  );
}
