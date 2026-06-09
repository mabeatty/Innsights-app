import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ExternalLink, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { PROJECT_STATUSES } from "@/lib/projectStatus";
import { ProjectApprovers } from "@/components/invoices/ProjectApprovers";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface ProjectInfoFormProps {
  projectId: string;
  brandName: string;
  roomMatrixCount: number | null;
  onInfoChange?: (info: any) => void;
}

interface InfoRow {
  id?: string;
  entity_name: string;
  property_name: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  project_status: string;
  total_room_count: number | null;
  target_opening_date: string | null;
  owner_name: string;
  owner_email: string;
  general_contractor: string;
  architect: string;
  interior_designer: string;
  clickup_list_id: string;
}

const EMPTY: InfoRow = {
  entity_name: "", property_name: "", street_address: "", city: "", state: "", zip_code: "",
  project_status: "", total_room_count: null, target_opening_date: null,
  owner_name: "", owner_email: "", general_contractor: "", architect: "", interior_designer: "",
  clickup_list_id: "",
};

export function ProjectInfoForm({ projectId, brandName, roomMatrixCount, onInfoChange }: ProjectInfoFormProps) {
  const [info, setInfo] = useState<InfoRow>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchInfo = useCallback(async () => {
    const { data } = await supabase
      .from("project_info")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (data) {
      setExistingId(data.id);
      const row: InfoRow = {
        entity_name: data.entity_name ?? "",
        property_name: data.property_name ?? "",
        street_address: data.street_address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        zip_code: data.zip_code ?? "",
        project_status: data.project_status ?? "",
        total_room_count: data.total_room_count,
        target_opening_date: data.target_opening_date,
        owner_name: data.owner_name ?? "",
        owner_email: data.owner_email ?? "",
        general_contractor: data.general_contractor ?? "",
        architect: data.architect ?? "",
        interior_designer: data.interior_designer ?? "",
        clickup_list_id: "",
      };
      // Fetch clickup_list_id from projects table
      const { data: projData } = await supabase
        .from("projects")
        .select("clickup_list_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projData?.clickup_list_id) {
        row.clickup_list_id = projData.clickup_list_id;
      }
      setInfo(row);
      onInfoChange?.(row);
    }
    setLoaded(true);
  }, [projectId, onInfoChange]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // Auto-fill room count from matrix if no manual override
  useEffect(() => {
    if (loaded && roomMatrixCount !== null && (info.total_room_count === null || info.total_room_count === 0)) {
      setInfo(prev => ({ ...prev, total_room_count: roomMatrixCount }));
    }
  }, [roomMatrixCount, loaded]);

  const update = (field: keyof InfoRow, value: any) => {
    setInfo(prev => {
      const next = { ...prev, [field]: value };
      onInfoChange?.(next);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { clickup_list_id, ...infoPayload } = info;
    // project_status has a DB CHECK constraint that rejects "". Send null when
    // unselected so the constraint (which allows NULL) passes. The project_type
    // field was removed from this form, so it is intentionally not written here
    // (any existing stored value is left untouched).
    const payload = {
      ...infoPayload,
      project_id: projectId,
      project_status: infoPayload.project_status || null,
    };
    let saveError = false;
    if (existingId) {
      const { error } = await supabase.from("project_info").update(payload).eq("id", existingId);
      if (error) { toast.error(error.message); saveError = true; }
    } else {
      const { data, error } = await supabase.from("project_info").insert(payload).select("id").single();
      if (error) { toast.error(error.message); saveError = true; }
      else { setExistingId(data.id); }
    }
    // Save clickup_list_id to projects table
    if (!saveError) {
      await supabase.from("projects").update({
        updated_at: new Date().toISOString(),
        clickup_list_id: clickup_list_id || null,
      }).eq("id", projectId);
      toast.success("Project info saved.");
    }
    setSaving(false);
  };

  const mapsUrl = [info.street_address, info.city, info.state, info.zip_code].filter(Boolean).length > 0
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([info.street_address, info.city, info.state, info.zip_code].filter(Boolean).join(", "))}`
    : null;

  if (!loaded) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-8">
      {/* Entity Name */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Entity</h3>
        <Field label="Entity Name" value={info.entity_name} onChange={v => update("entity_name", v)} placeholder="e.g. Ashland Hotel LLC" />
      </section>

      {/* Property Details */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Property Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Street Address" value={info.street_address} onChange={v => update("street_address", v)} className="sm:col-span-2" />
          <Field label="City" value={info.city} onChange={v => update("city", v)} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={info.state} onValueChange={v => update("state", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Zip Code" value={info.zip_code} onChange={v => update("zip_code", v)} />
          </div>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> View on Google Maps
          </a>
        )}
      </section>

      {/* Project Details */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Project Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project Status</Label>
            <Select value={info.project_status} onValueChange={v => update("project_status", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Total Room Count {roomMatrixCount !== null ? <span className="text-muted-foreground font-normal">(from matrix: {roomMatrixCount})</span> : null}</Label>
            <Input type="number" value={info.total_room_count ?? ""} onChange={e => update("total_room_count", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Target Opening Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !info.target_opening_date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {info.target_opening_date ? format(new Date(info.target_opening_date), "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={info.target_opening_date ? new Date(info.target_opening_date) : undefined}
                  onSelect={d => update("target_opening_date", d ? format(d, "yyyy-MM-dd") : null)}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </section>

      {/* Contacts */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contacts</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner Name" value={info.owner_name} onChange={v => update("owner_name", v)} />
          <Field label="Owner Email" value={info.owner_email} onChange={v => update("owner_email", v)} type="email" />
          <Field label="General Contractor" value={info.general_contractor} onChange={v => update("general_contractor", v)} />
          <Field label="Architect" value={info.architect} onChange={v => update("architect", v)} />
          <Field label="Interior Designer" value={info.interior_designer} onChange={v => update("interior_designer", v)} />
        </div>
      </section>

      {/* Integrations */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Integrations</h3>
        <Field label="ClickUp List ID" value={info.clickup_list_id} onChange={v => update("clickup_list_id", v)} placeholder="e.g. 901234567890" />
        <ProjectAccountField projectId={projectId} />
      </section>

      {/* Invoice Approvers */}
      <ProjectApprovers projectId={projectId} />

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Saving…" : "Save Project Info"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; className?: string; placeholder?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ProjectAccountField({ projectId }: { projectId: string }) {
  const { isPartner } = useAuth();
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isPartner) return;
    (async () => {
      const [{ data: accts }, { data: proj }] = await Promise.all([
        supabase.from("plaid_accounts").select("id, institution_name, mask, name"),
        supabase.from("projects").select("plaid_account_id").eq("id", projectId).single(),
      ]);
      if (accts) {
        setAccounts(accts.map((a: any) => ({
          id: a.id,
          label: `${a.institution_name}${a.mask ? ` — ${a.mask}` : ""} (${a.name})`,
        })));
      }
      setSelected((proj as any)?.plaid_account_id ?? "");
      setLoaded(true);
    })();
  }, [projectId, isPartner]);

  if (!isPartner || !loaded) return null;

  const handleChange = async (value: string) => {
    const accountId = value === "none" ? null : value;
    setSelected(accountId ?? "");
    const { error } = await supabase
      .from("projects")
      .update({ plaid_account_id: accountId } as any)
      .eq("id", projectId);
    if (error) toast.error("Failed to link account");
    else toast.success(accountId ? "Account linked to project" : "Account unlinked");
  };

  return (
    <div className="space-y-1.5">
      <Label>Project Account</Label>
      <Select value={selected || "none"} onValueChange={handleChange}>
        <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No account linked</SelectItem>
          {accounts.map(a => (
            <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Link a Plaid-connected bank account to this project.</p>
    </div>
  );
}
