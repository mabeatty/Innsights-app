import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, BedDouble } from "lucide-react";
import { format } from "date-fns";

interface ProjectInfoData {
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  project_status?: string | null;
  total_room_count?: number | null;
  target_opening_date?: string | null;
}

export function ProjectInfoSummary({ info }: { info: ProjectInfoData | null }) {
  if (!info) return null;

  const addressParts = [info.street_address, info.city, info.state, info.zip_code].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const hasAny = address || info.project_status || info.total_room_count || info.target_opening_date;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      {address && (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline-offset-2 hover:underline">
              {address}
            </a>
          ) : address}
        </span>
      )}
      {info.project_status && (
        <Badge variant="outline" className="font-normal">{info.project_status}</Badge>
      )}
      {info.total_room_count != null && info.total_room_count > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <BedDouble className="h-3.5 w-3.5" />
          {info.total_room_count} rooms
        </span>
      )}
      {info.target_opening_date && (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(info.target_opening_date), "MMM yyyy")}
        </span>
      )}
    </div>
  );
}
