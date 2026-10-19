// Switches for features that are built but turned off. Flip a value to true to bring
// the feature back; no code or data has to be restored.
export const featureFlags = {
  // Managing vendors per project: the "Project Vendors" tab on the Vendors page and the
  // "Add New Vendor" option in a transaction's payee dropdown. Turned off — the
  // organization-wide directory is the only vendor list people manage. The per-project
  // `vendors` table and the payee dropdown's use of it (and contract lookups) are untouched.
  projectVendorManagement: false,
};
