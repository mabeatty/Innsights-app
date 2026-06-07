export default function Privacy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Privacy Policy for Innsights</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 8, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights is a private internal project management and expense reporting tool operated by Witness Investment. This application is not a consumer-facing product and is accessible only to authorized employees, partners, and contractors of Witness Investment.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Data We Collect</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights collects and stores the following data: user account information (name, email address, role), project and financial data entered by authorized users, and bank transaction data retrieved via Plaid for company-issued credit and debit cards for internal expense reporting purposes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">How We Use Your Data</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Data collected is used solely for internal business operations including project management, budgeting, capital planning, and employee expense reporting. We do not sell, share, or disclose data to third parties except as required to operate the application (e.g., Supabase for database hosting, Plaid for transaction data).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Data Storage and Security</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All data is stored on Supabase infrastructure hosted on AWS, which provides encryption at rest and TLS encryption in transit. Access to the application is restricted to invited users only.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Your Rights</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Authorized users may request deletion of their data by contacting the system administrator at Witness Investment. Data will be deleted within 30 days of request.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            For questions about this privacy policy, contact Marc Beatty at Witness Investment.
          </p>
        </section>
      </div>
    </div>
  );
}
