import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User, AuthenticatorAssuranceLevels } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AccessLevel = "view" | "edit" | "admin";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  organizationId: string | null;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  investmentAccess: boolean;
  isConsultant: boolean;
  isPartner: boolean;
  consultantProjectIds: string[];
  accessLevel: AccessLevel;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshMfaStatus: () => Promise<{ mfaRequired: boolean; mfaEnrolled: boolean }>;
}

// First/super admins auto-provisioned on first login (see bootstrap-admin fn).
const BOOTSTRAP_EMAILS = ["marc.alex.beatty@gmail.com", "alex@witnessinv.com"];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [investmentAccess, setInvestmentAccess] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [consultantProjectIds, setConsultantProjectIds] = useState<string[]>([]);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("edit");

  const checkMfaStatus = async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { mfaRequired: false, mfaEnrolled: false };

    const enrolled = data.nextLevel === "aal2";
    const required = enrolled && data.currentLevel !== "aal2";
    setMfaEnrolled(enrolled);
    setMfaRequired(required);
    return { mfaRequired: required, mfaEnrolled: enrolled };
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setOrganizationId(null);
        setMfaRequired(false);
        setMfaEnrolled(false);
        setAccessLevel("edit");
        setLoading(false);
      } else {
        checkMfaStatus();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
      } else {
        checkMfaStatus();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch organization, role, and consultant project access when user changes
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchMembership = () =>
      supabase
        .from("organization_members")
        .select("id, organization_id, expense_role, investment_access, access_level")
        .eq("user_id", user.id)
        .maybeSingle();

    (async () => {
      try {
        const first = await fetchMembership();
        if (first.error) {
          console.error("Failed to fetch organization member:", first.error);
        }
        let membership = first.data;

        // Bootstrap the designated first admin if they have no membership yet.
        // The edge function uses the service role to bypass RLS and create the
        // organization + admin/Partner membership, then we refetch.
        if (!membership && BOOTSTRAP_EMAILS.includes((user.email ?? "").toLowerCase())) {
          try {
            await supabase.functions.invoke("bootstrap-admin");
            const retry = await fetchMembership();
            membership = retry.data;
          } catch (bootErr) {
            console.error("Bootstrap admin failed:", bootErr);
          }
        }

        if (cancelled) return;

        setOrganizationId(membership?.organization_id ?? null);
        setInvestmentAccess(membership?.expense_role === "Partner" || membership?.investment_access === true);
        setAccessLevel((membership?.access_level as AccessLevel) ?? "edit");

        const consultant = membership?.expense_role === "Consultant/Third Party";
        setIsConsultant(consultant);
        setIsPartner(membership?.expense_role === "Partner");

        if (consultant && membership?.id) {
          const { data: accessRows, error: accessError } = await supabase
            .from("consultant_project_access")
            .select("project_id")
            .eq("member_id", membership.id);
          if (accessError) {
            console.error("Failed to fetch consultant project access:", accessError);
          }
          if (!cancelled) setConsultantProjectIds(accessRows?.map((r) => r.project_id) ?? []);
        } else {
          setConsultantProjectIds([]);
        }
      } catch (err) {
        console.error("Error loading user role data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, organizationId, mfaRequired, mfaEnrolled, investmentAccess, isConsultant, isPartner, consultantProjectIds, accessLevel, signIn, signOut, refreshMfaStatus: checkMfaStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
