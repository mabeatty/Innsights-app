import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function MfaEnroll() {
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    enrollFactor();
  }, []);

  const enrollFactor = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Innsights Authenticator",
    });
    if (error) {
      setError(error.message);
      setEnrolling(false);
      return;
    }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setEnrolling(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
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
      code: verifyCode,
    });
    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }
    navigate("/dashboard");
  };

  const handleSkip = () => {
    navigate("/dashboard");
  };

  if (enrolling) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Setting up MFA…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-primary">
            Set Up Two-Factor Authentication
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center space-y-4">
            {qrCode && (
              <img src={qrCode} alt="MFA QR Code" className="w-48 h-48 rounded-lg border" />
            )}
            <details className="w-full text-center">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                Can't scan? Enter code manually
              </summary>
              <code className="block mt-2 text-xs bg-muted p-2 rounded break-all font-mono">
                {secret}
              </code>
            </details>
            <form onSubmit={handleVerify} className="w-full space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="code">Enter 6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                  className="text-center text-lg tracking-widest"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || verifyCode.length !== 6}>
                {loading ? "Verifying…" : "Verify & Enable MFA"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
