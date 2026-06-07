export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 9, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights ("we," "our," or "us") is a project management, budgeting, and expense reporting platform operated by Witness Investment. This Privacy Policy describes how we collect, use, store, and protect your information when you use the Innsights application.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Information We Collect</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We collect the following categories of information:
          </p>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li><strong>Account Information:</strong> Name, email address, and role within the organization, collected during account provisioning.</li>
            <li><strong>Project & Financial Data:</strong> Budgets, schedules, vendor quotes, capital planning details, and other project-related information entered by authorized users.</li>
            <li><strong>Banking & Transaction Data:</strong> Transaction data from company-issued credit and debit cards retrieved via the Plaid API for expense reporting purposes.</li>
            <li><strong>Accounting Data:</strong> Chart of accounts, expense categories, and transaction records synced via the QuickBooks Online API.</li>
            <li><strong>Usage Data:</strong> Authentication events, session metadata, and application logs generated during normal use.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li>To provide and maintain the Innsights platform and its features</li>
            <li>To manage internal project accounting, budgeting, and expense reporting</li>
            <li>To sync financial data with QuickBooks Online for bookkeeping purposes</li>
            <li>To retrieve and categorize bank transactions via Plaid for expense management</li>
            <li>To enforce access controls and maintain application security</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Third-Party Integrations</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights integrates with the following third-party services:
          </p>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li><strong>Plaid:</strong> Used to securely connect company bank accounts and retrieve transaction data. Plaid's use of your data is governed by <a href="https://plaid.com/legal/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Plaid's Privacy Policy</a>.</li>
            <li><strong>Intuit QuickBooks Online:</strong> Used to sync chart of accounts and push finalized expense reports. QuickBooks data handling is governed by <a href="https://www.intuit.com/privacy/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Intuit's Privacy Statement</a>.</li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We do not sell, rent, or share your data with any third parties beyond what is necessary to operate the integrations described above.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Data Storage & Security</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All data is stored on cloud infrastructure with encryption at rest and TLS encryption in transit. Access to the application requires multi-factor authentication (MFA) and is restricted to invited users only. API credentials for third-party services are stored as encrypted secrets and are never exposed to the client.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">6. Data Retention</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Project and financial data is retained for 7 years in accordance with standard accounting practices. User account data is retained for the duration of employment plus 1 year. Plaid access tokens are deleted immediately upon disconnection of a bank account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">7. Your Rights</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Authorized users may request access to, correction of, or deletion of their personal data by contacting the system administrator. Data deletion requests will be processed within 30 days, subject to legal and accounting retention requirements.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Changes to This Policy</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. Continued use of Innsights after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Contact</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            For questions regarding this Privacy Policy, contact Marc Beatty at Witness Investment.
          </p>
        </section>
      </div>
    </div>
  );
}
