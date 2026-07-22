import { FileText } from "lucide-react";

interface Props {
  projectId: string;
  projectName: string;
}

// Placeholder — the contracts feature (billing mode, contract list, retainage
// inheritance) will be built out here. The first-tier tab and route exist now
// so the navigation is in place.
export default function ContractsModule({ projectId, projectName }: Props) {
  return (
    <div className="pt-2">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/60" />
        <div className="mt-3 text-sm font-medium">Contracts</div>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Contract-level billing, retainage defaults, and change-order tracking
          for {projectName} will live here.
        </p>
      </div>
    </div>
  );
}
