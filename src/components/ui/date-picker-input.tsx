import { useState, useCallback, useEffect } from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  /** Placeholder text when no date is set */
  placeholder?: string;
  /** Additional classes on the outer wrapper */
  className?: string;
  /** Height class — defaults to h-8 */
  heightClass?: string;
  /** Text size class — defaults to text-xs */
  textClass?: string;
  /** Whether to allow clearing (undefined). Defaults to true */
  allowClear?: boolean;
  /** Show fixedWeeks in calendar */
  fixedWeeks?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
}

export default function DatePickerInput({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  className,
  heightClass = "h-8",
  textClass = "text-xs",
  allowClear = true,
  fixedWeeks = false,
  disabled = false,
}: DatePickerInputProps) {
  const [text, setText] = useState(value ? format(value, "MM/dd/yyyy") : "");
  const [error, setError] = useState(false);

  // Sync external value changes
  useEffect(() => {
    setText(value ? format(value, "MM/dd/yyyy") : "");
    setError(false);
  }, [value]);

  const handleBlur = useCallback(() => {
    if (!text.trim()) {
      if (allowClear) {
        onChange(undefined);
      } else {
        setText(value ? format(value, "MM/dd/yyyy") : "");
      }
      setError(false);
      return;
    }
    const parsed = parse(text, "MM/dd/yyyy", new Date());
    if (isValid(parsed) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2200) {
      onChange(parsed);
      setText(format(parsed, "MM/dd/yyyy"));
      setError(false);
    } else {
      setError(true);
      // Clear after brief flash
      setTimeout(() => {
        setText(value ? format(value, "MM/dd/yyyy") : "");
        setError(false);
      }, 1200);
    }
  }, [text, value, onChange, allowClear]);

  const handleCalendarSelect = useCallback((d: Date | undefined) => {
    onChange(d);
    setText(d ? format(d, "MM/dd/yyyy") : "");
    setError(false);
  }, [onChange]);

  return (
    <div className={cn("flex gap-1", className)}>
      <Input
        value={text}
        onChange={(e) => { setText(e.target.value); setError(false); }}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          heightClass,
          textClass,
          "min-w-[110px]",
          error && "border-destructive ring-1 ring-destructive",
        )}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className={cn(heightClass, "w-8 shrink-0")} disabled={disabled}>
            <CalendarIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[60]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            fixedWeeks={fixedWeeks}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
