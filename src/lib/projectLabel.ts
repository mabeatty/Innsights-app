// Project Name is the single source of truth for how a project is
// identified and displayed everywhere — hotel_name was retired as a
// separate concept (per direction 2026-09-21). Signature kept as-is
// (accepting hotelName, unused) so every existing call site across Revenue
// tabs, invoicing, and Pipeline didn't need to be touched individually.
export function formatProjectLabel(name: string, _hotelName?: string | null): string {
  return name;
}

// Select string for dropdowns that list projects with their brand (see formatProjectOption).
// The embeds use the same foreign keys Project View and the Dashboard already use.
export const PROJECT_OPTION_SELECT =
  "id, name, hotel_name, brands!projects_brand_id_fkey(name), secondary_brand:brands!projects_secondary_brand_id_fkey(name)";

export interface ProjectOptionSource {
  name: string;
  brands?: { name: string } | null;          // primary brand
  secondary_brand?: { name: string } | null; // dual-brand projects
}

// "Ashland — Home2 Suites": the city (the project's name) plus the hotel brand, so
// two projects in the same city can be told apart in a dropdown. Dual-brand projects
// show both ("Tudor Arms — Hampton Inn / Tapestry"). A brand is left out if the
// project has none, or if the name already says it ("Springfield Home2 Suites").
export function formatProjectOption(p: ProjectOptionSource): string {
  const name = p.name.toLowerCase();
  const brands = [p.brands?.name, p.secondary_brand?.name].filter((b): b is string => !!b && !name.includes(b.toLowerCase()));
  return brands.length ? `${p.name} — ${brands.join(" / ")}` : p.name;
}

// Dropdown options for a list of projects, ordered by label so two projects in the
// same city sit next to each other.
export function projectOptions<T extends ProjectOptionSource & { id: string }>(projects: T[]): { id: string; label: string }[] {
  return projects.map((p) => ({ id: p.id, label: formatProjectOption(p) })).sort((a, b) => a.label.localeCompare(b.label));
}
