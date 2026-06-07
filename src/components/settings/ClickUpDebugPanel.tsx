type ClickUpDebugState = {
  source?: string | null;
  storedTokenRaw?: string | null;
  tokenValue?: string | null;
  requestUrl?: string | null;
  requestAuthorizationHeader?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
};

type ClickUpDebugPanelProps = {
  debug: ClickUpDebugState | null;
};

function DebugBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <pre
        className={[
          "rounded-md border bg-background px-3 py-2 text-xs text-foreground",
          multiline ? "max-h-48 overflow-auto whitespace-pre-wrap break-all" : "overflow-x-auto whitespace-pre-wrap break-all",
        ].join(" ")}
      >
        {value || "—"}
      </pre>
    </div>
  );
}

export default function ClickUpDebugPanel({ debug }: ClickUpDebugPanelProps) {
  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">ClickUp debug</h3>
        <p className="text-xs text-muted-foreground">Temporary diagnostics for token save and validation.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Source</p>
          <p className="text-xs text-muted-foreground">{debug?.source || "Waiting for a ClickUp request"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Response status</p>
          <p className="text-xs text-muted-foreground">{debug?.responseStatus ?? "—"}</p>
        </div>
      </div>

      <DebugBlock label="Saved token (trimmed)" value={debug?.tokenValue || ""} />
      <DebugBlock label="Raw token from database" value={debug?.storedTokenRaw || ""} />
      <DebugBlock label="Request URL" value={debug?.requestUrl || ""} />
      <DebugBlock label="Authorization header" value={debug?.requestAuthorizationHeader || ""} />
      <DebugBlock label="Raw ClickUp response" value={debug?.responseBody || ""} multiline />
    </div>
  );
}