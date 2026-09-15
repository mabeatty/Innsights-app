// Formats a project's display label to include its hotel/brand reference,
// e.g. "Dayton — Dayton SHS", since QuickBooks references properties by
// hotel name/brand ("SHS Dayton", "HGI West Chester") rather than
// Innsights' internal project codename ("Dayton", "West Chester") — this
// makes it much easier to eyeball a QuickBooks transaction and know which
// Innsights project it belongs to.
//
// Omits the hotel name when it's blank/whitespace-only, or identical to the
// project name (a few projects have hotel_name duplicating name — nothing
// useful to add there).
export function formatProjectLabel(name: string, hotelName: string | null | undefined): string {
  const trimmedHotel = (hotelName ?? "").trim();
  if (!trimmedHotel || trimmedHotel.toLowerCase() === name.trim().toLowerCase()) return name;
  return `${name} — ${trimmedHotel}`;
}
