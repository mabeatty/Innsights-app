import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function QuickBooksCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Connecting to QuickBooks…");

  useEffect(() => {
    const code = searchParams.get("code");
    const realmId = searchParams.get("realmId");

    if (!code || !realmId) {
      toast.error("Missing authorization parameters.");
      navigate("/expenses/settings");
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("quickbooks-callback", {
          body: { code, realm_id: realmId },
        });

        if (error || !data?.success) {
          toast.error("Failed to connect QuickBooks.");
          navigate("/expenses/settings");
          return;
        }

        toast.success(`Connected to QuickBooks${data.company_name ? `: ${data.company_name}` : ""}!`);

        // Auto-sync Chart of Accounts after connecting
        setStatus("Syncing Chart of Accounts…");
        const { data: syncData, error: syncErr } = await supabase.functions.invoke("quickbooks-sync-accounts");
        if (syncErr) {
          console.error("Auto-sync failed:", syncErr);
        } else {
          toast.success(`Synced ${syncData?.count || 0} accounts from QuickBooks.`);
        }

        navigate("/expenses/settings");
      } catch (err) {
        console.error(err);
        toast.error("Connection failed.");
        navigate("/expenses/settings");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      {status}
    </div>
  );
}
