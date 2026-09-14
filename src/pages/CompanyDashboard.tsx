import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign, TrendingUp, Building2, HardHat, Handshake, LayoutGrid } from "lucide-react";
import CompanyFinancialsTab from "@/components/company/CompanyFinancialsTab";
import DevFeesTab from "@/components/company/DevFeesTab";
import RevenueSummaryTab from "@/components/company/RevenueSummaryTab";
import CompanyRevenueTab from "@/components/company/CompanyRevenueTab";

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
          <TabsTrigger value="revenue" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Revenue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financials">
          <CompanyFinancialsTab />
        </TabsContent>

        <TabsContent value="revenue">
          <Tabs defaultValue="summary" className="pt-2">
            <TabsList>
              <TabsTrigger value="summary" className="gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" /> Summary
              </TabsTrigger>
              <TabsTrigger value="devfees" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Development Fees
              </TabsTrigger>
              <TabsTrigger value="constructionfees" className="gap-1.5">
                <HardHat className="h-3.5 w-3.5" /> Construction Fees
              </TabsTrigger>
              <TabsTrigger value="consultingfees" className="gap-1.5">
                <Handshake className="h-3.5 w-3.5" /> Consulting Fees
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              <RevenueSummaryTab />
            </TabsContent>
            <TabsContent value="devfees">
              <DevFeesTab />
            </TabsContent>
            <TabsContent value="constructionfees">
              <CompanyRevenueTab revenueType="construction_fee" title="Construction Fees" color="#eda100" />
            </TabsContent>
            <TabsContent value="consultingfees">
              <CompanyRevenueTab revenueType="consulting_fee" title="Consulting Fees" color="#8e44ad" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
