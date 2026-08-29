// Extracts text from a weekly report attachment (uploaded PDF or Drive file)
// and has Claude produce a structured summary — schedule status, progress,
// open items, risks — so the project assistant can actually reason about
// what's inside the report, not just see its filename.
//
// Two source paths:
//   - storage_path: the PDF was uploaded directly into Supabase storage
//     (bucket "project-reports"). Fetched via the service-role client, no
//     external credentials needed.
//   - drive_file_id: the report is a Google Drive link. Fetching its bytes
//     requires server-side Drive API access, which needs a refresh token
//     obtained via a one-time OAuth consent (domain-wide delegation would
//     also work but needs Workspace admin setup) — see the three secrets
//     below. Until those are configured, Drive-linked attachments are
//     marked extraction_status = 'unsupported' with a clear explanation,
//     rather than silently failing or faking a result.
//
// Requires the Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optionally ANTHROPIC_MODEL.
// For Drive-linked attachments, also requires: GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN (a refresh token
// from a one-time consent authorizing drive.readonly — the existing
// VITE_GOOGLE_CLIENT_ID used by the in-app Drive picker is a *browser*
// OAuth client and cannot be reused here; this needs its own credential
// capable of minting access tokens server-side without a user present).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are summarizing a construction weekly progress report (GC weekly report, OAC call recap, or similar) for a project manager's quick reference and for an AI assistant that will use this summary to answer questions later.

Extract and summarize, using only what's actually stated in the text — do not infer or invent anything not present:
- schedule_status: What the report says about schedule — on track, ahead, behind, and by how much if stated. Name specific tasks/trades called out as delayed or ahead, with any dates mentioned.
- progress_summary: 2-4 sentences on what work was completed or is in progress this period.
- open_items: A list of open issues, action items, or things awaiting decision/response, each as a short string. Empty array if none mentioned.
- risks_flagged: Anything the report itself identifies as a risk, concern, or blocker (weather, material lead times, RFI delays, etc.). Empty array if none mentioned.

If the document doesn't look like a weekly progress report at all (e.g. it's blank, unrelated, or unreadable), say so in schedule_status and leave other fields empty rather than fabricating content to fit the expected shape.

Return only a JSON object: { "schedule_status": string, "progress_summary": string, "open_items": string[], "risks_flagged": string[] }. No preamble or markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { attachmentId } = await req.json();
    if (!attachmentId) return json({ ok: false, error: "Missing attachmentId." }, 400);

    const { data: att, error: fetchErr } = await supabase
      .from("weekly_report_attachments")
      .select("id, storage_path, drive_file_id, drive_url, file_name")
      .eq("id", attachmentId)
      .single();
    if (fetchErr || !att) return json({ ok: false, error: "Attachment not found." }, 404);

    await supabase.from("weekly_report_attachments").update({ extraction_status: "processing", extraction_error: null }).eq("id", attachmentId);

    const markFailed = async (message: string, status: "failed" | "unsupported" = "failed") => {
      await supabase.from("weekly_report_attachments").update({ extraction_status: status, extraction_error: message }).eq("id", attachmentId);
      return json({ ok: false, error: message });
    };

    // Only PDFs are handled today — other file types (images, docx) would
    // need their own read path, not attempted here.
    const looksLikePdf = (att.file_name || "").toLowerCase().endsWith(".pdf");

    let pdfBytes: Uint8Array | null = null;

    if (att.storage_path) {
      const { data: fileBlob, error: dlErr } = await supabase.storage.from("project-reports").download(att.storage_path);
      if (dlErr || !fileBlob) return await markFailed(`Could not download the uploaded file: ${dlErr?.message ?? "unknown error"}`);
      pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    } else if (att.drive_file_id) {
      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
      const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
      if (!clientId || !clientSecret || !refreshToken) {
        return await markFailed(
          "This report is linked from Google Drive, and reading its content requires Drive API credentials " +
          "(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN) that aren't configured yet. " +
          "The existing browser-based Drive picker credential can't be reused for this — it's a different kind of OAuth client.",
          "unsupported",
        );
      }

      // Exchange the refresh token for a short-lived access token, then
      // download the file's raw bytes via the Drive API.
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        return await markFailed(`Failed to refresh Google Drive access token: ${errText.slice(0, 300)}`);
      }
      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      const driveResp = await fetch(`https://www.googleapis.com/drive/v3/files/${att.drive_file_id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!driveResp.ok) {
        const errText = await driveResp.text();
        return await markFailed(`Failed to download the file from Drive: ${driveResp.status} ${errText.slice(0, 200)}`);
      }
      pdfBytes = new Uint8Array(await driveResp.arrayBuffer());
    } else {
      return await markFailed("This attachment has no file source (no upload, no Drive link).", "unsupported");
    }

    if (!looksLikePdf) {
      return await markFailed(`Only PDF attachments can be read right now ("${att.file_name}" is not a .pdf).`, "unsupported");
    }

    let rawText = "";
    try {
      const pdf = await getDocumentProxy(pdfBytes!);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = (typeof text === "string" ? text : (text as string[]).join("\n")).trim();
    } catch (e) {
      return await markFailed(`Could not read the PDF's text layer: ${(e as Error).message}`);
    }

    if (rawText.length < 20) {
      return await markFailed("This PDF has little to no extractable text (likely a scanned image) — visual reading of weekly reports isn't supported yet.", "unsupported");
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return await markFailed("ANTHROPIC_API_KEY is not configured.");
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: `Weekly report text:\n\n${rawText.slice(0, 40000)}` }] }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return await markFailed(`Anthropic API error: ${resp.status} ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let summary: Record<string, unknown> | null = null;
    try {
      summary = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try { summary = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }
    if (!summary) return await markFailed("Could not parse the summary Claude returned.");

    const formatted = [
      `Schedule status: ${summary.schedule_status}`,
      `Progress: ${summary.progress_summary}`,
      Array.isArray(summary.open_items) && summary.open_items.length > 0 ? `Open items: ${(summary.open_items as string[]).join("; ")}` : null,
      Array.isArray(summary.risks_flagged) && summary.risks_flagged.length > 0 ? `Risks flagged: ${(summary.risks_flagged as string[]).join("; ")}` : null,
    ].filter(Boolean).join("\n");

    await supabase
      .from("weekly_report_attachments")
      .update({ extracted_text: formatted, extraction_status: "done", extraction_error: null, extracted_at: new Date().toISOString() })
      .eq("id", attachmentId);

    return json({ ok: true, summary: formatted });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Unexpected error" }, 500);
  }
});
