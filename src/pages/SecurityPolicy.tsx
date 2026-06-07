export default function SecurityPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Information Security Policy — Witness Investment / Innsights
        </h1>
        <p className="text-sm text-muted-foreground">Last updated: March 8, 2026 | Approved by: Marc Beatty, Managing Partner</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Objectives</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            To protect the confidentiality, integrity, and availability of all information assets used by Witness Investment, including data processed through the Innsights platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Scope</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This policy applies to all employees, partners, and contractors of Witness Investment who access the Innsights platform or any related data systems.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Accountability</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Marc Beatty, Managing Partner, is responsible for the implementation and enforcement of this policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Security Controls</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All data is stored on Supabase infrastructure with encryption at rest and TLS in transit. Access requires MFA. User access is role-based and invite-only. Plaid API credentials are stored as encrypted secrets and never exposed to the client.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Review</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This policy is reviewed annually and updated as needed to reflect changes in technology, regulation, or business operations.
          </p>
        </section>
      </div>
    </div>
  );
}
