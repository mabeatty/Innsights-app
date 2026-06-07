import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/components/capital-planning/types";
import InvestorsTab from "@/components/investment/InvestorsTab";
import ProjectsTab from "@/components/investment/ProjectsTab";

interface InvestorPosition {
  id: string;
  project_id: string;
  investing_entity: string;
  contact_name: string | null;
  ownership_pct: number;
  committed: number;
  contributed: number;
  distributed: number;
  unreturned_capital: number;
  source: string;
}

interface ProjectWithInvestors {
  id: string;
  name: string;
  investors: InvestorPosition[];
}

export default function InvestmentManagement() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithInvestors[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: devProjects } = await supabase
        .from("projects")
        .select("id, name, project_type")
        .eq("project_type", "Development")
        .order("name");

      if (!devProjects || devProjects.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const projectIds = devProjects.map(p => p.id);

      const { data: positions } = await supabase
        .from("investor_positions")
        .select("*")
        .in("project_id", projectIds)
        .order("investing_entity");

      const positionsByProject = new Map<string, InvestorPosition[]>();
      for (const pos of (positions ?? []) as InvestorPosition[]) {
        const arr = positionsByProject.get(pos.project_id) ?? [];
        arr.push(pos);
        positionsByProject.set(pos.project_id, arr);
      }

      const result: ProjectWithInvestors[] = devProjects.map(p => ({
        id: p.id,
        name: p.name,
        investors: positionsByProject.get(p.id) ?? [],
      }));

      setProjects(result);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Investment Management</h1>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="investors">Investors</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 pt-2">
          {projects.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No development projects with investor data found.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                        <th className="px-4 py-2">Project Name</th>
                        <th className="px-4 py-2 text-right">Total Commitment</th>
                        <th className="px-4 py-2 text-right">Called to Date</th>
                        <th className="px-4 py-2 text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map(project => {
                        const totals = project.investors.reduce(
                          (acc, inv) => ({
                            committed: acc.committed + Number(inv.committed),
                            contributed: acc.contributed + Number(inv.contributed),
                          }),
                          { committed: 0, contributed: 0 }
                        );
                        const remaining = totals.committed - totals.contributed;
                        return (
                          <tr key={project.id} className="border-t hover:bg-muted/20">
                            <td className="px-4 py-2 font-medium">{project.name}</td>
                            <td className="px-4 py-2 text-right">{fmt(totals.committed)}</td>
                            <td className="px-4 py-2 text-right">{fmt(totals.contributed)}</td>
                            <td className="px-4 py-2 text-right">{fmt(remaining)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold text-sm">
                        <td className="px-4 py-2">Totals</td>
                        {(() => {
                          const grand = projects.reduce(
                            (acc, p) => {
                              for (const inv of p.investors) {
                                acc.committed += Number(inv.committed);
                                acc.contributed += Number(inv.contributed);
                              }
                              return acc;
                            },
                            { committed: 0, contributed: 0 }
                          );
                          return (
                            <>
                              <td className="px-4 py-2 text-right">{fmt(grand.committed)}</td>
                              <td className="px-4 py-2 text-right">{fmt(grand.contributed)}</td>
                              <td className="px-4 py-2 text-right">{fmt(grand.committed - grand.contributed)}</td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="projects" className="pt-2">
          <ProjectsTab />
        </TabsContent>

        <TabsContent value="investors" className="pt-2">
          <InvestorsTab projects={projects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
