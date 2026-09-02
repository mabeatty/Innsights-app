// Extracts text from an OAC (Owner-Architect-Contractor) meeting recap
// attachment (uploaded PDF or Drive file) and has Claude produce a
// structured summary — decisions, action items, open items, risks — so the
// project assistant can reason about what was discussed, not just see the
// filename. Functionally parallel to extract-weekly-report-text, but a
// separate function/table per direction given, and tuned for meeting-recap
// content (attendees, decisions made, action items with owners) rather than
// weekly field-progress narrative.
//
// Two source paths, identical to extract-weekly-report-text:
//   - storage_path: uploaded directly into Supabase storage (bucket
//     "project-reports" — same bucket as weekly reports, no reason for a
//     separate one).
//   - drive_file_id: requires the same GOOGLE_OAUTH_CLIENT_ID/CLIENT_SECRET/
//     REFRESH_TOKEN secrets already configured for weekly reports.
//
// Requires the Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optionally ANTHROPIC_MODEL.
// For Drive-linked attachments, also requires: GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are summarizing an OAC (Owner-Architect-Contractor) meeting recap for a project manager's quick reference and for an AI assistant that will use this summary to answer questions later.

Extract and summarize, using only what's actually stated in the text — do not infer or invent anything not present:
- key_decisions: Decisions actually made or agreed to in the meeting, each as a short string. Empty array if none stated.
- action_items: Action items or follow-ups assigned, with the responsible party if named (e.g. "GC to submit revised schedule by 8/15"). Empty array if none stated.
- open_items: Unresolved questions or items still awaiting decision/response. Empty array if none mentioned.
- risks_flagged: Anything the recap itself identifies as a risk, concern, or blocker. Empty array if none mentioned.

If the document doesn't look like a meeting recap at all (e.g. it's blank, unrelated, or unreadable), say so in key_decisions (as a single note) and leave other fields empty rather than fabricating content to fit the expected shape.

Return only a JSON object: { "key_decisions": string[], "action_items": string[], "open_items": string[], "risks_flagged": string[] }. No preamble or markdown.`;

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
      .from("oac_meeting_attachments")
      .select("id, project_id, storage_path, drive_file_id, drive_url, file_name")
      .eq("id", attachmentId)
      .single();
    if (fetchErr || !att) return json({ ok: false, error: "Attachment not found." }, 404);

    await supabase.from("oac_meeting_attachments").update({ extraction_status: "processing", extraction_error: null }).eq("id", attachmentId);

    const markFailed = async (message: string, status: "failed" | "unsupported" = "failed") => {
      await supabase.from("oac_meeting_attachments").update({ extraction_status: status, extraction_error: message }).eq("id", attachmentId);
      return json({ ok: false, error: message });
    };

    let looksLikePdf = (att.file_name || "").toLowerCase().endsWith(".pdf");
    let realDriveFileName: string | null = null;

    let pdfBytes: Uint8Array | null = null;
    let driveAccessToken: string | null = null;

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
          "This meeting recap is linked from Google Drive, and reading its content requires Drive API credentials " +
          "(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN) that aren't configured.",
          "unsupported",
        );
      }

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
      driveAccessToken = tokenData.access_token;

      const metaResp = await fetch(`https://www.googleapis.com/drive/v3/files/${att.drive_file_id}?fields=name,mimeType`, {
        headers: { Authorization: `Bearer ${driveAccessToken}` },
      });
      if (metaResp.ok) {
        const meta = await metaResp.json();
        realDriveFileName = meta.name ?? null;
        looksLikePdf = meta.mimeType === "application/pdf" || (meta.name || "").toLowerCase().endsWith(".pdf");
        if (realDriveFileName && /^Drive file( \(|$)/.test(att.file_name || "")) {
          await supabase.from("oac_meeting_attachments").update({ file_name: realDriveFileName }).eq("id", attachmentId);
        }
      } else {
        const errText = await metaResp.text();
        return await markFailed(`Failed to read file metadata from Drive: ${metaResp.status} ${errText.slice(0, 200)}`);
      }

      const accessToken = driveAccessToken;
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
      return await markFailed(`Only PDF attachments can be read right now ("${realDriveFileName || att.file_name}" is not a .pdf).`, "unsupported");
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
      return await markFailed("This PDF has little to no extractable text (likely a scanned image) — visual reading isn't supported yet.", "unsupported");
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
        messages: [{ role: "user", content: [{ type: "text", text: `OAC meeting recap text:\n\n${rawText.slice(0, 40000)}` }] }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return await markFailed(`Anthropic API error: ${resp.status} ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (data?.stop_reason === "max_tokens") {
      return await markFailed("The recap has too much content for the response to complete — try a shorter document.");
    }
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
    if (!summary) return await markFailed(`Could not parse the summary Claude returned. Model returned: ${cleaned.slice(0, 300) || "(empty response)"}`);

    const formatted = [
      Array.isArray(summary.key_decisions) && summary.key_decisions.length > 0 ? `Key decisions: ${(summary.key_decisions as string[]).join("; ")}` : null,
      Array.isArray(summary.action_items) && summary.action_items.length > 0 ? `Action items: ${(summary.action_items as string[]).join("; ")}` : null,
      Array.isArray(summary.open_items) && summary.open_items.length > 0 ? `Open items: ${(summary.open_items as string[]).join("; ")}` : null,
      Array.isArray(summary.risks_flagged) && summary.risks_flagged.length > 0 ? `Risks flagged: ${(summary.risks_flagged as string[]).join("; ")}` : null,
    ].filter(Boolean).join("\n") || "No decisions, action items, open items, or risks were identified in this recap.";

    await supabase
      .from("oac_meeting_attachments")
      .update({ extracted_text: formatted, extraction_status: "done", extraction_error: null, extracted_at: new Date().toISOString() })
      .eq("id", attachmentId);

    // Fire-and-forget: refresh this project's automated risk list now that
    // there's new meeting content to consider. Failure here shouldn't fail
    // the extraction itself — the nightly batch run is the backstop.
    if (att.project_id) {
      const functionsUrl = `${supabaseUrl}/functions/v1/detect-project-risks`;
      fetch(functionsUrl, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ projectId: att.project_id }),
      }).catch((e) => console.warn("[extract-oac-meeting-text] risk detection trigger failed:", e.message));
    }

    return json({ ok: true, summary: formatted });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Unexpected error" }, 500);
  }
});
