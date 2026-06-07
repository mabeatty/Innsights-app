export default function DataRetentionPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Data Retention and Deletion Policy — Witness Investment / Innsights
        </h1>
        <p className="text-sm text-muted-foreground">Last updated: March 8, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Retention Periods</h2>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li>Project and financial data: retained for 7 years in accordance with standard accounting practices</li>
            <li>Expense transaction data: retained for 7 years</li>
            <li>User account data: retained for duration of employment plus 1 year</li>
            <li>Plaid access tokens: deleted immediately upon disconnection of bank account</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Deletion Procedures</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Data deletion requests may be submitted to the system administrator. User accounts and associated data will be deleted within 30 days of request. Project data may be retained longer if required for legal or accounting purposes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Review</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This policy is reviewed annually.
          </p>
        </section>
      </div>
    </div>
  );
}
