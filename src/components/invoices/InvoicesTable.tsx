import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Plus, Search, Mail } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { Invoice, INVOICE_STATUSES, INVOICE_TYPES, statusBadgeClasses, formatCurrency } from "./types";
import UploadInvoiceModal from "./UploadInvoiceModal";
import InvoiceDetailDialog from "./InvoiceDetailDialog";

interface Props {
  projectId?: string; // scope to a single project when set
  projectName?: string;
  hideProjectColumn?: boolean;
}

export default function InvoicesTable({ projectId, hideProjectColumn }: Props) {
  const { accessLevel, isConsultant } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState("");

  const canUpload = accessLevel !== "view" && !isConsultant;

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("invoices").select("*, projects(id, name)").order("submitted_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    setInvoices((data as Invoice[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (projectId) return;
    supabase.from("projects").select("id, name").order("name").then(({ data }) => setProjects(data ?? []));
  }, [projectId]);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (projectFilter !== "all" && i.project_id !== projectFilter) return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (from && (!i.invoice_date || new Date(i.invoice_date) < from)) return false;
      if (to && (!i.invoice_date || new Date(i.invoice_date) > to)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(i.vendor_name?.toLowerCase().includes(s) || i.invoice_number?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, projectFilter, typeFilter, from, to, search]);

  const counts = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const pending = invoices.filter((i) => i.status === "Pending" || i.status === "Pending — Needs Review");
    return {
      pending: pending.length,
      approvedThisMonth: invoices.filter((i) => (i.status === "Approved" || i.status === "Partially Approved" || i.status === "Routed for Payment") && i.approved_at && new Date(i.approved_at) >= monthStart).length,
      rejected: invoices.filter((i) => i.status === "Rejected").length,
      totalPendingValue: pending.reduce((sum, i) => sum + Number(i.amount ?? 0), 0),
    };
  }, [invoices]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Pending</div><div className="text-xl font-semibold">{counts.pending}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Approved this month</div><div className="text-xl font-semibold">{counts.approvedThisMonth}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Rejected</div><div className="text-xl font-semibold">{counts.rejected}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total value pending</div><div className="text-xl font-semibold">{formatCurrency(counts.totalPendingValue)}</div></CardContent></Card>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search vendor or invoice #" className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {!projectId && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {INVOICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <DatePickerInput value={from} onChange={setFrom} placeholder="From" />
        <DatePickerInput value={to} onChange={setTo} placeholder="To" />
        {canUpload && (
          <Button onClick={() => setUploadOpen(true)} className="gap-1.5 h-9 ml-auto"><Plus className="h-3.5 w-3.5" />Upload Invoice</Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {!hideProjectColumn && <TableHead>Project</TableHead>}
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted By</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-sm">Loading…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-sm">No invoices.</TableCell></TableRow>}
            {filtered.map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => setSelectedId(i.id)}>
                {!hideProjectColumn && <TableCell className="text-xs">{i.projects?.name || "—"}</TableCell>}
                <TableCell className="text-xs font-medium">{i.vendor_name || "—"}</TableCell>
                <TableCell className="text-xs">{i.invoice_number || "—"}</TableCell>
                <TableCell className="text-xs">{i.invoice_date ? format(new Date(i.invoice_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-xs text-right">{formatCurrency(i.amount)}</TableCell>
                <TableCell className="text-xs">{i.type || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={`${statusBadgeClasses(i.status)} text-[10px]`}>{i.status}</Badge>
                    {i.source === "email" && <Badge variant="outline" className="text-[10px] gap-1"><Mail className="h-2.5 w-2.5" />Via Email</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{i.submitted_by_email || "—"}</TableCell>
                <TableCell className="text-xs">{format(new Date(i.submitted_at), "MMM d, yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UploadInvoiceModal open={uploadOpen} onOpenChange={setUploadOpen} defaultProjectId={projectId} onCreated={load} />
      <InvoiceDetailDialog invoiceId={selectedId} onClose={() => setSelectedId(null)} onChange={load} />
    </div>
  );
}
