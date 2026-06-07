import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { usePlaidLink } from "react-plaid-link";
import * as XLSX from "xlsx";

interface PlaidConnection {
  id: string;
  institution_name: string;
  status: string;
  last_synced: string | null;
}

interface ChartAccount {
  id: string;
  account_code: string;
  account_name: string;
  is_custom: boolean;
}

interface BookkeepingContact {
  id: string;
  email: string;
  name: string;
}

const DEFAULT_ACCOUNTS = [
  { code: "6010", name: "Travel" },
  { code: "6020", name: "Meals & Entertainment" },
  { code: "6030", name: "Office Supplies" },
  { code: "6040", name: "Software & Subscriptions" },
  { code: "6050", name: "Professional Services" },
  { code: "6060", name: "Marketing" },
  { code: "6070", name: "Utilities" },
  { code: "6080", name: "Insurance" },
  { code: "6090", name: "Rent & Occupancy" },
  { code: "6100", name: "Equipment" },
  { code: "6110", name: "Vehicle" },
  { code: "6999", name: "Other" },
];

function PlaidLinkButton({ onSuccess }: { onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLinkToken = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-link-token");
    if (error || !data?.link_token) {
      toast.error("Failed to initialize bank connection.");
      setLoading(false);
      return;
    }
    localStorage.setItem("plaid_link_token", data.link_token);
    setLinkToken(data.link_token);
    setLoading(false);
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      const { error } = await supabase.functions.invoke("exchange-public-token", {
        body: {
          public_token,
          institution_name: metadata.institution?.name || "Unknown",
          institution_id: metadata.institution?.institution_id || "",
        },
      });
      if (error) toast.error("Failed to connect account.");
      else { toast.success("Account connected!"); onSuccess(); }
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <Button size="sm" className="gap-1.5" onClick={fetchLinkToken} disabled={loading}>
      <Plus className="h-3.5 w-3.5" /> {loading ? "Connecting…" : "Add Account"}
    </Button>
  );
}

export default function ExpenseSettings() {
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [contacts, setContacts] = useState<BookkeepingContact[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [showAccounts, setShowAccounts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    const [connRes, acctRes, contactRes] = await Promise.all([
      (supabase as any).from("plaid_connections").select("*").eq("org_id", organizationId).order("created_at"),
      (supabase as any).from("chart_of_accounts").select("*").eq("org_id", organizationId).order("account_code"),
      (supabase as any).from("bookkeeping_contacts").select("*").eq("org_id", organizationId).order("created_at"),
    ]);
    setConnections(connRes.data ?? []);
    setAccounts(acctRes.data ?? []);
    setContacts(contactRes.data ?? []);
  }, [organizationId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDisconnect = async (id: string) => {
    const { error } = await (supabase as any).from("plaid_connections").delete().eq("id", id);
    if (error) toast.error("Failed to disconnect.");
    else { toast.success("Disconnected."); loadData(); }
  };

  const handleSyncNow = async () => {
    toast.info("Syncing transactions…");
    const { error } = await supabase.functions.invoke("sync-transactions");
    if (error) toast.error("Sync failed.");
    else { toast.success("Sync complete."); loadData(); }
  };

  const seedDefaultAccounts = async () => {
    if (!organizationId) return;
    const rows = DEFAULT_ACCOUNTS.map((a) => ({
      org_id: organizationId,
      account_code: a.code,
      account_name: a.name,
      is_custom: false,
    }));
    const { error } = await (supabase as any).from("chart_of_accounts").insert(rows);
    if (error) toast.error("Failed to create defaults.");
    else { toast.success("Default chart loaded."); loadData(); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const parsedAccounts = rows
        .map((row) => {
          const code = row["account_code"] || row["Account Code"] || row["Code"] || row["code"] || "";
          const name = row["account_name"] || row["Account Name"] || row["Name"] || row["name"] || "";
          return { code: String(code).trim(), name: String(name).trim() };
        })
        .filter((a) => a.code && a.name);

      if (parsedAccounts.length === 0) {
        toast.error("No valid accounts found. Ensure columns: account_code, account_name.");
        return;
      }

      // Delete existing and insert new
      await (supabase as any).from("chart_of_accounts").delete().eq("org_id", organizationId);
      const insertRows = parsedAccounts.map((a) => ({
        org_id: organizationId,
        account_code: a.code,
        account_name: a.name,
        is_custom: true,
      }));
      const { error } = await (supabase as any).from("chart_of_accounts").insert(insertRows);
      if (error) toast.error("Failed to import.");
      else { toast.success(`Imported ${parsedAccounts.length} accounts.`); loadData(); }
    } catch {
      toast.error("Failed to parse file.");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addBookkeepingContact = async () => {
    if (!newEmail || !organizationId) return;
    const { error } = await (supabase as any).from("bookkeeping_contacts").insert({
      org_id: organizationId,
      email: newEmail,
      name: newName || "",
    });
    if (error) toast.error("Failed to add contact.");
    else { toast.success("Contact added."); setNewEmail(""); setNewName(""); loadData(); }
  };

  const removeContact = async (id: string) => {
    const { error } = await (supabase as any).from("bookkeeping_contacts").delete().eq("id", id);
    if (error) toast.error("Failed to remove.");
    else { toast.success("Removed."); loadData(); }
  };


  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/expenses")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Expense Settings</h1>
      </div>

      {/* Connected Accounts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Connected Accounts</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSyncNow}>Sync Now</Button>
            <PlaidLinkButton onSuccess={loadData} />
          </div>
        </div>
        <div className="border rounded-md overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No accounts connected yet.</TableCell></TableRow>
              ) : connections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.institution_name}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "Active" ? "default" : "destructive"} className="text-xs">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_synced ? new Date(c.last_synced).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDisconnect(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Chart of Accounts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Chart of Accounts</h2>
          <div className="flex gap-2">
            {accounts.length === 0 && (
              <Button variant="outline" size="sm" onClick={seedDefaultAccounts}>Load Defaults</Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAccounts(!showAccounts)}>
              {showAccounts ? "Hide" : "View Accounts"} ({accounts.length})
            </Button>
          </div>
        </div>
        {showAccounts && accounts.length > 0 && (
          <div className="border rounded-md overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.account_code}</TableCell>
                    <TableCell>{a.account_name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{a.is_custom ? "Custom" : "Default"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Bookkeeping Team */}
      <section className="space-y-4">
        <h2 className="text-base font-medium text-foreground">Bookkeeping Team</h2>
        <div className="flex gap-2 items-end">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Email *</Label>
            <Input className="h-8" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="bookkeeper@example.com" />
          </div>
          <Button size="sm" onClick={addBookkeepingContact} disabled={!newEmail}>Add</Button>
        </div>
        {contacts.length > 0 && (
          <div className="border rounded-md overflow-hidden bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name || "—"}</TableCell>
                    <TableCell>{c.email}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeContact(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
