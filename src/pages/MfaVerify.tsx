import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function MfaVerify() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadFactor();
  }, []);

  const loadFactor = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data.totp || data.totp.length === 0) {
      // No MFA factors — shouldn't be here
      navigate("/dashboard");
      return;
    }
    // Use the first verified TOTP factor
    const verified = data.totp.find((f) => f.status === "verified");
    if (!verified) {
      navigate("/dashboard");
      return;
    }
    setFactorId(verified.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setCode("");
      setLoading(false);
      return;
    }

    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-primary">
            Two-Factor Verification
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the code from your authenticator app
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">6-digit code</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                className="text-center text-lg tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
