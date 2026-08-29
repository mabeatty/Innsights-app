// Single source of truth for "everything Innsights knows about a project,"
// in a form suitable for feeding to an LLM. Used by both the project
// assistant (project-assistant-chat) and the bid leveling report generator
// (generate-bid-leveling-report), so the two can never silently drift out of
// sync the way they did before this was extracted — whatever data gets added
// here becomes available to both consumers automatically.

export const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export async function buildProjectContext(supabase: any, projectId: string): Promise<string> {
  const [{ data: project }, { data: info }, { data: budget }, { data: reports }, { data: scheduleTasks }] = await Promise.all([
    supabase.from("projects").select("name, hotel_name, project_type, status").eq("id", projectId).single(),
    supabase.from("project_info").select("property_name, city, state, total_room_count, general_contractor, architect, target_opening_date").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_budget").select("division_number, division_name, cost_type, scheduled_value").eq("project_id", projectId).order("division_number"),
    supabase.from("weekly_reports").select("id, date_range_start, date_range_end, content").eq("project_id", projectId).order("date_range_start", { ascending: false }).limit(5),
    supabase.from("critical_path_tasks").select("task_name, trade, predecessor_task_id, start_date, end_date, duration_days, is_critical, status, id").eq("project_id", projectId).order("sort_order"),
  ]);

  const parts: string[] = [];

  if (project) {
    parts.push(`PROJECT: ${project.name} (${project.hotel_name}) — ${project.project_type}, status: ${project.status}`);
  }
  if (info) {
    parts.push(
      `Property: ${info.property_name ?? "—"}, ${info.city ?? ""}${info.city && info.state ? ", " : ""}${info.state ?? ""}. ` +
      `${info.total_room_count ?? "—"} rooms. GC: ${info.general_contractor ?? "—"}. Architect: ${info.architect ?? "—"}. ` +
      `Target opening: ${info.target_opening_date ?? "—"}.`
    );
  }

  if (budget && budget.length > 0) {
    const hardTotal = budget.filter((b: any) => b.cost_type === "hard").reduce((s: number, b: any) => s + Number(b.scheduled_value), 0);
    const softTotal = budget.filter((b: any) => b.cost_type === "soft").reduce((s: number, b: any) => s + Number(b.scheduled_value), 0);
    parts.push(`\nBUDGET (Schedule of Values): ${fmt(hardTotal)} hard costs, ${fmt(softTotal)} soft costs, ${fmt(hardTotal + softTotal)} total.`);
    const nonZero = budget.filter((b: any) => Number(b.scheduled_value) !== 0);
    parts.push("By division:\n" + nonZero.map((b: any) => `- ${b.division_number} ${b.division_name}: ${fmt(b.scheduled_value)}`).join("\n"));
  }

  // Guest room FF&E takeoff: quantity x unit price per item, aggregated across room types.
  const { data: takeoffRows } = await supabase
    .from("takeoff_line_items")
    .select("quantity_required, adjusted_quantity, is_ada, items(name, category, unit, unit_price), room_types(name)")
    .eq("project_id", projectId);

  if (takeoffRows && takeoffRows.length > 0) {
    const byItem = new Map<string, { name: string; category: string; unit: string; unitPrice: number; qty: number }>();
    for (const row of takeoffRows) {
      const item = row.items;
      if (!item) continue;
      const qty = row.adjusted_quantity ?? row.quantity_required ?? 0;
      const key = item.name;
      if (!byItem.has(key)) byItem.set(key, { name: item.name, category: item.category, unit: item.unit, unitPrice: Number(item.unit_price), qty: 0 });
      byItem.get(key)!.qty += qty;
    }
    const items = Array.from(byItem.values()).sort((a, b) => b.qty * b.unitPrice - a.qty * a.unitPrice);
    const ffeTotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    parts.push(
      `\nGUEST ROOM / PUBLIC AREA FF&E TAKEOFF (${items.length} distinct items, ${fmt(ffeTotal)} total at current unit prices):\n` +
      items.slice(0, 60).map((i) => `- ${i.name} [${i.category}]: qty ${i.qty} ${i.unit} @ ${fmt(i.unitPrice)} = ${fmt(i.qty * i.unitPrice)}`).join("\n") +
      (items.length > 60 ? `\n...and ${items.length - 60} more items (ask if you need the rest).` : "")
    );
  }

  if (reports && reports.length > 0) {
    const reportIds = reports.map((r: any) => r.id);
    const [{ data: attachments }, { data: comments }] = await Promise.all([
      supabase.from("weekly_report_attachments").select("report_id, file_name, drive_url, extracted_text, extraction_status").in("report_id", reportIds),
      supabase.from("weekly_report_comments").select("report_id, content, created_at").in("report_id", reportIds).order("created_at", { ascending: true }),
    ]);
    const attByReport = new Map<string, any[]>();
    (attachments ?? []).forEach((a: any) => {
      if (!attByReport.has(a.report_id)) attByReport.set(a.report_id, []);
      attByReport.get(a.report_id)!.push(a);
    });
    const commentsByReport = new Map<string, any[]>();
    (comments ?? []).forEach((c: any) => {
      if (!commentsByReport.has(c.report_id)) commentsByReport.set(c.report_id, []);
      commentsByReport.get(c.report_id)!.push(c);
    });

    // weekly_reports.content is just a category label ("GC Weekly Report",
    // "OAC Call Recap"), not the report body. The real substance, when
    // available, is in each attachment's extracted_text — populated by the
    // extract-weekly-report-text edge function (PDF text extraction +
    // Claude summarization), triggered manually per attachment from the
    // Weekly Reports tab. Not every attachment has been extracted, and
    // Drive-linked attachments require Google Drive API credentials that
    // may not be configured — so this can genuinely be unavailable, and
    // that's stated plainly per-attachment rather than glossed over.
    const reportLines = reports.map((r: any) => {
      const atts = attByReport.get(r.id) ?? [];
      const cmts = commentsByReport.get(r.id) ?? [];
      let line = `- ${r.date_range_start} to ${r.date_range_end} [${r.content || "Weekly Report"}]`;
      if (atts.length > 0) {
        for (const a of atts) {
          line += `\n  Attached: ${a.file_name || a.drive_url || "file"}`;
          if (a.extraction_status === "done" && a.extracted_text) {
            line += `\n  EXTRACTED CONTENT:\n${a.extracted_text.split("\n").map((l: string) => `    ${l}`).join("\n")}`;
          } else if (a.extraction_status === "unsupported" || a.extraction_status === "failed") {
            line += ` (content could not be extracted for this attachment)`;
          } else {
            line += ` (content not yet extracted — not readable here unless someone runs extraction on it)`;
          }
        }
      } else {
        line += `\n  No file attached.`;
      }
      if (cmts.length > 0) {
        line += `\n  Comments:\n${cmts.map((c: any) => `    - ${c.content}`).join("\n")}`;
      }
      return line;
    });
    parts.push("\nRECENT WEEKLY REPORTS:\n" + reportLines.join("\n"));
  }

  // Critical path schedule: every task with its dates, status, and whether
  // it's on the critical path. Placed right after weekly reports since a
  // common question is cross-referencing reported field progress against
  // where the schedule says a task should be — e.g. "is a task the weekly
  // report calls delayed also behind its own schedule dates."
  if (scheduleTasks && scheduleTasks.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const idToName = new Map<string, string>();
    scheduleTasks.forEach((t: any) => idToName.set(t.id, t.task_name));
    const overdueNotComplete = scheduleTasks.filter(
      (t: any) => t.end_date && t.end_date < today && t.status !== "Complete"
    );
    parts.push(
      `\nSCHEDULE / CRITICAL PATH (${scheduleTasks.length} tasks, today is ${today}):\n` +
      scheduleTasks.map((t: any) =>
        `- ${t.task_name}${t.trade ? ` [${t.trade}]` : ""}: ${t.start_date ?? "no start"} → ${t.end_date ?? "no end"}` +
        `${t.duration_days ? ` (${t.duration_days}d)` : ""}, status: ${t.status}${t.is_critical ? ", ON CRITICAL PATH" : ""}` +
        `${t.predecessor_task_id ? ` — follows "${idToName.get(t.predecessor_task_id) ?? "unknown"}"` : ""}`
      ).join("\n")
    );
    if (overdueNotComplete.length > 0) {
      parts.push(
        `\nFLAGGED — tasks whose scheduled end date has passed but aren't marked Complete (potential timeline risk):\n` +
        overdueNotComplete.map((t: any) => `- ${t.task_name}: was due ${t.end_date}, still "${t.status}"${t.is_critical ? " (CRITICAL PATH)" : ""}`).join("\n")
      );
    }
  }

  // Bidding: every bid item, each vendor's quote, scope adjustments, leveled
  // totals, and any AI-generated bid leveling report already saved for it.
  const { data: bidItems } = await supabase
    .from("vendor_bid_items")
    .select("id, segment, item_name, status")
    .eq("project_id", projectId)
    .order("segment");

  if (bidItems && bidItems.length > 0) {
    const bidItemIds = bidItems.map((bi: any) => bi.id);
    const [{ data: quotes }, { data: savedReports }] = await Promise.all([
      supabase.from("vendor_quotes").select("id, bid_item_id, vendor_name, round_1_amount, round_2_amount, round_3_amount, round_4_amount, final_quote_amount, vendor_status, notes").in("bid_item_id", bidItemIds),
      supabase.from("bid_leveling_reports").select("bid_item_id, report, generated_at").in("bid_item_id", bidItemIds),
    ]);
    const quoteIds = (quotes ?? []).map((q: any) => q.id);
    const { data: adjustments } = quoteIds.length > 0
      ? await supabase.from("vendor_quote_adjustments").select("quote_id, description, amount, category").in("quote_id", quoteIds)
      : { data: [] };

    const adjByQuote = new Map<string, any[]>();
    (adjustments ?? []).forEach((a: any) => {
      if (!adjByQuote.has(a.quote_id)) adjByQuote.set(a.quote_id, []);
      adjByQuote.get(a.quote_id)!.push(a);
    });
    const reportByItem = new Map<string, any>();
    (savedReports ?? []).forEach((r: any) => reportByItem.set(r.bid_item_id, r));
    const quotesByItem = new Map<string, any[]>();
    (quotes ?? []).forEach((q: any) => {
      if (!quotesByItem.has(q.bid_item_id)) quotesByItem.set(q.bid_item_id, []);
      quotesByItem.get(q.bid_item_id)!.push(q);
    });

    const bidLines: string[] = [`\nBIDDING (${bidItems.length} bid items):`];
    for (const bi of bidItems) {
      const itemQuotes = quotesByItem.get(bi.id) ?? [];
      bidLines.push(`\n[${bi.segment}] ${bi.item_name} — status: ${bi.status}`);
      if (itemQuotes.length === 0) {
        bidLines.push("  No vendor quotes submitted yet.");
      }
      for (const q of itemQuotes) {
        const adj = adjByQuote.get(q.id) ?? [];
        const adjSum = adj.reduce((s: number, a: any) => s + Number(a.amount), 0);
        const leveled = Number(q.final_quote_amount ?? 0) + adjSum;
        const adjText = adj.length > 0
          ? adj.map((a: any) => `[${a.category}] ${a.description || "adj"}: ${a.amount >= 0 ? "+" : ""}${fmt(a.amount)}`).join("; ")
          : "none";
        bidLines.push(
          `  - ${q.vendor_name}: raw ${fmt(q.final_quote_amount)}, adjustments: ${adjText}, leveled total ${fmt(leveled)}, status ${q.vendor_status}` +
          (q.notes ? ` — notes: ${q.notes}` : "")
        );
      }
      const savedReport = reportByItem.get(bi.id);
      if (savedReport) {
        const r = savedReport.report;
        bidLines.push(
          `  Existing AI bid leveling report (generated ${savedReport.generated_at}):\n` +
          `    Executive summary: ${r.executive_summary}\n` +
          `    Key differences: ${(r.key_differences ?? []).join(" | ")}\n` +
          `    Leveling summary: ${r.leveling_summary}\n` +
          `    Considerations: ${r.considerations}`
        );
      }
    }
    parts.push(bidLines.join("\n"));
  }

  // Field Admin: open (unresolved) permits, submittals, shop drawings, and
  // RFIs — relevant to timeline risk since an unapproved shop drawing or an
  // open RFI can be exactly why a schedule task is stalled.
  const [{ data: openPermits }, { data: openSubmittals }, { data: openDrawings }, { data: openRfis }] = await Promise.all([
    supabase.from("field_permits").select("permit_name, status, inspection_status").eq("project_id", projectId).eq("is_open", true),
    supabase.from("field_submittals").select("submittal_name, status, due_date").eq("project_id", projectId).eq("is_open", true),
    supabase.from("field_shop_drawings").select("drawing_name, trade, status, due_date").eq("project_id", projectId).eq("is_open", true),
    supabase.from("field_rfis").select("rfi_number, subject, status, submitted_date").eq("project_id", projectId).eq("is_open", true),
  ]);

  const fieldAdminLines: string[] = [];
  if (openPermits?.length) fieldAdminLines.push(`Open Permits (${openPermits.length}):\n` + openPermits.map((p: any) => `- ${p.permit_name}: ${p.status}${p.inspection_status ? `, inspection ${p.inspection_status}` : ""}`).join("\n"));
  if (openSubmittals?.length) fieldAdminLines.push(`Open Submittals (${openSubmittals.length}):\n` + openSubmittals.map((s: any) => `- ${s.submittal_name}: ${s.status}${s.due_date ? `, due ${s.due_date}` : ""}`).join("\n"));
  if (openDrawings?.length) fieldAdminLines.push(`Open Shop Drawings (${openDrawings.length}):\n` + openDrawings.map((d: any) => `- ${d.drawing_name}${d.trade ? ` [${d.trade}]` : ""}: ${d.status}${d.due_date ? `, due ${d.due_date}` : ""}`).join("\n"));
  if (openRfis?.length) fieldAdminLines.push(`Open RFIs (${openRfis.length}):\n` + openRfis.map((r: any) => `- ${r.rfi_number ? `#${r.rfi_number} ` : ""}${r.subject}: ${r.status}${r.submitted_date ? `, submitted ${r.submitted_date}` : ""}`).join("\n"));
  if (fieldAdminLines.length > 0) {
    parts.push(`\nFIELD ADMIN — OPEN ITEMS:\n` + fieldAdminLines.join("\n\n"));
  }

  // Contracts: what's actually been executed/awarded, by type.
  const { data: contracts } = await supabase
    .from("contracts")
    .select("contract_number, contract_type, scope_summary, original_amount, status, vendors(name)")
    .eq("project_id", projectId);

  if (contracts && contracts.length > 0) {
    parts.push(
      `\nCONTRACTS (${contracts.length}):\n` +
      contracts.map((c: any) => `- [${c.contract_type}] ${c.contract_number || "no #"} — ${c.vendors?.name ?? "unknown vendor"}: ${c.scope_summary}, ${fmt(c.original_amount)}, status ${c.status}`).join("\n")
    );
  }

  return parts.join("\n");
}
