import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import ClickUpDebugPanel from "@/components/settings/ClickUpDebugPanel";
import { Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type ClickUpDebugState = {
  source?: string | null;
  stored_token_raw?: string | null;
  token_value?: string | null;
  request_url?: string | null;
  request_authorization_header?: string | null;
  response_status?: number | null;
  response_body?: string | null;
};

export default function SettingsIntegrations() {
  const { organizationId } = useAuth();

  // --- QuickBooks ---
  const [qbConnection, setQbConnection] = useState<{ id: string; company_name: string; updated_at: string } | null>(null);
  const [qbSyncing, setQbSyncing] = useState(false);

  // --- ClickUp ---
  const [clickupStatus, setClickupStatus] = useState<{ connected: boolean; username?: string; loading: boolean }>({ connected: false, loading: true });
  const [clickupToken, setClickupToken] = useState("");
  const [clickupTesting, setClickupTesting] = useState(false);
  const [clickupTestResult, setClickupTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [clickupSaving, setClickupSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [clickupDebug, setClickupDebug] = useState<ClickUpDebugState | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await (supabase as any)
      .from("quickbooks_connections")
      .select("id, company_name, updated_at")
      .eq("org_id", organizationId)
      .limit(1);
    setQbConnection(data?.[0] || null);
  }, [organizationId]);

  const loadClickupStatus = useCallback(async () => {
    if (!organizationId) {
      setClickupStatus({ connected: false, loading: false });
      setClickupDebug(null);
      return;
    }

    setClickupStatus(prev => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase.functions.invoke("manage-clickup-token", { body: { action: "status", org_id: organizationId } });
      if (error) throw error;
      setClickupStatus({ connected: data?.connected || false, username: data?.username, loading: false });
      setClickupDebug(data?.debug ?? null);
    } catch {
      setClickupStatus({ connected: false, loading: false });
      setClickupDebug(null);
    }
  }, [organizationId]);

  useEffect(() => { loadData(); loadClickupStatus(); }, [loadData, loadClickupStatus]);

  // QuickBooks handlers
  const handleConnectQuickBooks = async () => {
    const { data, error } = await supabase.functions.invoke("quickbooks-auth-url");
    if (error || !data?.auth_url) { toast.error("Failed to start QuickBooks connection."); return; }
    window.location.href = data.auth_url;
  };
  const handleSyncQBAccounts = async () => {
    setQbSyncing(true);
    const { data, error } = await supabase.functions.invoke("quickbooks-sync-accounts");
    if (error) toast.error("Failed to sync accounts.");
    else { toast.success(`Synced ${data?.count || 0} accounts from QuickBooks.`); loadData(); }
    setQbSyncing(false);
  };
  const handleDisconnectQB = async () => {
    if (!qbConnection) return;
    const { error } = await (supabase as any).from("quickbooks_connections").delete().eq("id", qbConnection.id);
    if (error) toast.error("Failed to disconnect.");
    else { toast.success("QuickBooks disconnected."); loadData(); }
  };

  // ClickUp handlers
  const handleTestClickup = async () => {
    const normalizedToken = clickupToken.trim();
    if (!normalizedToken) { toast.error("Enter a token first."); return; }
    setClickupTesting(true);
    setClickupTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-clickup-token", { body: { action: "test", token: normalizedToken } });
      if (error) throw error;
      setClickupDebug(data?.debug ?? null);
      if (data?.ok) {
        setClickupTestResult({ ok: true, message: `Valid — connected as ${data.username}` });
      } else {
        setClickupTestResult({ ok: false, message: data?.error || "Token is invalid" });
      }
    } catch (err: any) {
      setClickupTestResult({ ok: false, message: err.message || "Connection test failed" });
      setClickupDebug(null);
    }
    setClickupTesting(false);
  };

  const handleSaveClickup = async () => {
    const normalizedToken = clickupToken.trim();
    if (!normalizedToken) return;
    setClickupSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-clickup-token", { body: { action: "save", token: normalizedToken, org_id: organizationId } });
      if (error) throw error;
      setClickupDebug(data?.debug ?? null);
      if (data?.ok) {
        toast.success("ClickUp API token saved successfully.");
        setClickupToken("");
        setClickupTestResult(null);
        loadClickupStatus();
      } else {
        toast.error(data?.error || "Failed to save token.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save token.");
      setClickupDebug(null);
    }
    setClickupSaving(false);
  };

  return (
    <div className="space-y-8">
      {/* QuickBooks Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">QuickBooks Online</h2>
          <div className="flex gap-2">
            {qbConnection ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncQBAccounts} disabled={qbSyncing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${qbSyncing ? "animate-spin" : ""}`} /> Sync Chart of Accounts
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={handleDisconnectQB}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={handleConnectQuickBooks}>
                <Plus className="h-3.5 w-3.5" /> Connect QuickBooks
              </Button>
            )}
          </div>
        </div>
        <div className="border rounded-md overflow-hidden bg-card p-4">
          {qbConnection ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{qbConnection.company_name || "QuickBooks Company"}</p>
                <p className="text-xs text-muted-foreground">Last synced: {new Date(qbConnection.updated_at).toLocaleDateString()}</p>
              </div>
              <Badge variant="default" className="text-xs">Connected</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">Connect QuickBooks Online to sync your Chart of Accounts and push finalized expenses.</p>
          )}
        </div>
      </section>

      {/* ClickUp Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">ClickUp</h2>
          {clickupStatus.connected && (
            <Badge variant="default" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </div>
        <div className="border rounded-md overflow-hidden bg-card p-4 space-y-4">
          {clickupStatus.loading ? (
            <p className="text-sm text-muted-foreground text-center">Checking connection…</p>
          ) : clickupStatus.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-medium text-foreground">Connected as {clickupStatus.username}</p>
              </div>
              <p className="text-xs text-muted-foreground">Your ClickUp API token is active. Tasks will sync automatically on any project with a ClickUp List ID configured.</p>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Update your API token:</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      placeholder="pk_…"
                      value={clickupToken}
                      onChange={(e) => { setClickupToken(e.target.value); setClickupTestResult(null); }}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleTestClickup} disabled={clickupTesting || !clickupToken.trim()}>
                    {clickupTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                  </Button>
                  <Button size="sm" onClick={handleSaveClickup} disabled={clickupSaving || !clickupTestResult?.ok}>
                    {clickupSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Connect ClickUp to sync tasks into the Tasks tab on each project.</p>
              <p className="text-xs text-muted-foreground">
                Generate a personal API token at{" "}
                <a href="https://app.clickup.com/settings/apps" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  ClickUp Settings → Apps
                </a>.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="pk_…"
                    value={clickupToken}
                    onChange={(e) => { setClickupToken(e.target.value); setClickupTestResult(null); }}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={handleTestClickup} disabled={clickupTesting || !clickupToken.trim()}>
                  {clickupTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Test Connection"}
                </Button>
                <Button size="sm" onClick={handleSaveClickup} disabled={clickupSaving || !clickupTestResult?.ok}>
                  {clickupSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}

          {/* Test result feedback */}
          {clickupTestResult && (
            <div className={`flex items-center gap-2 text-sm ${clickupTestResult.ok ? "text-emerald-600" : "text-destructive"}`}>
              {clickupTestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {clickupTestResult.message}
            </div>
          )}

          <ClickUpDebugPanel
            debug={clickupDebug ? {
              source: clickupDebug.source,
              storedTokenRaw: clickupDebug.stored_token_raw,
              tokenValue: clickupDebug.token_value,
              requestUrl: clickupDebug.request_url,
              requestAuthorizationHeader: clickupDebug.request_authorization_header,
              responseStatus: clickupDebug.response_status,
              responseBody: clickupDebug.response_body,
            } : null}
          />
        </div>
      </section>
    </div>
  );
}
