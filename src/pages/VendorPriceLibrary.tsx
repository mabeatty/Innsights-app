import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { freshness, fmtDate } from "@/lib/pricingFreshness";

const db = supabase as any;

interface CatalogItem { id: string; canonical_name: string; category: string | null; synonyms: string[]; }
interface Rec {
  id: string; grain: "line" | "gross"; vendor_name: string; global_vendor_id: string | null; catalog_item_id: string | null;
  item_name: string | null; category: string | null; description: string | null; unit_price: number | null; unit: string | null;
  gross_price: number | null; price_text: string | null; quantity: number | null; price_date: string | null;
  room_type: string | null; project_label: string | null; brand: string | null; source_doc: string | null; source_url: string | null;
}

const money = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function VendorPriceLibrary() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemQuery, setItemQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedVendor, setSelectedVendor] = useState("");

  useEffect(() => {
    (async () => {
      const [iRes, lRes, gRes] = await Promise.all([
        db.from("catalog_items").select("*").order("canonical_name"),
        db.from("bid_line_items").select("*"),
        db.from("vendor_pricing").select("*"),
      ]);
      const cats = (iRes.data ?? []) as CatalogItem[];
      const nameById = new Map(cats.map((c: CatalogItem) => [c.id, c.canonical_name]));
      const line: Rec[] = (lRes.data ?? []).map((r: any) => ({
        id: "l_" + r.id, grain: "line", vendor_name: r.vendor_name, global_vendor_id: r.global_vendor_id, catalog_item_id: r.catalog_item_id,
        item_name: r.item_name, category: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null, description: r.raw_description, unit_price: r.unit_price, unit: r.unit,
        gross_price: r.ext_price, price_text: null, quantity: r.quantity, price_date: r.price_date, room_type: r.room_type,
        project_label: r.project_label, brand: r.brand, source_doc: r.source_doc, source_url: r.source_url,
      }));
      const gross: Rec[] = (gRes.data ?? []).map((r: any) => ({
        id: "g_" + r.id, grain: "gross", vendor_name: r.vendor_name, global_vendor_id: r.global_vendor_id, catalog_item_id: r.catalog_item_id,
        item_name: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null,
        category: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null, description: r.scope,
        unit_price: null, unit: null, gross_price: r.gross_price, price_text: r.price_text, quantity: null, price_date: r.price_date,
        room_type: null, project_label: r.project_label, brand: r.brand, source_doc: r.source_doc, source_url: r.source_url,
      }));
      setItems(cats);
      setRecs([...line, ...gross]);
      setLoading(false);
    })();
  }, []);

  const brands = useMemo(() => Array.from(new Set(recs.map(r => r.brand).filter(Boolean))) as string[], [recs]);
  const projects = useMemo(() => Array.from(new Set(recs.map(r => r.project_label).filter(Boolean))) as string[], [recs]);
  const vendors = useMemo(() => Array.from(new Set(recs.map(r => r.vendor_name))).sort(), [recs]);
  const pricedItemIds = useMemo(() => new Set(recs.map(r => r.catalog_item_id).filter(Boolean)), [recs]);

  const matchedItems = useMemo(
    () => items.filter(i => pricedItemIds.has(i.id)),
    [items, pricedItemIds]
  );

  // small alias bridge so e.g. "garbage can" also matches "trash can"
  const ALIASES: [string, string][] = [["garbage", "trash"], ["tv", "television"], ["couch", "sofa"]];
  const expand = (q: string) => {
    const out = new Set([q]);
    for (const [a, b] of ALIASES) {
      if (q.includes(a)) out.add(q.split(a).join(b));
      if (q.includes(b)) out.add(q.split(b).join(a));
    }
    return [...out];
  };

  const applyFilters = (r: Rec) =>
    (brandFilter === "all" || r.brand === brandFilter) && (projectFilter === "all" || r.project_label === projectFilter);

  const q = itemQuery.trim().toLowerCase();
  const terms = q ? expand(q) : [];
  const itemFilterActive = selectedItemId !== "" || q !== "" || brandFilter !== "all" || projectFilter !== "all";
  const itemRows = useMemo(() => {
    if (!itemFilterActive) return [];
    return recs
      .filter(r => !selectedItemId || r.catalog_item_id === selectedItemId)
      .filter(applyFilters)
      .filter(r => {
        if (!q) return true;
        const hay = `${r.item_name ?? ""} ${r.description ?? ""} ${r.category ?? ""}`.toLowerCase();
        return terms.some(t => hay.includes(t));
      })
      .sort((a, b) => {
        const an = (a.item_name ?? "") as string, bn = (b.item_name ?? "") as string;
        if (an !== bn) return an.localeCompare(bn);
        return (a.unit_price ?? a.gross_price ?? Infinity) - (b.unit_price ?? b.gross_price ?? Infinity);
      });
  }, [recs, selectedItemId, brandFilter, projectFilter, itemQuery, itemFilterActive]);

  const vendorRows = useMemo(
    () => recs.filter(r => r.vendor_name === selectedVendor).filter(r => projectFilter === "all" || r.project_label === projectFilter),
    [recs, selectedVendor, projectFilter]
  );
  const vendorItems = useMemo(() => Array.from(new Set(vendorRows.map(r => r.item_name).filter(Boolean))) as string[], [vendorRows]);
  const selectedVendorId = vendorRows.find(r => r.global_vendor_id)?.global_vendor_id ?? null;

  const priceCell = (r: Rec) => r.grain === "line"
    ? <span>{money(r.unit_price)}<span className="text-xs font-normal text-muted-foreground">{r.unit ? ` /${r.unit}` : ""}</span></span>
    : <span>{money(r.gross_price)}<span className="ml-1 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">program</span></span>;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading vendor price library…</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button onClick={() => navigate("/vendors")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vendors
      </button>
      <h1 className="mb-1 text-2xl font-bold text-primary">Pricing Library</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Vendor pricing across projects. Line items show per-unit prices; program rows show a vendor's gross total for a scope. Filter by project to isolate a property.
      </p>

      <Tabs defaultValue="by-item">
        <TabsList className="bg-blue-100 text-blue-900">
          <TabsTrigger value="by-item">By Item</TabsTrigger>
          <TabsTrigger value="by-vendor">By Vendor</TabsTrigger>
        </TabsList>

        <TabsContent value="by-item" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Search an item (try "garbage can")</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-7" placeholder="Search by item type…" value={itemQuery} onChange={e => setItemQuery(e.target.value)} />
              </div>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="…or pick a category" /></SelectTrigger>
                <SelectContent>
                  {matchedItems.map(i => <SelectItem key={i.id} value={i.id}>{i.canonical_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Brand</label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any project</SelectItem>
                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {itemFilterActive ? (
            <div className="rounded-lg border overflow-auto">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">{itemRows.length} record{itemRows.length === 1 ? "" : "s"}</div>
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Room / Location</th>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No pricing matches the current filters.</td></tr>
                  ) : itemRows.map(r => {
                    const f = freshness(r.price_date);
                    return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.item_name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.category}</td>
                      <td className="px-3 py-2">
                        {r.global_vendor_id ? (
                          <Link to={`/vendors/${r.global_vendor_id}`} className="text-blue-600 hover:underline">{r.vendor_name}</Link>
                        ) : r.vendor_name}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px]">{r.description}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{priceCell(r)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.room_type}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.project_label}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-xs">{fmtDate(r.price_date)}</div>
                        <span className={`inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${f.cls}`}>{f.label}</span>
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[150px] truncate" title={r.source_doc ?? ""}>{r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{r.source_doc}</a> : <span className="text-muted-foreground">{r.source_doc}</span>}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Search an item type (e.g. "garbage can"), pick a category, or filter by project or brand. Each result shows the specific item, its category, and the price.</p>
          )}
        </TabsContent>

        <TabsContent value="by-vendor" className="mt-4 space-y-4">
          <div className="grid max-w-xl grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any project</SelectItem>
                  {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedVendor && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="flex gap-6">
                  <div><div className="text-2xl font-bold text-primary">{vendorRows.length}</div><div className="text-xs text-muted-foreground">Price records</div></div>
                  <div><div className="text-2xl font-bold text-primary">{new Set(vendorRows.map(r => r.project_label)).size}</div><div className="text-xs text-muted-foreground">Projects</div></div>
                  <div><div className="text-2xl font-bold text-primary">{vendorItems.length}</div><div className="text-xs text-muted-foreground">Items supplied</div></div>
                </div>
                {selectedVendorId && (
                  <Link to={`/vendors/${selectedVendorId}`} className="text-sm text-blue-600 hover:underline">
                    View full profile & contact info →
                  </Link>
                )}
              </div>

              {vendorItems.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-semibold text-primary">Items supplied</div>
                  <div className="flex flex-wrap gap-1.5">
                    {vendorItems.map(name => <span key={name} className="rounded-full bg-muted px-2.5 py-1 text-xs">{name}</span>)}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 text-sm font-semibold text-primary">Price history</div>
                <div className="rounded-lg border overflow-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-2">Item / Scope</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2">Project</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorRows.map(r => {
                        const f = freshness(r.price_date);
                        return (
                        <tr key={r.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 max-w-[320px]"><div>{r.item_name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.description}</div></td>
                          <td className="px-3 py-2 text-right font-semibold">{priceCell(r)}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.quantity ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.project_label}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="text-xs">{fmtDate(r.price_date)}</div>
                            <span className={`inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${f.cls}`}>{f.label}</span>
                          </td>
                          <td className="px-3 py-2 text-xs max-w-[160px] truncate" title={r.source_doc ?? ""}>{r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{r.source_doc}</a> : <span className="text-muted-foreground">{r.source_doc}</span>}</td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
