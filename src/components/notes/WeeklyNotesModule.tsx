import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Search, Sparkles, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { format, startOfISOWeek, subWeeks } from "date-fns";
import { toast } from "sonner";

interface WeeklyNote {
  id: string;
  project_id: string;
  week_start_date: string;
  this_week_content: string;
  this_week_is_draft: boolean;
  this_week_updated_by: string | null;
  this_week_updated_at: string | null;
  risks_content: string;
  risks_updated_by: string | null;
  risks_updated_at: string | null;
  needs_content: string;
  needs_updated_by: string | null;
  needs_updated_at: string | null;
}

interface Props {
  projectId: string;
}

const FIELD_DEFS = [
  { key: "this_week", label: "This Week", contentCol: "this_week_content", byCol: "this_week_updated_by", atCol: "this_week_updated_at", placeholder: "What happened this week…" },
  { key: "risks", label: "Risks & Watch Items", contentCol: "risks_content", byCol: "risks_updated_by", atCol: "risks_updated_at", placeholder: "What's concerning you, what to keep an eye on…" },
  { key: "needs", label: "Needs From Others", contentCol: "needs_content", byCol: "needs_updated_by", atCol: "needs_updated_at", placeholder: "Explicit asks — who needs to do what…" },
] as const;

const INITIAL_WEEKS = 26;

export default function WeeklyNotesModule({ projectId }: Props) {
  const { user } = useAuth();
  const [weekMeta, setWeekMeta] = useState<Map<string, { hasContent: boolean }>>(new Map());
  const [selectedWeek, setSelectedWeek] = useState<string>(format(startOfISOWeek(new Date()), "yyyy-MM-dd"));
  const [note, setNote] = useState<WeeklyNote | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [namesByUser, setNamesByUser] = useState<Map<string, string>>(new Map());
  const [staleConflict, setStaleConflict] = useState<{ field: typeof FIELD_DEFS[number]; localValue: string; remoteValue: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ week_start_date: string; snippet: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const savingFieldsRef = useRef<Set<string>>(new Set());

  const weekList = useMemo(() => {
    const weeks: string[] = [];
    let cursor = startOfISOWeek(new Date());
    for (let i = 0; i < INITIAL_WEEKS; i++) {
      weeks.push(format(cursor, "yyyy-MM-dd"));
      cursor = subWeeks(cursor, 1);
    }
    return weeks;
  }, []);

  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; weeks: string[] }>();
    for (const w of weekList) {
      const d = new Date(`${w}T00:00:00`);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy");
      if (!groups.has(key)) groups.set(key, { label, weeks: [] });
      groups.get(key)!.weeks.push(w);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }));
  }, [weekList]);

  const loadWeekMeta = useCallback(async () => {
    const oldestWeek = weekList[weekList.length - 1];
    const { data } = await supabase
      .from("project_weekly_notes")
      .select("week_start_date, this_week_content, risks_content, needs_content")
      .eq("project_id", projectId)
      .gte("week_start_date", oldestWeek);
    const meta = new Map<string, { hasContent: boolean }>();
    (data ?? []).forEach((row: any) => {
      const hasContent = !!(row.this_week_content?.trim() || row.risks_content?.trim() || row.needs_content?.trim());
      meta.set(row.week_start_date, { hasContent });
    });
    setWeekMeta(meta);
  }, [projectId, weekList]);

  useEffect(() => { loadWeekMeta(); }, [loadWeekMeta]);

  useEffect(() => {
    const currentMonthKey = format(new Date(), "yyyy-MM");
    setCollapsedMonths(new Set(monthGroups.map((g) => g.key).filter((k) => k !== currentMonthKey)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNote = useCallback(async (weekStart: string) => {
    setLoadingNote(true);
    const { data } = await supabase
      .from("project_weekly_notes")
      .select("*")
      .eq("project_id", projectId)
      .eq("week_start_date", weekStart)
      .maybeSingle();

    if (data) {
      setNote(data);
      setFieldDrafts({
        this_week: data.this_week_content,
        risks: data.risks_content,
        needs: data.needs_content,
      });
      const userIds = [data.this_week_updated_by, data.risks_updated_by, data.needs_updated_by].filter(Boolean) as string[];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
        const names = new Map<string, string>();
        (profiles ?? []).forEach((p: any) => names.set(p.user_id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown"));
        setNamesByUser(names);
      }
      setLoadingNote(false);
    } else {
      const { data: created, error } = await supabase
        .from("project_weekly_notes")
        .insert({ project_id: projectId, week_start_date: weekStart, created_by: user?.id ?? null })
        .select("*")
        .maybeSingle();
      if (error) {
        const { data: refetched } = await supabase
          .from("project_weekly_notes")
          .select("*")
          .eq("project_id", projectId)
          .eq("week_start_date", weekStart)
          .maybeSingle();
        setNote(refetched ?? null);
        setFieldDrafts(refetched ? { this_week: refetched.this_week_content, risks: refetched.risks_content, needs: refetched.needs_content } : {});
      } else {
        setNote(created);
        setFieldDrafts({ this_week: "", risks: "", needs: "" });
      }
      setLoadingNote(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => { loadNote(selectedWeek); }, [selectedWeek, loadNote]);

  const generateDraft = async () => {
    if (!note) return;
    setDraftGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("assemble-weekly-note-draft", {
        body: { project_id: projectId, week_start_date: selectedWeek },
      });
      if (error || data?.ok === false) {
        toast.error(data?.error || error?.message || "Couldn't assemble a draft.");
        return;
      }
      const lines: string[] = data.lines || [];
      if (lines.length === 0) {
        toast.info("No new activity found in the project data for this week.");
        return;
      }
      const draftText = lines.map((l) => `• ${l}`).join("\n\n");
      setFieldDrafts((prev) => ({ ...prev, this_week: draftText }));
      await supabase.from("project_weekly_notes").update({ this_week_is_draft: true }).eq("id", note.id);
      setNote((prev) => (prev ? { ...prev, this_week_is_draft: true, this_week_content: draftText } : prev));
    } finally {
      setDraftGenerating(false);
    }
  };

  const saveField = async (field: typeof FIELD_DEFS[number], forceOverwrite = false) => {
    if (!note) return;
    const value = fieldDrafts[field.key] ?? "";
    if (value === (note as any)[field.contentCol]) return;

    savingFieldsRef.current.add(field.key);
    try {
      if (!forceOverwrite) {
        const { data: current } = await supabase
          .from("project_weekly_notes")
          .select(`${field.atCol}, ${field.contentCol}`)
          .eq("id", note.id)
          .maybeSingle();
        const remoteUpdatedAt = (current as any)?.[field.atCol];
        const localUpdatedAt = (note as any)[field.atCol];
        if (remoteUpdatedAt && localUpdatedAt && remoteUpdatedAt !== localUpdatedAt) {
          setStaleConflict({ field, localValue: value, remoteValue: (current as any)[field.contentCol] });
          return;
        }
      }

      const patch: Record<string, unknown> = {
        [field.contentCol]: value,
        [field.byCol]: user?.id ?? null,
        [field.atCol]: new Date().toISOString(),
      };
      if (field.key === "this_week") patch.this_week_is_draft = false;

      const { data: updated, error } = await supabase.from("project_weekly_notes").update(patch).eq("id", note.id).select("*").maybeSingle();
      if (error) { toast.error("Failed to save."); return; }
      setNote(updated);
      loadWeekMeta();
    } finally {
      savingFieldsRef.current.delete(field.key);
    }
  };

  const resolveConflict = async (keepLocal: boolean) => {
    if (!staleConflict || !note) return;
    if (keepLocal) {
      await saveField(staleConflict.field, true);
    } else {
      setFieldDrafts((prev) => ({ ...prev, [staleConflict.field.key]: staleConflict.remoteValue }));
      const { data } = await supabase.from("project_weekly_notes").select("*").eq("id", note.id).maybeSingle();
      if (data) setNote(data);
    }
    setStaleConflict(null);
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("project_weekly_notes")
        .select("week_start_date, this_week_content, risks_content, needs_content")
        .eq("project_id", projectId)
        .textSearch("search_vector", q.split(/\s+/).join(" & "), { type: "websearch", config: "english" })
        .order("week_start_date", { ascending: false })
        .limit(30);
      if (error) { toast.error("Search failed."); return; }
      const results = (data ?? []).map((row: any) => {
        const combined = [row.this_week_content, row.risks_content, row.needs_content].filter(Boolean).join(" ");
        const idx = combined.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0]);
        const snippet = idx >= 0 ? combined.slice(Math.max(0, idx - 40), idx + 100) : combined.slice(0, 140);
        return { week_start_date: row.week_start_date, snippet: (idx > 40 ? "…" : "") + snippet + (combined.length > snippet.length ? "…" : "") };
      });
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  const toggleMonth = (key: string) =>
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const bylineFor = (userId: string | null, at: string | null) => {
    if (!userId || !at) return null;
    const name = namesByUser.get(userId) ?? "Someone";
    return `${name} · ${format(new Date(at), "MMM d, h:mm a")}`;
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      <div className="w-56 shrink-0 border rounded-lg overflow-y-auto bg-card">
        <div className="p-2 border-b">
          <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="h-3.5 w-3.5" /> Search notes
          </Button>
        </div>
        {monthGroups.map((group) => {
          const collapsed = collapsedMonths.has(group.key);
          return (
            <div key={group.key}>
              <button
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50"
                onClick={() => toggleMonth(group.key)}
              >
                {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {group.label}
              </button>
              {!collapsed && group.weeks.map((w) => {
                const isSelected = w === selectedWeek;
                const hasContent = weekMeta.get(w)?.hasContent;
                const weekEnd = new Date(`${w}T00:00:00`);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return (
                  <button
                    key={w}
                    className={`w-full flex items-center gap-1.5 pl-6 pr-2.5 py-1.5 text-xs text-left transition-colors ${
                      isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/40 text-foreground"
                    }`}
                    onClick={() => setSelectedWeek(w)}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasContent ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    {format(new Date(`${w}T00:00:00`), "MMM d")}–{format(weekEnd, "d")}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {searchOpen && (
        <div className="w-72 shrink-0 border rounded-lg bg-card flex flex-col">
          <div className="p-2 border-b flex gap-1.5">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Search all weeks…"
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8 shrink-0" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {searchResults.length === 0 && searchQuery && !searching && (
              <p className="text-xs text-muted-foreground px-1 py-2">No matches.</p>
            )}
            {searchResults.map((r) => (
              <button
                key={r.week_start_date}
                className="w-full text-left rounded-md border px-2 py-1.5 hover:bg-muted/40 transition-colors"
                onClick={() => { setSelectedWeek(r.week_start_date); setSearchOpen(false); }}
              >
                <p className="text-xs font-medium">{format(new Date(`${r.week_start_date}T00:00:00`), "MMM d, yyyy")}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 border rounded-lg overflow-y-auto bg-card p-5">
        {loadingNote || !note ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Week of {format(new Date(`${selectedWeek}T00:00:00`), "MMMM d, yyyy")}
              </h2>
            </div>

            {FIELD_DEFS.map((field) => {
              const isDraftUnreviewed = field.key === "this_week" && note.this_week_is_draft;
              const byline = bylineFor((note as any)[field.byCol], (note as any)[field.atCol]);
              return (
                <div key={field.key}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{field.label}</p>
                    <div className="flex items-center gap-2">
                      {field.key === "this_week" && (
                        <Button
                          variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground"
                          onClick={generateDraft} disabled={draftGenerating}
                          title="Pull in what the system already knows happened this week"
                        >
                          {draftGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Auto-draft
                        </Button>
                      )}
                      {byline && <span className="text-xs text-muted-foreground">{byline}</span>}
                    </div>
                  </div>
                  <Textarea
                    value={fieldDrafts[field.key] ?? ""}
                    onChange={(e) => setFieldDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    onBlur={() => saveField(field)}
                    placeholder={field.placeholder}
                    className={`min-h-28 text-sm ${isDraftUnreviewed ? "bg-amber-50 border-amber-200" : ""}`}
                  />
                  {isDraftUnreviewed && (
                    <p className="text-xs text-amber-700 mt-1">Auto-drafted from project activity — not yet reviewed. Edit any part to accept it.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!staleConflict} onOpenChange={(o) => !o && setStaleConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Someone else edited this while you were writing</AlertDialogTitle>
            <AlertDialogDescription>
              {staleConflict?.field.label} was updated by someone else since you opened this week. Keep your version (overwrites theirs), or take their version (discards your edit)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="border rounded p-2 bg-muted/30 max-h-40 overflow-y-auto whitespace-pre-wrap">
              <p className="font-semibold mb-1">Your version</p>{staleConflict?.localValue}
            </div>
            <div className="border rounded p-2 bg-muted/30 max-h-40 overflow-y-auto whitespace-pre-wrap">
              <p className="font-semibold mb-1">Their version</p>{staleConflict?.remoteValue}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConflict(false)}>Take their version</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveConflict(true)}>Keep my version</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
