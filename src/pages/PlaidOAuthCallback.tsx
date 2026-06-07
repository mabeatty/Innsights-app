import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function PlaidOAuthCallback() {
  const navigate = useNavigate();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("plaid_link_token");
    if (!storedToken) {
      toast.error("No link token found. Please try connecting again.");
      navigate("/expenses/settings");
      return;
    }
    setLinkToken(storedToken);
  }, [navigate]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: window.location.href,
    onSuccess: async (public_token, metadata) => {
      localStorage.removeItem("plaid_link_token");
      const { error } = await supabase.functions.invoke("exchange-public-token", {
        body: {
          public_token,
          institution_name: metadata.institution?.name || "Unknown",
          institution_id: metadata.institution?.institution_id || "",
        },
      });
      if (error) toast.error("Failed to connect account.");
      else toast.success("Account connected!");
      navigate("/expenses/settings");
    },
    onExit: () => {
      localStorage.removeItem("plaid_link_token");
      navigate("/expenses/settings");
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Resuming bank connection…
    </div>
  );
}
