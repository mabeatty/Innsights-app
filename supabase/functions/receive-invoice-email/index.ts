// Public webhook for Resend Inbound. Parses a forwarded email, stores PDF attachments,
// and creates a pending invoice record per attachment with status "Pending — Needs Review".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function safeName(s: string) {
  return (s || "invoice.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    // Resend inbound shape (best-effort; tolerate variations)
    const data = body?.data ?? body;
    const from: string = data?.from?.address || data?.from || data?.envelope?.from || "";
    const subject: string = data?.subject || "(no subject)";
    const attachments: any[] = data?.attachments ?? [];

    const ORG_ID = Deno.env.get("DEFAULT_INVOICE_ORG_ID"); // org to assign email-intake invoices to
    if (!ORG_ID) {
      return new Response(JSON.stringify({ ok: false, error: "DEFAULT_INVOICE_ORG_ID not set" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const pdfs = attachments.filter((a) =>
      (a?.content_type || a?.contentType || "").toLowerCase().includes("pdf") ||
      (a?.filename || "").toLowerCase().endsWith(".pdf")
    );

    const created: string[] = [];
    for (const att of pdfs) {
      const filename = safeName(att.filename || `invoice-${Date.now()}.pdf`);
      const path = `email-intake/${Date.now()}-${filename}`;
      const b64: string = att.content || att.contentBase64 || att.data || "";
      if (!b64) continue;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const up = await svc.storage.from("invoices").upload(path, bytes, {
        contentType: "application/pdf", upsert: false,
      });
      if (up.error) { console.error("upload err", up.error); continue; }

      const { data: signed } = await svc.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);

      const { data: inv, error } = await svc.from("invoices").insert({
        organization_id: ORG_ID,
        project_id: null,
        vendor_name: null,
        invoice_number: null,
        status: "Pending — Needs Review",
        submitted_by_email: from,
        source: "email",
        needs_review: true,
        pdf_url: signed?.signedUrl ?? null,
        pdf_path: path,
        notes: `Forwarded email subject: ${subject}`,
      }).select("id").single();

      if (error) { console.error("insert err", error); continue; }
      if (inv?.id) {
        created.push(inv.id);
        await svc.from("invoice_audit_trail").insert({
          invoice_id: inv.id,
          action: "Received via email",
          performed_by_name: from,
          notes: `Subject: ${subject}`,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, created }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("receive-invoice-email", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
