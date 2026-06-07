import InvoicesTable from "@/components/invoices/InvoicesTable";

export default function Invoices() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground">Approve, route, and track invoices across every project.</p>
      </div>
      <InvoicesTable />
    </div>
  );
}
