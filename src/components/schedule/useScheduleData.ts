import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SchedulePhase,
  ScheduleMilestone,
  PHASE_STRUCTURE,
  DEFAULT_MILESTONES,
} from "./types";

export function useScheduleData(projectId: string) {
  const [phases, setPhases] = useState<SchedulePhase[]>([]);
  const [milestones, setMilestones] = useState<ScheduleMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: existingPhases } = await supabase
      .from("schedule_phases")
      .select("*")
      .eq("project_id", projectId)
      .order("phase_number")
      .order("sub_phase_number");

    if (existingPhases && existingPhases.length > 0) {
      setPhases(existingPhases as unknown as SchedulePhase[]);
      const { data: ms } = await supabase
        .from("schedule_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      setMilestones((ms ?? []) as unknown as ScheduleMilestone[]);
      setLoading(false);
      return;
    }

    // Seed phases & milestones
    const phaseRows: any[] = [];
    for (const phase of PHASE_STRUCTURE) {
      for (const sp of phase.sub_phases) {
        phaseRows.push({
          project_id: projectId,
          phase_number: phase.phase_number,
          phase_name: phase.phase_name,
          sub_phase_number: sp.sub_phase_number,
          sub_phase_name: sp.sub_phase_name,
        });
      }
    }

    const { data: insertedPhases, error: phaseErr } = await supabase
      .from("schedule_phases")
      .insert(phaseRows)
      .select();

    if (phaseErr) {
      toast.error("Failed to initialize schedule.");
      setLoading(false);
      return;
    }

    const phaseMap = new Map<string, string>();
    for (const p of insertedPhases!) {
      phaseMap.set((p as any).sub_phase_number, (p as any).id);
    }

    const milestoneRows = DEFAULT_MILESTONES.map((m) => ({
      project_id: projectId,
      sub_phase_id: phaseMap.get(m.sub_phase_number)!,
      name: m.name,
      status: "Upcoming",
      is_custom: false,
    }));

    const { data: insertedMs, error: msErr } = await supabase
      .from("schedule_milestones")
      .insert(milestoneRows)
      .select();

    if (msErr) {
      toast.error("Failed to seed milestones.");
    }

    setPhases((insertedPhases ?? []) as unknown as SchedulePhase[]);
    setMilestones((insertedMs ?? []) as unknown as ScheduleMilestone[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateMilestone = async (id: string, updates: Partial<ScheduleMilestone>) => {
    const { error } = await supabase
      .from("schedule_milestones")
      .update(updates)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Milestone updated.");
    await fetchData();
  };

  const addMilestone = async (subPhaseId: string, name: string) => {
    const { error } = await supabase.from("schedule_milestones").insert({
      project_id: projectId,
      sub_phase_id: subPhaseId,
      name,
      status: "Upcoming",
      is_custom: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Milestone added.");
    await fetchData();
  };

  const deleteMilestone = async (id: string) => {
    const { error } = await supabase
      .from("schedule_milestones")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Milestone deleted.");
    await fetchData();
  };

  const updatePhase = async (id: string, updates: { start_date?: string | null; end_date?: string | null }) => {
    const { error } = await supabase
      .from("schedule_phases")
      .update(updates)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sub-phase dates updated.");
    await fetchData();
  };

  const addSubPhase = async (phaseNumber: number, phaseName: string, name: string, startDate?: string | null, endDate?: string | null) => {
    // Find next sub-phase number
    const existing = phases.filter((p) => p.phase_number === phaseNumber);
    const maxSub = existing.reduce((max, p) => {
      const parts = p.sub_phase_number.split(".");
      const sub = parseInt(parts[1] || "0", 10);
      return sub > max ? sub : max;
    }, 0);
    const newSubNum = `${phaseNumber}.${maxSub + 1}`;

    const { error } = await supabase.from("schedule_phases").insert({
      project_id: projectId,
      phase_number: phaseNumber,
      phase_name: phaseName,
      sub_phase_number: newSubNum,
      sub_phase_name: name,
      start_date: startDate || null,
      end_date: endDate || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sub-phase added.");
    await fetchData();
  };

  const deleteSubPhase = async (id: string) => {
    // Delete milestones first, then the sub-phase
    const { error: msErr } = await supabase
      .from("schedule_milestones")
      .delete()
      .eq("sub_phase_id", id);
    if (msErr) {
      toast.error(msErr.message);
      return;
    }
    const { error } = await supabase
      .from("schedule_phases")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sub-phase deleted.");
    await fetchData();
  };

  const refetch = fetchData;

  return { phases, milestones, loading, updateMilestone, addMilestone, deleteMilestone, updatePhase, addSubPhase, deleteSubPhase, refetch };
}
