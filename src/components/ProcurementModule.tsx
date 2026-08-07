import TakeoffModule from "@/components/TakeoffModule";

interface ProcurementModuleProps {
  projectId: string;
  projectName: string;
  brandId: string;
}

export default function ProcurementModule({ projectId, projectName, brandId }: ProcurementModuleProps) {
  return (
    <div className="mt-4">
      <TakeoffModule projectId={projectId} projectName={projectName} brandId={brandId} />
    </div>
  );
}
