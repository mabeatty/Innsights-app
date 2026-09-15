// Fixed document-type checklists for specific Resources categories, per
// direction (2026-09-15). A category not listed here (Contracts, Corporate,
// Other) or explicitly marked open-ended (Permits) has no fixed checklist —
// documents are just added freely, as before.
export const DOCUMENT_TYPE_CHECKLIST: Record<string, string[]> = {
  Design: ["Architectural Plans", "Civil Engineering Plans", "Interior Design Drawings"],
  Diligence: ["Survey", "Title Commitment", "Zoning Letter / Report", "Phase 1 Report", "Geotechnical Report", "Inspection Report"],
  Franchise: ["Franchise Agreement", "PIP Scope"],
  // Permits is intentionally absent — open-ended, every jurisdiction differs.
};

export function hasFixedChecklist(folder: string): boolean {
  return folder in DOCUMENT_TYPE_CHECKLIST;
}
