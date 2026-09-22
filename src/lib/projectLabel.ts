// Project Name is the single source of truth for how a project is
// identified and displayed everywhere — hotel_name was retired as a
// separate concept (per direction 2026-09-21). Signature kept as-is
// (accepting hotelName, unused) so every existing call site across Revenue
// tabs, invoicing, and Pipeline didn't need to be touched individually.
export function formatProjectLabel(name: string, _hotelName?: string | null): string {
  return name;
}
