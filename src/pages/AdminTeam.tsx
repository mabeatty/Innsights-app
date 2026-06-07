import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Pencil, Plus, AlertTriangle } from "lucide-react";

interface Member {
  id: string;
  role: string | null;
  expense_role: string | null;
  supervisor_id: string | null;
  user_id: string | null;
  investment_access: boolean;
  access_level: string;
  email?: string;
  project_access_count?: number;
  project_access_names?: string[];
}

interface ProjectOption {
  id: string;
  name: string;
  project_type: string;
}

const EXPENSE_ROLES = ["Partner", "Manager", "Employee", "Consultant/Third Party"];
const ACCESS_LEVELS = ["view", "edit", "admin"];

const isConsultantRole = (role: string | null | undefined) =>
  role === "Consultant/Third Party";

export default function AdminTeam({ embedded }: { embedded?: boolean }) {
  const { organizationId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);

  // All projects for the picker
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [expenseRole, setExpenseRole] = useState("Employee");
  const [supervisorId, setSupervisorId] = useState("none");
  const [investmentAccess, setInvestmentAccess] = useState(false);
  const [accessLevelField, setAccessLevelField] = useState("edit");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const fetchMembers = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("organization_members")
      .select("id, role, expense_role, supervisor_id, user_id, investment_access, access_level")
      .eq("organization_id", organizationId);

    if (!data) { setLoading(false); return; }

    const userIds = data.map((m) => m.user_id).filter(Boolean) as string[];

    // Fetch emails, projects, and consultant access in parallel
    const [emailResult, projectResult, accessResult] = await Promise.all([
      supabase.functions.invoke("get-team-emails", { body: { userIds } }).catch(() => ({ data: null })),
      supabase.from("projects").select("id, name, project_type").eq("organization_id", organizationId),
      supabase.from("consultant_project_access").select("member_id, project_id"),
    ]);

    const emailMap: Record<string, string> = emailResult?.data?.emails ?? {};
    setAllProjects((projectResult.data ?? []) as ProjectOption[]);

    // Build consultant access map: member_id -> project names[]
    const projectMap = new Map<string, string>();
    (projectResult.data ?? []).forEach((p: any) => projectMap.set(p.id, p.name));

    const accessByMember = new Map<string, string[]>();
    const countByMember = new Map<string, number>();
    (accessResult.data ?? []).forEach((a: any) => {
      if (!accessByMember.has(a.member_id)) accessByMember.set(a.member_id, []);
      accessByMember.get(a.member_id)!.push(projectMap.get(a.project_id) || "Unknown");
      countByMember.set(a.member_id, (countByMember.get(a.member_id) || 0) + 1);
    });

    setMembers(data.map((m) => ({
      ...m,
      investment_access: m.investment_access ?? false,
      access_level: m.access_level ?? "edit",
      email: m.user_id ? emailMap[m.user_id] ?? "—" : "—",
      project_access_count: countByMember.get(m.id) ?? 0,
      project_access_names: accessByMember.get(m.id) ?? [],
    })));

    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [organizationId]);

  const openInviteModal = () => {
    setEditingMember(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setExpenseRole("Employee");
    setSupervisorId("none");
    setInvestmentAccess(false);
    setAccessLevelField("edit");
    setSelectedProjectIds(new Set());
    setModalOpen(true);
  };

  const openEditModal = async (member: Member) => {
    setEditingMember(member);
    setFirstName("");
    setLastName("");
    setEmail(member.email ?? "");
    setExpenseRole(member.expense_role || "Employee");
    setSupervisorId(member.supervisor_id || "none");
    setInvestmentAccess(member.investment_access || member.expense_role === "Partner");
    setAccessLevelField(member.access_level || "edit");

    // Load existing project access for this member
    if (isConsultantRole(member.expense_role)) {
      const { data } = await supabase
        .from("consultant_project_access")
        .select("project_id")
        .eq("member_id", member.id);
      setSelectedProjectIds(new Set((data ?? []).map((r) => r.project_id)));
    } else {
      setSelectedProjectIds(new Set());
    }

    setModalOpen(true);
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const saveProjectAccess = async (memberId: string) => {
    // Delete all existing, then insert new
    const { error: deleteError } = await supabase.from("consultant_project_access").delete().eq("member_id", memberId);
    if (deleteError) {
      console.error("Failed to delete existing project access:", deleteError);
      toast.error("Failed to update project access — could not clear existing assignments.");
      return;
    }
    if (selectedProjectIds.size > 0) {
      const rows = Array.from(selectedProjectIds).map((pid) => ({
        member_id: memberId,
        project_id: pid,
      }));
      const { error: insertError } = await supabase.from("consultant_project_access").insert(rows);
      if (insertError) {
        console.error("Failed to insert project access:", insertError);
        toast.error("Failed to save project assignments. Please try again.");
        return;
      }
    }
  };

  const handleSubmit = async () => {
    if (editingMember) {
      const { error } = await supabase
        .from("organization_members")
        .update({
          expense_role: expenseRole,
          supervisor_id: supervisorId === "none" ? null : supervisorId,
          investment_access: investmentAccess,
          access_level: accessLevelField,
        })
        .eq("id", editingMember.id);
      if (error) {
        toast.error("Failed to update member.");
      } else {
        // Save project access if consultant
        if (isConsultantRole(expenseRole)) {
          await saveProjectAccess(editingMember.id);
        } else {
          // Clean up access if role changed away from consultant
          await supabase.from("consultant_project_access").delete().eq("member_id", editingMember.id);
        }
        toast.success("Member updated.");
      }
      setModalOpen(false);
      fetchMembers();
      return;
    }

    // Invite new member
    if (!email.trim()) {
      toast.error("Email is required.");
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          expenseRole,
          supervisorId: supervisorId === "none" ? null : supervisorId,
          investmentAccess,
          accessLevel: accessLevelField,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Failed to send invitation.");
      } else {
        // If consultant, save project access using the returned member ID
        if (isConsultantRole(expenseRole) && data?.memberId) {
          await saveProjectAccess(data.memberId);
        }
        toast.success("Invitation sent to " + email.trim());
        setModalOpen(false);
        fetchMembers();
      }
    } catch {
      toast.error("Failed to send invitation.");
    }
    setInviting(false);
  };

  // Auto-check investment access when Partner is selected
  useEffect(() => {
    if (expenseRole === "Partner") {
      setInvestmentAccess(true);
    }
  }, [expenseRole]);

  // Group projects by type for the picker
  const devProjects = allProjects
    .filter((p) => p.project_type === "Development" || p.project_type === "New Construction" || p.project_type === "Conversion")
    .sort((a, b) => a.name.localeCompare(b.name));
  const pipProjects = allProjects
    .filter((p) => p.project_type === "Asset Management" || p.project_type === "Renovation")
    .sort((a, b) => a.name.localeCompare(b.name));
  const otherProjects = allProjects
    .filter((p) => !devProjects.includes(p) && !pipProjects.includes(p))
    .sort((a, b) => a.name.localeCompare(b.name));

  const renderProjectGroup = (label: string, projects: ProjectOption[]) => {
    if (projects.length === 0) return null;
    return (
      <div key={label} className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        {projects.map((p) => (
          <label key={p.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer">
            <Checkbox
              checked={selectedProjectIds.has(p.id)}
              onCheckedChange={() => toggleProject(p.id)}
            />
            <span className="text-sm">{p.name}</span>
          </label>
        ))}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-foreground">Team</h1>
            <Button onClick={openInviteModal} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Invite Member
            </Button>
          </div>
        )}
        {embedded && (
          <div className="flex justify-end">
            <Button onClick={openInviteModal} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Invite Member
            </Button>
          </div>
        )}

        {/* Warning for consultants with no projects assigned */}
        {!loading && (() => {
          const unassigned = members.filter(
            (m) => isConsultantRole(m.expense_role) && (m.project_access_count ?? 0) === 0
          );
          if (unassigned.length === 0) return null;
          return (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 p-3 text-sm text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Consultants with no projects assigned:</p>
                <p className="text-xs mt-0.5">{unassigned.map((m) => m.email).join(", ")}</p>
                <p className="text-xs mt-1 text-muted-foreground">These users will see a blank dashboard. Edit their profile to assign projects.</p>
              </div>
            </div>
          );
        })()}

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No team members found.</p>
        ) : (
          <div className="border rounded-md overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>System Role</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead>Expense Role</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Investments</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const supervisor = members.find((s) => s.id === m.supervisor_id);
                  const hasAccess = m.investment_access || m.expense_role === "Partner";
                  const showProjects = isConsultantRole(m.expense_role);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {m.role ?? "member"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.access_level === "admin" ? "default" : m.access_level === "view" ? "outline" : "secondary"} className="capitalize text-xs">
                          {m.access_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{m.expense_role || "Employee"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {m.expense_role === "Partner" ? "N/A" : supervisor?.email || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {showProjects ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs cursor-help">
                                {m.project_access_count} project{m.project_access_count !== 1 ? "s" : ""}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              {(m.project_access_names?.length ?? 0) > 0
                                ? m.project_access_names!.join(", ")
                                : "No projects assigned"}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={hasAccess ? "default" : "outline"} className="text-xs">
                          {hasAccess ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingMember ? "Edit Member" : "Invite Member"}</DialogTitle>
              <DialogDescription>
                {editingMember ? "Update role and supervisor for this team member." : "Send an email invitation to join the team."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {!editingMember && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
                  </div>
                </>
              )}
              {editingMember && (
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <p className="text-sm text-muted-foreground">{editingMember.email}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Access Level</Label>
                <Select value={accessLevelField} onValueChange={setAccessLevelField}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((l) => (
                      <SelectItem key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">View = read-only, Edit = full access, Admin = Edit + Settings</p>
              </div>
              <div className="space-y-1.5">
                <Label>Expense Role</Label>
                <Select value={expenseRole} onValueChange={setExpenseRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {expenseRole !== "Partner" && (
                <div className="space-y-1.5">
                  <Label>Supervisor</Label>
                  <Select value={supervisorId} onValueChange={setSupervisorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {members
                        .filter((sup) => !editingMember || sup.id !== editingMember.id)
                        .map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>{sup.email}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Project picker for Consultant/Third Party */}
              {isConsultantRole(expenseRole) && (
                <div className="space-y-2">
                  <Label>Project Access</Label>
                  <p className="text-xs text-muted-foreground">Select projects this consultant can view.</p>
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-3">
                    {allProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No projects available.</p>
                    ) : (
                      <>
                        {renderProjectGroup("Development", devProjects)}
                        {renderProjectGroup("Asset Management", pipProjects)}
                        {renderProjectGroup("Other", otherProjects)}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? "s" : ""} selected
                  </p>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="investmentAccess"
                  checked={investmentAccess}
                  onCheckedChange={(checked) => setInvestmentAccess(checked === true)}
                />
                <Label htmlFor="investmentAccess" className="text-sm font-normal cursor-pointer">
                  Investment Management Access
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={inviting}>
                {inviting ? "Sending…" : editingMember ? "Save Changes" : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
