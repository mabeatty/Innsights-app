import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, ExternalLink, Link, ArrowUp, ArrowDown, ArrowUpDown, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BudgetTransaction, ALL_DIVISIONS, TRANSACTION_TYPES, TRANSACTION_STATUSES, fmtDecimal,
  Contract, RetainageMode,
} from "./types";
import type { DrawRecord } from "./DrawHistoryTab";
import InvoiceDetailDialog from "@/components/invoices/InvoiceDetailDialog";
import { statusBadgeClasses } from "@/components/invoices/types";

interface Props {
  projectId: string;
  onTransactionsChange?: (txns: BudgetTransaction[]) => void;
  draws: DrawRecord[];
  onDrawsRefresh?: () => void;
}

interface LineItem {
  id: string;
  divisionNumber: string;
  amount: number;
  retainageAmount: number;
  retainageMode: RetainageMode;
  description: string;
}

interface TransactionGroup {
  groupId: string;
  transactionType: string;
  date: string;
  payee: string;
  status: string;
  notes: string | null;
  documentUrl: string | null;
  transactionNumber: number;
  items: BudgetTransaction[];
  totalAmount: number;
  totalRetainage: number;
  totalNet: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
}

interface Vendor {
  id: string;
  project_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

let lineItemCounter = 0;
const newLineItem = (): LineItem => ({
  id: `new-${++lineItemCounter}`,
  divisionNumber: "",
  amount: 0,
  retainageAmount: 0,
  retainageMode: "custom",
  description: "",
});

function buildGroups(txns: BudgetTransaction[]): TransactionGroup[] {
  const map = new Map<string, BudgetTransaction[]>();
  for (const t of txns) {
    const gid = (t as any).transaction_group_id ?? t.id;
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid)!.push(t);
  }
  const result: TransactionGroup[] = [];
  for (const [groupId, items] of map) {
    const first = items[0];
    result.push({
      groupId,
      transactionType: first.transaction_type,
      date: first.date,
      payee: first.payee,
      status: first.status,
      notes: first.notes,
      documentUrl: first.document_url,
      transactionNumber: first.transaction_number,
      items,
      totalAmount: items.reduce((s, i) => s + Number(i.amount), 0),
      totalRetainage: items.reduce((s, i) => s + Number(i.retainage_amount), 0),
      totalNet: items.reduce((s, i) => s + Number(i.net_amount), 0),
      invoiceId: (first as any).invoice_id ?? (first as any).invoices?.id ?? null,
      invoiceStatus: (first as any).invoices?.status ?? null,
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

export default function TransactionsTab({ projectId, onTransactionsChange, draws, onDrawsRefresh }: Props) {
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingDrawId, setEditingDrawId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // View toggle: "current" or "past"
  const [view, setView] = useState<"current" | "past">("current");

  // Past transactions: expanded draw sections
  const [expandedDraws, setExpandedDraws] = useState<Set<string>>(new Set());

  // Sort state
  type SortKey = "number" | "type" | "date" | "payee" | "amount" | "retainage" | "net" | "status";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state — header
  const [formType, setFormType] = useState<string>("Contractor Pay Application");
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formPayee, setFormPayee] = useState("");
  const [formStatus, setFormStatus] = useState<string>("Pending");
  const [formNotes, setFormNotes] = useState("");
  const [formDocumentUrl, setFormDocumentUrl] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [formContractId, setFormContractId] = useState<string>("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [saving, setSaving] = useState(false);

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorSaving, setVendorSaving] = useState(false);
  const [manageVendorsOpen, setManageVendorsOpen] = useState(false);

  const loadVendors = useCallback(async () => {
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .eq("project_id", projectId)
      .order("name");
    setVendors((data as Vendor[]) ?? []);
  }, [projectId]);

  const loadContracts = useCallback(async () => {
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("project_id", projectId)
      .order("contract_number");
    setContracts((data as Contract[]) ?? []);
  }, [projectId]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("budget_transactions")
      .select("*, invoices(id, status)")
      .eq("project_id", projectId)
      .order("date", { ascending: false });
    if (error) toast.error("Failed to load transactions.");
    else {
      const txns = (data ?? []) as BudgetTransaction[];
      setTransactions(txns);
      onTransactionsChange?.(txns);
    }
    setLoading(false);
  }, [projectId, onTransactionsChange]);

  useEffect(() => { load(); loadVendors(); loadContracts(); }, [load, loadVendors, loadContracts]);

  // Split transactions into current (no draw_id) and past (has draw_id)
  const currentTransactions = useMemo(() => transactions.filter(t => !(t as any).draw_id), [transactions]);
  const pastTransactions = useMemo(() => transactions.filter(t => !!(t as any).draw_id), [transactions]);

  // Group current transactions
  const currentGroups = useMemo(() => buildGroups(currentTransactions), [currentTransactions]);

  // Group past transactions by draw
  const pastByDraw = useMemo(() => {
    const drawMap = new Map<string, BudgetTransaction[]>();
    for (const t of pastTransactions) {
      const drawId = (t as any).draw_id as string;
      if (!drawMap.has(drawId)) drawMap.set(drawId, []);
      drawMap.get(drawId)!.push(t);
    }
    // Sort draws by draw_number descending
    const sortedDraws = draws
      .filter(d => drawMap.has(d.id))
      .sort((a, b) => b.draw_number - a.draw_number);
    return sortedDraws.map(d => ({
      draw: d,
      groups: buildGroups(drawMap.get(d.id) ?? []),
      totalAmount: (drawMap.get(d.id) ?? []).reduce((s, t) => s + Number(t.amount), 0),
      totalRetainage: (drawMap.get(d.id) ?? []).reduce((s, t) => s + Number(t.retainage_amount), 0),
      totalNet: (drawMap.get(d.id) ?? []).reduce((s, t) => s + Number(t.net_amount), 0),
    }));
  }, [pastTransactions, draws]);

  const handleTypeChange = (type: string) => {
    // Retainage is entered manually in dollars, so changing the transaction
    // type no longer recalculates it from a percentage.
    setFormType(type);
  };

  const resetForm = () => {
    setFormType("Contractor Pay Application");
    setFormDate(new Date());
    setFormPayee("");
    setFormStatus("Pending");
    setFormNotes("");
    setFormDocumentUrl("");
    setFormContractId("");
    lineItemCounter = 0;
    setLineItems([newLineItem()]);
  };

  const openEdit = (g: TransactionGroup) => {
    setEditingGroupId(g.groupId);
    setEditingDrawId((g.items[0] as any).draw_id ?? null);
    setFormType(g.transactionType);
    setFormDate(new Date(g.date));
    setFormPayee(g.payee);
    setFormStatus(g.status);
    setFormNotes(g.notes ?? "");
    setFormDocumentUrl(g.documentUrl ?? "");
    setFormContractId((g.items[0] as any).contract_id ?? "");
    setLineItems(g.items.map(t => ({
      id: t.id,
      divisionNumber: t.division_number,
      amount: Number(t.amount),
      retainageAmount: Number(t.retainage_amount),
      retainageMode: ((t as any).retainage_mode as RetainageMode) ?? "custom",
      description: t.description,
    })));
    setDialogOpen(true);
  };

  const handleDeleteGroup = async (g: TransactionGroup) => {
    const ids = g.items.map(i => i.id);
    const { error } = await supabase.from("budget_transactions").delete().in("id", ids);
    if (error) toast.error("Failed to delete transaction.");
    else { toast.success("Transaction deleted."); await load(); }
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.length > 1 ? prev.filter(li => li.id !== id) : prev);
  };

  const selectedContract = useMemo(
    () => contracts.find(c => c.id === formContractId) ?? null,
    [contracts, formContractId]
  );

  const lineRetainage = useCallback((li: LineItem): number => {
    if (li.retainageMode === "exempt") return 0;
    if (li.retainageMode === "default") {
      const pct = selectedContract ? Number(selectedContract.default_retainage_percent) : 0;
      return Math.round(li.amount * pct) / 100;
    }
    return li.retainageAmount;
  }, [selectedContract]);

  const formTotalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
  const formTotalRetainage = lineItems.reduce((s, li) => s + lineRetainage(li), 0);
  const formTotalNet = formTotalAmount - formTotalRetainage;

  const updateDrawSnapshot = async (drawId: string) => {
    // Fetch all transactions for this draw
    const { data: drawTxns } = await supabase
      .from("budget_transactions")
      .select("*")
      .eq("draw_id", drawId);
    if (!drawTxns) return;

    // Get the draw record
    const draw = draws.find(d => d.id === drawId);
    if (!draw) return;

    // Rebuild snapshot from actual transaction data
    const drawMonthStr = draw.draw_month;
    const [dy, dm] = drawMonthStr.split("-").map(Number);
    const drawPeriodStart = new Date(dy, dm - 1, 1);
    const drawPeriodEnd = new Date(dy, dm, 0);

    // Get unique divisions from transactions
    const divisionMap = new Map<string, { amount: number; retainage: number; name: string }>();
    for (const t of drawTxns) {
      const key = t.division_number;
      const existing = divisionMap.get(key) ?? { amount: 0, retainage: 0, name: t.division_name };
      existing.amount += Number(t.amount);
      existing.retainage += Number(t.retainage_amount);
      divisionMap.set(key, existing);
    }

    const totalAmount = drawTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalRetainage = drawTxns.reduce((s: number, t: any) => s + Number(t.retainage_amount), 0);

    // Update snapshot_json with recalculated values
    const existingSnapshot = draw.snapshot_json ?? {};
    const updatedG702 = {
      ...existingSnapshot.g702,
      "8. Current Payment Due": totalAmount - totalRetainage,
    };

    await (supabase as any)
      .from("draw_history")
      .update({
        snapshot_json: { ...existingSnapshot, g702: updatedG702 },
        total_amount: totalAmount - totalRetainage,
      })
      .eq("id", drawId);
  };

  const handleSave = async () => {
    if (!formPayee) { toast.error("Please select a vendor."); return; }
    const validLines = lineItems.filter(li => li.divisionNumber);
    if (validLines.length === 0) { toast.error("Add at least one division line."); return; }
    setSaving(true);

    try {
      if (editingGroupId) {
        const allGroups = buildGroups(transactions);
        const oldItems = allGroups.find(g => g.groupId === editingGroupId)?.items ?? [];
        if (oldItems.length > 0) {
          await supabase.from("budget_transactions").delete().in("id", oldItems.map(i => i.id));
        }
      }

      const { count } = await supabase
        .from("budget_transactions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      const groupId = editingGroupId ?? crypto.randomUUID();
      const allGroups = buildGroups(transactions);
      const txnNumber = editingGroupId
        ? allGroups.find(g => g.groupId === editingGroupId)?.transactionNumber ?? (count ?? 0) + 1
        : (count ?? 0) + 1;

      const rows = validLines.map(li => {
        const div = ALL_DIVISIONS.find(d => d.number === li.divisionNumber);
        const retAmt = lineRetainage(li);
        return {
          project_id: projectId,
          transaction_group_id: groupId,
          contract_id: formContractId || null,
          transaction_type: formType,
          transaction_number: txnNumber,
          date: format(formDate, "yyyy-MM-dd"),
          payee: formPayee,
          division_number: li.divisionNumber,
          division_name: div?.name ?? "",
          description: li.description,
          amount: li.amount,
          retainage_percent: li.amount > 0 ? (retAmt / li.amount) * 100 : 0,
          retainage_amount: retAmt,
          retainage_mode: li.retainageMode,
          net_amount: li.amount - retAmt,
          status: formStatus,
          notes: formNotes || null,
          document_url: formDocumentUrl || null,
          ...(editingDrawId ? { draw_id: editingDrawId } : {}),
        };
      });

      const { error } = await supabase.from("budget_transactions").insert(rows);
      if (error) throw error;

      // If editing a past draw transaction, update the draw's snapshot
      if (editingDrawId) {
        await updateDrawSnapshot(editingDrawId);
      }

      toast.success(editingGroupId ? "Transaction updated." : "Transaction added.");
      setDialogOpen(false);
      setEditingGroupId(null);
      setEditingDrawId(null);
      resetForm();
      await load();
      if (editingDrawId && onDrawsRefresh) onDrawsRefresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save transaction.");
    }
    setSaving(false);
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const toggleDrawExpand = (drawId: string) => {
    setExpandedDraws(prev => {
      const next = new Set(prev);
      next.has(drawId) ? next.delete(drawId) : next.add(drawId);
      return next;
    });
  };

  // Filter & sort helpers for current view groups
  const filteredGroups = currentGroups.filter(g => {
    if (filterType !== "all" && g.transactionType !== filterType) return false;
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    if (filterDivision !== "all" && !g.items.some(i => i.division_number === filterDivision)) return false;
    return true;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const sortGroups = (groups: TransactionGroup[]) => {
    if (!sortKey) return groups;
    const sorted = [...groups];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "number": return (a.transactionNumber - b.transactionNumber) * dir;
        case "type": return a.transactionType.localeCompare(b.transactionType) * dir;
        case "date": return a.date.localeCompare(b.date) * dir;
        case "payee": return a.payee.localeCompare(b.payee) * dir;
        case "amount": return (a.totalAmount - b.totalAmount) * dir;
        case "retainage": return (a.totalRetainage - b.totalRetainage) * dir;
        case "net": return (a.totalNet - b.totalNet) * dir;
        case "status": return a.status.localeCompare(b.status) * dir;
        default: return 0;
      }
    });
    return sorted;
  };

  const sortedGroups = useMemo(() => sortGroups(filteredGroups), [filteredGroups, sortKey, sortDir]);

  const grandTotalAmount = filteredGroups.reduce((s, g) => s + g.totalAmount, 0);
  const grandTotalRetainage = filteredGroups.reduce((s, g) => s + g.totalRetainage, 0);
  const grandTotalNet = filteredGroups.reduce((s, g) => s + g.totalNet, 0);

  // Vendor CRUD
  const resetVendorForm = () => {
    setVendorName(""); setVendorContact(""); setVendorEmail(""); setVendorPhone(""); setVendorNotes("");
    setEditingVendorId(null);
  };

  const openVendorAdd = () => {
    resetVendorForm();
    setVendorDialogOpen(true);
  };

  const openVendorEdit = (v: Vendor) => {
    setEditingVendorId(v.id);
    setVendorName(v.name);
    setVendorContact(v.contact_name ?? "");
    setVendorEmail(v.email ?? "");
    setVendorPhone(v.phone ?? "");
    setVendorNotes(v.notes ?? "");
    setVendorDialogOpen(true);
  };

  const handleSaveVendor = async () => {
    if (!vendorName.trim()) { toast.error("Vendor name is required."); return; }
    setVendorSaving(true);
    try {
      if (editingVendorId) {
        const { error } = await supabase.from("vendors").update({
          name: vendorName.trim(),
          contact_name: vendorContact || null,
          email: vendorEmail || null,
          phone: vendorPhone || null,
          notes: vendorNotes || null,
        }).eq("id", editingVendorId);
        if (error) throw error;
        toast.success("Vendor updated.");
      } else {
        const { error } = await supabase.from("vendors").insert({
          project_id: projectId,
          name: vendorName.trim(),
          contact_name: vendorContact || null,
          email: vendorEmail || null,
          phone: vendorPhone || null,
          notes: vendorNotes || null,
        });
        if (error) throw error;
        toast.success("Vendor added.");
        setFormPayee(vendorName.trim());
      }
      setVendorDialogOpen(false);
      resetVendorForm();
      await loadVendors();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save vendor.");
    }
    setVendorSaving(false);
  };

  const handleDeleteVendor = async (id: string) => {
    const { error } = await supabase.from("vendors").delete().eq("id", id);
    if (error) toast.error("Failed to delete vendor.");
    else { toast.success("Vendor deleted."); await loadVendors(); }
  };

  // Render helpers
  const renderTableHeader = (sortable: boolean) => (
    <thead>
      <tr className="bg-muted/50 text-muted-foreground text-left">
        <th className={cn("px-3 py-2", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("number") : undefined}><div className="flex items-center gap-1"># {sortable && sortIcon("number")}</div></th>
        <th className={cn("px-3 py-2", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("type") : undefined}><div className="flex items-center gap-1">Type {sortable && sortIcon("type")}</div></th>
        <th className={cn("px-3 py-2", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("date") : undefined}><div className="flex items-center gap-1">Date {sortable && sortIcon("date")}</div></th>
        <th className={cn("px-3 py-2", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("payee") : undefined}><div className="flex items-center gap-1">Payee {sortable && sortIcon("payee")}</div></th>
        <th className={cn("px-3 py-2 text-right", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("amount") : undefined}><div className="flex items-center justify-end gap-1">Amount {sortable && sortIcon("amount")}</div></th>
        <th className={cn("px-3 py-2 text-right", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("retainage") : undefined}><div className="flex items-center justify-end gap-1">Retainage {sortable && sortIcon("retainage")}</div></th>
        <th className={cn("px-3 py-2 text-right", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("net") : undefined}><div className="flex items-center justify-end gap-1">Net Amount {sortable && sortIcon("net")}</div></th>
        <th className={cn("px-3 py-2", sortable && "cursor-pointer select-none")} onClick={sortable ? () => handleSort("status") : undefined}><div className="flex items-center gap-1">Status {sortable && sortIcon("status")}</div></th>
        <th className="px-3 py-2" />
      </tr>
    </thead>
  );

  // Sort a draw/transaction group's line items by the leading number of the
  // category (e.g. "07 — Thermal" -> 7). Items with no numeric prefix sort last.
  const getCategoryNumber = (name?: string) => {
    const match = name?.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 9999;
  };

  const renderGroupRow = (g: TransactionGroup, readOnly: boolean) => {
    const isExpanded = expandedGroups.has(g.groupId);
    const hasMultiple = g.items.length > 1;
    const sortedItems = [...g.items].sort(
      (a, b) => getCategoryNumber(a.division_number) - getCategoryNumber(b.division_number)
    );
    return (
      <Fragment key={g.groupId}>
        <tr className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => hasMultiple && toggleExpand(g.groupId)}>
          <td className="px-3 py-2 font-mono text-muted-foreground">
            <div className="flex items-center gap-1">
              {hasMultiple && (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
              {g.transactionNumber}
            </div>
          </td>
          <td className="px-3 py-2 text-xs truncate">{g.transactionType}</td>
          <td className="px-3 py-2 text-xs">{g.date}</td>
          <td className="px-3 py-2 truncate">{g.payee}{hasMultiple && <span className="ml-1.5 text-xs text-muted-foreground">({g.items.length} lines)</span>}</td>
          <td className="px-3 py-2 text-right">{fmtDecimal(g.totalAmount)}</td>
          <td className="px-3 py-2 text-right">{fmtDecimal(g.totalRetainage)}</td>
          <td className="px-3 py-2 text-right">{fmtDecimal(g.totalNet)}</td>
          <td className="px-3 py-2">
            {g.invoiceStatus ? (
              <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-medium", statusBadgeClasses(g.invoiceStatus))}>{g.invoiceStatus}</span>
            ) : (
              <span className={cn(
                "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                g.status === "Paid" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                g.status === "Approved" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                g.status === "Pending" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                g.status === "Deferred" && "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
              )}>{g.status}</span>
            )}
          </td>
          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
            {g.invoiceId ? (
              <div className="grid grid-cols-3 gap-0" style={{ width: "84px" }}>
                <div className="flex justify-center">
                  {g.documentUrl ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(g.documentUrl!, "_blank")} title="Open document">
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  ) : <span className="inline-block w-7 h-7" />}
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedInvoiceId(g.invoiceId!)} title="View invoice">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="inline-block w-7 h-7" />
              </div>
            ) : readOnly ? (
              <div className="grid grid-cols-3 gap-0" style={{ width: "84px" }}>
                <div className="flex justify-center">
                  {g.documentUrl ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(g.documentUrl!, "_blank")} title="Open document">
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  ) : <span className="inline-block w-7 h-7" />}
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="inline-block w-7 h-7" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0" style={{ width: "84px" }}>
                <div className="flex justify-center">
                  {g.documentUrl ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(g.documentUrl!, "_blank")} title="Open document">
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  ) : <span className="inline-block w-7 h-7" />}
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteGroup(g)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </td>
        </tr>
        {isExpanded && sortedItems.map(item => (
          <tr key={item.id} className="bg-muted/20 border-t border-dashed">
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5 text-xs text-muted-foreground" colSpan={2}>
              {item.division_number} — {item.division_name}
            </td>
            <td className="px-3 py-1.5 text-xs text-muted-foreground truncate">{item.description}</td>
            <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(Number(item.amount))}</td>
            <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(Number(item.retainage_amount))}</td>
            <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(Number(item.net_amount))}</td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
          </tr>
        ))}
      </Fragment>
    );
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading transactions…</p>;

  return (
    <div className="space-y-4 pt-2">
      {/* View Toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            view === "current" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setView("current")}
        >
          Current Draw
        </button>
        <button
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            view === "past" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setView("past")}
        >
          Past Draws
        </button>
      </div>

      {view === "current" ? (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Division</Label>
              <Select value={filterDivision} onValueChange={setFilterDivision}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {ALL_DIVISIONS.map(d => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {TRANSACTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 ml-auto">
              <span className="text-xs text-muted-foreground self-center">Invoices are added in the global Invoices tab.</span>
              <Button size="sm" variant="outline" onClick={() => setManageVendorsOpen(true)}>
                Manage Vendors
              </Button>
            </div>
          </div>

          {/* Current Draw Table */}
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm min-w-[900px] table-fixed">
              <colgroup>
                <col style={{ width: "5%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "100px" }} />
              </colgroup>
              {renderTableHeader(true)}
              <tbody>
                {sortedGroups.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No transactions in current draw.</td></tr>
                ) : sortedGroups.map(g => renderGroupRow(g, false))}
              </tbody>
              {filteredGroups.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold">
                    <td className="px-3 py-2" colSpan={4}>Totals</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(grandTotalAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(grandTotalRetainage)}</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(grandTotalNet)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      ) : (
        /* Past Transactions View */
        <div className="space-y-3">
          {pastByDraw.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No past draw transactions yet.</p>
          ) : pastByDraw.map(({ draw, groups: drawGroups, totalAmount, totalRetainage, totalNet }) => {
            const isDrawExpanded = expandedDraws.has(draw.id);
            return (
              <div key={draw.id} className="rounded-lg border overflow-hidden">
                {/* Draw Section Header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted/70 transition-colors text-left"
                  onClick={() => toggleDrawExpand(draw.id)}
                >
                  <div className="flex items-center gap-3">
                    {isDrawExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm">Draw #{draw.draw_number}</span>
                    <span className="text-xs text-muted-foreground">{new Date(draw.draw_month + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
                  </div>
                  <span className="text-sm font-medium">{fmtDecimal(totalAmount)}</span>
                </button>
                {isDrawExpanded && (
                  <div className="overflow-auto">
                    <table className="w-full text-sm min-w-[900px] table-fixed">
                      <colgroup>
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "100px" }} />
                      </colgroup>
                      {renderTableHeader(false)}
                      <tbody>
                        {drawGroups.map(g => renderGroupRow(g, true))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/50 font-semibold">
                          <td className="px-3 py-2" colSpan={4}>Totals</td>
                          <td className="px-3 py-2 text-right">{fmtDecimal(totalAmount)}</td>
                          <td className="px-3 py-2 text-right">{fmtDecimal(totalRetainage)}</td>
                          <td className="px-3 py-2 text-right">{fmtDecimal(totalNet)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Wide Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader><DialogTitle>{editingGroupId ? "Edit Transaction" : "Add Transaction"}</DialogTitle></DialogHeader>
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {/* Header Row */}
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Transaction Type</Label>
                <Select value={formType} onValueChange={handleTypeChange}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <DatePickerInput value={formDate} onChange={(d) => d && setFormDate(d)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payee / Vendor *</Label>
                <Select value={formPayee} onValueChange={v => {
                  if (v === "__add_new__") {
                    openVendorAdd();
                  } else {
                    setFormPayee(v);
                  }
                }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add New Vendor</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Document Link</Label>
                <div className="relative">
                  <Link className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="h-8 pl-7 text-xs" placeholder="Paste Google Drive link..." value={formDocumentUrl} onChange={e => setFormDocumentUrl(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Contract association */}
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Contract</Label>
                <Select value={formContractId || "__none__"} onValueChange={(v) => setFormContractId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None (unassigned)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {contracts.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.contract_number || c.scope_summary)} — {c.default_retainage_percent}% ret.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedContract && (
                <div className="col-span-3 flex items-end pb-1 text-xs text-muted-foreground">
                  Lines set to "Default" inherit {selectedContract.default_retainage_percent}% retainage from this contract.
                </div>
              )}
            </div>

            {/* Division Line Items Table */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Division Line Items</Label>
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                      <th className="px-2 py-1.5 min-w-[200px]">Division</th>
                      <th className="px-2 py-1.5 w-28">Amount</th>
                      <th className="px-2 py-1.5 w-28">Retainage Mode</th>
                      <th className="px-2 py-1.5 w-28">Retainage</th>
                      <th className="px-2 py-1.5 w-28">Net</th>
                      <th className="px-2 py-1.5">Description</th>
                      <th className="px-2 py-1.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(li => {
                      const retAmt = lineRetainage(li);
                      const netAmt = li.amount - retAmt;
                      return (
                        <tr key={li.id} className="border-t">
                          <td className="px-2 py-1.5">
                            <Select value={li.divisionNumber} onValueChange={v => updateLineItem(li.id, "divisionNumber", v)}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select division" /></SelectTrigger>
                              <SelectContent>
                                {ALL_DIVISIONS.map(d => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" step="0.01" className="h-7 text-xs" value={li.amount || ""} onChange={e => updateLineItem(li.id, "amount", Number(e.target.value) || 0)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={li.retainageMode} onValueChange={v => updateLineItem(li.id, "retainageMode", v as RetainageMode)}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default" disabled={!selectedContract}>
                                  Default{selectedContract ? ` (${selectedContract.default_retainage_percent}%)` : ""}
                                </SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                                <SelectItem value="exempt">Exempt</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            {li.retainageMode === "custom" ? (
                              <Input type="number" step="0.01" min="0" className="h-7 text-xs" value={li.retainageAmount || ""} onChange={e => updateLineItem(li.id, "retainageAmount", Number(e.target.value) || 0)} />
                            ) : (
                              <div className="flex h-7 items-center text-xs text-muted-foreground">{fmtDecimal(retAmt)}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground text-right">{fmtDecimal(netAmt)}</td>
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs" value={li.description} onChange={e => updateLineItem(li.id, "description", e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLineItem(li.id)} disabled={lineItems.length <= 1}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/50 font-semibold text-xs">
                      <td className="px-2 py-1.5">Totals</td>
                      <td className="px-2 py-1.5 text-right">{fmtDecimal(formTotalAmount)}</td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-right">{fmtDecimal(formTotalRetainage)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtDecimal(formTotalNet)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setLineItems(prev => [...prev, newLineItem()])}>
                <Plus className="h-3 w-3" /> Add Division
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingGroupId ? "Save Changes" : "Add Transaction"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Vendor Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingVendorId ? "Edit Vendor" : "Add New Vendor"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Vendor Name *</Label>
              <Input className="h-8" value={vendorName} onChange={e => setVendorName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Name</Label>
              <Input className="h-8" value={vendorContact} onChange={e => setVendorContact(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input className="h-8" type="email" value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input className="h-8" value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveVendor} disabled={vendorSaving}>{vendorSaving ? "Saving…" : editingVendorId ? "Save Changes" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Vendors Dialog */}
      <Dialog open={manageVendorsOpen} onOpenChange={setManageVendorsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Manage Vendors</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No vendors yet. Add your first vendor below.</p>
            ) : (
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Contact</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(v => (
                      <tr key={v.id} className="border-t">
                        <td className="px-3 py-2">{v.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.contact_name || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.email || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.phone || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { openVendorEdit(v); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteVendor(v.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageVendorsOpen(false)}>Close</Button>
            <Button onClick={openVendorAdd} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice detail (opened from invoice-linked transaction rows) */}
      <InvoiceDetailDialog invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} onChange={load} />
    </div>
  );
}
