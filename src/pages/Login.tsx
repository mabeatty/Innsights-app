import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, refreshMfaStatus } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Forgot-password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Resend-confirmation affordance (shown when email isn't confirmed)
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  // Success banner after password reset
  const [resetSuccess, setResetSuccess] = useState(false);
  useEffect(() => {
    if (searchParams.get("reset") === "success") {
      setResetSuccess(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMsg("");
    setShowResend(false);
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        console.error("[login] sign-in failed:", error);
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("email not confirmed")) {
          setError("Your email hasn't been confirmed yet. Use the button below to resend the confirmation link.");
          setShowResend(true);
        } else if (msg.includes("invalid login credentials")) {
          setError("Invalid email or password. If you were just invited, open your invite link to set a password first.");
        } else {
          setError(error.message || "Login failed. Please try again.");
        }
        return;
      }
      const mfa = await refreshMfaStatus();
      console.log("[login] signed in; mfaRequired =", mfa.mfaRequired);
      navigate(mfa.mfaRequired ? "/mfa-verify" : "/dashboard");
    } catch (err: any) {
      // Surface unexpected failures instead of leaving the button stuck/disabled.
      console.error("[login] unexpected error:", err);
      setError(err?.message || "Something went wrong while signing in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendMsg("");
    if (!email) { setResendMsg("Enter your email above first."); return; }
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) {
        console.error("[login] resend failed:", error);
        setResendMsg(error.message);
      } else {
        setResendMsg("Confirmation email sent — check your inbox.");
      }
    } catch (err: any) {
      console.error("[login] resend error:", err);
      setResendMsg(err?.message || "Could not resend confirmation email.");
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: "https://mabeatty-innsights.vercel.app/reset-password",
    });
    setForgotLoading(false);
    setForgotSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold tracking-tight text-primary">
            Innsights
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Hotel FF&E Takeoff Management
          </p>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-4 text-center">
              Your password has been updated. Please log in.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotSent(false);
                  setForgotOpen(true);
                }}
                className="text-xs text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
            {error && (
              <p className="text-sm text-destructive text-center" role="alert">{error}</p>
            )}
            {showResend && (
              <Button type="button" variant="outline" className="w-full" onClick={handleResendConfirmation} disabled={loading}>
                Resend confirmation email
              </Button>
            )}
            {resendMsg && (
              <p className="text-sm text-muted-foreground text-center">{resendMsg}</p>
            )}
          </form>
          <div className="text-xs text-center text-muted-foreground mt-4 space-y-1">
            <p><Link to="/signup" className="text-primary hover:underline">Create account</Link></p>
            <p><Link to="/privacy" className="hover:underline">Privacy Policy</Link></p>
          </div>
        </CardContent>
      </Card>

      {/* Forgot Password Modal */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email and we'll send a reset link.
            </DialogDescription>
          </DialogHeader>
          {forgotSent ? (
            <p className="text-sm text-muted-foreground py-2">
              If an account exists for that email, you will receive a password reset link shortly.
            </p>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? "Sending…" : "Send Reset Link"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
