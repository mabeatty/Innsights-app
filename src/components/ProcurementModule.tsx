import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, Gavel } from "lucide-react";
import TakeoffModule from "@/components/TakeoffModule";
import VendorQuotesModule from "@/components/VendorQuotesModule";

interface ProcurementModuleProps {
  projectId: string;
  projectName: string;
  brandId: string;
}

export default function ProcurementModule({ projectId, projectName, brandId }: ProcurementModuleProps) {
  return (
    <Tabs defaultValue="takeoff" className="mt-4">
      <TabsList>
        <TabsTrigger value="takeoff" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> FF&E Takeoff
        </TabsTrigger>
        <TabsTrigger value="purchase-orders" className="gap-1.5">
          <Gavel className="h-3.5 w-3.5" /> Purchase Orders
        </TabsTrigger>
      </TabsList>
      <TabsContent value="takeoff">
        <TakeoffModule projectId={projectId} projectName={projectName} brandId={brandId} />
      </TabsContent>
      <TabsContent value="purchase-orders">
        <VendorQuotesModule projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}
