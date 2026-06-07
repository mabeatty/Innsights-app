import { useEffect, useState, useCallback } from "react";
import { LayoutDashboard, FolderPlus, LogOut, FileText, Settings, Users, ChevronRight, Receipt, TrendingUp, GripVertical, AlertTriangle, FolderOpen, Building2, FileCheck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useAlerts } from "@/hooks/useAlerts";

const STORAGE_KEY = "innsights-sidebar-order";

const defaultDraggableItems = [
  { title: "Investment Management", url: "/investments", icon: TrendingUp, requiresInvestmentAccess: true },
  { title: "Internal Documents", url: "/internal-documents", icon: FolderOpen, requiresInvestmentAccess: false },
  { title: "Vendors", url: "/vendors", icon: Building2, requiresInvestmentAccess: false },
  { title: "Expense Reporting", url: "/expenses", icon: Receipt, requiresInvestmentAccess: false },
  { title: "Invoices", url: "/invoices", icon: FileCheck, requiresInvestmentAccess: false },
  { title: "New Project", url: "/new-project", icon: FolderPlus, requiresInvestmentAccess: false },
];

const iconMap: Record<string, typeof LayoutDashboard> = {
  TrendingUp, Receipt, FolderPlus, FolderOpen, Settings, Users,
};

interface SidebarProject {
  id: string;
  name: string;
  project_type: "Development" | "Asset Management";
  brands: { name: string } | null;
}

export function AppSidebar() {
  const { signOut, user, investmentAccess, isConsultant, consultantProjectIds, accessLevel } = useAuth();
  const { getProjectsWithAlerts } = useAlerts();
  const projectsWithAlerts = getProjectsWithAlerts();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [devOpen, setDevOpen] = useState(true);
  const [pipOpen, setPipOpen] = useState(true);

  // Draggable nav items state
  const [draggableItems, setDraggableItems] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const titles: string[] = JSON.parse(stored);
        const itemMap = new Map(defaultDraggableItems.map(i => [i.title, i]));
        const ordered = titles
          .map(t => itemMap.get(t))
          .filter(Boolean) as typeof defaultDraggableItems;
        for (const item of defaultDraggableItems) {
          if (!ordered.find(o => o.title === item.title)) ordered.push(item);
        }
        return ordered;
      }
    } catch {}
    return defaultDraggableItems;
  });

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => setDragIdx(idx), []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setDraggableItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  }, [dragIdx]);
  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDraggableItems(prev => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.map(i => i.title)));
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("id, name, project_type, brands(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        let allProjects = (data as unknown as SidebarProject[]) ?? [];
        // Filter for consultants
        if (isConsultant) {
          allProjects = allProjects.filter((p) => consultantProjectIds.includes(p.id));
        }
        setProjects(allProjects);
      });
  }, [user, location.pathname, isConsultant, consultantProjectIds]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const newDevProjects = projects.filter((p) => p.project_type === "Development").sort((a, b) => a.name.localeCompare(b.name));
  const pipProjects = projects.filter((p) => p.project_type === "Asset Management").sort((a, b) => a.name.localeCompare(b.name));

  // Filter draggable items for consultants and view-only users
  const visibleDraggableItems = isConsultant
    ? []
    : draggableItems
        .filter((item) => !item.requiresInvestmentAccess || investmentAccess)
        .filter((item) => accessLevel !== "view" || (item.url !== "/internal-documents" && item.url !== "/vendors" && item.url !== "/invoices"));

  const renderProjectList = (items: SidebarProject[]) => (
    <SidebarMenu>
      {items.map((p) => (
        <SidebarMenuItem key={p.id}>
          <SidebarMenuButton asChild>
            <NavLink
              to={`/project/${p.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm truncate"
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{p.name}{p.brands ? ` - ${p.brands.name}` : ""}</span>
              {projectsWithAlerts.has(p.id) && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar className="border-r-0">
      <div className="flex h-14 items-center px-5 border-b border-sidebar-border">
        <span className="text-lg font-bold tracking-tight text-sidebar-primary">
          Innsights
        </span>
      </div>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard is always first and not draggable */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/dashboard"
                    end
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Draggable items (hidden for consultants) */}
              {visibleDraggableItems.map((item, idx) => (
                <SidebarMenuItem
                  key={item.title}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={dragIdx === idx ? "opacity-50" : ""}
                >
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0 -ml-1 mr-0 cursor-grab" />
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {newDevProjects.length > 0 && (
          <SidebarGroup>
            <Collapsible open={devOpen} onOpenChange={setDevOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1 group cursor-pointer">
                <span className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-medium">
                  Development
                </span>
                <ChevronRight className={`h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform duration-200 ${devOpen ? "rotate-90" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  {renderProjectList(newDevProjects)}
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {pipProjects.length > 0 && (
          <SidebarGroup>
            <Collapsible open={pipOpen} onOpenChange={setPipOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1 group cursor-pointer">
                <span className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-medium">
                  Asset Management
                </span>
                <ChevronRight className={`h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform duration-200 ${pipOpen ? "rotate-90" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  {renderProjectList(pipProjects)}
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        {!isConsultant && (
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </NavLink>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
