import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Handles Supabase auth redirects from email links (signup confirmation,
 * magic link, email change, invite) and OAuth/PKCE callbacks.
 *
 * Supports every shape Supabase may use:
 *   - ?token_hash=...&type=signup   -> verifyOtp() (newer email templates)
 *   - ?code=...                     -> auto-exchanged by detectSessionInUrl (PKCE)
 *   - #access_token=...&type=signup -> auto-parsed by detectSessionInUrl (implicit)
 *
 * On success it redirects to /dashboard (recovery links go to /reset-password).
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const goToApp = (type: string | null) => {
      if (!active) return;
      // Password recovery must land on the reset-password screen, not the app.
      if (type === "recovery") navigate("/reset-password", { replace: true });
      else navigate("/dashboard", { replace: true });
    };

    const run = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // 1. Surface any explicit error returned by Supabase.
      const errorDescription =
        query.get("error_description") || hash.get("error_description");
      if (errorDescription) {
        setError(errorDescription);
        return;
      }

      const type = (query.get("type") || hash.get("type")) as EmailOtpType | null;
      const tokenHash = query.get("token_hash");

      // 2. token_hash links are NOT auto-handled — verify explicitly.
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });
        if (!active) return;
        if (verifyError) {
          setError(verifyError.message);
          return;
        }
        goToApp(type);
        return;
      }

      // 3. PKCE (?code) and implicit (#access_token) are processed automatically
      //    by the client (detectSessionInUrl). Wait for the resulting session.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        goToApp(type);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          if (newSession) goToApp(type);
        }
      );
      unsubscribe = () => subscription.unsubscribe();

      // 4. Fallback: if nothing materializes, the link is invalid/expired.
      timer = setTimeout(async () => {
        if (!active) return;
        const { data: { session: late } } = await supabase.auth.getSession();
        if (late) goToApp(type);
        else
          setError(
            "We couldn't verify this link. It may have expired or already been used. Please sign in or request a new link."
          );
      }, 5000);
    };

    run();

    return () => {
      active = false;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6 text-center space-y-3">
          {error ? (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <a href="/login" className="text-sm text-primary hover:underline">
                Back to login
              </a>
            </>
          ) : (
            <p className="text-muted-foreground">Verifying your email…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
