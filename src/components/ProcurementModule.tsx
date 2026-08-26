import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Gavel, ClipboardList, Building2, Truck } from "lucide-react";
import TakeoffModule from "@/components/TakeoffModule";
import RoomMatrixModule from "@/components/RoomMatrixModule";
import VendorQuotesModule from "@/components/VendorQuotesModule";
import VendorDeliveriesModule from "@/components/VendorDeliveriesModule";

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
        <TabsTrigger value="room-matrix" className="gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Room Matrix
        </TabsTrigger>
        <TabsTrigger value="takeoff" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> FF&E Takeoff
        </TabsTrigger>
        <TabsTrigger value="deliveries" className="gap-1.5">
          <Truck className="h-3.5 w-3.5" /> Deliveries & Rentals
        </TabsTrigger>
      </TabsList>
      <TabsContent value="bidding">
        <VendorQuotesModule projectId={projectId} />
      </TabsContent>
      <TabsContent value="room-matrix">
        <RoomMatrixModule projectId={projectId} brandId={brandId} />
      </TabsContent>
      <TabsContent value="takeoff">
        <TakeoffModule projectId={projectId} projectName={projectName} brandId={brandId} />
      </TabsContent>
      <TabsContent value="deliveries">
        <VendorDeliveriesModule projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}
