export default function AccessPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Access Control Policy — Innsights by Witness Investment
        </h1>
        <p className="text-sm text-muted-foreground">Last updated: March 8, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Principle of Least Privilege</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Users are granted only the minimum access required to perform their job functions. All access is role-based and provisioned by a system administrator.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Role-Based Access Control</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights implements the following roles: Partner, Manager, Employee, and Consultant. Access to sensitive financial data and administrative functions is restricted based on role assignment.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Granting Access</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Access is granted exclusively by invitation from a system administrator. Users cannot self-register. All new users must be explicitly provisioned with an appropriate role.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Modifying Access</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Role changes are made by a system administrator through the Team management interface. Changes take effect immediately.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Revoking Access</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            User access is revoked immediately upon termination or role change by a system administrator. Supabase authentication ensures revoked users cannot access the application.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Multi-Factor Authentication</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All users are required to enroll in TOTP-based MFA upon first login. Access to the application is not permitted without MFA enrollment.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Review</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This policy is reviewed annually or upon significant changes to the application or organization.
          </p>
        </section>
      </div>
    </div>
  );
}
