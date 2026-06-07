import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { weeklyReports } = await req.json();

    if (!weeklyReports || weeklyReports.length === 0) {
      return new Response(
        JSON.stringify({ bullets: [], dateRanges: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const dateRanges = weeklyReports.map(
      (r: any) => `${r.date_range_start} to ${r.date_range_end}`
    );

    const combined = weeklyReports
      .map(
        (r: any) =>
          `Week of ${r.date_range_start} to ${r.date_range_end}:\n${r.content || "(no content)"}`
      )
      .join("\n\n");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You summarize construction project weekly reports into concise monthly activity bullet points for an investor report. Return ONLY a JSON object with a single key 'bullets' containing an array of 5-8 short bullet point strings. Each bullet should be one sentence, factual, past tense. No markdown, no numbering. Focus on key milestones, progress, issues, and decisions.",
            },
            {
              role: "user",
              content: `Summarize these weekly reports into 5-8 bullet points:\n\n${combined}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_bullets",
                description: "Return the summarized bullet points",
                parameters: {
                  type: "object",
                  properties: {
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "5-8 concise bullet point summaries",
                    },
                  },
                  required: ["bullets"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_bullets" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let bullets: string[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        bullets = parsed.bullets || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(
      JSON.stringify({ bullets, dateRanges }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("summarize error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
