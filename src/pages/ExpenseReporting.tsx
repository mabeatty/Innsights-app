import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Settings, Inbox, FileText, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ExpenseInbox from "@/components/expenses/ExpenseInbox";
import CurrentReport from "@/components/expenses/CurrentReport";
import PastReports from "@/components/expenses/PastReports";

export default function ExpenseReporting() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleInboxChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Expense Reporting</h1>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/expenses/settings")}>
          <Settings className="h-3.5 w-3.5" /> Settings
        </Button>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> Inbox
          </TabsTrigger>
          <TabsTrigger value="current" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Current Report
          </TabsTrigger>
          <TabsTrigger value="past" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Past Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox"><ExpenseInbox onTransactionSaved={handleInboxChange} /></TabsContent>
        <TabsContent value="current"><CurrentReport refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="past"><PastReports onReportChanged={handleInboxChange} /></TabsContent>
      </Tabs>
    </div>
  );
}
