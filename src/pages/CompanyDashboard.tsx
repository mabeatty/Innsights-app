import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign } from "lucide-react";
import CompanyFinancialsTab from "@/components/company/CompanyFinancialsTab";

export default function CompanyDashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">Company dashboard</h1>
      </div>

      <Tabs defaultValue="financials">
        <TabsList>
          <TabsTrigger value="financials" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Company Financials
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financials">
          <CompanyFinancialsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
