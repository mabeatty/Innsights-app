import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Gavel, ClipboardList } from "lucide-react";
import TakeoffModule from "@/components/TakeoffModule";
import VendorQuotesModule from "@/components/VendorQuotesModule";

interface ProcurementModuleProps {
  projectId: string;
  projectName: string;
  brandId: string;
}

export default function ProcurementModule({ projectId, projectName, brandId }: ProcurementModuleProps) {
  return (
    <Tabs defaultValue="bidding" className="mt-4">
      <TabsList>
        <TabsTrigger value="bidding" className="gap-1.5">
          <Gavel className="h-3.5 w-3.5" /> Bidding
        </TabsTrigger>
        <TabsTrigger value="takeoff" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> FF&E Takeoff
        </TabsTrigger>
      </TabsList>
      <TabsContent value="bidding">
        <VendorQuotesModule projectId={projectId} />
      </TabsContent>
      <TabsContent value="takeoff">
        <TakeoffModule projectId={projectId} projectName={projectName} brandId={brandId} />
      </TabsContent>
    </Tabs>
  );
}
