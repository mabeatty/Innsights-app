// Single source of truth for "everything Innsights knows about a project,"
// in a form suitable for feeding to an LLM. Used by both the project
// assistant (project-assistant-chat) and the bid leveling report generator
// (generate-bid-leveling-report), so the two can never silently drift out of
// sync the way they did before this was extracted — whatever data gets added
// here becomes available to both consumers automatically.

export const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export async function buildProjectContext(supabase: any, projectId: string): Promise<string> {
  const [{ data: project }, { data: info }, { data: budget }, { data: reports }] = await Promise.all([
    supabase.from("projects").select("name, hotel_name, project_type, status").eq("id", projectId).single(),
    supabase.from("project_info").select("property_name, city, state, total_room_count, general_contractor, architect, target_opening_date").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_budget").select("division_number, division_name, cost_type, scheduled_value").eq("project_id", projectId).order("division_number"),
    supabase.from("weekly_reports").select("date_range_start, date_range_end, content").eq("project_id", projectId).order("date_range_start", { ascending: false }).limit(3),
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
    parts.push(
      "\nRECENT WEEKLY REPORTS:\n" +
      reports.map((r: any) => `- ${r.date_range_start} to ${r.date_range_end}: ${r.content ? r.content.slice(0, 300) : "(no written content — see attached PDF)"}`).join("\n")
    );
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
