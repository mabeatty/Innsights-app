import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface VisibilityOption {
  id: string;
  name: string;
  status?: string | null;
  visible: boolean;
}
export interface CalendarVisibility {
  options: VisibilityOption[];
  onChange: (id: string, visible: boolean) => void;
}

// Lists every project eligible for the calendar — including the hidden ones, so
// they can be brought back — with a checkbox for whether it shows on the chart.
export default function CalendarVisibilityMenu({ options, onChange }: CalendarVisibility) {
  const shown = options.filter((o) => o.visible).length;
  const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5" />Show / hide projects
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">Show on calendar</p>
          <p className="text-xs text-muted-foreground">{shown} of {options.length} shown. Hidden projects stay on the Project Summary tab.</p>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {sorted.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted">
              <Checkbox checked={o.visible} onCheckedChange={(v) => onChange(o.id, v === true)} aria-label={o.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{o.name}</span>
                {o.status && <span className="block truncate text-[10px] text-muted-foreground">{o.status}</span>}
              </span>
            </label>
          ))}
        </div>
        {shown < options.length && (
          <div className="border-t px-3 py-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => options.filter((o) => !o.visible).forEach((o) => onChange(o.id, true))}>
              Show all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
