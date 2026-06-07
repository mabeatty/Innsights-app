import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const CLICKUP_USER_URL = "https://api.clickup.com/api/v2/user";

const sanitizeToken = (value: unknown) => {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const jsonResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: jsonHeaders,
  });

const createDebugPayload = ({
  source,
  storedTokenRaw,
  tokenValue,
  requestUrl,
  requestAuthorizationHeader,
  responseStatus,
  responseBody,
}: {
  source: "input" | "database" | "none";
  storedTokenRaw?: string | null;
  tokenValue?: string | null;
  requestUrl?: string | null;
  requestAuthorizationHeader?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
}) => ({
  source,
  stored_token_raw: storedTokenRaw ?? null,
  token_value: tokenValue ?? null,
  request_url: requestUrl ?? null,
  request_authorization_header: requestAuthorizationHeader ?? null,
  response_status: responseStatus ?? null,
  response_body: responseBody ?? null,
});

const parseClickUpError = ({ status, parsedBody, rawBody }: { status: number; parsedBody: any; rawBody: string }) => {
  if (parsedBody?.err) return parsedBody.err;
  if (parsedBody?.message) return parsedBody.message;
  if (rawBody) return rawBody;
  return `ClickUp returned ${status}`;
};

const fetchClickUpUser = async (token: string) => {
  const headers = {
    Authorization: token,
    "Content-Type": "application/json",
  };

  const response = await fetch(CLICKUP_USER_URL, {
    method: "GET",
    headers,
  });
  const rawBody = await response.text();

  console.log("[manage-clickup-token] ClickUp response", {
    status: response.status,
    body: rawBody,
  });

  let parsedBody: any = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    rawBody,
    parsedBody,
    headers,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, token, org_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "test") {
      const sanitizedToken = sanitizeToken(token);

      if (!sanitizedToken) {
        return jsonResponse({
          ok: false,
          error: "Token is required",
          debug: createDebugPayload({
            source: "input",
            storedTokenRaw: typeof token === "string" ? token : null,
          }),
        });
      }

      const clickupResult = await fetchClickUpUser(sanitizedToken);
      const debug = createDebugPayload({
        source: "input",
        storedTokenRaw: typeof token === "string" ? token : null,
        tokenValue: sanitizedToken,
        requestUrl: CLICKUP_USER_URL,
        requestAuthorizationHeader: clickupResult.headers.Authorization,
        responseStatus: clickupResult.status,
        responseBody: clickupResult.rawBody,
      });

      if (!clickupResult.ok) {
        return jsonResponse({
          ok: false,
          error: parseClickUpError(clickupResult),
          debug,
        });
      }

      const username = clickupResult.parsedBody?.user?.username || clickupResult.parsedBody?.user?.email || "Unknown";

      return jsonResponse({
        ok: true,
        username,
        debug,
      });
    }

    if (action === "save") {
      const sanitizedToken = sanitizeToken(token);

      if (!sanitizedToken) {
        return jsonResponse({
          ok: false,
          error: "Token is required",
          debug: createDebugPayload({
            source: "input",
            storedTokenRaw: typeof token === "string" ? token : null,
          }),
        });
      }

      if (!org_id) {
        return jsonResponse({
          ok: false,
          error: "org_id is required",
          debug: createDebugPayload({
            source: "input",
            storedTokenRaw: typeof token === "string" ? token : null,
            tokenValue: sanitizedToken,
          }),
        });
      }

      const clickupResult = await fetchClickUpUser(sanitizedToken);
      const debug = createDebugPayload({
        source: "input",
        storedTokenRaw: typeof token === "string" ? token : null,
        tokenValue: sanitizedToken,
        requestUrl: CLICKUP_USER_URL,
        requestAuthorizationHeader: clickupResult.headers.Authorization,
        responseStatus: clickupResult.status,
        responseBody: clickupResult.rawBody,
      });

      if (!clickupResult.ok) {
        return jsonResponse({
          ok: false,
          error: "Token is invalid. Please verify and try again.",
          debug,
        });
      }

      const { error: upsertError } = await supabaseAdmin
        .from("integrations")
        .upsert(
          { org_id, integration_key: "clickup_token", value: sanitizedToken, updated_at: new Date().toISOString() },
          { onConflict: "org_id,integration_key" }
        );

      if (upsertError) {
        console.error("[manage-clickup-token] Upsert error:", upsertError);
        return jsonResponse({
          ok: false,
          error: "Failed to save token: " + upsertError.message,
          debug,
        });
      }

      console.log(`[manage-clickup-token] Token saved for org ${org_id}, ending ...${sanitizedToken.slice(-6)}`);

      return jsonResponse({
        ok: true,
        message: "Token verified and saved.",
        debug,
      });
    }

    if (action === "status") {
      if (!org_id) {
        return jsonResponse({
          ok: true,
          connected: false,
          debug: createDebugPayload({ source: "none" }),
        });
      }

      const { data: row } = await supabaseAdmin
        .from("integrations")
        .select("value")
        .eq("org_id", org_id)
        .eq("integration_key", "clickup_token")
        .maybeSingle();

      const storedTokenRaw = typeof row?.value === "string" ? row.value : null;
      const existingToken = sanitizeToken(storedTokenRaw);

      if (!existingToken) {
        return jsonResponse({
          ok: true,
          connected: false,
          debug: createDebugPayload({
            source: "database",
            storedTokenRaw,
            tokenValue: existingToken,
          }),
        });
      }

      const clickupResult = await fetchClickUpUser(existingToken);
      const debug = createDebugPayload({
        source: "database",
        storedTokenRaw,
        tokenValue: existingToken,
        requestUrl: CLICKUP_USER_URL,
        requestAuthorizationHeader: clickupResult.headers.Authorization,
        responseStatus: clickupResult.status,
        responseBody: clickupResult.rawBody,
      });

      if (!clickupResult.ok) {
        return jsonResponse({
          ok: true,
          connected: false,
          error: "Token is invalid or expired",
          debug,
        });
      }

      const username = clickupResult.parsedBody?.user?.username || clickupResult.parsedBody?.user?.email || "Connected";

      return jsonResponse({
        ok: true,
        connected: true,
        username,
        debug,
      });
    }

    return jsonResponse({ ok: false, error: "Invalid action" });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error",
    });
  }
});
