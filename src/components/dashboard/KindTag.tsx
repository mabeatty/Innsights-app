import { cn } from "@/lib/utils";

// "Dev" (development) / "PIP" (renovation) tag shown beside a project's name.
export default function KindTag({ kind }: { kind: "Dev" | "PIP" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[9px] font-semibold leading-none",
        kind === "Dev"
          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
      )}
    >
      {kind}
    </span>
  );
}
