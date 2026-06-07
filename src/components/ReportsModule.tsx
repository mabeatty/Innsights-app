import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Camera, FileText, BotMessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PhotosTab from "@/components/reports/PhotosTab";
import WeeklyReportsTab from "@/components/reports/WeeklyReportsTab";
import ReportHistory from "@/components/reports/ReportHistory";
import AutomatedReportingModule from "@/components/AutomatedReportingModule";

interface ReportsModuleProps {
  projectId: string;
  projectName?: string;
  entityName?: string;
  brandName?: string;
  projectType?: string;
}

export default function ReportsModule({ projectId, projectName, entityName, brandName, projectType }: ReportsModuleProps) {
  const { isConsultant, accessLevel } = useAuth();
  const canEdit = !isConsultant && accessLevel !== "view";
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <Tabs defaultValue="weekly-reports" className="mt-4">
      <TabsList>
        <TabsTrigger value="weekly-reports" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Weekly Reports
        </TabsTrigger>
        <TabsTrigger value="photos" className="gap-1.5">
          <Camera className="h-3.5 w-3.5" /> Photos
        </TabsTrigger>
        <TabsTrigger value="automated-reporting" className="gap-1.5">
          <BotMessageSquare className="h-3.5 w-3.5" /> Automated Reporting
        </TabsTrigger>
      </TabsList>

      <TabsContent value="weekly-reports">
        <WeeklyReportsTab projectId={projectId} canEdit={canEdit} />
        <ReportHistory projectId={projectId} canEdit={canEdit} refreshTrigger={historyRefresh} />
      </TabsContent>
      <TabsContent value="photos">
        <PhotosTab projectId={projectId} projectName={projectName} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="automated-reporting">
        <AutomatedReportingModule
          projectId={projectId}
          projectName={projectName || "Project"}
          entityName={entityName || ""}
          brandName={brandName || ""}
          projectType={projectType || "Development"}
          onGenerated={() => setHistoryRefresh((n) => n + 1)}
        />
      </TabsContent>
    </Tabs>
  );
}