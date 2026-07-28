# Security Protocol — Storing Bank Account & Routing Numbers

**Status:** Not yet implemented. Account/routing numbers are intentionally kept
OUT of the database today (pre-printed check stock path). Complete every item
below before storing any full bank account or routing number.

This is an internal engineering protocol, not legal/compliance advice. Have a
qualified security/compliance professional review before go-live, and confirm
requirements with the bank.

---

## 1. Scope & data classification
- **Sensitive fields:** full bank account number, routing number, and any ACH
  origination credentials.
- Classify these as **Restricted** — the highest tier. Card data (PCI) is not
  in scope here, but treat this data with comparable care.
- Non-sensitive (may remain in plain columns): account nickname, institution
  name, last-4 mask, account type.

## 2. Encryption at rest (application-level)
- Supabase encrypts disks at rest by default — this is NOT sufficient alone; it
  does not protect against a query, a leaked dump, or an over-broad SELECT.
- Encrypt account/routing numbers **at the application layer** before storage so
  the stored value is ciphertext (e.g. Supabase Vault, or AES-256-GCM in an edge
  function). The row never contains a usable number.
- Store only ciphertext + a last-4 mask. Never store plaintext alongside it.

## 3. Key management
- The encryption key lives **outside** the database (Supabase Vault / a secrets
  manager / edge-function secret env var) — never in a table next to the data.
- Restrict key access to the minimum number of people/services.
- Rotate keys on a schedule and immediately when anyone with access leaves.
- Keys never appear in source code, logs, or the client bundle.

## 4. Access control
- **Never decrypt in the browser.** Decryption happens only server-side inside a
  dedicated edge function.
- That edge function must authenticate the caller and authorize by role — only a
  restricted **treasury/admin** role may trigger decryption/printing, not every
  org member.
- Remember the **service-role key bypasses RLS**: do not rely on RLS alone;
  gate access in the function logic.
- The client only ever receives the **masked last-4**. Full numbers surface only
  at the moment of check printing, server-side.

## 5. Audit logging
- Log every access that decrypts or prints a full number: who, when, which
  account, what action. Store logs immutably.
- Review the access log periodically for anomalies.

## 6. Logging & error hygiene
- Ensure raw account/routing numbers never appear in application logs, error
  messages, stack traces, monitoring tools, or analytics.
- Scrub request/response bodies that could contain these values.

## 7. Transport
- All access over TLS/HTTPS only (already the default). No plaintext transport
  of these values anywhere, including internal calls.

## 8. Segregation of duties
- The person who **approves** an invoice must not be the same person who
  **issues/prints** the payment. Enforce via roles.
- Adding, editing, or viewing full bank credentials is a separate, tightly held
  permission from ordinary AP use.

## 9. Retention & deletion
- Store only what is necessary and for only as long as necessary.
- Provide a way to purge account credentials when an account is closed or a
  vendor relationship ends.

## 10. Bank coordination (for blank-stock / MICR printing)
- Confirm the bank's test-check approval process before going live.
- Confirm MICR toner, E-13B font, and check-stock requirements with the bank.

## 11. Incident response
- Have a written plan: if credentials are exposed, who is notified, how keys are
  rotated, how affected accounts are handled, and what disclosure is required.

## 12. Pre-launch checklist (all must be true before storing any number)
- [ ] App-level encryption implemented; DB stores ciphertext + last-4 only
- [ ] Encryption key stored outside the DB, access restricted, rotation plan set
- [ ] Decryption occurs only in a role-gated server-side edge function
- [ ] Client receives masked last-4 only; full number appears only at print time
- [ ] Access/decrypt/print audit logging in place and immutable
- [ ] Logs/errors verified free of raw numbers
- [ ] Segregation-of-duties roles enforced (approve ≠ pay; view-credentials gated)
- [ ] Retention/deletion path implemented
- [ ] Bank test-check requirements confirmed
- [ ] Incident-response plan written
- [ ] Independent security/compliance review completed
