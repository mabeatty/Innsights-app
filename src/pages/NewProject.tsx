import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PROJECT_STATUSES } from "@/lib/projectStatus";

interface Brand { id: string; name: string; code: string; }

type ProjectType = "Development" | "Asset Management";

export default function NewProject() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [status, setStatus] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.from("brands").select("*").then(({ data }) => setBrands(data ?? []));
  }, []);

  const handleCreate = async () => {
    if (!projectName || !brandId || !projectType || !status || !user) {
      toast.error("Please fill in all fields.");
      return;
    }
    // Get user's organization
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!orgMember?.organization_id) {
      toast.error("You are not assigned to an organization.");
      return;
    }

    setCreating(true);
    try {
      const { data: project, error } = await supabase
        .from("projects")
        .insert({ name: projectName, hotel_name: projectName, brand_id: brandId, user_id: user.id, project_type: projectType, organization_id: orgMember.organization_id })
        .select()
        .single();
      if (error || !project) throw error;

      // Persist the status to project_info.project_status — the same field the
      // Project Info form reads/writes afterward. project_info.project_id is
      // UNIQUE, so this is the single status row for the project.
      const { error: infoError } = await supabase
        .from("project_info")
        .insert({ project_id: project.id, project_status: status });
      if (infoError) {
        toast.warning("Project created, but the status could not be saved — set it in Project Info.");
      } else {
        toast.success("Project created!");
      }
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create project.");
      setCreating(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Project</h1>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="projectName">Project Name</Label>
          <Input id="projectName" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Brand</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger>
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Project Type</Label>
          <Select value={projectType} onValueChange={(v) => setProjectType(v as ProjectType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select project type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Development">Development</SelectItem>
              <SelectItem value="Asset Management">Asset Management</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={handleCreate} disabled={creating} size="lg">
        {creating ? "Creating…" : "Create Project"}
      </Button>
    </div>
  );
}
