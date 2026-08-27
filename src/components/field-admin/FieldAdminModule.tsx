import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardCheck, FileStack, PencilRuler, HelpCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import FieldAdminList from "./FieldAdminList";
import { statusPillClass, PERMIT_STATUSES, INSPECTION_STATUSES, REVIEW_STATUSES, RFI_STATUSES } from "./types";

interface Props {
  projectId: string;
}

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "MM/dd/yy") : "—");

const StatusPill = ({ status }: { status: string | null }) => (
  status ? <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(status)}`}>{status}</span> : <span className="text-muted-foreground">—</span>
);

const DocLink = ({ url }: { url: string | null }) => (
  url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
      <ExternalLink className="h-3 w-3" /> View
    </a>
  ) : <span className="text-muted-foreground">—</span>
);

export default function FieldAdminModule({ projectId }: Props) {
  return (
    <Tabs defaultValue="permits" className="mt-2">
      <TabsList>
        <TabsTrigger value="permits" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Permits</TabsTrigger>
        <TabsTrigger value="submittals" className="gap-1.5"><FileStack className="h-3.5 w-3.5" /> Submittals</TabsTrigger>
        <TabsTrigger value="shop-drawings" className="gap-1.5"><PencilRuler className="h-3.5 w-3.5" /> Shop Drawings</TabsTrigger>
        <TabsTrigger value="rfis" className="gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> RFIs</TabsTrigger>
      </TabsList>

      <TabsContent value="permits">
        <FieldAdminList
          projectId={projectId}
          table="field_permits"
          titleField="permit_name"
          itemLabel="Permit"
          statusField="status"
          defaultStatus="Not Submitted"
          columns={[
            { key: "permit_name", label: "Permit" },
            { key: "permit_type", label: "Type" },
            { key: "jurisdiction", label: "Jurisdiction" },
            { key: "responsible_party", label: "Responsible Party" },
            { key: "submitted_date", label: "Submitted", render: (r) => fmtDate(r.submitted_date) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "inspection_status", label: "Inspection", render: (r) => <StatusPill status={r.inspection_status} /> },
            { key: "document_url", label: "Doc", render: (r) => <DocLink url={r.document_url} /> },
          ]}
          formFields={[
            { type: "text", key: "permit_name", label: "Permit Name" },
            { type: "text", key: "permit_type", label: "Permit Type", placeholder: "e.g. Building, Electrical, Fire" },
            { type: "text", key: "jurisdiction", label: "Jurisdiction" },
            { type: "text", key: "responsible_party", label: "Responsible Party", placeholder: "e.g. GC, Owner Rep" },
            { type: "date", key: "submitted_date", label: "Submitted Date" },
            { type: "select", key: "status", label: "Status", options: PERMIT_STATUSES },
            { type: "select", key: "inspection_status", label: "Inspection Status", options: INSPECTION_STATUSES },
            { type: "date", key: "expiration_date", label: "Expiration Date" },
            { type: "text", key: "document_url", label: "Document URL", span: 2, placeholder: "https://drive.google.com/..." },
            { type: "textarea", key: "notes", label: "Notes", span: 2 },
          ]}
        />
      </TabsContent>

      <TabsContent value="submittals">
        <FieldAdminList
          projectId={projectId}
          table="field_submittals"
          titleField="submittal_name"
          itemLabel="Submittal"
          statusField="status"
          defaultStatus="Pending"
          columns={[
            { key: "submittal_name", label: "Submittal" },
            { key: "spec_section", label: "Spec Section" },
            { key: "submitted_by", label: "Submitted By" },
            { key: "reviewer", label: "Reviewer" },
            { key: "submitted_date", label: "Submitted", render: (r) => fmtDate(r.submitted_date) },
            { key: "due_date", label: "Due", render: (r) => fmtDate(r.due_date) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "document_url", label: "Doc", render: (r) => <DocLink url={r.document_url} /> },
          ]}
          formFields={[
            { type: "text", key: "submittal_name", label: "Submittal Name" },
            { type: "text", key: "spec_section", label: "Spec Section" },
            { type: "text", key: "submitted_by", label: "Submitted By" },
            { type: "text", key: "reviewer", label: "Reviewer", placeholder: "e.g. Architect, GC" },
            { type: "date", key: "submitted_date", label: "Submitted Date" },
            { type: "date", key: "due_date", label: "Due Date" },
            { type: "select", key: "status", label: "Status", options: REVIEW_STATUSES },
            { type: "text", key: "document_url", label: "Document URL", span: 2, placeholder: "https://drive.google.com/..." },
            { type: "textarea", key: "notes", label: "Notes", span: 2 },
          ]}
        />
      </TabsContent>

      <TabsContent value="shop-drawings">
        <FieldAdminList
          projectId={projectId}
          table="field_shop_drawings"
          titleField="drawing_name"
          itemLabel="Shop Drawing"
          statusField="status"
          defaultStatus="Pending"
          columns={[
            { key: "drawing_name", label: "Drawing" },
            { key: "trade", label: "Trade" },
            { key: "revision_number", label: "Revision" },
            { key: "submitted_date", label: "Submitted", render: (r) => fmtDate(r.submitted_date) },
            { key: "due_date", label: "Due", render: (r) => fmtDate(r.due_date) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "document_url", label: "Doc", render: (r) => <DocLink url={r.document_url} /> },
          ]}
          formFields={[
            { type: "text", key: "drawing_name", label: "Drawing Name" },
            { type: "text", key: "trade", label: "Trade" },
            { type: "text", key: "revision_number", label: "Revision #" },
            { type: "date", key: "submitted_date", label: "Submitted Date" },
            { type: "date", key: "due_date", label: "Due Date" },
            { type: "select", key: "status", label: "Status", options: REVIEW_STATUSES },
            { type: "text", key: "document_url", label: "Document URL", span: 2, placeholder: "https://drive.google.com/..." },
            { type: "textarea", key: "notes", label: "Notes", span: 2 },
          ]}
        />
      </TabsContent>

      <TabsContent value="rfis">
        <FieldAdminList
          projectId={projectId}
          table="field_rfis"
          titleField="subject"
          itemLabel="RFI"
          statusField="status"
          defaultStatus="Open"
          columns={[
            { key: "rfi_number", label: "#" },
            { key: "subject", label: "Subject" },
            { key: "submitted_by", label: "From" },
            { key: "submitted_to", label: "To" },
            { key: "submitted_date", label: "Submitted", render: (r) => fmtDate(r.submitted_date) },
            { key: "response_date", label: "Responded", render: (r) => fmtDate(r.response_date) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "document_url", label: "Doc", render: (r) => <DocLink url={r.document_url} /> },
          ]}
          formFields={[
            { type: "text", key: "rfi_number", label: "RFI #" },
            { type: "text", key: "subject", label: "Subject" },
            { type: "text", key: "submitted_by", label: "Submitted By" },
            { type: "text", key: "submitted_to", label: "Submitted To" },
            { type: "date", key: "submitted_date", label: "Submitted Date" },
            { type: "date", key: "response_date", label: "Response Date" },
            { type: "select", key: "status", label: "Status", options: RFI_STATUSES },
            { type: "textarea", key: "response_summary", label: "Response Summary", span: 2 },
            { type: "text", key: "document_url", label: "Document URL", span: 2, placeholder: "https://drive.google.com/..." },
            { type: "textarea", key: "notes", label: "Notes", span: 2 },
          ]}
        />
      </TabsContent>
    </Tabs>
  );
}
