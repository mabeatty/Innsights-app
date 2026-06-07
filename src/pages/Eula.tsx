export default function Eula() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8 text-foreground">
        <h1 className="text-3xl font-bold tracking-tight text-primary">End User License Agreement</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 9, 2026</p>

        <p className="text-sm leading-relaxed text-muted-foreground">
          This End User License Agreement ("Agreement") is a binding contract between you ("User") and Witness Investment ("Company") governing your use of the Innsights application ("Software"). By accessing or using Innsights, you agree to be bound by this Agreement.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. License Grant</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Subject to the terms of this Agreement, the Company grants you a limited, non-exclusive, non-transferable, revocable license to access and use Innsights solely for internal business purposes of Witness Investment and its authorized affiliates. This license does not include the right to sublicense, distribute, or make the Software available to any third party.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Account & Access</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Access to Innsights is granted exclusively by invitation from a system administrator. You are responsible for maintaining the confidentiality of your login credentials and multi-factor authentication (MFA) device. You must not share your account or allow unauthorized access. The Company reserves the right to revoke access at any time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Acceptable Use</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">You agree not to:</p>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li>Use the Software for any purpose other than authorized business operations</li>
            <li>Attempt to reverse engineer, decompile, or disassemble the Software</li>
            <li>Circumvent or disable any security features, including MFA</li>
            <li>Access data or accounts belonging to other users without authorization</li>
            <li>Introduce malicious code, scripts, or automated agents into the Software</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Third-Party Integrations</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights integrates with third-party services including Plaid (for bank transaction retrieval) and Intuit QuickBooks Online (for accounting synchronization). By using these features, you acknowledge and agree that:
          </p>
          <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1">
            <li>Your use of Plaid is subject to <a href="https://plaid.com/legal/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Plaid's End User Privacy Policy</a></li>
            <li>Your use of QuickBooks is subject to <a href="https://www.intuit.com/privacy/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Intuit's Terms of Service and Privacy Statement</a></li>
            <li>The Company is not responsible for the availability, accuracy, or security of third-party services</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Data Ownership</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All data entered into Innsights remains the property of Witness Investment. You retain no ownership rights over any project data, financial records, or other information stored within the Software. The Company may retain data in accordance with its Data Retention Policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">6. Intellectual Property</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Innsights and all associated intellectual property—including but not limited to source code, design, trademarks, and documentation—are the exclusive property of Witness Investment. This Agreement does not transfer any ownership or intellectual property rights to you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">7. Disclaimer of Warranties</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. THE COMPANY DOES NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE SOFTWARE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, REVENUE, OR BUSINESS OPPORTUNITIES.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Termination</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This Agreement is effective until terminated. The Company may terminate your access at any time, with or without cause, by revoking your user account. Upon termination, your right to use the Software ceases immediately.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">10. Governing Law</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This Agreement shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of laws principles.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">11. Contact</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            For questions about this Agreement, contact Marc Beatty at Witness Investment.
          </p>
        </section>
      </div>
    </div>
  );
}
