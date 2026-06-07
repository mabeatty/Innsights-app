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
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    const mfa = await refreshMfaStatus();
    if (mfa.mfaRequired) {
      navigate("/mfa-verify");
    } else {
      navigate("/dashboard");
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: "https://innsights.vercel.app/reset-password",
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
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
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
