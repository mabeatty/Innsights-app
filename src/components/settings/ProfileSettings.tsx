import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, User, Lock, Camera } from "lucide-react";

export default function ProfileSettings() {
  const { user, mfaEnrolled, refreshMfaStatus } = useAuth();

  // Personal info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [expenseRole, setExpenseRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Security
  const [mfaActive, setMfaActive] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollFactorId, setEnrollFactorId] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disableTotpCode, setDisableTotpCode] = useState("");

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadMfaStatus();
      loadRole();
    }
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone, avatar_url")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (data) {
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setPhone(data.phone || "");
      setAvatarUrl(data.avatar_url || "");
    }
  };

  const loadRole = async () => {
    const { data } = await supabase
      .from("organization_members")
      .select("expense_role")
      .eq("user_id", user!.id)
      .limit(1)
      .single();
    if (data) setExpenseRole(data.expense_role || "Employee");
  };

  const loadMfaStatus = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp?.some((f) => f.status === "verified")) {
      setMfaActive(true);
    } else {
      setMfaActive(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    setSaving(false);
    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile updated");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("brand-logos")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage
      .from("brand-logos")
      .getPublicUrl(path);
    setAvatarUrl(urlData.publicUrl);
    setUploading(false);
    toast.success("Photo uploaded");
  };

  // MFA enrollment
  const handleEnableMfa = async () => {
    setMfaLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Innsights Authenticator",
    });
    if (error) {
      toast.error(error.message);
      setMfaLoading(false);
      return;
    }
    setQrCode(data.totp.qr_code);
    setEnrollSecret(data.totp.secret);
    setEnrollFactorId(data.id);
    setShowEnroll(true);
    setMfaLoading(false);
  };

  const handleVerifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: enrollFactorId,
    });
    if (cErr) {
      toast.error(cErr.message);
      setMfaLoading(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrollFactorId,
      challengeId: challenge.id,
      code: enrollCode,
    });
    if (vErr) {
      toast.error("Invalid code. Please try again.");
      setEnrollCode("");
      setMfaLoading(false);
      return;
    }
    setMfaActive(true);
    setShowEnroll(false);
    setEnrollCode("");
    await refreshMfaStatus();
    toast.success("Two-Factor Authentication is now active!");
    setMfaLoading(false);
  };

  const handleDisableMfaConfirm = async () => {
    if (!disableTotpCode || disableTotpCode.length !== 6) {
      toast.error("Please enter your 6-digit authenticator code");
      return;
    }

    setMfaLoading(true);
    try {
      // Step 1 — Get current factors dynamically
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      console.log("[MFA disable] listFactors response:", factorsData);
      if (factorsError) {
        console.error("[MFA disable] listFactors error:", factorsError);
        toast.error(`Failed to load MFA factors: ${factorsError.message}`);
        return;
      }

      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) {
        setMfaActive(false);
        setShowDisableConfirm(false);
        setDisableTotpCode("");
        await refreshMfaStatus();
        toast.success("Two-Factor Authentication is already off");
        return;
      }

      // Step 2 — Create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      console.log("[MFA disable] challenge response:", challengeData);
      if (challengeError) {
        console.error("[MFA disable] challenge error:", challengeError);
        toast.error(`MFA challenge failed: ${challengeError.message}`);
        return;
      }

      // Step 3 — Verify challenge with user TOTP (elevates to AAL2)
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: disableTotpCode,
      });
      if (verifyError) {
        console.error("[MFA disable] verify error:", verifyError);
        toast.error(`Invalid authenticator code: ${verifyError.message}`);
        return;
      }

      // Step 4 — Unenroll now that session is AAL2
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
      if (unenrollError) {
        console.error("[MFA disable] unenroll error:", unenrollError);
        toast.error(`Failed to disable 2FA: ${unenrollError.message}`);
        return;
      }

      // Step 5 — Confirm with fresh factor list and update UI from actual state only
      const { data: confirmFactors, error: confirmError } = await supabase.auth.mfa.listFactors();
      console.log("[MFA disable] confirm listFactors response:", confirmFactors);
      if (confirmError) {
        console.error("[MFA disable] confirm listFactors error:", confirmError);
        toast.error(`Unable to confirm 2FA status: ${confirmError.message}`);
        return;
      }

      const stillEnrolled = (confirmFactors?.totp?.length ?? 0) > 0;
      setMfaActive(stillEnrolled);
      await refreshMfaStatus();

      if (stillEnrolled) {
        toast.error("2FA is still enabled. Supabase rejected unenrollment.");
        return;
      }

      setShowDisableConfirm(false);
      setDisableTotpCode("");
      toast.success("Two-Factor Authentication has been turned off");
    } catch (err: any) {
      console.error("[MFA disable] unexpected error:", err);
      toast.error(`Unexpected error: ${err?.message ?? "Unknown error"}`);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const initials =
    (firstName?.[0] || "") + (lastName?.[0] || "") || user?.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" /> Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="Profile" />
                ) : null}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 cursor-pointer hover:bg-primary/90"
              >
                <Camera className="h-3.5 w-3.5" />
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {uploading ? "Uploading…" : "Click the camera icon to upload a photo"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" value={user?.email || ""} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label>Job Title / Role</Label>
            <Input value={expenseRole} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Set by your organization admin</p>
          </div>

          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save Personal Information"}
          </Button>
        </CardContent>
      </Card>

      {/* Security / 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" /> Security — Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                Status:{" "}
                <span className={mfaActive ? "text-green-600 font-semibold" : "text-destructive font-semibold"}>
                  {mfaActive ? "Active" : "Not Active"}
                </span>
              </p>
            </div>
            <Switch
              checked={mfaActive}
              disabled={mfaLoading}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleEnableMfa();
                } else {
                  setDisableTotpCode("");
                  setShowDisableConfirm(true);
                }
              }}
            />
          </div>

          {/* Enroll flow */}
          {showEnroll && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <p className="text-sm font-medium">
                Scan this QR code with your authenticator app:
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  <img src={qrCode} alt="MFA QR" className="w-40 h-40 rounded-lg border" />
                </div>
              )}
              <details className="text-center">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                  Can't scan? Enter manually
                </summary>
                <code className="block mt-2 text-xs bg-muted p-2 rounded break-all font-mono">
                  {enrollSecret}
                </code>
              </details>
              <form onSubmit={handleVerifyEnroll} className="space-y-3">
                <div className="space-y-2">
                  <Label>Enter 6-digit code</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="text-center tracking-widest max-w-[200px]"
                  />
                </div>
                <Button type="submit" disabled={mfaLoading || enrollCode.length !== 6} size="sm">
                  {mfaLoading ? "Verifying…" : "Verify & Enable"}
                </Button>
              </form>
            </div>
          )}

          {/* Disable confirm */}
          {showDisableConfirm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldOff className="h-4 w-4" />
                <p className="text-sm font-medium">Enter your 6-digit authenticator code to disable 2FA</p>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableTotpCode}
                onChange={(e) => setDisableTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="text-center tracking-widest max-w-[200px]"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisableMfaConfirm}
                  disabled={mfaLoading || disableTotpCode.length !== 6}
                >
                  {mfaLoading ? "Disabling…" : "Disable 2FA"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDisableConfirm(false);
                    setDisableTotpCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="new-pw">New Password</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
