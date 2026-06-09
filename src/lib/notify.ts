import { supabase } from "@/integrations/supabase/client";

export interface NotificationInput {
  user_id: string | null | undefined;
  title: string;
  body?: string;
  link?: string;
  invoice_id?: string;
  type?: string;
}

/**
 * Insert in-app notifications. Skips entries with no recipient and de-duplicates
 * by user_id so a single person never gets the same event twice. Best-effort:
 * failures are swallowed so they never block the primary action.
 */
export async function createNotifications(items: NotificationInput[]): Promise<void> {
  const seen = new Set<string>();
  const rows = items
    .filter((i): i is NotificationInput & { user_id: string } => {
      if (!i.user_id || seen.has(i.user_id)) return false;
      seen.add(i.user_id);
      return true;
    })
    .map((i) => ({
      user_id: i.user_id,
      title: i.title,
      body: i.body ?? null,
      link: i.link ?? "/invoices",
      invoice_id: i.invoice_id ?? null,
      type: i.type ?? "invoice",
    }));
  if (!rows.length) return;
  try {
    await supabase.from("notifications").insert(rows);
  } catch {
    /* best-effort */
  }
}
